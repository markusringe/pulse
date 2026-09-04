#!/usr/bin/env node
/**
 * Interne Admin-Routen und Open-Redirect-Schutz.
 */

const { normalizeAdminHash, sanitizeAdminRedirectHash } = require("../lib/internalRoute");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(normalizeAdminHash("/admin/events") === "/admin/events", "Admin-Events normalisiert");
assert(normalizeAdminHash("#/admin") === "/admin", "Hash-Prefix entfernt");
assert(normalizeAdminHash("https://evil.example") === "/admin", "Externe URL abgelehnt");
assert(normalizeAdminHash("/present/123456") === "/present/123456", "Presenter-Route erlaubt");

assert(
  sanitizeAdminRedirectHash("#/admin/users") === "#/admin/users",
  "Interne Admin-Route bleibt"
);
assert(
  sanitizeAdminRedirectHash("https://evil.example/phish") === "#/admin/events",
  "Absolute URL abgelehnt"
);
assert(
  sanitizeAdminRedirectHash("#//evil.example") === "#/admin/events",
  "Protocol-relative abgelehnt"
);
assert(
  sanitizeAdminRedirectHash("#/join/123456") === "#/admin/events",
  "Join-Route nicht als Admin-Redirect"
);
assert(
  sanitizeAdminRedirectHash("") === "#/admin/events",
  "Leer → Fallback"
);

console.log("Route-Tests OK");
