#!/usr/bin/env node
/**
 * Bootstrap-Admin: ein Admin, Kennwort-Sync, kein Doppel-Anlegen.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const userAuth = require("../lib/userAuth");
const { createUserDb } = require("../lib/userDb");
const userService = require("../lib/userService");
const {
  ensureBootstrapAdmin,
  syncInstallPasswordFromEnv,
  bootstrapCredentials,
} = require("../lib/bootstrapAdmin");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const tmpDb = path.join(os.tmpdir(), `pulse-bootstrap-${process.pid}.db`);
if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);

process.env.SQLITE_PATH = tmpDb;
process.env.USER_AUTH_ENABLED = "1";
process.env.NODE_ENV = "test";
process.env.BOOTSTRAP_ADMIN_NAME = "Install Admin";
process.env.BOOTSTRAP_ADMIN_EMAIL = "bootstrap@test.local";
process.env.BOOTSTRAP_ADMIN_PASSWORD = "BootstrapPass123!";
process.env.AUTH_DEV_MAILBOX = "1";

const userDb = createUserDb();
assert(userDb.supported, "SQLite userDb");

(async () => {
  const first = await ensureBootstrapAdmin(userDb);
  assert(first.created, "Erster Start legt Admin an");
  assert((await userService.countAdmins(userDb)) === 1, "Genau ein Admin");

  const second = await ensureBootstrapAdmin(userDb);
  assert(!second.created, "Zweiter Start erzeugt keinen weiteren Admin");
  assert((await userService.countAdmins(userDb)) === 1, "Immer noch ein Admin");

  const creds = bootstrapCredentials();
  const row = await userDb.findUserByEmail(creds.email);
  assert(userAuth.verifyUserPassword(creds.password, row.passwordHash), "Bootstrap-Kennwort verifizierbar");

  await userDb.updateUser(row.id, {
    ...row,
    passwordHash: userAuth.hashUserPassword("AltPasswort99!"),
  });
  assert(await syncInstallPasswordFromEnv(userDb), "Env-Sync nach Hash-Abweichung");
  const resynced = await userDb.findUserByEmail(creds.email);
  assert(userAuth.verifyUserPassword(creds.password, resynced.passwordHash), "Hash nach Env-Sync");

  assert(await userService.isBootstrapPasswordLogin(userDb), "Bootstrap-Modus aktiv");
  assert(await userService.isPasswordLoginMode(userDb), "Passwort-Login verfügbar");

  console.log("Bootstrap-Tests OK");
  try {
    fs.unlinkSync(tmpDb);
  } catch {
    /* ignore */
  }
})().catch((err) => {
  console.error("Bootstrap-Test fehlgeschlagen:", err.message);
  process.exit(1);
});
