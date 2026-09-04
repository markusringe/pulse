#!/usr/bin/env node
/**
 * Installer-Konsistenz: gleiche Env-Variabnamen in .env.example, Compose, Diagnose.
 */

const fs = require("fs");
const path = require("path");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const ROOT = path.join(__dirname, "..");
const required = [
  "BOOTSTRAP_ADMIN_NAME",
  "BOOTSTRAP_ADMIN_EMAIL",
  "BOOTSTRAP_ADMIN_PASSWORD",
  "USER_AUTH_ENABLED",
  "ADMIN_SECRET",
  "SQLITE_PATH",
  "REDIS_URL",
];

function fileContains(file, key) {
  const p = path.join(ROOT, file);
  assert(fs.existsSync(p), `${file} fehlt`);
  const text = fs.readFileSync(p, "utf8");
  assert(text.includes(key), `${file} enthält ${key} nicht`);
}

for (const key of required) {
  fileContains(".env.example", key);
  fileContains("docker-compose.yml", key);
}

const compose = fs.readFileSync(path.join(ROOT, "docker-compose.yml"), "utf8");
assert(compose.includes("env_file:"), "docker-compose env_file");
assert(compose.includes("./data:/app/data"), "gemeinsames data-Volume");
assert(compose.includes("pulse-b:"), "pulse-b Service");

const diagnose = fs.readFileSync(path.join(ROOT, "scripts/diagnose-auth.js"), "utf8");
assert(diagnose.includes("ADMIN_PASSWORD_HASH"), "Diagnose warnt vor ADMIN_PASSWORD_HASH");

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
assert(pkg.scripts["auth:diagnose"], "npm run auth:diagnose");
assert(pkg.scripts["admin:reset"], "npm run admin:reset");
assert(pkg.scripts["css:build"], "npm run css:build");

console.log("Install-Config-Tests OK");
