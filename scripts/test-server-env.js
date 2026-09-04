/**
 * Gemeinsame Test-Umgebung für kurzlebige Pulse-Server (kein Port 3000, keine Prod-Daten).
 * @module test-server-env
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

/** Ephemeralen Port im sicheren Bereich wählen. */
function pickPort(base = 36000, span = 24000) {
  return base + (process.pid % span);
}

/** Isoliertes Arbeitsverzeichnis mit leerer data/events.json. */
function makeIsolatedDataDir(prefix = "pulse-srv-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(dir, "data"), { recursive: true });
  fs.writeFileSync(path.join(dir, "data", "events.json"), JSON.stringify({ events: [] }));
  fs.mkdirSync(path.join(dir, "data", "ssl"), { recursive: true });
  return dir;
}

/**
 * Umgebungsvariablen für Test-Server — überschreibt Prod-.env-Leaks (DATABASE_URL, REDIS_URL).
 * @param {object} overrides
 */
function serverTestEnv(overrides = {}) {
  return {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: "",
    REDIS_URL: "",
    IP_BLOCK: "0",
    ...overrides,
  };
}

module.exports = { pickPort, makeIsolatedDataDir, serverTestEnv };
