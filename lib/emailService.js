/**
 * E-Mail-Versand für Anmelde-PINs (SMTP) und Entwicklungs-Mailbox.
 * In Produktion erscheint die PIN niemals in Logs oder API-Antworten.
 */

const tls = require("tls");
const net = require("net");

/** @type {Array<{to:string,subject:string,html:string,text:string,sentAt:number}>} */
const devMailbox = [];
const MAX_DEV_MAIL = 50;

function isDevMode() {
  return envBool("AUTH_DEV_MAILBOX", process.env.NODE_ENV !== "production");
}

function envBool(name, fallback) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return fallback;
  return !/^(0|false|off|no|disabled)$/i.test(String(raw).trim());
}

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
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

/**
 * PIN per E-Mail versenden.
 * @returns {Promise<{ok:boolean, mode:'smtp'|'dev'|'none', error?:string}>}
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

  if (smtpConfigured()) {
    try {
      await sendSmtp(msg);
      return { ok: true, mode: "smtp" };
    } catch (err) {
      if (isDevMode()) {
        pushDevMail(msg);
        return { ok: true, mode: "dev", fallback: true };
      }
      return { ok: false, mode: "none", error: err.message || "SMTP-Fehler" };
    }
  }

  if (isDevMode()) {
    pushDevMail(msg);
    return { ok: true, mode: "dev" };
  }

  return { ok: false, mode: "none", error: "SMTP nicht konfiguriert" };
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
  return {
    smtpConfigured: smtpConfigured(),
    devMailbox: isDevMode(),
    host: process.env.SMTP_HOST ? String(process.env.SMTP_HOST) : "",
    from: process.env.SMTP_FROM ? maskEmail(process.env.SMTP_FROM) : "",
    tls: process.env.SMTP_TLS || "starttls",
  };
}

function maskEmail(email) {
  const s = String(email);
  const at = s.indexOf("@");
  if (at <= 1) return "***";
  return `${s.slice(0, 1)}***${s.slice(at)}`;
}

/**
 * Minimaler SMTP-Client (STARTTLS oder direktes TLS).
 */
function sendSmtp(msg) {
  return new Promise((resolve, reject) => {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER || "";
    const pass = process.env.SMTP_PASS || "";
    const from = process.env.SMTP_FROM;
    const fromName = process.env.SMTP_FROM_NAME || "Team Townhall";
    const mode = String(process.env.SMTP_TLS || "starttls").toLowerCase();
    const secure = mode === "ssl" || mode === "tls";

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

module.exports = { sendPinEmail, getDevMailbox, healthInfo, isDevMode, smtpConfigured };
