#!/usr/bin/env node
/**
 * Content-Hash-Manifest für Frontend-Assets erzeugen (Phase 5 / C-010).
 * Wird in npm run build und Docker-Build ausgeführt.
 * Bricht ab, wenn Manifest oder referenzierte Assets fehlen.
 */
const path = require("path");
const {
  writeManifest,
  buildManifest,
  validateManifestReferences,
} = require("../lib/assetManifest");

const frontendDir = path.join(__dirname, "..", "frontend");

let manifest;
try {
  manifest = writeManifest(frontendDir);
} catch (err) {
  console.error(`asset-manifest: Schreiben fehlgeschlagen — ${err.message}`);
  process.exit(1);
}

const count = Object.keys(manifest.assets).length;
console.log(`asset-manifest: ${count} Assets → frontend/asset-manifest.json`);
console.log(`  Beispiel /js/app.js → ?h=${manifest.assets["/js/app.js"] || "—"}`);

/* Referenzierte lokale Assets müssen im Manifest sein */
const refErrors = validateManifestReferences(frontendDir, manifest.assets);
if (refErrors.length) {
  console.error("asset-manifest: Referenz-Validierung fehlgeschlagen:");
  for (const msg of refErrors) {
    console.error(`  - ${msg}`);
  }
  process.exit(1);
}

/* Schnellprüfung: Manifest muss mit Live-Berechnung übereinstimmen */
const verify = buildManifest(frontendDir);
for (const [webPath, hash] of Object.entries(manifest.assets)) {
  if (verify.assets[webPath] !== hash) {
    console.error(`asset-manifest: Hash-Abweichung für ${webPath}`);
    process.exit(1);
  }
}

console.log("asset-manifest: Validierung OK");
