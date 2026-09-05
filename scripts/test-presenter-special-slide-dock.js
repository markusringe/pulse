#!/usr/bin/env node
/**
 * Architektur-Test: Sonderfolien-Steuerung nur im Presenter-Dock, Stage ohne Buttons.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg);
    process.exit(1);
  }
}

const indexHtml = read("frontend/index.html");
const stageJs = read("frontend/js/stage.js");
const presenterJs = read("frontend/js/presenterSpecialSlideButtons.js");
const deckJs = read("frontend/js/deck.js");
const appJs = read("frontend/js/app.js");
const coreJs = read("frontend/js/specialSlideNavCore.js");
const serverJs = read("server.js");

/* Presenter-Dock vorhanden */
assert(indexHtml.includes('id="present-special-slide-nav"'), "Presenter-Dock-Host fehlt");
assert(presenterJs.includes("syncPresenterSpecialSlideButtons"), "Presenter-Sync fehlt");
assert(deckJs.includes("deck-chip-special"), "Sonderfolien-Chips in Folienleiste fehlen");
assert(deckJs.includes("onGotoSpecial"), "onGotoSpecial-Handler in deck.js fehlt");
assert(appJs.includes("gotoSpecialSlide"), "gotoSpecialSlide in app.js fehlt");
assert(presenterJs.includes("data-pss-kind"), "Sonderfolien-Buttons im Presenter fehlen");
assert(coreJs.includes("confirmSpecialSlideEnd"), "End-Bestätigungsdialog fehlt");
assert(coreJs.includes("updateSpecialSlideButtons"), "Button-Zustands-Sync fehlt");

/* Stage: keine Steuer-UI */
assert(!indexHtml.includes("stage-special-slide-nav"), "Stage darf keinen Nav-Host haben");
assert(!fs.existsSync(path.join(root, "frontend/js/stageSpecialSlideNav.js")), "stageSpecialSlideNav.js muss entfernt sein");
assert(!stageJs.includes("stageSpecialSlideNav"), "stage.js darf Stage-Nav nicht importieren");
assert(!stageJs.includes("event_countdown"), "stage.js darf keine Sonderfolien senden");
assert(stageJs.includes('role: "stage"'), "Stage join mit Rolle stage");

/* Server: nur Presenter */
assert(serverJs.includes('if (client.role !== "presenter") return { error: "forbidden" }'), "Presenter-only in applyEventCountdownControl");
assert(!serverJs.includes("stageCanControl"), "stageCanControl darf nicht existieren");

console.log("OK test-presenter-special-slide-dock");
