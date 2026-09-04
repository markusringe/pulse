/**
 * E-Mail-Versand für Anmelde-PINs (SMTP, Sendmail, Mailgun) und Entwicklungs-Mailbox.
 * Konfiguration: data/email-config.json (Admin-UI) mit Fallback auf SMTP_* aus .env.
 * Mailgun-Secrets nur über MAILGUN_* — Versand über Outbox-Queue.
 * In Produktion erscheint die PIN niemals in Logs oder API-Antworten.
 */

const tls = require("tls");
const net = require("net");
const fs = require("fs");
const { spawn } = require("child_process");
const emailConfigStore = require("./emailConfigStore");
const outboxStore = require("./email/outboxStore");
const outboxWorker = require("./email/outboxWorker");
const suppressionStore = require("./email/suppressionStore");
const { normalizeEmail, assertFromDomainAllowed } = require("./email/emailSanitize");
const { getMailgunEnv, assertMailgunProductionReady, mailgunConfigured } = require("./email/mailgunEnv");

/** @type {Array<{to:string,subject:string,html:string,text:string,sentAt:number}>} */
const devMailbox = [];
const MAX_DEV_MAIL = 50;

/** Geladene Laufzeit-Konfiguration (Datei + Env-Merge). */
let runtimeConfig = null;

function reloadConfig() {
  runtimeConfig = mergeRuntimeConfig();
  assertMailgunProductionReady();
  return runtimeConfig;
}

function getRuntimeConfig() {
  if (!runtimeConfig) reloadConfig();
  return runtimeConfig;
}

/**
 * Datei-Konfiguration mit Legacy-Env-SMTP zusammenführen.
 * @returns {object}
 */
function mergeRuntimeConfig() {
  const file = emailConfigStore.load();
  const hasEnvSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
  if (file.provider === "none" && hasEnvSmtp) {
    return {
      provider: "smtp",
      smtpHost: process.env.SMTP_HOST,
      smtpPort: Number(process.env.SMTP_PORT) || 587,
      smtpUser: process.env.SMTP_USER || "",
      smtpPass: process.env.SMTP_PASS || "",
      smtpTls: process.env.SMTP_TLS || "starttls",
      smtpSecure: String(process.env.SMTP_TLS || "").toLowerCase() === "ssl",
      from: process.env.SMTP_FROM,
      fromName: process.env.SMTP_FROM_NAME || "Team Townhall",
      sendmailPath: "/usr/bin/sendmail",
      sendmailFrom: process.env.SMTP_FROM || "",
      updatedAt: file.updatedAt || 0,
      source: "env",
    };
  }
  if (file.provider !== "none") {
    return { ...file, source: "file" };
  }
  return { ...file, source: "none" };
}

function isDevMode() {
  return envBool("AUTH_DEV_MAILBOX", process.env.NODE_ENV !== "production");
}

function envBool(name, fallback) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return fallback;
  return !/^(0|false|off|no|disabled)$/i.test(String(raw).trim());
}

/** Ob PIN-Versand per E-Mail möglich ist (nicht „none“ und konfiguriert). */
function canSendPin() {
  if (isDevMode()) return true;
  const cfg = getRuntimeConfig();
  if (cfg.provider === "none") return false;
  if (cfg.provider === "smtp") {
    return Boolean(cfg.smtpHost && cfg.from);
  }
  if (cfg.provider === "sendmail") {
    return Boolean(cfg.sendmailFrom || cfg.from);
  }
  if (cfg.provider === "mailgun") {
    if (isDevMode() && !mailgunConfigured()) return true;
    return mailgunConfigured() && Boolean(cfg.from || getMailgunEnv().domain);
  }
  return false;
}

function smtpConfigured() {
  const cfg = getRuntimeConfig();
  return cfg.provider === "smtp" && Boolean(cfg.smtpHost && cfg.from);
}

function pinEmailContent({ pin, lang, appName, ttlMinutes }) {
  const name = appName || "Team Townhall";
  const templates = {
    de: {
      subject: `Ihr Anmeldecode für ${name}`,
      text: [
        `Ihr Anmeldecode: ${pin}`,
        "",
        `Der Code ist ${ttlMinutes} Minuten gültig und kann nur einmal verwendet werden.`,
        "Geben Sie den Code nicht an andere Personen weiter.",
        "",
        "Falls Sie diese Anmeldung nicht selbst ausgelöst haben, ignorieren Sie diese E-Mail.",
      ].join("\n"),
      html: `<!DOCTYPE html><html lang="de"><body style="font-family:sans-serif;line-height:1.5;color:#111">
        <p>Ihr Anmeldecode für <strong>${escapeHtml(name)}</strong>:</p>
        <p style="font-size:28px;letter-spacing:6px;font-weight:bold">${escapeHtml(pin)}</p>
        <p>Der Code ist <strong>${ttlMinutes} Minuten</strong> gültig und kann nur einmal verwendet werden.</p>
        <p><strong>Nicht weitergeben.</strong> Falls Sie diese Anmeldung nicht selbst ausgelöst haben, ignorieren Sie diese E-Mail.</p>
      </body></html>`,
    },
    en: {
      subject: `Your sign-in code for ${name}`,
      text: `Your sign-in code: ${pin}\n\nValid for ${ttlMinutes} minutes, single use only.\nDo not share this code.`,
      html: `<p>Your sign-in code for <strong>${escapeHtml(name)}</strong>:</p><p style="font-size:28px;letter-spacing:6px;font-weight:bold">${escapeHtml(pin)}</p>`,
    },
    fr: {
      subject: `Votre code de connexion pour ${name}`,
      text: `Votre code : ${pin}\n\nValable ${ttlMinutes} minutes, usage unique.`,
      html: `<p>Votre code pour <strong>${escapeHtml(name)}</strong> :</p><p style="font-size:28px;letter-spacing:6px;font-weight:bold">${escapeHtml(pin)}</p>`,
    },
  };
  return templates[lang] || templates.de;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Abhängigkeiten für Outbox-Worker (Provider-Factory). */
function getOutboxWorkerDeps() {
  const cfg = getRuntimeConfig();
  return {
    getRuntimeConfig,
    devMailbox,
    sendSmtp: sendSmtpWithConfig,
    sendSendmail,
    useCapture: isDevMode() && cfg.provider === "mailgun" && !mailgunConfigured(),
  };
}

/**
 * PIN per E-Mail versenden.
 * @returns {Promise<{ok:boolean, mode:'smtp'|'sendmail'|'mailgun'|'dev'|'none', error?:string}>}
 */
async function sendPinEmail({ to, pin, lang, appName, ttlMinutes = 10 }) {
  const content = pinEmailContent({ pin, lang, appName, ttlMinutes });
  const msg = {
    to,
    subject: content.subject,
    text: content.text,
    html: content.html,
    sentAt: Date.now(),
  };

  const cfg = getRuntimeConfig();

  if (cfg.provider === "mailgun") {
    try {
      const recipient = normalizeEmail(to);
      if (suppressionStore.isSuppressed(recipient)) {
        return { ok: false, mode: "mailgun", error: "E-Mail-Adresse ist unterdrückt (Bounce/Complaint)" };
      }
      const env = getMailgunEnv();
      const fromRaw = cfg.from || (env.domain ? `noreply@${env.domain}` : "");
      const from = assertFromDomainAllowed(fromRaw, env.domain);
      const payload = {
        to: recipient,
        subject: content.subject,
        html: content.html,
        text: content.text,
        from,
        fromName: cfg.fromName || "Team Townhall",
        idempotencyKey: `pin:${recipient}:${pin}`,
        tags: ["pin"],
      };
      const itemId = outboxStore.enqueue(payload);
      const result = await outboxWorker.processItem(itemId, getOutboxWorkerDeps());
      if (!result.ok && isDevMode()) {
        pushDevMail(msg);
        return { ok: true, mode: "dev", fallback: true };
      }
      const mode = isDevMode() && !mailgunConfigured() ? "dev" : "mailgun";
      return { ok: result.ok, mode, error: result.error };
    } catch (err) {
      if (isDevMode()) {
        pushDevMail(msg);
        return { ok: true, mode: "dev", fallback: true };
      }
      return { ok: false, mode: "mailgun", error: err.message || "Mailgun-Fehler" };
    }
  }

  if (cfg.provider === "smtp" && cfg.smtpHost && cfg.from) {
    try {
      await sendSmtpWithConfig(msg, cfg);
      return { ok: true, mode: "smtp" };
    } catch (err) {
      if (isDevMode()) {
        pushDevMail(msg);
        return { ok: true, mode: "dev", fallback: true };
      }
      return { ok: false, mode: "none", error: err.message || "SMTP-Fehler" };
    }
  }

  if (cfg.provider === "sendmail") {
    try {
      await sendSendmail(msg, cfg);
      return { ok: true, mode: "sendmail" };
    } catch (err) {
      if (isDevMode()) {
        pushDevMail(msg);
        return { ok: true, mode: "dev", fallback: true };
      }
      return { ok: false, mode: "none", error: err.message || "Sendmail-Fehler" };
    }
  }

  if (isDevMode()) {
    pushDevMail(msg);
    return { ok: true, mode: "dev" };
  }

  return { ok: false, mode: "none", error: "E-Mail-Versand nicht konfiguriert" };
}

function pushDevMail(msg) {
  devMailbox.unshift({ ...msg });
  if (devMailbox.length > MAX_DEV_MAIL) devMailbox.length = MAX_DEV_MAIL;
}

function getDevMailbox() {
  if (!isDevMode()) return [];
  return devMailbox.map(({ to, subject, sentAt, text }) => ({ to, subject, sentAt, preview: text.slice(0, 120) }));
}

function healthInfo() {
  const cfg = getRuntimeConfig();
  const mg = getMailgunEnv();
  return {
    provider: cfg.provider,
    configured: canSendPin(),
    smtpConfigured: smtpConfigured(),
    mailgunConfigured: mailgunConfigured(),
    mailgunDomain: mg.domain ? maskDomain(mg.domain) : "",
    mailgunRegion: mg.region,
    confirmedAdminEmail: cfg.confirmedAdminEmail ? maskEmail(cfg.confirmedAdminEmail) : "",
    devMailbox: isDevMode(),
    host: cfg.smtpHost ? String(cfg.smtpHost) : "",
    from: cfg.from ? maskEmail(cfg.from) : "",
    tls: cfg.smtpTls || "starttls",
    source: cfg.source || "none",
  };
}

function maskDomain(domain) {
  const d = String(domain);
  const parts = d.split(".");
  if (parts.length < 2) return "***";
  return `${parts[0].slice(0, 1)}***.${parts.slice(-2).join(".")}`;
}

function maskEmail(email) {
  const s = String(email);
  const at = s.indexOf("@");
  if (at <= 1) return "***";
  return `${s.slice(0, 1)}***${s.slice(at)}`;
}

/**
 * Sendmail-Binary mit -t (Header aus stdin).
 * @param {object} msg
 * @param {object} cfg
 */
function sendSendmail(msg, cfg) {
  return new Promise((resolve, reject) => {
    const bin = cfg.sendmailPath || "/usr/bin/sendmail";
    if (!fs.existsSync(bin)) {
      reject(new Error(`Sendmail nicht gefunden: ${bin}`));
      return;
    }
    const from = cfg.sendmailFrom || cfg.from;
    if (!from) {
      reject(new Error("Absender-E-Mail für Sendmail fehlt"));
      return;
    }
    const fromName = cfg.fromName || "Team Townhall";
    const body = [
      `From: ${fromName} <${from}>`,
      `To: ${msg.to}`,
      `Subject: ${msg.subject}`,
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="UTF-8"',
      "",
      msg.html,
    ].join("\r\n");

    const proc = spawn(bin, ["-t", "-i"], { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (c) => {
      stderr += c.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Sendmail exit ${code}`));
    });
    proc.stdin.write(body);
    proc.stdin.end();
  });
}

/**
 * Minimaler SMTP-Client (STARTTLS oder direktes TLS) mit expliziter Konfiguration.
 */
function sendSmtpWithConfig(msg, cfg) {
  return new Promise((resolve, reject) => {
    const host = cfg.smtpHost;
    const port = Number(cfg.smtpPort) || 587;
    const user = cfg.smtpUser || "";
    const pass = cfg.smtpPass || "";
    const from = cfg.from;
    const fromName = cfg.fromName || "Team Townhall";
    const mode = String(cfg.smtpTls || "starttls").toLowerCase();
    const secure = cfg.smtpSecure || mode === "ssl" || mode === "tls";

    let socket;
    let stage = "connect";
    let buffer = "";

    const finish = (err) => {
      try {
        socket?.end();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve();
    };

    const sendCmd = (line) => {
      socket.write(`${line}\r\n`);
    };

    const handleLine = (line) => {
      const code = Number(line.slice(0, 3));
      if (stage === "greet" && code === 220) {
        sendCmd(`EHLO ${host}`);
        stage = "ehlo";
        return;
      }
      if (stage === "ehlo" && code === 250) {
        if (!secure && mode === "starttls" && line.toUpperCase().includes("STARTTLS")) {
          sendCmd("STARTTLS");
          stage = "starttls";
          return;
        }
        if (user) {
          sendCmd("AUTH LOGIN");
          stage = "auth-user";
          return;
        }
        sendCmd(`MAIL FROM:<${from}>`);
        stage = "mail";
        return;
      }
      if (stage === "starttls" && code === 220) {
        const opts = { socket, host };
        socket = tls.connect(opts, () => {
          stage = "greet";
          sendCmd(`EHLO ${host}`);
          stage = "ehlo";
        });
        socket.on("data", onData);
        socket.on("error", finish);
        return;
      }
      if (stage === "auth-user" && code === 334) {
        sendCmd(Buffer.from(user).toString("base64"));
        stage = "auth-pass";
        return;
      }
      if (stage === "auth-pass" && code === 334) {
        sendCmd(Buffer.from(pass).toString("base64"));
        stage = "auth-wait";
        return;
      }
      if (stage === "auth-wait" && code === 235) {
        sendCmd(`MAIL FROM:<${from}>`);
        stage = "mail";
        return;
      }
      if (stage === "mail" && code === 250) {
        sendCmd(`RCPT TO:<${msg.to}>`);
        stage = "rcpt";
        return;
      }
      if (stage === "rcpt" && code === 250) {
        sendCmd("DATA");
        stage = "data";
        return;
      }
      if (stage === "data" && code === 354) {
        const body = [
          `From: ${fromName} <${from}>`,
          `To: ${msg.to}`,
          `Subject: ${msg.subject}`,
          "MIME-Version: 1.0",
          'Content-Type: text/html; charset="UTF-8"',
          "",
          msg.html,
          ".",
        ].join("\r\n");
        sendCmd(body);
        stage = "done";
        return;
      }
      if (stage === "done" && code === 250) {
        sendCmd("QUIT");
        finish();
        return;
      }
      if (code >= 400) {
        finish(new Error(`SMTP ${code}: ${line}`));
      }
    };

    const onData = (chunk) => {
      buffer += chunk.toString();
      let idx;
      while ((idx = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (line) handleLine(line);
      }
    };

    if (secure) {
      socket = tls.connect(port, host, () => {
        stage = "greet";
      });
    } else {
      socket = net.connect(port, host, () => {
        stage = "greet";
      });
    }
    socket.on("data", onData);
    socket.on("error", finish);
    socket.setTimeout(30000, () => finish(new Error("SMTP timeout")));
  });
}

/** Legacy: SMTP aus process.env (wird intern über getRuntimeConfig abgedeckt). */
function sendSmtp(msg) {
  return sendSmtpWithConfig(msg, getRuntimeConfig());
}

reloadConfig();

module.exports = {
  sendPinEmail,
  getDevMailbox,
  healthInfo,
  isDevMode,
  smtpConfigured,
  canSendPin,
  reloadConfig,
  getRuntimeConfig,
  getOutboxWorkerDeps,
  sendSmtp,
};
