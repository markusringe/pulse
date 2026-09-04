/**
 * Betriebsmodi: Einzelinstanz (single) vs. Cluster/Mehrinstanz (cluster).
 * Keine Secrets in Diagnoseausgaben — nur Status und Hinweise.
 */

const fs = require("fs");
const path = require("path");

/** @typedef {"single"|"cluster"} OperationMode */

/**
 * Explizites PULSE_OPERATION_MODE hat Vorrang, sonst Heuristik:
 * REDIS_URL gesetzt → Cluster-Absicht (Compose/nginx Mehrinstanz).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {OperationMode}
 */
function resolveOperationMode(env = process.env) {
  const raw = String(env.PULSE_OPERATION_MODE || "").trim().toLowerCase();
  if (raw === "single" || raw === "cluster") return raw;
  if (String(env.REDIS_URL || "").trim()) return "cluster";
  return "single";
}

/**
 * Erwartete App-Instanzen (Compose: pulse + pulse-b → 2).
 * @param {NodeJS.ProcessEnv} [env]
 */
function expectedInstances(env = process.env) {
  const n = Number(env.PULSE_EXPECT_INSTANCES);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : resolveOperationMode(env) === "cluster" ? 2 : 1;
}

/**
 * Legacy-Ausnahme: SQLite trotz Cluster (nur Entwicklung, deprecated).
 * @param {NodeJS.ProcessEnv} [env]
 */
function sqliteClusterAllowed(env = process.env) {
  return /^(1|true|yes|on)$/i.test(String(env.PULSE_ALLOW_SQLITE_CLUSTER || "").trim());
}

/**
 * Strikter Cluster-Start: Produktion blockiert SQLite+Mehrinstanz ohne Postgres.
 * @param {NodeJS.ProcessEnv} [env]
 */
function strictClusterValidation(env = process.env) {
  if (/^(0|false|off|no)$/i.test(String(env.PULSE_STRICT_CLUSTER || "").trim())) return false;
  return String(env.NODE_ENV || "").trim() === "production" || resolveOperationMode(env) === "cluster";
}

/**
 * Konfiguration und Readiness bewerten.
 * @param {object} ctx
 * @param {string} [ctx.dbKind] sessions DB (sqlite|postgres|json)
 * @param {string} [ctx.userDbKind] user DB
 * @param {boolean} [ctx.redisOk] Redis erreichbar
 * @param {string} [ctx.instanceId] Bus-Instanz-ID
 * @param {boolean} [ctx.bootstrapComplete] Bootstrap/Migration abgeschlossen
 * @param {NodeJS.ProcessEnv} [env]
 */
function assessOperationConfig(ctx = {}, env = process.env) {
  const mode = resolveOperationMode(env);
  const redisUrl = String(env.REDIS_URL || "").trim();
  const postgresUrl = String(env.DATABASE_URL || "").trim();
  const dbKind = ctx.dbKind || "sqlite";
  const userDbKind = ctx.userDbKind || dbKind;
  const expectN = expectedInstances(env);
  /** @type {Array<{id:string,ok:boolean,critical:boolean,message:string}>} */
  const checks = [];
  let ready = true;
  let degraded = false;

  if (mode === "single") {
    checks.push({
      id: "mode_single",
      ok: true,
      critical: false,
      message: "Einzelinstanzmodus — ein Prozess, SQLite erlaubt, Redis optional.",
    });
    if (expectN > 1) {
      checks.push({
        id: "instance_count",
        ok: false,
        critical: false,
        message: `PULSE_EXPECT_INSTANCES=${expectN} widerspricht Einzelinstanzmodus.`,
      });
      degraded = true;
    }
    if (redisUrl && ctx.redisOk === false) {
      checks.push({
        id: "redis_optional",
        ok: false,
        critical: false,
        message: "REDIS_URL gesetzt, Redis nicht erreichbar — Live-Fanout eingeschränkt.",
      });
      degraded = true;
    }
  } else {
    /* Cluster-Modus */
    checks.push({
      id: "mode_cluster",
      ok: true,
      critical: false,
      message: "Cluster-Modus — Redis und PostgreSQL erforderlich bei Mehrinstanz.",
    });

    if (!redisUrl) {
      checks.push({
        id: "redis_required",
        ok: false,
        critical: true,
        message: "Cluster-Modus: REDIS_URL fehlt — Live-Fanout zwischen Instanzen nicht möglich.",
      });
      ready = false;
    } else if (ctx.redisOk === false) {
      checks.push({
        id: "redis_ping",
        ok: false,
        critical: true,
        message: "Cluster-Modus: Redis nicht erreichbar.",
      });
      ready = false;
    } else if (ctx.redisOk === true) {
      checks.push({
        id: "redis_ping",
        ok: true,
        critical: false,
        message: "Redis erreichbar.",
      });
    }

    const postgresConfigured = postgresUrl.startsWith("postgres");
    const usesSqlite = dbKind === "sqlite" || userDbKind === "sqlite";

    if (!postgresConfigured && usesSqlite) {
      const allowLegacy = sqliteClusterAllowed(env);
      const critical = strictClusterValidation(env) && !allowLegacy;
      checks.push({
        id: "postgres_required",
        ok: !critical,
        critical,
        message: critical
          ? "Cluster-Modus: gemeinsame SQLite-Datei bei mehreren Containern ist blockiert — DATABASE_URL (PostgreSQL) setzen."
          : "WARNUNG: SQLite im Cluster — Schreibkonflikte möglich. DATABASE_URL (PostgreSQL) für Produktion setzen.",
      });
      if (critical) ready = false;
      else degraded = true;
    } else if (postgresConfigured && (dbKind !== "postgres" || userDbKind !== "postgres")) {
      checks.push({
        id: "postgres_connect",
        ok: false,
        critical: true,
        message: "DATABASE_URL gesetzt, aber Persistenz läuft nicht auf PostgreSQL — pg installiert?",
      });
      ready = false;
    } else if (postgresConfigured) {
      checks.push({
        id: "postgres",
        ok: true,
        critical: false,
        message: "PostgreSQL als Persistenz aktiv.",
      });
    }

    if (expectN >= 2 && usesSqlite && !postgresConfigured) {
      checks.push({
        id: "sqlite_multi_writer",
        ok: false,
        critical: strictClusterValidation(env) && !sqliteClusterAllowed(env),
        message:
          "Zwei oder mehr App-Instanzen teilen sich SQLite — Datenbanklocks und inkonsistenter Live-State drohen.",
      });
      if (checks[checks.length - 1].critical) ready = false;
    }
  }

  if (ctx.bootstrapComplete === false) {
    checks.push({
      id: "bootstrap",
      ok: false,
      critical: true,
      message: "Bootstrap/Migration noch nicht abgeschlossen.",
    });
    ready = false;
  }

  const dataDir = env.SQLITE_PATH
    ? path.dirname(env.SQLITE_PATH)
    : path.join(process.cwd(), "data");
  try {
    fs.accessSync(dataDir, fs.constants.W_OK);
    checks.push({ id: "data_writable", ok: true, critical: false, message: "Datenverzeichnis beschreibbar." });
  } catch {
    checks.push({
      id: "data_writable",
      ok: false,
      critical: true,
      message: "Datenverzeichnis nicht beschreibbar.",
    });
    ready = false;
  }

  return {
    mode,
    expectedInstances: expectN,
    ready,
    degraded: degraded && ready,
    strictCluster: strictClusterValidation(env),
    checks,
    instanceId: ctx.instanceId || null,
    dbKind,
    userDbKind,
    redisConfigured: Boolean(redisUrl),
    postgresConfigured: postgresUrl.startsWith("postgres"),
  };
}

/**
 * Start blockieren, wenn kritische Cluster-Anforderungen verletzt sind.
 * @param {ReturnType<typeof assessOperationConfig>} assessment
 */
function assertStartupAllowed(assessment) {
  const blockers = (assessment.checks || []).filter((c) => !c.ok && c.critical);
  if (!blockers.length) return;
  const detail = blockers.map((b) => b.message).join(" ");
  const err = new Error(`Pulse-Start blockiert (${assessment.mode}): ${detail}`);
  err.code = "OPERATION_MODE_BLOCKED";
  err.checks = blockers;
  throw err;
}

/** Öffentliche Zusammenfassung für /api/health (ohne Secrets). */
function publicSummary(assessment) {
  return {
    mode: assessment.mode,
    expectedInstances: assessment.expectedInstances,
    instanceId: assessment.instanceId,
    dbKind: assessment.dbKind,
    userDbKind: assessment.userDbKind,
    redisConfigured: assessment.redisConfigured,
    postgresConfigured: assessment.postgresConfigured,
    strictCluster: assessment.strictCluster,
  };
}

module.exports = {
  resolveOperationMode,
  expectedInstances,
  assessOperationConfig,
  assertStartupAllowed,
  publicSummary,
  sqliteClusterAllowed,
  strictClusterValidation,
};
