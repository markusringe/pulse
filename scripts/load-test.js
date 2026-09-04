#!/usr/bin/env node
/**
 * Reproduzierbarer Lasttest ohne externe Dienste.
 * Misst P50/P95/P99 für Join (WS), Vote (HTTP) und Health.
 *
 * Aufruf:
 *   node scripts/load-test.js [--participants=100] [--votes=1] [--duration-minutes=30] [--report=./load-report.json]
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
const https = require("https");

const ROOT = path.join(__dirname, "..");
const { pickPort, makeIsolatedDataDir, serverTestEnv } = require("./test-server-env");

function parseArgs(argv) {
  const out = {
    participants: 100,
    votes: 1,
    report: "",
    url: "",
    allowRemote: false,
    code: "",
    skipSpawn: false,
    durationMinutes: 0,
    healthSampleSec: 30,
  };
  for (const a of argv) {
    if (a === "--allow-remote") {
      out.allowRemote = true;
      continue;
    }
    const m = a.match(/^--(\w+)=(.+)$/);
    if (!m) continue;
    if (m[1] === "participants") out.participants = Math.max(1, Number(m[2]) || 100);
    if (m[1] === "votes") out.votes = Math.max(1, Number(m[2]) || 1);
    if (m[1] === "report") out.report = m[2];
    if (m[1] === "duration-minutes") out.durationMinutes = Math.max(0, Number(m[2]) || 0);
    if (m[1] === "health-sample-sec") out.healthSampleSec = Math.max(5, Number(m[2]) || 30);
    if (m[1] === "url") {
      out.url = m[2].replace(/\/$/, "");
      out.skipSpawn = true;
    }
    if (m[1] === "code") out.code = m[2];
  }
  return out;
}

/** WebSocket-URL aus HTTP-Basis ableiten. */
function wsUrlFromBase(base) {
  const u = new URL(base.startsWith("http") ? base : `http://${base}`);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/ws";
  u.search = "";
  return u.toString();
}

/** Nur localhost ohne explizite Freigabe — schützt Prod-Sessions. */
function assertSafeTarget(base, allowRemote) {
  const u = new URL(base.startsWith("http") ? base : `http://${base}`);
  const host = u.hostname.toLowerCase();
  const local = host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (!local && !allowRemote) {
    throw new Error(
      `Lasttest gegen ${host} blockiert — nur isolierte Instanz oder --allow-remote (Prod-Sessions gefährdet).`
    );
  }
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
    const lib = u.protocol === "https:" ? https : http;
    const payload = body != null ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (payload) {
      reqHeaders["Content-Type"] = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = lib.request(
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

  let child = null;
  let base = args.url || `http://127.0.0.1:${port}`;

  if (!args.skipSpawn) {
    child = spawn(process.execPath, [path.join(ROOT, "server.js")], {
      cwd: tmpDir,
      env,
      stdio: "ignore",
    });
    base = `http://127.0.0.1:${port}`;
  } else {
    assertSafeTarget(base, args.allowRemote);
  }

  const joinLatencies = [];
  const voteLatencies = [];
  const healthLatencies = [];
  let errors = 0;
  let attempts = 0;
  let reportDurationSamples = [];

  try {
    if (!args.skipSpawn) await waitForHealth(port);

    const created =
      args.code && args.skipSpawn
        ? { status: 200, json: { session: { code: args.code, slides: [] } } }
        : await httpJson("POST", `${base}/api/sessions`, {
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
    if (!args.code && created.status !== 201) throw new Error(`Session ${created.status}`);
    const code = args.code || created.json.session?.code;
    let slideId = created.json.session?.slides?.[0]?.id;
    if (args.code && !slideId) {
      const sess = await httpJson("GET", `${base}/api/sessions/${code}`);
      slideId = sess.json?.session?.slides?.[0]?.id;
    }
    if (!code || !slideId) throw new Error("Session unvollständig");

    const wsBase = wsUrlFromBase(base);

    /** Join + Vote über dieselbe WS-Verbindung (wie echte Teilnehmer). */
    async function joinAndVote(clientId) {
      const t0Join = performance.now();
      const ws = new WebSocket(wsBase);
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

    if (args.durationMinutes > 0) {
      const endAt = Date.now() + args.durationMinutes * 60 * 1000;
      let tick = 0;
      let lastHealthSample = 0;
      const runtimeSamples = [];

      while (Date.now() < endAt) {
        const slice = Math.min(batch, args.participants);
        const jobs = [];
        for (let i = 0; i < slice; i++) {
          jobs.push(
            joinAndVote(`dur-${tick}-${i}`).catch(() => ({ joinMs: 0, voteMs: 0, ok: false }))
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
        tick += 1;
        if (Date.now() - lastHealthSample >= args.healthSampleSec * 1000) {
          lastHealthSample = Date.now();
          try {
            const r = await httpJson("GET", `${base}/api/health`);
            if (r.ok) {
              healthLatencies.push(r.ms);
              runtimeSamples.push({
                at: new Date().toISOString(),
                eventLoopLagMs: r.json?.eventLoopLagMs ?? null,
                rssMb: r.json?.memory?.rssMb ?? null,
                heapUsedMb: r.json?.memory?.heapUsedMb ?? null,
              });
            }
          } catch {
            errors += 1;
          }
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      reportDurationSamples = runtimeSamples;
    } else {
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
    }

    if (args.durationMinutes <= 0) {
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
    }

    for (let h = 0; h < 20; h++) {
      const r = await httpJson("GET", `${base}/api/health`);
      if (r.ok) healthLatencies.push(r.ms);
    }

    const lastHealth = await httpJson("GET", `${base}/api/health`);
    const readyProbe = await httpJson("GET", `${base}/api/health/ready`);
    const mem = lastHealth.json?.memory || {};
    const runtime = {
      eventLoopLagMs: lastHealth.json?.eventLoopLagMs ?? null,
      rssMb: mem.rssMb ?? null,
      heapUsedMb: mem.heapUsedMb ?? null,
      dbLatencyMs: lastHealth.json?.dependencies?.db?.latencyMs ?? null,
      readinessReady: readyProbe.json?.ok ?? lastHealth.json?.readiness?.ready ?? null,
      operationMode: lastHealth.json?.operation?.mode ?? null,
    };

    joinLatencies.sort((a, b) => a - b);
    voteLatencies.sort((a, b) => a - b);
    healthLatencies.sort((a, b) => a - b);

    const errorRate = attempts > 0 ? errors / attempts : 0;
    const report = {
      at: new Date().toISOString(),
      target: base,
      mode: runtime.operationMode || env.PULSE_OPERATION_MODE || "single",
      participants: args.participants,
      votesPerParticipant: args.votes,
      durationMinutes: args.durationMinutes || null,
      isolated: !args.skipSpawn,
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
      runtime,
      durationSamples: reportDurationSamples.length ? reportDurationSamples : undefined,
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
    if (!args.skipSpawn) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* temp */
      }
    }
  }
})().catch((err) => {
  console.error("load-test fehlgeschlagen:", err.message);
  process.exit(1);
});
