/**
 * Zusätzliche PIN-Bestätigung für privilegierte Admin-Aktionen.
 * Gültigkeit: 15 Minuten nach erfolgreicher Step-up-Prüfung.
 */

const STEP_UP_TTL_MS = 15 * 60 * 1000;

/**
 * @param {number|null|undefined} stepUpUntil
 * @returns {boolean}
 */
function hasValidStepUp(stepUpUntil) {
  return Boolean(stepUpUntil && stepUpUntil > Date.now());
}

function stepUpExpiresAt() {
  return Date.now() + STEP_UP_TTL_MS;
}

/**
 * Prüft, ob für einen Admin eine frische PIN nötig ist.
 * @param {{ user?: object|null, viaSecret?: boolean, session?: object|null }} auth
 * @returns {{ ok: boolean, required?: boolean }}
 */
function checkStepUp(auth) {
  if (!auth?.user) return { ok: true };
  if (auth.viaSecret) return { ok: true };
  if (auth.user.role !== "admin") return { ok: true };
  if (hasValidStepUp(auth.session?.stepUpUntil)) return { ok: true };
  return { ok: false, required: true };
}

function stepUpError() {
  const err = new Error("Erneute PIN-Bestätigung erforderlich");
  err.statusCode = 403;
  err.code = "step_up_required";
  return err;
}

module.exports = { STEP_UP_TTL_MS, hasValidStepUp, stepUpExpiresAt, checkStepUp, stepUpError };
