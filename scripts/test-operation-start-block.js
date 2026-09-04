#!/usr/bin/env node
/**
 * Server-Start blockiert bei ungültiger Cluster-Konfiguration (SQLite + Prod).
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const { pickPort, serverTestEnv } = require("./test-server-env");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-start-block-"));
  const sqlitePath = path.join(tmpData, "pulse.db");
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });

  const port = pickPort();
  const env = serverTestEnv({
    PORT: String(port),
    SQLITE_PATH: sqlitePath,
    NODE_ENV: "production",
    PULSE_OPERATION_MODE: "cluster",
    REDIS_URL: "redis://127.0.0.1:6379",
    PULSE_EXPECT_INSTANCES: "2",
    USER_AUTH_ENABLED: "0",
  });

  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    cwd: tmpData,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (c) => {
    stderr += c.toString();
  });

  const exitCode = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      resolve(null);
    }, 8000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });

  assert(exitCode === 1, `Server soll mit Exit 1 stoppen (war ${exitCode})`);
  assert(/OPERATION_MODE|blockiert|PostgreSQL/i.test(stderr), "Fehlermeldung Cluster/SQLite");

  console.log("test-operation-start-block: OK");
  fs.rmSync(tmpData, { recursive: true, force: true });
})().catch((err) => {
  console.error("test-operation-start-block fehlgeschlagen:", err.message);
  process.exit(1);
});
