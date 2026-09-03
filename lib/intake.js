/**
 * Q&A-Eingang: Rate-Limit, Wortfilter, Spam-Heuristik, Emoji-Limit.
 */

const wordFilter = require("./wordFilter");
const rate = require("./rateLimiter");
const spam = require("./spamDetector");
const interactive = require("./interactive");
const qaTimer = require("./qaTimer");

function recentTexts(session) {
  const out = [];
  for (const slide of session.slides || []) {
    for (const q of slide.questions || []) {
      if (q.authorId) out.push(String(q.text || "").toLowerCase().replace(/\s+/g, " ").trim());
    }
  }
  return out;
}

function intakeQuestion(session, client, payload, branding = {}) {
  const slide = interactive.findQaSlide(session, payload.slideId);
  if (slide && !qaTimer.canSubmit(slide.qaTimer)) {
    return { error: "qa_closed" };
  }
  const interval = (Number(branding.questionIntervalSec) || 30) * 1000;
  const limit = rate.checkRateLimit(client.id, "question", { questionMs: interval });
  if (!limit.allowed) {
    return { error: "rate", waitTime: Math.ceil(limit.waitTime / 1000) };
  }
  if (spam.countEmojis(payload.text) > 5) {
    return { error: "emoji-limit" };
  }
  if (branding.wordFilter !== false) {
    const filtered = wordFilter.moderateQuestion(payload.text, branding.extraWords || []);
    if (filtered.status === "blocked") return { error: "blocked" };
  }
  const hint = spam.inspect(payload.text, { recentTexts: recentTexts(session) });
  const out = interactive.submitQuestion(session, client, {
    ...payload,
    category: payload.category,
    private: payload.private === true,
  });
  if (out.question && hint.suspicious) {
    out.question.flagged = true;
    const slide = interactive.findQaSlide(session, payload.slideId);
    const stored = slide?.questions?.find((q) => q.id === out.question.id);
    if (stored) stored.flagged = true;
    out.pendingReview = true;
  }
  rate.record(client.id, "question");
  return out;
}

function intakeUpvote(session, client, questionId) {
  const limit = rate.checkRateLimit(client.id, "upvote");
  if (!limit.allowed) return { error: "rate", waitTime: Math.ceil(limit.waitTime / 1000) };
  const out = interactive.upvoteQuestion(session, client, questionId);
  if (out.question && !out.error) rate.record(client.id, "upvote");
  return out;
}

function activateEmergency(session) {
  session.paused = true;
  session.emergencyBackup = session.emergencyBackup || {};
  for (const slide of session.slides) {
    if (slide.type === "qa") {
      for (const q of slide.questions || []) {
        session.emergencyBackup[q.id] = q.status;
        q.status = "hidden";
      }
    }
  }
}

function resumeEmergency(session) {
  session.paused = false;
  const backup = session.emergencyBackup || {};
  for (const slide of session.slides) {
    if (slide.type === "qa") {
      for (const q of slide.questions || []) {
        if (backup[q.id]) q.status = backup[q.id];
      }
    }
  }
  session.emergencyBackup = {};
}

function toCsv(session, kind = "all") {
  const lines = kind === "qa" ? ["code,id,text,upvotes,status,category,private,user"] : ["type,id,text,value,user"];
  const pseudo = (id) => `User_${String(id || "anon").slice(0, 4)}`;
  for (const slide of session.slides || []) {
    if (slide.type === "qa") {
      for (const q of slide.questions || []) {
        if (kind === "qa") {
          lines.push(
            [session.code, q.id, `"${String(q.text).replace(/"/g, '""')}"`, q.upvotes || 0, q.status || "", q.category || "", q.private ? "privat" : "", pseudo(q.authorId)].join(",")
          );
        } else {
          lines.push(`question,${q.id},"${String(q.text).replace(/"/g, '""')}",${q.upvotes},${pseudo(q.authorId)}`);
        }
      }
    }
    if (kind !== "qa" && slide.counts) {
      for (const [id, n] of Object.entries(slide.counts)) {
        lines.push(`vote,${slide.id},${id},${n},`);
      }
    }
  }
  return lines.join("\n");
}

module.exports = { intakeQuestion, intakeUpvote, activateEmergency, resumeEmergency, toCsv };
