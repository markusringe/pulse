/**
 * Suppression-Liste für Bounces/Complaints (Webhook).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const PATH_FILE = path.join(DATA_DIR, "email-suppression.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadRaw() {
  ensureDir();
  if (!fs.existsSync(PATH_FILE)) return { version: 1, entries: {} };
  try {
    return JSON.parse(fs.readFileSync(PATH_FILE, "utf8"));
  } catch {
    return { version: 1, entries: {} };
  }
}

function saveRaw(data) {
  ensureDir();
  const tmp = `${PATH_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, PATH_FILE);
}

/** @param {string} email */
function normalize(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

/** @param {string} email */
function isSuppressed(email) {
  const key = normalize(email);
  if (!key) return false;
  const entry = loadRaw().entries[key];
  return Boolean(entry && (entry.reason === "bounce" || entry.reason === "complaint"));
}

/**
 * @param {string} email
 * @param {'bounce'|'complaint'} reason
 * @param {object} meta
 */
function suppress(email, reason, meta = {}) {
  const key = normalize(email);
  if (!key) return;
  const data = loadRaw();
  data.entries[key] = {
    email: key,
    reason,
    at: Date.now(),
    meta,
  };
  saveRaw(data);
}

function list(limit = 100) {
  const entries = Object.values(loadRaw().entries);
  return entries.sort((a, b) => b.at - a.at).slice(0, limit);
}

/** Gehashte Darstellung für Logs (kein Klartext in Audit). */
function hashEmail(email) {
  return crypto.createHash("sha256").update(normalize(email)).digest("hex").slice(0, 16);
}

module.exports = { isSuppressed, suppress, list, hashEmail, normalize };
