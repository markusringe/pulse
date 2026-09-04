#!/usr/bin/env node
/**
 * Phase 2 — stateVersion: monotone Session-Version und optimistische Concurrency.
 */
const sessionVersion = require("../lib/sessionVersion");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const session = { code: "123456", stateVersion: 0 };

assert(sessionVersion.getVersion(session) === 0, "initial version 0");
assert(sessionVersion.readExpected({ expectedVersion: 0 }) === 0, "read expected");
assert(sessionVersion.readExpected({}) === null, "missing expected null");

let check = sessionVersion.checkExpected(session, 0);
assert(check.ok, "match ok");
check = sessionVersion.checkExpected(session, 1);
assert(!check.ok && check.code === "STATE_VERSION_CONFLICT", "mismatch conflict");

assert(sessionVersion.bump(session) === 1, "bump to 1");
assert(sessionVersion.getVersion(session) === 1, "version after bump");

sessionVersion.mergeRemote(session, 3);
assert(sessionVersion.getVersion(session) === 3, "mergeRemote max");
sessionVersion.mergeRemote(session, 2);
assert(sessionVersion.getVersion(session) === 3, "mergeRemote no decrease");

assert(sessionVersion.isStructuralType("deck"), "deck structural");
assert(!sessionVersion.isStructuralType("poll:update"), "poll not structural");

assert(sessionVersion.acceptIncoming({ stateVersion: 1 }, { stateVersion: 2 }), "accept newer");
assert(!sessionVersion.acceptIncoming({ stateVersion: 3 }, { stateVersion: 2 }), "reject stale");
assert(sessionVersion.acceptIncoming({ stateVersion: 1 }, {}), "accept missing version");

assert(
  sessionVersion.acceptStructural({ stateVersion: 5 }, { stateVersion: 3 }, { role: "participant", eventType: "slide" }),
  "participant slide bypass stale"
);
assert(
  !sessionVersion.acceptStructural({ stateVersion: 5 }, { stateVersion: 3 }, { role: "presenter", eventType: "slide" }),
  "presenter slide rejects stale"
);
assert(
  sessionVersion.acceptStructural({ stateVersion: 5 }, { stateVersion: 3 }, { role: "stage", eventType: "deck" }),
  "stage deck bypass stale"
);

sessionVersion.applyIncoming(session, { stateVersion: 5 });
assert(sessionVersion.getVersion(session) === 5, "applyIncoming");

const env = sessionVersion.withEnvelopeVersion({ type: "lobby", payload: { lobby: false } }, session);
assert(env.stateVersion === 5, "envelope version");

let blocked = false;
session.stateVersion = 2;
check = sessionVersion.checkExpected(session, 1);
if (!check.ok) blocked = true;
assert(blocked, "stale expected blocks");

console.log("test-state-version: OK");
