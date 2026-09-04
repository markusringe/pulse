#!/usr/bin/env node
/**
 * WebSocket-Reconnect: Nach Trennung liefert join die aktuelle activeSlideIndex vom Server.
 * Regression für B-006 / C-008 (v1.5.0+ clamp, v1.5.2 sofortiges join).
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
  return 37000 + (process.pid % 23000);
}

function httpJson(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body != null ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (payload) {
      reqHeaders["Content-Type"] = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: reqHeaders },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let json = {};
          try {
            json = JSON.parse(data || "{}");
          } catch {
            /* HTML/Fehler */
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

function waitForHealth(port, attempts = 50) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      httpJson("GET", `http://127.0.0.1:${port}/api/health`)
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

/** Wartet auf eine WS-Nachricht mit optionalem Typ-Filter. */
function waitForWsMessage(ws, type, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", onMsg);
      reject(new Error(`WS-Timeout: ${type || "beliebig"}`));
    }, timeoutMs);

    function onMsg(ev) {
      let msg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (!type || msg.type === type) {
        clearTimeout(timer);
        ws.removeEventListener("message", onMsg);
        resolve(msg);
      }
    }
    ws.addEventListener("message", onMsg);
  });
}

/** WebSocket schließen und kurz warten. */
function closeWs(ws) {
  return new Promise((resolve) => {
    if (!ws || ws.readyState === WebSocket.CLOSED) return resolve();
    ws.addEventListener("close", () => resolve(), { once: true });
    try {
      ws.close();
    } catch {
      resolve();
    }
    setTimeout(resolve, 500).unref();
  });
}
/** Verbindet zum Pulse-WebSocket und tritt als Teilnehmer bei. */
async function joinParticipant(port, code) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("WS open timeout")), 8000);
    ws.addEventListener("open", () => {
      clearTimeout(t);
      resolve();
    });
    ws.addEventListener("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
  ws.send(JSON.stringify({ type: "join", payload: { code, role: "participant", clientId: "reconnect-test" } }));
  const sessionMsg = await waitForWsMessage(ws, "session");
  return { ws, sessionMsg };
}

(async () => {
  const port = pickPort();
  assert(port !== 3000, "Test-Port darf nicht 3000 sein");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-ws-reconnect-"));
  const dbPath = path.join(tmpDir, "pulse.db");
  fs.mkdirSync(path.join(tmpDir, "ssl"), { recursive: true });

  const env = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: "test",
    SQLITE_PATH: dbPath,
    USER_AUTH_ENABLED: "0",
    REDIS_URL: "",
    IP_BLOCK: "0",
  };

  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env,
    stdio: "ignore",
  });

  /** Server-Prozess zuverlässig beenden (SIGTERM reicht manchmal nicht). */
  function stopChild() {
    if (!child.killed) {
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
      }, 1500).unref();
    }
  }

  try {
    await waitForHealth(port);
    const base = `http://127.0.0.1:${port}`;

    /* Session mit drei Folien anlegen (ohne User-Auth). */
    const created = await httpJson("POST", `${base}/api/sessions`, {
      slides: [
        { type: "choice", question: "F1", options: [{ id: "a", label: "A" }] },
        { type: "choice", question: "F2", options: [{ id: "b", label: "B" }] },
        { type: "choice", question: "F3", options: [{ id: "c", label: "C" }] },
      ],
      skipLobby: true,
    });
    assert(created.status === 201, `Session anlegen → 201 (war ${created.status})`);
    const code = created.json.session?.code;
    const adminKey = created.json.adminKey;
    assert(code && adminKey, "Code und adminKey vorhanden");

    /* Erster Join: Folie 0. */
    const first = await joinParticipant(port, code);
    assert(first.sessionMsg.payload?.session?.activeSlideIndex === 0, "Erster Join → Folie 0");
    first.ws.close();
    await closeWs(first.ws);

    /* Presenter ändert Folie per REST, während Client getrennt ist. */
    const slideChange = await httpJson(
      "POST",
      `${base}/api/sessions/${code}/slide`,
      { index: 2 },
      { "X-Admin-Key": adminKey }
    );
    assert(slideChange.status === 200, `Folie wechseln → 200 (war ${slideChange.status})`);
    assert(slideChange.json.session?.activeSlideIndex === 2, "Server auf Folie 2");

    /* Reconnect: join muss aktuelle Folie liefern (nicht gecachten lokalen Stand). */
    const second = await joinParticipant(port, code);
    assert(
      second.sessionMsg.payload?.session?.activeSlideIndex === 2,
      `Reconnect → Folie 2 (war ${second.sessionMsg.payload?.session?.activeSlideIndex})`
    );
    second.ws.close();
    await closeWs(second.ws);

    console.log(`WS-Reconnect-Tests OK (Port ${port}, Session ${code})`);
  } finally {
    stopChild();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* temp */
    }
  }
})().catch((err) => {
  console.error("WS-Reconnect-Test fehlgeschlagen:", err.message);
  process.exit(1);
});
