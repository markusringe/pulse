/**
 * Mailgun-Webhook: HMAC-Signatur, Replay-Schutz, Bounce/Complaint → Suppression.
 */

const crypto = require("crypto");
const suppressionStore = require("./suppressionStore");
const { getMailgunEnv } = require("./mailgunEnv");

/** @type {Map<string, number>} token → timestamp */
const seenTokens = new Map();
const REPLAY_TTL_MS = 15 * 60 * 1000;

function purgeSeenTokens() {
  const now = Date.now();
  for (const [token, ts] of seenTokens) {
    if (now - ts > REPLAY_TTL_MS) seenTokens.delete(token);
  }
}

/**
 * Mailgun-Signatur prüfen (timestamp + token + signature).
 * @param {{ timestamp?: string, token?: string, signature?: string }} sig
 */
function verifySignature(sig) {
  const key = getMailgunEnv().webhookSigningKey;
  if (!key) {
    if (process.env.NODE_ENV === "production") return false;
    return true; /* Dev ohne Key */
  }
  const timestamp = String(sig.timestamp || "");
  const token = String(sig.token || "");
  const signature = String(sig.signature || "");
  if (!timestamp || !token || !signature) return false;

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return false;
  const ageSec = Math.abs(Date.now() / 1000 - tsNum);
  if (ageSec > 900) return false; /* 15 Min */

  purgeSeenTokens();
  if (seenTokens.has(token)) return false;
  seenTokens.set(token, Date.now());

  const hmac = crypto.createHmac("sha256", key);
  hmac.update(timestamp + token);
  const expected = hmac.digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"));
  } catch {
    return false;
  }
}

/**
 * Event-Body aus Mailgun-Webhook (JSON oder form-urlencoded).
 * @param {object} body
 */
function extractRecipient(body) {
  const eventData = body["event-data"] || body.event_data || body;
  const recipient =
    eventData.recipient ||
    body.recipient ||
    (eventData.message && eventData.message.headers && eventData.message.headers.to) ||
    "";
  return String(recipient).trim().toLowerCase();
}

function eventType(body) {
  const eventData = body["event-data"] || body.event_data || body;
  return String(eventData.event || body.event || "").toLowerCase();
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {Function} readJson
 * @param {Function} send
 * @returns {Promise<boolean>}
 */
async function handleMailgunWebhook(req, res, readJson, send) {
  if (req.method !== "POST") {
    send(res, 405, { error: "Method not allowed" });
    return true;
  }
  let body;
  try {
    body = await readJson(req);
  } catch {
    send(res, 400, { error: "Ungültiger Body" });
    return true;
  }

  const sig = body.signature || {
    timestamp: body.timestamp,
    token: body.token,
    signature: body.signature,
  };
  if (!verifySignature(sig)) {
    send(res, 403, { error: "Signatur ungültig" });
    return true;
  }

  const type = eventType(body);
  const recipient = extractRecipient(body);
  if (!recipient) {
    send(res, 200, { ok: true, ignored: true });
    return true;
  }

  if (type === "failed" || type === "bounced" || type === "bounce") {
    suppressionStore.suppress(recipient, "bounce", { event: type });
  } else if (type === "complained" || type === "complaint") {
    suppressionStore.suppress(recipient, "complaint", { event: type });
  }

  send(res, 200, { ok: true, event: type, suppressed: suppressionStore.isSuppressed(recipient) });
  return true;
}

module.exports = { handleMailgunWebhook, verifySignature };
