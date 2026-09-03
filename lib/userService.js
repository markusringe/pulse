/**
 * Benutzer-Service: Anlegen, Aktualisieren, PIN-Login, Sitzungen.
 */

const { normalizeEmail } = require("./userDb");
const userAuth = require("./userAuth");
const pinLimiter = require("./pinLimiter");
const emailService = require("./emailService");
const { stepUpExpiresAt } = require("./stepUpAuth");

function isUserManagementEnabled(userDb) {
  if (!userDb.supported) return false;
  const env = process.env.USER_AUTH_ENABLED;
  if (env != null && String(env).trim() !== "") {
    return !/^(0|false|off|no|disabled)$/i.test(String(env).trim());
  }
  const setting = userDb.getSetting?.("userManagementEnabled");
  if (setting != null) return setting === "1" || setting === "true";
  return true;
}

async function dbCall(fn, ...args) {
  const r = fn(...args);
  return r instanceof Promise ? r : r;
}

async function getSettings(userDb) {
  const all = await dbCall(userDb.getAllSettings.bind(userDb));
  return {
    userManagementEnabled: isUserManagementEnabled(userDb),
    selfRegistrationEnabled: all.selfRegistrationEnabled === "1" || all.selfRegistrationEnabled === "true",
    requirePasswordChangeOnFirstLogin: all.requirePasswordChangeOnFirstLogin !== "0",
  };
}

async function setSettings(userDb, patch) {
  if (patch.selfRegistrationEnabled != null) {
    await dbCall(userDb.setSetting.bind(userDb), "selfRegistrationEnabled", patch.selfRegistrationEnabled ? "1" : "0");
  }
  if (patch.requirePasswordChangeOnFirstLogin != null) {
    await dbCall(
      userDb.setSetting.bind(userDb),
      "requirePasswordChangeOnFirstLogin",
      patch.requirePasswordChangeOnFirstLogin ? "1" : "0"
    );
  }
  if (patch.userManagementEnabled != null) {
    await dbCall(userDb.setSetting.bind(userDb), "userManagementEnabled", patch.userManagementEnabled ? "1" : "0");
  }
  return getSettings(userDb);
}

async function countAdmins(userDb) {
  const users = await dbCall(userDb.listUsers.bind(userDb), {});
  return users.filter((u) => u.role === "admin" && u.status === "active").length;
}

/** Ob der Erstlogin noch das Installations-Kennwort erfordert. */
async function isBootstrapPasswordLogin(userDb) {
  const v = await dbCall(userDb.getSetting.bind(userDb), "bootstrapPasswordLogin");
  return v === "1" || v === "true";
}

/** Ob nach Erstlogin optional ein Backup eingespielt werden kann. */
async function isOnboardingBackupPending(userDb) {
  const v = await dbCall(userDb.getSetting.bind(userDb), "onboardingBackupPending");
  return v === "1" || v === "true";
}

/** Ersteinrichtungs-Schritt „Backup einspielen“ abschließen (übersprungen oder erledigt). */
async function completeOnboardingBackup(userDb) {
  await dbCall(userDb.setSetting.bind(userDb), "onboardingBackupPending", "0");
}

/** Ob Anmeldung per Kennwort statt PIN aktiv ist (Bootstrap oder E-Mail deaktiviert). */
async function isPasswordLoginMode(userDb) {
  if (await isBootstrapPasswordLogin(userDb)) return true;
  return !emailService.canSendPin();
}

async function createUser(userDb, { displayName, email, password, role, status, comment, mustChangePassword, bootstrap }, actorId) {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@")) {
    const err = new Error("Ungültige E-Mail-Adresse");
    err.statusCode = 400;
    throw err;
  }
  const existing = await dbCall(userDb.findUserByEmail.bind(userDb), normalized);
  if (existing) {
    const err = new Error("E-Mail bereits registriert");
    err.statusCode = 409;
    throw err;
  }
  const minLen = bootstrap ? 4 : 8;
  if (!password || String(password).length < minLen) {
    const err = new Error(`Kennwort mindestens ${minLen} Zeichen`);
    err.statusCode = 400;
    throw err;
  }
  const now = Date.now();
  const row = {
    id: userDb.newId("usr"),
    displayName: String(displayName || "").trim().slice(0, 120) || normalized.split("@")[0],
    email: normalized,
    passwordHash: userAuth.hashUserPassword(password),
    role: userAuth.sanitizeRole(role || "viewer"),
    status: userAuth.sanitizeStatus(status || "active"),
    comment: String(comment || "").slice(0, 500),
    createdAt: now,
    lastPasswordChangeAt: now,
    mustChangePassword: Boolean(mustChangePassword),
  };
  await dbCall(userDb.insertUser.bind(userDb), row);
  return userAuth.publicUser(row);
}

async function registerSelf(userDb, settings, { displayName, email, password }) {
  if (!settings.selfRegistrationEnabled) {
    const err = new Error("Selbstregistrierung ist deaktiviert");
    err.statusCode = 403;
    throw err;
  }
  return createUser(userDb, {
    displayName,
    email,
    password,
    role: "viewer",
    status: "active",
    mustChangePassword: false,
  });
}

async function requestPin(userDb, { email, ipHash, lang, appName }) {
  if (!emailService.canSendPin()) {
    const err = new Error("E-Mail-Versand ist nicht konfiguriert — Anmeldung per Kennwort");
    err.statusCode = 503;
    throw err;
  }

  const normalized = normalizeEmail(email);
  const limit = pinLimiter.checkPinSend(normalized, ipHash);
  if (!limit.ok) {
    const err = new Error("Zu viele Code-Anforderungen — bitte später erneut versuchen");
    err.statusCode = 429;
    err.retryAfterMs = limit.retryAfterMs;
    throw err;
  }

  const user = await dbCall(userDb.findUserByEmail.bind(userDb), normalized);
  /* Keine konkrete Aussage, ob Konto existiert */
  if (!user || user.status === "disabled") {
    return { ok: true, generic: true };
  }
  if (user.status === "locked") {
    return { ok: true, generic: true };
  }

  const pin = userAuth.generatePin();
  const now = Date.now();
  await dbCall(userDb.expirePinsForUser.bind(userDb), user.id);
  await dbCall(userDb.insertPin.bind(userDb), {
    id: userDb.newId("pin"),
    userId: user.id,
    pinHash: userAuth.hashPin(pin),
    createdAt: now,
    expiresAt: now + userAuth.PIN_TTL_MS,
    ipHash,
  });
  await dbCall(userDb.updateUser.bind(userDb), user.id, { lastPinRequestAt: now });

  const send = await emailService.sendPinEmail({
    to: user.email,
    pin,
    lang: lang || "de",
    appName,
    ttlMinutes: 10,
  });

  if (!send.ok) {
    const err = new Error("E-Mail konnte nicht versendet werden");
    err.statusCode = 503;
    throw err;
  }

  return { ok: true, userId: user.id, expiresAt: now + userAuth.PIN_TTL_MS, emailMode: send.mode };
}

async function verifyPinLogin(userDb, { email, pin, ipHash, userAgent, persistent }) {
  const normalized = normalizeEmail(email);
  const limit = pinLimiter.checkPinAttempt(normalized, ipHash);
  if (!limit.ok) {
    const err = new Error("Zu viele Fehlversuche — bitte später erneut versuchen");
    err.statusCode = 429;
    err.retryAfterMs = limit.retryAfterMs;
    throw err;
  }

  const user = await dbCall(userDb.findUserByEmail.bind(userDb), normalized);
  if (!user || user.status !== "active" && user.status !== "pending") {
    const err = new Error("Anmeldung fehlgeschlagen");
    err.statusCode = 401;
    throw err;
  }

  const activePin = await dbCall(userDb.findActivePin.bind(userDb), user.id);
  if (!activePin || !userAuth.verifyPin(String(pin || "").trim(), activePin.pinHash)) {
    const err = new Error("Anmeldung fehlgeschlagen");
    err.statusCode = 401;
    throw err;
  }

  const now = Date.now();
  await dbCall(userDb.markPinUsed.bind(userDb), activePin.id, now);

  const token = userAuth.generateSessionToken();
  const ttl = persistent ? userAuth.SESSION_TTL_MS : userAuth.SESSION_SHORT_TTL_MS;
  const sessionId = userDb.newId("ses");
  await dbCall(userDb.insertSession.bind(userDb), {
    id: sessionId,
    userId: user.id,
    tokenHash: userAuth.hashSessionToken(token),
    createdAt: now,
    expiresAt: now + ttl,
    lastSeenAt: now,
    ipHash,
    userAgent: String(userAgent || "").slice(0, 300),
    persistent: Boolean(persistent),
  });
  /* Frische PIN-Anmeldung gilt als Step-up für kritische Admin-Aktionen */
  await dbCall(userDb.updateSessionStepUp.bind(userDb), sessionId, stepUpExpiresAt());

  const nextStatus = user.status === "pending" ? "active" : user.status;
  await dbCall(userDb.updateUser.bind(userDb), user.id, { lastLoginAt: now, status: nextStatus });

  return {
    token,
    user: userAuth.publicUser({ ...user, status: nextStatus, lastLoginAt: now }),
    stepUpUntil: stepUpExpiresAt(),
  };
}

/**
 * Anmeldung per Kennwort (Bootstrap-Erstlogin oder wenn E-Mail deaktiviert).
 * @param {object} userDb
 * @param {{ email: string, password: string, ipHash?: string, userAgent?: string, persistent?: boolean, bootstrapOnly?: boolean }} opts
 */
async function verifyPasswordLogin(userDb, { email, password, ipHash, userAgent, persistent, bootstrapOnly }) {
  const normalized = normalizeEmail(email);
  const bootstrapPending = await isBootstrapPasswordLogin(userDb);
  const passwordMode = await isPasswordLoginMode(userDb);

  if (bootstrapOnly && !bootstrapPending) {
    const err = new Error("Bootstrap-Anmeldung nicht mehr verfügbar — bitte E-Mail-Code oder Kennwort-Login verwenden");
    err.statusCode = 403;
    throw err;
  }
  if (!bootstrapOnly && !passwordMode) {
    const err = new Error("Anmeldung per Kennwort nicht verfügbar — bitte E-Mail-Code verwenden");
    err.statusCode = 403;
    throw err;
  }

  const user = await dbCall(userDb.findUserByEmail.bind(userDb), normalized);
  if (!user || (user.status !== "active" && user.status !== "pending")) {
    const err = new Error(
      bootstrapOnly || bootstrapPending
        ? "Anmeldung fehlgeschlagen — prüfen Sie E-Mail und Installations-Kennwort"
        : "Anmeldung fehlgeschlagen"
    );
    err.statusCode = 401;
    throw err;
  }

  if (!userAuth.verifyUserPassword(String(password || ""), user.passwordHash)) {
    const err = new Error(
      bootstrapOnly || bootstrapPending
        ? "Anmeldung fehlgeschlagen — prüfen Sie E-Mail und Installations-Kennwort"
        : "Anmeldung fehlgeschlagen"
    );
    err.statusCode = 401;
    throw err;
  }

  const now = Date.now();
  const token = userAuth.generateSessionToken();
  const ttl = persistent ? userAuth.SESSION_TTL_MS : userAuth.SESSION_SHORT_TTL_MS;
  const sessionId = userDb.newId("ses");
  await dbCall(userDb.insertSession.bind(userDb), {
    id: sessionId,
    userId: user.id,
    tokenHash: userAuth.hashSessionToken(token),
    createdAt: now,
    expiresAt: now + ttl,
    lastSeenAt: now,
    ipHash,
    userAgent: String(userAgent || "").slice(0, 300),
    persistent: Boolean(persistent),
  });
  await dbCall(userDb.updateSessionStepUp.bind(userDb), sessionId, stepUpExpiresAt());

  const nextStatus = user.status === "pending" ? "active" : user.status;
  await dbCall(userDb.updateUser.bind(userDb), user.id, { lastLoginAt: now, status: nextStatus });

  let requiresPinSetup = false;
  if (bootstrapPending) {
    await dbCall(userDb.setSetting.bind(userDb), "bootstrapPasswordLogin", "0");
    requiresPinSetup = emailService.canSendPin();
  }

  return {
    token,
    user: userAuth.publicUser({ ...user, status: nextStatus, lastLoginAt: now }),
    stepUpUntil: stepUpExpiresAt(),
    requiresPinSetup,
    bootstrapCompleted: bootstrapPending,
  };
}

async function resolveSession(userDb, token) {
  if (!token) return null;
  const hash = userAuth.hashSessionToken(token);
  const session = await dbCall(userDb.findSessionByTokenHash.bind(userDb), hash);
  if (!session || session.expiresAt < Date.now()) {
    if (session) await dbCall(userDb.revokeSession.bind(userDb), session.id);
    return null;
  }
  const user = await dbCall(userDb.findUserById.bind(userDb), session.userId);
  if (!user || user.status === "disabled" || user.status === "locked") {
    await dbCall(userDb.revokeSession.bind(userDb), session.id);
    return null;
  }
  await dbCall(userDb.touchSession.bind(userDb), session.id, Date.now());
  return { session, user: userAuth.publicUser(user) };
}

async function logout(userDb, token) {
  if (!token) return;
  const hash = userAuth.hashSessionToken(token);
  const session = await dbCall(userDb.findSessionByTokenHash.bind(userDb), hash);
  if (session) await dbCall(userDb.revokeSession.bind(userDb), session.id);
}

async function changePassword(userDb, userId, { currentPassword, newPassword }) {
  const user = await dbCall(userDb.findUserById.bind(userDb), userId);
  if (!user) {
    const err = new Error("Benutzer nicht gefunden");
    err.statusCode = 404;
    throw err;
  }
  if (!userAuth.verifyUserPassword(currentPassword, user.passwordHash)) {
    const err = new Error("Aktuelles Kennwort ist falsch");
    err.statusCode = 401;
    throw err;
  }
  if (!newPassword || String(newPassword).length < 8) {
    const err = new Error("Neues Kennwort mindestens 8 Zeichen");
    err.statusCode = 400;
    throw err;
  }
  const now = Date.now();
  await dbCall(userDb.updateUser.bind(userDb), userId, {
    passwordHash: userAuth.hashUserPassword(newPassword),
    lastPasswordChangeAt: now,
    mustChangePassword: false,
  });
  await dbCall(userDb.revokeSessionsForUser.bind(userDb), userId);
  return { ok: true };
}

async function resetPassword(userDb, userId, newPassword) {
  if (!newPassword || String(newPassword).length < 8) {
    const err = new Error("Kennwort mindestens 8 Zeichen");
    err.statusCode = 400;
    throw err;
  }
  const now = Date.now();
  await dbCall(userDb.updateUser.bind(userDb), userId, {
    passwordHash: userAuth.hashUserPassword(newPassword),
    lastPasswordChangeAt: now,
    mustChangePassword: true,
  });
  await dbCall(userDb.revokeSessionsForUser.bind(userDb), userId);
  return { ok: true };
}

/**
 * Erneute PIN-Bestätigung für privilegierte Admin-Aktionen.
 * @param {object} userDb
 * @param {{ userId: string, sessionId: string, pin: string }} opts
 */
async function verifyStepUpPin(userDb, { userId, sessionId, pin }) {
  const user = await dbCall(userDb.findUserById.bind(userDb), userId);
  if (!user || user.status === "disabled" || user.status === "locked") {
    const err = new Error("Anmeldung fehlgeschlagen");
    err.statusCode = 401;
    throw err;
  }
  const activePin = await dbCall(userDb.findActivePin.bind(userDb), user.id);
  if (!activePin || !userAuth.verifyPin(String(pin || "").trim(), activePin.pinHash)) {
    const err = new Error("Ungültiger oder abgelaufener Anmeldecode");
    err.statusCode = 401;
    throw err;
  }
  const now = Date.now();
  await dbCall(userDb.markPinUsed.bind(userDb), activePin.id, now);
  const until = stepUpExpiresAt();
  await dbCall(userDb.updateSessionStepUp.bind(userDb), sessionId, until);
  return { stepUpUntil: until };
}

/**
 * Eigenes Profil aktualisieren (Anzeigename).
 * @param {object} userDb
 * @param {string} userId
 * @param {{ displayName?: string }} patch
 */
async function updateProfile(userDb, userId, patch) {
  const user = await dbCall(userDb.findUserById.bind(userDb), userId);
  if (!user) {
    const err = new Error("Benutzer nicht gefunden");
    err.statusCode = 404;
    throw err;
  }
  const displayName = String(patch.displayName ?? user.displayName).trim().slice(0, 120);
  if (!displayName) {
    const err = new Error("Anzeigename erforderlich");
    err.statusCode = 400;
    throw err;
  }
  const updated = await dbCall(userDb.updateUser.bind(userDb), userId, { displayName });
  return userAuth.publicUser(updated);
}

module.exports = {
  isUserManagementEnabled,
  getSettings,
  setSettings,
  countAdmins,
  isBootstrapPasswordLogin,
  isPasswordLoginMode,
  isOnboardingBackupPending,
  completeOnboardingBackup,
  createUser,
  registerSelf,
  requestPin,
  verifyPinLogin,
  verifyPasswordLogin,
  resolveSession,
  logout,
  changePassword,
  resetPassword,
  verifyStepUpPin,
  updateProfile,
};
