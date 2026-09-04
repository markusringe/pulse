#!/usr/bin/env node
/**
 * Content-Hash-Manifest für Frontend-Assets erzeugen (Phase 5 / C-010).
 * Wird in npm run build und Docker-Build ausgeführt.
 */
const path = require("path");
const { writeManifest, buildManifest } = require("../lib/assetManifest");

const frontendDir = path.join(__dirname, "..", "frontend");
const manifest = writeManifest(frontendDir);
const count = Object.keys(manifest.assets).length;
console.log(`asset-manifest: ${count} Assets → frontend/asset-manifest.json`);
console.log(`  Beispiel /js/app.js → ?h=${manifest.assets["/js/app.js"] || "—"}`);

/* Schnellprüfung: Manifest muss mit Live-Berechnung übereinstimmen */
const verify = buildManifest(frontendDir);
for (const [webPath, hash] of Object.entries(manifest.assets)) {
  if (verify.assets[webPath] !== hash) {
    console.error(`asset-manifest: Hash-Abweichung für ${webPath}`);
    process.exit(1);
  }
}
