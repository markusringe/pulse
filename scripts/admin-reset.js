#!/usr/bin/env node
/**
 * Notfall: Admin-Kennwort zurücksetzen oder ersten Admin anlegen.
 * Nur lokal auf dem Server — Kennwort interaktiv, nie als CLI-Argument.
 *
 * Aufruf: npm run admin:reset
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");

/** .env aus Projektroot laden. */
function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && process.env[m[1]] == null) process.env[m[1]] = m[2];
  }
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || "").trim());
    });
  });
}

/** Kennwort ohne Echo (TTY). */
function askSecret(prompt) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      console.error("Interaktives Terminal erforderlich (kein Kennwort als Argument übergeben).");
      process.exit(1);
    }
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (ch) => {
      if (ch === "\n" || ch === "\r" || ch === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(value);
        return;
      }
      if (ch === "\u0003") process.exit(130);
      if (ch === "\u007f") {
        value = value.slice(0, -1);
        return;
      }
      value += ch;
    };
    stdin.on("data", onData);
  });
}

(async () => {
  loadEnv();
  const { createUserDb } = require("../lib/userDb");
  const userService = require("../lib/userService");
  const userAuth = require("../lib/userAuth");
  const { bootstrapCredentials, syncBootstrapPassword } = require("../lib/bootstrapAdmin");

  const userDb = createUserDb();
  if (!userDb.supported) {
    console.error("Benutzerverwaltung erfordert SQLite oder PostgreSQL.");
    process.exit(1);
  }

  await userDb.setSetting("userManagementEnabled", "1");

  const adminCount = await userService.countAdmins(userDb);
  const creds = bootstrapCredentials();
  let email = creds.email.includes("@") ? creds.email : "";
  let displayName = creds.displayName || "admin";

  console.log("Pulse — Admin-Kennwort zurücksetzen");
  console.log("(Events, Sessions, Teams und Branding bleiben unverändert.)\n");

  if (adminCount > 0) {
    const admins = (await Promise.resolve(userDb.listUsers({ role: "admin" }))).filter(
      (u) => u.status === "active" || u.status === "pending"
    );
    if (admins.length === 1) {
      email = admins[0].email;
      displayName = admins[0].displayName || displayName;
      console.log(`Vorhandener Administrator: ${email}`);
    } else {
      email = (await ask(`Admin E-Mail [${email || "admin@localhost"}]: `)) || email || "admin@localhost";
    }
    const confirm = await ask(`Kennwort für <${email}> wirklich zurücksetzen? [j/N]: `);
    if (!/^j/i.test(confirm)) {
      console.log("Abgebrochen.");
      process.exit(0);
    }
  } else {
    console.log("Kein Administrator in der Datenbank — Erst-Admin wird angelegt.");
    displayName = (await ask(`Anzeigename [${displayName}]: `)) || displayName;
    email = (await ask(`E-Mail [${email || "admin@localhost"}]: `)) || email || "admin@localhost";
  }

  let password = "";
  while (password.length < 8) {
    password = await askSecret("Neues Kennwort (mind. 8 Zeichen): ");
    if (password.length < 8) console.log("Kennwort zu kurz.");
  }
  const password2 = await askSecret("Kennwort wiederholen: ");
  if (password !== password2) {
    console.error("Kennwörter stimmen nicht überein.");
    process.exit(1);
  }

  const existing = await Promise.resolve(userDb.findUserByEmail(email));
  if (existing) {
    await Promise.resolve(
      userDb.updateUser(existing.id, {
        ...existing,
        displayName,
        role: "admin",
        status: "active",
        passwordHash: userAuth.hashUserPassword(password),
        mustChangePassword: false,
      })
    );
    await userDb.setSetting("bootstrapPasswordLogin", "1");
    console.log(`Kennwort für ${email} wurde zurückgesetzt.`);
  } else {
    await userService.createUser(
      userDb,
      {
        displayName,
        email,
        password,
        role: "admin",
        status: "active",
        mustChangePassword: false,
        bootstrap: true,
      },
      "admin_reset"
    );
    await userDb.setSetting("bootstrapPasswordLogin", "1");
    console.log(`Administrator ${email} wurde angelegt.`);
  }

  /* Optional .env synchron halten — nur wenn BOOTSTRAP_ADMIN_EMAIL passt. */
  if (creds.email.toLowerCase() === email.toLowerCase()) {
    await syncBootstrapPassword(userDb, email, password);
  }

  console.log("Anmeldung: #/admin/login mit E-Mail und neuem Kennwort.");
  console.log("Tipp: Nach erfolgreichem Erstlogin BOOTSTRAP_ADMIN_PASSWORD aus .env entfernen.");
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
