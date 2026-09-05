#!/usr/bin/env node
/**
 * Event-Store ohne HTTP-Server: Metadaten + sessionCode, keine Sets.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const events = require("../lib/events");
const { copySlidesFrom } = require("../lib/deck");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exit(1);
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-events-"));
const origCwd = process.cwd();
process.chdir(dir);

const a = events.create({ title: "Townhall Ost", description: "Quartier", startAt: "2026-09-10", endAt: "2026-09-12", category: "Stadt", teamId: "team_test_a" });
assert(a.id && a.joinCode.length === 6, "create id/code");
assert(a.sessionCode === a.joinCode, "sessionCode equals joinCode");
assert(a.status === "planned", "default planned");
assert(!("sets" in a) || a.sets == null, "no sets on create");

const listed = events.list({ category: "Stadt" });
assert(listed.length === 1 && listed[0].title === "Townhall Ost", "list filter");

const pub = events.listPublic();
assert(pub.upcoming.length === 1 && pub.past.length === 0, "public upcoming");

events.setStatus(a.id, "archived");
assert(events.listPublic().upcoming.length === 0, "archived hidden");
events.setStatus(a.id, "planned");

const patched = events.update(a.id, { title: "Townhall Ost 2", description: "Update" });
assert(patched.title === "Townhall Ost 2", "update title");
assert(patched.sessionCode === a.sessionCode, "sessionCode immutable");

events.setStatus(a.id, "active");
assert(events.remove(a.id).statusCode === 409, "no delete while active");
events.setStatus(a.id, "planned");
assert(events.remove(a.id).ok, "delete planned");

const future = events.create({ title: "Zukunft", startAt: "2099-01-01", endAt: "2099-01-02", status: "active", teamId: "team_test_b" });
const tick = events.tickStatuses(Date.parse("2026-09-02T12:00:00Z"));
const afterTick = events.get(future.id);
assert(afterTick.status === "planned", "tick future to planned");
assert(tick.changed.some((c) => c.id === future.id), "tick reports change");

const past = events.create({ title: "Vergangen", startAt: "2020-01-01", endAt: "2020-01-02", status: "active", teamId: "team_test_c" });
events.tickStatuses(Date.parse("2026-09-02T12:00:00Z"));
assert(events.get(past.id).status === "ended", "tick past to ended");

const invite = events.inviteText(events.get(past.id), "https://example.de/j/123456");
assert(invite.includes("Nimm an") && invite.includes("Code:"), "invite text");

/* Migration: altes sets[]-JSON wird zu sessionCode, Folien zusammengeführt. */
const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-events-legacy-"));
process.chdir(legacyDir);
fs.mkdirSync("data");
fs.writeFileSync(
  "data/events.json",
  JSON.stringify({
    events: [
      {
        id: "ev_legacy",
        title: "Alt",
        description: "",
        startAt: "2026-09-10",
        endAt: "2026-09-11",
        status: "planned",
        category: "",
        room: "",
        joinCode: "111222",
        sessionCodes: ["111222"],
        branding: {},
        sets: [
          {
            id: "set_a",
            title: "Haupt-Set",
            active: true,
            slides: [{ id: "s1", type: "choice", question: "Eins", options: [{ label: "A" }] }],
          },
          {
            id: "set_b",
            title: "Feedback",
            active: false,
            slides: [{ id: "s2", type: "wordcloud", question: "Zwei" }],
          },
        ],
      },
    ],
  })
);
const mig = events.migrateLegacy();
assert(mig.changed && mig.pending.length === 1, "migrate reports pending");
assert(mig.pending[0].slides.length === 2, "sets merged into one deck");
assert(mig.pending[0].slides[0].question === "Eins", "active set first");
const migrated = events.get("ev_legacy");
assert(migrated.sessionCode === "111222", "sessionCode set");
assert(!migrated.sets, "sets removed");
assert(events.bySessionCode("111222")?.id === "ev_legacy", "lookup by session code");

function normalizeSlide(raw = {}) {
  return { id: raw.id || "n" + Math.random().toString(16).slice(2, 8), type: raw.type, question: raw.question, options: raw.options };
}
const dest = { slides: [{ id: "keep", type: "qa", question: "Bleibt" }] };
const copied = copySlidesFrom(dest, mig.pending[0].slides, { normalizeSlide });
assert(copied.ok && copied.copied === 2 && dest.slides.length === 3, "copy between decks");
assert(dest.slides[1].id !== "s1", "copied slides get new ids via normalize");
const srcOnly = copySlidesFrom({ slides: [{ id: "x", type: "qa", question: "X" }] }, dest.slides, {
  slideIds: ["keep"],
  normalizeSlide,
});
assert(srcOnly.ok && srcOnly.copied === 1, "copy selected ids");

/* startTime + eventImage */
process.chdir(dir);
const withTime = events.create({
  title: "Mit Countdown",
  startAt: "2099-06-01",
  endAt: "2099-06-01",
  startTime: "2099-06-01T14:00:00.000Z",
  eventImage: "data:image/png;base64,iVBORw0KGgo=",
});
assert(withTime.startTime === "2099-06-01T14:00:00.000Z", "startTime stored as ISO");
assert(withTime.eventImage.startsWith("data:image/png"), "eventImage kept");
const pubCard = events.publicEvent(withTime, { includeImage: false });
assert(pubCard.hasEventImage === true && pubCard.eventImage === undefined, "public without image bytes");
assert(pubCard.countdownActive === true, "countdown active for future start");
const meta = events.eventMetaFor(withTime.id);
assert(meta && meta.startTime && meta.eventImage, "eventMetaFor for session payload");
const pastCleared = events.create({
  title: "Vergangene Uhrzeit",
  startAt: "2020-01-01",
  endAt: "2020-01-01",
  status: "planned",
  startTime: "2020-01-01T10:00:00.000Z",
});
assert(!pastCleared.startTime, "past startTime cleared for planned create");
const activePast = events.create({
  title: "Aktiv mit Vergangenheit",
  startAt: "2020-01-01",
  endAt: "2020-01-01",
  status: "active",
  teamId: "team_test_d",
  startTime: "2020-01-01T10:00:00.000Z",
});
assert(activePast.startTime, "past startTime allowed when active");
const badImg = events.create({
  title: "Bad image",
  startAt: "2099-01-01",
  endAt: "2099-01-01",
  eventImage: "data:text/html,<script>x</script>",
});
assert(!badImg.eventImage, "rejects non-image data url");

const cd = events.create({
  title: "Countdown Defaults",
  startAt: "2099-06-01",
  endAt: "2099-06-02",
  teamId: "team_cd_def",
});
assert(cd.countdownStyle === "modern", "default countdownStyle modern");
assert(cd.showStageDateTime !== false, "default showStageDateTime true");
assert(cd.showStageQr === false, "default showStageQr false");
const meta = events.eventMetaFor(cd.id);
assert(meta.countdownStyle === "modern" && meta.showStageQr === false, "eventMetaFor countdown defaults");

process.chdir(origCwd);
fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(legacyDir, { recursive: true, force: true });
console.log("ok events");
