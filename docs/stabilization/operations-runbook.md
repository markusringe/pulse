# Operations-Runbook — Pulse v1.5.4

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
| `GET /api/health/ready` | Readiness (DB/Redis/Modus) | 200 oder **503** |
| `GET /metrics` | Prometheus (intern) | Nur aus vertrauenswürdigem Netz |

### Readiness-Felder (Auszug)

- `operation.mode`: `single` | `cluster`
- `operation.instanceId`: Bus-Instanz (kein Secret)
- `readiness.degraded`: true = läuft, aber Konfigurationswarnung (z. B. SQLite im Cluster)
- `eventLoopLagMs`, `memory.rssMb`

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
sudo ./scripts/update-vps-ubuntu.sh --tag v1.5.4 --yes
curl -sS https://<domain>/api/health | jq .version
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
node scripts/load-test.js --participants=100 --report=./load-report.json
node scripts/load-test.js --participants=300
```

Gates: `LOAD_GATE_P95_JOIN_MS`, `LOAD_GATE_P95_VOTE_MS`, `LOAD_GATE_ERROR_RATE`.
