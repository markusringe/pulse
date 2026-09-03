/**
 * Rollenbasierte Berechtigungen für Instanz- und Event-Ebene.
 * Rollen: admin, teamleader, teammember, editor (Legacy ≈ teammember), viewer.
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

const EVENT_VISIBILITIES = ["private", "public", "shared"];

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

/**
 * Team-basierter Event-Zugriff (zusätzlich zu eventAccess).
 * @param {object|null} user
 * @param {object} event
 * @param {string[]} [userTeamIds]
 * @param {Array<{eventId?:string,teamId?:string,accessLevel?:string}>} [teamAccessRows]
 */
function eventVisibleByTeam(user, event, userTeamIds = [], teamAccessRows = []) {
  if (!user || user.status !== "active") return false;
  if (isAdmin(user)) return true;
  const vis = EVENT_VISIBILITIES.includes(event.visibility) ? event.visibility : "private";
  if (vis === "public") return true;
  if (event.ownerUserId === user.id) return true;
  const teams = new Set(userTeamIds);
  if (event.teamId && teams.has(event.teamId)) return true;
  if (vis === "shared") {
    for (const row of teamAccessRows) {
      const tid = row.teamId || row.team_id;
      const eid = row.eventId || row.event_id;
      if (eid === event.id && teams.has(tid)) return true;
    }
  }
  return false;
}

/**
 * Event-Berechtigungen aus Event-Datensatz, DB-Zugriff und Team-Kontext.
 * @param {object|null} user
 * @param {object} event
 * @param {Array<{user_id:string,access_role:string}>} [dbAccess]
 * @param {{ userTeamIds?: string[], teamAccessRows?: object[] }} [teamCtx]
 */
function eventAccess(user, event, dbAccess = [], teamCtx = {}) {
  if (!user || user.status !== "active") {
    return { view: false, edit: false, present: false, manageAccess: false };
  }
  if (user.role === "admin") {
    return { view: true, edit: true, present: true, manageAccess: true };
  }

  const userTeamIds = teamCtx.userTeamIds || [];
  const teamAccessRows = teamCtx.teamAccessRows || [];
  const teamVisible = eventVisibleByTeam(user, event, userTeamIds, teamAccessRows);

  const ownerId = event.ownerUserId || "";
  const editors = new Set(event.editorUserIds || []);
  const presenters = new Set(event.presenterUserIds || []);
  const viewers = new Set(event.viewerUserIds || []);

  for (const row of dbAccess) {
    const uid = row.user_id || row.userId;
    const role = row.access_role || row.accessRole;
    if (uid !== user.id) continue;
    if (role === "editor") editors.add(uid);
    if (role === "presenter") presenters.add(uid);
    if (role === "viewer") viewers.add(uid);
  }

  const isOwner = ownerId === user.id;
  const canEditRole =
    user.role === "editor" || user.role === "teammember" || user.role === "teamleader";
  const canEdit = canEditRole && (isOwner || editors.has(user.id) || (teamVisible && event.teamId));
  const canPresent =
    isOwner || presenters.has(user.id) || editors.has(user.id) || (canEditRole && isOwner) || teamVisible;
  const canView =
    teamVisible ||
    canEdit ||
    canPresent ||
    viewers.has(user.id) ||
    (user.role === "viewer" && (presenters.has(user.id) || viewers.has(user.id)));

  if (canEditRole && isOwner) {
    return { view: true, edit: true, present: true, manageAccess: true };
  }
  if (canEditRole) {
    return {
      view: canView || canEdit || canPresent,
      edit: canEdit,
      present: canPresent,
      manageAccess: isOwner,
    };
  }
  return {
    view: canView,
    edit: false,
    present: canPresent,
    manageAccess: false,
  };
}

/**
 * Events nach Benutzerrechten filtern.
 * @param {object} user
 * @param {object[]} events
 * @param {Record<string, object[]>} [accessByEvent]
 * @param {{ userTeamIds?: string[], teamAccessByEvent?: Record<string, object[]> }} [teamCtx]
 */
function filterEventsForUser(user, events, accessByEvent = {}, teamCtx = {}) {
  if (!user) return [];
  if (user.role === "admin") return events;
  const userTeamIds = teamCtx.userTeamIds || [];
  return events.filter((ev) => {
    const dbAccess = accessByEvent[ev.id] || [];
    const teamAccessRows = teamCtx.teamAccessByEvent?.[ev.id] || [];
    const access = eventAccess(user, ev, dbAccess, { userTeamIds, teamAccessRows });
    return access.view || access.edit || access.present;
  });
}

module.exports = {
  NAV_ADMIN,
  EVENT_VISIBILITIES,
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
  eventVisibleByTeam,
  eventAccess,
  filterEventsForUser,
};
