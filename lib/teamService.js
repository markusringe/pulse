/**
 * Geschäftslogik für Teams: Erstellung, Mitgliederverwaltung, Berechtigungsprüfungen.
 */

const permissions = require("./permissions");

const TEAM_MEMBER_ROLES = ["teammember", "teamleader"];

/**
 * Teams für einen Benutzer laden (Admin: alle, sonst nur eigene Mitgliedschaften).
 * @param {object} userDb
 * @param {object|null} user
 */
async function listTeamsForUser(userDb, user) {
  if (!userDb.supported || !user) return [];
  if (permissions.isAdmin(user)) {
    return Promise.resolve(userDb.listAllTeams());
  }
  return Promise.resolve(userDb.listTeamsForUser(user.id));
}

/**
 * Darf der Benutzer ein neues Team anlegen?
 * @param {object|null} user
 */
function canCreateTeam(user) {
  return permissions.canCreateTeam(user);
}

/**
 * Darf der Benutzer Mitglieder in diesem Team verwalten?
 * @param {object} userDb
 * @param {object|null} user
 * @param {string} teamId
 */
async function canManageTeamMembers(userDb, user, teamId) {
  if (!user || user.status !== "active") return false;
  if (permissions.isAdmin(user)) return true;
  if (!userDb.supported) return false;
  return Promise.resolve(userDb.isTeamLeader(teamId, user.id));
}

/**
 * Ist der Benutzer Mitglied des Teams (oder Admin)?
 * @param {object} userDb
 * @param {object|null} user
 * @param {string} teamId
 */
async function canAccessTeam(userDb, user, teamId) {
  if (!user || user.status !== "active") return false;
  if (permissions.isAdmin(user)) return true;
  if (!userDb.supported) return false;
  const membership = await Promise.resolve(userDb.getTeamMembership(teamId, user.id));
  return Boolean(membership);
}

/**
 * Neues Team anlegen inkl. Ersteller als Teamleiter.
 * @param {object} userDb
 * @param {object} user
 * @param {{ name: string, description?: string, memberIds?: string[] }} body
 */
async function createTeam(userDb, user, body) {
  if (!canCreateTeam(user)) {
    const err = new Error("Keine Berechtigung zum Anlegen von Teams");
    err.statusCode = 403;
    throw err;
  }
  const name = String(body.name || "").trim().slice(0, 120);
  if (!name) {
    const err = new Error("Team-Name erforderlich");
    err.statusCode = 400;
    throw err;
  }
  const now = Date.now();
  const teamId = userDb.newId("team");
  const description = String(body.description || "").slice(0, 500);
  await Promise.resolve(
    userDb.insertTeam({
      id: teamId,
      name,
      description,
      leaderId: user.id,
      createdAt: now,
      updatedAt: now,
    })
  );
  await Promise.resolve(userDb.addTeamMember(teamId, user.id, "teamleader"));
  const memberIds = Array.isArray(body.memberIds) ? body.memberIds : [];
  for (const memberId of memberIds) {
    const uid = String(memberId || "").slice(0, 40);
    if (!uid || uid === user.id) continue;
    const exists = await Promise.resolve(userDb.findUserById(uid));
    if (!exists) continue;
    await Promise.resolve(userDb.addTeamMember(teamId, uid, "teammember"));
  }
  return Promise.resolve(userDb.findTeamById(teamId));
}

/**
 * Team-Metadaten aktualisieren.
 * @param {object} userDb
 * @param {object|null} user
 * @param {string} teamId
 * @param {{ name?: string, description?: string }} body
 */
async function updateTeam(userDb, user, teamId, body) {
  const team = await Promise.resolve(userDb.findTeamById(teamId));
  if (!team) {
    const err = new Error("Team nicht gefunden");
    err.statusCode = 404;
    throw err;
  }
  if (!(await canManageTeamMembers(userDb, user, teamId))) {
    const err = new Error("Keine Berechtigung");
    err.statusCode = 403;
    throw err;
  }
  const patch = {};
  if (body.name != null) patch.name = String(body.name).trim().slice(0, 120);
  if (body.description != null) patch.description = String(body.description).slice(0, 500);
  return Promise.resolve(userDb.updateTeam(teamId, patch));
}

/**
 * Team löschen (nur Admin oder Teamleiter des Teams).
 * @param {object} userDb
 * @param {object|null} user
 * @param {string} teamId
 */
async function deleteTeam(userDb, user, teamId) {
  const team = await Promise.resolve(userDb.findTeamById(teamId));
  if (!team) {
    const err = new Error("Team nicht gefunden");
    err.statusCode = 404;
    throw err;
  }
  if (!(await canManageTeamMembers(userDb, user, teamId))) {
    const err = new Error("Keine Berechtigung");
    err.statusCode = 403;
    throw err;
  }
  await Promise.resolve(userDb.deleteTeam(teamId));
  return { ok: true };
}

/**
 * Mitglied zum Team hinzufügen.
 * @param {object} userDb
 * @param {object|null} user
 * @param {string} teamId
 * @param {{ userId: string, role?: string }} body
 */
async function addMember(userDb, user, teamId, body) {
  if (!(await canManageTeamMembers(userDb, user, teamId))) {
    const err = new Error("Nur Teamleiter dürfen Mitglieder hinzufügen");
    err.statusCode = 403;
    throw err;
  }
  const userId = String(body.userId || "").slice(0, 40);
  if (!userId) {
    const err = new Error("userId erforderlich");
    err.statusCode = 400;
    throw err;
  }
  const target = await Promise.resolve(userDb.findUserById(userId));
  if (!target) {
    const err = new Error("Benutzer nicht gefunden");
    err.statusCode = 404;
    throw err;
  }
  const role = TEAM_MEMBER_ROLES.includes(body.role) ? body.role : "teammember";
  await Promise.resolve(userDb.addTeamMember(teamId, userId, role));
  return { ok: true };
}

/**
 * Mitglied aus Team entfernen.
 */
async function removeMember(userDb, user, teamId, userId) {
  if (!(await canManageTeamMembers(userDb, user, teamId))) {
    const err = new Error("Nur Teamleiter dürfen Mitglieder entfernen");
    err.statusCode = 403;
    throw err;
  }
  await Promise.resolve(userDb.removeTeamMember(teamId, userId));
  return { ok: true };
}

/**
 * Team-Rolle eines Mitglieds ändern.
 */
async function changeMemberRole(userDb, user, teamId, userId, role) {
  if (!(await canManageTeamMembers(userDb, user, teamId))) {
    const err = new Error("Nur Teamleiter dürfen Rollen ändern");
    err.statusCode = 403;
    throw err;
  }
  if (!TEAM_MEMBER_ROLES.includes(role)) {
    const err = new Error("Ungültige Rolle");
    err.statusCode = 400;
    throw err;
  }
  await Promise.resolve(userDb.updateTeamMemberRole(teamId, userId, role));
  return { ok: true };
}

/**
 * Prüft, ob ein Benutzer Events für ein Team anlegen darf.
 * @param {object} userDb
 * @param {object|null} user
 * @param {string|null} teamId
 */
async function canAssignEventToTeam(userDb, user, teamId) {
  if (!teamId) return true;
  if (!user) return false;
  if (permissions.isAdmin(user)) return true;
  if (!userDb.supported) return false;
  const membership = await Promise.resolve(userDb.getTeamMembership(teamId, user.id));
  return Boolean(membership);
}

module.exports = {
  TEAM_MEMBER_ROLES,
  listTeamsForUser,
  canCreateTeam,
  canManageTeamMembers,
  canAccessTeam,
  createTeam,
  updateTeam,
  deleteTeam,
  addMember,
  removeMember,
  changeMemberRole,
  canAssignEventToTeam,
};
