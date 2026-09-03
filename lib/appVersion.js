/**
 * Programmversion aus package.json — zentrale Quelle für API, Hilfe und Doku-Sync.
 */

const path = require("path");

let cached = null;

/** SemVer-String aus package.json (z. B. „1.2.1“). */
function getAppVersion() {
  if (cached) return cached;
  try {
    const pkg = require(path.join(__dirname, "..", "package.json"));
    cached = String(pkg.version || "0.0.0").trim();
  } catch {
    cached = "0.0.0";
  }
  return cached;
}

/** Anzeige mit v-Präfix (z. B. „v1.2.1“). */
function getAppVersionLabel() {
  const v = getAppVersion();
  return v.startsWith("v") ? v : `v${v}`;
}

module.exports = { getAppVersion, getAppVersionLabel };
