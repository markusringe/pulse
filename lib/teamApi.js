/**
 * REST-Handler für Team-Verwaltung (/api/teams/…).
 */

const audit = require("./auditLogger");
const teamService = require("./teamService");

/**
 * @param {object} ctx — { req, res, parts, userDb, send, readJson, getAuth }
 * @returns {Promise<boolean>}
 */
async function handleTeamsApi(ctx) {
  const { req, res, parts, userDb, send, readJson, getAuth } = ctx;

  if (!userDb.supported) {
    send(res, 503, { error: "Teams erfordern SQLite oder PostgreSQL" });
    return true;
  }

  const auth = await getAuth(req, {});
  if (!auth.user && !auth.viaSecret) {
    send(res, 401, { error: "Nicht angemeldet" });
    return true;
  }
  const user = auth.user;
  if (auth.viaSecret && !user) {
    /* Legacy-Admin ohne Cookie: voller Zugriff wie Instanz-Admin */
  }

  const teamId = parts[2] || "";
  const sub = parts[3] || "";
  const subId = parts[4] || "";

  /* GET /api/teams — alle sichtbaren Teams */
  if (req.method === "GET" && !teamId) {
    const teams = user
      ? await teamService.listTeamsForUser(userDb, user)
      : await Promise.resolve(userDb.listAllTeams());
    send(res, 200, { teams });
    return true;
  }

  /* POST /api/teams — neues Team */
  if (req.method === "POST" && !teamId) {
    if (!user) {
      send(res, 401, { error: "Nicht angemeldet" });
      return true;
    }
    try {
      const body = await readJson(req);
      const team = await teamService.createTeam(userDb, user, body);
      audit.log("team_created", { userId: user.id, action: team.id });
      send(res, 201, { success: true, team });
    } catch (err) {
      send(res, err.statusCode || 500, { error: err.message });
    }
    return true;
  }

  if (!teamId) return false;

  /* GET /api/teams/:id */
  if (req.method === "GET" && teamId && !sub) {
    const team = await Promise.resolve(userDb.findTeamById(teamId));
    if (!team) {
      send(res, 404, { error: "Team nicht gefunden" });
      return true;
    }
    if (user && !(await teamService.canAccessTeam(userDb, user, teamId)) && !auth.viaSecret) {
      send(res, 403, { error: "Keine Berechtigung" });
      return true;
    }
    team.memberCount = await Promise.resolve(userDb.countTeamMembers(teamId));
    if (user) {
      const membership = await Promise.resolve(userDb.getTeamMembership(teamId, user.id));
      team.memberRole = membership?.role || null;
    }
    send(res, 200, { team });
    return true;
  }

  /* PATCH /api/teams/:id */
  if (req.method === "PATCH" && teamId && !sub) {
    if (!user) {
      send(res, 401, { error: "Nicht angemeldet" });
      return true;
    }
    try {
      const body = await readJson(req);
      const team = await teamService.updateTeam(userDb, user, teamId, body);
      audit.log("team_updated", { userId: user.id, action: teamId });
      send(res, 200, { team });
    } catch (err) {
      send(res, err.statusCode || 500, { error: err.message });
    }
    return true;
  }

  /* DELETE /api/teams/:id */
  if (req.method === "DELETE" && teamId && !sub) {
    if (!user) {
      send(res, 401, { error: "Nicht angemeldet" });
      return true;
    }
    try {
      await teamService.deleteTeam(userDb, user, teamId);
      audit.log("team_deleted", { userId: user.id, action: teamId });
      send(res, 200, { success: true });
    } catch (err) {
      send(res, err.statusCode || 500, { error: err.message });
    }
    return true;
  }

  /* GET /api/teams/:id/members */
  if (req.method === "GET" && sub === "members" && !subId) {
    if (user && !(await teamService.canAccessTeam(userDb, user, teamId)) && !auth.viaSecret) {
      send(res, 403, { error: "Keine Berechtigung" });
      return true;
    }
    const members = await Promise.resolve(userDb.listTeamMembers(teamId));
    send(res, 200, { members });
    return true;
  }

  /* POST /api/teams/:id/members */
  if (req.method === "POST" && sub === "members" && !subId) {
    if (!user) {
      send(res, 401, { error: "Nicht angemeldet" });
      return true;
    }
    try {
      const body = await readJson(req);
      await teamService.addMember(userDb, user, teamId, body);
      audit.log("team_member_added", { userId: user.id, action: `${teamId}:${body.userId}` });
      send(res, 200, { success: true });
    } catch (err) {
      send(res, err.statusCode || 500, { error: err.message });
    }
    return true;
  }

  /* DELETE /api/teams/:id/members/:userId */
  if (req.method === "DELETE" && sub === "members" && subId) {
    if (!user) {
      send(res, 401, { error: "Nicht angemeldet" });
      return true;
    }
    try {
      await teamService.removeMember(userDb, user, teamId, subId);
      audit.log("team_member_removed", { userId: user.id, action: `${teamId}:${subId}` });
      send(res, 200, { success: true });
    } catch (err) {
      send(res, err.statusCode || 500, { error: err.message });
    }
    return true;
  }

  /* PATCH /api/teams/:id/members/:userId/role */
  if (req.method === "PATCH" && sub === "members" && subId && parts[5] === "role") {
    if (!user) {
      send(res, 401, { error: "Nicht angemeldet" });
      return true;
    }
    try {
      const body = await readJson(req);
      await teamService.changeMemberRole(userDb, user, teamId, subId, body.role);
      audit.log("team_member_role_changed", { userId: user.id, action: `${teamId}:${subId}:${body.role}` });
      send(res, 200, { success: true });
    } catch (err) {
      send(res, err.statusCode || 500, { error: err.message });
    }
    return true;
  }

  /* GET /api/teams/:id/events — Events des Teams */
  if (req.method === "GET" && sub === "events") {
    if (user && !(await teamService.canAccessTeam(userDb, user, teamId)) && !auth.viaSecret) {
      send(res, 403, { error: "Keine Berechtigung" });
      return true;
    }
    const eventStore = require("./events");
    const userDbModule = userDb;
    const all = eventStore.list({});
    const teamEvents = all.filter((ev) => ev.teamId === teamId);
    const events = [];
    for (const ev of teamEvents) {
      const owner = await Promise.resolve(userDbModule.findUserById(ev.ownerUserId));
      events.push({
        id: ev.id,
        title: ev.title,
        description: ev.description,
        startAt: ev.startAt,
        endAt: ev.endAt,
        status: ev.status,
        visibility: ev.visibility || "private",
        joinCode: ev.joinCode,
        ownerUserId: ev.ownerUserId,
        ownerName: owner?.displayName || "",
        createdAt: ev.createdAt,
      });
    }
    events.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    send(res, 200, { events });
    return true;
  }

  return false;
}

module.exports = { handleTeamsApi };
