/**
 * REST-Handler für Authentifizierung und Benutzerverwaltung.
 */

const audit = require("./auditLogger");
const userAuth = require("./userAuth");
const userService = require("./userService");
const permissions = require("./permissions");
const emailService = require("./emailService");
const pinLimiter = require("./pinLimiter");
const stepUpAuth = require("./stepUpAuth");
const { ensureBootstrapAdmin, repairInstallAdminRole } = require("./bootstrapAdmin");

function clientIp(req) {
  return req.socket.remoteAddress || req.headers["x-forwarded-for"] || "";
}

async function resolveRequestAuth(req, userDb, legacyReadAdminKey, legacyVerify) {
  const cookies = userAuth.parseCookies(req.headers.cookie);
  const token = cookies[userAuth.AUTH_COOKIE];
  let sessionAuth = null;
  if (token && userDb.supported) {
    sessionAuth = await userService.resolveSession(userDb, token);
  }
  const secret = legacyReadAdminKey(req, {});
  const viaSecret = legacyVerify(secret);
  let bootstrapPasswordLogin = false;
  let passwordLoginMode = false;
  let pinLoginAvailable = false;
  if (userDb.supported) {
    bootstrapPasswordLogin = await userService.isBootstrapPasswordLogin(userDb);
    passwordLoginMode = await userService.isPasswordLoginMode(userDb);
    pinLoginAvailable = emailService.canSendPin() && !bootstrapPasswordLogin;
  }
  return {
    user: sessionAuth?.user || null,
    session: sessionAuth?.session || null,
    sessionId: sessionAuth?.session?.id || null,
    viaSecret,
    token: sessionAuth ? token : null,
    bootstrapPasswordLogin,
    passwordLoginMode,
    pinLoginAvailable,
  };
}

/** Antwort bei fehlender Step-up-PIN für Admin-Aktionen. */
function rejectStepUp(res, send) {
  send(res, 403, { error: "Erneute PIN-Bestätigung erforderlich", code: "step_up_required" });
}

/**
 * Prüft Step-up für Cookie-Admins; ADMIN_SECRET und frische PIN-Anmeldung sind ausgenommen.
 * @param {object} auth
 * @returns {boolean}
 */
function adminStepUpOk(auth) {
  if (stepUpAuth.checkStepUp(auth).ok) return true;
  if (auth?.viaSecret) return true;
  /* Administratoren melden sich per Kennwort an — keine erneute PIN-Bestätigung per E-Mail-Code. */
  if (auth?.user?.role === "admin") return true;
  return false;
}

function sendJson(res, code, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  res.end(payload);
}

function publicUserList(users) {
  return users.map((u) => userAuth.publicUser(u));
}

/**
 * @param {object} ctx — { req, res, parts, userDb, brandingStore, send, readJson, legacyReadAdminKey, isLegacyAdmin }
 */
async function handleAuthApi(ctx) {
  const { req, res, parts, userDb, brandingStore, send, readJson } = ctx;
  const ip = clientIp(req);
  const ipHash = audit.hashIp(ip);

  if (!userDb.supported && parts[2] !== "status") {
    send(res, 503, { error: "Benutzerverwaltung erfordert SQLite oder PostgreSQL" });
    return true;
  }

  if (req.method === "GET" && parts[1] === "auth" && parts[2] === "status") {
    const settings = await userService.getSettings(userDb);
    const adminCount = await userService.countAdmins(userDb);
    const bootstrapPasswordLogin = await userService.isBootstrapPasswordLogin(userDb);
    const passwordLoginMode = await userService.isPasswordLoginMode(userDb);
    send(res, 200, {
      enabled: userService.isUserManagementEnabled(userDb),
      settings,
      adminCount,
      email: emailService.healthInfo(),
      db: userDb.kind,
      needsBootstrap: adminCount === 0,
      bootstrapPasswordLogin,
      passwordLoginMode,
      pinLoginAvailable: emailService.canSendPin() && !bootstrapPasswordLogin,
      bootstrapEnvConfigured: Boolean(
        String(process.env.BOOTSTRAP_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "").trim()
      ),
    });
    return true;
  }

  if (req.method === "GET" && parts[1] === "auth" && parts[2] === "me") {
    const auth = await resolveRequestAuth(req, userDb, ctx.legacyReadAdminKey, ctx.isLegacyAdmin);
    if (!auth.user && !auth.viaSecret) {
      send(res, 401, { error: "Nicht angemeldet" });
      return true;
    }
    let user = auth.user;
    if (user && userDb.supported) {
      const repaired = await repairInstallAdminRole(userDb, user);
      if (repaired) user = userAuth.publicUser(repaired);
    }
    const onboardingBackupPending =
      user && userDb.supported ? await userService.isOnboardingBackupPending(userDb) : false;
    send(res, 200, {
      user,
      viaSecret: auth.viaSecret,
      nav: user ? permissions.navForRole(user.role) : permissions.navForRole("admin"),
      stepUpValid: stepUpAuth.hasValidStepUp(auth.session?.stepUpUntil),
      stepUpUntil: auth.session?.stepUpUntil || null,
      onboardingBackupPending,
    });
    return true;
  }

  if (req.method === "POST" && parts[1] === "auth" && parts[2] === "onboarding-backup-done") {
    const auth = await resolveRequestAuth(req, userDb, ctx.legacyReadAdminKey, ctx.isLegacyAdmin);
    if (!auth.user || auth.user.role !== "admin") {
      send(res, 403, { error: "Nur Administratoren" });
      return true;
    }
    await userService.completeOnboardingBackup(userDb);
    audit.log("onboarding_backup_skipped", { userId: auth.user.id, action: "skip" });
    send(res, 200, { ok: true });
    return true;
  }

  if (req.method === "POST" && parts[1] === "auth" && parts[2] === "step-up") {
    const body = await readJson(req);
    const auth = await resolveRequestAuth(req, userDb, ctx.legacyReadAdminKey, ctx.isLegacyAdmin);
    if (!auth.user || !auth.sessionId) {
      send(res, 401, { error: "Nicht angemeldet" });
      return true;
    }
    if (auth.user.role !== "admin") {
      send(res, 403, { error: "Keine Berechtigung" });
      return true;
    }
    try {
      const result = await userService.verifyStepUpPin(userDb, {
        userId: auth.user.id,
        sessionId: auth.sessionId,
        pin: body.pin,
      });
      audit.log("step_up_verified", { userId: auth.user.id, ip });
      send(res, 200, { ok: true, stepUpUntil: result.stepUpUntil });
    } catch (err) {
      send(res, err.statusCode || 401, { error: err.message });
    }
    return true;
  }

  if (req.method === "PATCH" && parts[1] === "auth" && parts[2] === "profile") {
    const body = await readJson(req);
    const auth = await resolveRequestAuth(req, userDb, ctx.legacyReadAdminKey, ctx.isLegacyAdmin);
    if (!auth.user) {
      send(res, 401, { error: "Nicht angemeldet" });
      return true;
    }
    try {
      const user = await userService.updateProfile(userDb, auth.user.id, body);
      send(res, 200, { user });
    } catch (err) {
      send(res, err.statusCode || 400, { error: err.message });
    }
    return true;
  }

  if (parts[1] === "auth" && parts[2] === "settings") {
    const auth = await resolveRequestAuth(req, userDb, ctx.legacyReadAdminKey, ctx.isLegacyAdmin);
    const adminCount = await userService.countAdmins(userDb);
    const bootstrap = adminCount === 0 && auth.viaSecret;
    const allowed = permissions.canManageUsers(auth.user) || bootstrap;
    if (!allowed) {
      send(res, 403, { error: "Keine Berechtigung" });
      return true;
    }
    if (req.method === "GET") {
      const settings = await userService.getSettings(userDb);
      send(res, 200, { settings });
      return true;
    }
    if (req.method === "PATCH") {
      if (!adminStepUpOk(auth)) {
        rejectStepUp(res, send);
        return true;
      }
      const body = await readJson(req);
      const settings = await userService.setSettings(userDb, body);
      audit.log("auth_settings_updated", { userId: auth.user?.id || "bootstrap", ip });
      send(res, 200, { settings });
      return true;
    }
  }

  if (req.method === "POST" && parts[1] === "auth" && parts[2] === "register") {
    const body = await readJson(req);
    const settings = await userService.getSettings(userDb);
    try {
      const user = await userService.registerSelf(userDb, settings, body);
      audit.log("user_registered", { userId: user.id, ip });
      send(res, 201, { user, message: "Konto angelegt — fordern Sie nun Ihren Anmeldecode an." });
    } catch (err) {
      send(res, err.statusCode || 500, { error: err.message });
    }
    return true;
  }

  if (req.method === "POST" && parts[1] === "auth" && parts[2] === "request-pin") {
    const body = await readJson(req);
    const branding = brandingStore.load();
    try {
      const result = await userService.requestPin(userDb, {
        email: body.email,
        ipHash,
        lang: body.lang || "de",
        appName: branding.appName || "Team Townhall",
      });
      audit.log("pin_requested", { userId: result.userId || "unknown", ip });
      send(res, 200, {
        ok: true,
        message: "Falls ein Konto existiert, wurde ein Code versendet.",
        expiresAt: result.expiresAt || null,
      });
    } catch (err) {
      if (err.statusCode === 429) {
        send(res, 429, { error: err.message, retryAfterMs: err.retryAfterMs });
      } else {
        send(res, err.statusCode || 500, { error: err.message });
      }
    }
    return true;
  }

  if (req.method === "POST" && parts[1] === "auth" && parts[2] === "verify-pin") {
    const body = await readJson(req);
    const secure = userAuth.authCookieSecure(req);
    try {
      const result = await userService.verifyPinLogin(userDb, {
        email: body.email,
        pin: body.pin,
        ipHash,
        userAgent: req.headers["user-agent"],
        persistent: body.persistent !== false,
      });
      audit.log("pin_verified", { userId: result.user.id, ip });
      res.setHeader("Set-Cookie", userAuth.buildAuthCookie(result.token, { persistent: body.persistent !== false, secure }));
      send(res, 200, {
        user: result.user,
        nav: permissions.navForRole(result.user.role),
        stepUpUntil: result.stepUpUntil,
      });
    } catch (err) {
      audit.log("pin_failed", { ip });
      send(res, err.statusCode || 401, { error: err.message });
    }
    return true;
  }

  if (req.method === "POST" && parts[1] === "auth" && parts[2] === "bootstrap-login") {
    const body = await readJson(req);
    const secure = userAuth.authCookieSecure(req);
    try {
      await ensureBootstrapAdmin(userDb);
      const result = await userService.verifyPasswordLogin(userDb, {
        email: body.email,
        password: body.password,
        ipHash,
        userAgent: req.headers["user-agent"],
        persistent: body.persistent !== false,
        bootstrapOnly: true,
      });
      audit.log("bootstrap_login", { userId: result.user.id, ip });
      res.setHeader("Set-Cookie", userAuth.buildAuthCookie(result.token, { persistent: body.persistent !== false, secure }));
      let user = result.user;
      const repaired = await repairInstallAdminRole(userDb, user);
      if (repaired) user = userAuth.publicUser(repaired);
      send(res, 200, {
        user,
        nav: permissions.navForRole(user.role),
        stepUpUntil: result.stepUpUntil,
        requiresPinSetup: result.requiresPinSetup,
        bootstrapCompleted: result.bootstrapCompleted,
      });
    } catch (err) {
      audit.log("bootstrap_login_failed", { ip });
      send(res, err.statusCode || 401, { error: err.message });
    }
    return true;
  }

  if (req.method === "POST" && parts[1] === "auth" && parts[2] === "login-password") {
    const body = await readJson(req);
    const secure = userAuth.authCookieSecure(req);
    try {
      await ensureBootstrapAdmin(userDb);
      const result = await userService.verifyPasswordLogin(userDb, {
        email: body.email,
        password: body.password,
        ipHash,
        userAgent: req.headers["user-agent"],
        persistent: body.persistent !== false,
        bootstrapOnly: false,
        adminLogin: Boolean(body.adminLogin),
      });
      audit.log("password_login", { userId: result.user.id, ip });
      res.setHeader("Set-Cookie", userAuth.buildAuthCookie(result.token, { persistent: body.persistent !== false, secure }));
      let user = result.user;
      const repaired = await repairInstallAdminRole(userDb, user);
      if (repaired) user = userAuth.publicUser(repaired);
      send(res, 200, {
        user,
        nav: permissions.navForRole(user.role),
        stepUpUntil: result.stepUpUntil,
      });
    } catch (err) {
      audit.log("password_login_failed", { ip });
      send(res, err.statusCode || 401, { error: err.message });
    }
    return true;
  }

  if (req.method === "POST" && parts[1] === "auth" && parts[2] === "logout") {
    const cookies = userAuth.parseCookies(req.headers.cookie);
    const token = cookies[userAuth.AUTH_COOKIE];
    const auth = await resolveRequestAuth(req, userDb, ctx.legacyReadAdminKey, ctx.isLegacyAdmin);
    await userService.logout(userDb, token);
    if (auth.user) audit.log("user_logout", { userId: auth.user.id, ip });
    const secure = userAuth.authCookieSecure(req);
    res.setHeader("Set-Cookie", userAuth.clearAuthCookie(secure));
    send(res, 200, { ok: true });
    return true;
  }

  if (req.method === "POST" && parts[1] === "auth" && parts[2] === "password") {
    const body = await readJson(req);
    const auth = await resolveRequestAuth(req, userDb, ctx.legacyReadAdminKey, ctx.isLegacyAdmin);
    if (!auth.user) {
      send(res, 401, { error: "Nicht angemeldet" });
      return true;
    }
    try {
      await userService.changePassword(userDb, auth.user.id, body);
      audit.log("password_changed", { userId: auth.user.id, ip });
      send(res, 200, { ok: true });
    } catch (err) {
      send(res, err.statusCode || 400, { error: err.message });
    }
    return true;
  }

  if (req.method === "GET" && parts[1] === "auth" && parts[2] === "dev-mailbox") {
    if (!emailService.isDevMode()) {
      send(res, 404, { error: "Nicht verfügbar" });
      return true;
    }
    send(res, 200, { messages: emailService.getDevMailbox() });
    return true;
  }

  /* Benutzerverwaltung — Administrator, ADMIN_SECRET oder Erst-Setup ohne Admin */
  if (parts[1] === "users") {
    let auth = await resolveRequestAuth(req, userDb, ctx.legacyReadAdminKey, ctx.isLegacyAdmin);
    if (auth.user && userDb.supported) {
      const repaired = await repairInstallAdminRole(userDb, auth.user);
      if (repaired) auth = { ...auth, user: userAuth.publicUser(repaired) };
    }
    const adminCount = await userService.countAdmins(userDb);
    const bootstrap = adminCount === 0 && auth.viaSecret;
    const allowed =
      permissions.canManageUsers(auth.user) ||
      (req.method === "GET" && parts.length === 2 && permissions.canListUsersForTeamPick(auth.user)) ||
      bootstrap ||
      auth.viaSecret;

    if (!allowed) {
      send(res, 403, { error: "Keine Berechtigung" });
      return true;
    }

    if (req.method === "GET" && parts.length === 2) {
      const url = new URL(req.url, "http://local");
      const users = await userDb.listUsers({
        role: url.searchParams.get("role") || "",
        status: url.searchParams.get("status") || "",
        q: url.searchParams.get("q") || "",
      });
      send(res, 200, { users: publicUserList(users) });
      return true;
    }

    if (req.method === "POST" && parts.length === 2) {
      if (!adminStepUpOk(auth)) {
        rejectStepUp(res, send);
        return true;
      }
      const body = await readJson(req);
      try {
        const user = await userService.createUser(userDb, body, auth.user?.id || "bootstrap");
        audit.log("user_created", { userId: user.id, ip });
        send(res, 201, { user });
      } catch (err) {
        send(res, err.statusCode || 500, { error: err.message });
      }
      return true;
    }

    const userId = parts[2];
    if (!userId) return false;

    if (req.method === "PATCH" && parts.length === 3) {
      if (!adminStepUpOk(auth)) {
        rejectStepUp(res, send);
        return true;
      }
      const body = await readJson(req);
      const cur = await userDb.findUserById(userId);
      if (!cur) {
        send(res, 404, { error: "Benutzer nicht gefunden" });
        return true;
      }
      const patch = {};
      if (body.displayName != null) patch.displayName = String(body.displayName).trim().slice(0, 120);
      if (body.role != null) patch.role = userAuth.sanitizeRole(body.role);
      if (body.status != null) patch.status = userAuth.sanitizeStatus(body.status);
      if (body.comment != null) patch.comment = String(body.comment).slice(0, 500);
      const updated = await userDb.updateUser(userId, { ...cur, ...patch });
      if (body.role && body.role !== cur.role) {
        audit.log("user_role_changed", { userId, action: body.role, ip });
        await userDb.revokeSessionsForUser(userId);
      }
      if (body.status && body.status !== cur.status) {
        audit.log("user_status_changed", { userId, action: body.status, ip });
        if (body.status === "disabled" || body.status === "locked") {
          await userDb.revokeSessionsForUser(userId);
        }
      }
      send(res, 200, { user: userAuth.publicUser(updated) });
      return true;
    }

    if (req.method === "POST" && parts[3] === "reset-password") {
      if (!adminStepUpOk(auth)) {
        rejectStepUp(res, send);
        return true;
      }
      const body = await readJson(req);
      try {
        await userService.resetPassword(userDb, userId, body.password);
        audit.log("password_reset", { userId, ip });
        send(res, 200, { ok: true });
      } catch (err) {
        send(res, err.statusCode || 400, { error: err.message });
      }
      return true;
    }

    if (req.method === "POST" && parts[3] === "revoke-sessions") {
      if (!adminStepUpOk(auth)) {
        rejectStepUp(res, send);
        return true;
      }
      await userDb.revokeSessionsForUser(userId);
      audit.log("sessions_revoked", { userId, ip });
      send(res, 200, { ok: true });
      return true;
    }

    if (req.method === "POST" && parts[3] === "resend-pin") {
      if (!adminStepUpOk(auth)) {
        rejectStepUp(res, send);
        return true;
      }
      const cur = await userDb.findUserById(userId);
      if (!cur) {
        send(res, 404, { error: "Benutzer nicht gefunden" });
        return true;
      }
      const branding = brandingStore.load();
      try {
        await userService.requestPin(userDb, {
          email: cur.email,
          ipHash,
          lang: "de",
          appName: branding.appName || "Team Townhall",
        });
        audit.log("pin_requested", { userId, action: "admin_resend", ip });
        send(res, 200, { ok: true });
      } catch (err) {
        send(res, err.statusCode || 500, { error: err.message });
      }
      return true;
    }

    if (req.method === "DELETE" && parts.length === 3) {
      if (!adminStepUpOk(auth)) {
        rejectStepUp(res, send);
        return true;
      }
      await userDb.deleteUser(userId);
      audit.log("user_deleted", { userId, ip });
      send(res, 200, { ok: true });
      return true;
    }
  }

  return false;
}

module.exports = { handleAuthApi, resolveRequestAuth, clientIp, adminStepUpOk, rejectStepUp };
