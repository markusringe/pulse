/**
 * Sonderfolien (Start / Pause / Ende) — Sanitize und Defaults für Event-Metadaten.
 * Stile teilen sich die Countdown-Palette (classic, modern, retro).
 */

const { sanitizeCountdownStyle } = require("./eventCountdownMeta");

/** Erlaubte Sonderfolien-Keys in der Session (Legacy slide-WS). */
const SPECIAL_SLIDE_KINDS = ["start", "pause", "end"];

/** Aktive Sonderansicht — persistiert am Event, via event_meta synchronisiert. */
const CURRENT_SPECIAL_SLIDE_VALUES = ["countdown", "pause", "end"];

/** Feste Typ-IDs pro Sonderfolie (nur Metadaten, kein Deck-Eintrag). */
const SPECIAL_SLIDE_TYPES = {
  start: "title",
  pause: "pause",
  end: "thanks",
};

/** Standardtexte, wenn Felder leer oder ungültig sind. */
const DEFAULTS = {
  start: {
    enabled: false,
    type: "title",
    title: "Willkommen",
    subtitle: "Wir beginnen in Kürze",
    style: "modern",
  },
  pause: {
    enabled: false,
    type: "pause",
    title: "Pause",
    subtitle: "Gleich geht es weiter",
    style: "modern",
  },
  end: {
    enabled: false,
    type: "thanks",
    title: "Vielen Dank für Ihre Teilnahme",
    subtitle: "Das Event ist beendet",
    style: "modern",
  },
};

/**
 * Freitext ohne Steuerzeichen, HTML oder überlange Eingaben.
 * @param {unknown} value
 * @param {number} [max=120]
 */
function sanitizeText(value, max = 120) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, max);
}

/**
 * Einzelne Sonderfolien-Konfiguration normalisieren.
 * @param {unknown} raw
 * @param {'start'|'pause'|'end'} kind
 */
function sanitizeSpecialSlideConfig(raw, kind) {
  const def = DEFAULTS[kind] || DEFAULTS.start;
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    enabled: Boolean(src.enabled),
    type: SPECIAL_SLIDE_TYPES[kind] || def.type,
    title: sanitizeText(src.title, 120) || def.title,
    subtitle: sanitizeText(src.subtitle, 120) || def.subtitle,
    style: sanitizeCountdownStyle(src.style),
  };
}

/**
 * Session-Sonderfolie (start|pause|end) validieren.
 * @param {unknown} value
 * @returns {'start'|'pause'|'end'|null}
 */
function sanitizeSpecialSlideKind(value) {
  const k = String(value || "")
    .trim()
    .toLowerCase();
  if (k === "start") return "start";
  return SPECIAL_SLIDE_KINDS.includes(k) ? k : null;
}

/**
 * Aktive Sonderansicht am Event (countdown | pause | end | null).
 * @param {unknown} value
 * @returns {'countdown'|'pause'|'end'|null}
 */
function sanitizeCurrentSpecialSlide(value) {
  const k = String(value || "")
    .trim()
    .toLowerCase();
  return CURRENT_SPECIAL_SLIDE_VALUES.includes(k) ? k : null;
}

/**
 * Sonderfolien-Konfiguration aus Event lesen (nur wenn aktiviert).
 * @param {object} ev
 * @param {'start'|'pause'|'end'} kind
 */
function specialSlideConfigFor(ev, kind) {
  if (!ev || !kind) return null;
  if (kind === "countdown") {
    return ev.startTime ? { enabled: true, style: ev.countdownStyle || "modern" } : null;
  }
  const key = kind === "start" ? "startSlide" : kind === "pause" ? "pauseSlide" : "endSlide";
  const cfg = ev[key];
  if (!cfg?.enabled) return null;
  return cfg;
}

module.exports = {
  SPECIAL_SLIDE_KINDS,
  CURRENT_SPECIAL_SLIDE_VALUES,
  SPECIAL_SLIDE_TYPES,
  DEFAULTS,
  sanitizeSpecialSlideConfig,
  sanitizeSpecialSlideKind,
  sanitizeCurrentSpecialSlide,
  specialSlideConfigFor,
};
