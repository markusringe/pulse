/**
 * Event-Katalog: Metadaten zu einer Live-Session (Join-Code = Session-Code).
 * Persistenz: data/events.json. Das Deck (Folien) liegt in pulse.db, nicht hier.
 *
 * Status: planned | active | ended | archived
 * Es gibt keine Sets — eine Session hat genau ein Deck.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { slideSource } = require("./deck");

function filePath() {
  return path.join(process.cwd(), "data", "events.json");
}

/** Kurzzeit-Cache für readStore — vermeidet wiederholtes readFileSync pro Request. */
let storeCache = null;
let storeCacheMtime = 0;

function invalidateStoreCache() {
  storeCache = null;
  storeCacheMtime = 0;
}

const STATUSES = ["planned", "active", "ended", "archived"];
const MAX_EVENTS = 80;
const MAX_SLIDES = 40;

/** Start-Deck für neu angelegte Event-Sessions, solange nichts kopiert wird. */
const DEFAULT_DECK = [{ type: "choice", question: "Willkommen — erste Frage", options: [{ label: "Ja" }, { label: "Nein" }] }];

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function readStore() {
  try {
    const fp = filePath();
    let mtime = 0;
    try {
      mtime = fs.statSync(fp).mtimeMs;
    } catch {
      /* Datei fehlt noch */
    }
    if (storeCache && mtime === storeCacheMtime) return storeCache;
    const parsed = JSON.parse(fs.readFileSync(fp, "utf8"));
    const events = Array.isArray(parsed?.events) ? parsed.events : [];
    storeCache = { events };
    storeCacheMtime = mtime;
    return storeCache;
  } catch {
    return { events: [] };
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(filePath()), { recursive: true });
  const dest = filePath();
  const tmp = `${dest}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ events: store.events }, null, 2));
  fs.renameSync(tmp, dest);
  invalidateStoreCache();
}

function sanitizeDate(value) {
  const s = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

/** Max. Zeichen für Data-URL (~2 MB Binärdaten inkl. Base64-Overhead). */
const MAX_EVENT_IMAGE_CHARS = 3 * 1024 * 1024;

/**
 * Optionale Startuhrzeit (ISO 8601). Leer = kein Countdown / sofort.
 * @param {*} value
 * @param {{ allowPast?: boolean }} [opts]
 */
function sanitizeStartTime(value, opts = {}) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return "";
  /* datetime-local ohne Zeitzone: als lokale Instant speichern (bereits ISO mit Offset ok). */
  const iso = new Date(ms).toISOString();
  if (!opts.allowPast && ms < Date.now() - 60_000) {
    /* 1 Min. Toleranz für Übertragungsverzögerung; Vergangenheit nur mit allowPast. */
    return "";
  }
  return iso;
}

/**
 * Event-Grafik als Data-URL (PNG/JPEG/WebP/SVG). Leerer String = keine Grafik.
 * @param {*} raw
 */
function sanitizeEventImage(raw) {
  const s = String(raw || "");
  if (!s) return "";
  if (s.length > MAX_EVENT_IMAGE_CHARS) return "";
  if (/BEGIN [A-Z ]*PRIVATE KEY/i.test(s) || /BEGIN CERTIFICATE/i.test(s)) return "";
  if (!/^data:image\/(png|jpe?g|webp|svg\+xml)(;[^,]*)?,/i.test(s)) return "";
  if (/data:\s*text\/html/i.test(s) || /javascript:/i.test(s)) return "";
  /* SVG: keine Scripts / Event-Handler. */
  if (/^data:image\/svg\+xml/i.test(s) && /<\s*script|on\w+\s*=/i.test(s)) return "";
  return s;
}

function sanitizeText(value, max) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim()
    .slice(0, max);
}

function todayIso(now = Date.now()) {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function deriveStatus(ev, now = Date.now()) {
  if (ev.status === "archived") return "archived";
  const today = todayIso(now);
  if (ev.endAt && ev.endAt < today) return "ended";
  if (ev.startAt && ev.startAt > today) return "planned";
  if (ev.startAt && ev.endAt && ev.startAt <= today && ev.endAt >= today) return "active";
  if (ev.startAt && ev.startAt <= today && !ev.endAt) return "active";
  return ev.status && STATUSES.includes(ev.status) ? ev.status : "planned";
}

function randomJoinCode(used) {
  let code = "";
  for (let i = 0; i < 40; i++) {
    code = String(100000 + crypto.randomInt(900000));
    if (!used.has(code)) return code;
  }
  return code;
}

function usedCodes(store, extra = []) {
  const used = new Set(extra);
  for (const ev of store.events) {
    if (ev.joinCode) used.add(String(ev.joinCode));
    if (ev.sessionCode) used.add(String(ev.sessionCode));
  }
  return used;
}

function emptyBranding() {
  return { logo: "", primary: "", secondary: "", footerText: "", footerLinks: "" };
}

function sanitizeBranding(src = {}) {
  const b = emptyBranding();
  b.logo = String(src.logo || "").slice(0, 256 * 1024);
  const hex = /^#[0-9a-fA-F]{6}$/;
  if (hex.test(src.primary || "")) b.primary = src.primary;
  if (hex.test(src.secondary || "")) b.secondary = src.secondary;
  b.footerText = sanitizeText(src.footerText, 400);
  b.footerLinks = sanitizeText(src.footerLinks, 400);
  return b;
}

function digits6(value, fallback = "") {
  const d = String(value || fallback || "").replace(/\D/g, "").slice(0, 6);
  return d;
}

function sanitizeIdList(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.map((x) => String(x || "").slice(0, 40)).filter(Boolean))];
}

/**
 * Event-Metadaten ohne Sets. sessionCode und joinCode sind derselbe sechsstellige Code.
 */
function sanitizeEvent(src = {}, opts = {}) {
  const prev = opts.prev || {};
  const id = String(src.id || prev.id || newId("ev")).slice(0, 40);
  const status = STATUSES.includes(src.status) ? src.status : prev.status || "planned";
  const joinCode = digits6(src.joinCode, prev.joinCode);
  const sessionCode = digits6(src.sessionCode, prev.sessionCode) || joinCode;
  /* Aktiv-Status oder explizites allowPast: Startzeit in der Vergangenheit behalten. */
  const allowPast = Boolean(opts.allowPast) || status === "active" || status === "ended" || status === "archived";
  const startTimeSrc = Object.prototype.hasOwnProperty.call(src, "startTime") ? src.startTime : prev.startTime;
  const imageSrc = Object.prototype.hasOwnProperty.call(src, "eventImage") ? src.eventImage : prev.eventImage;
  return {
    id,
    title: sanitizeText(src.title ?? prev.title, 120) || "Event",
    description: sanitizeText(src.description ?? prev.description, 800),
    startAt: sanitizeDate(src.startAt ?? prev.startAt) || todayIso(),
    endAt: sanitizeDate(src.endAt ?? prev.endAt) || sanitizeDate(src.startAt ?? prev.startAt) || todayIso(),
    startTime: sanitizeStartTime(startTimeSrc, { allowPast }),
    eventImage: sanitizeEventImage(imageSrc),
    status,
    category: sanitizeText(src.category ?? prev.category, 80),
    room: sanitizeText(src.room ?? prev.room, 80),
    templateEventId: sanitizeText(src.templateEventId ?? prev.templateEventId, 40),
    joinCode,
    sessionCode,
    branding: sanitizeBranding(src.branding ?? prev.branding),
    ownerUserId: String(src.ownerUserId ?? prev.ownerUserId ?? "").slice(0, 40),
    teamId: String(src.teamId ?? prev.teamId ?? "").slice(0, 40),
    visibility: ["private", "public", "shared"].includes(src.visibility)
      ? src.visibility
      : ["private", "public", "shared"].includes(prev.visibility)
        ? prev.visibility
        : "private",
    /* Legacy-Listen werden nicht mehr gespeichert — Zugriff nur über teamId. */
    editorUserIds: [],
    presenterUserIds: [],
    viewerUserIds: [],
    createdAt: prev.createdAt || Date.now(),
    updatedAt: Date.now(),
    countdownDismissed: Boolean(src.countdownDismissed ?? prev.countdownDismissed),
    countdownDismissedAt:
      src.countdownDismissedAt != null
        ? Number(src.countdownDismissedAt) || null
        : prev.countdownDismissedAt || null,
  };
}

function findEvent(store, id) {
  return store.events.find((e) => e.id === id) || null;
}

/** Join-Code der verknüpften Session. */
function sessionRef(ev) {
  return digits6(ev?.sessionCode, ev?.joinCode);
}

/**
 * Folien aus dem früheren sets[]-Modell in ein Deck zusammenführen (Migration).
 * Aktives Set zuerst, danach die übrigen — max. MAX_SLIDES.
 */
function slidesFromLegacySets(ev) {
  const sets = Array.isArray(ev?.sets) ? ev.sets.slice() : [];
  if (!sets.length) return [];
  sets.sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)) || Number(a.order || 0) - Number(b.order || 0));
  const slides = [];
  for (const set of sets) {
    for (const s of set.slides || []) {
      if (slides.length >= MAX_SLIDES) break;
      slides.push(slideSource(s));
      slides[slides.length - 1].id = s.id || crypto.randomBytes(4).toString("hex");
    }
  }
  return slides;
}

/**
 * Alte Events mit sets[] bereinigen: sessionCode setzen, Sets entfernen.
 * Rückgabe pending[] für den Server, der daraus Sessions in pulse.db anlegt.
 */
function migrateLegacy() {
  const store = readStore();
  const pending = [];
  let changed = false;
  store.events = store.events.map((raw) => {
    const hadSets = Array.isArray(raw.sets);
    const slides = hadSets ? slidesFromLegacySets(raw) : [];
    const next = sanitizeEvent(
      {
        ...raw,
        sessionCode: raw.sessionCode || raw.joinCode,
        joinCode: raw.joinCode || raw.sessionCode,
      },
      { prev: raw }
    );
    if (hadSets || raw.sessionCodes || !raw.sessionCode || "sets" in raw) changed = true;
    if (hadSets) pending.push({ id: next.id, joinCode: next.joinCode, title: next.title, slides });
    return next;
  });
  if (changed) writeStore(store);
  return { pending, changed };
}

function publicEvent(ev, opts = {}) {
  const joinEnabled = ev.status === "active";
  const resultsOnly = ev.status === "ended";
  const code = sessionRef(ev);
  const startTime = ev.startTime || "";
  const remainingMs = startTime ? Math.max(0, Date.parse(startTime) - Date.now()) : 0;
  const dismissed = Boolean(ev.countdownDismissed);
  return {
    id: ev.id,
    title: ev.title,
    description: ev.description,
    startAt: ev.startAt,
    endAt: ev.endAt,
    startTime,
    countdownActive: Boolean(startTime && remainingMs > 0 && !dismissed),
    countdownDismissed: dismissed,
    countdownRemainingMs: remainingMs,
    hasEventImage: Boolean(ev.eventImage),
    eventImage: opts.includeImage === false ? undefined : ev.eventImage || "",
    status: ev.status,
    category: ev.category,
    room: ev.room,
    joinCode: code,
    sessionCode: code,
    joinEnabled,
    resultsOnly,
    slideCount: Number(opts.slideCount) || 0,
    branding: opts.includeBranding === false ? undefined : ev.branding,
    stats: opts.stats || null,
  };
}

/**
 * Kompakte Metadaten für Session-Payload (Present/Stage/Join).
 * @param {string} eventId
 */
function eventMetaFor(eventId) {
  const ev = get(eventId);
  if (!ev) return null;
  return {
    id: ev.id,
    title: ev.title || "",
    startTime: ev.startTime || "",
    eventImage: ev.eventImage || "",
    countdownDismissed: Boolean(ev.countdownDismissed),
  };
}

/**
 * Event-Countdown vorzeitig beenden (Presenter „Los geht's“).
 * @param {string} eventId
 * @param {{ setActive?: boolean }} [opts]
 */
function dismissCountdown(eventId, opts = {}) {
  const store = readStore();
  const idx = store.events.findIndex((e) => e.id === eventId);
  if (idx < 0) return null;
  const ev = store.events[idx];
  ev.countdownDismissed = true;
  ev.countdownDismissedAt = Date.now();
  if (opts.setActive && ev.status === "planned") ev.status = "active";
  ev.updatedAt = Date.now();
  store.events[idx] = ev;
  writeStore(store);
  return ev;
}

function adminEvent(ev, stats, extra = {}) {
  return {
    ...ev,
    ...publicEvent(ev, { includeBranding: true, stats, slideCount: extra.slideCount }),
    slides: extra.slides,
    needsTeamAssignment: !String(ev?.teamId || "").trim(),
    teamName: extra.teamName || "",
  };
}

function list(filters = {}) {
  const store = readStore();
  let events = store.events.slice();
  if (filters.status) events = events.filter((e) => e.status === filters.status);
  if (filters.category) events = events.filter((e) => e.category === filters.category);
  if (filters.from) events = events.filter((e) => e.startAt >= filters.from);
  if (filters.to) events = events.filter((e) => e.startAt <= filters.to);
  events.sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)) || a.title.localeCompare(b.title));
  return events;
}

function listPublic() {
  const upcoming = [];
  const past = [];
  for (const ev of list()) {
    if (ev.status === "archived") continue;
    /* Startseite: keine Data-URL-Grafiken (nur hasEventImage-Flag). */
    const card = publicEvent(ev, { includeImage: false });
    if (ev.status === "ended") past.push(card);
    else upcoming.push(card);
  }
  upcoming.sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
  past.sort((a, b) => String(b.startAt).localeCompare(String(a.startAt)));
  /* Vergangene Events begrenzen — schützt Browser vor zu vielen QR-Karten auf der Startseite. */
  const HOME_PAST_LIMIT = 12;
  return { upcoming, past: past.slice(0, HOME_PAST_LIMIT) };
}

function get(id) {
  return findEvent(readStore(), id);
}

function bySessionCode(code) {
  const needle = digits6(code);
  if (!needle) return null;
  return list({}).find((e) => sessionRef(e) === needle) || null;
}

function create(body = {}, opts = {}) {
  const store = readStore();
  if (store.events.length >= MAX_EVENTS) {
    const err = new Error("Maximale Anzahl Events erreicht");
    err.statusCode = 400;
    throw err;
  }
  if (opts.requireTeam && !String(body.teamId || "").trim()) {
    const err = new Error("Team ist erforderlich");
    err.statusCode = 400;
    throw err;
  }
  const used = usedCodes(store);
  const joinCode = randomJoinCode(used);
  const draft = sanitizeEvent({
    ...body,
    id: newId("ev"),
    joinCode,
    sessionCode: joinCode,
    status: body.status || "planned",
    ownerUserId: body.ownerUserId || "",
  });
  if (body.copyFromId) draft.templateEventId = sanitizeText(body.copyFromId, 40);
  store.events.push(draft);
  writeStore(store);
  return draft;
}

function update(id, body = {}) {
  const store = readStore();
  const idx = store.events.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  const prev = store.events[idx];
  /* Bestehende Startzeiten (auch vergangen) beim Speichern behalten. */
  const next = sanitizeEvent({ ...prev, ...body, id }, { prev, allowPast: true });
  next.joinCode = prev.joinCode;
  next.sessionCode = prev.sessionCode || prev.joinCode;
  next.createdAt = prev.createdAt;
  store.events[idx] = next;
  writeStore(store);
  return next;
}

function remove(id) {
  const store = readStore();
  const ev = findEvent(store, id);
  if (!ev) return { error: "Event nicht gefunden", statusCode: 404 };
  if (ev.status !== "planned" && ev.status !== "archived") {
    return { error: "Löschen nur bei Status geplant oder archiviert", statusCode: 409 };
  }
  store.events = store.events.filter((e) => e.id !== id);
  writeStore(store);
  return { ok: true, id };
}

function setStatus(id, status) {
  if (!STATUSES.includes(status)) {
    const err = new Error("Ungültiger Status");
    err.statusCode = 400;
    throw err;
  }
  const ev = get(id);
  if (ev && !String(ev.teamId || "").trim() && (status === "active" || status === "ended")) {
    const err = new Error("Event benötigt eine Team-Zuordnung vor Aktivierung");
    err.statusCode = 409;
    throw err;
  }
  return update(id, { status });
}

/** Events ohne teamId — für Admin-Migrationsübersicht. */
function listNeedsTeamAssignment() {
  return list({}).filter((ev) => !String(ev.teamId || "").trim());
}

/**
 * Status anhand Start-/Enddatum pflegen. Archivierte Events bleiben unangetastet.
 * @returns {{ changed: object[] }}
 */
function tickStatuses(now = Date.now()) {
  const store = readStore();
  const changed = [];
  for (const ev of store.events) {
    const next = deriveStatus(ev, now);
    if (next !== ev.status) {
      const from = ev.status;
      ev.status = next;
      ev.updatedAt = Date.now();
      changed.push({ id: ev.id, title: ev.title, from, to: next, status: next });
    }
  }
  if (changed.length) writeStore(store);
  return { changed };
}

function attachSession(eventId, code) {
  const store = readStore();
  const ev = findEvent(store, eventId);
  if (!ev) return null;
  const c = digits6(code);
  if (c) {
    ev.joinCode = c;
    ev.sessionCode = c;
  }
  ev.updatedAt = Date.now();
  writeStore(store);
  return ev;
}

function inviteText(ev, joinUrl) {
  const code = formatCode(sessionRef(ev));
  return [
    `Nimm an „${ev.title}“ teil und mache mit bei interaktiven Umfragen!`,
    "",
    `Link: ${joinUrl}`,
    `Code: ${code}`,
    "",
    "Öffne den Link auf deinem Smartphone oder gib den Code auf der Website ein.",
  ].join("\n");
}

function formatCode(code) {
  const d = String(code || "").padStart(6, "0");
  return `${d.slice(0, 3)} ${d.slice(3)}`;
}

function computeStats(ev, session) {
  const slides = session?.slides || [];
  let votes = 0;
  let questions = 0;
  for (const s of slides) {
    if (s.counts && typeof s.counts === "object") {
      votes += Object.values(s.counts).reduce((a, b) => a + Number(b || 0), 0);
    }
    votes += Number(s.voteCount || 0);
    if (Array.isArray(s.questions)) questions += s.questions.length;
    if (Array.isArray(s.entries)) votes += s.entries.length;
  }
  const popular = slides
    .map((s) => {
      let n = Number(s.voteCount || 0);
      if (s.counts) n += Object.values(s.counts).reduce((a, b) => a + Number(b || 0), 0);
      if (Array.isArray(s.entries)) n += s.entries.length;
      if (Array.isArray(s.questions)) n += s.questions.length;
      return { id: s.id, question: s.question, type: s.type, participation: n };
    })
    .sort((a, b) => b.participation - a.participation);
  return {
    participants: session?.participants?.size || 0,
    votes,
    questions,
    avgStaySec: 0,
    popular: popular.slice(0, 8),
  };
}

function statsCsv(stats, ev) {
  const rows = [["frage", "typ", "teilnahmen"], ...(stats.popular || []).map((p) => [p.question, p.type, p.participation])];
  const head = `event;${ev.title};teilnehmer;${stats.participants};stimmen;${stats.votes};fragen;${stats.questions}`;
  return `${head}\n${rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n")}\n`;
}

module.exports = {
  get FILE() {
    return filePath();
  },
  STATUSES,
  MAX_SLIDES,
  MAX_EVENT_IMAGE_CHARS,
  DEFAULT_DECK,
  list,
  listPublic,
  get,
  bySessionCode,
  create,
  update,
  remove,
  setStatus,
  tickStatuses,
  attachSession,
  sessionRef,
  publicEvent,
  adminEvent,
  eventMetaFor,
  dismissCountdown,
  inviteText,
  formatCode,
  computeStats,
  statsCsv,
  deriveStatus,
  sanitizeEvent,
  sanitizeStartTime,
  sanitizeEventImage,
  migrateLegacy,
  slidesFromLegacySets,
  listNeedsTeamAssignment,
};
