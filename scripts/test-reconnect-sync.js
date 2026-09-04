#!/usr/bin/env node
/**
 * Reconnect-Sync: gültiger activeSlideIndex nach Deck-Änderungen.
 */
const { clampActiveSlideIndex, normalizeSessionSlides } = require("../lib/sessionSync");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(clampActiveSlideIndex(null) === 0, "leer → 0");
assert(clampActiveSlideIndex({ slides: [] }) === 0, "keine Folien → 0");
assert(clampActiveSlideIndex({ slides: [{ id: "a" }], activeSlideIndex: 5 }) === 0, "über max → letzte");
assert(clampActiveSlideIndex({ slides: [{ id: "a" }, { id: "b" }], activeSlideIndex: -3 }) === 0, "unter min → 0");
assert(clampActiveSlideIndex({ slides: [{ id: "a" }, { id: "b" }], activeSlideIndex: 1 }) === 1, "gültig bleibt");

const session = { slides: [{ id: "a" }, { id: "b" }, { id: "c" }], activeSlideIndex: 99 };
normalizeSessionSlides(session);
assert(session.activeSlideIndex === 2, "normalizeSessionSlides korrigiert in-place");

console.log("Reconnect-Sync-Tests OK");
