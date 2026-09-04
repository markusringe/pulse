/**
 * Interne Hash-Routen validieren (Open-Redirect-Schutz, Login-Rücksprung).
 * Gleiche Regeln wie frontend/js/adminLoginModal.js — bei Änderung beide Dateien anpassen.
 */

/** Admin-Ziel-Hash normalisieren. */
function normalizeAdminHash(hash) {
  const clean = String(hash || "/admin").replace(/^#/, "") || "/admin";
  if (
    clean.startsWith("/admin") ||
    /^\/present\/\d{6}$/.test(clean) ||
    /^\/(?:stage|present-view)\/\d{6}$/.test(clean)
  ) {
    return clean;
  }
  return "/admin";
}

/**
 * Nur erlaubte interne Pulse-Routen nach Login.
 * @param {string} hash
 * @param {string} [fallback]
 * @returns {string}
 */
function sanitizeAdminRedirectHash(hash, fallback = "#/admin/events") {
  const raw = String(hash || "").trim();
  if (!raw.startsWith("#/")) return fallback;
  if (raw.includes("://") || raw.startsWith("#//")) return fallback;
  const pathOnly = raw.replace(/^#/, "").split(/[?#]/)[0] || "/";
  const normalized = normalizeAdminHash(pathOnly);
  if (normalized === "/admin" && !pathOnly.startsWith("/admin")) return fallback;
  return `#${normalized}${raw.includes("?") ? raw.slice(raw.indexOf("?")) : ""}`;
}

module.exports = { normalizeAdminHash, sanitizeAdminRedirectHash };
