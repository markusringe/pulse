#!/usr/bin/env node
/**
 * Architektur-Test: Presenter-Sonderfolien-Vorschau.
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

const previewJs = read("frontend/js/presenterSpecialPreview.js");
const renderJs = read("frontend/js/specialSlides/renderSpecialSlide.js");
const appJs = read("frontend/js/app.js");
const indexHtml = read("frontend/index.html");
const de = read("frontend/i18n/de.json");

assert(previewJs.includes("bindPresenterSpecialPreviews"), "bindPresenterSpecialPreviews fehlt");
assert(previewJs.includes('ev.key !== "Escape"'), "Escape schließt Vorschau");
assert(previewJs.includes("renderSpecialSlideInto"), "gemeinsamer Renderer");
assert(previewJs.includes("onShowOnStage"), "CTA Auf Stage anzeigen");
assert(previewJs.includes("pointer: coarse"), "Touch-Stichprobe");
assert(renderJs.includes("mountSpecialSlide"), "renderSpecialSlide re-export");
assert(appJs.includes("syncPresenterSpecialPreviews"), "app.js bindet Vorschau");
assert(appJs.includes("destroyPresenterSpecialPreview"), "Teardown Vorschau");
assert(indexHtml.includes("presenter-special-preview.css"), "Preview-CSS eingebunden");
assert(de.includes("programControl.previewShowOnStage"), "i18n Vorschau-CTA");

console.log("OK test-presenter-special-preview");
