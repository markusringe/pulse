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

/** Folienwechsel/Deck/Lobby: für Teilnehmer und Stage nicht wegen stateVersion verwerfen. */
const HIGH_PRIORITY_EVENTS = new Set(["slide", "deck", "lobby"]);

/**
 * Strukturelle Events rollenabhängig filtern — Presenter behält stale-Schutz.
 * @param {{ stateVersion?: number } | null | undefined} session
 * @param {{ stateVersion?: number } | null | undefined} payload
 * @param {{ role?: string, eventType?: string }} [opts]
 * @returns {boolean}
 */
export function acceptStructural(session, payload, { role = "presenter", eventType = "" } = {}) {
  const r = String(role || "");
  if ((r === "join" || r === "participant" || r === "stage") && HIGH_PRIORITY_EVENTS.has(String(eventType || ""))) {
    return true;
  }
  return acceptIncoming(session, payload);
}

/**
 * Folienwechsel-Payload in Session übernehmen (Presenter, Teilnehmer, Stage).
 * @param {object} session
 * @param {object} payload
 * @param {{ stripSlide?: (s: object) => object }} [opts]
 * @returns {number | null} neuer Index oder null
 */
export function applySlidePayload(session, payload, opts = {}) {
  if (!session || payload?.index == null) return null;
  const index = Number(payload.index);
  if (!Number.isFinite(index)) return null;
  session.activeSlideIndex = index;
  normalizeSessionSlides(session);
  if (payload.slide) {
    const incoming = opts.stripSlide ? opts.stripSlide(payload.slide) : payload.slide;
    session.slides[index] = { ...(session.slides[index] || {}), ...incoming };
  }
  applyIncoming(session, payload);
  return session.activeSlideIndex;
}

/**
 * WS-Envelope: stateVersion von Top-Level in Payload übernehmen (announce-Fanout).
 * @param {object | null | undefined} envelope
 * @returns {object | null | undefined}
 */
export function normalizeWsPayload(envelope) {
  if (!envelope || typeof envelope !== "object") return envelope;
  const payload = envelope.payload ?? envelope;
  if (
    envelope.stateVersion != null &&
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    payload.stateVersion == null
  ) {
    return { ...payload, stateVersion: envelope.stateVersion };
  }
  return payload;
}

/**
 * Lokale stateVersion nach angenommenem Event aktualisieren.
 * @param {object} session
 * @param {{ stateVersion?: number } | null | undefined} payload
 */
export function applyIncoming(session, payload) {
  mergeRemote(session, payload?.stateVersion);
}
