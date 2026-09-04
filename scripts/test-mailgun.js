#!/usr/bin/env node
/**
 * Tests für Mailgun-Integration: Outbox, Webhook-Signatur, Suppression, Sanitize.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const tmpDir = path.join(os.tmpdir(), `pulse-mailgun-test-${process.pid}`);
fs.mkdirSync(tmpDir, { recursive: true });
process.env.SQLITE_PATH = path.join(tmpDir, "pulse.db");
process.env.NODE_ENV = "test";
delete process.env.MAILGUN_API_KEY;
delete process.env.MAILGUN_DOMAIN;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const outboxStore = require("../lib/email/outboxStore");
const suppressionStore = require("../lib/email/suppressionStore");
const { verifySignature } = require("../lib/email/mailgunWebhook");
const { normalizeEmail, assertFromDomainAllowed, assertSafeHeaderValue } = require("../lib/email/emailSanitize");
const emailConfigStore = require("../lib/emailConfigStore");
const emailService = require("../lib/emailService");

/* Idempotenz */
const payload = {
  to: "user@test.local",
  subject: "Test",
  html: "<p>Hi</p>",
  from: "noreply@test.local",
  idempotencyKey: "pin:user@test.local:111111",
};
const id1 = outboxStore.enqueue(payload);
const id2 = outboxStore.enqueue(payload);
assert(id1 === id2, "Idempotenz: gleicher Schlüssel → gleiche ID");

/* Suppression */
assert(!suppressionStore.isSuppressed("bounce@test.local"), "initial nicht unterdrückt");
suppressionStore.suppress("bounce@test.local", "bounce", { code: 550 });
assert(suppressionStore.isSuppressed("bounce@test.local"), "nach Bounce unterdrückt");

/* Header-Injection */
let threw = false;
try {
  assertSafeHeaderValue("foo\r\nBcc: evil@test.local", "Subject");
} catch {
  threw = true;
}
assert(threw, "CRLF in Header abgelehnt");

/* Freemail-Absender */
threw = false;
try {
  assertFromDomainAllowed("noreply@gmail.com", "mg.test.local");
} catch {
  threw = true;
}
assert(threw, "Freemail als From abgelehnt");

assertFromDomainAllowed("noreply@mg.test.local", "mg.test.local");

/* Webhook HMAC */
process.env.MAILGUN_WEBHOOK_SIGNING_KEY = "test-signing-key";
const ts = String(Math.floor(Date.now() / 1000));
const token = crypto.randomBytes(8).toString("hex");
const sig = crypto.createHmac("sha256", process.env.MAILGUN_WEBHOOK_SIGNING_KEY).update(ts + token).digest("hex");
assert(verifySignature({ timestamp: ts, token, signature: sig }), "gültige Signatur");
assert(!verifySignature({ timestamp: ts, token, signature: "deadbeef" }), "ungültige Signatur");

/* Mailgun Provider + Capture in Dev */
emailConfigStore.save({
  provider: "mailgun",
  from: "noreply@mg.test.local",
  confirmedAdminEmail: "admin@test.local",
});
emailService.reloadConfig();
assert(emailService.canSendPin(), "Dev: Mailgun ohne Env → Capture erlaubt");

(async () => {
  const result = await emailService.sendPinEmail({
    to: "user@test.local",
    pin: "654321",
    lang: "de",
    appName: "Test",
  });
  assert(result.ok, "Dev-Capture Versand ok");
  assert(result.mode === "dev" || result.mode === "mailgun", "Modus dev oder mailgun");
  console.log("test-mailgun: OK");
  fs.rmSync(tmpDir, { recursive: true, force: true });
})().catch((err) => {
  console.error("test-mailgun: FAIL", err.message);
  process.exit(1);
});
