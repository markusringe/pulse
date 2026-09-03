#!/usr/bin/env node
/**
 * Backup bei Installation oder manuell einspielen — gruppenweise oder vollständig.
 * Aufruf: node scripts/install-restore-backup.js --file /pfad/backup.zip [--groups all|id1,id2]
 */

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const out = { file: "", groups: "all", dir: "" };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--file" && argv[i + 1]) {
      out.file = argv[++i];
    } else if (a === "--groups" && argv[i + 1]) {
      out.groups = argv[++i];
    } else if (a === "--dir" && argv[i + 1]) {
      out.dir = argv[++i];
    } else if (a === "-h" || a === "--help") {
      console.log(`Verwendung: node scripts/install-restore-backup.js --file backup.zip [--groups all|db_users,branding,...] [--dir /opt/pulse]`);
      process.exit(0);
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(args.dir || path.join(__dirname, ".."));
  if (args.dir) process.chdir(root);

  const zipPath = path.resolve(args.file);
  if (!fs.existsSync(zipPath)) {
    console.error("[restore] Datei nicht gefunden:", zipPath);
    process.exit(1);
  }

  const backupService = require(path.join(root, "lib", "backupService"));
  const groupList =
    !args.groups || args.groups === "all"
      ? undefined
      : args.groups.split(",").map((g) => g.trim()).filter(Boolean);

  const requireDb = !groupList || groupList.includes("all");
  await backupService.validateBackupZip(zipPath, { requireDatabase: requireDb });

  console.log("[restore] Einspielen:", zipPath, groupList ? `(Gruppen: ${groupList.join(", ")})` : "(vollständig)");
  await backupService.restoreFromBackup(zipPath, { groups: groupList, broadcast: false });
  console.log("[restore] Fertig.");
}

main().catch((err) => {
  console.error("[restore] Fehler:", err.message || err);
  process.exit(1);
});
