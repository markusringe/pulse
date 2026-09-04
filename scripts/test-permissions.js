#!/usr/bin/env node
/**
 * Berechtigungs-Regression: Team-Events + Auth-Rollen (Wrapper).
 */

const { spawnSync } = require("child_process");
const path = require("path");

const scripts = ["test-event-team-access.js", "test-auth.js"];
const root = path.join(__dirname);

for (const name of scripts) {
  const r = spawnSync(process.execPath, [path.join(root, name)], {
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(`Permissions-Suite fehlgeschlagen bei ${name}`);
    process.exit(r.status || 1);
  }
}

console.log("Permissions-Suite OK");
