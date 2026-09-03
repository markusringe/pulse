/**
 * Automatische Backups per Cron (täglich 3:00 oder wöchentlich Sonntag 3:00).
 */

const cron = require("node-cron");
const backupService = require("./backupService");

let scheduledTask = null;

/** Cron-Ausdruck aus Konfiguration ableiten. */
function cronExpression(config) {
  if (config.interval === "weekly") return "0 3 * * 0";
  return "0 3 * * *";
}

/** Geplanten Job neu starten (nach Config-Änderung). */
function restartAutoBackup() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
  const config = backupService.getConfig();
  if (!config.enabled) return;
  const expr = cronExpression(config);
  if (!cron.validate(expr)) {
    console.warn("[auto-backup] Ungültiger Cron-Ausdruck:", expr);
    return;
  }
  scheduledTask = cron.schedule(expr, async () => {
    console.log("[auto-backup] Erstelle automatisches Backup…");
    try {
      await backupService.runBackupJob("auto");
      console.log("[auto-backup] Backup erfolgreich erstellt");
    } catch (err) {
      console.error("[auto-backup] Fehlgeschlagen:", err.message);
    }
  });
  console.log("[auto-backup] Geplant:", expr, `(${config.interval})`);
}

/** Auto-Backup beim Serverstart aktivieren. */
function startAutoBackup() {
  restartAutoBackup();
}

module.exports = {
  startAutoBackup,
  restartAutoBackup,
};
