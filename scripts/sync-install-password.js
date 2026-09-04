#!/usr/bin/env node
/**
 * Installations-Kennwort aus .env in die Benutzer-DB schreiben (VPS-Notfall).
 * Kein interaktives Kennwort — nutzt BOOTSTRAP_ADMIN_PASSWORD aus der Umgebung.
 * Aufruf: npm run sync:install-password
 */

const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && process.env[m[1]] == null) process.env[m[1]] = m[2];
  }
}

(async () => {
  loadEnv();
  const { createUserDb } = require("../lib/userDb");
  const { ensureBootstrapAdmin, syncInstallPasswordFromEnv, bootstrapCredentials } = require("../lib/bootstrapAdmin");

  const userDb = createUserDb();
  if (!userDb.supported) {
    console.error(JSON.stringify({ ok: false, error: "Benutzerverwaltung nicht verfügbar" }));
    process.exit(1);
  }

  const creds = bootstrapCredentials();
  if (!creds.valid || !creds.envPasswordSet) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "BOOTSTRAP_ADMIN_EMAIL und BOOTSTRAP_ADMIN_PASSWORD in .env setzen (mind. 8 Zeichen in Produktion)",
      })
    );
    process.exit(1);
  }

  await ensureBootstrapAdmin(userDb);
  const synced = await syncInstallPasswordFromEnv(userDb);
  const user = await Promise.resolve(userDb.findUserByEmail(creds.email));

  console.log(
    JSON.stringify(
      {
        ok: Boolean(user),
        synced,
        email: creds.email,
        hasLoggedIn: Boolean(user?.lastLoginAt),
        hint: synced
          ? "Kennwort aus .env übernommen — jetzt unter #/admin/login anmelden"
          : "Keine Änderung nötig oder Sync nicht möglich — ggf. npm run admin:reset",
      },
      null,
      2
    )
  );
  process.exit(user ? 0 : 1);
})().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
