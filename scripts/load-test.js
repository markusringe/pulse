#!/usr/bin/env node
/**
 * Reproduzierbarer Lasttest ohne externe Dienste.
 * Misst P50/P95/P99 für Join (WS), Vote (HTTP) und Health.
 *
 * Aufruf:
 *   node scripts/load-test.js [--participants=100] [--votes=1] [--report=./load-report.json]
 *
 * Release-Gates (Standard, überschreibbar per Env):
 *   LOAD_GATE_P95_JOIN_MS=800
 *   LOAD_GATE_P95_VOTE_MS=500
 *   LOAD_GATE_ERROR_RATE=0.01
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");

const ROOT = path.join(__dirname, "..");
const { pickPort, makeIsolatedDataDir, serverTestEnv } = require("./test-server-env");

function parseArgs(argv) {
  const out = { participants: 100, votes: 1, report: "" };
  for (const a of argv) {
    const m = a.match(/^--(\w+)=(.+)$/);
    if (!m) continue;
    if (m[1] === "participants") out.participants = Math.max(1, Number(m[2]) || 100);
    if (m[1] === "votes") out.votes = Math.max(1, Number(m[2]) || 1);
    if (m[1] === "report") out.report = m[2];
  }
  return out;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function httpJson(method, url, body, headers = {}) {
  const t0 = performance.now();
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
            /* ignore */
          }
          resolve({
            status: res.statusCode,
            json,
            ms: performance.now() - t0,
            ok: res.statusCode >= 200 && res.statusCode < 300,
          });
        });
      }
    );
    req.on("error", (e) => reject(e));
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
        .then((r) => {
          if (r.status === 200) resolve();
          else if (n >= 40) reject(new Error(`health ${r.status}`));
          else setTimeout(tick, 200);
        })
        .catch(() => {
          if (n >= 40) reject(new Error("health timeout"));
          else setTimeout(tick, 200);
        });
    };
    tick();
  });
}

function waitForWsMessage(ws, type, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", onMsg);
      reject(new Error(`WS timeout ${type}`));
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
  const args = parseArgs(process.argv.slice(2));
  const port = pickPort();
  const tmpDir = makeIsolatedDataDir("pulse-load-");
  const dbPath = path.join(tmpDir, "data", "pulse.db");

  const env = serverTestEnv({
    PORT: String(port),
    SQLITE_PATH: dbPath,
    USER_AUTH_ENABLED: "0",
    PULSE_OPERATION_MODE: "single",
    IP_BLOCK: "0",
  });

  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    cwd: tmpDir,
    env,
    stdio: "ignore",
  });

  const joinLatencies = [];
  const voteLatencies = [];
  const healthLatencies = [];
  let errors = 0;
  let attempts = 0;

  try {
    await waitForHealth(port);
    const base = `http://127.0.0.1:${port}`;

    const created = await httpJson("POST", `${base}/api/sessions`, {
      slides: [
        {
          type: "choice",
          question: "Lasttest",
          options: [
            { id: "a", label: "A" },
            { id: "b", label: "B" },
          ],
          interaction: { manualStart: false, state: "running" },
        },
      ],
      skipLobby: true,
    });
    if (created.status !== 201) throw new Error(`Session ${created.status}`);
    const code = created.json.session?.code;
    const slideId = created.json.session?.slides?.[0]?.id;
    if (!code || !slideId) throw new Error("Session unvollständig");

    /** Join + Vote über dieselbe WS-Verbindung (wie echte Teilnehmer). */
    async function joinAndVote(clientId) {
      const t0Join = performance.now();
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("WS open timeout")), 10000);
        ws.addEventListener("open", () => {
          clearTimeout(t);
          resolve();
        });
        ws.addEventListener("error", reject);
      });
      ws.send(
        JSON.stringify({
          type: "join",
          payload: { code, role: "participant", clientId },
        })
      );
      await waitForWsMessage(ws, "session");
      const joinMs = performance.now() - t0Join;
      const t0Vote = performance.now();
      ws.send(JSON.stringify({ type: "vote", payload: { code, slideId, optionId: "a" } }));
      await Promise.race([
        waitForWsMessage(ws, "poll:update", 2000),
        new Promise((r) => setTimeout(r, 400)),
      ]);
      const voteMs = performance.now() - t0Vote;
      ws.close();
      return { joinMs, voteMs, ok: true };
    }

    const batch = Math.min(10, args.participants);
    for (let offset = 0; offset < args.participants; offset += batch) {
      const slice = Math.min(batch, args.participants - offset);
      const jobs = [];
      for (let i = 0; i < slice; i++) {
        jobs.push(
          joinAndVote(`p-${offset + i}`).catch(() => {
            return { joinMs: 0, voteMs: 0, ok: false };
          })
        );
      }
      const results = await Promise.all(jobs);
      for (const r of results) {
        attempts += 1;
        if (r.ok) {
          joinLatencies.push(r.joinMs);
          voteLatencies.push(r.voteMs);
        } else {
          errors += 1;
        }
      }
    }

    for (let v = 1; v < args.votes; v++) {
      /* Zusätzliche Vote-Runden über frische Verbindungen */
      for (let i = 0; i < Math.min(args.participants, 50); i++) {
        attempts += 1;
        try {
          const r = await joinAndVote(`v${v}-${i}`);
          if (r.ok) voteLatencies.push(r.voteMs);
          else errors += 1;
        } catch {
          errors += 1;
        }
      }
    }

    for (let h = 0; h < 20; h++) {
      const r = await httpJson("GET", `${base}/api/health`);
      if (r.ok) healthLatencies.push(r.ms);
    }

    joinLatencies.sort((a, b) => a - b);
    voteLatencies.sort((a, b) => a - b);
    healthLatencies.sort((a, b) => a - b);

    const errorRate = attempts > 0 ? errors / attempts : 0;
    const report = {
      at: new Date().toISOString(),
      mode: "single",
      participants: args.participants,
      votesPerParticipant: args.votes,
      port,
      metrics: {
        join: {
          count: joinLatencies.length,
          p50: Math.round(percentile(joinLatencies, 50)),
          p95: Math.round(percentile(joinLatencies, 95)),
          p99: Math.round(percentile(joinLatencies, 99)),
        },
        vote: {
          count: voteLatencies.length,
          p50: Math.round(percentile(voteLatencies, 50)),
          p95: Math.round(percentile(voteLatencies, 95)),
          p99: Math.round(percentile(voteLatencies, 99)),
        },
        health: {
          count: healthLatencies.length,
          p50: Math.round(percentile(healthLatencies, 50)),
          p95: Math.round(percentile(healthLatencies, 95)),
        },
        errorRate: Number(errorRate.toFixed(4)),
        attempts,
        errors,
      },
      gates: {
        p95JoinMs: Number(process.env.LOAD_GATE_P95_JOIN_MS || 800),
        p95VoteMs: Number(process.env.LOAD_GATE_P95_VOTE_MS || 500),
        maxErrorRate: Number(process.env.LOAD_GATE_ERROR_RATE || 0.01),
      },
    };

    report.passed =
      report.metrics.join.p95 <= report.gates.p95JoinMs &&
      report.metrics.vote.p95 <= report.gates.p95VoteMs &&
      report.metrics.errorRate <= report.gates.maxErrorRate;

    const outJson = JSON.stringify(report, null, 2);
    if (args.report) fs.writeFileSync(args.report, outJson);
    console.log(outJson);

    if (!report.passed) {
      console.error("load-test: Release-Gates nicht erfüllt");
      process.exitCode = 1;
    } else {
      console.error(`load-test: OK (${args.participants} Teilnehmer)`);
    }
  } finally {
    stopChild(child);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* temp */
    }
  }
})().catch((err) => {
  console.error("load-test fehlgeschlagen:", err.message);
  process.exit(1);
});
