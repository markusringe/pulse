/**
 * Sicheres Entpacken von Backup-ZIPs — Schutz vor Zip-Slip / Pfadtraversal.
 */

const fs = require("fs");
const path = require("path");
const extract = require("extract-zip");

/**
 * Entpackt eine ZIP nur in destDir; Einträge außerhalb werden abgelehnt.
 * @param {string} zipPath
 * @param {string} destDir
 */
async function safeExtractZip(zipPath, destDir) {
  const root = path.resolve(destDir);
  fs.mkdirSync(root, { recursive: true });

  await extract(zipPath, {
    dir: root,
    onEntry: (entry) => {
      const normalized = path.normalize(entry.fileName).replace(/^(\.\.(\/|\\|$))+/, "");
      const target = path.resolve(root, normalized);
      const prefix = root.endsWith(path.sep) ? root : root + path.sep;
      if (target !== root && !target.startsWith(prefix)) {
        throw new Error(`Zip-Slip blockiert: ${entry.fileName}`);
      }
    },
  });
}

module.exports = { safeExtractZip };
