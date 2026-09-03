#!/usr/bin/env node
/**
 * Live-Zustand: versteckte Ergebnisse, Fanout zwischen Prozessen, Bus ohne Redis.
 */
const { canHideResults, voteCount, resultsPayload, fanoutResultsPayload, toClientEnvelope, applyFanoutEnvelope, allowedReaction } = require("../lib/liveState");
const { createBus } = require("../lib/bus");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const poll = { id: "s1", type: "choice", counts: { o1: 3, o2: 1 }, resultsVisible: false };
assert(canHideResults(poll), "Choice kann verborgen werden");
assert(voteCount(poll) === 4, "Stimmenzahl");
assert(!resultsPayload(poll).counts, "keine Counts solange verborgen");
assert(resultsPayload(poll).voteCount === 4, "nur Summe");

poll.resultsVisible = true;
assert(resultsPayload(poll).counts.o1 === 3, "Counts nach Reveal");

assert(!canHideResults({ type: "qa" }), "Q&A bleibt sichtbar");
assert(allowedReaction("👏"), "Klatschen erlaubt");
assert(!allowedReaction("💩"), "andere Emojis nicht");

const hidden = { id: "s2", type: "choice", counts: { a: 2 }, resultsVisible: false };
const fan = fanoutResultsPayload(hidden);
assert(fan.counts.a === 2 && fan.fanout === true, "Fanout trägt Counts trotz Hidden");
const client = toClientEnvelope({ type: "poll:update", payload: fan });
assert(!client.payload.counts, "Join sieht keine Hidden-Counts");
assert(client.payload.voteCount === 2, "Join sieht nur Summe");
const stageEnv = toClientEnvelope({ type: "poll:update", payload: fan }, { revealResults: true });
assert(stageEnv.payload.counts.a === 2, "Stage/Presenter behalten Hidden-Counts");
assert(toClientEnvelope({ type: "quiz_answer_sync", payload: {} }) === null, "Quiz-Sync nicht an Browser");
assert(toClientEnvelope({ type: "emergency_activated", payload: { paused: true, qaStatuses: [] } }).payload.qaStatuses == null, "Emergency ohne QA-Leak");

const session = {
  slides: [
    { id: "s2", type: "choice", counts: { a: 0 }, resultsVisible: false },
    { id: "q1", type: "qa", questions: [] },
    { id: "z1", type: "quiz", round: { status: "idle", answers: {} } },
  ],
  paused: false,
  activeSlideIndex: 0,
};
applyFanoutEnvelope(session, { type: "poll:update", payload: fan });
assert(session.slides[0].counts.a === 2, "Remote-Prozess übernimmt Stimmen");
applyFanoutEnvelope(session, { type: "emergency_activated", payload: { paused: true } });
assert(session.paused === true, "Notfall pausiert remote");
applyFanoutEnvelope(session, {
  type: "new_question",
  payload: { id: "n1", text: "Hallo", status: "pending" },
});
assert(session.slides[1].questions[0].id === "n1", "Q&A-Frage remote");
applyFanoutEnvelope(session, {
  type: "quiz_started",
  payload: { slideId: "z1", duration: 20, startedAt: 1 },
});
assert(session.slides[2].round.status === "running", "Quiz start remote");
applyFanoutEnvelope(session, {
  type: "quiz_answer_sync",
  payload: { slideId: "z1", clientId: "c1", answer: { indexes: [0] } },
});
assert(session.slides[2].round.answers.c1.indexes[0] === 0, "Quiz-Antwort remote");

const bus = createBus();
assert(bus.redisEnabled === false, "ohne REDIS_URL kein Redis");
bus.publish("123456", { type: "vote" });
bus.ping().then((p) => {
  assert(p.mode === "in-process", "Bus ping in-process");
  console.log("Live-State-Tests OK");
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
