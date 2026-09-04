#!/usr/bin/env node
/**
 * Regressionstests für Content-Hash-Asset-Manifest (Phase 5 / C-010).
 */
const fs = require("fs");
const path = require("path");
const {
  buildManifest,
  hashFile,
  injectHtmlAssetHashes,
  rewriteJsImports,
  resolveWebPath,
  withContentHash,
} = require("../lib/assetManifest");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const root = path.join(__dirname, "..");
const frontend = path.join(root, "frontend");

console.log("test-asset-manifest: Manifest berechnen…");
const manifest = buildManifest(frontend);
const assets = manifest.assets;

assert(Object.keys(assets).length >= 50, "Mindestens 50 Assets im Manifest");
assert(assets["/js/app.js"], "/js/app.js im Manifest");
assert(assets["/css/pulse.css"], "/css/pulse.css im Manifest");
assert(assets["/i18n/de.json"], "/i18n/de.json im Manifest");
assert(assets["/help/articles.json"], "/help/articles.json im Manifest");

const appHash = hashFile(path.join(frontend, "js/app.js"));
assert(assets["/js/app.js"] === appHash, "app.js-Hash stimmt mit Datei überein");

console.log("test-asset-manifest: Pfadauflösung…");
assert(
  resolveWebPath("/js/app.js", "./websocket.js") === "/js/websocket.js",
  "Relativer JS-Import",
);
assert(
  resolveWebPath("/js/app.js", "/css/pulse.css") === "/css/pulse.css",
  "Absoluter CSS-Pfad",
);

console.log("test-asset-manifest: Hash-Anreicherung…");
const wsHash = assets["/js/websocket.js"];
const enriched = withContentHash("./websocket.js", "/js/app.js", assets);
assert(enriched === `./websocket.js?h=${wsHash}`, "Import mit ?h=");

console.log("test-asset-manifest: HTML-Injektion…");
const indexRaw = fs.readFileSync(path.join(frontend, "index.html"));
const indexOut = injectHtmlAssetHashes(indexRaw, assets).toString("utf8");
assert(indexOut.includes("pulse-asset-manifest"), "Manifest-Script in HTML");
assert(indexOut.includes("__PULSE_ASSET_H__"), "window.__PULSE_ASSET_H__ gesetzt");
assert(
  indexOut.includes(`/js/app.js?h=${assets["/js/app.js"]}`),
  "app.js-Link mit Content-Hash",
);
assert(!indexOut.includes("?v=nav"), "Kein manuelles ?v=nav in ausgeliefertem HTML");

console.log("test-asset-manifest: JS-Rewrite…");
const appSrc = fs.readFileSync(path.join(frontend, "js/app.js"), "utf8");
const appOut = rewriteJsImports(appSrc, "/js/app.js", assets);
assert(appOut.includes(`?h=${wsHash}`), "app.js-Imports mit Hash");

console.log("test-asset-manifest: OK");
