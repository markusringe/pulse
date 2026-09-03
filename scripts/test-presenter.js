#!/usr/bin/env node
/**
 * Presenter-Felder: Notizen nie in der öffentlichen Payload,
 * Stimmen-Anteil und Q&A-Pending nur aus vorhandenem Zustand.
 */
const {
  presenterOnlyFields,
  presenterMeta,
  pendingQuestionCount,
  votedSharePct,
  hasVoteShare,
  voteCount,
} = require("../lib/liveState");
const { applyDeckAction, slideSource } = require("../lib/deck");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function normalizeSlide(raw = {}) {
  return {
    id: raw.id || "id-" + Math.random().toString(36).slice(2, 8),
    type: raw.type || "choice",
    question: raw.question || "Frage",
    options: raw.options || [],
    counts: raw.counts || { o1: 0 },
    ...presenterMeta(raw),
  };
}

function publicChoice(slide, opts = {}) {
  return {
    id: slide.id,
    type: slide.type,
    question: slide.question,
    voteCount: voteCount(slide),
    ...presenterOnlyFields(slide, opts),
  };
}

const secret = {
  id: "s1",
  type: "choice",
  question: "Thema?",
  notes: "GEHEIM: Überleitung zur IT",
  plannedMinutes: 5,
  counts: { o1: 2, o2: 1 },
};

const pub = publicChoice(secret, { reveal: false });
assert(!Object.prototype.hasOwnProperty.call(pub, "notes"), "notes nicht in public payload");
assert(!Object.prototype.hasOwnProperty.call(pub, "plannedMinutes"), "plannedMinutes nicht public");
assert(JSON.stringify(pub).indexOf("GEHEIM") < 0, "Notiztext nicht im JSON");
assert(pub.voteCount === 3, "voteCount bleibt sichtbar");

const revealed = publicChoice(secret, { reveal: true });
assert(revealed.notes === "GEHEIM: Überleitung zur IT", "Presenter-GET sieht notes");
assert(revealed.plannedMinutes === 5, "Presenter sieht plannedMinutes");

const stageView = publicChoice(secret, { reveal: true, revealNotes: false, stage: true });
assert(!Object.prototype.hasOwnProperty.call(stageView, "notes"), "Stage ohne notes trotz reveal");
assert(JSON.stringify(stageView).indexOf("GEHEIM") < 0, "Stage leakt keine Notizen");

assert(votedSharePct(3, 0) === null, "0 Teilnehmer → kein Prozent");
assert(votedSharePct(2, 4) === 50, "Anteil 50 %");
assert(votedSharePct(0, 8) === 0, "0 Stimmen bei Teilnehmern = 0 %");

const qa = {
  type: "qa",
  questions: [
    { id: "a", status: "pending" },
    { id: "b", status: "pending" },
    { id: "c", status: "approved" },
  ],
};
assert(pendingQuestionCount(qa) === 2, "nur pending zählen");
assert(!hasVoteShare(qa), "Q&A ohne Stimmen-Anteil");
assert(hasVoteShare(secret), "Choice hat Stimmen-Anteil");

const session = { slides: [normalizeSlide({ id: "n1", type: "choice", question: "Q", notes: "A" })], activeSlideIndex: 0 };
const patched = applyDeckAction(session, "patch", { id: "n1", notes: "B", plannedMinutes: 8 }, { normalizeSlide });
assert(patched.ok && session.slides[0].notes === "B", "Patch schreibt notes");
assert(session.slides[0].plannedMinutes === 8, "Patch schreibt Anzeigedauer in Sekunden");

const src = slideSource({ type: "qa", question: "F", notes: "Cue", plannedMinutes: 3 });
assert(src.notes === "Cue" && src.plannedMinutes === 3, "Duplikat-Quelle behält notes");

const dupSession = {
  slides: [normalizeSlide({ id: "d0", type: "choice", question: "Orig", notes: "Cue" })],
  activeSlideIndex: 0,
};
const dup = applyDeckAction(dupSession, "duplicate", { id: "d0" }, { normalizeSlide });
assert(dup.ok && dupSession.slides[1].notes === "Cue", "Duplikat kopiert notes");
assert(dupSession.slides[1].id !== "d0", "Kopie hat neue ID");

const metaEmpty = presenterOnlyFields({ notes: "x" }, {});
assert(Object.keys(metaEmpty).length === 0, "ohne reveal keine Keys");

console.log("Presenter-Tests OK");
