#!/usr/bin/env node
/**
 * Sonderfolien: Sanitize, currentSpecialSlide, Event-Ende.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const events = require("../lib/events");
const {
  sanitizeSpecialSlideConfig,
  sanitizeSpecialSlideKind,
  sanitizeCurrentSpecialSlide,
  specialSlideConfigFor,
} = require("../lib/eventSpecialSlides");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exit(1);
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-special-slides-"));
const origCwd = process.cwd();
process.chdir(dir);

const ev = events.create({
  title: "Sonderfolien-Test",
  startAt: "2099-06-01",
  endAt: "2099-06-02",
  teamId: "team_spec",
  startTime: "2099-06-01T14:00:00.000Z",
  pauseSlide: { enabled: true, title: "Pause", subtitle: "Kurz warten", style: "classic" },
  endSlide: { enabled: true, title: "Danke", subtitle: "Ende", style: "retro" },
});

assert(ev.pauseSlide.enabled, "pauseSlide persisted");
assert(specialSlideConfigFor(ev, "countdown"), "countdown config when startTime set");

const patched = events.update(ev.id, {
  currentSpecialSlide: "pause",
});
assert(patched.currentSpecialSlide === "pause", "currentSpecialSlide persisted");

const bad = events.update(ev.id, { currentSpecialSlide: "invalid" });
assert(bad.currentSpecialSlide === null, "invalid currentSpecialSlide -> null");

const meta = events.eventMetaFor(ev.id);
assert(meta.currentSpecialSlide === null, "eventMeta includes currentSpecialSlide");

events.update(ev.id, { currentSpecialSlide: "end" });
events.setStatus(ev.id, "ended");
assert(events.deriveStatus(events.get(ev.id)) === "ended", "manual ended status");

assert(sanitizeCurrentSpecialSlide("COUNTDOWN") === "countdown", "sanitize countdown");
assert(sanitizeSpecialSlideKind("start") === "start", "legacy start kind");

const defaults = sanitizeSpecialSlideConfig({}, "pause");
assert(defaults.title === "Pause", "pause defaults");

console.log("OK test-event-special-slides");
process.chdir(origCwd);
