/**
 * Dynamische Session-Formulare: Sichtbarkeit und Limits je Folientyp.
 * Wird vom Admin-Startformular (app.js) genutzt.
 */

/** Typen mit klassischer Optionsliste (2–6 oder Picker 10–50). */
export const OPTION_SLIDE_TYPES = new Set([
  "choice",
  "quiz",
  "ranking",
  "points100",
  "image_choice",
  "picker",
]);

/** Typen mit typ-spezifischem Block unter den Optionen. */
export const TYPE_SPECIFIC = {
  choice: ["hideResults"],
  quiz: ["quiz"],
  rating_scale: ["rating"],
  wordcloud: ["wordcloud"],
  qa: ["qa"],
  datetime: ["datetime"],
  image_choice: ["image"],
  picker: ["picker"],
};

/**
 * Maximal erlaubte Optionen je Typ.
 * @param {string} type
 */
export function maxOptionsForType(type) {
  if (type === "picker") return 50;
  return 6;
}

/**
 * Mindestanzahl Optionen je Typ.
 * @param {string} type
 */
export function minOptionsForType(type) {
  if (type === "picker") return 10;
  return 2;
}

/**
 * Soll der Options-Abschnitt eingeblendet werden?
 * @param {string} type
 */
export function showsOptionsSection(type) {
  return OPTION_SLIDE_TYPES.has(type);
}

/**
 * Soll der Typ-Optionen-Gesamtblock sichtbar sein?
 * @param {string} type
 */
export function showsTypeOptionsSection(type) {
  return (
    showsOptionsSection(type) ||
    type === "rating_scale" ||
    type === "datetime" ||
    type === "wordcloud" ||
    type === "qa" ||
    type === "picker"
  );
}

/**
 * CSS-Klasse für Fade/Slide-Animation setzen.
 * @param {HTMLElement|null} el
 * @param {boolean} visible
 */
export function toggleSection(el, visible) {
  if (!el) return;
  el.classList.toggle("form-section--visible", visible);
  el.classList.toggle("form-section--hidden", !visible);
  el.hidden = !visible;
}

/**
 * Warnung bei Folientyp-Wechsel (Optionen werden verworfen).
 * @param {string} prevType
 * @param {string} nextType
 * @returns {boolean} true = Wechsel erlaubt
 */
export function confirmTypeChange(prevType, nextType) {
  if (prevType === nextType) return true;
  if (prevType === "demo" || nextType === "demo") return true;
  const hadOpts = OPTION_SLIDE_TYPES.has(prevType);
  const needsOpts = OPTION_SLIDE_TYPES.has(nextType);
  if (!hadOpts && !needsOpts) return true;
  return window.confirm(
    "Folientyp ändern löscht alle Optionen und typ-spezifischen Einstellungen. Fortfahren?"
  );
}
