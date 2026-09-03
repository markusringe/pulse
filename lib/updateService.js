/**
 * Automatische Updates über GitHub Releases.
 * Prüft semantische Versionen, cached Ergebnisse und führt sichere Installation mit Backup aus.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
const STATE_FILE = path.join(ROOT, "data", "updates-state.json");
const PACKAGE_FILE = path.join(ROOT, "package.json");
const GITHUB_API = "https://api.github.com";
const CACHE_MS = 60 * 60 * 1000;
const DEFAULT_REPO = "markusringe/pulse";
const DEFAULT_INTERVAL = 86400;

/** @type {((event: string, payload: object) => void) | null} */
let progressSink = null;

/** Laufende Installation — nur eine gleichzeitig. */
let installLock = false;

/** Geplanter Neustart nach Update. */
let shutdownHook = null;

/**
 * SemVer aus package.json oder Release-Tag (v1.2.3).
 * @param {string} raw
 * @returns {{ major: number, minor: number, patch: number, label: string } | null}
 */
function parseSemver(raw) {
  const m = String(raw || "")
    .trim()
    .replace(/^v/i, "")
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], label: `${m[1]}.${m[2]}.${m[3]}` };
}

/**
 * true wenn a > b (SemVer).
 * @param {string} a
 * @param {string} b
 */
function semverGt(a, b) {
  const va = parseSemver(a);
  const vb = parseSemver(b);
  if (!va || !vb) return false;
  if (va.major !== vb.major) return va.major > vb.major;
  if (va.minor !== vb.minor) return va.minor > vb.minor;
  return va.patch > vb.patch;
}

function envBool(name, fallback) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return fallback;
  return !/^(0|false|off|no|disabled)$/i.test(String(raw).trim());
}

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Konfiguriertes Repository owner/repo — nur dieses darf Updates liefern. */
function configuredRepo() {
  const fromEnv = String(process.env.UPDATE_REPO || "").trim();
  if (fromEnv && /^\w[\w.-]*\/[\w.-]+$/.test(fromEnv)) return fromEnv;
  return "";
}

/** Anzeige-Hinweis wenn UPDATE_REPO noch nicht gesetzt ist. */
function defaultRepoHint() {
  return DEFAULT_REPO;
}

function updatesEnabled() {
  if (!configuredRepo()) return false;
  return envBool("UPDATE_ENABLED", true);
}

function loadPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_FILE, "utf8"));
    return String(pkg.version || "0.0.0");
  } catch {
    return "0.0.0";
  }
}

function defaultState() {
  return {
    lastCheckAt: null,
    cachedInfo: null,
    config: {
      enabled: updatesEnabled(),
      checkIntervalSec: envInt("UPDATE_CHECK_INTERVAL", DEFAULT_INTERVAL),
      allowPrerelease: envBool("UPDATE_ALLOW_PRERELEASE", false),
      autoInstall: envBool("UPDATE_AUTO_INSTALL", false),
      repo: configuredRepo() || defaultRepoHint(),
    },
    status: { phase: "idle", progress: 0, message: "", error: "" },
    history: [],
    pendingRestart: null,
  };
}

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return { ...defaultState(), ...raw, config: { ...defaultState().config, ...(raw.config || {}) } };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * GitHub-Request mit optionalem Token und Retry.
 * @param {string} urlPath
 * @param {number} [retries]
 */
async function githubFetch(urlPath, retries = 3) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "pulse-update-service",
  };
  const token = String(process.env.GITHUB_TOKEN || "").trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  let lastErr = null;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${GITHUB_API}${urlPath}`, { headers });
      if (res.status === 403 && i < retries - 1) {
        await sleep(1000 * 2 ** i);
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`GitHub ${res.status}: ${body.slice(0, 200)}`);
      }
      return res.json();
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) await sleep(1000 * 2 ** i);
    }
  }
  throw lastErr || new Error("GitHub nicht erreichbar");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Release-Datensatz in UpdateInfo umwandeln.
 * @param {object} release
 * @param {string} currentVersion
 * @param {boolean} allowPrerelease
 */
function mapRelease(release, currentVersion, allowPrerelease) {
  const tag = String(release.tag_name || "");
  const latestVersion = parseSemver(tag)?.label || tag.replace(/^v/i, "");
  const isPrerelease = Boolean(release.prerelease);
  const isDraft = Boolean(release.draft);
  if (isDraft) return null;
  if (isPrerelease && !allowPrerelease) return null;

  const [owner, repo] = configuredRepo().split("/");
  const critical = /security|kritisch|critical|CVE/i.test(String(release.body || ""));

  return {
    currentVersion,
    latestVersion,
    hasUpdate: semverGt(latestVersion, currentVersion),
    isPrerelease,
    releaseUrl: release.html_url || `https://github.com/${owner}/${repo}/releases/tag/${tag}`,
    publishedAt: release.published_at || release.created_at || null,
    releaseNotes: String(release.body || "_Keine Release-Notes._"),
    critical,
    downloadUrl: release.tarball_url || `https://api.github.com/repos/${owner}/${repo}/tarball/${tag}`,
    tagName: tag,
  };
}

/**
 * Neuestes passendes Release von GitHub laden.
 * @param {boolean} allowPrerelease
 */
async function fetchLatestRelease(allowPrerelease) {
  const repo = configuredRepo();
  if (!/^\w[\w.-]*\/[\w.-]+$/.test(repo)) {
    throw new Error("UPDATE_REPO ungültig");
  }
  const data = await githubFetch(`/repos/${repo}/releases/latest`);
  const current = loadPackageVersion();
  const info = mapRelease(data, current, allowPrerelease);
  if (!info) {
    return {
      currentVersion: current,
      latestVersion: current,
      hasUpdate: false,
      isPrerelease: false,
      releaseUrl: "",
      publishedAt: null,
      releaseNotes: "",
      critical: false,
      downloadUrl: "",
      tagName: "",
    };
  }
  return info;
}

/**
 * Prüft GitHub auf Updates (mit Cache).
 * @param {{ force?: boolean, allowPrerelease?: boolean }} [opts]
 */
async function checkForUpdates(opts = {}) {
  const state = loadState();
  if (!updatesEnabled() && !opts.force) {
    return {
      ...emptyInfo(),
      disabled: true,
      message: "Updates deaktiviert (UPDATE_REPO / UPDATE_ENABLED)",
    };
  }

  const allowPrerelease = opts.allowPrerelease ?? state.config.allowPrerelease;
  const now = Date.now();
  if (
    !opts.force &&
    state.cachedInfo &&
    state.lastCheckAt &&
    now - Date.parse(state.lastCheckAt) < CACHE_MS
  ) {
    return { ...state.cachedInfo, cached: true, lastCheckAt: state.lastCheckAt };
  }

  const info = await fetchLatestRelease(allowPrerelease);
  state.cachedInfo = info;
  state.lastCheckAt = new Date().toISOString();
  saveState(state);
  return { ...info, cached: false, lastCheckAt: state.lastCheckAt };
}

function emptyInfo() {
  const v = loadPackageVersion();
  return {
    currentVersion: v,
    latestVersion: v,
    hasUpdate: false,
    isPrerelease: false,
    releaseUrl: "",
    publishedAt: null,
    releaseNotes: "",
    critical: false,
    downloadUrl: "",
    tagName: "",
  };
}

function getCachedInfo() {
  const state = loadState();
  return {
    info: state.cachedInfo || emptyInfo(),
    lastCheckAt: state.lastCheckAt,
    config: getPublicConfig(state.config),
    enabled: updatesEnabled(),
  };
}

function getPublicConfig(cfg) {
  return {
    enabled: cfg.enabled !== false && updatesEnabled(),
    checkIntervalSec: cfg.checkIntervalSec || envInt("UPDATE_CHECK_INTERVAL", DEFAULT_INTERVAL),
    allowPrerelease: Boolean(cfg.allowPrerelease),
    autoInstall: Boolean(cfg.autoInstall),
    repo: configuredRepo() || defaultRepoHint(),
  };
}

function getConfig() {
  return getPublicConfig(loadState().config);
}

/**
 * Admin-Einstellungen speichern (Persistenz in data/updates-state.json).
 * @param {object} patch
 */
function saveConfig(patch) {
  const state = loadState();
  if (patch.enabled != null) state.config.enabled = Boolean(patch.enabled);
  if (patch.checkIntervalSec != null) {
    const sec = Number(patch.checkIntervalSec);
    if ([21600, 43200, 86400, 172800, 604800].includes(sec)) state.config.checkIntervalSec = sec;
  }
  if (patch.allowPrerelease != null) state.config.allowPrerelease = Boolean(patch.allowPrerelease);
  if (patch.autoInstall != null) state.config.autoInstall = Boolean(patch.autoInstall);
  if (patch.repo != null) {
    const r = String(patch.repo).trim();
    if (/^\w[\w.-]*\/[\w.-]+$/.test(r) && r === configuredRepo()) {
      state.config.repo = r;
    }
  }
  saveState(state);
  return getPublicConfig(state.config);
}

function getStatus() {
  const state = loadState();
  return { ...state.status, history: state.history.slice(-10).reverse() };
}

function emit(event, payload = {}) {
  if (typeof progressSink === "function") progressSink(event, payload);
}

function setProgress(state, phase, progress, message, error = "") {
  state.status = { phase, progress, message, error };
  saveState(state);
  emit(`update_${phase === "completed" ? "completed" : phase === "failed" ? "failed" : "progress"}`, {
    phase,
    progress,
    message,
    error,
  });
}

/**
 * Rekursives Kopieren (ohne Symlinks nach außen).
 * @param {string} src
 * @param {string} dest
 * @param {string[]} skipDirs
 */
function copyDirSync(src, dest, skipDirs = ["node_modules", ".git", "backups", "temp"]) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (skipDirs.includes(name)) continue;
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDirSync(s, d, skipDirs);
    else fs.copyFileSync(s, d);
  }
}

/**
 * Backup vor Installation: data/, .env, package-Dateien.
 * @returns {string} backupDir
 */
function createBackup() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupRoot = path.join(ROOT, process.env.UPDATE_BACKUP_DIR || "backups");
  const backupDir = path.join(backupRoot, `update-${ts}`);
  fs.mkdirSync(backupDir, { recursive: true });

  const dataSrc = path.join(ROOT, "data");
  if (fs.existsSync(dataSrc)) copyDirSync(dataSrc, path.join(backupDir, "data"), []);

  for (const f of [".env", "package.json", "package-lock.json"]) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(backupDir, f));
  }

  pruneBackups(backupRoot, envInt("UPDATE_MAX_BACKUPS", 10));
  return backupDir;
}

function pruneBackups(backupRoot, max) {
  if (!fs.existsSync(backupRoot)) return;
  const dirs = fs
    .readdirSync(backupRoot)
    .filter((n) => n.startsWith("update-"))
    .map((n) => ({ n, t: fs.statSync(path.join(backupRoot, n)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const d of dirs.slice(max)) {
    fs.rmSync(path.join(backupRoot, d.n), { recursive: true, force: true });
  }
}

async function runGitUpdate(tagName) {
  const gitDir = path.join(ROOT, ".git");
  if (!fs.existsSync(gitDir)) return false;
  await execFileAsync("git", ["fetch", "--tags", "origin"], { cwd: ROOT, timeout: 120000 });
  await execFileAsync("git", ["checkout", tagName], { cwd: ROOT, timeout: 60000 });
  return true;
}

async function runTarballUpdate(downloadUrl, tagName) {
  const tempRoot = path.join(ROOT, "temp", `update-${Date.now()}`);
  fs.mkdirSync(tempRoot, { recursive: true });
  const tarPath = path.join(tempRoot, "release.tar.gz");

  const headers = { "User-Agent": "pulse-update-service" };
  const token = String(process.env.GITHUB_TOKEN || "").trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(downloadUrl, { headers, redirect: "follow" });
  if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(tarPath, buf);

  await execFileAsync("tar", ["-xzf", tarPath, "-C", tempRoot], { timeout: 180000 });
  const extracted = fs.readdirSync(tempRoot).find((n) => n !== "release.tar.gz" && fs.statSync(path.join(tempRoot, n)).isDirectory());
  if (!extracted) throw new Error("Archiv leer oder ungültig");

  const src = path.join(tempRoot, extracted);
  copyDirSync(src, ROOT, ["node_modules", ".git", "data", "backups", "temp"]);
  fs.rmSync(tempRoot, { recursive: true, force: true });
  return true;
}

async function runMigrations() {
  const migrationsDir = path.join(ROOT, "migrations");
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      /* SQL-Migrationen: nur protokollieren — DB-Layer ist projektspezifisch. */
      console.log("[update] Migration gefunden:", f);
    }
  }
  const migrateEvents = path.join(ROOT, "scripts", "migrate-events.js");
  if (fs.existsSync(migrateEvents)) {
    await execFileAsync(process.execPath, [migrateEvents], { cwd: ROOT, timeout: 120000 });
  }
}

/**
 * Update installieren (async, mit Fortschritt).
 * @param {{ userId?: string, ip?: string, tagName?: string }} meta
 */
async function installUpdate(meta = {}) {
  if (installLock) throw new Error("Installation läuft bereits");
  installLock = true;
  const state = loadState();
  const started = Date.now();
  const fromVersion = loadPackageVersion();
  let backupDir = "";

  emit("update_started", { fromVersion });

  try {
    setProgress(state, "pending", 5, "Backup wird erstellt…");
    backupDir = createBackup();
    setProgress(state, "downloading", 20, "Update wird heruntergeladen…");

    const info = state.cachedInfo || (await checkForUpdates({ force: true }));
    const tag = meta.tagName || info.tagName;
    if (!tag) throw new Error("Kein Release-Tag verfügbar");

    const repo = configuredRepo();
    const release = await githubFetch(`/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`);
    if (release.draft) throw new Error("Draft-Releases sind nicht erlaubt");
    if (String(release.target_commitish || "").includes("/") && release.target_commitish !== repo.split("/")[1]) {
      /* Nur warnen — target_commitish ist meist branch name */
    }

    const usedGit = await runGitUpdate(tag).catch(() => false);
    if (!usedGit) {
      await runTarballUpdate(release.tarball_url || info.downloadUrl, tag);
    }

    setProgress(state, "installing", 55, "Abhängigkeiten werden installiert…");
    /* .env und data/ nach Code-Update wiederherstellen */
    if (fs.existsSync(path.join(backupDir, ".env"))) {
      fs.copyFileSync(path.join(backupDir, ".env"), path.join(ROOT, ".env"));
    }
    if (fs.existsSync(path.join(backupDir, "data"))) {
      copyDirSync(path.join(backupDir, "data"), path.join(ROOT, "data"), []);
    }

    await execFileAsync("npm", ["install", "--omit=dev"], { cwd: ROOT, timeout: 300000 });

    setProgress(state, "installing", 75, "Datenbank-Migrationen…");
    await runMigrations();

    const toVersion = loadPackageVersion();
    const entry = {
      id: crypto.randomBytes(8).toString("hex"),
      at: new Date().toISOString(),
      fromVersion,
      toVersion,
      tagName: tag,
      status: "success",
      durationMs: Date.now() - started,
      backupDir,
      userId: meta.userId || "",
    };
    state.history.push(entry);
    state.pendingRestart = { at: entry.at, fromVersion, toVersion, backupDir };
    setProgress(state, "completed", 100, "Update abgeschlossen — Server startet neu…");
    saveState(state);
    emit("update_completed", { fromVersion, toVersion, backupDir });

    return { ok: true, fromVersion, toVersion, backupDir, entry };
  } catch (err) {
    setProgress(state, "failed", 0, "Installation fehlgeschlagen", String(err.message || err));
    const entry = {
      id: crypto.randomBytes(8).toString("hex"),
      at: new Date().toISOString(),
      fromVersion,
      toVersion: fromVersion,
      tagName: meta.tagName || "",
      status: "failed",
      durationMs: Date.now() - started,
      backupDir,
      error: String(err.message || err),
      userId: meta.userId || "",
    };
    state.history.push(entry);
    saveState(state);
    emit("update_failed", { error: entry.error, backupDir });
    if (backupDir) {
      try {
        await rollbackBackup(backupDir);
        emit("update_rollback", { backupDir });
      } catch (rbErr) {
        console.error("[update-rollback]", rbErr);
      }
    }
    throw err;
  } finally {
    installLock = false;
  }
}

/**
 * Backup-Verzeichnis wiederherstellen.
 * @param {string} backupDir
 */
async function rollbackBackup(backupDir) {
  if (!backupDir || !fs.existsSync(backupDir)) throw new Error("Backup nicht gefunden");
  if (fs.existsSync(path.join(backupDir, "data"))) {
    copyDirSync(path.join(backupDir, "data"), path.join(ROOT, "data"), []);
  }
  for (const f of [".env", "package.json", "package-lock.json"]) {
    const p = path.join(backupDir, f);
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(ROOT, f));
  }
  await execFileAsync("npm", ["install", "--omit=dev"], { cwd: ROOT, timeout: 300000 });
}

/**
 * Rollback per History-ID (max. 7 Tage).
 * @param {string} historyId
 */
async function rollbackById(historyId) {
  const state = loadState();
  const entry = state.history.find((h) => h.id === historyId && h.backupDir);
  if (!entry) throw new Error("Eintrag nicht gefunden");
  const age = Date.now() - Date.parse(entry.at);
  if (age > 7 * 24 * 60 * 60 * 1000) throw new Error("Backup älter als 7 Tage");
  await rollbackBackup(entry.backupDir);
  entry.status = "rolled_back";
  entry.rolledBackAt = new Date().toISOString();
  saveState(state);
  return entry;
}

function registerProgressSink(fn) {
  progressSink = fn;
}

function registerShutdownHook(fn) {
  shutdownHook = fn;
}

async function requestGracefulRestart(reason = "update") {
  if (typeof shutdownHook === "function") {
    await shutdownHook(reason);
  } else {
    process.exit(0);
  }
}

/** Beim Serverstart: automatische Prüfung und ggf. Auto-Install kritischer Updates. */
async function onServerBoot() {
  const state = loadState();
  if (state.pendingRestart) {
    state.pendingRestart = null;
    state.status = { phase: "idle", progress: 0, message: "", error: "" };
    saveState(state);
  }
  if (!updatesEnabled()) return;
  const cfg = state.config;
  if (cfg.enabled === false) return;
  try {
    const info = await checkForUpdates({ force: true, allowPrerelease: cfg.allowPrerelease });
    if (cfg.autoInstall && info.hasUpdate && info.critical) {
      console.log("[update] Kritisches Update — Auto-Install (konfiguriert)");
      await installUpdate({ userId: "system" });
      await requestGracefulRestart("auto-update");
    }
  } catch (err) {
    console.error("[update-check]", err.message || err);
  }
}

let checkTimer = null;

function startBackgroundChecks() {
  if (checkTimer) clearInterval(checkTimer);
  if (!updatesEnabled()) return;
  const state = loadState();
  const intervalMs = (state.config.checkIntervalSec || DEFAULT_INTERVAL) * 1000;
  checkTimer = setInterval(() => {
    checkForUpdates({ force: false }).catch((err) => console.error("[update-check]", err.message || err));
  }, intervalMs);
}

module.exports = {
  parseSemver,
  semverGt,
  configuredRepo,
  updatesEnabled,
  loadPackageVersion,
  checkForUpdates,
  getCachedInfo,
  getConfig,
  saveConfig,
  getStatus,
  installUpdate,
  rollbackById,
  registerProgressSink,
  registerShutdownHook,
  requestGracefulRestart,
  onServerBoot,
  startBackgroundChecks,
};
