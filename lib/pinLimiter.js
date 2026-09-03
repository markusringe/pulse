/**
 * Rate-Limits für PIN-Anforderung und PIN-Prüfung (E-Mail + IP).
 * Speicherung nur im Arbeitsspeicher — bei Neustart zurückgesetzt.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PIN_ATTEMPTS = 5;
const MAX_PIN_SENDS = 3;

/** @type {Map<string, number[]>} */
const sendBuckets = new Map();
/** @type {Map<string, number[]>} */
const attemptBuckets = new Map();

function bucketKey(kind, email, ipHash) {
  return `${kind}:${String(email || "").toLowerCase()}:${ipHash || "noip"}`;
}

function prune(arr, now) {
  const cutoff = now - WINDOW_MS;
  while (arr.length && arr[0] < cutoff) arr.shift();
}

function checkLimit(map, key, max) {
  const now = Date.now();
  let arr = map.get(key);
  if (!arr) {
    arr = [];
    map.set(key, arr);
  }
  prune(arr, now);
  if (arr.length >= max) {
    const retryAfterMs = arr[0] + WINDOW_MS - now;
    return { ok: false, retryAfterMs: Math.max(1000, retryAfterMs) };
  }
  arr.push(now);
  return { ok: true, retryAfterMs: 0 };
}

function checkPinSend(email, ipHash) {
  const emailKey = bucketKey("send", email, "");
  const ipKey = bucketKey("send-ip", "", ipHash);
  const a = checkLimit(sendBuckets, emailKey, MAX_PIN_SENDS);
  if (!a.ok) return a;
  return checkLimit(sendBuckets, ipKey, MAX_PIN_SENDS * 2);
}

function checkPinAttempt(email, ipHash) {
  const emailKey = bucketKey("attempt", email, "");
  const ipKey = bucketKey("attempt-ip", "", ipHash);
  const a = checkLimit(attemptBuckets, emailKey, MAX_PIN_ATTEMPTS);
  if (!a.ok) return a;
  return checkLimit(attemptBuckets, ipKey, MAX_PIN_ATTEMPTS * 2);
}

function metrics() {
  return {
    pinSendBuckets: sendBuckets.size,
    pinAttemptBuckets: attemptBuckets.size,
  };
}

module.exports = { checkPinSend, checkPinAttempt, metrics, MAX_PIN_ATTEMPTS, MAX_PIN_SENDS, WINDOW_MS };
