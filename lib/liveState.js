/**
 * Live-Darstellung von Umfragen: Stimmen zählen und Ergebnisse
 * erst auf Knopfdruck des Präsentators zeigen (Pulse-Prinzip).
 */

const slideTypes = require("./slideTypes");
const slideVotes = require("./slideVotes");

function canHideResults(slide) {
  return slideTypes.isHideable(slide?.type);
}

function voteCount(slide) {
  if (!slide) return 0;
  if (
    slide.type === "ranking" ||
    slide.type === "points100" ||
    slide.type === "datetime" ||
    slide.type === "open_text" ||
    slide.type === "image_choice" ||
    slide.type === "picker"
  ) {
    return Number(slide.voteCount) || 0;
  }
  if (slide.counts) {
    return Object.values(slide.counts).reduce((sum, n) => sum + Number(n || 0), 0);
  }
  if (slide.entries) {
    return slide.entries.reduce((sum, e) => sum + Number(e.count || 0), 0);
  }
  if (slide.round?.answers) {
    return Object.keys(slide.round.answers).length;
  }
  return 0;
}

/**
 * Volle Zählwerte für Redis-Fanout zwischen Prozessen — unabhängig vom Reveal.
 * Join-Clients bekommen weiterhin resultsPayload (verborgen ohne Counts).
 * @param {object} slide
 */
function fanoutResultsPayload(slide) {
  const payload = {
    slideId: slide.id,
    voteCount: voteCount(slide),
    resultsVisible: !canHideResults(slide) || Boolean(slide.resultsVisible),
    fanout: true,
  };
  if (slide.counts) payload.counts = { ...slide.counts };
  if (slide.entries) payload.entries = [...slide.entries];
  if (slide.ranks) payload.ranks = { ...slide.ranks };
  if (slide.sums) payload.sums = { ...slide.sums };
  Object.assign(payload, slideVotes.extraResults(slide));
  return payload;
}

/**
 * WS-Envelope für Browser: versteckte Ergebnisse ohne Rohzahlen.
 * Interne Fanout-Felder (sync, fanout) fliegen raus.
 * @param {object} envelope
 * @param {{ revealResults?: boolean }} [opts]  Presenter/Stage behalten Counts trotz Hidden.
 */
function toClientEnvelope(envelope, opts = {}) {
  if (!envelope || typeof envelope !== "object") return envelope;
  const { sync, ...rest } = envelope;
  void sync;
  if (rest.type === "quiz_answer_sync") return null;
  if ((rest.type === "poll:update" || rest.type === "wordcloud:update") && rest.payload && rest.payload.fanout) {
    const p = rest.payload;
    if (p.resultsVisible === false && !opts.revealResults) {
      return {
        type: rest.type,
        payload: { slideId: p.slideId, voteCount: p.voteCount, resultsVisible: false },
      };
    }
    const payload = { ...p };
    delete payload.fanout;
    delete payload.sums;
    return { type: rest.type, payload };
  }
  if ((rest.type === "emergency_activated" || rest.type === "emergency_resumed") && rest.payload) {
    return { type: rest.type, payload: { paused: Boolean(rest.payload.paused) } };
  }
  return rest;
}

/**
 * Session-Speicher eines anderen Prozesses an ein Live-Ereignis anpassen.
 * Broadcast an lokale WS-Clients passiert getrennt (server.js).
 * @param {object} session
 * @param {object} envelope
 */
function applyFanoutEnvelope(session, envelope) {
  if (!session || !envelope) return;
  const payload = envelope.payload || {};
  const sync = envelope.sync || {};
  if (envelope.type === "poll:update" || envelope.type === "wordcloud:update") {
    const slide = session.slides.find((s) => s.id === payload.slideId);
    if (!slide) return;
    if (payload.counts) slide.counts = payload.counts;
    if (payload.entries) slide.entries = payload.entries;
    if (payload.ranks) slide.ranks = payload.ranks;
    if (payload.sums) slide.sums = payload.sums;
    if (payload.voteCount != null) slide.voteCount = payload.voteCount;
    if (payload.resultsVisible != null) slide.resultsVisible = Boolean(payload.resultsVisible);
    return;
  }
  if (envelope.type === "results" && payload.slideId) {
    const slide = session.slides.find((s) => s.id === payload.slideId);
    if (slide) slide.resultsVisible = Boolean(payload.resultsVisible);
    return;
  }
  if (envelope.type === "slide") {
    if (payload.index != null) session.activeSlideIndex = payload.index;
    return;
  }
  if (envelope.type === "deck" && payload.slides) {
    session.slides = payload.slides;
    session.activeSlideIndex = payload.activeSlideIndex || 0;
    return;
  }
  if (envelope.type === "lobby") {
    session.lobby = Boolean(payload.lobby);
    return;
  }
  if (envelope.type === "session" && payload.session) {
    const incoming = payload.session;
    session.activeSlideIndex = incoming.activeSlideIndex;
    session.slides = incoming.slides;
    if (incoming.paused != null) session.paused = incoming.paused;
    return;
  }
  if (envelope.type === "emergency_activated" || envelope.type === "emergency_resumed") {
    session.paused = envelope.type === "emergency_activated" || Boolean(payload.paused);
    if (sync.emergencyBackup) session.emergencyBackup = sync.emergencyBackup;
    else if (payload.emergencyBackup) session.emergencyBackup = payload.emergencyBackup;
    const qa = sync.qaStatuses || payload.qaStatuses;
    if (Array.isArray(qa)) {
      for (const row of qa) {
        const slide = session.slides.find((s) => s.id === row.id && s.type === "qa");
        if (!slide || !Array.isArray(row.questions)) continue;
        for (const q of row.questions) {
          const found = (slide.questions || []).find((x) => x.id === q.id);
          if (found && q.status) found.status = q.status;
        }
      }
    }
    return;
  }
  if (envelope.type === "new_question" && payload) {
    upsertQaQuestion(session, payload);
    return;
  }
  if (envelope.type === "question_upvoted" && payload.question) {
    upsertQaQuestion(session, payload.question);
    return;
  }
  if (envelope.type === "question_moderated" && payload.question) {
    upsertQaQuestion(session, payload.question);
    return;
  }
  if (envelope.type === "quiz_started") {
    const slide = findQuiz(session, payload.slideId || payload.questionId);
    if (!slide) return;
    slide.round = {
      startedAt: payload.startedAt || Date.now(),
      duration: payload.duration || slide.duration || 30,
      status: "running",
      answers: (slide.round && slide.round.answers) || {},
    };
    return;
  }
  if (envelope.type === "quiz_answer_sync") {
    const slide = findQuiz(session, payload.slideId);
    if (!slide) return;
    slide.round = slide.round || { status: "running", answers: {} };
    slide.round.answers = slide.round.answers || {};
    if (payload.clientId && payload.answer) slide.round.answers[payload.clientId] = payload.answer;
    return;
  }
  if (envelope.type === "quiz_results") {
    const slide = findQuiz(session, payload.slideId);
    if (!slide) return;
    slide.round = slide.round || {};
    slide.round.status = "ended";
    slide.round.lastResults = payload;
    return;
  }
  if (envelope.type === "leaderboard_update" && payload.overall) {
    session.quizTotals = session.quizTotals || {};
    for (const row of payload.overall) {
      if (!row || !row.id) continue;
      session.quizTotals[row.id] = { name: row.name, points: row.points, team: row.team || "" };
    }
  }
  if (envelope.type === "qa_timer" && payload.slideId && payload.qaTimer) {
    const slide = session.slides.find((s) => s.id === payload.slideId && s.type === "qa");
    if (slide) slide.qaTimer = payload.qaTimer;
  }
}

function findQuiz(session, slideId) {
  return (
    session.slides.find((s) => s.id === slideId && s.type === "quiz") ||
    session.slides.find((s) => s.type === "quiz")
  );
}

function upsertQaQuestion(session, question) {
  if (!question || !question.id) return;
  const slide =
    session.slides.find((s) => s.type === "qa" && (s.questions || []).some((q) => q.id === question.id)) ||
    session.slides.find((s) => s.type === "qa");
  if (!slide) return;
  slide.questions = slide.questions || [];
  const idx = slide.questions.findIndex((q) => q.id === question.id);
  if (idx >= 0) slide.questions[idx] = { ...slide.questions[idx], ...question };
  else slide.questions.push(question);
}

/**
 * Broadcast-Payload: volle Zahlen nur, wenn Ergebnisse sichtbar sind.
 * @param {object} slide
 */
function resultsPayload(slide) {
  const visible = !canHideResults(slide) || Boolean(slide.resultsVisible);
  const payload = {
    slideId: slide.id,
    voteCount: voteCount(slide),
    resultsVisible: visible,
  };
  if (visible) {
    if (slide.counts) payload.counts = { ...slide.counts };
    if (slide.entries) {
      payload.entries = [...slide.entries].sort((a, b) => b.count - a.count);
    }
    Object.assign(payload, slideVotes.extraResults(slide));
  }
  return payload;
}

const REACTIONS = ["👏", "❤️", "👍", "❓"];

function allowedReaction(emoji) {
  return REACTIONS.includes(String(emoji || ""));
}

/** Maximale Länge der Presenter-Notizen (nie an Teilnehmende). */
const NOTES_MAX = 4000;

/**
 * Folien-Notizen säubern. Leerer String bleibt leer (Feld löschen).
 * @param {unknown} value
 * @returns {string}
 */
function sanitizeNotes(value) {
  if (value == null) return "";
  return String(value).slice(0, NOTES_MAX);
}

/**
 * Optionale Anzeigedauer in Sekunden. Leer → null, sonst 1–3600.
 * Feldname plannedMinutes bleibt für vorhandene Sessions/API.
 * @param {unknown} value
 * @returns {number|null}
 */
function parsePlannedMinutes(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(1, Math.min(3600, Math.round(n)));
}

/**
 * Presenter-Felder aus Rohdaten — Speicherung, nicht öffentliche API.
 * @param {object} raw
 */
function presenterMeta(raw = {}) {
  const out = {};
  if (raw.notes != null) out.notes = sanitizeNotes(raw.notes);
  const planned = parsePlannedMinutes(raw.plannedMinutes);
  if (planned != null) out.plannedMinutes = planned;
  else if (raw.plannedMinutes === "" || raw.plannedMinutes === null) out.plannedMinutes = null;
  return out;
}

/**
 * Notizen nur an den Präsentator. Stage darf Ergebnisse sehen (revealResults),
 * aber keine Notizen — deshalb revealNotes getrennt von reveal/revealResults.
 * @param {object} slide
 * @param {{ reveal?: boolean, revealNotes?: boolean, stage?: boolean }} [opts]
 */
function presenterOnlyFields(slide, opts = {}) {
  if (!slide) return {};
  const showNotes =
    opts.revealNotes === true || (Boolean(opts.reveal) && opts.revealNotes !== false && !opts.stage);
  if (!showNotes) return {};
  const out = {
    notes: typeof slide.notes === "string" ? slide.notes : "",
  };
  if (slide.plannedMinutes != null) out.plannedMinutes = slide.plannedMinutes;
  return out;
}

/**
 * Offene Moderations-Schlange einer Q&A-Folie.
 * Nur Status „pending“ — keine Schätzung.
 * @param {object} slide
 * @returns {number}
 */
function pendingQuestionCount(slide) {
  if (!slide || slide.type !== "qa" || !Array.isArray(slide.questions)) return 0;
  return slide.questions.filter((q) => q.status === "pending").length;
}

/**
 * Anteil abgestimmt. 0 Teilnehmer → null (UI: 0 % oder „—“).
 * @param {number} votes
 * @param {number} participants
 * @returns {number|null}
 */
function votedSharePct(votes, participants) {
  const n = Number(participants) || 0;
  if (n <= 0) return null;
  const v = Math.max(0, Number(votes) || 0);
  return Math.min(100, Math.round((v / n) * 100));
}

/**
 * Folientypen mit Stimmen (nicht Q&A).
 * @param {object} slide
 */
function hasVoteShare(slide) {
  return slideTypes.hasVoteShare(slide?.type);
}

module.exports = {
  canHideResults,
  voteCount,
  resultsPayload,
  fanoutResultsPayload,
  toClientEnvelope,
  applyFanoutEnvelope,
  REACTIONS,
  allowedReaction,
  NOTES_MAX,
  sanitizeNotes,
  parsePlannedMinutes,
  presenterMeta,
  presenterOnlyFields,
  pendingQuestionCount,
  votedSharePct,
  hasVoteShare,
};
