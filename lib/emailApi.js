/**
 * REST-Handler für E-Mail-Konfiguration (#/admin/email).
 */

const audit = require("./auditLogger");
const emailService = require("./emailService");
const emailConfigStore = require("./emailConfigStore");
const permissions = require("./permissions");

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
    const to = String(body.to || auth.user?.email || "").trim().toLowerCase();
    if (!to.includes("@")) {
      send(res, 400, { error: "Gültige Test-E-Mail-Adresse erforderlich" });
      return true;
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
      audit.log("email_test_sent", { userId: auth.user?.id || "secret", to });
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
