/**
 * Gemeinsame Admin-Navigation: Sessions, Events, Branding, Datenschutz, SSL, Einstellungen.
 * Liegt außerhalb der Views, damit man die Menüs nacheinander anklicken kann,
 * ohne die Leiste zu verlieren.
 */

const ADMIN_VIEWS = new Set(["adminHub", "events", "branding", "ssl", "email", "adminPrivacy", "adminSettings", "updates", "backups", "login", "users", "profile"]);

/**
 * Ob die aktuelle View zur Administration gehört (inkl. Admin-Hilfe).
 * @param {string} viewName
 * @returns {boolean}
 */
export function isAdminArea(viewName) {
  if (ADMIN_VIEWS.has(viewName)) return true;
  if (viewName === "help") {
    const hash = location.hash.replace(/^#/, "") || "/";
    return hash.startsWith("/admin");
  }
  return false;
}

/**
 * Aktiven Menüpunkt aus Hash (Priorität) und View ableiten.
 * @param {string} viewName
 * @param {string} [hashOverride] — z. B. aus route(), falls location.hash noch alt ist
 * @returns {string}
 */
function navKey(viewName, hashOverride) {
  const hash = hashOverride ?? (location.hash.replace(/^#/, "") || "/");
  /* Session-Deck: eigener Hash, obwohl view-events sichtbar ist */
  if (/^\/admin\/sessions\/\d{6}/.test(hash)) return "sessions";
  if (hash === "/admin" || hash === "/admin/") return "sessions";
  if (/^\/admin\/events(?:\/|$)/.test(hash)) return "events";
  if (hash === "/admin/branding") return "branding";
  if (hash === "/admin/privacy") return "privacy";
  if (hash === "/admin/ssl") return "ssl";
  if (hash === "/admin/email") return "email";
  if (hash === "/admin/settings") return "settings";
  if (hash === "/admin/updates") return "updates";
  if (hash === "/admin/backups") return "backups";
  if (hash === "/admin/users") return "users";
  if (hash === "/admin/profile") return "profile";
  if (hash === "/admin/login") return "login";
  if (/^\/admin\/help/.test(hash)) return "help";
  if (viewName === "adminHub") return "sessions";
  if (viewName === "events") return "events";
  if (viewName === "branding") return "branding";
  if (viewName === "ssl") return "ssl";
  if (viewName === "email") return "email";
  if (viewName === "adminPrivacy") return "privacy";
  if (viewName === "adminSettings") return "settings";
  if (viewName === "updates") return "updates";
  if (viewName === "backups") return "backups";
  if (viewName === "help") return "help";
  return "";
}

/**
 * Leiste ein-/ausblenden und den aktuellen Eintrag markieren.
 * @param {string} viewName
 * @param {string} [hashOverride]
 */
export function syncAdminNav(viewName, hashOverride) {
  const chrome = document.getElementById("admin-chrome");
  if (!chrome) return;
  const on = isAdminArea(viewName);
  chrome.hidden = !on;
  document.body.classList.toggle("admin-area", on);
  const key = navKey(viewName, hashOverride);
  chrome.querySelectorAll("[data-admin-nav]").forEach((a) => {
    const active = a.getAttribute("data-admin-nav") === key;
    a.classList.toggle("is-active", active);
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}
