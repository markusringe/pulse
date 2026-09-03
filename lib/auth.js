/**
 * Admin-Authentifizierung für Präsentator-Rechte.
 * Der Klartext-Schlüssel verlässt den Server nur einmal (Session-Erstellung).
 * Gespeichert wird ausschließlich ein HMAC-SHA-256.
 */

const crypto = require("crypto");

const PEPPER = process.env.ADMIN_SECRET || "pulse-dev-pepper-bitte-in-produktion-setzen";

function hashAdminKey(adminKey) {
  return crypto.createHmac("sha256", PEPPER).update(String(adminKey)).digest("hex");
}

function generateAdminKey() {
  return crypto.randomBytes(24).toString("base64url");
}

function timingSafeEqualHex(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyAdminKey(adminKey, storedHash) {
  if (!adminKey || !storedHash) return false;
  return timingSafeEqualHex(hashAdminKey(adminKey), storedHash);
}

function readAdminKey(req, body = {}) {
  const header = req.headers["x-admin-key"];
  const auth = req.headers.authorization;
  const bearer = auth && auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return header || bearer || body.adminKey || "";
}

/**
 * Presenter-Passwort: scrypt (Node-Bordmittel, bcrypt-Äquivalent ohne Extra-Paket).
 * @returns {string} salt:hash hex
 */
function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(plain), salt, 32, { N: 16384, r: 8, p: 1 });
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(plain, stored) {
  if (!plain || !stored || !stored.includes(":")) return false;
  const [saltHex, hashHex] = stored.split(":");
  const hash = crypto.scryptSync(String(plain), Buffer.from(saltHex, "hex"), 32, { N: 16384, r: 8, p: 1 });
  const left = Buffer.from(hashHex, "hex");
  if (left.length !== hash.length) return false;
  return crypto.timingSafeEqual(left, hash);
}

module.exports = {
  hashAdminKey,
  generateAdminKey,
  verifyAdminKey,
  readAdminKey,
  hashPassword,
  verifyPassword,
};

