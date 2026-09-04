# Operations-Runbook — Pulse v1.5.5 (Audit)

Kurzanleitung für Betrieb, Diagnose und Incident Response. **Keine Secrets in Logs/Konsole.**

## Betriebsmodi wählen

| Szenario | Compose / Start | Env |
|----------|-----------------|-----|
| Ein Veranstaltungsserver, ≤ ca. 300 TN | `docker compose -f docker-compose.single.yml up -d` | `PULSE_OPERATION_MODE=single` |
| Zwei Instanzen + Redis (Compose-Standard) | `docker compose up -d` | `PULSE_OPERATION_MODE=cluster`, `DATABASE_URL` (Postgres empfohlen) |

## Health-Endpunkte

| Endpoint | Zweck | Erwartung |
|----------|-------|-----------|
| `GET /api/health` | Vollständiger Status | 200, `operation.mode`, `readiness` |
| `GET /api/health/live` | Liveness (Prozess lebt) | 200 `{ ok: true }` |
| `GET /api/health/ready` | Readiness (DB R/W, Redis, Modus, kein Update/Restore) | 200 oder **503** |
| `GET /metrics` | Prometheus (intern) | Nur aus vertrauenswürdigem Netz |

### Readiness-Felder (Auszug)

- `operation.mode`: `single` | `cluster`
- `operation.instanceId`: Bus-Instanz (kein Secret)
- `readiness.degraded`: true = läuft, aber Konfigurationswarnung (z. B. SQLite im Cluster)
- `readiness.checks[]` — u. a. `db_readwrite`, `update_in_progress`, `restore_in_progress`
- `dependencies.db.latencyMs`, `eventLoopLagMs`
- Prometheus: `pulse_readiness`, `pulse_degraded`, `pulse_event_loop_lag_ms`

## Diagnose-Befehle

```bash
# Container
docker compose ps
docker compose logs -f pulse pulse-b nginx redis

# In-App (ohne Secrets)
docker exec pulse-pulse-1 node scripts/diagnose-pulse.js
curl -sS https://<domain>/api/health | jq .
curl -sS https://<domain>/api/health/ready
```

## Incident: Live-State divergiert (zwei Container)

1. `curl /api/health` auf **beiden** Instanzen — gleiche `version`?
2. Redis: `docker compose exec redis redis-cli ping`
3. nginx: `ip_hash` aktiv? (`deploy/nginx.conf`)
4. SQLite im Cluster? → **PostgreSQL migrieren**, `PULSE_ALLOW_SQLITE_CLUSTER` entfernen
5. Kurzfristig: auf **Einzelinstanz** wechseln (`docker-compose.single.yml`)

## Incident: Redis ausgefallen (Cluster)

- Symptom: Stimmen/Folien nur auf einer Instanz sichtbar
- Readiness: `/api/health/ready` → 503
- Maßnahme: Redis neu starten; bei anhaltendem Ausfall **Wartungsmodus** / Einzelinstanz

## Update (VPS)

```bash
cd /opt/pulse
sudo ./scripts/update-vps-ubuntu.sh --tag v1.5.5 --yes
# Docker: Skript führt compose build + up aus — nicht nur Admin-UI-Update
curl -sS https://<domain>/api/health/ready | jq '{ok, operation, checks: .checks|map({id,ok})}'
```

Rollback: vorheriges Tag + `./scripts/update-vps-ubuntu.sh --tag v1.5.3 --yes` (Pre-Update-Backup prüfen).

## Backup / Restore

- Vollbackup: Admin → Backups oder `npm run` Skripte
- Vor Restore: automatisches Pre-Restore-Backup
- Restore-Probe: isolierte Testinstanz (siehe `scripts/test-backups.js`)

## Monitoring (Prometheus/Grafana)

- Compose-Profile: `prometheus`, `grafana` (Port 3001)
- Dashboard: `deploy/grafana/dashboards/`
- Alerts: siehe `docs/stabilization/release-gates.md`

## Lasttest (Staging)

```bash
node scripts/load-test.js --participants=100 --report=docs/stabilization/load-baseline-100.json
node scripts/load-test.js --participants=300 --report=docs/stabilization/load-baseline-300.json
```

Referenz-Baselines: `docs/stabilization/load-baseline-100.json`, `load-baseline-300.json` (v1.5.7, Single, Gates grün).

Gates: `LOAD_GATE_P95_JOIN_MS`, `LOAD_GATE_P95_VOTE_MS`, `LOAD_GATE_ERROR_RATE`.
