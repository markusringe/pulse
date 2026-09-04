/**
 * REST-Handler für E-Mail-Konfiguration (#/admin/email) inkl. Mailgun-Domain und Outbox.
 */

const audit = require("./auditLogger");
const emailService = require("./emailService");
const emailConfigStore = require("./emailConfigStore");
const permissions = require("./permissions");
const { getDomainInfo, verifyDomain, formatDnsHints } = require("./email/mailgunDomain");
const { mailgunConfigured } = require("./email/mailgunEnv");
const { normalizeEmail } = require("./email/emailSanitize");
const outboxStore = require("./email/outboxStore");
const suppressionStore = require("./email/suppressionStore");

/** DNS-Verifikation: max. 1× pro Minute pro Admin. */
const dnsVerifyLast = new Map();
const DNS_VERIFY_COOLDOWN_MS = 60_000;

function dnsVerifyAllowed(userKey) {
  const last = dnsVerifyLast.get(userKey) || 0;
  if (Date.now() - last < DNS_VERIFY_COOLDOWN_MS) return false;
  dnsVerifyLast.set(userKey, Date.now());
  return true;
}

/**
 * @param {object} ctx
 * @returns {Promise<boolean>}
 */
async function handleEmailApi(ctx) {
  const { req, res, parts, send, readJson, authApi, getAuth } = ctx;
  if (parts[1] !== "email") return false;

  const auth = await getAuth(req, {});
  if (!permissions.canManageUsers(auth.user) && !auth.viaSecret) {
    send(res, 403, { error: "Keine Berechtigung" });
    return true;
  }

  if (req.method === "GET" && parts.length === 2) {
    send(res, 200, {
      config: emailConfigStore.publicConfig(emailService.getRuntimeConfig()),
      health: emailService.healthInfo(),
    });
    return true;
  }

  if (req.method === "GET" && parts[2] === "domain" && parts.length === 3) {
    if (!mailgunConfigured()) {
      send(res, 503, { error: "Mailgun nicht konfiguriert (MAILGUN_API_KEY / MAILGUN_DOMAIN)" });
      return true;
    }
    try {
      const info = await getDomainInfo();
      send(res, 200, { dns: formatDnsHints(info) });
    } catch (err) {
      send(res, 502, { error: err.message || "Mailgun-Domain konnte nicht geladen werden" });
    }
    return true;
  }

  if (req.method === "POST" && parts[2] === "domain" && parts[3] === "verify") {
    if (!authApi.adminStepUpOk(auth)) {
      authApi.rejectStepUp(res, send);
      return true;
    }
    const userKey = auth.user?.id || "secret";
    if (!dnsVerifyAllowed(userKey)) {
      send(res, 429, { error: "DNS-Prüfung rate-limited — bitte eine Minute warten" });
      return true;
    }
    if (!mailgunConfigured()) {
      send(res, 503, { error: "Mailgun nicht konfiguriert" });
      return true;
    }
    try {
      const info = await verifyDomain();
      send(res, 200, { dns: formatDnsHints(info), message: "Verifikation bei Mailgun angestoßen" });
    } catch (err) {
      send(res, 502, { error: err.message || "DNS-Verifikation fehlgeschlagen" });
    }
    return true;
  }

  if (req.method === "GET" && parts[2] === "outbox") {
    send(res, 200, { items: outboxStore.listForAdmin(50) });
    return true;
  }

  if (req.method === "GET" && parts[2] === "suppression") {
    send(res, 200, { entries: suppressionStore.list(100) });
    return true;
  }

  if (req.method === "PATCH" && parts.length === 2) {
    if (!authApi.adminStepUpOk(auth)) {
      authApi.rejectStepUp(res, send);
      return true;
    }
    const body = await readJson(req);
    const patch = {};
    if (body.provider != null) patch.provider = body.provider;
    if (body.smtpHost != null) patch.smtpHost = String(body.smtpHost).trim();
    if (body.smtpPort != null) patch.smtpPort = Number(body.smtpPort) || 587;
    if (body.smtpUser != null) patch.smtpUser = String(body.smtpUser).trim();
    if (body.smtpPass != null && String(body.smtpPass).trim()) patch.smtpPass = String(body.smtpPass);
    if (body.smtpTls != null) patch.smtpTls = String(body.smtpTls).trim();
    if (body.smtpSecure != null) patch.smtpSecure = Boolean(body.smtpSecure);
    if (body.from != null) patch.from = String(body.from).trim();
    if (body.fromName != null) patch.fromName = String(body.fromName).trim().slice(0, 120);
    if (body.sendmailPath != null) patch.sendmailPath = String(body.sendmailPath).trim();
    if (body.sendmailFrom != null) patch.sendmailFrom = String(body.sendmailFrom).trim();
    if (body.confirmedAdminEmail != null) {
      const raw = String(body.confirmedAdminEmail).trim();
      patch.confirmedAdminEmail = raw ? normalizeEmail(raw) : "";
    }

    emailConfigStore.save(patch);
    emailService.reloadConfig();
    audit.log("email_config_updated", { userId: auth.user?.id || "secret", provider: patch.provider });
    send(res, 200, {
      config: emailConfigStore.publicConfig(emailService.getRuntimeConfig()),
      health: emailService.healthInfo(),
    });
    return true;
  }

  if (req.method === "POST" && parts[2] === "test") {
    if (!authApi.adminStepUpOk(auth)) {
      authApi.rejectStepUp(res, send);
      return true;
    }
    const body = await readJson(req);
    const cfg = emailService.getRuntimeConfig();
    let to = String(body.to || auth.user?.email || "").trim().toLowerCase();
    if (!to.includes("@")) {
      send(res, 400, { error: "Gültige Test-E-Mail-Adresse erforderlich" });
      return true;
    }
    /* Mailgun: Test nur an bestätigte Admin-Adresse */
    if (cfg.provider === "mailgun") {
      const confirmed = String(cfg.confirmedAdminEmail || "").trim().toLowerCase();
      if (!confirmed) {
        send(res, 400, {
          error: "Bitte zuerst eine bestätigte Admin-E-Mail speichern (Mailgun-Testversand)",
        });
        return true;
      }
      to = normalizeEmail(to);
      if (to !== confirmed) {
        send(res, 403, { error: "Test-E-Mail nur an die bestätigte Admin-Adresse erlaubt" });
        return true;
      }
    }
    try {
      const pin = "123456";
      const result = await emailService.sendPinEmail({
        to,
        pin,
        lang: body.lang || "de",
        appName: body.appName || "Team Townhall",
        ttlMinutes: 10,
      });
      if (!result.ok) {
        send(res, 503, { error: result.error || "Versand fehlgeschlagen" });
        return true;
      }
      audit.log("email_test_sent", {
        userId: auth.user?.id || "secret",
        toHash: suppressionStore.hashEmail(to),
      });
      send(res, 200, { ok: true, mode: result.mode, message: "Test-E-Mail versendet" });
    } catch (err) {
      send(res, 503, { error: err.message || "Versand fehlgeschlagen" });
    }
    return true;
  }

  send(res, 404, { error: "Nicht gefunden" });
  return true;
}

module.exports = { handleEmailApi };
