/**
 * Rollenbasierte Berechtigungen für Instanz- und Event-Ebene.
 * Events: genau ein Team (`teamId`); keine individuellen Benutzerlisten mehr.
 */

const NAV_ADMIN = [
  "sessions",
  "events",
  "teams",
  "branding",
  "privacy",
  "ssl",
  "email",
  "settings",
  "updates",
  "backups",
  "users",
  "help",
];
const NAV_TEAMLEADER = ["sessions", "events", "teams", "help"];
const NAV_TEAMMEMBER = ["sessions", "events", "teams", "help"];
const NAV_EDITOR = ["sessions", "events", "teams", "help"];
const NAV_VIEWER = ["events", "help"];

/**
 * Navigationseinträge je Rolle.
 * @param {string} role
 * @returns {string[]}
 */
function navForRole(role) {
  if (role === "admin") return NAV_ADMIN;
  if (role === "teamleader") return NAV_TEAMLEADER;
  if (role === "teammember") return NAV_TEAMMEMBER;
  if (role === "editor") return NAV_EDITOR;
  return NAV_VIEWER;
}

function isAdmin(user) {
  if (user?.role !== "admin") return false;
  const status = String(user.status || "").toLowerCase();
  return status === "active" || status === "pending";
}

/** Kann Inhalte erstellen/bearbeiten (Events, Sessions). */
function isEditor(user) {
  if (user?.status !== "active") return false;
  return ["admin", "teamleader", "teammember", "editor"].includes(user?.role);
}

function isTeamLeaderRole(user) {
  return user?.status === "active" && user?.role === "teamleader";
}

function isTeamMemberRole(user) {
  return user?.status === "active" && (user?.role === "teammember" || user?.role === "editor");
}

function canAccessSettings(user) {
  return isAdmin(user);
}

function canManageUsers(user) {
  return isAdmin(user);
}

/** Benutzerliste für Team-Einladungen (Admin + globale Teamleiter). */
function canListUsersForTeamPick(user) {
  return isAdmin(user) || isTeamLeaderRole(user);
}

function canCreateTeam(user) {
  return isAdmin(user) || isTeamLeaderRole(user);
}

function canAccessAdminPanel(user) {
  return isAdmin(user);
}

function canCreateEvent(user) {
  return isEditor(user);
}

/** Darf ein Administrator das Team eines Events ändern (auch Wechsel)? */
function canChangeEventTeam(user) {
  return isAdmin(user);
}

/**
 * Erste Team-Zuordnung (Event ohne teamId) — Admin oder Editor mit Teammitgliedschaft.
 * @param {object|null} user
 * @param {object|null} event
 */
function canAssignInitialEventTeam(user, event) {
  if (!user || user.status !== "active") return false;
  if (isAdmin(user)) return true;
  if (!isEditor(user)) return false;
  return eventNeedsTeamAssignment(event);
}

/**
 * Event ohne gültige Team-Zuordnung — nur Administratoren dürfen verwalten.
 * @param {object|null} event
 */
function eventNeedsTeamAssignment(event) {
  return !String(event?.teamId || "").trim();
}

/**
 * Gehört der Benutzer zum Team des Events?
 * @param {object|null} user
 * @param {object} event
 * @param {string[]} [userTeamIds]
 */
function isMemberOfEventTeam(user, event, userTeamIds = []) {
  const teamId = String(event?.teamId || "").trim();
  if (!teamId || !user || user.status !== "active") return false;
  return userTeamIds.includes(teamId);
}

/**
 * @deprecated Legacy-Hilfsfunktion — nur noch für öffentliche Sichtbarkeit.
 */
function eventVisibleByTeam(user, event, userTeamIds = []) {
  if (!user || user.status !== "active") return false;
  if (isAdmin(user)) return true;
  if (event.visibility === "public") return true;
  return isMemberOfEventTeam(user, event, userTeamIds);
}

/**
 * Event-Berechtigungen — ausschließlich Team + Instanz-Rolle.
 * @param {object|null} user
 * @param {object} event
 * @param {Array<{user_id:string,access_role:string}>} [_dbAccess] — ignoriert (Legacy)
 * @param {{ userTeamIds?: string[] }} [teamCtx]
 */
function eventAccess(user, event, _dbAccess = [], teamCtx = {}) {
  const denied = { view: false, edit: false, present: false, manageAccess: false };
  if (!user || user.status !== "active") return denied;
  if (user.role === "admin") {
    return { view: true, edit: true, present: true, manageAccess: true };
  }

  const userTeamIds = teamCtx.userTeamIds || [];

  /* Events ohne Team: nur Admin (Migration). */
  if (eventNeedsTeamAssignment(event)) return denied;

  const inTeam = isMemberOfEventTeam(user, event, userTeamIds);

  if (user.role === "viewer") {
    const pub = event.visibility === "public";
    return { view: pub, edit: false, present: false, manageAccess: false };
  }

  if (["teamleader", "teammember", "editor"].includes(user.role) && inTeam) {
    return { view: true, edit: true, present: true, manageAccess: false };
  }

  return denied;
}

/**
 * Events nach Benutzerrechten filtern.
 * @param {object} user
 * @param {object[]} events
 * @param {Record<string, object[]>} [_accessByEvent] — ignoriert (Legacy)
 * @param {{ userTeamIds?: string[] }} [teamCtx]
 */
function filterEventsForUser(user, events, _accessByEvent = {}, teamCtx = {}) {
  if (!user) return [];
  if (user.role === "admin") return events;
  const userTeamIds = teamCtx.userTeamIds || [];
  return events.filter((ev) => {
    const access = eventAccess(user, ev, [], { userTeamIds });
    return access.view || access.edit || access.present;
  });
}

module.exports = {
  NAV_ADMIN,
  navForRole,
  isAdmin,
  isEditor,
  isTeamLeaderRole,
  isTeamMemberRole,
  canAccessSettings,
  canManageUsers,
  canListUsersForTeamPick,
  canCreateTeam,
  canAccessAdminPanel,
  canCreateEvent,
  canChangeEventTeam,
  canAssignInitialEventTeam,
  eventNeedsTeamAssignment,
  isMemberOfEventTeam,
  eventVisibleByTeam,
  eventAccess,
  filterEventsForUser,
};
