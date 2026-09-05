/**
 * Countdown-Metadaten (CJS) — gemeinsame Logik für Server-Tests und Browser-Spiegel.
 */

const COUNTDOWN_STYLES = ["classic", "modern", "retro"];

/**
 * Countdown-Stil normalisieren (Default: modern).
 * @param {unknown} value
 * @returns {'classic'|'modern'|'retro'}
 */
function sanitizeCountdownStyle(value) {
  const id = String(value || "modern")
    .trim()
    .toLowerCase();
  return COUNTDOWN_STYLES.includes(id) ? id : "modern";
}

/**
 * Startzeit für die Stage formatieren (ohne Sekunden).
 * @param {string} startTime ISO-8601
 * @param {string} [locale='de-DE']
 * @param {string} [timeZone]
 * @returns {string}
 */
function formatEventStartDisplay(startTime, locale = "de-DE", timeZone) {
  const ms = Date.parse(String(startTime || ""));
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const opts = timeZone ? { timeZone } : {};
  const datePart = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...opts,
  }).format(d);
  const timePart = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    ...opts,
  }).format(d);
  if (String(locale).toLowerCase().startsWith("de")) {
    return `${datePart} · ${timePart} Uhr`;
  }
  return `${datePart} · ${timePart}`;
}

/**
 * Statuszeile für Countdown-UI.
 * @param {number} ms Restzeit
 * @param {{ paused?: boolean }} [opts]
 */
function countdownStatusLabel(ms, opts = {}) {
  if (opts.paused) return "Pause";
  if (ms <= 0) return "Beginnt gleich";
  return "Wir starten in";
}

module.exports = {
  COUNTDOWN_STYLES,
  sanitizeCountdownStyle,
  formatEventStartDisplay,
  countdownStatusLabel,
};
