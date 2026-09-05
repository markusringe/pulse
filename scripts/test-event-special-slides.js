#!/usr/bin/env node
/**
 * Sonderfolien: Sanitize, Persistenz und Event-Ende via deriveStatus.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const events = require("../lib/events");
const {
  sanitizeSpecialSlideConfig,
  sanitizeSpecialSlideKind,
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
  startSlide: {
    enabled: true,
    title: "Willkommen",
    subtitle: "Gleich geht es los",
    style: "modern",
  },
  pauseSlide: { enabled: true, title: "Pause", subtitle: "Kurz warten", style: "classic" },
  endSlide: {
    enabled: true,
    title: "Danke",
    subtitle: "Ende",
    style: "retro",
  },
});

assert(ev.startSlide.enabled && ev.startSlide.title === "Willkommen", "startSlide persisted");
assert(ev.pauseSlide.style === "classic", "pause style sanitized");
assert(ev.endSlide.type === "thanks", "end type fixed");

const stripped = events.update(ev.id, {
  startSlide: { enabled: true, title: "<b>X</b>", subtitle: "x".repeat(200), style: "invalid" },
});
assert(stripped.startSlide.title === "X", "html stripped from title");
assert(stripped.startSlide.subtitle.length === 120, "subtitle max 120");
assert(stripped.startSlide.style === "modern", "invalid style -> modern");

const meta = events.eventMetaFor(ev.id);
assert(meta.startSlide.enabled && meta.endSlide.enabled, "eventMeta includes special slides");

events.setStatus(ev.id, "ended");
const ended = events.get(ev.id);
assert(events.deriveStatus(ended) === "ended", "manual ended wins over calendar active range");

const disabledEv = events.create({
  title: "Disabled",
  startAt: "2099-07-01",
  endAt: "2099-07-02",
  teamId: "team_spec2",
  startSlide: { enabled: false, title: "Nope" },
});
assert(!specialSlideConfigFor(disabledEv, "start"), "disabled start not returned");

assert(sanitizeSpecialSlideKind("START") === "start", "kind case insensitive");
assert(sanitizeSpecialSlideKind("nope") === null, "invalid kind null");

const defaults = sanitizeSpecialSlideConfig({}, "pause");
assert(defaults.title === "Pause" && defaults.enabled === false, "defaults for empty pause");

console.log("OK test-event-special-slides");
process.chdir(origCwd);
