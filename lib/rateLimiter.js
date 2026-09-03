/**
 * Rate-Limits je Teilnehmer und je IP.
 * IPs liegen nur kurz im Speicher und werden nach dem Fenster verworfen (kein Persist).
 * Die 24h-IP-Sperre lässt sich per setIpBlockEnabled / Umgebungsvariable IP_BLOCK abschalten.
 */

const QUESTION_MS = 30_000;
const UPVOTE_WINDOW_MS = 60_000;
const MAX_UPVOTES = 3;
const MAX_HTTP_PER_MIN = 1000;
const MAX_WS_PER_IP = 100;
const BLACKLIST_MS = 24 * 60 * 60 * 1000;

/** Steuert die 24h-Sperre nach zu vielen WebSocket-Verbindungen derselben IP. */
let ipBlockEnabled = true;

/** @type {Map<string, number>} Hash → Sperrende */
const blacklist = new Map();

/** @type {Map<string, { lastQuestion: number, upvotes: number[], reactions: number[] }>} */
const users = new Map();
/** @type {Map<string, number[]>} */
const httpHits = new Map();
/** @type {Map<string, Set<any>>} */
const ipSockets = new Map();

function prune(list, now, windowMs) {
  return list.filter((t) => now - t < windowMs);
}

/**
 * @param {string} sessionId  Teilnehmer-ID, nicht der Raumcode
 * @param {'question'|'upvote'} type
 */
function checkRateLimit(sessionId, type, opts = {}) {
  const now = Date.now();
  const questionMs = opts.questionMs || QUESTION_MS;
  const user = users.get(sessionId) || { lastQuestion: 0, upvotes: [], reactions: [] };
  user.upvotes = prune(user.upvotes, now, UPVOTE_WINDOW_MS);
  user.reactions = prune(user.reactions || [], now, 10_000);

  if (type === "question" && now - user.lastQuestion < questionMs) {
    return { allowed: false, waitTime: questionMs - (now - user.lastQuestion) };
  }
  if (type === "upvote") {
    if (user.upvotes.length >= MAX_UPVOTES) {
      return { allowed: false, waitTime: UPVOTE_WINDOW_MS - (now - user.upvotes[0]) };
    }
  }
  if (type === "reaction") {
    if (user.reactions.length >= 8) {
      return { allowed: false, waitTime: 10_000 - (now - user.reactions[0]) };
    }
  }
  return { allowed: true };
}

function record(sessionId, type) {
  const now = Date.now();
  const user = users.get(sessionId) || { lastQuestion: 0, upvotes: [], reactions: [] };
  if (type === "question") user.lastQuestion = now;
  if (type === "upvote") user.upvotes.push(now);
  if (type === "reaction") user.reactions.push(now);
  users.set(sessionId, user);
}

/**
 * Schaltet die 24h-IP-Sperre ein oder aus.
 * Beim Abschalten werden laufende Sperren sofort aufgehoben.
 * @param {boolean} on
 */
function setIpBlockEnabled(on) {
  ipBlockEnabled = Boolean(on);
  if (!ipBlockEnabled) blacklist.clear();
}

function isIpBlockEnabled() {
  return ipBlockEnabled;
}

function isBlocked(ipKey) {
  if (!ipBlockEnabled) return false;
  const until = blacklist.get(ipKey);
  if (!until) return false;
  if (Date.now() > until) {
    blacklist.delete(ipKey);
    return false;
  }
  return true;
}

function blockIp(ipKey, ms = BLACKLIST_MS) {
  if (!ipBlockEnabled) return;
  blacklist.set(ipKey, Date.now() + ms);
}

function checkHttp(ipKey) {
  if (isBlocked(ipKey)) return false;
  const now = Date.now();
  const hits = prune(httpHits.get(ipKey) || [], now, 60_000);
  if (hits.length >= MAX_HTTP_PER_MIN) return false;
  hits.push(now);
  httpHits.set(ipKey, hits);
  return true;
}

function addSocket(ipKey, ws) {
  if (isBlocked(ipKey)) return false;
  const set = ipSockets.get(ipKey) || new Set();
  /* Ohne IP-Sperre: Verbindungen zählen, aber weder Cap noch 24h-Ban. */
  if (ipBlockEnabled && set.size >= MAX_WS_PER_IP) {
    blockIp(ipKey);
    return false;
  }
  set.add(ws);
  ipSockets.set(ipKey, set);
  return true;
}

function removeSocket(ipKey, ws) {
  const set = ipSockets.get(ipKey);
  if (!set) return;
  set.delete(ws);
  if (!set.size) ipSockets.delete(ipKey);
}

function socketCount(ipKey) {
  return ipSockets.get(ipKey)?.size || 0;
}

module.exports = {
  checkRateLimit,
  record,
  checkHttp,
  addSocket,
  removeSocket,
  socketCount,
  isBlocked,
  blockIp,
  setIpBlockEnabled,
  isIpBlockEnabled,
  MAX_WS_PER_IP,
  QUESTION_MS,
  BLACKLIST_MS,
};
