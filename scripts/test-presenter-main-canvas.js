#!/usr/bin/env node
/**
 * Architektur-Test: Sonderfolien live in der Presenter-Hauptbox (#present-slide-canvas).
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

const canvasJs = read("frontend/js/presenterMainCanvas.js");
const renderJs = read("frontend/js/specialSlides/renderSpecialSlide.js");
const appJs = read("frontend/js/app.js");
const indexHtml = read("frontend/index.html");
const countdownCss = read("frontend/css/event-countdown.css");

assert(canvasJs.includes("resolvePresenterSpecialKind"), "resolvePresenterSpecialKind fehlt");
const resolveBlock = canvasJs.match(/export function resolvePresenterSpecialKind[\s\S]*?\n}/)?.[0] || "";
assert(resolveBlock && !resolveBlock.includes("shouldShowCountdown"), "kein Auto-Countdown in Hauptbox");
assert(!canvasJs.includes("shouldShowCountdown"), "shouldShowCountdown nicht importieren");
assert(canvasJs.includes("syncPresenterMainCanvas"), "syncPresenterMainCanvas fehlt");
assert(canvasJs.includes("renderSpecialSlideInto"), "gemeinsamer Renderer");
assert(canvasJs.includes("destroyPresenterMainCanvas"), "Teardown Hauptbox");
assert(renderJs.includes("mountSpecialSlide"), "renderSpecialSlide re-export");
assert(appJs.includes("syncPresenterMainCanvas"), "app.js bindet Hauptbox");
assert(appJs.includes("destroyPresenterMainCanvas"), "app.js Teardown Hauptbox");
assert(!appJs.includes("presenterSpecialPreview"), "Overlay-Vorschau entfernt");
assert(indexHtml.includes('id="present-slide-canvas"'), "Hauptbox-Host in index.html");
assert(indexHtml.indexOf('class="present-dock') < indexHtml.indexOf('id="presenter-stats"'), "Dock vor Statistik im DOM");
assert(indexHtml.includes('data-present-canvas-fit'), "Skalier-Container in index.html");
assert(!indexHtml.includes("presenter-special-preview.css"), "Preview-CSS nicht mehr eingebunden");
assert(!fs.existsSync(path.join(root, "frontend/js/presenterSpecialPreview.js")), "presenterSpecialPreview.js gelöscht");
assert(countdownCss.includes(".present-slide-canvas-fit"), "CSS-Skalierung für Hauptbox");

console.log("OK test-presenter-main-canvas");
