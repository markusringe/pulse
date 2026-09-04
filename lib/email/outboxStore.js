/**
 * Persistente E-Mail-Outbox mit Idempotenz, Backoff und Dead-Letter.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const OUTBOX_PATH = path.join(DATA_DIR, "email-outbox.json");

const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 6 * 60 * 60 * 1000;

/** @typedef {'pending'|'processing'|'sent'|'dead'} OutboxStatus */

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadRaw() {
  ensureDir();
  if (!fs.existsSync(OUTBOX_PATH)) {
    return { version: 1, items: [] };
  }
  try {
    const data = JSON.parse(fs.readFileSync(OUTBOX_PATH, "utf8"));
    if (!Array.isArray(data.items)) return { version: 1, items: [] };
    return data;
  } catch {
    return { version: 1, items: [] };
  }
}

function saveRaw(data) {
  ensureDir();
  const tmp = `${OUTBOX_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, OUTBOX_PATH);
}

function newId() {
  return crypto.randomBytes(12).toString("hex");
}

/**
 * Exponential Backoff mit Jitter.
 * @param {number} attempt
 * @returns {number}
 */
function computeNextRetryAt(attempt) {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * exp * 0.2);
  return Date.now() + exp + jitter;
}

/**
 * @param {{ to: string, subject: string, html: string, text?: string, from: string, fromName?: string, idempotencyKey?: string, tags?: string[] }} payload
 * @returns {string} item id
 */
function enqueue(payload) {
  const data = loadRaw();
  const key = payload.idempotencyKey ? String(payload.idempotencyKey) : "";
  if (key) {
    const existing = data.items.find(
      (i) => i.idempotencyKey === key && (i.status === "pending" || i.status === "processing" || i.status === "sent")
    );
    if (existing) return existing.id;
  }
  const id = newId();
  data.items.push({
    id,
    idempotencyKey: key || null,
    payload,
    status: "pending",
    attempts: 0,
    lastError: null,
    providerMessageId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nextRetryAt: Date.now(),
  });
  /* Alte sent/dead Einträge begrenzen */
  const active = data.items.filter((i) => i.status === "pending" || i.status === "processing");
  const history = data.items
    .filter((i) => i.status === "sent" || i.status === "dead")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 200);
  data.items = [...active, ...history];
  saveRaw(data);
  return id;
}

/** @param {string} id */
function getById(id) {
  return loadRaw().items.find((i) => i.id === id) || null;
}

/** @returns {object[]} fällige pending */
function listDue(limit = 20) {
  const now = Date.now();
  return loadRaw()
    .items.filter((i) => i.status === "pending" && i.nextRetryAt <= now)
    .slice(0, limit);
}

/**
 * @param {string} id
 * @param {'processing'|'sent'|'pending'|'dead'} status
 * @param {object} patch
 */
function updateStatus(id, status, patch = {}) {
  const data = loadRaw();
  const item = data.items.find((i) => i.id === id);
  if (!item) return null;
  item.status = status;
  item.updatedAt = Date.now();
  Object.assign(item, patch);
  saveRaw(data);
  return item;
}

function markProcessing(id) {
  return updateStatus(id, "processing", { attempts: (getById(id)?.attempts || 0) + 1 });
}

function markSent(id, providerMessageId) {
  return updateStatus(id, "sent", { providerMessageId, lastError: null });
}

function markFailed(id, errorMessage) {
  const item = getById(id);
  if (!item) return null;
  const attempts = item.attempts || 1;
  if (attempts >= MAX_ATTEMPTS) {
    return updateStatus(id, "dead", { lastError: errorMessage });
  }
  return updateStatus(id, "pending", {
    lastError: errorMessage,
    nextRetryAt: computeNextRetryAt(attempts),
  });
}

function listForAdmin(limit = 50) {
  return loadRaw()
    .items.sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map((i) => ({
      id: i.id,
      to: i.payload?.to,
      subject: i.payload?.subject,
      status: i.status,
      attempts: i.attempts,
      lastError: i.lastError,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }));
}

module.exports = {
  enqueue,
  getById,
  listDue,
  markProcessing,
  markSent,
  markFailed,
  listForAdmin,
  MAX_ATTEMPTS,
};
