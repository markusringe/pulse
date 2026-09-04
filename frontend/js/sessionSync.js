/**
 * Client-Hilfen für Session-Sync nach WebSocket-Reconnect (Spiegel zu lib/sessionSync.js).
 * stateVersion-Filter entspricht lib/sessionVersion.js (stale-Broadcasts verwerfen).
 */

/**
 * @param {{ stateVersion?: number } | null | undefined} session
 * @returns {number}
 */
export function getVersion(session) {
  return Number(session?.stateVersion) || 0;
}

/**
 * Remote-Version in die lokale Session übernehmen (max-Wert).
 * @param {object} session
 * @param {number | null | undefined} remoteVersion
 */
export function mergeRemote(session, remoteVersion) {
  if (remoteVersion == null) return;
  const remote = Number(remoteVersion);
  if (!Number.isFinite(remote)) return;
  session.stateVersion = Math.max(getVersion(session), remote);
}

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

/**
 * Strukturelles WS-Event anwenden oder verwerfen (stale-Broadcast-Filter).
 * @param {{ stateVersion?: number } | null | undefined} session
 * @param {{ stateVersion?: number } | null | undefined} payload
 * @returns {boolean} true = Event darf angewendet werden
 */
export function acceptIncoming(session, payload) {
  const incoming = payload?.stateVersion;
  if (incoming == null) return true;
  return Number(incoming) >= getVersion(session);
}

/**
 * Lokale stateVersion nach angenommenem Event aktualisieren.
 * @param {object} session
 * @param {{ stateVersion?: number } | null | undefined} payload
 */
export function applyIncoming(session, payload) {
  mergeRemote(session, payload?.stateVersion);
}
