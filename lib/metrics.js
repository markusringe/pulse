/**
 * Prometheus-Textformat ohne Extra-Dependency.
 * Scrape-Ziel: GET /metrics
 */

const httpBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

const counters = {
  http: new Map(),
  wsMessages: new Map(),
  broadcasts: 0,
  batches: 0,
  votes: 0,
  words: 0,
};

const hist = httpBuckets.map(() => 0);
hist.push(0);
let histCount = 0;
let histSum = 0;

let wsConnections = 0;
let sessionsGauge = 0;
let readinessGauge = 1;
let degradedGauge = 0;
let eventLoopLagGauge = 0;
let dbLatencyGauge = 0;

function setOperationalReadiness(ready, degraded, eventLoopLagMs, dbLatencyMs) {
  readinessGauge = ready;
  degradedGauge = degraded;
  eventLoopLagGauge = eventLoopLagMs;
  dbLatencyGauge = dbLatencyMs;
}

function inc(map, key, n = 1) {
  map.set(key, (map.get(key) || 0) + n);
}

function observeHttp(method, route, status, seconds) {
  inc(counters.http, `${method}|${route}|${status}`);
  histCount += 1;
  histSum += seconds;
  let placed = false;
  for (let i = 0; i < httpBuckets.length; i++) {
    if (seconds <= httpBuckets[i]) {
      hist[i] += 1;
      placed = true;
      break;
    }
  }
  if (!placed) hist[hist.length - 1] += 1;
}

function incWs(direction, type = "other") {
  inc(counters.wsMessages, `${direction}|${type}`);
}

function setWsConnections(n) {
  wsConnections = n;
}

function setSessions(n) {
  sessionsGauge = n;
}

function render() {
  const lines = [
    "# HELP pulse_ws_connections Offene WebSocket-Verbindungen auf dieser Instanz.",
    "# TYPE pulse_ws_connections gauge",
    `pulse_ws_connections ${wsConnections}`,
    "# HELP pulse_sessions_active Persistierte bzw. im Speicher aktive Sessions.",
    "# TYPE pulse_sessions_active gauge",
    `pulse_sessions_active ${sessionsGauge}`,
    "# HELP pulse_broadcasts_total Gesendete Raum-Broadcasts (nach Batching).",
    "# TYPE pulse_broadcasts_total counter",
    `pulse_broadcasts_total ${counters.broadcasts}`,
    "# HELP pulse_batches_total Zusammengefasste Batch-Nachrichten.",
    "# TYPE pulse_batches_total counter",
    `pulse_batches_total ${counters.batches}`,
    "# HELP pulse_votes_total Gezählte Stimmen.",
    "# TYPE pulse_votes_total counter",
    `pulse_votes_total ${counters.votes}`,
    "# HELP pulse_words_total Gezählte Wörter.",
    "# TYPE pulse_words_total counter",
    `pulse_words_total ${counters.words}`,
    "# HELP pulse_readiness 1 wenn Instanz bereit für Traffic.",
    "# TYPE pulse_readiness gauge",
    `pulse_readiness ${readinessGauge}`,
    "# HELP pulse_degraded 1 wenn bereit aber eingeschränkt (Konfiguration/Lag).",
    "# TYPE pulse_degraded gauge",
    `pulse_degraded ${degradedGauge}`,
    "# HELP pulse_event_loop_lag_ms Geschätzter Eventloop-Lag.",
    "# TYPE pulse_event_loop_lag_ms gauge",
    `pulse_event_loop_lag_ms ${eventLoopLagGauge}`,
    "# HELP pulse_db_health_latency_ms Latenz der DB-Readiness-Probe.",
    "# TYPE pulse_db_health_latency_ms gauge",
    `pulse_db_health_latency_ms ${dbLatencyGauge}`,
    "# HELP pulse_ws_messages_total WebSocket-Nachrichten.",
    "# TYPE pulse_ws_messages_total counter",
  ];
  for (const [key, val] of counters.wsMessages) {
    const [direction, type] = key.split("|");
    lines.push(`pulse_ws_messages_total{direction="${direction}",type="${esc(type)}"} ${val}`);
  }
  lines.push("# HELP pulse_http_requests_total HTTP-Anfragen.");
  lines.push("# TYPE pulse_http_requests_total counter");
  for (const [key, val] of counters.http) {
    const [method, route, status] = key.split("|");
    lines.push(
      `pulse_http_requests_total{method="${method}",route="${esc(route)}",status="${status}"} ${val}`
    );
  }
  lines.push("# HELP pulse_http_request_duration_seconds Latenz der HTTP-API.");
  lines.push("# TYPE pulse_http_request_duration_seconds histogram");
  let acc = 0;
  for (let i = 0; i < httpBuckets.length; i++) {
    acc += hist[i];
    lines.push(`pulse_http_request_duration_seconds_bucket{le="${httpBuckets[i]}"} ${acc}`);
  }
  acc += hist[hist.length - 1];
  lines.push(`pulse_http_request_duration_seconds_bucket{le="+Inf"} ${acc}`);
  lines.push(`pulse_http_request_duration_seconds_sum ${histSum}`);
  lines.push(`pulse_http_request_duration_seconds_count ${histCount}`);
  return lines.join("\n") + "\n";
}

function esc(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

module.exports = {
  observeHttp,
  incWs,
  setWsConnections,
  setSessions,
  setOperationalReadiness,
  render,
  counters,
};
