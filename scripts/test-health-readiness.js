#!/usr/bin/env node
/**
 * Integrationstest: /api/health/live vs. /api/health/ready (v1.5.5+).
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..");
const { pickPort, makeIsolatedDataDir, serverTestEnv } = require("./test-server-env");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          let json = {};
          try {
            json = JSON.parse(body || "{}");
          } catch {
            /* ignore */
          }
          resolve({ status: res.statusCode, json, body });
        });
      })
      .on("error", reject);
  });
}

function waitForHealth(port) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      httpGet(`http://127.0.0.1:${port}/api/health/live`)
        .then((r) => {
          if (r.status === 200) resolve();
          else if (n >= 50) reject(new Error(`live ${r.status}`));
          else setTimeout(tick, 200);
        })
        .catch(() => {
          if (n >= 50) reject(new Error("live timeout"));
          else setTimeout(tick, 200);
        });
    };
    tick();
  });
}

(async () => {
  const port = pickPort();
  const tmpDir = makeIsolatedDataDir("pulse-health-");
  const dbPath = path.join(tmpDir, "data", "pulse.db");

  const env = serverTestEnv({
    PORT: String(port),
    SQLITE_PATH: dbPath,
    PULSE_OPERATION_MODE: "single",
    USER_AUTH_ENABLED: "0",
  });

  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    cwd: tmpDir,
    env,
    stdio: "ignore",
  });

  try {
    await waitForHealth(port);
    const base = `http://127.0.0.1:${port}`;

    const live = await httpGet(`${base}/api/health/live`);
    assert(live.status === 200, "live → 200");
    assert(live.json.live === true, "live.live === true");
    assert(live.json.ok === true, "live.ok");
    assert(live.json.instanceId, "live.instanceId");
    assert(!live.json.version, "live ohne Versions-Monolith");

    const ready = await httpGet(`${base}/api/health/ready`);
    assert(ready.status === 200, "ready → 200");
    assert(ready.json.ok === true, "ready.ok");
    assert(ready.json.operation?.mode === "single", "operation.mode single");
    assert(Array.isArray(ready.json.checks), "ready.checks");
    const dbCheck = ready.json.checks.find((c) => c.id === "db_readwrite");
    assert(dbCheck && dbCheck.ok, "db_readwrite ok");

    const full = await httpGet(`${base}/api/health`);
    assert(full.status === 200, "health → 200");
    assert(full.json.readiness?.ready === true, "full readiness.ready");
    assert(full.json.dependencies?.db?.ok === true, "dependencies.db");

    console.log("test-health-readiness: OK");
  } finally {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error("test-health-readiness fehlgeschlagen:", err.message);
  process.exit(1);
});
