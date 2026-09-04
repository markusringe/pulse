#!/usr/bin/env node
/**
 * Performance-Smoke: Admin-relevante Lib-Operationen unter Schwellwerten (kein Server).
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const tmpDb = path.join(os.tmpdir(), `pulse-perf-${process.pid}.db`);
if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
process.env.SQLITE_PATH = tmpDb;
process.env.USER_AUTH_ENABLED = "1";

const { createUserDb } = require("../lib/userDb");
const userService = require("../lib/userService");
const permissions = require("../lib/permissions");

const MAX_MS = {
  createUserDb: 500,
  listUsersEmpty: 200,
  countAdmins: 200,
  eventAccess: 50,
};

function timed(label, fn, maxMs) {
  const t0 = performance.now();
  const result = fn();
  const ms = performance.now() - t0;
  assert(ms < maxMs, `${label} zu langsam: ${ms.toFixed(1)} ms (max ${maxMs})`);
  return result;
}

(async () => {
  timed("createUserDb", () => createUserDb(), MAX_MS.createUserDb);
  const userDb = createUserDb();
  assert(userDb.supported, "DB unterstützt");

  await timed("listUsersEmpty", () => userDb.listUsers({}), MAX_MS.listUsersEmpty);
  await userService.createUser(userDb, {
    displayName: "Perf Admin",
    email: "perf@test.local",
    password: "PerfTest123!",
    role: "admin",
    status: "active",
  });

  await timed("countAdmins", () => userService.countAdmins(userDb), MAX_MS.countAdmins);

  const ev = { id: "e1", teamId: "t1", visibility: "private" };
  const user = { id: "u1", role: "teammember", status: "active" };
  for (let i = 0; i < 100; i++) {
    timed("eventAccess", () => permissions.eventAccess(user, ev, [], { userTeamIds: ["t1"] }), MAX_MS.eventAccess);
  }

  if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
  console.log("Performance-Smoke OK");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
