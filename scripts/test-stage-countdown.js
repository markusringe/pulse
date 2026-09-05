#!/usr/bin/env node
/**
 * Unit-Tests für Countdown-Metadaten (Server-seitig, ohne Browser).
 */
const meta = require("../lib/eventCountdownMeta");
const events = require("../lib/events");
const fs = require("fs");
const os = require("os");
const path = require("path");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exit(1);
  }
}

assert(meta.sanitizeCountdownStyle("modern") === "modern", "default modern");
assert(meta.sanitizeCountdownStyle("classic") === "classic", "classic ok");
assert(meta.sanitizeCountdownStyle("retro") === "retro", "retro ok");
assert(meta.sanitizeCountdownStyle("invalid") === "modern", "invalid → modern");

const formatted = meta.formatEventStartDisplay("2026-09-05T07:30:00.000Z", "de-DE");
assert(formatted.includes("2026") && formatted.includes("Uhr"), "DE datetime format");

assert(meta.countdownStatusLabel(60000) === "Wir starten in", "status running");
assert(meta.countdownStatusLabel(0) === "Beginnt gleich", "status expired");

assert(
  meta.formatJoinUrlDisplay("https://pulse.ringe.us/j/123456") === "pulse.ringe.us/j/123456",
  "join url display"
);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-countdown-meta-"));
const origCwd = process.cwd();
process.chdir(dir);

const ev = events.create({
  title: "Countdown Test",
  startAt: "2099-01-01",
  endAt: "2099-01-02",
  teamId: "team_cd",
  startTime: "2099-01-01T10:00:00.000Z",
  countdownStyle: "retro",
  showStageQr: true,
  showStageDateTime: false,
});

assert(ev.countdownStyle === "retro", "persist countdownStyle");
assert(ev.showStageQr === true, "persist showStageQr");
assert(ev.showStageDateTime === false, "persist showStageDateTime false");

const m = events.eventMetaFor(ev.id);
assert(m.countdownStyle === "retro", "eventMetaFor style");
assert(m.showStageQr === true, "eventMetaFor qr");
assert(m.showStageDateTime === false, "eventMetaFor datetime off");

events.patchEventMeta(ev.id, { showStageQr: false, countdownStyle: "classic" });
const m2 = events.eventMetaFor(ev.id);
assert(m2.showStageQr === false, "patch qr off");
assert(m2.countdownStyle === "classic", "patch style");

process.chdir(origCwd);
console.log("OK test-stage-countdown");
