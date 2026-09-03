/**
 * Persistente E-Mail-Konfiguration (SMTP, Sendmail oder deaktiviert).
 * Gespeichert in data/email-config.json — Passwörter nur lokal, Datei chmod 600 empfohlen.
 */

const fs = require("fs");
const path = require("path");

const CONFIG_NAME = "email-config.json";

/** @typedef {'smtp'|'sendmail'|'none'} EmailProvider */

/**
 * Standard-Konfiguration — ohne SMTP aus .env: kein Versand bis Admin konfiguriert.
 * @returns {object}
 */
function defaultConfig() {
  return {
    provider: "none",
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpPass: "",
    smtpTls: "starttls",
    smtpSecure: false,
    from: "",
    fromName: "Team Townhall",
    sendmailPath: "/usr/bin/sendmail",
    sendmailFrom: "",
    updatedAt: 0,
  };
}

/**
 * Pfad zur Konfigurationsdatei.
 * @returns {string}
 */
function configPath() {
  const dataDir = process.env.SQLITE_PATH
    ? path.dirname(process.env.SQLITE_PATH)
    : path.join(process.cwd(), "data");
  return path.join(dataDir, CONFIG_NAME);
}

/**
 * Konfiguration laden; fehlende Datei → Defaults (Env-SMTP wird in emailService gemerged).
 * @returns {object}
 */
function load() {
  const file = configPath();
  try {
    if (!fs.existsSync(file)) return defaultConfig();
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return { ...defaultConfig(), ...raw };
  } catch (err) {
    console.warn("[email-config] Lesen fehlgeschlagen:", err.message);
    return defaultConfig();
  }
}

/**
 * Konfiguration speichern.
 * @param {object} patch
 * @returns {object}
 */
function save(patch) {
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const cur = load();
  const next = {
    ...cur,
    ...patch,
    provider: sanitizeProvider(patch.provider ?? cur.provider),
    smtpPort: Number(patch.smtpPort ?? cur.smtpPort) || 587,
    updatedAt: Date.now(),
  };
  if (patch.smtpPass === "" || patch.smtpPass == null) {
    next.smtpPass = cur.smtpPass || "";
  }
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* ignore */
  }
  return next;
}

/**
 * Öffentliche Ansicht ohne Klartext-Passwort.
 * @param {object} cfg
 * @returns {object}
 */
function publicConfig(cfg) {
  const c = cfg || load();
  return {
    provider: c.provider,
    smtpHost: c.smtpHost || "",
    smtpPort: c.smtpPort || 587,
    smtpUser: c.smtpUser || "",
    smtpPassSet: Boolean(c.smtpPass),
    smtpTls: c.smtpTls || "starttls",
    smtpSecure: Boolean(c.smtpSecure),
    from: c.from || "",
    fromName: c.fromName || "Team Townhall",
    sendmailPath: c.sendmailPath || "/usr/bin/sendmail",
    sendmailFrom: c.sendmailFrom || "",
    updatedAt: c.updatedAt || 0,
  };
}

/**
 * @param {string} p
 * @returns {EmailProvider}
 */
function sanitizeProvider(p) {
  const v = String(p || "none").toLowerCase();
  if (v === "smtp" || v === "sendmail" || v === "none") return v;
  return "none";
}

module.exports = { load, save, publicConfig, defaultConfig, configPath, sanitizeProvider };
