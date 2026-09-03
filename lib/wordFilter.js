/**
 * Wortfilter für Q&A: blockiert Treffer oder markiert sie zur Moderation.
 * Die Liste kommt aus config/badwords.json plus optionale Admin-Wörter.
 */

const fs = require("fs");
const path = require("path");

let cached = [];
try {
  cached = require(path.join(__dirname, "..", "config", "badwords.json")).words || [];
} catch {
  cached = [];
}

/**
 * @param {string} text
 * @param {string[]} extra
 * @returns {{ status: 'blocked'|'approved', hits?: string[], reason?: string }}
 */
function moderateQuestion(text, extra = []) {
  const raw = String(text || "").toLowerCase();
  const list = [...cached, ...extra].map((w) => String(w).toLowerCase().trim()).filter(Boolean);
  const hits = list.filter((word) => word && raw.includes(word));
  if (hits.length) {
    return { status: "blocked", reason: "Unangemessene Sprache", hits };
  }
  return { status: "approved" };
}

function loadFromDisk() {
  try {
    const file = path.join(__dirname, "..", "config", "badwords.json");
    cached = JSON.parse(fs.readFileSync(file, "utf8")).words || cached;
  } catch {
    /* Liste bleibt, wie sie ist */
  }
  return cached;
}

module.exports = { moderateQuestion, loadFromDisk };
