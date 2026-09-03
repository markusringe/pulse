#!/usr/bin/env node
/**
 * Reine Q&A-Timer-Logik: clamp, start, pause, resume, extend, end, canSubmit.
 * Kein Server, keine Uhr-Abhängigkeit außer einem festen `now`.
 */
const {
  clampLimit,
  empty,
  normalize,
  snapshot,
  canSubmit,
  msUntilEnd,
  start,
  pause,
  resume,
  extend,
  end,
  configure,
  apply,
  MIN_SEC,
  MAX_SEC,
  DEFAULT_LIMIT,
} = require("../lib/qaTimer");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/* ----- clamp ----- */
assert(clampLimit(0) === 0, "0 = aus");
assert(clampLimit(-5) === 0, "negativ = aus");
assert(clampLimit("x") === 0, "NaN = aus");
assert(clampLimit(7) === MIN_SEC, "unter 10 → 10");
assert(clampLimit(14) === 10, "14 rundet auf 10");
assert(clampLimit(15) === 20, "15 rundet auf 20");
assert(clampLimit(60) === 60, "60 bleibt");
assert(clampLimit(300) === MAX_SEC, "300 = max");
assert(clampLimit(999) === MAX_SEC, "über max wird gekappt");

const now = 1_700_000_000_000;

/* ----- start ----- */
const running = start(empty(), now, 60);
assert(running.status === "running", "start setzt running");
assert(running.endsAt === now + 60_000, "endsAt = now + Limit");
assert(running.limitSec === 60, "Limit 60");
assert(canSubmit(running, now + 10_000) === true, "während running neue Fragen ok");
assert(canSubmit(running, now + 60_000) === false, "exakt am Ende keine neuen Fragen");
assert(msUntilEnd(running, now) === 60_000, "msUntilEnd voll");
assert(msUntilEnd(running, now + 59_500) === 500, "Restmillisekunden");

const snapRun = snapshot(running, now + 15_000);
assert(snapRun.remainingSec === 45, "45 s Rest");
assert(snapRun.status === "running", "Snapshot bleibt running");

const snapLate = snapshot(running, now + 61_000);
assert(snapLate.status === "ended", "Snapshot nach Ablauf = ended");
assert(snapLate.remainingMs === 0, "keine Restzeit");
assert(running.status === "running", "Persistiertes Objekt wird nicht mutiert");

/* ----- Default-Limit wenn leer ----- */
const def = start(empty(), now);
assert(def.limitSec === DEFAULT_LIMIT, "ohne Angabe Default 60");

/* ----- pause / resume ----- */
const paused = pause(running, now + 20_000);
assert(paused.status === "paused", "pause");
assert(paused.pausedRemainingMs === 40_000, "40 s eingefroren");
assert(canSubmit(paused, now + 20_000) === true, "pausiert: Fragen noch erlaubt");

const resumed = resume(paused, now + 30_000);
assert(resumed.status === "running", "resume");
assert(resumed.endsAt === now + 30_000 + 40_000, "endsAt = jetzt + Rest");
assert(resumed.pausedRemainingMs == null, "Pause-Rest gelöscht");

const pauseIdle = pause(empty(), now);
assert(pauseIdle.status === "idle", "pause auf idle ist no-op");

const resumeIdle = resume(empty(), now);
assert(resumeIdle.status === "idle", "resume auf idle ist no-op");

/* ----- Pause wenn schon abgelaufen → ended ----- */
const expired = pause(running, now + 90_000);
assert(expired.status === "ended", "pause nach Ablauf beendet");
assert(canSubmit(expired, now + 90_000) === false, "ended: keine neuen Fragen");

/* ----- extend ----- */
const ext = extend(running, 30, now + 10_000);
assert(ext.endsAt === running.endsAt + 30_000, "+30 s");
const extPaused = extend(paused, 60, now);
assert(extPaused.pausedRemainingMs === 40_000 + 60_000, "paused +60");
const extCap = extend(running, 1000, now);
assert(extCap.endsAt === now + 300_000, "Restzeit auf 300 s gekappt");
const extIdle = extend(empty(), 30, now);
assert(extIdle.status === "idle", "extend auf idle ist no-op");

/* ----- end ----- */
const stopped = end(running, now + 5_000);
assert(stopped.status === "ended", "end");
assert(canSubmit(stopped, now + 5_000) === false, "nach end keine Submit");

/* ----- configure ----- */
const cfg = configure(empty(), 90);
assert(cfg.enabled === true && cfg.limitSec === 90, "configure 90");
const cfgOff = configure(cfg, 0);
assert(cfgOff.enabled === false, "0 schaltet enabled aus");
assert(cfgOff.limitSec === 90, "altes Limit bleibt als Feld");

/* ----- apply ----- */
assert(apply(empty(), "start", { now, limitSec: 20 }).status === "running", "apply start");
assert(apply(running, "pause", { now: now + 1000 }).status === "paused", "apply pause");
assert(apply(paused, "resume", { now }).status === "running", "apply resume");
assert(apply(running, "extend", { now, seconds: 30 }).endsAt === running.endsAt + 30_000, "apply extend");
assert(apply(running, "end", { now }).status === "ended", "apply end");
assert(apply(empty(), "nope", { now }).status === "idle", "unbekannte Aktion → normalize");

/* ----- normalize Müll ----- */
assert(normalize(null).status === "idle", "null → empty");
assert(normalize({ status: "hacked" }).status === "idle", "unbekannter Status");

console.log("Q&A-Timer-Tests OK");
