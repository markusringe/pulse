/**
 * Mailgun HTTP-API (EU/US) — implementiert das EmailProvider-Interface.
 */

const { assertSafeHeaderValue, normalizeEmail } = require("../emailSanitize");

class MailgunEmailProvider {
  /**
   * @param {{ apiKey: string, domain: string, apiBase: string }} config
   */
  constructor(config) {
    this.apiKey = config.apiKey;
    this.domain = config.domain;
    this.apiBase = (config.apiBase || "https://api.eu.mailgun.net").replace(/\/$/, "");
    this.name = "mailgun";
  }

  /**
   * @param {{ to: string, subject: string, html: string, text?: string, from: string, fromName?: string, tags?: string[] }} msg
   * @returns {Promise<{ id?: string }>}
   */
  async send(msg) {
    if (!this.apiKey || !this.domain) {
      throw new Error("Mailgun nicht konfiguriert (MAILGUN_API_KEY / MAILGUN_DOMAIN)");
    }
    const to = normalizeEmail(msg.to);
    const fromEmail = normalizeEmail(msg.from);
    const fromName = assertSafeHeaderValue(msg.fromName || "Pulse", "From-Name");
    const subject = assertSafeHeaderValue(msg.subject, "Subject");
    const url = `${this.apiBase}/v3/${encodeURIComponent(this.domain)}/messages`;

    const body = new URLSearchParams();
    body.set("from", `${fromName} <${fromEmail}>`);
    body.set("to", to);
    body.set("subject", subject);
    body.set("html", msg.html || "");
    if (msg.text) body.set("text", msg.text);
    if (Array.isArray(msg.tags)) {
      for (const t of msg.tags.slice(0, 3)) body.append("o:tag", String(t).slice(0, 64));
    }

    const auth = Buffer.from(`api:${this.apiKey}`).toString("base64");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const raw = await res.text();
    let json = {};
    try {
      json = JSON.parse(raw || "{}");
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      throw new Error(json.message || raw || `Mailgun HTTP ${res.status}`);
    }
    return { id: json.id || json.message || "sent" };
  }
}

module.exports = { MailgunEmailProvider };
