#!/usr/bin/env node
/**
 * Pulse-Instanzdiagnose ohne Secrets — Version, DB, Auth, Redis, Backup, Speicher.
 * Aufruf: npm run pulse:diagnose
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

/** .env laden, ohne Werte auszugeben. */
function loadEnvQuiet() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return { envPath, loaded: false };
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && process.env[m[1]] == null) process.env[m[1]] = m[2];
  }
  return { envPath, loaded: true };
}

/** Git-Commit kurz (optional). */
function gitCommitShort() {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/** Docker-Compose-Status ohne Container-Logs. */
function dockerStatus() {
  try {
    const out = execSync("docker compose ps --format json", { cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    const lines = out.trim().split("\n").filter(Boolean);
    return lines.map((line) => {
      try {
        const j = JSON.parse(line);
        return { name: j.Name || j.Service, state: j.State, health: j.Health || null };
      } catch {
        return { raw: line };
      }
    });
  } catch {
    return { available: false, reason: "docker compose nicht verfügbar oder kein Stack" };
  }
}

/** Letztes Backup-Verzeichnis (Zeitstempel). */
function lastBackupInfo() {
  const dirs = [
    path.join(ROOT, "backups"),
    path.join(ROOT, "data", "backups"),
    process.env.BACKUP_DIR ? path.join(ROOT, process.env.BACKUP_DIR) : null,
  ].filter(Boolean);
  let latest = null;
  for (const base of dirs) {
    if (!fs.existsSync(base)) continue;
    for (const name of fs.readdirSync(base)) {
      const full = path.join(base, name);
      try {
        const st = fs.statSync(full);
        if (!st.isDirectory()) continue;
        if (!latest || st.mtimeMs > latest.mtimeMs) {
          latest = { dir: full, mtime: st.mtime.toISOString(), name };
        }
      } catch {
        /* überspringen */
      }
    }
  }
  return latest;
}

/** Freier Speicher auf dem Daten-Volume (Schätzung). */
function diskFreeForData() {
  try {
    const dataDir = path.join(ROOT, "data");
    if (!fs.existsSync(dataDir)) return null;
    if (process.platform === "win32") return null;
    const out = execSync(`df -k "${dataDir}" 2>/dev/null | tail -1`, { encoding: "utf8" }).trim();
    const parts = out.split(/\s+/);
    if (parts.length >= 4) {
      const availKb = Number(parts[3]);
      return { path: dataDir, freeMb: Math.round(availKb / 1024) };
    }
  } catch {
    /* df nicht verfügbar */
  }
  return null;
}

/** Redis-Erreichbarkeit (Ping). */
async function redisPing() {
  const url = process.env.REDIS_URL || "";
  if (!url) return { configured: false, ok: false, mode: "in-process" };
  try {
    const { createBus } = require("../lib/bus");
    const bus = createBus();
    const p = await bus.ping();
    return { configured: true, ok: p.mode === "redis" || p.mode === "in-process", mode: p.mode };
  } catch (err) {
    return { configured: true, ok: false, error: err.message };
  }
}

/** HTTPS/SSL-Metadaten ohne Schlüssel. */
function sslInfo() {
  const sslDir = process.env.SSL_DIR || path.join(ROOT, "data", "ssl");
  const exists = fs.existsSync(sslDir);
  let domainCount = 0;
  if (exists) {
    try {
      domainCount = fs.readdirSync(sslDir).filter((n) => {
        try {
          return fs.statSync(path.join(sslDir, n)).isDirectory();
        } catch {
          return false;
        }
      }).length;
    } catch {
      /* ignore */
    }
  }
  return {
    sslDir,
    sslDirExists: exists,
    domainDirs: domainCount,
    httpsPort: process.env.HTTPS_PORT || "3443",
    cookieSecureEnv: process.env.AUTH_COOKIE_SECURE || "(auto)",
  };
}

/** Tabellen funktionsfähig (Probe über userDb-API). */
async function dbTableCheck(userDb) {
  const required = ["users", "auth_settings", "auth_sessions"];
  if (!userDb.supported) {
    return { checked: false, required, found: [], complete: false };
  }
  try {
    await Promise.resolve(userDb.listUsers({ limit: 1 }));
    return { checked: true, required, found: required, complete: true, probe: "listUsers" };
  } catch (err) {
    return { checked: true, required, found: [], complete: false, error: err.message };
  }
}

(async () => {
  loadEnvQuiet();
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

  const { createUserDb } = require("../lib/userDb");
  const userService = require("../lib/userService");
  const emailService = require("../lib/emailService");
  const { bootstrapCredentials } = require("../lib/bootstrapAdmin");

  const userDb = createUserDb();
  const creds = bootstrapCredentials();
  const tables = await dbTableCheck(userDb);

  let userCount = 0;
  let adminCount = 0;
  let needsBootstrap = true;
  let bootstrapPasswordLogin = false;
  let passwordLoginMode = false;
  let pinLoginAvailable = false;

  if (userDb.supported) {
    const users = await Promise.resolve(userDb.listUsers({}));
    userCount = users.length;
    adminCount = await userService.countAdmins(userDb);
    needsBootstrap = adminCount === 0;
    bootstrapPasswordLogin = await userService.isBootstrapPasswordLogin(userDb);
    passwordLoginMode = await userService.isPasswordLoginMode(userDb);
    pinLoginAvailable = emailService.canSendPin() && !bootstrapPasswordLogin;
  }

  const redis = await redisPing();
  const backup = lastBackupInfo();

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    pulse: {
      version: pkg.version,
      gitCommit: gitCommitShort(),
      nodeVersion: process.version,
      nodeEnv: process.env.NODE_ENV || "development",
      hostname: os.hostname(),
    },
    paths: {
      cwd: ROOT,
      sqlitePath: process.env.SQLITE_PATH || path.join(ROOT, "data", "pulse.db"),
      databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
      dataDirExists: fs.existsSync(path.join(ROOT, "data")),
    },
    docker: dockerStatus(),
    database: {
      supported: Boolean(userDb.supported),
      kind: userDb.kind || "unknown",
      tables,
      userCount,
      adminCount,
    },
    auth: {
      userManagementEnabled: userDb.supported ? userService.isUserManagementEnabled(userDb) : false,
      needsBootstrap,
      bootstrapPasswordLogin,
      passwordLoginMode,
      pinLoginAvailable,
      bootstrapEnv: {
        emailConfigured: creds.email.includes("@"),
        passwordConfigured: creds.envPasswordSet,
        credentialsValid: creds.valid,
      },
    },
    email: emailService.healthInfo(),
    ssl: sslInfo(),
    redis,
    backup: backup
      ? { lastDir: backup.name, lastAt: backup.mtime, path: backup.dir }
      : { lastDir: null, lastAt: null },
    disk: diskFreeForData(),
    hints: [],
  };

  if (!userDb.supported) {
    report.ok = false;
    report.hints.push("Keine unterstützte Benutzer-DB — Login nicht verfügbar.");
  }
  if (tables.checked && !tables.complete) {
    report.ok = false;
    report.hints.push("Auth-Tabellen unvollständig — App neu starten oder Migration prüfen.");
  }
  if (needsBootstrap && !creds.valid) {
    report.ok = false;
    report.hints.push("Kein Admin und ungültige Bootstrap-.env — Installer oder admin:reset.");
  }
  if (redis.configured && !redis.ok) {
    report.ok = false;
    report.hints.push("REDIS_URL gesetzt, aber Redis nicht erreichbar — Multi-Container-Sync gefährdet.");
  }
  if (!backup) {
    report.hints.push("Kein Backup-Verzeichnis gefunden — vor Update manuell sichern.");
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
})().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
