#!/usr/bin/env node
/**
 * Tests für E-Mail-Konfigurationsspeicher.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const tmpDir = path.join(os.tmpdir(), `pulse-email-test-${process.pid}`);
fs.mkdirSync(tmpDir, { recursive: true });
process.env.SQLITE_PATH = path.join(tmpDir, "pulse.db");

const emailConfigStore = require("../lib/emailConfigStore");
const emailService = require("../lib/emailService");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

emailConfigStore.save({
  provider: "smtp",
  smtpHost: "smtp.test.local",
  smtpPort: 587,
  smtpUser: "user",
  smtpPass: "secret",
  from: "noreply@test.local",
});

const pub = emailConfigStore.publicConfig(emailConfigStore.load());
assert(pub.provider === "smtp", "Provider gespeichert");
assert(pub.smtpPassSet === true, "Passwort-Flag gesetzt");
assert(!pub.smtpPass, "Passwort nicht in publicConfig");

emailService.reloadConfig();
const health = emailService.healthInfo();
assert(health.provider === "smtp", "emailService lädt Datei-Konfiguration");
assert(emailService.canSendPin(), "SMTP als konfiguriert erkannt");

emailConfigStore.save({ provider: "none", smtpPass: "" });
emailService.reloadConfig();
assert(!emailService.canSendPin(), "none deaktiviert PIN-Versand");

console.log("test-email-config: OK");
fs.rmSync(tmpDir, { recursive: true, force: true });
