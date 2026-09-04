#!/usr/bin/env node
/**
 * Backup-Restore-Drill auf der lokalen Instanz (data/ unter Projekt-ROOT).
 * Erstellt Backup, verändert branding.json, stellt per Gruppe „branding“ wieder her.
 */
const fs = require("fs");
const path = require("path");

const backupService = require("../lib/backupService");
const dataDir = path.join(backupService.ROOT, "data");
const brandingPath = path.join(dataDir, "branding.json");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  assert(fs.existsSync(brandingPath), "data/branding.json fehlt");

  const started = new Date().toISOString();
  const original = JSON.parse(fs.readFileSync(brandingPath, "utf8"));
  const originalAppName = original.appName || original.name || "";

  backupService.saveConfig({ enabled: true, retentionDays: 7, includeEnv: false });

  const zipName = backupService.newBackupFilename("restore-drill");
  const zipPath = path.join(backupService.getBackupDir(), zipName);
  const created = await backupService.createBackupZip(zipPath);
  assert(fs.existsSync(zipPath), "Backup-ZIP erstellt");

  const valid = await backupService.validateBackupZip(zipPath);
  assert(valid.valid, "ZIP validiert");
  assert(valid.available?.branding || valid.available?.events, "Gruppen im Backup erkannt");

  fs.writeFileSync(brandingPath, JSON.stringify({ ...original, appName: "CORRUPTED-DRILL" }));

  await backupService.restoreFromBackup(zipPath, {
    groups: ["branding"],
    broadcast: false,
  });

  const restored = JSON.parse(fs.readFileSync(brandingPath, "utf8"));
  const restoredName = restored.appName || restored.name || "";
  assert(restoredName === originalAppName, "branding.json nach Restore wiederhergestellt");
  assert(restoredName !== "CORRUPTED-DRILL", "Keine Korruption mehr");

  const report = {
    at: started,
    completedAt: new Date().toISOString(),
    outcome: "success",
    backupFile: zipName,
    checksum: created.checksum,
    restoredAppName: restoredName,
  };

  const reportPath = path.join(__dirname, "../docs/stabilization/backup-restore-drill-latest.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log("backup-restore-drill: OK");
})().catch((err) => {
  console.error("backup-restore-drill: FEHLER", err.message);
  process.exitCode = 1;
});
