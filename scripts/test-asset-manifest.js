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
  isRewritableLocalAssetRef,
  validateManifestReferences,
  loadManifestStrict,
  verifyManifestMatchesDisk,
} = require("../lib/assetManifest");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const root = path.join(__dirname, "..");
const frontend = path.join(root, "frontend");

console.log("test-asset-manifest: Manifest berechnen…");
const manifest = buildManifest(frontend);
const assets = manifest.assets;

assert(Object.keys(assets).length >= 80, "Mindestens 80 Assets im Manifest");
assert(assets["/js/app.js"], "/js/app.js im Manifest");
assert(assets["/css/pulse.css"], "/css/pulse.css im Manifest");
assert(assets["/i18n/de.json"], "/i18n/de.json im Manifest");
assert(assets["/help/articles.json"], "/help/articles.json im Manifest");
assert(assets["/help/welcome.html"], "/help/welcome.html im Manifest");
assert(assets["/assets/favicon.svg"], "/assets/favicon.svg im Manifest");

const appHash = hashFile(path.join(frontend, "js/app.js"));
assert(assets["/js/app.js"] === appHash, "app.js-Hash stimmt mit Datei überein");

console.log("test-asset-manifest: Referenz-Validierung…");
const refErrors = validateManifestReferences(frontend, assets);
assert(refErrors.length === 0, `Referenz-Fehler: ${refErrors.join("; ")}`);

console.log("test-asset-manifest: Sichere Pfad-Filter…");
assert(!isRewritableLocalAssetRef("https://cdn.example.com/x.js"), "HTTPS extern bleibt unberührt");
assert(!isRewritableLocalAssetRef("data:text/javascript,void 0"), "data-URL bleibt unberührt");
assert(!isRewritableLocalAssetRef("/api/health"), "API-Pfad bleibt unberührt");
assert(isRewritableLocalAssetRef("./websocket.js"), "Relativer JS-Import ist lokal");

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
assert(
  indexOut.includes(`/assets/favicon.svg?h=${assets["/assets/favicon.svg"]}`),
  "favicon mit Content-Hash",
);
assert(!indexOut.includes("?v=nav"), "Kein manuelles ?v=nav in ausgeliefertem HTML");

console.log("test-asset-manifest: JS-Rewrite…");
const appSrc = fs.readFileSync(path.join(frontend, "js/app.js"), "utf8");
const appOut = rewriteJsImports(appSrc, "/js/app.js", assets);
assert(appOut.includes(`?h=${wsHash}`), "app.js-Imports mit Hash");
assert(
  appOut.includes(`from "./websocket.js?h=${wsHash}"`) || appOut.includes(`from './websocket.js?h=${wsHash}'`),
  "Import-Anführungszeichen müssen erhalten bleiben",
);
assert(!/from\s+\.\//.test(appOut), "Keine ungültigen unquoted ES-Module-Imports");
assert(!appOut.includes("https://"), "Keine externen URLs verändert");
const bpHash = assets["/js/backupsPage.js"];
assert(
  appOut.includes(`import("./backupsPage.js?h=${bpHash}")`) ||
    appOut.includes(`import('./backupsPage.js?h=${bpHash}')`),
  "Dynamische import() in app.js müssen Content-Hash erhalten",
);

console.log("test-asset-manifest: ES-Modul-Syntax (Admin-Seitenmodule)…");
const { pathToFileURL } = require("url");
const { execSync } = require("child_process");
/** Dynamisch geladene Admin-Module — Syntaxfehler blockieren ganze Admin-Bereiche. */
const ES_MODULE_PAGES = [
  "/js/backupsPage.js",
  "/js/events.js",
  "/js/onboardingPage.js",
  "/js/updatesPage.js",
];
for (const webPath of ES_MODULE_PAGES) {
  assert(assets[webPath], `${webPath} im Manifest`);
  const file = path.join(frontend, webPath.slice(1));
  const href = pathToFileURL(file).href;
  try {
    execSync(`node --input-type=module -e "import '${href}'"`, {
      stdio: "pipe",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });
  } catch (e) {
    const err = e.stderr?.toString() || e.message;
    throw new Error(`ES-Modul-Syntax fehlerhaft ${webPath}: ${err.split("\n").find((l) => l.includes("SyntaxError")) || err.split("\n")[0]}`);
  }
}

console.log("test-asset-manifest: Manifest-Datei laden…");
if (fs.existsSync(path.join(frontend, "asset-manifest.json"))) {
  const loaded = loadManifestStrict(frontend, { production: false });
  verifyManifestMatchesDisk(frontend, loaded.assets);
}

console.log("test-asset-manifest: OK");
