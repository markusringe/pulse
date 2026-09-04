#!/usr/bin/env node
/**
 * Negative API-Tests: geschützte Routen liefern 401/403 ohne gültige Session.
 * Startet Pulse kurz auf ephemeralen Port (nicht 3000).
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");

const ROOT = path.join(__dirname, "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function pickPort() {
  return 36000 + (process.pid % 24000);
}

function httpRequest(method, url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json = {};
          try {
            json = JSON.parse(data || "{}");
          } catch {
            /* HTML o. ä. */
          }
          resolve({ status: res.statusCode, json, raw: data });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(port, attempts = 40) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      httpRequest("GET", `http://127.0.0.1:${port}/api/health`)
        .then((r) => {
          if (r.status === 200) resolve();
          else if (n >= attempts) reject(new Error(`health ${r.status}`));
          else setTimeout(tick, 250);
        })
        .catch(() => {
          if (n >= attempts) reject(new Error("health timeout"));
          else setTimeout(tick, 250);
        });
    };
    tick();
  });
}

(async () => {
  const port = pickPort();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-api-perm-"));
  const dbPath = path.join(tmpDir, "pulse.db");
  fs.mkdirSync(path.join(tmpDir, "ssl"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "events"), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, "events.json"), JSON.stringify({ events: [] }));

  const env = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: "test",
    SQLITE_PATH: dbPath,
    USER_AUTH_ENABLED: "1",
    AUTH_DEV_MAILBOX: "1",
    BOOTSTRAP_ADMIN_EMAIL: "admin@test.local",
    BOOTSTRAP_ADMIN_PASSWORD: "ApiTest123!",
    BOOTSTRAP_ADMIN_NAME: "API Test",
    ADMIN_SECRET: "api-perm-test-secret",
    REDIS_URL: "",
    IP_BLOCK: "0",
  };

  const child = spawn(process.execPath, ["server.js"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });

  try {
    await waitForHealth(port);

    const me = await httpRequest("GET", `http://127.0.0.1:${port}/api/auth/me`);
    assert(me.status === 401 || (me.status === 200 && !me.json.user), "GET /api/auth/me ohne Cookie → kein User");

    const users = await httpRequest("GET", `http://127.0.0.1:${port}/api/users`);
    assert(users.status === 403, `GET /api/users ohne Auth → 403 (war ${users.status})`);

    const createEvent = await httpRequest("POST", `http://127.0.0.1:${port}/api/events`, {
      title: "Unauth Event",
      teamId: "team_x",
    });
    assert(createEvent.status === 403, `POST /api/events ohne Auth → 403 (war ${createEvent.status})`);

    const branding = await httpRequest("PUT", `http://127.0.0.1:${port}/api/branding`, { branding: { appName: "X" } });
    assert(branding.status === 403, `PUT /api/branding ohne Auth → 403 (war ${branding.status})`);

    const backups = await httpRequest("GET", `http://127.0.0.1:${port}/api/backups`);
    assert(backups.status === 403, `GET /api/backups ohne Auth → 403 (war ${backups.status})`);

    console.log(`API-Permissions-Tests OK (Port ${port})`);
  } finally {
    child.kill("SIGTERM");
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* temp */
    }
  }
})().catch((err) => {
  console.error("API-Permissions-Test fehlgeschlagen:", err.message);
  process.exit(1);
});
