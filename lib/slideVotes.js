/**
 * Stimmen für Ranking, Punkte-100, Freitext, Bildwahl und Termine.
 * Aggregation liegt serverseitig — Clients senden nur die Rohwahl.
 */

const wordFilter = require("./wordFilter");
const rate = require("./rateLimiter");
const { isStopword } = require("./stopwords");

const OPEN_TEXT_MAX = 280;

/**
 * Borda: erster Platz = n Punkte, letzter = 1.
 * Durchschnittsrang: Mittel der 1-basierten Positionen (niedriger = besser).
 * @param {Record<string, { sum: number, n: number, borda: number }>} ranks
 * @param {number} optionCount
 */
function rankingStats(ranks, optionCount) {
  const n = Math.max(1, Number(optionCount) || 1);
  const out = {};
  for (const [id, row] of Object.entries(ranks || {})) {
    const votes = Number(row.n) || 0;
    out[id] = {
      average: votes ? row.sum / votes : 0,
      borda: Number(row.borda) || 0,
      votes,
    };
  }
  return { optionCount: n, byId: out };
}

/**
 * Punkte-100: Summe und Mittel je Option.
 * @param {Record<string, number>} sums
 * @param {number} voteCount
 */
function points100Stats(sums, voteCount) {
  const n = Math.max(0, Number(voteCount) || 0);
  const byId = {};
  for (const [id, sum] of Object.entries(sums || {})) {
    const total = Number(sum) || 0;
    byId[id] = { sum: total, average: n ? total / n : 0 };
  }
  return { voteCount: n, byId };
}

/**
 * Prüft, ob 100 Punkte verteilt sind (ganzzahlig, nicht negativ).
 * @param {Record<string, number>} points
 * @param {string[]} optionIds
 */
function points100Valid(points, optionIds) {
  if (!points || typeof points !== "object") return false;
  let sum = 0;
  for (const id of optionIds) {
    const n = Number(points[id] || 0);
    if (!Number.isFinite(n) || n < 0 || n > 100 || !Number.isInteger(n)) return false;
    sum += n;
  }
  return sum === 100;
}

/**
 * Ranking-Reihenfolge: jede Option genau einmal.
 * @param {string[]} order
 * @param {string[]} optionIds
 */
function rankingValid(order, optionIds) {
  if (!Array.isArray(order) || order.length !== optionIds.length) return false;
  const seen = new Set();
  for (const id of order) {
    if (!optionIds.includes(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return seen.size === optionIds.length;
}

/**
 * Wendet eine typisierte Stimme auf die Folie an.
 * @returns {{ ok?: boolean, error?: string, waitTime?: number }}
 */
function applyTypedVote(session, client, payload, slide, branding = {}) {
  const key = `${client.id}:${slide.id}`;
  if (session.votes.has(key)) return { error: "already" };

  if (slide.type === "ranking") return applyRanking(session, client, payload, slide, key);
  if (slide.type === "points100") return applyPoints100(session, client, payload, slide, key);
  if (slide.type === "open_text") return applyOpenText(session, client, payload, slide, key, branding);
  if (slide.type === "image_choice") return applyImageChoice(session, client, payload, slide, key);
  if (slide.type === "datetime") return applyDatetime(session, client, payload, slide, key);
  if (slide.type === "picker") return applyPicker(session, client, payload, slide, key);
  return { error: "type" };
}

function applyRanking(session, client, payload, slide, key) {
  const ids = (slide.options || []).map((o) => o.id);
  const order = Array.isArray(payload.order) ? payload.order.map(String) : [];
  if (!rankingValid(order, ids)) return { error: "invalid" };
  slide.ranks = slide.ranks || {};
  const n = ids.length;
  order.forEach((id, i) => {
    const row = slide.ranks[id] || { sum: 0, n: 0, borda: 0 };
    row.sum += i + 1;
    row.n += 1;
    row.borda += n - i;
    slide.ranks[id] = row;
  });
  slide.voteCount = (Number(slide.voteCount) || 0) + 1;
  session.votes.set(key, order.join(","));
  return { ok: true };
}

function applyPoints100(session, client, payload, slide, key) {
  const ids = (slide.options || []).map((o) => o.id);
  const points = payload.points || {};
  if (!points100Valid(points, ids)) return { error: "sum" };
  slide.sums = slide.sums || {};
  for (const id of ids) {
    slide.sums[id] = (Number(slide.sums[id]) || 0) + Number(points[id] || 0);
  }
  slide.voteCount = (Number(slide.voteCount) || 0) + 1;
  session.votes.set(key, JSON.stringify(points));
  return { ok: true };
}

function applyOpenText(session, client, payload, slide, key, branding) {
  const interval = (Number(branding.questionIntervalSec) || 30) * 1000;
  const limit = rate.checkRateLimit(client.id, "question", { questionMs: interval });
  if (!limit.allowed) {
    return { error: "rate", waitTime: Math.ceil(limit.waitTime / 1000) };
  }
  const text = String(payload.text || "").trim().replace(/\s+/g, " ").slice(0, OPEN_TEXT_MAX);
  if (!text) return { error: "empty" };
  if (branding.wordFilter !== false) {
    const filtered = wordFilter.moderateQuestion(text, branding.extraWords || []);
    if (filtered.status === "blocked") return { error: "blocked" };
  }
  slide.entries = slide.entries || [];
  const found = slide.entries.find((e) => e.text.toLowerCase() === text.toLowerCase());
  if (found) found.count += 1;
  else slide.entries.push({ text, count: 1 });
  slide.voteCount = (Number(slide.voteCount) || 0) + 1;
  session.votes.set(key, text);
  rate.record(client.id, "question");
  return { ok: true };
}

function applyImageChoice(session, client, payload, slide, key) {
  slide.counts = slide.counts || {};
  const optionId = String(payload.optionId || "");
  if (!(optionId in slide.counts)) return { error: "invalid" };
  slide.counts[optionId] += 1;
  slide.voteCount = (Number(slide.voteCount) || 0) + 1;
  session.votes.set(key, optionId);
  return { ok: true };
}

function applyDatetime(session, client, payload, slide, key) {
  slide.counts = slide.counts || {};
  const ids = Array.isArray(payload.slotIds) ? payload.slotIds.map(String) : payload.optionId ? [String(payload.optionId)] : [];
  const valid = ids.filter((id) => id in slide.counts);
  if (!valid.length) return { error: "invalid" };
  const uniq = [...new Set(valid)];
  for (const id of uniq) slide.counts[id] += 1;
  slide.voteCount = (Number(slide.voteCount) || 0) + 1;
  session.votes.set(key, uniq.join(","));
  return { ok: true };
}

/**
 * Picker: Single-Select (optionId) oder Multi-Select (optionIds).
 * @param {object} session
 * @param {object} client
 * @param {object} payload
 * @param {object} slide
 * @param {string} key
 */
function applyPicker(session, client, payload, slide, key) {
  slide.counts = slide.counts || {};
  const validIds = new Set((slide.options || []).map((o) => o.id));
  const disabled = new Set((slide.options || []).filter((o) => o.disabled).map((o) => o.id));

  if (slide.allowMultiple) {
    const raw = Array.isArray(payload.optionIds) ? payload.optionIds.map(String) : [];
    const picked = [...new Set(raw.filter((id) => validIds.has(id) && !disabled.has(id)))];
    if (!picked.length) return { error: "invalid" };
    const maxSel = slide.maxSelections != null ? Number(slide.maxSelections) : null;
    if (maxSel != null && Number.isFinite(maxSel) && picked.length > maxSel) return { error: "max" };
    for (const id of picked) slide.counts[id] = (Number(slide.counts[id]) || 0) + 1;
    slide.voteCount = (Number(slide.voteCount) || 0) + 1;
    session.votes.set(key, picked.join(","));
    return { ok: true };
  }

  const optionId = String(payload.optionId || "");
  if (!validIds.has(optionId) || disabled.has(optionId)) return { error: "invalid" };
  slide.counts[optionId] = (Number(slide.counts[optionId]) || 0) + 1;
  slide.voteCount = (Number(slide.voteCount) || 0) + 1;
  session.votes.set(key, optionId);
  return { ok: true };
}

/**
 * Wortwolke: Stoppwörter + optionaler Schimpfwortfilter.
 * @returns {{ text?: string, error?: string }}
 */
function prepareWord(text, branding = {}) {
  const clean = String(text || "").trim().replace(/\s+/g, " ").slice(0, 32);
  if (!clean) return { error: "empty" };
  if (isStopword(clean)) return { error: "stopword" };
  if (branding.wordFilter !== false) {
    const filtered = wordFilter.moderateQuestion(clean, branding.extraWords || []);
    if (filtered.status === "blocked") return { error: "blocked" };
  }
  return { text: clean };
}

function extraResults(slide) {
  if (slide.type === "ranking") {
    return { ranks: rankingStats(slide.ranks, (slide.options || []).length) };
  }
  if (slide.type === "points100") {
    return { points: points100Stats(slide.sums, slide.voteCount) };
  }
  return {};
}

module.exports = {
  rankingStats,
  points100Stats,
  points100Valid,
  rankingValid,
  applyTypedVote,
  prepareWord,
  extraResults,
  OPEN_TEXT_MAX,
};
