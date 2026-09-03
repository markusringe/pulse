/**
 * Kennwort- und PIN-Hashing, Session-Tokens für die Benutzerverwaltung.
 * PINs und Kennwörter werden niemals im Klartext persistiert.
 */

const crypto = require("crypto");

/** Instanz-Rollen: editor bleibt für Rückwärtskompatibilität (≈ teammember). */
const ROLES = ["admin", "teamleader", "teammember", "editor", "viewer"];
const STATUSES = ["active", "disabled", "locked", "pending"];
const PIN_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_SHORT_TTL_MS = 24 * 60 * 60 * 1000;
const AUTH_COOKIE = "pulse_auth";

const ROLE_LABELS = {
  admin: "Administrator",
  teamleader: "Teamleiter",
  teammember: "Teammitglied",
  editor: "Editor",
  viewer: "Viewer",
};

/**
 * Kennwort mit scrypt hashen (individuelles Salt pro Benutzer).
 * @param {string} plain
 * @returns {string}
 */
function hashUserPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(plain), salt, 32, { N: 16384, r: 8, p: 1 });
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/**
 * @param {string} plain
 * @param {string} stored
 * @returns {boolean}
 */
function verifyUserPassword(plain, stored) {
  if (!plain || !stored || !stored.includes(":")) return false;
  const [saltHex, hashHex] = stored.split(":");
  try {
    const hash = crypto.scryptSync(String(plain), Buffer.from(saltHex, "hex"), 32, { N: 16384, r: 8, p: 1 });
    const left = Buffer.from(hashHex, "hex");
    if (left.length !== hash.length) return false;
    return crypto.timingSafeEqual(left, hash);
  } catch {
    return false;
  }
}

/**
 * Kryptografisch zufällige sechsstellige PIN (100000–999999).
 * @returns {string}
 */
function generatePin() {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * PIN nur als Hash speichern.
 * @param {string} pin
 * @returns {string}
 */
function hashPin(pin) {
  const salt = crypto.randomBytes(8);
  const hash = crypto.scryptSync(String(pin), salt, 16, { N: 8192, r: 8, p: 1 });
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPin(pin, stored) {
  if (!pin || !stored || !stored.includes(":")) return false;
  const [saltHex, hashHex] = stored.split(":");
  try {
    const hash = crypto.scryptSync(String(pin), Buffer.from(saltHex, "hex"), 16, { N: 8192, r: 8, p: 1 });
    const left = Buffer.from(hashHex, "hex");
    if (left.length !== hash.length) return false;
    return crypto.timingSafeEqual(left, hash);
  } catch {
    return false;
  }
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function sanitizeRole(role) {
  const r = String(role || "viewer").toLowerCase();
  return ROLES.includes(r) ? r : "viewer";
}

function sanitizeStatus(status) {
  const s = String(status || "active").toLowerCase();
  return STATUSES.includes(s) ? s : "active";
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role] || user.role,
    status: user.status,
    comment: user.comment || "",
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    lastPinRequestAt: user.lastPinRequestAt,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    out[key] = val;
  }
  return out;
}

/**
 * Ob das Auth-Cookie das Secure-Flag braucht.
 * In Docker ist NODE_ENV=production, Zugriff oft aber noch per HTTP — dann darf Secure nicht erzwungen werden.
 * @param {import('http').IncomingMessage} req
 * @returns {boolean}
 */
function authCookieSecure(req) {
  const forced = String(process.env.AUTH_COOKIE_SECURE || "").trim().toLowerCase();
  if (forced === "1" || forced === "true" || forced === "yes") return true;
  if (forced === "0" || forced === "false" || forced === "no") return false;
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  if (proto === "https") return true;
  if (proto === "http") return false;
  /* Direktzugriff ohne Reverse-Proxy: TLS am Socket erkennen. */
  if (req.socket?.encrypted) return true;
  return false;
}

function buildAuthCookie(token, { persistent, secure }) {
  const maxAge = persistent ? Math.floor(SESSION_TTL_MS / 1000) : Math.floor(SESSION_SHORT_TTL_MS / 1000);
  const parts = [
    `${AUTH_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function clearAuthCookie(secure) {
  const parts = [`${AUTH_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

module.exports = {
  ROLES,
  STATUSES,
  ROLE_LABELS,
  PIN_TTL_MS,
  SESSION_TTL_MS,
  SESSION_SHORT_TTL_MS,
  AUTH_COOKIE,
  hashUserPassword,
  verifyUserPassword,
  generatePin,
  hashPin,
  verifyPin,
  generateSessionToken,
  hashSessionToken,
  sanitizeRole,
  sanitizeStatus,
  publicUser,
  parseCookies,
  authCookieSecure,
  buildAuthCookie,
  clearAuthCookie,
};
