#!/usr/bin/env node
/**
 * HTTP-Smoke-Test: startet Pulse kurz auf ephemeralen Port (nicht 3000).
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");

const ROOT = path.join(__dirname, "..");
const { pickPort, makeIsolatedDataDir, serverTestEnv } = require("./test-server-env");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function httpGet(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("timeout"));
    });
  });
}

function waitForHealth(port, attempts = 40) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      httpGet(`http://127.0.0.1:${port}/api/health`)
        .then((r) => {
          if (r.status === 200) return resolve(r);
          if (n >= attempts) return reject(new Error(`health status ${r.status}`));
          setTimeout(tick, 250);
        })
        .catch(() => {
          if (n >= attempts) return reject(new Error("health timeout"));
          setTimeout(tick, 250);
        });
    };
    tick();
  });
}

(async () => {
  const port = pickPort();
  assert(port !== 3000, "Smoke-Port darf nicht 3000 sein");

  const tmpDir = makeIsolatedDataDir("pulse-smoke-");
  const dbPath = path.join(tmpDir, "pulse.db");

  const env = serverTestEnv({
    PORT: String(port),
    SQLITE_PATH: dbPath,
    USER_AUTH_ENABLED: "1",
    AUTH_DEV_MAILBOX: "1",
    BOOTSTRAP_ADMIN_EMAIL: "smoke@test.local",
    BOOTSTRAP_ADMIN_PASSWORD: "SmokeTest123!",
    BOOTSTRAP_ADMIN_NAME: "Smoke Admin",
    ADMIN_SECRET: "smoke-test-secret-not-production",
  });

  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    cwd: tmpDir,
    env,
    stdio: "ignore",
  });

  try {
    await waitForHealth(port);

    const health = await httpGet(`http://127.0.0.1:${port}/api/health`);
    assert(health.status === 200, "GET /api/health → 200");

    const authStatus = await httpGet(`http://127.0.0.1:${port}/api/auth/status`);
    assert(authStatus.status === 200, "GET /api/auth/status → 200");
    const authJson = JSON.parse(authStatus.body);
    assert(typeof authJson.enabled === "boolean", "auth/status JSON");

    const index = await httpGet(`http://127.0.0.1:${port}/`);
    assert(index.status === 200, "GET / → 200");
    assert(index.body.includes("Pulse") || index.body.includes("pulse"), "Startseite HTML");

    const appJs = await httpGet(`http://127.0.0.1:${port}/js/app.js`);
    assert(appJs.status === 200, "GET /js/app.js → 200");
    assert(appJs.headers["cache-control"], "Cache-Control für JS gesetzt");

    console.log(`Smoke-Tests OK (Port ${port})`);
  } finally {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* temp */
    }
  }
})().catch((err) => {
  console.error("Smoke-Test fehlgeschlagen:", err.message);
  process.exit(1);
});
