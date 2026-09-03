/**
 * Q&A-Countdown: reine Funktionen ohne setTimeout.
 *
 * Der Server speichert `endsAt` und den Status; Clients ticken lokal anhand
 * von `endsAt` plus `serverNow` (Uhrversatz). Kein 1-Hz-Broadcast nötig.
 *
 * Status:
 * - idle   — Limit konfiguriert oder aus, Timer noch nicht gestartet
 * - running
 * - paused — Restzeit in pausedRemainingMs eingefroren
 * - ended  — keine neuen Fragen mehr (Upvotes bleiben erlaubt)
 */

const MIN_SEC = 10;
const MAX_SEC = 300;
const STEP = 10;
/** Fallback, wenn kein Limit gesetzt ist, der Timer aber starten soll. */
const DEFAULT_LIMIT = 60;

/**
 * Limit auf 10–300 s in 10er-Schritten. 0/ungültig = kein Limit (aus).
 * @param {unknown} sec
 * @returns {number}
 */
function clampLimit(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const stepped = Math.round(n / STEP) * STEP;
  return Math.max(MIN_SEC, Math.min(MAX_SEC, stepped));
}

/**
 * Leerer Timer-Stand (persistierbar).
 * @returns {QaTimer}
 */
function empty() {
  return {
    enabled: false,
    limitSec: DEFAULT_LIMIT,
    status: "idle",
    startedAt: null,
    endsAt: null,
    pausedRemainingMs: null,
  };
}

/**
 * Persistiertes Objekt säubern — unbekannte Statuswerte fallen auf idle.
 * @param {unknown} raw
 * @returns {QaTimer}
 */
function normalize(raw) {
  const base = empty();
  if (!raw || typeof raw !== "object") return base;
  const src = /** @type {Record<string, unknown>} */ (raw);
  const status = ["idle", "running", "paused", "ended"].includes(String(src.status))
    ? String(src.status)
    : "idle";
  const limitSec = clampLimit(src.limitSec != null ? src.limitSec : src.limit) || DEFAULT_LIMIT;
  const startedAt = toTimestamp(src.startedAt);
  const endsAt = toTimestamp(src.endsAt);
  const pausedRemainingMs = toNonNegMs(src.pausedRemainingMs);
  return {
    enabled: Boolean(src.enabled) || status === "running" || status === "paused",
    limitSec,
    status,
    startedAt,
    endsAt,
    pausedRemainingMs,
  };
}

/**
 * Unix-ms nur wenn wirklich gesetzt (null/0/"" bleiben leer).
 * @param {unknown} value
 * @returns {number|null}
 */
function toTimestamp(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Millisekunden ≥ 0 oder null (fehlend).
 * @param {unknown} value
 * @returns {number|null}
 */
function toNonNegMs(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Öffentlicher Snapshot inkl. Restzeit. Wenn running und endsAt vorbei ist,
 * gilt der Status als ended (ohne das persistierte Objekt zu mutieren).
 * @param {unknown} timer
 * @param {number} [now]
 */
function snapshot(timer, now = Date.now()) {
  const t = normalize(timer);
  let { status } = t;
  let remainingMs = 0;
  if (status === "running" && t.endsAt != null) {
    remainingMs = Math.max(0, t.endsAt - now);
    if (remainingMs <= 0) {
      status = "ended";
      remainingMs = 0;
    }
  } else if (status === "paused") {
    remainingMs = Math.max(0, t.pausedRemainingMs || 0);
  }
  return {
    enabled: t.enabled,
    limitSec: t.limitSec,
    status,
    startedAt: t.startedAt,
    endsAt: t.endsAt,
    pausedRemainingMs: t.pausedRemainingMs,
    remainingMs,
    remainingSec: Math.ceil(remainingMs / 1000),
    serverNow: now,
  };
}

/**
 * Neue Fragen nur solange der Timer nicht beendet ist.
 * Ohne Timer / idle / running / paused → erlaubt.
 * @param {unknown} timer
 * @param {number} [now]
 */
function canSubmit(timer, now = Date.now()) {
  return snapshot(timer, now).status !== "ended";
}

/**
 * Millisekunden bis Auto-End (0 wenn nicht running).
 * @param {unknown} timer
 * @param {number} [now]
 */
function msUntilEnd(timer, now = Date.now()) {
  const t = normalize(timer);
  if (t.status !== "running" || t.endsAt == null) return 0;
  return Math.max(0, t.endsAt - now);
}

/**
 * Timer starten (oder neu starten). Limit 10–300, Default 60.
 * @param {unknown} timer
 * @param {number} [now]
 * @param {unknown} [limitSec]
 */
function start(timer, now = Date.now(), limitSec) {
  const t = normalize(timer);
  const limit = clampLimit(limitSec != null ? limitSec : t.limitSec) || DEFAULT_LIMIT;
  return {
    enabled: true,
    limitSec: limit,
    status: "running",
    startedAt: now,
    endsAt: now + limit * 1000,
    pausedRemainingMs: null,
  };
}

/**
 * Laufenden Timer einfrieren. Restzeit → pausedRemainingMs.
 * @param {unknown} timer
 * @param {number} [now]
 */
function pause(timer, now = Date.now()) {
  const t = normalize(timer);
  if (t.status !== "running") return t;
  const remaining = Math.max(0, (t.endsAt || now) - now);
  if (remaining <= 0) return end(t, now);
  return {
    ...t,
    status: "paused",
    pausedRemainingMs: remaining,
  };
}

/**
 * Pausierten Timer fortsetzen: endsAt = jetzt + Rest.
 * @param {unknown} timer
 * @param {number} [now]
 */
function resume(timer, now = Date.now()) {
  const t = normalize(timer);
  if (t.status !== "paused") return t;
  const rem = Math.max(0, t.pausedRemainingMs || 0);
  if (rem <= 0) return end(t, now);
  return {
    ...t,
    status: "running",
    endsAt: now + rem,
    pausedRemainingMs: null,
  };
}

/**
 * Restzeit verlängern (running oder paused). Cap bei MAX_SEC Rest.
 * extraSec darf 30/60/120 sein — nicht über clampLimit (das wäre 10–300).
 * @param {unknown} timer
 * @param {unknown} extraSec
 * @param {number} [now]
 */
function extend(timer, extraSec, now = Date.now()) {
  const t = normalize(timer);
  const add = Math.max(0, Math.round(Number(extraSec) || 0) * 1000);
  if (!add) return t;
  const capMs = MAX_SEC * 1000;
  if (t.status === "running" && t.endsAt != null) {
    const nextEnd = Math.min(t.endsAt + add, now + capMs);
    return { ...t, endsAt: nextEnd };
  }
  if (t.status === "paused") {
    return { ...t, pausedRemainingMs: Math.min((t.pausedRemainingMs || 0) + add, capMs) };
  }
  return t;
}

/**
 * Fragenrunde beenden — danach canSubmit = false.
 * @param {unknown} timer
 * @param {number} [now]
 */
function end(timer, now = Date.now()) {
  const t = normalize(timer);
  return {
    ...t,
    enabled: true,
    status: "ended",
    endsAt: now,
    pausedRemainingMs: 0,
  };
}

/**
 * Limit setzen, ohne den Lauf zu starten. limitSec 0 → enabled false.
 * @param {unknown} timer
 * @param {unknown} limitSec
 */
function configure(timer, limitSec) {
  const t = normalize(timer);
  const limit = clampLimit(limitSec);
  return {
    ...t,
    enabled: limit > 0,
    limitSec: limit || t.limitSec,
  };
}

/**
 * Eine Presenter-Aktion anwenden.
 * @param {unknown} timer
 * @param {string} action  start|pause|resume|extend|end|configure
 * @param {{ now?: number, limitSec?: unknown, seconds?: unknown }} [opts]
 */
function apply(timer, action, opts = {}) {
  const now = opts.now || Date.now();
  const seconds = opts.seconds != null ? opts.seconds : opts.limitSec;
  switch (String(action || "")) {
    case "start":
      return start(timer, now, opts.limitSec != null ? opts.limitSec : seconds);
    case "pause":
      return pause(timer, now);
    case "resume":
      return resume(timer, now);
    case "extend":
      return extend(timer, seconds, now);
    case "end":
      return end(timer, now);
    case "configure":
      return configure(timer, opts.limitSec != null ? opts.limitSec : seconds);
    default:
      return normalize(timer);
  }
}

module.exports = {
  MIN_SEC,
  MAX_SEC,
  STEP,
  DEFAULT_LIMIT,
  clampLimit,
  empty,
  normalize,
  snapshot,
  canSubmit,
  msUntilEnd,
  start,
  pause,
  resume,
  extend,
  end,
  configure,
  apply,
};
