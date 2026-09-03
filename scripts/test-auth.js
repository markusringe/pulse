#!/usr/bin/env node
/**
 * Tests für Benutzerverwaltung, PIN-Login und Berechtigungen.
 * Startet keinen Server — nutzt lib-Module direkt.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const userAuth = require("../lib/userAuth");
const pinLimiter = require("../lib/pinLimiter");
const permissions = require("../lib/permissions");
const { createUserDb, normalizeEmail } = require("../lib/userDb");
const userService = require("../lib/userService");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const tmpDb = path.join(os.tmpdir(), `pulse-auth-test-${process.pid}.db`);
process.env.SQLITE_PATH = tmpDb;
process.env.USER_AUTH_ENABLED = "1";
process.env.AUTH_DEV_MAILBOX = "1";
process.env.NODE_ENV = "development";

if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);

const userDb = createUserDb();
assert(userDb.supported, "SQLite userDb verfügbar");

(async () => {
  /* Kennwort-Hashing */
  const hash = userAuth.hashUserPassword("TestPasswort123!");
  assert(hash.includes(":"), "Passwort-Hash mit Salt");
  assert(userAuth.verifyUserPassword("TestPasswort123!", hash), "Passwort-Verifikation");
  assert(!userAuth.verifyUserPassword("falsch", hash), "Falsches Kennwort abgelehnt");
  assert(!hash.includes("TestPasswort"), "Kein Klartext im Hash");

  /* PIN */
  const pin = userAuth.generatePin();
  assert(/^\d{6}$/.test(pin), "PIN sechsstellig");
  const pinHash = userAuth.hashPin(pin);
  assert(userAuth.verifyPin(pin, pinHash), "PIN-Verifikation");
  assert(!userAuth.verifyPin("000000", pinHash), "Falsche PIN abgelehnt");
  assert(!pinHash.includes(pin), "PIN nicht im Hash");

  /* E-Mail-Normalisierung */
  assert(normalizeEmail("  Test@Example.COM ") === "test@example.com", "E-Mail normalisiert");

  /* Bootstrap-Admin */
  await userService.createUser(userDb, {
    displayName: "Admin Test",
    email: "admin@test.local",
    password: "InitPass123!",
    role: "admin",
    status: "active",
  });
  const adminCount = await userService.countAdmins(userDb);
  assert(adminCount === 1, "Ein Admin vorhanden");

  /* Bootstrap-Kennwort-Login ohne E-Mail */
  await userDb.setSetting("bootstrapPasswordLogin", "1");
  const emailService = require("../lib/emailService");
  emailService.reloadConfig();
  assert(await userService.isPasswordLoginMode(userDb), "Passwort-Modus bei Bootstrap");
  assert(await userService.isBootstrapPasswordLogin(userDb), "Bootstrap-Flag gesetzt");

  let pinBlocked = false;
  const prevDev = process.env.AUTH_DEV_MAILBOX;
  process.env.AUTH_DEV_MAILBOX = "0";
  emailService.reloadConfig();
  try {
    await userService.requestPin(userDb, { email: "admin@test.local", ipHash: "x", lang: "de" });
  } catch (err) {
    pinBlocked = err.statusCode === 503;
  }
  assert(pinBlocked, "PIN ohne SMTP blockiert wenn Dev-Mailbox aus");
  process.env.AUTH_DEV_MAILBOX = prevDev;
  emailService.reloadConfig();

  const pwLogin = await userService.verifyPasswordLogin(userDb, {
    email: "admin@test.local",
    password: "InitPass123!",
    ipHash: "abc",
    userAgent: "test",
    persistent: true,
    bootstrapOnly: true,
  });
  assert(pwLogin.token, "Bootstrap-Login erfolgreich");
  assert(!(await userService.isBootstrapPasswordLogin(userDb)), "Bootstrap-Flag nach Login gelöscht");

  /* Admin-Kennwort-Login auch bei aktivem PIN-Modus (SMTP konfiguriert) */
  assert(emailService.canSendPin(), "PIN-Modus nach Bootstrap aktiv");
  const adminPw = await userService.verifyPasswordLogin(userDb, {
    email: "admin@test.local",
    password: "InitPass123!",
    ipHash: "abc",
    userAgent: "test",
    persistent: true,
    adminLogin: true,
  });
  assert(adminPw.token, "Admin-Kennwort-Login bei PIN-Modus");
  await userService.logout(userDb, adminPw.token);

  /* Selbstregistrierung */
  await userDb.setSetting("selfRegistrationEnabled", "1");
  const settings = await userService.getSettings(userDb);
  assert(settings.selfRegistrationEnabled, "Selbstregistrierung an");
  const viewer = await userService.registerSelf(userDb, settings, {
    displayName: "Viewer",
    email: "viewer@test.local",
    password: "ViewerPass123!",
  });
  assert(viewer.role === "viewer", "Selbstregistrierung → viewer");

  let viewerPwBlocked = false;
  try {
    await userService.verifyPasswordLogin(userDb, {
      email: "viewer@test.local",
      password: "ViewerPass123!",
      adminLogin: true,
    });
  } catch (err) {
    viewerPwBlocked = err.statusCode === 401;
  }
  assert(viewerPwBlocked, "Nicht-Admin darf kein adminLogin-Kennwort");

  await userDb.setSetting("selfRegistrationEnabled", "0");
  const settingsOff = await userService.getSettings(userDb);
  let blocked = false;
  try {
    await userService.registerSelf(userDb, settingsOff, {
      displayName: "X",
      email: "x@test.local",
      password: "ViewerPass123!",
    });
  } catch (err) {
    blocked = err.statusCode === 403;
  }
  assert(blocked, "Selbstregistrierung deaktiviert blockiert");

  /* PIN-Flow */
  const pinReq = await userService.requestPin(userDb, {
    email: "admin@test.local",
    ipHash: "abc",
    lang: "de",
    appName: "Test",
  });
  assert(pinReq.ok, "PIN angefordert");

  const activePin = await userDb.findActivePin(
    (await userDb.findUserByEmail("admin@test.local")).id
  );
  assert(activePin, "Aktive PIN in DB");

  /* PIN aus Dev-Mailbox simulieren — wir kennen PIN nicht, erzeugen neuen Login-Flow mit bekanntem PIN */
  const pin2 = userAuth.generatePin();
  await userDb.expirePinsForUser((await userDb.findUserByEmail("admin@test.local")).id);
  await userDb.insertPin({
    id: userDb.newId("pin"),
    userId: (await userDb.findUserByEmail("admin@test.local")).id,
    pinHash: userAuth.hashPin(pin2),
    createdAt: Date.now(),
    expiresAt: Date.now() + userAuth.PIN_TTL_MS,
    ipHash: "abc",
  });

  const login = await userService.verifyPinLogin(userDb, {
    email: "admin@test.local",
    pin: pin2,
    ipHash: "abc",
    userAgent: "test",
    persistent: true,
  });
  assert(login.token, "Session-Token erzeugt");
  assert(login.user.role === "admin", "Admin eingeloggt");
  assert(login.stepUpUntil > Date.now(), "Frische Anmeldung mit Step-up");

  const session = await userService.resolveSession(userDb, login.token);
  assert(session?.user?.email === "admin@test.local", "Session auflösbar");
  assert(session?.session?.stepUpUntil > Date.now(), "Step-up in Session gespeichert");

  /* Step-up erneut per PIN */
  await userDb.updateSessionStepUp(session.session.id, Date.now() - 1000);
  const pin3 = userAuth.generatePin();
  await userDb.expirePinsForUser((await userDb.findUserByEmail("admin@test.local")).id);
  await userDb.insertPin({
    id: userDb.newId("pin"),
    userId: (await userDb.findUserByEmail("admin@test.local")).id,
    pinHash: userAuth.hashPin(pin3),
    createdAt: Date.now(),
    expiresAt: Date.now() + userAuth.PIN_TTL_MS,
    ipHash: "abc",
  });
  const stepUp = await userService.verifyStepUpPin(userDb, {
    userId: session.user.id,
    sessionId: session.session.id,
    pin: pin3,
  });
  assert(stepUp.stepUpUntil > Date.now(), "Step-up per PIN verlängert");

  const profile = await userService.updateProfile(userDb, session.user.id, { displayName: "Admin Geändert" });
  assert(profile.displayName === "Admin Geändert", "Profil aktualisiert");

  await userService.logout(userDb, login.token);
  const gone = await userService.resolveSession(userDb, login.token);
  assert(!gone, "Session nach Logout ungültig");

  /* Rollen */
  assert(permissions.canManageUsers({ role: "admin", status: "active" }), "admin darf Benutzer");
  assert(!permissions.canManageUsers({ role: "editor", status: "active" }), "editor nicht Benutzer");
  assert(permissions.canCreateEvent({ role: "editor", status: "active" }), "editor darf Events");
  assert(!permissions.canCreateEvent({ role: "viewer", status: "active" }), "viewer nicht Events");

  /* Event-Zugriff */
  const ev = {
    ownerUserId: "usr_owner",
    editorUserIds: [],
    presenterUserIds: ["usr_pres"],
    viewerUserIds: [],
  };
  const editorAccess = permissions.eventAccess({ id: "usr_owner", role: "editor", status: "active" }, ev);
  assert(editorAccess.edit && editorAccess.present, "Owner-Editor Vollzugriff");
  const viewerAccess = permissions.eventAccess({ id: "usr_pres", role: "viewer", status: "active" }, ev);
  assert(viewerAccess.present && !viewerAccess.edit, "Viewer present only");

  /* Rate-Limit PIN */
  pinLimiter.checkPinAttempt("rate@test.local", "ip1");
  pinLimiter.checkPinAttempt("rate@test.local", "ip1");
  pinLimiter.checkPinAttempt("rate@test.local", "ip1");
  pinLimiter.checkPinAttempt("rate@test.local", "ip1");
  pinLimiter.checkPinAttempt("rate@test.local", "ip1");
  const limited = pinLimiter.checkPinAttempt("rate@test.local", "ip1");
  assert(!limited.ok, "PIN-Versuche limitiert");

  console.log("test-auth: ok");
  try {
    fs.unlinkSync(tmpDb);
  } catch {
    /* ignore */
  }
})().catch((err) => {
  console.error("test-auth:", err.message);
  process.exit(1);
});
