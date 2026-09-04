#!/usr/bin/env node
/**
 * Remote-Smoke-Test gegen eine laufende Pulse-Instanz (z. B. VPS-Produktion).
 * Keine Secrets — nur öffentliche HTTP-Endpunkte.
 *
 * Nutzung:
 *   node scripts/smoke-remote-url.js
 *   node scripts/smoke-remote-url.js --url https://pulse.ringe.us
 *   node scripts/smoke-remote-url.js --url https://pulse.ringe.us --expect-version 1.5.5
 */

const https = require("https");
const http = require("http");

function parseArgs(argv) {
  const out = {
    url: process.env.PULSE_SMOKE_URL || "https://pulse.ringe.us",
    expectVersion: process.env.PULSE_EXPECT_VERSION || "",
    timeoutMs: 15000,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--url" && argv[i + 1]) {
      out.url = argv[++i];
    } else if (a === "--expect-version" && argv[i + 1]) {
      out.expectVersion = argv[++i];
    } else if (a === "--timeout" && argv[i + 1]) {
      out.timeoutMs = Number(argv[++i]) || out.timeoutMs;
    } else if (a === "-h" || a === "--help") {
      console.log(`Usage: node scripts/smoke-remote-url.js [--url BASE] [--expect-version X.Y.Z]`);
      process.exit(0);
    }
  }
  return out;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** GET mit Timeout; gibt Status, Body und Header zurück. */
function httpGet(fullUrl, timeoutMs) {
  return new Promise((resolve, reject) => {
    const lib = fullUrl.startsWith("https:") ? https : http;
    const req = lib.get(fullUrl, (res) => {
      let body = "";
      res.on("data", (c) => {
        body += c;
      });
      res.on("end", () => {
        resolve({ status: res.statusCode, body, headers: res.headers });
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timeout nach ${timeoutMs} ms: ${fullUrl}`));
    });
  });
}

function joinUrl(base, path) {
  return `${base.replace(/\/$/, "")}${path}`;
}

(async () => {
  const opts = parseArgs(process.argv);
  const base = opts.url.replace(/\/$/, "");
  const results = [];

  function record(name, ok, detail = "") {
    results.push({ name, ok, detail });
    const mark = ok ? "OK" : "FAIL";
    console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
  }

  console.log(`Remote-Smoke: ${base}\n`);

  // Startseite
  const index = await httpGet(joinUrl(base, "/"), opts.timeoutMs);
  record("GET /", index.status === 200, `HTTP ${index.status}, ${index.body.length} B`);
  assert(index.status === 200, "Startseite nicht erreichbar");
  assert(/Pulse|pulse/i.test(index.body), "Startseite enthält keinen Pulse-Bezug");
  record("index.__PULSE_ASSET_H__", /__PULSE_ASSET_H__/.test(index.body), "Manifest injiziert");
  record("index.app.js?h=", /\/js\/app\.js\?h=[a-f0-9]{8}/.test(index.body), "app.js mit Content-Hash");

  // Statisches JS mit Hash-Query (wie nach Deploy aus index.html)
  const appJsMatch = index.body.match(/\/js\/app\.js\?h=([a-f0-9]{8})/);
  const appJsUrl = appJsMatch ? `/js/app.js?h=${appJsMatch[1]}` : "/js/app.js";
  const appJs = await httpGet(joinUrl(base, appJsUrl), opts.timeoutMs);
  record("GET /js/app.js?h=", appJs.status === 200, `HTTP ${appJs.status}, ${appJs.body.length} B`);
  assert(appJs.status === 200, "/js/app.js mit Hash nicht erreichbar");
  const immutableCache = appJs.headers["cache-control"] || "";
  record("app.js Cache-Control immutable", /immutable/.test(immutableCache), immutableCache || "fehlt");

  // Vollständiger Health
  const health = await httpGet(joinUrl(base, "/api/health"), opts.timeoutMs);
  record("GET /api/health", health.status === 200, `HTTP ${health.status}`);
  assert(health.status === 200, "/api/health nicht 200");
  let healthJson;
  try {
    healthJson = JSON.parse(health.body);
  } catch {
    throw new Error("/api/health liefert kein JSON");
  }
  record("health.ok", healthJson.ok === true, String(healthJson.ok));
  record("health.version", Boolean(healthJson.version), healthJson.version || "fehlt");
  if (opts.expectVersion) {
    const verOk = healthJson.version === opts.expectVersion;
    record("health.expect-version", verOk, `ist ${healthJson.version}, erwartet ${opts.expectVersion}`);
  }

  // Liveness (ab v1.5.5: schlankes JSON; ältere Versionen liefern ggf. volles Health)
  const live = await httpGet(joinUrl(base, "/api/health/live"), opts.timeoutMs);
  record("GET /api/health/live", live.status === 200, `HTTP ${live.status}`);
  let liveJson = {};
  try {
    liveJson = JSON.parse(live.body);
  } catch {
    record("health/live JSON", false, "kein JSON");
  }
  if (liveJson.live === true) {
    record("health/live.live", true, "v1.5.5+ Liveness-Modell");
  } else if (liveJson.version) {
    record("health/live.legacy", true, `Legacy (volles Health, v${liveJson.version})`);
  }

  // Readiness
  const ready = await httpGet(joinUrl(base, "/api/health/ready"), opts.timeoutMs);
  record("GET /api/health/ready", ready.status === 200 || ready.status === 503, `HTTP ${ready.status}`);
  let readyJson = {};
  try {
    readyJson = JSON.parse(ready.body);
  } catch {
    record("health/ready JSON", false, "kein JSON");
  }
  if (readyJson.operation) {
    record("health/ready.operation", true, `mode=${readyJson.operation.mode || "?"}`);
  } else if (readyJson.version) {
    record("health/ready.legacy", true, `Legacy (volles Health, v${readyJson.version})`);
  }
  if (Array.isArray(readyJson.checks)) {
    const assetCheck = readyJson.checks.find((c) => c.id === "asset_manifest");
    if (assetCheck) {
      record("health/ready.asset_manifest", assetCheck.ok === true, assetCheck.message || "");
    }
  }

  // Auth-Status (öffentlich)
  const auth = await httpGet(joinUrl(base, "/api/auth/status"), opts.timeoutMs);
  record("GET /api/auth/status", auth.status === 200, `HTTP ${auth.status}`);
  if (auth.status === 200) {
    const authJson = JSON.parse(auth.body);
    record("auth.enabled", typeof authJson.enabled === "boolean", String(authJson.enabled));
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} Checks bestanden`);
  if (failed.length) {
    console.error("\nFehlgeschlagen:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
  console.log("\nRemote-Smoke OK");
})().catch((err) => {
  console.error("\nRemote-Smoke fehlgeschlagen:", err.message);
  process.exit(1);
});
