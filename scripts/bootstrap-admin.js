#!/usr/bin/env node
/**
 * Bootstrap: Ersten Administrator anlegen oder per ensureBootstrapAdmin synchronisieren.
 * Verwendung: npm run bootstrap:admin
 * Notfall-Kennwort: npm run admin:reset
 */

const path = require("path");
const fs = require("fs");

try {
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && process.env[m[1]] == null) process.env[m[1]] = m[2];
    }
  }
} catch {
  /* ignore */
}

const { createUserDb } = require("../lib/userDb");
const { ensureBootstrapAdmin, bootstrapCredentials } = require("../lib/bootstrapAdmin");

(async () => {
  const userDb = createUserDb();
  if (!userDb.supported) {
    console.error("Benutzerverwaltung erfordert SQLite/PostgreSQL.");
    process.exit(1);
  }
  const creds = bootstrapCredentials();
  if (!creds.valid) {
    console.error(
      "Bootstrap-.env unvollständig — BOOTSTRAP_ADMIN_EMAIL und BOOTSTRAP_ADMIN_PASSWORD (mind. 8 Zeichen in Produktion) setzen."
    );
    process.exit(1);
  }
  const result = await ensureBootstrapAdmin(userDb);
  if (result.created) {
    console.log(`Administrator angelegt: ${result.email}`);
  } else if (result.reason === "password_synced") {
    console.log(`Installations-Kennwort synchronisiert: ${result.email}`);
  } else if (result.reason === "role_restored") {
    console.log(`Admin-Rechte wiederhergestellt: ${result.email}`);
  } else if (result.reason === "exists") {
    console.log("Administrator existiert bereits — Erstlogin unter #/admin/login mit Installations-Kennwort.");
  } else {
    console.log(`Bootstrap: ${result.reason || "keine Änderung"}`);
  }
  console.log("Diagnose: npm run auth:diagnose");
  console.log("Notfall-Reset: npm run admin:reset");
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
