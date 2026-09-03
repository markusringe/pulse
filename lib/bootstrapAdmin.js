/**
 * Standard-Administrator beim ersten Start anlegen.
 * Konfiguration über Umgebungsvariablen; sichere Defaults nur für lokale Entwicklung.
 */

const userService = require("./userService");
const userAuth = require("./userAuth");
const audit = require("./auditLogger");

/** Bootstrap-Zugangsdaten aus der Umgebung lesen. */
function bootstrapCredentials() {
  const displayName = String(process.env.BOOTSTRAP_ADMIN_NAME || "admin").trim().slice(0, 120);
  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@localhost").trim().toLowerCase();
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || "admin");
  const minLen = process.env.NODE_ENV === "production" ? 8 : 4;
  const valid = email.includes("@") && password.length >= minLen;
  return { displayName, email, password, minLen, valid };
}

/**
 * Installations-Kennwort auf den Bootstrap-Admin anwenden (Hash aktualisieren).
 * @returns {Promise<boolean>}
 */
async function syncBootstrapPassword(userDb, email, password) {
  const user = await Promise.resolve(userDb.findUserByEmail(email));
  if (!user || user.role !== "admin") return false;
  await Promise.resolve(
    userDb.updateUser(user.id, {
      ...user,
      passwordHash: userAuth.hashUserPassword(password),
      status: "active",
    })
  );
  return true;
}

/**
 * Legt den ersten Administrator an, wenn noch keiner existiert.
 * Synchronisiert das Installations-Kennwort solange der Erstlogin aussteht.
 * @param {import('./userDb').createUserDb extends Function ? ReturnType<typeof import('./userDb').createUserDb> : any} userDb
 */
async function ensureBootstrapAdmin(userDb) {
  if (!userDb?.supported) return { created: false, reason: "unsupported" };
  if (!userService.isUserManagementEnabled(userDb)) return { created: false, reason: "disabled" };

  const { displayName, email, password, minLen, valid } = bootstrapCredentials();
  if (!valid) {
    if (!email.includes("@")) {
      console.warn("[bootstrap] BOOTSTRAP_ADMIN_EMAIL ungültig — kein Admin angelegt");
      return { created: false, reason: "invalid_email" };
    }
    console.warn(`[bootstrap] BOOTSTRAP_ADMIN_PASSWORD zu kurz (min. ${minLen} Zeichen)`);
    return { created: false, reason: "invalid_password" };
  }

  await userDb.setSetting("userManagementEnabled", "1");

  const adminCount = await userService.countAdmins(userDb);
  let bootstrapPending = await userService.isBootstrapPasswordLogin(userDb);

  /* Admin existiert, Erstlogin noch nicht abgeschlossen — Kennwort aus .env übernehmen. */
  if (adminCount > 0) {
    if (!bootstrapPending) {
      const bootstrapUser = await Promise.resolve(userDb.findUserByEmail(email));
      if (bootstrapUser?.role === "admin" && !bootstrapUser.lastLoginAt) {
        await userDb.setSetting("bootstrapPasswordLogin", "1");
        bootstrapPending = true;
      }
    }
    if (bootstrapPending) {
      const synced = await syncBootstrapPassword(userDb, email, password);
      if (synced) {
        return { created: false, reason: "password_synced", email };
      }
    }
    return { created: false, reason: "exists" };
  }

  await userDb.setSetting("bootstrapPasswordLogin", "1");

  const existing = await Promise.resolve(userDb.findUserByEmail(email));
  if (existing) {
    await Promise.resolve(
      userDb.updateUser(existing.id, {
        ...existing,
        role: "admin",
        status: "active",
        passwordHash: userAuth.hashUserPassword(password),
      })
    );
    audit.log("user_role_changed", { userId: existing.id, action: "bootstrap_promote" });
    return { created: false, reason: "email_exists", email };
  }

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
    "bootstrap"
  );

  audit.log("user_created", { userId: email, action: "bootstrap_default_admin" });
  console.log(
    `[bootstrap] Administrator angelegt: ${displayName} <${email}> — Erstlogin mit Installations-Kennwort`
  );
  if (process.env.NODE_ENV !== "production") {
    console.log("[bootstrap] Entwicklung: optional Dev-Mailbox (AUTH_DEV_MAILBOX=1) oder Kennwort-Login");
  }
  return { created: true, email, displayName };
}

module.exports = { ensureBootstrapAdmin, bootstrapCredentials, syncBootstrapPassword };
