/**
 * Rollenbasierte Berechtigungen für Instanz- und Event-Ebene.
 * Technische Rollen: admin, editor, viewer (Anzeigenamen siehe userAuth.ROLE_LABELS).
 */

const NAV_ADMIN = ["sessions", "events", "branding", "privacy", "ssl", "settings", "users", "help"];
const NAV_EDITOR = ["sessions", "events", "help"];
const NAV_VIEWER = ["events", "help"];

/**
 * Navigationseinträge je Rolle.
 * @param {string} role
 * @returns {string[]}
 */
function navForRole(role) {
  if (role === "admin") return NAV_ADMIN;
  if (role === "editor") return NAV_EDITOR;
  return NAV_VIEWER;
}

function isAdmin(user) {
  return user?.status === "active" && user?.role === "admin";
}

function isEditor(user) {
  return user?.status === "active" && (user?.role === "admin" || user?.role === "editor");
}

function canAccessSettings(user) {
  return isAdmin(user);
}

function canManageUsers(user) {
  return isAdmin(user);
}

function canCreateEvent(user) {
  return isEditor(user);
}

/**
 * Event-Berechtigungen aus Event-Datensatz und DB-Zugriff.
 * @param {object|null} user — öffentlicher Benutzer
 * @param {object} event — voller Event-Datensatz
 * @param {Array<{user_id:string,access_role:string}>} [dbAccess]
 */
function eventAccess(user, event, dbAccess = []) {
  if (!user || user.status !== "active") {
    return { view: false, edit: false, present: false, manageAccess: false };
  }
  if (user.role === "admin") {
    return { view: true, edit: true, present: true, manageAccess: true };
  }

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
  const canEdit = user.role === "editor" && (isOwner || editors.has(user.id));
  const canPresent = isOwner || presenters.has(user.id) || editors.has(user.id) || (user.role === "editor" && isOwner);
  const canView =
    canEdit ||
    canPresent ||
    viewers.has(user.id) ||
    (user.role === "viewer" && (presenters.has(user.id) || viewers.has(user.id)));

  if (user.role === "editor" && isOwner) {
    return { view: true, edit: true, present: true, manageAccess: true };
  }
  if (user.role === "editor") {
    return { view: canEdit || canPresent, edit: canEdit, present: canPresent, manageAccess: isOwner };
  }
  /* viewer */
  return {
    view: canView,
    edit: false,
    present: canPresent,
    manageAccess: false,
  };
}

function filterEventsForUser(user, events, accessByEvent = {}) {
  if (!user) return [];
  if (user.role === "admin") return events;
  return events.filter((ev) => {
    const dbAccess = accessByEvent[ev.id] || [];
    return eventAccess(user, ev, dbAccess).view || eventAccess(user, ev, dbAccess).edit || eventAccess(user, ev, dbAccess).present;
  });
}

module.exports = {
  navForRole,
  isAdmin,
  isEditor,
  canAccessSettings,
  canManageUsers,
  canCreateEvent,
  eventAccess,
  filterEventsForUser,
};
