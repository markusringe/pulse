#!/usr/bin/env node
/**
 * Migration: Event-sets[] zu sessionCode. Folien gehören danach in pulse.db.
 * Beim Serverstart läuft dieselbe Logik in server.js (Sessions werden dort angelegt).
 * Dieses Script bereinigt nur data/events.json — nützlich für Tests ohne HTTP.
 */
const events = require("../lib/events");

const result = events.migrateLegacy();
const n = result.pending.length;
console.log(
  result.changed
    ? `ok events-migrate: ${n} Event(s) von Sets auf sessionCode umgestellt`
    : "ok events-migrate: nichts zu tun"
);
