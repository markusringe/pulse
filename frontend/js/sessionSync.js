/**
 * Client-Hilfen für Session-Sync nach WebSocket-Reconnect (Spiegel zu lib/sessionSync.js).
 */

/**
 * Aktiven Folienindex auf gültigen Bereich begrenzen.
 * @param {{ slides?: object[], activeSlideIndex?: number } | null | undefined} session
 * @returns {number}
 */
export function clampActiveSlideIndex(session) {
  const slides = session?.slides;
  if (!Array.isArray(slides) || !slides.length) return 0;
  const max = slides.length - 1;
  const raw = Number(session.activeSlideIndex);
  const idx = Number.isFinite(raw) ? raw : 0;
  return Math.max(0, Math.min(max, idx));
}

/**
 * Session in-place normalisieren (Reconnect / Server-Payload).
 * @param {{ slides?: object[], activeSlideIndex?: number } | null | undefined} session
 */
export function normalizeSessionSlides(session) {
  if (!session) return;
  session.activeSlideIndex = clampActiveSlideIndex(session);
}
