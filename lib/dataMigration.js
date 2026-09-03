/**
 * Datenbank- und Event-Migrationen nach Updates oder Backup-Wiederherstellung.
 * Wird von updateService und backupService gemeinsam genutzt.
 */

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const ROOT = path.join(__dirname, "..");

/**
 * Schema-/Daten-Migrationen ausführen (Events-Legacy, SQL-Dateien protokollieren).
 * @param {{ label?: string }} [opts]
 */
async function runDataMigrations(opts = {}) {
  const label = opts.label ? `[${opts.label}] ` : "";
  const migrationsDir = path.join(ROOT, "migrations");
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      console.log(`${label}[migration] SQL-Datei gefunden:`, f);
    }
  }

  const migrateEvents = path.join(ROOT, "scripts", "migrate-events.js");
  if (fs.existsSync(migrateEvents)) {
    await execFileAsync(process.execPath, [migrateEvents], { cwd: ROOT, timeout: 120000 });
  }

  try {
    const events = require("./events");
    const result = events.migrateLegacy();
    if (result?.changed) {
      console.log(`${label}[migration] Events-Legacy migriert:`, result.pending?.length || 0);
    }
  } catch (err) {
    console.warn(`${label}[migration] events.migrateLegacy:`, err.message || err);
  }
}

module.exports = { runDataMigrations };
