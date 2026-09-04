/**
 * Session-Synchronisation: aktive Folie nach Reconnect/Deck-Änderungen begrenzen.
 * Verhindert Index außerhalb des Decks (B-006 / C-008).
 */

/**
 * @param {{ slides?: object[], activeSlideIndex?: number } | null | undefined} session
 * @returns {number}
 */
function clampActiveSlideIndex(session) {
  const slides = session?.slides;
  if (!Array.isArray(slides) || !slides.length) return 0;
  const max = slides.length - 1;
  const raw = Number(session.activeSlideIndex);
  const idx = Number.isFinite(raw) ? raw : 0;
  return Math.max(0, Math.min(max, idx));
}

/**
 * Setzt activeSlideIndex in-place auf einen gültigen Wert.
 * @param {{ slides?: object[], activeSlideIndex?: number } | null | undefined} session
 * @returns {typeof session}
 */
function normalizeSessionSlides(session) {
  if (!session) return session;
  session.activeSlideIndex = clampActiveSlideIndex(session);
  return session;
}

module.exports = { clampActiveSlideIndex, normalizeSessionSlides };
