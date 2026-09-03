/**
 * Sendmail/MTA für PIN-E-Mails: Verfügbarkeit prüfen, bei Bedarf installieren (root),
 * lokal absichern und Pulse standardmäßig auf Sendmail-Versand umstellen.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile, spawn } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const SENDMAIL_PATHS = ["/usr/sbin/sendmail", "/usr/bin/sendmail", "/usr/lib/sendmail/sendmail"];

/**
 * Sendmail-Binary auf dem System suchen.
 * @returns {string|null}
 */
function findSendmailBinary() {
  for (const p of SENDMAIL_PATHS) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function isRoot() {
  try {
    return typeof process.getuid === "function" && process.getuid() === 0;
  } catch {
    return false;
  }
}

function dataDir() {
  return process.env.SQLITE_PATH
    ? path.dirname(process.env.SQLITE_PATH)
    : path.join(process.cwd(), "data");
}

/**
 * Standard-Absender aus Umgebung / Domain ableiten.
 * @returns {{ from: string, fromName: string }}
 */
function resolveDefaultFrom() {
  const fromEnv = String(process.env.SMTP_FROM || process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim();
  const domain = String(process.env.DOMAIN || "").trim().toLowerCase();
  const host = os.hostname().replace(/[^a-z0-9.-]/gi, "").toLowerCase() || "localhost";
  let from = fromEnv;
  if (!from || !from.includes("@")) {
    from = domain ? `noreply@${domain}` : `noreply@${host}.local`;
  }
  const fromName = String(process.env.SMTP_FROM_NAME || process.env.BOOTSTRAP_ADMIN_NAME || "Pulse").trim();
  return { from, fromName: fromName || "Pulse" };
}

/**
 * msmtp-Konfiguration in data/ — nur localhost-Relay, kein offener Versand ohne Relay.
 * @param {string} from
 */
function writeMsmtpConfig(from) {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const cfgPath = path.join(dir, "msmtp.rc");
  const logPath = path.join(dir, "msmtp.log");
  const content = `# Pulse — msmtp (Sendmail-kompatibel), nur lokaler Versand / kein offenes Relay
defaults
auth           off
tls            on
tls_trust_file /etc/ssl/certs/ca-certificates.crt
logfile        ${logPath}
syslog         off

account        local
host           127.0.0.1
port           25
from           ${from}

account default : local
`;
  fs.writeFileSync(cfgPath, content, { mode: 0o600 });
  try {
    fs.chmodSync(cfgPath, 0o600);
  } catch {
    /* ignore */
  }
  if (process.env.HOME) {
    const userRc = path.join(process.env.HOME, ".msmtprc");
    try {
      if (!fs.existsSync(userRc)) fs.symlinkSync(cfgPath, userRc);
    } catch {
      /* Container ohne Schreibrecht auf $HOME — msmtp nutzt -C in sendmailSetup nicht nötig wenn msmtp-mta */
    }
  }
  return cfgPath;
}

/**
 * Postfix nur auf localhost binden — kein offenes Relay von außen, Versand nach außen weiterhin möglich.
 */
async function securePostfixLocalOnly() {
  if (!isRoot()) return false;
  try {
    await execFileAsync("postconf", ["-e", "inet_interfaces=loopback-only"], { timeout: 30000 });
    await execFileAsync("postconf", ["-e", "mynetworks=127.0.0.0/8 [::1]/128"], { timeout: 30000 });
    await execFileAsync("postconf", ["-e", "mydestination=localhost, $myhostname"], { timeout: 30000 });
    await execFileAsync("postconf", [
      "-e",
      "smtpd_relay_restrictions=permit_mynetworks,reject_unauth_destination",
    ], { timeout: 30000 });
    await execFileAsync("postconf", ["-e", "smtpd_recipient_restrictions=permit_mynetworks,reject"], {
      timeout: 30000,
    });
    await execFileAsync("systemctl", ["enable", "postfix"], { timeout: 30000 }).catch(() => {});
    await execFileAsync("systemctl", ["restart", "postfix"], { timeout: 60000 }).catch(() => {});
    return true;
  } catch (err) {
    console.warn("[sendmail] Postfix-Absicherung fehlgeschlagen:", err.message || err);
    return false;
  }
}

/**
 * Debian/Ubuntu: Postfix-Debconf vorab setzen (noninteractive).
 */
async function setPostfixDebconfSelections() {
  const lines = [
    "postfix postfix/mailname string localhost",
    /* „Internet Site“ — externe PIN-E-Mails; Absicherung erfolgt über loopback-only + mynetworks */
    "postfix postfix/main_mailer_type select Internet Site",
  ].join("\n");
  await new Promise((resolve, reject) => {
    const child = spawn("debconf-set-selections", [], { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.stdin.write(`${lines}\n`);
    child.stdin.end();
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `debconf-set-selections exit ${code}`));
    });
  });
}

/**
 * Sendmail/MTA per Paketmanager installieren (nur als root).
 * @returns {Promise<{ ok: boolean, path?: string, reason?: string }>}
 */
async function installSendmailPackage() {
  if (!isRoot()) {
    return { ok: false, reason: "not_root" };
  }
  const existing = findSendmailBinary();
  if (existing) return { ok: true, path: existing };

  try {
    if (fs.existsSync("/etc/debian_version")) {
      await execFileAsync("apt-get", ["update", "-qq"], { timeout: 120000 });
      await setPostfixDebconfSelections().catch((err) => {
        console.warn("[sendmail] debconf-set-selections:", err.message || err);
      });
      await execFileAsync(
        "apt-get",
        ["install", "-y", "-qq", "postfix", "libsasl2-modules"],
        { timeout: 300000, env: { ...process.env, DEBIAN_FRONTEND: "noninteractive" } }
      );
      await securePostfixLocalOnly();
    } else if (fs.existsSync("/etc/alpine-release")) {
      await execFileAsync("apk", ["add", "--no-cache", "postfix"], { timeout: 180000 });
      await securePostfixLocalOnly();
      await execFileAsync("postfix", ["start"], { timeout: 30000 }).catch(() => {});
    } else {
      return { ok: false, reason: "unsupported_os" };
    }
  } catch (err) {
    console.warn("[sendmail] Paketinstallation fehlgeschlagen:", err.message || err);
    return { ok: false, reason: String(err.message || err) };
  }

  const bin = findSendmailBinary();
  return bin ? { ok: true, path: bin } : { ok: false, reason: "binary_missing_after_install" };
}

/**
 * Pulse-E-Mail-Konfiguration auf Sendmail setzen, wenn noch kein Provider gewählt wurde.
 * @param {string} sendmailPath
 */
function applyDefaultSendmailEmailConfig(sendmailPath) {
  const emailConfigStore = require("./emailConfigStore");
  const cur = emailConfigStore.load();
  if (cur.provider !== "none") return false;
  const { from, fromName } = resolveDefaultFrom();
  writeMsmtpConfig(from);
  emailConfigStore.save({
    provider: "sendmail",
    sendmailPath,
    sendmailFrom: from,
    from,
    fromName,
  });
  return true;
}

/**
 * Sendmail bereitstellen und Pulse-Default setzen.
 * @param {{ allowInstall?: boolean }} [opts] — allowInstall: Pakete installieren (Update als root)
 * @returns {Promise<{ sendmailPath: string|null, configured: boolean, installed: boolean }>}
 */
async function ensureSendmailForPulse(opts = {}) {
  /* Paketinstallation nur bei explizitem allowInstall:true und root (Update/Installer). */
  const allowInstall = opts.allowInstall === true && isRoot();
  let sendmailPath = findSendmailBinary();
  let installed = false;

  if (!sendmailPath && allowInstall) {
    const result = await installSendmailPackage();
    if (result.ok && result.path) {
      sendmailPath = result.path;
      installed = true;
    }
  }

  if (!sendmailPath) {
    return { sendmailPath: null, configured: false, installed: false };
  }

  const { from } = resolveDefaultFrom();
  writeMsmtpConfig(from);
  if (isRoot() && fs.existsSync("/etc/postfix/main.cf")) {
    await securePostfixLocalOnly();
  }

  const configured = applyDefaultSendmailEmailConfig(sendmailPath);
  try {
    require("./emailService").reloadConfig();
  } catch {
    /* emailService evtl. noch nicht geladen */
  }

  if (configured) {
    console.log(`[sendmail] Standard-Versand: Sendmail (${sendmailPath}), Absender ${from}`);
  }

  return { sendmailPath, configured, installed };
}

module.exports = {
  findSendmailBinary,
  ensureSendmailForPulse,
  resolveDefaultFrom,
  applyDefaultSendmailEmailConfig,
};
