#!/usr/bin/env node
/**
 * Unit-Tests für Update-Service (SemVer, Konfiguration, State) — ohne GitHub-Netzwerk.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-update-test-"));
const prevCwd = process.cwd();
process.chdir(tmpRoot);

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync(
  "package.json",
  JSON.stringify({ name: "pulse-test", version: "1.0.0" }, null, 2)
);

process.env.UPDATE_REPO = "markusringe/pulse";
process.env.UPDATE_ENABLED = "true";
process.env.GITHUB_TOKEN = "";

const updateService = require("../lib/updateService");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(updateService.parseSemver("v1.2.3")?.label === "1.2.3", "SemVer aus Tag");
assert(updateService.parseSemver("2.0.0")?.major === 2, "SemVer major");
assert(updateService.semverGt("1.3.0", "1.2.3"), "1.3.0 > 1.2.3");
assert(!updateService.semverGt("1.2.3", "1.3.0"), "1.2.3 nicht > 1.3.0");
assert(!updateService.semverGt("1.2.3", "1.2.3"), "gleiche Version");
assert(updateService.semverGt("2.0.0", "1.9.9"), "Major-Sprung");

const picked = updateService.pickHighestReleaseCandidate(
  [
    { tag_name: "v1.2.1", draft: false, prerelease: false, body: "Release 1.2.1" },
  ],
  [{ name: "v1.2.3" }, { name: "v1.2.2" }, { name: "v1.2.1" }],
  false,
  "markusringe/pulse"
);
assert(picked?.tag_name === "v1.2.3", "Neuester Tag schlägt älteres GitHub-Release");

const noUpdate = updateService.pickHighestReleaseCandidate(
  [{ tag_name: "v1.2.1", draft: false, prerelease: false }],
  [{ name: "v1.2.1" }],
  false,
  "markusringe/pulse"
);
assert(noUpdate?.tag_name === "v1.2.1", "Gleiche Version aus Release");

assert(updateService.configuredRepo() === "markusringe/pulse", "Repo aus Env");
assert(updateService.updatesEnabled(), "Updates aktiv");
assert(updateService.loadPackageVersion() === "1.0.0", "package.json Version");

const cfg = updateService.saveConfig({ checkIntervalSec: 43200, allowPrerelease: true });
assert(cfg.checkIntervalSec === 43200, "Intervall speichern");
assert(cfg.allowPrerelease === true, "Prerelease speichern");

const invalid = updateService.saveConfig({ checkIntervalSec: 99999 });
assert(invalid.checkIntervalSec === 43200, "Ungültiges Intervall wird ignoriert");

const cached = updateService.getCachedInfo();
assert(cached.info.currentVersion === "1.0.0", "Cached Info aktuelle Version");
assert(Array.isArray(updateService.getStatus().history) || updateService.getStatus().history === undefined, "Status");

delete process.env.UPDATE_REPO;
process.env.UPDATE_ENABLED = "false";
delete require.cache[require.resolve("../lib/updateService")];
const disabled = require("../lib/updateService");
assert(!disabled.configuredRepo(), "Ohne UPDATE_REPO kein Repo");
assert(!disabled.updatesEnabled(), "Mit UPDATE_ENABLED=false deaktiviert");

process.chdir(prevCwd);
fs.rmSync(tmpRoot, { recursive: true, force: true });
console.log("test-updates: OK");
