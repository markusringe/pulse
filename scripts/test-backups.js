#!/usr/bin/env node
/**
 * Tests für Backup-Service (ZIP, Checksum, Liste) — ohne laufenden Server.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-backup-test-"));
const prevCwd = process.cwd();
process.chdir(tmpRoot);

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/pulse.db", "test-db");
fs.writeFileSync("data/events.json", JSON.stringify({ events: [] }));
fs.writeFileSync("data/branding.json", JSON.stringify({ appName: "Test" }));
fs.writeFileSync(
  "package.json",
  JSON.stringify({ name: "pulse-test", version: "1.0.0" }, null, 2)
);

process.env.BACKUP_DIR = path.join(tmpRoot, "data", "backups");

const backupService = require("../lib/backupService");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  const cfg = backupService.saveConfig({ enabled: true, retentionDays: 3, includeEnv: false });
  assert(cfg.retentionDays === 3, "Retention speichern");

  const dir = backupService.getBackupDir();
  assert(fs.existsSync(dir), "Backup-Verzeichnis angelegt");

  const filename = backupService.newBackupFilename("backup");
  const zipPath = path.join(dir, filename);
  const created = await backupService.createBackupZip(zipPath);
  assert(fs.existsSync(zipPath), "ZIP erstellt");
  assert(created.size > 0, "Größe > 0");
  assert(created.checksum.startsWith("sha256:"), "Checksum-Format");
  assert(fs.existsSync(`${zipPath}.json`), "Sidecar-JSON");

  const valid = await backupService.validateBackupZip(zipPath);
  assert(valid.valid, "ZIP gültig");
  assert(valid.metadata.appVersion === "1.0.0", "Metadaten Version");
  assert(valid.groups?.length > 0, "Gruppen-Katalog");

  await backupService.restoreFromBackup(zipPath, {
    groups: ["branding"],
    broadcast: false,
  });
  const branding = JSON.parse(fs.readFileSync("data/branding.json", "utf8"));
  assert(branding.appName === "Test", "Selektives Branding-Restore");

  const version = backupService.analyzeBackupVersion(valid.metadata);
  assert(version.currentVersion === "1.0.0", "Aktuelle Version");
  assert(version.status === "match", "Version match");

  const list = backupService.listBackups();
  assert(list.length === 1, "Ein Backup in Liste");
  assert(list[0].filename === filename, "Dateiname in Liste");

  backupService.safeBackupFilename(filename);
  let threw = false;
  try {
    backupService.safeBackupFilename("../evil.zip");
  } catch {
    threw = true;
  }
  assert(threw, "Path-Traversal blockiert");

  console.log("test-backups: OK");
})().catch((err) => {
  console.error("test-backups: FEHLER", err);
  process.exitCode = 1;
}).finally(() => {
  process.chdir(prevCwd);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});
