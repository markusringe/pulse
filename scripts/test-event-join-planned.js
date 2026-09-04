#!/usr/bin/env node
/**
 * Geplante Events: WS-Join liefert Session (kein Fehler beim Seitenaufbau).
 * Eingaben werden per event_planned abgewiesen.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");

const ROOT = path.join(__dirname, "..");
const eventStore = require("../lib/events");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function pickPort() {
  return 37100 + (process.pid % 22000);
}

function httpJson(method, url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body != null ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {},
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json = {};
          try {
            json = JSON.parse(data || "{}");
          } catch {
            /* ignore */
          }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForHealth(port) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      httpJson("GET", `http://127.0.0.1:${port}/api/health`)
        .then((r) => (r.status === 200 ? resolve() : n >= 40 ? reject(new Error("health")) : setTimeout(tick, 200)))
        .catch(() => (n >= 40 ? reject(new Error("health timeout")) : setTimeout(tick, 200)));
    };
    tick();
  });
}

function wsJoin(port, code) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      reject(new Error("WS timeout"));
    }, 8000);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "join", payload: { code, role: "participant", clientId: "test-planned-1" } }));
    });
    ws.addEventListener("message", (ev) => {
      let msg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.type === "session") {
        clearTimeout(timer);
        resolve({ ws, session: msg.payload?.session });
      } else if (msg.type === "error") {
        clearTimeout(timer);
        reject(new Error(`unexpected error: ${JSON.stringify(msg.payload)}`));
      }
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("WS error"));
    });
  });
}

(async () => {
  const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-planned-join-"));
  const sqlitePath = path.join(tmpData, "pulse.db");
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  const port = pickPort();

  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    cwd: tmpData,
    env: {
      ...process.env,
      PORT: String(port),
      SQLITE_PATH: sqlitePath,
      NODE_ENV: "test",
      USER_AUTH_ENABLED: "0",
      PULSE_OPERATION_MODE: "single",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stderr.on("data", (c) => process.stderr.write(c));

  try {
    await waitForHealth(port);

    fs.mkdirSync(path.join(tmpData, "data"), { recursive: true });
    const prevCwd = process.cwd();
    process.chdir(tmpData);
    let created;
    try {
      created = eventStore.create({
        title: "Geplant-Test",
        status: "planned",
      });
    } finally {
      process.chdir(prevCwd);
    }
    const code = created.joinCode;
    assert(/^\d{6}$/.test(code), "Event-Join-Code sechsstellig");

    const { ws, session } = await wsJoin(port, code);
    assert(session?.code === code, "WS join liefert Session");
    assert(session?.eventMeta?.status === "planned", "eventMeta.status planned");

    ws.send(
      JSON.stringify({
        type: "vote",
        payload: { code, slideId: session.slides[0].id, optionId: session.slides[0].options[0].id },
      })
    );

    const voteErr = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("vote error timeout")), 5000);
      ws.addEventListener("message", function onVote(ev) {
        let msg;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg.type === "error") {
          clearTimeout(t);
          ws.removeEventListener("message", onVote);
          resolve(msg.payload);
        }
      });
    });
    assert(voteErr?.error === "event_planned", "Vote blockiert mit event_planned");
    ws.close();

    console.log("test-event-join-planned: ok");
  } finally {
    child.kill("SIGTERM");
    fs.rmSync(tmpData, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error("test-event-join-planned fehlgeschlagen:", err.message);
  process.exit(1);
});
