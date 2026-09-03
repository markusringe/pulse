/**
 * Häufige Funktionswörter (DE/EN/FR) — zählen in der Wortwolke nicht mit.
 * Unabhängig vom Schimpfwort-Filter in wordFilter.js.
 */

const DE = [
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einer", "einem", "einen", "eines",
  "und", "oder", "aber", "weil", "wenn", "dann", "als", "auch", "noch", "nur", "sehr", "mehr",
  "mit", "von", "zu", "zum", "zur", "im", "in", "am", "an", "auf", "aus", "bei", "nach", "vor",
  "über", "unter", "für", "ist", "sind", "war", "waren", "wird", "werden", "kann", "können",
  "wir", "ihr", "sie", "ich", "du", "er", "es", "uns", "euch", "man", "sich", "nicht", "kein",
  "keine", "ja", "nein", "bitte", "mal", "hier", "dort", "so", "wie", "was", "wer", "wo",
  "dieser", "diese", "dieses", "jener", "jede", "jeder", "alles", "etwas", "nichts",
];

const EN = [
  "the", "a", "an", "and", "or", "but", "if", "then", "as", "also", "only", "very", "more",
  "with", "from", "to", "in", "on", "at", "of", "for", "is", "are", "was", "were", "be", "been",
  "we", "you", "they", "i", "he", "she", "it", "us", "them", "not", "no", "yes", "please",
  "this", "that", "these", "those", "what", "who", "where", "how", "so",
];

const FR = [
  "le", "la", "les", "un", "une", "des", "et", "ou", "mais", "si", "alors", "aussi", "plus",
  "avec", "de", "du", "au", "aux", "à", "en", "dans", "sur", "pour", "est", "sont", "était",
  "nous", "vous", "ils", "elles", "je", "tu", "il", "elle", "ne", "pas", "oui", "non",
  "ce", "cet", "cette", "ces", "qui", "que", "quoi", "où", "comment",
];

const SET = new Set([...DE, ...EN, ...FR].map((w) => w.toLowerCase()));

/**
 * @param {string} word
 * @returns {boolean}
 */
function isStopword(word) {
  const key = String(word || "")
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:„“"']+/g, "");
  if (!key || key.length < 2) return true;
  return SET.has(key);
}

module.exports = { isStopword, SET };
