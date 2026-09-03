/**
 * Q&A- und Quiz-Logik serverseitig (eine Quelle für REST und WebSocket).
 */

const crypto = require("crypto");
const { QA_CATEGORIES, normalizeCorrectIndexes } = require("./slideTypes");
const qaTimer = require("./qaTimer");

/** @type {Map<string, NodeJS.Timeout>} */
const quizTimers = new Map();

function findQaSlide(session, slideId) {
  return (
    session.slides.find((s) => s.id === slideId && s.type === "qa") ||
    session.slides.find((s) => s.type === "qa")
  );
}

function findQuizSlide(session, slideId) {
  return (
    session.slides.find((s) => s.id === slideId && s.type === "quiz") ||
    session.slides.find((s) => s.type === "quiz")
  );
}

function normalizeCategory(value) {
  const key = String(value || "other").toLowerCase();
  return QA_CATEGORIES.includes(key) ? key : "other";
}

function submitQuestion(session, client, payload) {
  const slide = findQaSlide(session, payload.slideId);
  if (!slide) return { error: "Keine Q&A-Folie" };
  const text = String(payload.text || "").trim().slice(0, 500);
  if (!text) return { error: "Leerer Text" };
  const q = {
    id: crypto.randomBytes(4).toString("hex"),
    text,
    authorId: client.id,
    authorName: displayName(client),
    upvotes: 0,
    voters: [],
    status: "pending",
    createdAt: Date.now(),
    comments: [],
    category: normalizeCategory(payload.category),
    private: payload.private === true,
    groupId: null,
    mergedInto: null,
    presenterAnswer: "",
  };
  slide.questions = slide.questions || [];
  slide.questions.push(q);
  return { question: publicQuestion(q, client.id, { reveal: true }) };
}

function upvoteQuestion(session, client, questionId) {
  const q = findQuestion(session, questionId);
  if (!q) return { error: "Frage nicht gefunden" };
  if (q.mergedInto) return { error: "Frage ist gruppiert" };
  q.voters = q.voters || [];
  if (q.voters.includes(client.id)) return { error: "Bereits gevoted", question: publicQuestion(q, client.id) };
  q.voters.push(client.id);
  q.upvotes += 1;
  return { question: publicQuestion(q, client.id) };
}

function moderateQuestion(session, questionId, action, extra = {}) {
  const q = findQuestion(session, questionId);
  if (!q) return { error: "Frage nicht gefunden" };
  const map = { approve: "approved", hide: "hidden", answer: "answered" };
  if (action === "answer_text") {
    q.presenterAnswer = String(extra.text || "").trim().slice(0, 800);
    if (q.presenterAnswer && q.status === "pending") q.status = "approved";
    return { question: publicQuestion(q, null, { reveal: true }) };
  }
  if (action === "group") {
    return groupQuestions(session, extra.keepId || questionId, extra.mergeIds || extra.ids || []);
  }
  if (!map[action]) return { error: "Unbekannte Aktion" };
  q.status = map[action];
  return { question: publicQuestion(q, null, { reveal: true }) };
}

/**
 * Presenter fasst Fragen zusammen: keepId bleibt sichtbar, andere zeigen darauf.
 * Upvotes der Gruppe laufen auf der sichtbaren Frage zusammen.
 */
function groupQuestions(session, keepId, mergeIds) {
  const keep = findQuestion(session, keepId);
  if (!keep) return { error: "Frage nicht gefunden" };
  const ids = Array.isArray(mergeIds) ? mergeIds.map(String) : [];
  keep.groupId = keep.groupId || keep.id;
  const grouped = [];
  for (const id of ids) {
    if (id === keep.id) continue;
    const q = findQuestion(session, id);
    if (!q) continue;
    q.mergedInto = keep.id;
    q.groupId = keep.groupId;
    q.status = "hidden";
    keep.upvotes += Number(q.upvotes) || 0;
    grouped.push(q.id);
  }
  return { question: publicQuestion(keep, null, { reveal: true }), grouped };
}

function listQuestions(session, slideId, viewerId, includePending) {
  const slide = findQaSlide(session, slideId);
  if (!slide) return [];
  return visibleQuestions(slide, viewerId, includePending)
    .map((q) => publicQuestion(q, viewerId, { reveal: includePending }))
    .filter(Boolean);
}

/**
 * Öffentliche Liste: keine privaten fremden Fragen, keine in Gruppen aufgegangenen IDs.
 */
function visibleQuestions(slide, viewerId, includePending) {
  return (slide.questions || []).filter((q) => {
    if (q.mergedInto) return includePending;
    if (q.private && !includePending && q.authorId !== viewerId) return false;
    if (includePending) return true;
    return q.status === "approved" || q.status === "answered" || q.authorId === viewerId;
  });
}

function startQuiz(session, payload, announce) {
  const slide = findQuizSlide(session, payload.questionId || payload.slideId);
  if (!slide) return { error: "Keine Quiz-Folie" };
  const duration = clamp(Number(payload.duration) || slide.duration || 30, 5, 60);
  slide.duration = duration;
  slide.round = { startedAt: Date.now(), duration, status: "running", answers: {} };
  const key = `${session.code}:${slide.id}`;
  clearInterval(quizTimers.get(key));
  const tick = () => {
    const left = remainingSec(slide);
    announce(session.code, { type: "quiz_timer", payload: { remaining: left, slideId: slide.id } });
    if (left <= 0) endQuiz(session, slide, announce);
  };
  quizTimers.set(key, setInterval(tick, 1000));
  return { slideId: slide.id, duration, startedAt: slide.round.startedAt };
}

function submitAnswer(session, client, payload) {
  const slide = findQuizSlide(session, payload.questionId || payload.slideId);
  if (!slide || slide.round?.status !== "running") return { error: "Quiz nicht aktiv" };
  const optionCount = (slide.options || []).length;
  const indexes = normalizeAnswerIndexes(payload, optionCount);
  if (!indexes.length) return { error: "Ungültige Antwort" };
  if (slide.round.answers[client.id]) return { error: "Bereits geantwortet" };
  rememberTeam(session, client, payload.teamName);
  const left = remainingSec(slide);
  const rec = powerRecord(session, client.id);
  slide.round.answers[client.id] = {
    indexes,
    index: indexes[0],
    remaining: left,
    name: scoreName(session, client),
    team: session.teams?.[client.id] || "",
    double: Boolean(rec.doublePending),
  };
  if (rec.doublePending) {
    rec.doublePending = false;
    rec.doubleUsed = true;
  }
  return { ok: true };
}

function normalizeAnswerIndexes(payload, optionCount) {
  let arr = [];
  if (Array.isArray(payload.answerIndexes)) arr = payload.answerIndexes;
  else if (payload.answerIndex != null && payload.answerIndex !== "") arr = [payload.answerIndex];
  const uniq = [];
  for (const v of arr) {
    const i = Number(v);
    if (!Number.isInteger(i) || i < 0 || i >= optionCount) continue;
    if (!uniq.includes(i)) uniq.push(i);
  }
  return uniq;
}

function answersMatch(selected, correct) {
  if (!Array.isArray(selected) || !Array.isArray(correct)) return false;
  if (selected.length !== correct.length) return false;
  const a = [...selected].sort((x, y) => x - y);
  const b = [...correct].sort((x, y) => x - y);
  return a.every((v, i) => v === b[i]);
}

function endQuiz(session, slide, announce) {
  const key = `${session.code}:${slide.id}`;
  clearInterval(quizTimers.get(key));
  quizTimers.delete(key);
  if (!slide.round) return { error: "Keine Runde" };
  if (slide.round.status === "ended" && slide.round.lastResults) {
    announce(session.code, { type: "quiz_results", payload: slide.round.lastResults });
    return slide.round.lastResults;
  }
  slide.round.status = "ended";
  slide.round.answers = slide.round.answers || {};
  slide.scores = slide.scores || {};
  const total = slide.round.duration || 1;
  const correct = correctSet(slide);
  for (const [id, ans] of Object.entries(slide.round.answers)) {
    const picked = Array.isArray(ans.indexes) ? ans.indexes : [ans.index];
    const ok = answersMatch(picked, correct);
    let points = ok ? Math.round(500 + 500 * (ans.remaining / total)) : 0;
    if (ok && ans.double) points *= 2;
    const scoreId = ans.team || id;
    const prev = slide.scores[scoreId] || { name: ans.name, points: 0, team: ans.team || "" };
    prev.name = ans.name;
    prev.team = ans.team || prev.team || "";
    prev.lastDelta = points;
    prev.points += points;
    prev.lastCorrect = ok;
    slide.scores[scoreId] = prev;
    addOverall(session, scoreId, prev.name, points, prev.team);
  }
  const leaderboard = buildLeaderboard(slide);
  const overall = buildOverallLeaderboard(session);
  const payload = {
    slideId: slide.id,
    correctAnswer: correct[0],
    correctIndexes: correct,
    leaderboard,
    overall,
  };
  slide.round.lastResults = payload;
  announce(session.code, { type: "quiz_results", payload });
  announce(session.code, { type: "leaderboard_update", payload: { top10: leaderboard, overall } });
  return payload;
}

function addOverall(session, id, name, delta, team) {
  session.quizTotals = session.quizTotals || {};
  const prev = session.quizTotals[id] || { name, points: 0, team: team || "" };
  prev.name = name;
  prev.team = team || prev.team || "";
  prev.points += Number(delta) || 0;
  session.quizTotals[id] = prev;
}

function buildLeaderboard(slide) {
  const ranked = Object.entries(slide.scores || {})
    .map(([id, s]) => ({ id, name: s.name, points: s.points, lastDelta: s.lastDelta || 0, team: s.team || "" }))
    .sort((a, b) => b.points - a.points);
  return ranked.slice(0, 10).map((row, i) => ({ ...row, rank: i + 1 }));
}

function buildOverallLeaderboard(session) {
  const ranked = Object.entries(session.quizTotals || {})
    .map(([id, s]) => ({ id, name: s.name, points: s.points, team: s.team || "" }))
    .sort((a, b) => b.points - a.points);
  return ranked.slice(0, 10).map((row, i) => ({ ...row, rank: i + 1 }));
}

function correctSet(slide) {
  const n = (slide.options || []).length;
  if (Array.isArray(slide.correctIndexes) && slide.correctIndexes.length) {
    return normalizeCorrectIndexes({ correctIndexes: slide.correctIndexes }, n);
  }
  return normalizeCorrectIndexes({ correctIndex: slide.correctIndex }, n);
}

/**
 * Power-Ups: je einmal pro Session und Teilnehmer, serverseitig gegen Cheat.
 * fifty: blendet genau eine falsche Option aus (nur an diesen Client).
 * double: verdoppelt die nächste korrekte Antwort.
 */
function usePowerup(session, client, payload) {
  const kind = String(payload.kind || payload.powerup || "");
  const rec = powerRecord(session, client.id);
  const slide = findQuizSlide(session, payload.slideId || payload.questionId);
  if (kind === "double") {
    if (rec.doubleUsed || rec.doublePending) return { error: "Bereits genutzt" };
    rec.doublePending = true;
    rec.doubleUsed = true;
    return { ok: true, kind: "double" };
  }
  if (kind === "fifty") {
    if (rec.fiftyUsed) return { error: "Bereits genutzt" };
    if (!slide || slide.round?.status !== "running") return { error: "Quiz nicht aktiv" };
    const correct = correctSet(slide);
    const wrong = (slide.options || []).map((_, i) => i).filter((i) => !correct.includes(i));
    if (!wrong.length) return { error: "Keine falsche Option" };
    const hide = [wrong[crypto.randomInt(wrong.length)]];
    rec.fiftyUsed = true;
    rec.fiftyHidden = rec.fiftyHidden || {};
    rec.fiftyHidden[slide.id] = hide;
    return { ok: true, kind: "fifty", hide, slideId: slide.id };
  }
  return { error: "Unbekanntes Power-Up" };
}

function powerRecord(session, clientId) {
  session.powerups = session.powerups || {};
  if (!session.powerups[clientId]) {
    session.powerups[clientId] = { doubleUsed: false, fiftyUsed: false, doublePending: false, fiftyHidden: {} };
  }
  return session.powerups[clientId];
}

function rememberTeam(session, client, teamName) {
  const name = String(teamName || "").trim().slice(0, 40);
  if (!name) return;
  session.teams = session.teams || {};
  session.teams[client.id] = name;
}

function scoreName(session, client) {
  const team = session.teams?.[client.id];
  return team || displayName(client);
}

function publicQuestion(q, viewerId, opts = {}) {
  const out = {
    id: q.id,
    text: q.text,
    authorName: q.authorName,
    authorId: q.authorId,
    upvotes: q.upvotes,
    status: q.status,
    createdAt: q.createdAt,
    voted: Boolean(viewerId && (q.voters || []).includes(viewerId)),
    category: normalizeCategory(q.category),
    private: Boolean(q.private),
    groupId: q.groupId || null,
    mergedInto: q.mergedInto || null,
    presenterAnswer: q.presenterAnswer || "",
  };
  if (q.private && !opts.reveal && viewerId !== q.authorId) {
    return null;
  }
  return out;
}

function findQuestion(session, id) {
  for (const slide of session.slides) {
    const q = (slide.questions || []).find((item) => item.id === id);
    if (q) return q;
  }
  return null;
}

function remainingSec(slide) {
  const round = slide.round;
  if (!round) return 0;
  const elapsed = (Date.now() - round.startedAt) / 1000;
  return Math.max(0, Math.ceil(round.duration - elapsed));
}

function displayName(client) {
  return `Teilnehmer ${String(client.id).slice(0, 2).toUpperCase()}`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function publicQuizSlide(slide, reveal) {
  const answers = slide.round?.answers;
  const correct = correctSet(slide);
  const base = {
    id: slide.id,
    type: "quiz",
    question: slide.question,
    options: slide.options,
    duration: slide.duration || 30,
    voteCount: answers ? Object.keys(answers).length : 0,
    round: slide.round
      ? { status: slide.round.status, startedAt: slide.round.startedAt, duration: slide.round.duration }
      : { status: "idle" },
    scores: reveal ? buildLeaderboard(slide) : undefined,
    multiCorrect: correct.length > 1,
  };
  /* Lösungen und Gesamtrangliste nur Presenter oder nach Rundenende. */
  if (reveal || slide.round?.status === "ended") {
    base.correctIndex = correct[0];
    base.correctIndexes = correct;
  }
  return base;
}

function publicQaSlide(slide, includePending, viewerId) {
  return {
    id: slide.id,
    type: "qa",
    question: slide.question,
    moderated: slide.moderated !== false,
    questions: visibleQuestions(slide, includePending ? null : viewerId, includePending)
      .map((q) => publicQuestion(q, viewerId, { reveal: includePending }))
      .filter(Boolean),
    /* Timer-Snapshot für Join/Stage/Presenter — ohne interne Timeouts. */
    qaTimer: qaTimer.snapshot(slide.qaTimer),
  };
}

module.exports = {
  submitQuestion,
  upvoteQuestion,
  moderateQuestion,
  groupQuestions,
  listQuestions,
  startQuiz,
  submitAnswer,
  endQuiz,
  buildLeaderboard,
  buildOverallLeaderboard,
  usePowerup,
  answersMatch,
  correctSet,
  findQaSlide,
  findQuizSlide,
  publicQuizSlide,
  publicQaSlide,
  rememberTeam,
};
