#!/usr/bin/env node
/**
 * Unit-Tests für Betriebsmodi (Einzelinstanz vs. Cluster).
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const operationMode = require("../lib/operationMode");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-opmode-"));
const sqlitePath = path.join(tmpData, "data", "pulse.db");
fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });

const baseEnv = { SQLITE_PATH: sqlitePath };

/* --- Modus-Auflösung --- */
assert(operationMode.resolveOperationMode({ PULSE_OPERATION_MODE: "single" }) === "single", "explicit single");
assert(operationMode.resolveOperationMode({ PULSE_OPERATION_MODE: "cluster" }) === "cluster", "explicit cluster");
assert(
  operationMode.resolveOperationMode({ REDIS_URL: "redis://localhost:6379" }) === "cluster",
  "redis → cluster"
);
assert(operationMode.resolveOperationMode({}) === "single", "default single");

/* --- Cluster + SQLite blockiert (strict) --- */
const blocked = operationMode.assessOperationConfig(
  { dbKind: "sqlite", userDbKind: "sqlite", redisOk: true, instanceId: "abc" },
  {
    PULSE_OPERATION_MODE: "cluster",
    REDIS_URL: "redis://redis:6379",
    NODE_ENV: "production",
    PULSE_EXPECT_INSTANCES: "2",
    ...baseEnv,
  }
);
assert(blocked.mode === "cluster", "cluster mode");
assert(!blocked.ready, "cluster+sqlite prod not ready");
const pgCheck = blocked.checks.find((c) => c.id === "postgres_required");
assert(pgCheck && !pgCheck.ok && pgCheck.critical, "postgres_required critical");

let threw = false;
try {
  operationMode.assertStartupAllowed(blocked);
} catch (e) {
  threw = true;
  assert(e.code === "OPERATION_MODE_BLOCKED", "blocked error code");
}
assert(threw, "startup blocked");

/* --- Legacy-Ausnahme --- */
const legacy = operationMode.assessOperationConfig(
  { dbKind: "sqlite", userDbKind: "sqlite", redisOk: true },
  {
    PULSE_OPERATION_MODE: "cluster",
    REDIS_URL: "redis://redis:6379",
    PULSE_ALLOW_SQLITE_CLUSTER: "1",
    ...baseEnv,
  }
);
assert(legacy.ready, "legacy allow sqlite cluster → degraded but ready");
assert(legacy.degraded, "legacy is degraded");

/* --- Single + SQLite OK --- */
const single = operationMode.assessOperationConfig(
  { dbKind: "sqlite", userDbKind: "sqlite" },
  { PULSE_OPERATION_MODE: "single", ...baseEnv }
);
assert(single.ready, "single sqlite ready");
assert(single.mode === "single", "single mode");

/* --- Cluster + Postgres OK --- */
const clusterPg = operationMode.assessOperationConfig(
  { dbKind: "postgres", userDbKind: "postgres", redisOk: true, instanceId: "x" },
  {
    PULSE_OPERATION_MODE: "cluster",
    REDIS_URL: "redis://redis:6379",
    DATABASE_URL: "postgres://u:p@postgres:5432/pulse",
    ...baseEnv,
  }
);
assert(clusterPg.ready, "cluster postgres ready");
assert(!clusterPg.degraded, "cluster postgres not degraded");

console.log("test-operation-mode: OK");
fs.rmSync(tmpData, { recursive: true, force: true });
