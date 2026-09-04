#!/usr/bin/env node
/**
 * Auth-Diagnose ohne Secrets — für VPS/Docker und lokale Fehlersuche.
 * Aufruf: npm run auth:diagnose   oder   node scripts/diagnose-auth.js
 */

const fs = require("fs");
const path = require("path");

/** .env laden, ohne Werte auszugeben. */
function loadEnvQuiet() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return { envPath, loaded: false };
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && process.env[m[1]] == null) process.env[m[1]] = m[2];
  }
  return { envPath, loaded: true };
}

/** Welche Auth-relevanten Variablen gesetzt sind (ohne Werte). */
function envFlags() {
  const keys = [
    "BOOTSTRAP_ADMIN_NAME",
    "BOOTSTRAP_ADMIN_EMAIL",
    "BOOTSTRAP_ADMIN_PASSWORD",
    "ADMIN_NAME",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD",
    "ADMIN_PASSWORD_HASH",
    "USER_AUTH_ENABLED",
    "AUTH_DEV_MAILBOX",
    "AUTH_COOKIE_SECURE",
    "NODE_ENV",
    "SQLITE_PATH",
    "DATABASE_URL",
  ];
  const present = {};
  for (const key of keys) {
    const raw = process.env[key];
    present[key] = raw != null && String(raw).trim() !== "" ? "set" : "missing";
  }
  if (present.ADMIN_PASSWORD_HASH === "set") {
    present.ADMIN_PASSWORD_HASH = "set (wird von Pulse ignoriert — BOOTSTRAP_ADMIN_PASSWORD verwenden)";
  }
  return present;
}

(async () => {
  const { envPath, loaded } = loadEnvQuiet();
  const { createUserDb } = require("../lib/userDb");
  const userService = require("../lib/userService");
  const emailService = require("../lib/emailService");
  const { bootstrapCredentials } = require("../lib/bootstrapAdmin");

  const userDb = createUserDb();
  const creds = bootstrapCredentials();

  const report = {
    ok: true,
    envFile: envPath,
    envFileLoaded: loaded,
    envFlags: envFlags(),
    userDb: {
      supported: Boolean(userDb.supported),
      kind: userDb.kind || "unknown",
    },
    bootstrap: {
      envEmailValid: creds.email.includes("@"),
      envPasswordConfigured: creds.envPasswordSet,
      envCredentialsValid: creds.valid,
    },
    auth: {
      userManagementEnabled: userDb.supported ? userService.isUserManagementEnabled(userDb) : false,
      adminCount: 0,
      userCount: 0,
      needsBootstrap: true,
      bootstrapPasswordLogin: false,
      passwordLoginMode: false,
      pinLoginAvailable: false,
    },
    email: emailService.healthInfo(),
    hints: [],
  };

  if (!userDb.supported) {
    report.ok = false;
    report.hints.push("Benutzerverwaltung erfordert SQLite/PostgreSQL — JSON-Fallback unterstützt kein Login.");
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const users = await Promise.resolve(userDb.listUsers({}));
  report.auth.userCount = users.length;
  report.auth.adminCount = await userService.countAdmins(userDb);
  report.auth.needsBootstrap = report.auth.adminCount === 0;
  report.auth.bootstrapPasswordLogin = await userService.isBootstrapPasswordLogin(userDb);
  report.auth.passwordLoginMode = await userService.isPasswordLoginMode(userDb);
  report.auth.pinLoginAvailable =
    emailService.canSendPin() && !report.auth.bootstrapPasswordLogin;

  const installUser = creds.email.includes("@")
    ? await Promise.resolve(userDb.findUserByEmail(creds.email))
    : null;
  if (installUser) {
    report.bootstrap.installUser = {
      email: installUser.email,
      role: installUser.role,
      status: installUser.status,
      hasLoggedIn: Boolean(installUser.lastLoginAt),
    };
  }

  if (report.envFlags.ADMIN_PASSWORD_HASH?.startsWith("set")) {
    report.hints.push(
      "ADMIN_PASSWORD_HASH in .env wird nicht ausgewertet — nur BOOTSTRAP_ADMIN_PASSWORD (Klartext, scrypt in DB)."
    );
  }
  if (!creds.envPasswordSet && report.auth.adminCount > 0 && !installUser?.lastLoginAt) {
    report.hints.push(
      "BOOTSTRAP_ADMIN_PASSWORD fehlt im Prozess — docker compose up nach .env-Änderung oder env_file prüfen."
    );
    report.ok = false;
  }
  if (report.auth.bootstrapPasswordLogin && !report.auth.passwordLoginMode) {
    report.hints.push("Bootstrap aktiv, aber Kennwort-Modus aus — Konfiguration prüfen.");
    report.ok = false;
  }
  if (!report.auth.pinLoginAvailable && !report.auth.passwordLoginMode) {
    report.hints.push("Weder PIN noch Kennwort-Login verfügbar — E-Mail konfigurieren oder Bootstrap abschließen.");
    report.ok = false;
  }
  if (report.auth.adminCount === 0 && !creds.valid) {
    report.hints.push("Kein Admin in DB und ungültige Bootstrap-.env — Installer oder npm run admin:reset.");
    report.ok = false;
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
})().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
