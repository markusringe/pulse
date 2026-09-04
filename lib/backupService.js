/**
 * Vollständige Instanz-Backups als ZIP (Datenbank, JSON, SSL, Uploads).
 * Erstellung, Validierung, Wiederherstellung und Aufbewahrungsrichtlinien.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const archiver = require("archiver");
const { safeExtractZip } = require("./safeZipExtract");

const ROOT = path.join(__dirname, "..");
const CONFIG_FILE = path.join(ROOT, "data", "backup-config.json");

const backupGroups = require("./backupGroups");

/** JSON-Dateien im data/-Verzeichnis. */
const DATA_JSON_FILES = [
  "events.json",
  "branding.json",
  "privacy.json",
  "privacy-versions.json",
  "audit.json",
  "email-config.json",
  "backup-config.json",
  "updates-state.json",
];

/** Optionale Verzeichnisse unter data/. */
const DATA_DIRS = ["ssl", "uploads"];

/** @type {boolean} Restore blockiert Readiness während ZIP-Entpacken. */
let restoreInProgress = false;

function isRestoreInProgress() {
  return restoreInProgress;
}

/** @type {{ persistSessions?: () => Promise<void>, broadcast?: (env: object) => void, shutdown?: (reason?: string) => Promise<void> }} */
let hooks = {};

/**
 * Callbacks für Session-Persistenz, WS-Broadcast und Neustart (aus server.js).
 * @param {object} next
 */
function setHooks(next) {
  hooks = { ...hooks, ...next };
}

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return fallback;
  const n = Number.parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Backup-Verzeichnis (Standard: data/backups). */
function getBackupDir() {
  const dir = process.env.BACKUP_DIR || path.join(ROOT, "data", "backups");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Konfiguration laden (Auto-Backup, Aufbewahrung, .env). */
function getConfig() {
  const defaults = {
    enabled: envBool("BACKUP_AUTO_ENABLED", true),
    interval: process.env.BACKUP_INTERVAL === "weekly" ? "weekly" : "daily",
    retentionDays: envInt("BACKUP_RETENTION_DAYS", 7),
    includeEnv: envBool("BACKUP_INCLUDE_ENV", false),
    includePreviousBackups: false,
  };
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const stored = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
      return { ...defaults, ...stored };
    }
  } catch (err) {
    console.warn("[backup] Konfiguration nicht lesbar:", err.message);
  }
  return defaults;
}

function envBool(name, fallback) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return fallback;
  return !/^(0|false|off|no|disabled)$/i.test(String(raw).trim());
}

/** Konfiguration speichern. */
function saveConfig(partial) {
  const current = getConfig();
  const next = { ...current };
  if (partial.enabled != null) next.enabled = Boolean(partial.enabled);
  if (partial.interval === "weekly" || partial.interval === "daily") next.interval = partial.interval;
  if (partial.retentionDays != null) {
    const d = Number(partial.retentionDays);
    if (Number.isFinite(d) && d >= 1 && d <= 365) next.retentionDays = d;
  }
  if (partial.includeEnv != null) next.includeEnv = Boolean(partial.includeEnv);
  if (partial.includePreviousBackups != null) next.includePreviousBackups = Boolean(partial.includePreviousBackups);
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2));
  return next;
}

/** Dateiname gegen Path-Traversal absichern. */
function safeBackupFilename(name) {
  const base = path.basename(String(name || ""));
  if (!/^(backup|auto|uploaded|prerestore)-[a-zA-Z0-9._-]+\.zip$/.test(base)) {
    throw new Error("Ungültiger Backup-Dateiname");
  }
  return base;
}

/** SHA-256-Prüfsumme einer Datei. */
function calculateChecksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(`sha256:${hash.digest("hex")}`));
    stream.on("error", reject);
  });
}

/** SQLite WAL in die Hauptdatei überführen (konsistentes Backup). */
function checkpointSqlite() {
  const file = process.env.SQLITE_PATH || path.join(ROOT, "data", "pulse.db");
  if (!fs.existsSync(file)) return;
  try {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(file);
    db.exec("PRAGMA wal_checkpoint(FULL);");
    db.close();
  } catch (err) {
    console.warn("[backup] SQLite-Checkpoint fehlgeschlagen:", err.message);
  }
}

/** Metadaten für das ZIP-Archiv. */
function buildMetadata(includes) {
  let appVersion = "1.0.0";
  try {
    appVersion = require(path.join(ROOT, "package.json")).version || appVersion;
  } catch {
    /* Fallback */
  }
  return {
    backupVersion: "1.0.0",
    version: appVersion,
    createdAt: new Date().toISOString(),
    hostname: process.env.DOMAIN || process.env.PULSE_DOMAIN || os.hostname(),
    nodeVersion: process.version,
    appVersion,
    includes,
  };
}

/**
 * ZIP-Backup erstellen.
 * @param {string} outputPath — Zielpfad der .zip-Datei
 * @param {{ includeEnv?: boolean, includePreviousBackups?: boolean, label?: string }} [opts]
 * @returns {Promise<{ size: number, checksum: string, metadata: object, filename: string }>}
 */
async function createBackupZip(outputPath, opts = {}) {
  const config = getConfig();
  const includeEnv = opts.includeEnv ?? config.includeEnv;
  const includePreviousBackups = opts.includePreviousBackups ?? config.includePreviousBackups;
  const dataDir = path.join(ROOT, "data");
  const includes = [];

  await Promise.resolve(hooks.persistSessions?.());
  checkpointSqlite();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);

    const dbFile = process.env.SQLITE_PATH || path.join(dataDir, "pulse.db");
    if (fs.existsSync(dbFile)) {
      archive.file(dbFile, { name: "pulse.db" });
      includes.push("database");
    }

    for (const jsonName of DATA_JSON_FILES) {
      const p = path.join(dataDir, jsonName);
      if (fs.existsSync(p)) {
        archive.file(p, { name: jsonName });
        if (jsonName.includes("privacy")) includes.push("privacy");
        else if (jsonName === "events.json") includes.push("events");
        else if (jsonName === "branding.json") includes.push("branding");
        else if (jsonName === "audit.json") includes.push("audit");
        else if (jsonName === "email-config.json") includes.push("email");
        else if (jsonName === "backup-config.json" || jsonName === "updates-state.json") includes.push("settings_ops");
      }
    }

    for (const dirName of DATA_DIRS) {
      const dirPath = path.join(dataDir, dirName);
      if (fs.existsSync(dirPath)) {
        archive.directory(dirPath, `${dirName}/`);
        includes.push(dirName === "ssl" ? "ssl" : "uploads");
      }
    }

    if (includePreviousBackups) {
      const backupDir = getBackupDir();
      if (fs.existsSync(backupDir)) {
        archive.glob("*.zip", { cwd: backupDir, ignore: [path.basename(outputPath)] }, { prefix: "backups/" });
      }
    }

    if (includeEnv) {
      const envPath = path.join(ROOT, ".env");
      if (fs.existsSync(envPath)) {
        archive.file(envPath, { name: ".env" });
        includes.push("env");
      }
    }

    const pkgPath = path.join(ROOT, "package.json");
    if (fs.existsSync(pkgPath)) {
      archive.file(pkgPath, { name: "package.json" });
    }

    const metadata = buildMetadata([...new Set(includes)]);
    archive.append(JSON.stringify(metadata, null, 2), { name: "backup-metadata.json" });

    archive.finalize();
  });

  const uniqueIncludes = [...new Set(includes)];
  const metadata = buildMetadata(uniqueIncludes);
  const stats = fs.statSync(outputPath);
  const checksum = await calculateChecksum(outputPath);
  const filename = path.basename(outputPath);

  const sidecar = {
    filename,
    size: stats.size,
    createdAt: metadata.createdAt,
    checksum,
    label: opts.label || "",
    metadata,
  };
  fs.writeFileSync(`${outputPath}.json`, JSON.stringify(sidecar, null, 2));

  return { size: stats.size, checksum, metadata: sidecar.metadata, filename };
}

/** Metadaten aus ZIP lesen (ohne vollständigen Restore). */
async function readMetadataFromZip(zipPath) {
  const tempDir = path.join(ROOT, "temp", `backup-meta-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  try {
    await safeExtractZip(zipPath, tempDir);
    const metaPath = path.join(tempDir, "backup-metadata.json");
    if (!fs.existsSync(metaPath)) throw new Error("Ungültiges Backup: Metadaten fehlen");
    return JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function metadataFromFile(_zipPath) {
  try {
    const sidecar = `${_zipPath}.json`;
    if (fs.existsSync(sidecar)) return JSON.parse(fs.readFileSync(sidecar, "utf8"));
  } catch {
    /* optional */
  }
  return null;
}

/** Backup-ZIP validieren (Metadaten; pulse.db optional bei Teil-Backups). */
async function validateBackupZip(zipPath, opts = {}) {
  const requireDatabase = opts.requireDatabase !== false;
  const tempDir = path.join(ROOT, "temp", `backup-validate-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  try {
    await safeExtractZip(zipPath, tempDir);
    const metaPath = path.join(tempDir, "backup-metadata.json");
    let metadata = null;
    if (fs.existsSync(metaPath)) {
      metadata = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    }
    const dbPath = path.join(tempDir, "pulse.db");
    const available = backupGroups.detectAvailableInDir(tempDir);
    const hasAny = Object.values(available).some(Boolean);
    if (!hasAny) throw new Error("Ungültiges Backup: keine wiederherstellbaren Daten gefunden");
    if (requireDatabase && !fs.existsSync(dbPath)) {
      throw new Error("Ungültiges Backup: Datenbank fehlt");
    }
    return {
      valid: true,
      metadata,
      createdAt: metadata?.createdAt || null,
      appVersion: metadata?.appVersion || null,
      available,
      groups: backupGroups.getGroupedCatalog(),
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * Metadaten und verfügbare Gruppen aus ZIP lesen (für Auswahl-UI / Installer).
 * @param {string} zipPath
 */
async function inspectBackupZip(zipPath) {
  const tempDir = path.join(ROOT, "temp", `backup-inspect-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  try {
    await safeExtractZip(zipPath, tempDir);
    const metaPath = path.join(tempDir, "backup-metadata.json");
    const metadata = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : null;
    const available = backupGroups.detectAvailableInDir(tempDir);
    const versionInfo = analyzeBackupVersion(metadata);
    return {
      metadata,
      available,
      groups: backupGroups.getGroupedCatalog(),
      versionInfo,
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * Backup-Version mit aktueller App-Version vergleichen.
 * @param {object|null|undefined} metadata
 */
function analyzeBackupVersion(metadata) {
  const updateService = require("./updateService");
  const backupVersion = String(metadata?.appVersion || metadata?.version || "").trim() || null;
  const currentVersion = updateService.loadPackageVersion();
  if (!backupVersion || !currentVersion) {
    return {
      backupVersion,
      currentVersion,
      status: "unknown",
      needsMigration: true,
      message: "Versionsinformation unvollständig — Migration wird vorsorglich ausgeführt.",
    };
  }
  if (backupVersion === currentVersion) {
    return {
      backupVersion,
      currentVersion,
      status: "match",
      needsMigration: false,
      message: `Version ${currentVersion} stimmt überein.`,
    };
  }
  const backupNewer = updateService.semverGt(backupVersion, currentVersion);
  return {
    backupVersion,
    currentVersion,
    status: backupNewer ? "backup_newer" : "backup_older",
    needsMigration: true,
    message: backupNewer
      ? `Backup ist neuer (${backupVersion}) als diese Installation (${currentVersion}) — Schema wird angepasst.`
      : `Backup ist älter (${backupVersion}) — Migration auf ${currentVersion}.`,
  };
}

/** Nach Restore ggf. Migrations-Skripte ausführen. */
async function applyPostRestoreMigrations(metadata) {
  const versionInfo = analyzeBackupVersion(metadata);
  if (versionInfo.needsMigration) {
    const { runDataMigrations } = require("./dataMigration");
    await runDataMigrations({ label: "backup-restore" });
    console.log("[backup]", versionInfo.message);
  }
  return versionInfo;
}

/**
 * SQLite-Tabellen aus Backup-DB in Ziel-DB übernehmen.
 * @param {string} destDb
 * @param {string} srcDb
 * @param {string[]} tables
 */
function restoreDbTables(destDb, srcDb, tables) {
  if (!tables.length || !fs.existsSync(srcDb)) return;
  fs.mkdirSync(path.dirname(destDb), { recursive: true });
  if (!fs.existsSync(destDb)) {
    fs.copyFileSync(srcDb, destDb);
    return;
  }
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(destDb);
  const srcEsc = srcDb.replace(/'/g, "''");
  db.exec(`ATTACH DATABASE '${srcEsc}' AS backup_src`);
  for (const table of tables) {
    const exists = db
      .prepare("SELECT name FROM backup_src.sqlite_master WHERE type='table' AND name=?")
      .get(table);
    if (!exists) continue;
    db.exec(`DELETE FROM main.${table}`);
    db.exec(`INSERT INTO main.${table} SELECT * FROM backup_src.${table}`);
  }
  db.exec("DETACH DATABASE backup_src");
  db.close();
  for (const wal of [`${destDb}-wal`, `${destDb}-shm`]) {
    if (fs.existsSync(wal)) fs.rmSync(wal, { force: true });
  }
}

/**
 * Aus ZIP wiederherstellen — vollständig oder gruppenweise.
 * @param {string} backupPath
 * @param {{ groups?: string[], broadcast?: boolean }} [opts]
 */
async function restoreFromBackup(backupPath, opts = {}) {
  const selection = backupGroups.resolveSelection(opts.groups);
  const tempDir = path.join(ROOT, "temp", `restore-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  restoreInProgress = true;

  try {
    if (opts.broadcast !== false) {
      hooks.broadcast?.({
        type: "server_shutdown",
        payload: {
          reason: "backup-restore",
          reconnectIn: 10,
          message: "Server stellt Backup wieder her — bitte kurz warten.",
        },
      });
      await Promise.resolve(hooks.persistSessions?.());
      await new Promise((r) => setTimeout(r, 2000));
    }

    await safeExtractZip(backupPath, tempDir);

    const metadataPath = path.join(tempDir, "backup-metadata.json");
    const metadata = fs.existsSync(metadataPath)
      ? JSON.parse(fs.readFileSync(metadataPath, "utf8"))
      : { createdAt: null, appVersion: null };
    console.log("[backup] Restore von:", metadata.createdAt, "App:", metadata.appVersion, selection.full ? "(vollständig)" : `(Gruppen: ${selection.items.map((i) => i.id).join(", ")})`);

    const dataDir = path.join(ROOT, "data");
    fs.mkdirSync(dataDir, { recursive: true });

    if (selection.full) {
      await restoreFullFromExtracted(tempDir, dataDir);
    } else {
      await restorePartialFromExtracted(tempDir, dataDir, selection);
    }

    console.log("[backup] Restore abgeschlossen");
    const versionInfo = await applyPostRestoreMigrations(metadata);
    return {
      metadata,
      groups: selection.full ? ["all"] : selection.items.map((i) => i.id),
      versionInfo,
    };
  } finally {
    restoreInProgress = false;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/** Vollständige Wiederherstellung (Legacy-Verhalten). */
async function restoreFullFromExtracted(tempDir, dataDir) {
  const dbSrc = path.join(tempDir, "pulse.db");
  if (fs.existsSync(dbSrc)) {
    const dbDest = process.env.SQLITE_PATH || path.join(dataDir, "pulse.db");
    fs.copyFileSync(dbSrc, dbDest);
    for (const wal of [`${dbDest}-wal`, `${dbDest}-shm`]) {
      if (fs.existsSync(wal)) fs.rmSync(wal, { force: true });
    }
  }

  for (const jsonName of DATA_JSON_FILES) {
    const src = path.join(tempDir, jsonName);
    const dest = path.join(dataDir, jsonName);
    if (fs.existsSync(src)) fs.copyFileSync(src, dest);
  }

  for (const dirName of DATA_DIRS) {
    const src = path.join(tempDir, dirName);
    const dest = path.join(dataDir, dirName);
    if (fs.existsSync(src)) {
      fs.rmSync(dest, { recursive: true, force: true });
      copyDirSync(src, dest);
    }
  }

  const envSrc = path.join(tempDir, ".env");
  if (fs.existsSync(envSrc)) {
    fs.copyFileSync(envSrc, path.join(ROOT, ".env"));
  }
}

/**
 * Teilweise Wiederherstellung nach ausgewählten Gruppen.
 * @param {string} tempDir
 * @param {string} dataDir
 * @param {ReturnType<typeof backupGroups.resolveSelection>} selection
 */
async function restorePartialFromExtracted(tempDir, dataDir, selection) {
  const dbSrc = path.join(tempDir, "pulse.db");
  const dbDest = process.env.SQLITE_PATH || path.join(dataDir, "pulse.db");

  if (selection.tables.length && fs.existsSync(dbSrc)) {
    restoreDbTables(dbDest, dbSrc, selection.tables);
  }

  for (const jsonName of selection.files) {
    const src = path.join(tempDir, jsonName);
    const dest = path.join(dataDir, jsonName);
    if (fs.existsSync(src)) fs.copyFileSync(src, dest);
  }

  for (const dirName of selection.dirs) {
    const src = path.join(tempDir, dirName);
    const dest = path.join(dataDir, dirName);
    if (fs.existsSync(src)) {
      fs.rmSync(dest, { recursive: true, force: true });
      copyDirSync(src, dest);
    }
  }

  if (selection.includeEnv) {
    const envSrc = path.join(tempDir, ".env");
    if (fs.existsSync(envSrc)) fs.copyFileSync(envSrc, path.join(ROOT, ".env"));
  }
}

/** Rekursives Kopieren ohne Symlink-Escape. */
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

/** Alle ZIP-Backups im Backup-Verzeichnis auflisten. */
function listBackups() {
  const dir = getBackupDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".zip"))
    .map((filename) => {
      const filePath = path.join(dir, filename);
      const stat = fs.statSync(filePath);
      const sidecar = metadataFromFile(filePath);
      return {
        filename,
        size: sidecar?.size ?? stat.size,
        createdAt: sidecar?.createdAt ?? stat.mtime.toISOString(),
        checksum: sidecar?.checksum || "",
        label: sidecar?.label || "",
        metadata: sidecar?.metadata || null,
      };
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Alte Backups nach Aufbewahrungsfrist löschen. */
function cleanupOldBackups(daysToKeep) {
  const dir = getBackupDir();
  if (!fs.existsSync(dir)) return 0;
  const maxAge = daysToKeep * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let removed = 0;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".zip")) continue;
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (now - stat.mtimeMs > maxAge) {
      fs.rmSync(filePath, { force: true });
      fs.rmSync(`${filePath}.json`, { force: true });
      removed += 1;
      console.log("[backup] Altes Backup gelöscht:", file);
    }
  }
  return removed;
}

/** Timestamp-Dateiname für neues Backup. */
function newBackupFilename(prefix = "backup") {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${ts}.zip`;
}

/** Vollständiger Backup-Lauf inkl. Aufräumen. */
async function runBackupJob(prefix = "backup") {
  const dir = getBackupDir();
  const filename = newBackupFilename(prefix);
  const outputPath = path.join(dir, filename);
  const result = await createBackupZip(outputPath);
  const config = getConfig();
  cleanupOldBackups(config.retentionDays);
  return result;
}

module.exports = {
  setHooks,
  isRestoreInProgress,
  getBackupDir,
  getConfig,
  saveConfig,
  safeBackupFilename,
  calculateChecksum,
  createBackupZip,
  validateBackupZip,
  inspectBackupZip,
  readMetadataFromZip,
  restoreFromBackup,
  restoreDbTables,
  analyzeBackupVersion,
  applyPostRestoreMigrations,
  listBackups,
  cleanupOldBackups,
  runBackupJob,
  newBackupFilename,
  ROOT,
};
