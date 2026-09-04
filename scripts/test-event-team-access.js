#!/usr/bin/env node
/**
 * Team-basierte Event-Berechtigungen und teamId-Pflicht.
 */

const nodeAssert = require("assert");
const permissions = require("../lib/permissions");
const eventStore = require("../lib/events");
const fs = require("fs");
const path = require("path");
const os = require("os");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const teamA = "team_a";
const teamB = "team_b";

const memberA = { id: "usr_a", role: "teammember", status: "active" };
const memberB = { id: "usr_b", role: "teammember", status: "active" };
const leaderA = { id: "usr_l", role: "teamleader", status: "active" };
const admin = { id: "usr_admin", role: "admin", status: "active" };
const viewer = { id: "usr_v", role: "viewer", status: "active" };

const eventWithTeam = {
  id: "ev_1",
  teamId: teamA,
  visibility: "private",
  ownerUserId: "usr_old",
  editorUserIds: ["usr_legacy"],
  presenterUserIds: [],
  viewerUserIds: [],
};

const eventNoTeam = { id: "ev_2", teamId: "", visibility: "private" };
const eventPublic = { id: "ev_3", teamId: teamB, visibility: "public" };

/* Legacy-Listen werden bei Berechtigungen ignoriert. */
const legacyAccess = [{ user_id: "usr_legacy", access_role: "editor" }];
const ctxA = { userTeamIds: [teamA] };
const ctxB = { userTeamIds: [teamB] };

const accessMember = permissions.eventAccess(memberA, eventWithTeam, legacyAccess, ctxA);
assert(accessMember.edit && accessMember.present && accessMember.view, "Teammitglied darf Event des Teams bearbeiten");

const accessOther = permissions.eventAccess(memberB, eventWithTeam, legacyAccess, ctxB);
assert(!accessOther.edit && !accessOther.view, "Fremdes Team sieht Event nicht");

const accessLegacyIgnored = permissions.eventAccess(memberB, eventWithTeam, legacyAccess, ctxB);
assert(!accessLegacyIgnored.edit, "Legacy editorUserIds/dbAccess wird ignoriert");

const accessOrphan = permissions.eventAccess(memberA, eventNoTeam, [], ctxA);
assert(!accessOrphan.edit && !accessOrphan.view, "Event ohne Team: kein Zugriff für Teammitglied");

const accessAdminOrphan = permissions.eventAccess(admin, eventNoTeam, [], {});
assert(accessAdminOrphan.edit, "Admin darf Event ohne Team verwalten");

assert(permissions.canChangeEventTeam(admin), "Admin darf Team ändern");
assert(!permissions.canChangeEventTeam(leaderA), "Teamleiter darf Team nicht wechseln");
assert(permissions.canAssignInitialEventTeam(leaderA, eventNoTeam), "Teamleiter darf Erstzuordnung");
assert(permissions.canAssignInitialEventTeam(memberA, eventNoTeam), "Teammitglied darf Erstzuordnung");
assert(!permissions.canAssignInitialEventTeam(leaderA, eventWithTeam), "Keine Erstzuordnung wenn Team schon gesetzt");
assert(!permissions.canAssignInitialEventTeam(viewer, eventNoTeam), "Viewer darf nicht zuordnen");

const viewerPublic = permissions.eventAccess(viewer, eventPublic, [], ctxB);
assert(viewerPublic.view && !viewerPublic.present, "Viewer sieht nur public, nicht präsentieren");

const filtered = permissions.filterEventsForUser(memberA, [eventWithTeam, eventNoTeam], {}, ctxA);
assert(filtered.length === 1 && filtered[0].id === "ev_1", "Filter zeigt nur Events des eigenen Teams");

/* teamId-Pflicht beim Anlegen (wenn requireTeam). */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-ev-team-"));
const prev = process.cwd();
process.chdir(tmp);
fs.mkdirSync("data", { recursive: true });
fs.writeFileSync(path.join("data", "events.json"), JSON.stringify({ events: [] }));

nodeAssert.throws(
  () => eventStore.create({ title: "Ohne Team" }, { requireTeam: true }),
  /Team ist erforderlich/,
  "Create ohne teamId schlägt fehl"
);

const created = eventStore.create({ title: "Mit Team", teamId: teamA }, { requireTeam: true });
assert(created.teamId === teamA, "Create mit teamId ok");
assert(Array.isArray(created.editorUserIds) && created.editorUserIds.length === 0, "Legacy-Listen leer");

eventStore.setStatus(created.id, "active");
assert(eventStore.get(created.id).status === "active", "Aktivierung mit teamId ok");

const orphan = eventStore.create({ title: "Ohne Team Legacy" });
nodeAssert.throws(
  () => eventStore.setStatus(orphan.id, "active"),
  /Team-Zuordnung/,
  "Aktivierung ohne teamId schlägt fehl"
);

const created2 = eventStore.create({ title: "X", teamId: teamA });
eventStore.update(created2.id, { editorUserIds: ["u1"], presenterUserIds: ["u2"] });
const saved = eventStore.get(created2.id);
assert(saved.editorUserIds.length === 0 && saved.presenterUserIds.length === 0, "Speichern entfernt Legacy-Listen");

process.chdir(prev);
fs.rmSync(tmp, { recursive: true, force: true });

console.log("test-event-team-access: ok");
