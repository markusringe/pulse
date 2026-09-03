#!/usr/bin/env node
/**
 * Tests für lib/interactionState.js — Folien-Interaktionsstatus.
 */
const assert = require("assert");
const ix = require("../lib/interactionState");

function mockSession(slides, index = 0) {
  return {
    lobby: false,
    paused: false,
    activeSlideIndex: index,
    slides,
  };
}

function choiceSlide(id = "s1", overrides = {}) {
  return {
    id,
    type: "choice",
    question: "Test?",
    options: [{ id: "o1", label: "A" }],
    counts: { o1: 0 },
    ...overrides,
  };
}

console.log("test-interaction-state: start");

ix.ensureInteraction(choiceSlide(), { legacy: false });
const fresh = choiceSlide();
ix.ensureInteraction(fresh, { legacy: false });
assert(fresh.interaction.state === "active", "Neue Folie: active");
assert(fresh.interaction.manualStart === true, "Neue Folie: manualStart");

const legacy = choiceSlide();
ix.ensureInteraction(legacy, { legacy: true });
assert(legacy.interaction.state === "running", "Legacy: running sofort");

const session = mockSession([fresh]);
let gate = ix.canAcceptInput(session, fresh);
assert(!gate.ok && gate.error === "interaction_not_started", "Vor Start blockiert");

const start = ix.applyAction(session, fresh, "start", {}, 1000);
assert(start.ok, "Start ok");
assert(fresh.interaction.state === "running", "Nach Start: running");
gate = ix.canAcceptInput(session, fresh, 1000);
assert(gate.ok, "Nach Start: Eingabe erlaubt");

const pause = ix.applyAction(session, fresh, "pause", {}, 2000);
assert(pause.ok, "Pause ok");
gate = ix.canAcceptInput(session, fresh, 2000);
assert(!gate.ok && gate.error === "interaction_paused", "Pause blockiert");

const resume = ix.applyAction(session, fresh, "resume", {}, 3000);
assert(resume.ok, "Resume ok");
gate = ix.canAcceptInput(session, fresh, 3000);
assert(gate.ok, "Nach Resume: Eingabe erlaubt");

fresh.interaction.timerEnabled = true;
fresh.interaction.timerSec = 30;
fresh.interaction.endsAt = 5000;
const expired = ix.onTimerExpired(fresh);
assert(expired.state === "ended", "Timer-Ablauf → ended");
gate = ix.canAcceptInput(session, fresh, 6000);
assert(!gate.ok && gate.error === "interaction_ended", "Nach Ende blockiert");

const s2 = choiceSlide("s2");
ix.ensureInteraction(s2, { legacy: false });
ix.onSlideActivated(session, s2, fresh);
assert(fresh.interaction.state === "ended", "Folienwechsel finalisiert vorherige");
assert(s2.interaction.state === "active", "Neue Folie: active");

const ranking = {
  type: "ranking",
  options: [{ id: "o1" }, { id: "o2" }],
  ranks: {},
  voteCount: 0,
};
ix.ensureInteraction(ranking, { legacy: false });
session.slides = [ranking];
session.activeSlideIndex = 0;
ix.applyAction(session, ranking, "start", {}, 8000);
ix.applyAction(session, ranking, "end", { reason: "manual" }, 9000);
gate = ix.canAcceptInput(session, ranking, 9000);
assert(!gate.ok && gate.error === "interaction_ended", "Ranking nach Ende blockiert");

console.log("test-interaction-state: OK");
