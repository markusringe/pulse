/**
 * Standard-Administrator beim ersten Start anlegen.
 * Konfiguration über Umgebungsvariablen; sichere Defaults nur für lokale Entwicklung.
 */

const userService = require("./userService");
const audit = require("./auditLogger");

/**
 * Legt den ersten Administrator an, wenn noch keiner existiert.
 * @param {import('./userDb').createUserDb extends Function ? ReturnType<typeof import('./userDb').createUserDb> : any} userDb
 */
async function ensureBootstrapAdmin(userDb) {
  if (!userDb?.supported) return { created: false, reason: "unsupported" };
  if (!userService.isUserManagementEnabled(userDb)) return { created: false, reason: "disabled" };

  const adminCount = await userService.countAdmins(userDb);
  if (adminCount > 0) return { created: false, reason: "exists" };

  const displayName = String(process.env.BOOTSTRAP_ADMIN_NAME || "admin").trim().slice(0, 120);
  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@localhost").trim().toLowerCase();
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || "admin");

  if (!email.includes("@")) {
    console.warn("[bootstrap] BOOTSTRAP_ADMIN_EMAIL ungültig — kein Admin angelegt");
    return { created: false, reason: "invalid_email" };
  }
  const minLen = process.env.NODE_ENV === "production" ? 8 : 4;
  if (!password || password.length < minLen) {
    console.warn(`[bootstrap] BOOTSTRAP_ADMIN_PASSWORD zu kurz (min. ${minLen} Zeichen)`);
    return { created: false, reason: "invalid_password" };
  }

  await userDb.setSetting("userManagementEnabled", "1");
  /* Erstlogin per Installations-Kennwort — kein E-Mail-Versand bis Admin SMTP konfiguriert. */
  await userDb.setSetting("bootstrapPasswordLogin", "1");

  const existing = await Promise.resolve(userDb.findUserByEmail(email));
  if (existing) {
    if (existing.role !== "admin" || existing.status !== "active") {
      await Promise.resolve(
        userDb.updateUser(existing.id, {
          ...existing,
          role: "admin",
          status: "active",
        })
      );
      audit.log("user_role_changed", { userId: existing.id, action: "bootstrap_promote" });
    }
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
  console.log(`[bootstrap] Administrator angelegt: ${displayName} <${email}> — Erstlogin mit Installations-Kennwort unter #/admin/login`);
  if (process.env.NODE_ENV !== "production") {
    console.log("[bootstrap] Entwicklung: optional Dev-Mailbox (AUTH_DEV_MAILBOX=1) oder Kennwort-Login");
  }
  return { created: true, email, displayName };
}

module.exports = { ensureBootstrapAdmin };
