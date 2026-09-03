/**
 * Audit-Log kritischer Aktionen. IPs werden nur als Hash gespeichert.
 * Einträge älter als 90 Tage werden beim Sweep gelöscht (DSGVO).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const FILE = path.join(process.cwd(), "data", "audit.json");
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const MAX = 5000;

function hashIp(ip) {
  if (!ip) return "";
  return crypto.createHash("sha256").update(String(ip)).digest("hex").slice(0, 16);
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return [];
  }
}

function save(rows) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(rows.slice(-MAX)));
}

function log(event, extra = {}) {
  const rows = load();
  rows.push({
    timestamp: new Date().toISOString(),
    event,
    roomId: extra.roomId || "",
    userId: extra.userId || "",
    action: extra.action || "",
    questionId: extra.questionId || "",
    ip: extra.ip ? hashIp(extra.ip) : extra.ipHash || "",
  });
  save(rows);
}

function sweep() {
  const cutoff = Date.now() - RETENTION_MS;
  const rows = load().filter((r) => Date.parse(r.timestamp) >= cutoff);
  save(rows);
  return rows.length;
}

function exportAll() {
  return load();
}

module.exports = { log, sweep, exportAll, hashIp };
