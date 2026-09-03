#!/usr/bin/env node
/**
 * Deck-Editor: Reihenfolge, Löschen, Duplizieren, Cap, Inhalts-Update.
 */
const { applyDeckAction, copySlidesFrom, MAX_SLIDES, preserveLiveState } = require("../lib/deck");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function normalizeSlide(raw = {}) {
  const options = Array.isArray(raw.options) && raw.options.length
    ? raw.options.map((o, i) => ({ id: o.id || `o${i + 1}`, label: o.label || `Option ${i + 1}` }))
    : [
        { id: "o1", label: "A" },
        { id: "o2", label: "B" },
      ];
  return {
    id: raw.id || "id-" + Math.random().toString(36).slice(2, 8),
    type: raw.type || "choice",
    question: raw.question || "Frage",
    options,
    counts: raw.counts || Object.fromEntries(options.map((o) => [o.id, 0])),
    correctIndexes: raw.correctIndexes,
    correctIndex: raw.correctIndex,
    duration: raw.duration,
    resultsVisible: raw.resultsVisible === true,
    notes: raw.notes,
    plannedMinutes: raw.plannedMinutes,
    moderated: raw.moderated,
    qaTimer: raw.qaTimer,
    scale: raw.scale,
    style: raw.style,
    round: raw.round,
    scores: raw.scores,
    entries: raw.entries,
    questions: raw.questions,
  };
}

function sessionWith(n) {
  const slides = Array.from({ length: n }, (_, i) =>
    normalizeSlide({ id: "s" + i, type: "choice", question: "F" + i })
  );
  return { slides, activeSlideIndex: 0 };
}

const s = sessionWith(2);
const added = applyDeckAction(s, "add", { slide: { type: "qa", question: "Q&A" } }, { normalizeSlide });
assert(added.ok && s.slides.length === 3, "Folie hinzugefügt");
assert(s.activeSlideIndex === 2, "neue Folie ist aktiv");

const dup = applyDeckAction(s, "duplicate", { id: "s0" }, { normalizeSlide });
assert(dup.ok && s.slides.length === 4, "dupliziert");
assert(s.slides[1].question === "F0", "Kopie steht hinter dem Original");
assert(s.slides[1].id !== "s0", "Kopie hat neue ID");

assert(applyDeckAction(s, "move", { id: s.slides[3].id, index: 0 }, { normalizeSlide }).ok, "verschoben");
assert(s.slides[0].type === "qa", "Q&A liegt vorn");

const before = s.slides.length;
assert(applyDeckAction(s, "remove", { id: s.slides[0].id }, { normalizeSlide }).ok, "gelöscht");
assert(s.slides.length === before - 1, "eine Folie weniger");

const one = sessionWith(1);
assert(applyDeckAction(one, "remove", { id: "s0" }, { normalizeSlide }).error, "letzte Folie bleibt");

const full = sessionWith(MAX_SLIDES);
assert(applyDeckAction(full, "add", { type: "choice" }, { normalizeSlide }).error, "Cap greift");

const target = sessionWith(1);
const copied = copySlidesFrom(target, sessionWith(2).slides, { normalizeSlide });
assert(copied.ok && copied.copied === 2 && target.slides.length === 3, "Folien zwischen Sessions kopiert");
assert(target.slides[1].id !== "s0", "Kopien haben neue IDs");

/* --- Inhalts-Update --- */
const edit = sessionWith(1);
edit.slides[0].counts = { o1: 5, o2: 3 };
edit.slides[0].options = [
  { id: "o1", label: "A" },
  { id: "o2", label: "B" },
];
const updated = applyDeckAction(
  edit,
  "update",
  {
    id: "s0",
    slide: {
      question: "Neue Frage",
      options: [
        { id: "o1", label: "Alpha" },
        { id: "o2", label: "Beta" },
        { id: "o3", label: "Gamma" },
      ],
      resultsVisible: true,
      notes: "Hinweis",
    },
  },
  { normalizeSlide }
);
assert(updated.ok, "Update ok");
assert(edit.slides[0].id === "s0", "ID bleibt");
assert(edit.slides[0].question === "Neue Frage", "Frage aktualisiert");
assert(edit.slides[0].options.length === 3, "Option hinzugefügt");
assert(edit.slides[0].counts.o1 === 5, "Stimmen o1 erhalten");
assert(edit.slides[0].counts.o2 === 3, "Stimmen o2 erhalten");
assert(edit.slides[0].counts.o3 === 0, "neue Option bei 0");
assert(edit.slides[0].notes === "Hinweis", "Notizen gesetzt");

assert(
  applyDeckAction(edit, "update", { id: "s0", slide: { question: "   " } }, { normalizeSlide }).error,
  "leere Frage abgelehnt"
);
assert(
  applyDeckAction(edit, "update", { id: "missing", slide: { question: "X" } }, { normalizeSlide }).error,
  "unbekannte Folie"
);
assert(
  applyDeckAction(
    edit,
    "update",
    { id: "s0", slide: { question: "Q", options: [{ label: "nur eine" }] } },
    { normalizeSlide }
  ).error,
  "eine Option abgelehnt"
);

const quiz = {
  slides: [
    normalizeSlide({
      id: "q1",
      type: "quiz",
      question: "Quiz?",
      options: [
        { id: "o1", label: "Ja" },
        { id: "o2", label: "Nein" },
      ],
      correctIndexes: [0],
      round: { status: "running" },
      scores: { a: 10 },
    }),
  ],
  activeSlideIndex: 0,
};
const quizUp = applyDeckAction(
  quiz,
  "update",
  {
    id: "q1",
    slide: {
      question: "Quiz neu?",
      options: [
        { id: "o1", label: "Ja" },
        { id: "o2", label: "Nein" },
      ],
      correctIndexes: [1],
      duration: 45,
    },
  },
  { normalizeSlide }
);
assert(quizUp.ok && quiz.slides[0].correctIndexes?.[0] === 1, "Quiz-Korrektur aktualisiert");
assert(quiz.slides[0].round?.status === "running", "Quiz-Runde erhalten");
assert(quiz.slides[0].scores?.a === 10, "Scores erhalten");
assert(quiz.slides[0].type === "quiz", "Typ unverändert");

assert(
  applyDeckAction(
    quiz,
    "update",
    {
      id: "q1",
      slide: {
        question: "Quiz?",
        options: [
          { id: "o1", label: "Ja" },
          { id: "o2", label: "Nein" },
        ],
        correctIndexes: [],
      },
    },
    { normalizeSlide }
  ).error,
  "Quiz ohne korrekte Antwort abgelehnt"
);

const preserved = preserveLiveState(
  { id: "a", type: "choice", counts: { o1: 2 }, entries: [{ t: 1 }] },
  { id: "b", type: "wordcloud", question: "W", options: [{ id: "o1", label: "x" }] }
);
assert(preserved.id === "a" && preserved.type === "choice", "preserve behält id/type");

/* Weitere Typen aktualisieren */
const rating = {
  slides: [
    normalizeSlide({
      id: "r1",
      type: "rating_scale",
      question: "Bewertung?",
      scale: 5,
      style: "icons",
    }),
  ],
  activeSlideIndex: 0,
};
assert(
  applyDeckAction(
    rating,
    "update",
    { id: "r1", slide: { question: "Neue Bewertung", scale: 7, style: "stars" } },
    { normalizeSlide }
  ).ok,
  "Rating-Update"
);
assert(rating.slides[0].question === "Neue Bewertung" && rating.slides[0].scale === 7, "Rating-Felder");

const cloud = {
  slides: [
    normalizeSlide({
      id: "w1",
      type: "wordcloud",
      question: "Wort?",
      entries: [{ text: "Hallo", count: 2 }],
      resultsVisible: true,
    }),
  ],
  activeSlideIndex: 0,
};
assert(
  applyDeckAction(cloud, "update", { id: "w1", slide: { question: "Neues Wort", resultsVisible: false } }, { normalizeSlide }).ok,
  "Wortwolke-Update"
);
assert(cloud.slides[0].entries?.[0]?.text === "Hallo", "Wortwolken-Einträge bleiben");

const qa = {
  slides: [
    normalizeSlide({
      id: "qa1",
      type: "qa",
      question: "Fragen?",
      moderated: true,
      questions: [{ id: "x", text: "Hi", status: "pending" }],
      qaTimer: { enabled: true, limitSec: 60, status: "idle" },
    }),
  ],
  activeSlideIndex: 0,
};
assert(
  applyDeckAction(
    qa,
    "update",
    {
      id: "qa1",
      slide: {
        question: "Neue Q&A",
        moderated: false,
        qaTimer: { enabled: false, limitSec: 90, status: "idle" },
      },
    },
    { normalizeSlide }
  ).ok,
  "Q&A-Update"
);
assert(qa.slides[0].questions?.length === 1, "Q&A-Fragen bleiben");
assert(qa.slides[0].type === "qa", "Q&A-Typ bleibt");

console.log("Deck-Tests OK");
