/**
 * Stage-Hintergrundeffekte (CJS) — Sanitize für Server und Tests.
 */

const STAGE_EFFECTS = ["none", "sunrise", "waterfall", "parallax"];
const STAGE_EFFECT_INTENSITIES = ["low", "medium", "high"];

/**
 * Effekt-ID normalisieren (Default: none).
 * @param {unknown} value
 * @returns {'none'|'sunrise'|'waterfall'|'parallax'}
 */
function sanitizeStageEffect(value) {
  const id = String(value || "none")
    .trim()
    .toLowerCase();
  return STAGE_EFFECTS.includes(id) ? id : "none";
}

/**
 * Intensität normalisieren (Default: medium).
 * @param {unknown} value
 * @returns {'low'|'medium'|'high'}
 */
function sanitizeStageEffectIntensity(value) {
  const id = String(value || "medium")
    .trim()
    .toLowerCase();
  return STAGE_EFFECT_INTENSITIES.includes(id) ? id : "medium";
}

module.exports = {
  STAGE_EFFECTS,
  STAGE_EFFECT_INTENSITIES,
  sanitizeStageEffect,
  sanitizeStageEffectIntensity,
};
