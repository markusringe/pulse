#!/usr/bin/env node
/**
 * WS-Integration: Sonderfolien nur Presenter steuert; Stage empfängt event_meta passiv.
 * Läuft gegen ephemeralen Pulse-Server (kein Prod-Zugriff nötig).
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const eventStore = require("../lib/events");

const ROOT = path.join(__dirname, "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function pickPort() {
  return 37200 + (process.pid % 21000);
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
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        let data = "";
        res.on("data", (c) => {
          data += c;
        });
        res.on("end", () => {
          let json = {};
          try {
            json = JSON.parse(data || "{}");
          } catch {
            /* */
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

function waitForWsMessage(ws, type, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", onMsg);
      reject(new Error(`WS-Timeout: ${type || "message"}`));
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

async function wsJoin(port, code, role, extra = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("WS open timeout")), 8000);
    ws.addEventListener("open", () => {
      clearTimeout(t);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(t);
      reject(new Error("WS error"));
    });
  });
  ws.send(
    JSON.stringify({
      type: "join",
      payload: { code, role, clientId: `spec-${role}-${Date.now()}`, ...extra },
    })
  );
  const sessionMsg = await waitForWsMessage(ws, "session");
  return { ws, sessionMsg };
}

(async () => {
  const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-spec-ws-"));
  const sqlitePath = path.join(tmpData, "pulse.db");
  fs.mkdirSync(path.join(tmpData, "data"), { recursive: true });
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

  function stopChild() {
    if (!child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {
        /* */
      }
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* */
        }
      }, 1500).unref();
    }
  }

  try {
    await waitForHealth(port);

    const prevCwd = process.cwd();
    process.chdir(tmpData);
    let ev;
    try {
      ev = eventStore.create({
        title: "Sonderfolien-WS",
        status: "active",
        startTime: "2099-12-01T10:00:00.000Z",
        pauseSlide: { enabled: true, title: "Pause", subtitle: "Kurz", style: "modern" },
        endSlide: { enabled: true, title: "Ende", subtitle: "Danke", style: "classic" },
      });
    } finally {
      process.chdir(prevCwd);
    }

    const code = ev.joinCode;
    assert(/^\d{6}$/.test(code), "Event-Join-Code sechsstellig");

    const base = `http://127.0.0.1:${port}`;
    const sessionRes = await httpJson("POST", `${base}/api/sessions`, {
      code,
      eventId: ev.id,
      skipLobby: true,
      slides: [{ type: "choice", question: "Test", options: [{ id: "a", label: "A" }] }],
    });
    assert(sessionRes.status === 201, `Session anlegen → 201 (war ${sessionRes.status})`);
    const adminKey = sessionRes.json.adminKey;
    assert(adminKey, "adminKey für Presenter-Join");

    const presenter = await wsJoin(port, code, "presenter", { adminKey });
    assert(presenter.sessionMsg.payload?.clientRole === "presenter", "Presenter-Rolle bestätigt");
    const stage = await wsJoin(port, code, "stage");

    /* Presenter: Pause-Sonderfolie aktivieren */
    presenter.ws.send(
      JSON.stringify({
        type: "event_countdown",
        payload: {
          code,
          action: "set_current_special_slide",
          currentSpecialSlide: "pause",
        },
      })
    );

    const presenterMeta = await waitForWsMessage(presenter.ws, "event_meta");
    assert(
      presenterMeta.payload?.eventMeta?.currentSpecialSlide === "pause",
      "Presenter erhält event_meta pause"
    );

    const stageMeta = await waitForWsMessage(stage.ws, "event_meta");
    assert(stageMeta.payload?.eventMeta?.currentSpecialSlide === "pause", "Stage erhält event_meta passiv");

    /* Stage: Send wird serverseitig still verworfen (onWsMessage stage early-return). */
    let stageEndBroadcast = false;
    const onStageMsg = (ev) => {
      let msg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.type === "event_meta" && msg.payload?.eventMeta?.currentSpecialSlide === "end") {
        stageEndBroadcast = true;
      }
    };
    stage.ws.addEventListener("message", onStageMsg);
    stage.ws.send(
      JSON.stringify({
        type: "event_countdown",
        payload: {
          code,
          action: "set_current_special_slide",
          currentSpecialSlide: "end",
        },
      })
    );
    await new Promise((r) => setTimeout(r, 600));
    stage.ws.removeEventListener("message", onStageMsg);
    assert(!stageEndBroadcast, "Stage darf Sonderfolien nicht steuern (kein End-Broadcast)");

    /* Presenter sieht weiterhin Pause */
    presenter.ws.send(
      JSON.stringify({
        type: "event_countdown",
        payload: {
          code,
          action: "set_current_special_slide",
          currentSpecialSlide: "pause",
        },
      })
    );
    const stillPause = await waitForWsMessage(presenter.ws, "event_meta");
    assert(
      stillPause.payload?.eventMeta?.currentSpecialSlide === "pause",
      "Sonderfolie bleibt Pause nach Stage-Versuch"
    );

    presenter.ws.close();
    stage.ws.close();
    console.log(`OK test-special-slides-ws (${code})`);
  } finally {
    stopChild();
    try {
      fs.rmSync(tmpData, { recursive: true, force: true });
    } catch {
      /* */
    }
  }
})().catch((err) => {
  console.error("test-special-slides-ws:", err.message);
  process.exit(1);
});
