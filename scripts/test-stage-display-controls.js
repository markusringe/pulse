#!/usr/bin/env node
/**
 * Architektur-Test: Stage-Vollbild-Overlay (stageDisplayControls.js).
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
const controlsJs = read("frontend/js/stageDisplayControls.js");
const stageCss = read("frontend/css/stage.css");

assert(!indexHtml.includes('id="stage-fs"'), "statischer stage-fs in index.html entfernen");
assert(stageJs.includes("mountStageDisplayControls"), "stage.js muss mountStageDisplayControls nutzen");
assert(stageJs.includes("destroyStageDisplayControls"), "stage.js muss destroyStageDisplayControls nutzen");
assert(!stageJs.includes("function bindFullscreen"), "bindFullscreen entfernt");
assert(controlsJs.includes("HIDE_MS = 3000"), "Auto-Hide 3s");
assert(controlsJs.includes("isInHotCorner"), "Hot Corner");
assert(controlsJs.includes("firstTouchDone"), "Erster Touch");
assert(controlsJs.includes("if (opts.share) return"), "share=1 Guard");
assert(controlsJs.includes('id="stage-fs"'), "dynamischer stage-fs Button");
assert(stageCss.includes(".stage-display-controls"), "Overlay-CSS");
assert(stageCss.includes('[data-stage-mode="share"]'), "share-Modus CSS");

console.log("OK test-stage-display-controls");
