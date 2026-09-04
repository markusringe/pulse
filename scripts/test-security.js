#!/usr/bin/env node
/**
 * Sicherheits-Smoke-Tests: Wortfilter, Rate-Limit, Notfall, Passwort, DDoS-Cap.
 */
const wordFilter = require("../lib/wordFilter");
const rate = require("../lib/rateLimiter");
const spam = require("../lib/spamDetector");
const { hashPassword, verifyPassword } = require("../lib/auth");
const { inspect } = spam;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(wordFilter.moderateQuestion("Das ist ein Arschloch").status === "blocked", "Schimpfwort blockiert");
assert(wordFilter.moderateQuestion("Wie läuft die Schulung?").status === "approved", "normale Frage ok");

const id = "tester";
assert(rate.checkRateLimit(id, "question").allowed, "erste Frage erlaubt");
rate.record(id, "question");
assert(!rate.checkRateLimit(id, "question").allowed, "zweite Frage in 10s blockiert");

assert(inspect("HTTP://SPAM.example").suspicious, "URL verdächtig");
assert(inspect("WAS IST DAS NUR ALLES HIER").suspicious, "Caps verdächtig");

const stored = hashPassword("geheim");
assert(verifyPassword("geheim", stored), "Passwort ok");
assert(!verifyPassword("falsch", stored), "Passwort falsch");

/* IP-Sperre ist standardmäßig aus (IP_BLOCK=0 in Docker) — für Cap-Test explizit aktivieren. */
rate.setIpBlockEnabled(true);
const fake = {};
for (let i = 0; i < 100; i++) assert(rate.addSocket("ip1", { i }), "ws " + i);
assert(!rate.addSocket("ip1", fake), "101. Verbindung abgelehnt");
assert(rate.isBlocked("ip1"), "IP nach Cap 24h gesperrt");
assert(!rate.checkHttp("ip1"), "HTTP von gesperrter IP blockiert");

rate.setIpBlockEnabled(false);
assert(!rate.isIpBlockEnabled(), "IP-Sperre abgeschaltet");
assert(!rate.isBlocked("ip1"), "bestehende Sperre nach Deaktivieren aufgehoben");
assert(rate.checkHttp("ip1"), "HTTP nach Deaktivieren wieder erlaubt");
for (let i = 0; i < 101; i++) assert(rate.addSocket("ip-off", { i }), "ws ohne Sperre " + i);
assert(!rate.isBlocked("ip-off"), "kein 24h-Ban wenn IP-Sperre aus");
rate.blockIp("ip-off");
assert(!rate.isBlocked("ip-off"), "blockIp ist No-Op wenn deaktiviert");
rate.setIpBlockEnabled(true);
assert(rate.isIpBlockEnabled(), "IP-Sperre wieder an");

console.log("Sicherheitstests OK");
