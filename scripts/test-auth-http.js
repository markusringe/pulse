#!/usr/bin/env node
/**
 * Auth-HTTP-Integration: Bootstrap-Kennwort, falscher Login, Admin bei PIN-Modus, Logout.
 * Ephemerer Port — kein Produktionsserver auf :3000.
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
  return 38000 + (process.pid % 22000);
}

function cookiesFromResponse(headers) {
  const raw = headers["set-cookie"];
  if (!raw) return "";
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((c) => c.split(";")[0]).join("; ");
}

function httpRequest(method, url, body, cookie = "") {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body != null ? JSON.stringify(body) : null;
    const headers = {};
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    if (cookie) headers.Cookie = cookie;
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json = {};
          try {
            json = JSON.parse(data || "{}");
          } catch {
            /* HTML */
          }
          resolve({ status: res.statusCode, json, headers: res.headers });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(port, attempts = 60) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      httpRequest("GET", `http://127.0.0.1:${port}/api/health`)
        .then((r) => {
          if (r.status === 200) resolve(r);
          else if (n >= attempts) reject(new Error(`health ${r.status}`));
          else setTimeout(tick, 300);
        })
        .catch(() => {
          if (n >= attempts) reject(new Error("health timeout"));
          else setTimeout(tick, 300);
        });
    };
    tick();
  });
}

function stopChild(child) {
  if (!child || child.killed) return;
  try {
    child.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }, 2000).unref();
}

(async () => {
  const port = pickPort();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-auth-http-"));
  const dbPath = path.join(tmpDir, "pulse.db");

  const env = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: "test",
    SQLITE_PATH: dbPath,
    USER_AUTH_ENABLED: "1",
    AUTH_DEV_MAILBOX: "1",
    BOOTSTRAP_ADMIN_EMAIL: "auth-http@test.local",
    BOOTSTRAP_ADMIN_PASSWORD: "AuthHttpTest123!",
    BOOTSTRAP_ADMIN_NAME: "Auth HTTP Admin",
    ADMIN_SECRET: "auth-http-test-secret",
    REDIS_URL: "",
    IP_BLOCK: "0",
  };

  const child = spawn(process.execPath, ["server.js"], { cwd: ROOT, env, stdio: "ignore" });

  try {
    const health = await waitForHealth(port);
    assert(health.json.ok === true, "Health ok");
    const base = `http://127.0.0.1:${port}`;

    const status0 = await httpRequest("GET", `${base}/api/auth/status`);
    assert(status0.status === 200, "auth/status → 200");
    assert(status0.json.passwordLoginMode === true || status0.json.bootstrapPasswordLogin, "Passwort-Modus oder Bootstrap");

    const bad = await httpRequest("POST", `${base}/api/auth/login-password`, {
      email: "auth-http@test.local",
      password: "FalschPass123!",
      adminLogin: true,
    });
    assert(bad.status === 401, `Falsches Kennwort → 401 (war ${bad.status})`);

    const good = await httpRequest("POST", `${base}/api/auth/login-password`, {
      email: "auth-http@test.local",
      password: "AuthHttpTest123!",
      adminLogin: true,
      persistent: true,
    });
    assert(good.status === 200, `Bootstrap-Login → 200 (war ${good.status}: ${good.json.error || ""})`);
    const cookie = cookiesFromResponse(good.headers);
    assert(cookie.includes("pulse_auth"), "Session-Cookie");

    const me = await httpRequest("GET", `${base}/api/auth/me`, null, cookie);
    assert(me.status === 200 && me.json.user?.role === "admin", "auth/me als Admin");

    const logout = await httpRequest("POST", `${base}/api/auth/logout`, {}, cookie);
    assert(logout.status === 200, "Logout → 200");
    const meAfter = await httpRequest("GET", `${base}/api/auth/me`, null, cookie);
    assert(meAfter.status === 401 || !meAfter.json.user, "Nach Logout kein User");

    /* PIN-Modus simuliert (Dev-Mailbox): Admin-Kennwort weiterhin erlaubt */
    const adminAgain = await httpRequest("POST", `${base}/api/auth/login-password`, {
      email: "auth-http@test.local",
      password: "AuthHttpTest123!",
      adminLogin: true,
    });
    assert(adminAgain.status === 200, "Admin-Kennwort bei PIN-Modus → 200");

    console.log(`Auth-HTTP-Tests OK (Port ${port})`);
  } finally {
    stopChild(child);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* temp */
    }
  }
})().catch((err) => {
  console.error("Auth-HTTP-Test fehlgeschlagen:", err.message);
  process.exit(1);
});
