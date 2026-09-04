/**
 * Client für Benutzer-Authentifizierung (Cookie-Session + optional ADMIN_SECRET).
 */

const state = {
  user: null,
  nav: [],
  enabled: false,
  needsBootstrap: false,
  bootstrapPasswordLogin: false,
  passwordLoginMode: false,
  pinLoginAvailable: false,
  onboardingBackupPending: false,
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

/** Auth-Status und aktuellen Benutzer laden (dedupliziert bei parallelen Aufrufen). */
let authLoadPromise = null;
/** Laufende Anfrage — veraltete /auth/me-Antworten ignorieren. */
let authLoadEpoch = 0;
/** Zeitstempel nach erfolgreichem Login (Cookie kann kurz verzögert ankommen). */
let loginFreshUntil = 0;

export async function loadAuth() {
  if (authLoadPromise) return authLoadPromise;
  const epoch = ++authLoadEpoch;
  authLoadPromise = loadAuthInner(epoch).finally(() => {
    authLoadPromise = null;
  });
  return authLoadPromise;
}

async function loadAuthInner(epoch) {
  const status = await fetchJson("/auth/status");
  if (epoch !== authLoadEpoch) return state;
  state.enabled = Boolean(status.data?.enabled);
  state.needsBootstrap = Boolean(status.data?.needsBootstrap);
  state.bootstrapPasswordLogin = Boolean(status.data?.bootstrapPasswordLogin);
  state.passwordLoginMode = Boolean(status.data?.passwordLoginMode);
  state.pinLoginAvailable = Boolean(status.data?.pinLoginAvailable);
  if (!state.enabled) {
    state.loaded = true;
    state.user = null;
    return state;
  }
  const me = await fetchJson("/auth/me");
  if (epoch !== authLoadEpoch) return state;
  if (me.ok) {
    state.user = me.data?.user || null;
    state.nav = me.data?.nav?.length
      ? me.data.nav
      : state.user?.role === "admin"
        ? NAV_FALLBACK.admin
        : NAV_FALLBACK[state.user?.role] || [];
    state.stepUpUntil = me.data?.stepUpUntil || null;
    state.viaSecret = Boolean(me.data?.viaSecret);
    state.onboardingBackupPending = Boolean(me.data?.onboardingBackupPending);
    if (state.viaSecret && !state.user) {
      state.nav = NAV_FALLBACK.admin;
    }
  } else if (state.user && Date.now() < loginFreshUntil) {
    /* Frisch eingeloggt — /auth/me kann einen Tick hinterherhinken. */
  } else {
    state.user = null;
    state.nav = [];
    state.stepUpUntil = null;
    state.viaSecret = false;
  }
  state.loaded = true;
  return state;
}

/** Nach erfolgreichem Login kurz gegen überschreibende loadAuth()-Lauf schützen. */
function markLoginFresh() {
  loginFreshUntil = Date.now() + 5000;
}

/** Ob der Auth-Status mindestens einmal vom Server geladen wurde. */
export function isAuthLoaded() {
  return state.loaded;
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
    state.nav = me.data.nav?.length
      ? me.data.nav
      : NAV_FALLBACK[me.data.user.role] || [];
    state.stepUpUntil = me.data.stepUpUntil || null;
    state.onboardingBackupPending = Boolean(me.data.onboardingBackupPending);
  }
}

export function isUserAuthEnabled() {
  return state.enabled;
}

export function getCurrentUser() {
  return state.user;
}

export function canCreateEvents() {
  if (!state.enabled || !state.user) return true;
  return ["admin", "editor", "teamleader", "teammember"].includes(state.user.role);
}

/** Team anlegen (Admin oder globale Teamleiter-Rolle). */
export function canCreateTeam() {
  if (!state.enabled || !state.user) return false;
  if (state.viaSecret) return true;
  return state.user.role === "admin" || state.user.role === "teamleader";
}

/** Mitglieder verwalten — globale Teamleiter-Rolle oder Admin (Team-Ebene prüft die Seite). */
export function canManageTeamMembers() {
  if (!state.enabled || !state.user) return false;
  if (state.viaSecret) return true;
  return state.user.role === "admin" || state.user.role === "teamleader";
}

export function needsAuthBootstrap() {
  return state.needsBootstrap;
}

export function isBootstrapPasswordLogin() {
  return state.bootstrapPasswordLogin;
}

export function isPasswordLoginMode() {
  return state.passwordLoginMode;
}

export function isPinLoginAvailable() {
  return state.pinLoginAvailable;
}

/**
 * Ob eine gültige Admin-Session besteht (Cookie oder Legacy ADMIN_SECRET).
 * Bootstrap-Status allein reicht nicht — Anmeldung ist immer erforderlich.
 * @returns {boolean}
 */
export function isAuthenticated() {
  if (!state.enabled) return true;
  return Boolean(state.user) || state.viaSecret;
}

/** Eingeloggt (beliebige Rolle) — für allgemeine Admin-Routen. */
export function hasAdminAccess() {
  return isAuthenticated();
}

/** Instanz-Administrator (volle Rechte inkl. Benutzerverwaltung). */
export function isAdminUser() {
  if (!state.enabled) return true;
  if (state.viaSecret) return true;
  const u = state.user;
  if (!u || u.role !== "admin") return false;
  return u.status !== "disabled" && u.status !== "locked";
}

/** Benutzerverwaltung (#/admin/users) und zugehörige APIs. */
export function canManageUsers() {
  return isAdminUser();
}

export function authNav() {
  return state.nav;
}

/** Fallback wenn /auth/me keine nav liefert (Cache, alte API). */
const NAV_FALLBACK = {
  admin: ["sessions", "events", "teams", "branding", "privacy", "ssl", "email", "settings", "updates", "backups", "users", "help"],
  teamleader: ["sessions", "events", "teams", "help"],
  teammember: ["sessions", "events", "teams", "help"],
  editor: ["sessions", "events", "teams", "help"],
  viewer: ["events", "help"],
};

export function hasNav(key) {
  if (!state.enabled) return true;
  if (!state.user) return key === "help" || key === "login";
  if (state.nav.includes(key)) return true;
  const fallback = NAV_FALLBACK[state.user.role];
  return Array.isArray(fallback) && fallback.includes(key);
}

export function roleLabel(role) {
  const map = {
    admin: "Administrator",
    teamleader: "Teamleiter",
    teammember: "Teammitglied",
    editor: "Editor",
    viewer: "Viewer",
  };
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
    markLoginFresh();
    state.user = r.data.user;
    state.nav = r.data.nav?.length ? r.data.nav : NAV_FALLBACK[r.data.user?.role] || [];
    state.stepUpUntil = r.data.stepUpUntil || Date.now() + 15 * 60 * 1000;
    state.bootstrapPasswordLogin = false;
    state.passwordLoginMode = false;
    state.pinLoginAvailable = true;
  }
  return r;
}

/** Erstlogin mit bei der Installation festgelegtem Kennwort. */
export async function bootstrapLogin(email, password, persistent = true) {
  const r = await fetchJson("/auth/bootstrap-login", {
    method: "POST",
    body: { email, password, persistent },
  });
  if (r.ok) {
    markLoginFresh();
    state.user = r.data.user;
    state.nav = r.data.nav?.length
      ? r.data.nav
      : r.data.user?.role === "admin"
        ? NAV_FALLBACK.admin
        : NAV_FALLBACK[r.data.user?.role] || [];
    state.stepUpUntil = r.data.stepUpUntil || Date.now() + 15 * 60 * 1000;
    state.bootstrapPasswordLogin = false;
    state.passwordLoginMode = !state.pinLoginAvailable;
    if (r.data.bootstrapCompleted) state.onboardingBackupPending = true;
  }
  return r;
}

/**
 * Anmeldung per Kennwort (ohne SMTP oder Admin-Bereich).
 * @param {boolean} [adminLogin] — Kennwort-Login für Administratoren trotz aktivem PIN-Modus
 */
export async function loginPassword(email, password, persistent = true, adminLogin = false) {
  const r = await fetchJson("/auth/login-password", {
    method: "POST",
    body: { email, password, persistent, adminLogin: Boolean(adminLogin) },
  });
  if (r.ok) {
    markLoginFresh();
    state.user = r.data.user;
    state.nav = r.data.nav?.length
      ? r.data.nav
      : r.data.user?.role === "admin"
        ? NAV_FALLBACK.admin
        : NAV_FALLBACK[r.data.user?.role] || [];
    state.stepUpUntil = r.data.stepUpUntil || Date.now() + 15 * 60 * 1000;
  }
  return r;
}

export async function submitStepUpPin(pin) {
  const r = await fetchJson("/auth/step-up", { method: "POST", body: { pin } });
  if (r.ok) state.stepUpUntil = r.data.stepUpUntil || Date.now() + 15 * 60 * 1000;
  return r;
}

export function isOnboardingBackupPending() {
  return state.onboardingBackupPending;
}

/** Ersteinrichtung „Backup einspielen“ überspringen. */
export async function completeOnboardingBackup() {
  const r = await fetchJson("/auth/onboarding-backup-done", { method: "POST" });
  if (r.ok) state.onboardingBackupPending = false;
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

export async function getEmailConfig() {
  return fetchJson("/email");
}

export async function saveEmailConfig(body) {
  return fetchJson("/email", { method: "PATCH", body });
}

export async function sendTestEmail(body = {}) {
  return fetchJson("/email/test", { method: "POST", body });
}

/**
 * Admin-Routen: bei aktivierter Benutzerverwaltung Login erzwingen.
 * @param {string} hash
 * @returns {Promise<boolean>} true wenn weiter geroutet werden darf
 */
/**
 * Ob die angemeldete Rolle die Admin-Hash-Route öffnen darf (Navigation + Router).
 * @param {string} hash z. B. "/admin/users"
 * @returns {boolean}
 */
export function canAccessAdminHash(hash) {
  if (!state.enabled) return true;
  const h = String(hash || "").replace(/^#/, "");
  if (h === "/admin/login" || h === "/admin/onboarding") return true;
  if (!isAuthenticated()) return false;
  if (h === "/admin/profile") return Boolean(state.user);
  if (!state.user) return false;
  const key = navKeyFromHash(h);
  if (key && !hasNav(key)) return false;
  return true;
}

export async function ensureAdminAccess(hash) {
  return canAccessAdminHash(hash);
}

/**
 * Authentifizierte API-Anfrage; bei 401 Session beenden und Login-Modal anstoßen.
 * @param {string} path — Pfad unter /api
 * @param {object} [opts]
 */
export async function fetchWithAuth(path, opts = {}) {
  const r = await fetchJson(path, opts);
  if (r.status === 401 && state.enabled) {
    state.user = null;
    state.nav = [];
    state.stepUpUntil = null;
    state.viaSecret = false;
    const { showAdminLoginModal } = await import("./adminLoginModal.js?v=nav59");
    await showAdminLoginModal("/admin");
    throw new Error("Session abgelaufen");
  }
  if (r.status === 403) {
    throw new Error(r.data?.error || "Zugriff verweigert");
  }
  return r;
}

function navKeyFromHash(hash) {
  if (/^\/admin\/sessions\/\d{6}/.test(hash)) return "sessions";
  if (hash === "/admin" || hash === "/admin/") return "sessions";
  if (/^\/admin\/events/.test(hash)) return "events";
  if (hash === "/admin/branding") return "branding";
  if (hash === "/admin/privacy") return "privacy";
  if (hash === "/admin/ssl") return "ssl";
  if (hash === "/admin/email") return "email";
  if (hash === "/admin/settings") return "settings";
  if (hash === "/admin/updates") return "updates";
  if (hash === "/admin/backups") return "backups";
  if (hash === "/admin/teams") return "teams";
  if (hash === "/admin/users") return "users";
  if (hash === "/admin/profile") return "profile";
  if (/^\/admin\/help/.test(hash)) return "help";
  return "";
}

export function applyAdminNavVisibility() {
  const chrome = document.getElementById("admin-chrome");
  if (!chrome || !state.enabled) return;
  const adminSession = isAdminUser() || state.viaSecret;
  chrome.querySelectorAll("[data-admin-nav]").forEach((a) => {
    const key = a.getAttribute("data-admin-nav");
    let show = hasNav(key);
    /* Admin: volle Leiste auch wenn nav-Array leer oder aus Cache veraltet. */
    if (adminSession && NAV_FALLBACK.admin.includes(key)) show = true;
    a.hidden = !show;
  });
}
