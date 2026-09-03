/**
 * Client für Benutzer-Authentifizierung (Cookie-Session + optional ADMIN_SECRET).
 */

const state = {
  user: null,
  nav: [],
  enabled: false,
  needsBootstrap: false,
  loaded: false,
  stepUpUntil: null,
  /** Legacy-Zugriff per ADMIN_SECRET / X-Admin-Key (ohne Cookie-Login). */
  viaSecret: false,
};

async function fetchJson(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data, headers: res.headers };
}

/** Auth-Status und aktuellen Benutzer laden. */
export async function loadAuth() {
  const status = await fetchJson("/auth/status");
  state.enabled = Boolean(status.data?.enabled);
  state.needsBootstrap = Boolean(status.data?.needsBootstrap);
  if (!state.enabled) {
    state.loaded = true;
    state.user = null;
    return state;
  }
  const me = await fetchJson("/auth/me");
  if (me.ok) {
    state.user = me.data?.user || null;
    state.nav = me.data?.nav || [];
    state.stepUpUntil = me.data?.stepUpUntil || null;
    state.viaSecret = Boolean(me.data?.viaSecret);
  } else {
    state.user = null;
    state.nav = [];
    state.stepUpUntil = null;
    state.viaSecret = false;
  }
  state.loaded = true;
  return state;
}

export function getAuthUser() {
  return state.user;
}

/** Ob Benutzerverwaltung aktiv ist. */
export function isAuthEnabled() {
  return state.enabled;
}

export function hasValidStepUp() {
  return Boolean(state.stepUpUntil && state.stepUpUntil > Date.now());
}

/** Aktuellen Auth-Status neu laden (z. B. nach Step-up). */
export async function refreshAuthMe() {
  if (!state.enabled) return;
  const me = await fetchJson("/auth/me");
  if (me.ok && me.data?.user) {
    state.user = me.data.user;
    state.nav = me.data.nav || [];
    state.stepUpUntil = me.data.stepUpUntil || null;
  }
}

export function canCreateEvents() {
  if (!state.enabled || !state.user) return true;
  return state.user.role === "admin" || state.user.role === "editor";
}

export function needsAuthBootstrap() {
  return state.needsBootstrap;
}

/**
 * Ob Admin-Routen ohne Login-Redirect erreichbar sind (Cookie, ADMIN_SECRET oder Bootstrap).
 * @returns {boolean}
 */
export function hasAdminAccess() {
  if (!state.enabled) return true;
  if (state.user) return true;
  if (state.viaSecret) return true;
  if (state.needsBootstrap) return true;
  return false;
}

export function authNav() {
  return state.nav;
}

export function hasNav(key) {
  if (!state.enabled) return true;
  if (!state.user) return key === "help" || key === "login";
  return state.nav.includes(key);
}

export function roleLabel(role) {
  const map = { admin: "Administrator", editor: "Editor", viewer: "Viewer" };
  return map[role] || role;
}

export async function requestPin(email) {
  return fetchJson("/auth/request-pin", { method: "POST", body: { email } });
}

export async function verifyPin(email, pin, persistent = true) {
  const r = await fetchJson("/auth/verify-pin", {
    method: "POST",
    body: { email, pin, persistent },
  });
  if (r.ok) {
    state.user = r.data.user;
    state.nav = r.data.nav || [];
    state.stepUpUntil = r.data.stepUpUntil || Date.now() + 15 * 60 * 1000;
  }
  return r;
}

export async function submitStepUpPin(pin) {
  const r = await fetchJson("/auth/step-up", { method: "POST", body: { pin } });
  if (r.ok) state.stepUpUntil = r.data.stepUpUntil || Date.now() + 15 * 60 * 1000;
  return r;
}

export async function updateProfile(body) {
  const r = await fetchJson("/auth/profile", { method: "PATCH", body });
  if (r.ok && r.data?.user) state.user = r.data.user;
  return r;
}

export async function getAuthSettings() {
  return fetchJson("/auth/settings");
}

export async function updateAuthSettings(body) {
  return fetchJson("/auth/settings", { method: "PATCH", body });
}

export async function registerAccount({ displayName, email, password }) {
  return fetchJson("/auth/register", {
    method: "POST",
    body: { displayName, email, password },
  });
}

export async function logout() {
  await fetchJson("/auth/logout", { method: "POST" });
  state.user = null;
  state.nav = [];
  state.stepUpUntil = null;
  state.viaSecret = false;
}

export async function changePassword(currentPassword, newPassword) {
  return fetchJson("/auth/password", {
    method: "POST",
    body: { currentPassword, newPassword },
  });
}

export async function listUsers(params = {}) {
  const q = new URLSearchParams(params).toString();
  return fetchJson(`/users${q ? `?${q}` : ""}`);
}

export async function createUser(body) {
  return fetchJson("/users", { method: "POST", body });
}

export async function updateUser(id, body) {
  return fetchJson(`/users/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

export async function resetUserPassword(id, password) {
  return fetchJson(`/users/${encodeURIComponent(id)}/reset-password`, {
    method: "POST",
    body: { password },
  });
}

export async function revokeUserSessions(id) {
  return fetchJson(`/users/${encodeURIComponent(id)}/revoke-sessions`, { method: "POST" });
}

export async function resendUserPin(id) {
  return fetchJson(`/users/${encodeURIComponent(id)}/resend-pin`, { method: "POST" });
}

export async function deleteUser(id) {
  return fetchJson(`/users/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getDevMailbox() {
  return fetchJson("/auth/dev-mailbox");
}

/**
 * Admin-Routen: bei aktivierter Benutzerverwaltung Login erzwingen.
 * @param {string} hash
 * @returns {Promise<boolean>} true wenn weiter geroutet werden darf
 */
export async function ensureAdminAccess(hash) {
  if (!state.enabled) return true;
  if (hash.startsWith("/admin/login")) return true;
  if (hash === "/admin/profile") {
    if (!state.user) {
      location.hash = "#/admin/login";
      return false;
    }
    return true;
  }
  if (!state.user) {
    location.hash = "#/admin/login";
    return false;
  }
  const key = navKeyFromHash(hash);
  if (key && !hasNav(key)) {
    location.hash = "#/admin/events";
    return false;
  }
  return true;
}

function navKeyFromHash(hash) {
  if (/^\/admin\/sessions\/\d{6}/.test(hash)) return "sessions";
  if (hash === "/admin" || hash === "/admin/") return "sessions";
  if (/^\/admin\/events/.test(hash)) return "events";
  if (hash === "/admin/branding") return "branding";
  if (hash === "/admin/privacy") return "privacy";
  if (hash === "/admin/ssl") return "ssl";
  if (hash === "/admin/settings") return "settings";
  if (hash === "/admin/users") return "users";
  if (hash === "/admin/profile") return "profile";
  if (/^\/admin\/help/.test(hash)) return "help";
  return "";
}

export function applyAdminNavVisibility() {
  const chrome = document.getElementById("admin-chrome");
  if (!chrome || !state.enabled || !state.user) return;
  chrome.querySelectorAll("[data-admin-nav]").forEach((a) => {
    const key = a.getAttribute("data-admin-nav");
    const show = hasNav(key);
    a.hidden = !show;
  });
}
