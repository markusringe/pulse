/**
 * Leichte Spam-Heuristiken für Q&A-Freitext.
 * Treffer führen nicht zum Löschen, sondern zur Moderations-Warteschlange.
 */

const URL_RE = /https?:\/\/|www\./i;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;

/**
 * @param {string} text
 * @param {{ recentTexts?: string[] }} [ctx]
 */
function inspect(text, ctx = {}) {
  const raw = String(text || "");
  const reasons = [];
  const letters = raw.replace(/\s/g, "");
  const upper = letters.replace(/[^A-ZÄÖÜ]/g, "").length;
  if (letters.length > 8 && upper / letters.length > 0.8) reasons.push("caps");
  const emojis = raw.match(EMOJI_RE) || [];
  if (emojis.length > 10) reasons.push("emojis");
  if (emojis.length > 5) reasons.push("emoji-limit");
  if (URL_RE.test(raw)) reasons.push("url");
  const key = raw.toLowerCase().replace(/\s+/g, " ").trim();
  const dupes = (ctx.recentTexts || []).filter((t) => t === key).length;
  if (dupes >= 1) reasons.push("duplicate");
  return { suspicious: reasons.length > 0, reasons };
}

function countEmojis(text) {
  return (String(text || "").match(EMOJI_RE) || []).length;
}

module.exports = { inspect, countEmojis };
