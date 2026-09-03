#!/usr/bin/env node
/**
 * Bootstrap: Ersten Administrator anlegen (lokal, authentifiziert via ADMIN_SECRET in .env).
 * Verwendung: node scripts/bootstrap-admin.js --name "Max" --email admin@example.org --password '***'
 * Das Kennwort wird nicht geloggt.
 */

const readline = require("readline");
const path = require("path");
const fs = require("fs");

try {
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && process.env[m[1]] == null) process.env[m[1]] = m[2];
    }
  }
} catch {
  /* ignore */
}

const { createUserDb } = require("../lib/userDb");
const userService = require("../lib/userService");

function parseArgs() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--name") out.name = argv[++i];
    else if (argv[i] === "--email") out.email = argv[++i];
    else if (argv[i] === "--password") out.password = argv[++i];
    else if (argv[i] === "--self-registration") out.selfRegistration = argv[++i];
  }
  return out;
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    rl._writeToOutput = () => {};
  });
}

(async () => {
  const args = parseArgs();
  const userDb = createUserDb();
  if (!userDb.supported) {
    console.error("Benutzerverwaltung erfordert SQLite/PostgreSQL.");
    process.exit(1);
  }
  const adminCount = await userService.countAdmins(userDb);
  if (adminCount > 0 && !process.env.FORCE_BOOTSTRAP) {
    console.error("Es existiert bereits ein Administrator. FORCE_BOOTSTRAP=1 zum Überschreiben.");
    process.exit(1);
  }
  const displayName = args.name || (await new Promise((r) => {
    readline.createInterface({ input: process.stdin, output: process.stdout }).question("Anzeigename: ", (a) => r(a.trim()));
  }));
  const email = args.email || (await new Promise((r) => {
    readline.createInterface({ input: process.stdin, output: process.stdout }).question("E-Mail: ", (a) => r(a.trim()));
  }));
  let password = args.password;
  if (!password) {
    password = await promptHidden("Initiales Kennwort (min. 8 Zeichen): ");
  }
  await userService.createUser(userDb, {
    displayName,
    email,
    password,
    role: "admin",
    status: "active",
    mustChangePassword: false,
  });
  if (args.selfRegistration === "1" || args.selfRegistration === "true") {
    await userDb.setSetting("selfRegistrationEnabled", "1");
  }
  await userDb.setSetting("userManagementEnabled", "1");
  console.log("Administrator angelegt. Anmeldung per E-Mail-PIN unter #/admin/login");
  console.log("ADMIN_SECRET in .env weiterhin sicher aufbewahren (Notfall/Bootstrap).");
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
