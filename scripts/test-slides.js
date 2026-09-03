#!/usr/bin/env node
/**
 * Neue Folientypen, private Q&A, Multi-Correct-Quiz.
 */
const slideTypes = require("../lib/slideTypes");
const slideVotes = require("../lib/slideVotes");
const interactive = require("../lib/interactive");
const liveState = require("../lib/liveState");
const { isStopword } = require("../lib/stopwords");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/* ----- Ranking: Durchschnitt + Borda ----- */
const ranks = {
  o1: { sum: 1 + 2, n: 2, borda: 3 + 2 },
  o2: { sum: 2 + 1, n: 2, borda: 2 + 3 },
};
const rs = slideVotes.rankingStats(ranks, 2);
assert(rs.byId.o1.average === 1.5, "Ranking Ø Rang");
assert(rs.byId.o1.borda === 5, "Borda-Summe");
assert(slideVotes.rankingValid(["o2", "o1"], ["o1", "o2"]), "gültige Reihenfolge");
assert(!slideVotes.rankingValid(["o1", "o1"], ["o1", "o2"]), "keine Duplikate");

const session = { votes: new Map(), slides: [] };
const rankingSlide = {
  type: "ranking",
  options: [{ id: "o1" }, { id: "o2" }, { id: "o3" }],
  ranks: {},
  voteCount: 0,
};
const r1 = slideVotes.applyTypedVote(session, { id: "c1" }, { order: ["o3", "o1", "o2"] }, rankingSlide);
assert(r1.ok, "Ranking-Stimme angenommen");
assert(rankingSlide.ranks.o3.sum === 1 && rankingSlide.ranks.o3.borda === 3, "Erster Platz = Rang 1, Borda n");
assert(rankingSlide.voteCount === 1, "eine Person gezählt");

/* ----- Punkte-100: Summe muss 100 sein ----- */
assert(slideVotes.points100Valid({ o1: 40, o2: 60 }, ["o1", "o2"]), "100 Punkte gültig");
assert(!slideVotes.points100Valid({ o1: 40, o2: 50 }, ["o1", "o2"]), "99 Punkte ungültig");
const pSlide = {
  type: "points100",
  options: [{ id: "o1" }, { id: "o2" }],
  sums: { o1: 0, o2: 0 },
  voteCount: 0,
};
const pBad = slideVotes.applyTypedVote(session, { id: "c2" }, { points: { o1: 10, o2: 10 } }, pSlide);
assert(pBad.error === "sum", "Summe ≠ 100 abgelehnt");
const pOk = slideVotes.applyTypedVote(session, { id: "c2" }, { points: { o1: 25, o2: 75 } }, pSlide);
assert(pOk.ok && pSlide.sums.o1 === 25 && pSlide.sums.o2 === 75, "Punkte addiert");
const stats = slideVotes.points100Stats(pSlide.sums, pSlide.voteCount);
assert(stats.byId.o2.average === 75, "Mittel = Summe / Stimmen");

/* ----- Hideable + öffentliche Payloads ----- */
assert(liveState.canHideResults({ type: "ranking" }), "Ranking hideable");
assert(liveState.canHideResults({ type: "open_text" }), "Freitext hideable");
assert(liveState.canHideResults({ type: "datetime" }), "Termin hideable");
const hidden = liveState.resultsPayload({
  id: "x",
  type: "ranking",
  resultsVisible: false,
  ranks: rankingSlide.ranks,
  voteCount: 1,
});
assert(!hidden.ranks, "keine Ranking-Zahlen vor Reveal");

/* ----- Private Q&A nicht in publicQaSlide für Teilnehmende ----- */
const qaSlide = {
  type: "qa",
  question: "Fragen?",
  moderated: true,
  questions: [
    { id: "pub", text: "Öffentlich", status: "approved", authorId: "a", upvotes: 1, voters: [], category: "tech" },
    { id: "priv", text: "GEHEIM privat", status: "approved", authorId: "b", upvotes: 0, voters: [], private: true, category: "org" },
    { id: "merged", text: "weg", status: "hidden", authorId: "c", upvotes: 0, voters: [], mergedInto: "pub" },
  ],
};
const pub = interactive.publicQaSlide(qaSlide, false, "viewer");
assert(pub.questions.length === 1 && pub.questions[0].id === "pub", "nur öffentliche Frage");
assert(!JSON.stringify(pub).includes("GEHEIM"), "Privattext nicht geleakt");
const asAuthor = interactive.publicQaSlide(qaSlide, false, "b");
assert(asAuthor.questions.some((q) => q.id === "priv"), "Autor sieht eigene private Frage");
const asPresenter = interactive.publicQaSlide(qaSlide, true, "p");
assert(asPresenter.questions.some((q) => q.id === "priv"), "Presenter sieht privat");
assert(pub.qaTimer && pub.qaTimer.status === "idle", "publicQaSlide enthält Timer-Snapshot");

/* ----- Multi-Correct ----- */
assert(
  JSON.stringify(slideTypes.normalizeCorrectIndexes({ correctIndex: 1 }, 4)) === JSON.stringify([1]),
  "correctIndex → Array"
);
assert(
  JSON.stringify(slideTypes.normalizeCorrectIndexes({ correctIndexes: [0, 2, 2] }, 4)) === JSON.stringify([0, 2]),
  "Duplikate entfernt"
);
assert(interactive.answersMatch([0, 2], [2, 0]), "Reihenfolge egal");
assert(!interactive.answersMatch([0], [0, 2]), "unvollständig = falsch");
assert(!interactive.answersMatch([0, 1, 2], [0, 2]), "zu viele = falsch");

const quiz = {
  type: "quiz",
  options: [{ id: "a" }, { id: "b" }, { id: "c" }],
  correctIndexes: [0, 2],
  round: { status: "idle" },
};
const pubQuiz = interactive.publicQuizSlide(quiz, false);
assert(pubQuiz.correctIndexes == null, "Lösungen nicht vor Reveal");
assert(pubQuiz.multiCorrect === true, "Multi-Flag ohne Indizes");
const revealed = interactive.publicQuizSlide({ ...quiz, round: { status: "ended", answers: {} } }, false);
assert(JSON.stringify(revealed.correctIndexes) === JSON.stringify([0, 2]), "nach Ende sichtbar");

/* ----- Stoppwörter ----- */
assert(isStopword("und"), "DE-Stoppwort");
assert(isStopword("the"), "EN-Stoppwort");
assert(!isStopword("Klarheit"), "Inhalt bleibt");

assert(slideTypes.isKnownType("image_choice"), "image_choice bekannt");
assert(slideTypes.isKnownType("datetime"), "datetime bekannt");
assert(slideTypes.isKnownType("picker"), "picker bekannt");

/* ----- Picker: 10–50 Optionen, Single/Multi ----- */
const pickerOpts = Array.from({ length: 12 }, (_, i) => ({ id: `o${i + 1}`, label: `Stadt ${i + 1}` }));
assert(slideTypes.validatePickerSlide({ type: "picker", options: pickerOpts }).ok, "12 Picker-Optionen gültig");
assert(!slideTypes.validatePickerSlide({ type: "picker", options: pickerOpts.slice(0, 5) }).ok, "<10 abgelehnt");
const { options: normPicker } = slideTypes.normalizePickerOptions(pickerOpts.slice(0, 5));
assert(normPicker.length === 10, "normalizePickerOptions füllt auf 10 auf");
const pickerSlide = {
  type: "picker",
  options: normPicker,
  counts: slideTypes.emptyCounts(normPicker),
  voteCount: 0,
  allowMultiple: false,
};
const pick1 = slideVotes.applyTypedVote(session, { id: "p1" }, { optionId: "o3" }, pickerSlide);
assert(pick1.ok && pickerSlide.counts.o3 === 1, "Picker Single-Select");
const pickerMulti = {
  ...pickerSlide,
  allowMultiple: true,
  maxSelections: 2,
  counts: slideTypes.emptyCounts(normPicker),
  voteCount: 0,
};
const pick2 = slideVotes.applyTypedVote(session, { id: "p2" }, { optionIds: ["o1", "o2"] }, pickerMulti);
assert(pick2.ok && pickerMulti.counts.o1 === 1 && pickerMulti.counts.o2 === 1, "Picker Multi-Select");
assert(slideTypes.isHideable("picker"), "Picker hideable");

console.log("Slide-Tests OK");
