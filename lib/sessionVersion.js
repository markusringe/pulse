/**
 * Phase 2 — Monotone stateVersion pro Live-Session (optimistische Concurrency).
 * Presenter-Mutationen prüfen expectedVersion; Clients ignorieren veraltete Broadcasts.
 */

/** WS/REST-Typen mit strukturellem Session-Stand (stale-Filter auf dem Client). */
const STRUCTURAL_ENVELOPE_TYPES = new Set([
  "session",
  "deck",
  "slide",
  "slide_updated",
  "lobby",
  "results",
  "emergency_activated",
  "emergency_resumed",
  "interaction",
  "reset",
  "qa_timer",
]);

/**
 * @param {{ stateVersion?: number } | null | undefined} session
 * @returns {number}
 */
function getVersion(session) {
  return Number(session?.stateVersion) || 0;
}

/**
 * expectedVersion aus Body oder WS-Payload lesen.
 * @param {object | null | undefined} source
 * @returns {number | null} null = keine Prüfung (Übergang / Legacy-Client)
 */
function readExpected(source) {
  if (!source || source.expectedVersion == null) return null;
  const n = Number(source.expectedVersion);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object} session
 * @param {number | null} expected
 * @returns {{ ok: true, currentVersion: number } | { ok: false, currentVersion: number, message: string, code: string }}
 */
function checkExpected(session, expected) {
  const current = getVersion(session);
  if (expected == null) return { ok: true, currentVersion: current };
  if (expected !== current) {
    return {
      ok: false,
      currentVersion: current,
      message: `Versionskonflikt: erwartet ${expected}, aktuell ${current}.`,
      code: "STATE_VERSION_CONFLICT",
    };
  }
  return { ok: true, currentVersion: current };
}

/**
 * Session-Version nach erfolgreicher Presenter-Mutation erhöhen.
 * @param {object} session
 * @returns {number}
 */
function bump(session) {
  session.stateVersion = getVersion(session) + 1;
  return session.stateVersion;
}

/**
 * Remote/Fanout-Version in lokale Session übernehmen (max-Wert).
 * @param {object} session
 * @param {number | null | undefined} remoteVersion
 */
function mergeRemote(session, remoteVersion) {
  if (remoteVersion == null) return;
  const r = Number(remoteVersion);
  if (!Number.isFinite(r)) return;
  session.stateVersion = Math.max(getVersion(session), r);
}

/**
 * @param {string | undefined} type
 * @returns {boolean}
 */
function isStructuralType(type) {
  return STRUCTURAL_ENVELOPE_TYPES.has(String(type || ""));
}

/**
 * Envelope um stateVersion anreichern (Top-Level, für Redis-Fanout).
 * @param {object} envelope
 * @param {object} session
 * @returns {object}
 */
function withEnvelopeVersion(envelope, session) {
  if (!envelope || typeof envelope !== "object") return envelope;
  return { ...envelope, stateVersion: getVersion(session) };
}

/**
 * 409-Antwort / WS-Fehlerpayload bei Versionskonflikt.
 * @param {object} session
 * @param {{ currentVersion?: number, message?: string, code?: string }} [check]
 */
function conflictPayload(session, check = {}) {
  return {
    error: check.message || "Versionskonflikt — Session wurde in einem anderen Tab geändert.",
    code: check.code || "STATE_VERSION_CONFLICT",
    stateVersion: check.currentVersion ?? getVersion(session),
  };
}

/**
 * Client: strukturelles Event anwenden oder verwerfen (stale-Broadcast-Filter).
 * @param {{ stateVersion?: number } | null | undefined} session
 * @param {{ stateVersion?: number } | null | undefined} payload
 * @returns {boolean} true = anwenden
 */
function acceptIncoming(session, payload) {
  const incoming = payload?.stateVersion;
  if (incoming == null) return true;
  const local = getVersion(session);
  return Number(incoming) >= local;
}

/**
 * Client: lokale stateVersion nach angenommenem Event aktualisieren.
 * @param {object} session
 * @param {{ stateVersion?: number } | null | undefined} payload
 */
function applyIncoming(session, payload) {
  mergeRemote(session, payload?.stateVersion);
}

module.exports = {
  STRUCTURAL_ENVELOPE_TYPES,
  getVersion,
  readExpected,
  checkExpected,
  bump,
  mergeRemote,
  isStructuralType,
  withEnvelopeVersion,
  conflictPayload,
  acceptIncoming,
  applyIncoming,
};
