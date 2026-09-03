/**
 * Standard-Administrator beim ersten Start anlegen.
 * Konfiguration über Umgebungsvariablen; sichere Defaults nur für lokale Entwicklung.
 */

const userService = require("./userService");
const userAuth = require("./userAuth");
const audit = require("./auditLogger");

/** Bootstrap-Zugangsdaten aus der Umgebung lesen (BOOTSTRAP_* oder Legacy ADMIN_*). */
function bootstrapCredentials() {
  const displayName = String(
    process.env.BOOTSTRAP_ADMIN_NAME || process.env.ADMIN_NAME || "admin"
  )
    .trim()
    .slice(0, 120);
  const email = String(
    process.env.BOOTSTRAP_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "admin@localhost"
  )
    .trim()
    .toLowerCase();
  /* Klartext-Kennwort — wird beim Anlegen mit scrypt gehasht (nicht ADMIN_PASSWORD_HASH). */
  const password = String(
    process.env.BOOTSTRAP_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "admin"
  );
  const minLen = process.env.NODE_ENV === "production" ? 8 : 4;
  const valid = email.includes("@") && password.length >= minLen;
  const envPasswordSet = Boolean(
    String(process.env.BOOTSTRAP_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "").trim()
  );
  if (process.env.NODE_ENV === "production" && !envPasswordSet) {
    console.warn(
      "[bootstrap] BOOTSTRAP_ADMIN_PASSWORD fehlt im Prozess — .env per docker-compose env_file laden oder Container neu starten"
    );
  }
  return { displayName, email, password, minLen, valid, envPasswordSet };
}

/**
 * Installations-Kennwort auf den Bootstrap-Admin anwenden (Hash aktualisieren).
 * @returns {Promise<boolean>}
 */
async function syncBootstrapPassword(userDb, email, password) {
  const user = await Promise.resolve(userDb.findUserByEmail(email));
  if (!user) return false;
  await Promise.resolve(
    userDb.updateUser(user.id, {
      ...user,
      role: "admin",
      passwordHash: userAuth.hashUserPassword(password),
      status: "active",
    })
  );
  return true;
}

/**
 * Korrigiert einen fälschlich angelegten Bootstrap-Admin (z. B. admin@localhost ohne .env im Container).
 * @returns {Promise<boolean>}
 */
async function reconcileBootstrapAdmin(userDb, { email, password, displayName }) {
  const target = await Promise.resolve(userDb.findUserByEmail(email));
  if (target) {
    return syncBootstrapPassword(userDb, email, password);
  }

  const adminCount = await userService.countAdmins(userDb);
  if (adminCount !== 1) return false;

  const admins = await Promise.resolve(userDb.listUsers({ role: "admin" }));
  if (!Array.isArray(admins) || admins.length !== 1) return false;

  const lone = admins[0];
  if (lone.lastLoginAt) return false;

  await Promise.resolve(
    userDb.updateUser(lone.id, {
      ...lone,
      email,
      displayName: displayName || lone.displayName,
      role: "admin",
      status: "active",
      passwordHash: userAuth.hashUserPassword(password),
    })
  );
  console.log(`[bootstrap] Admin-Konto auf Installations-E-Mail korrigiert: <${email}>`);
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
      /* Erstlogin ausstehend — auch wenn die Rolle fälschlich nicht admin ist (Reparatur). */
      if (bootstrapUser && !bootstrapUser.lastLoginAt) {
        await userDb.setSetting("bootstrapPasswordLogin", "1");
        bootstrapPending = true;
      }
    }
    /* Installations-E-Mail existiert, aber ohne Admin-Rolle — sofort korrigieren. */
    const installUser = await Promise.resolve(userDb.findUserByEmail(email));
    if (installUser && installUser.role !== "admin") {
      await Promise.resolve(
        userDb.updateUser(installUser.id, {
          ...installUser,
          role: "admin",
          status: "active",
          displayName: displayName || installUser.displayName,
          passwordHash: userAuth.hashUserPassword(password),
        })
      );
      audit.log("user_role_changed", { userId: installUser.id, action: "bootstrap_admin_restore" });
      console.log(`[bootstrap] Administrator-Rechte wiederhergestellt: <${email}>`);
      return { created: false, reason: "role_restored", email };
    }
    if (bootstrapPending) {
      const synced = await reconcileBootstrapAdmin(userDb, { email, password, displayName });
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
