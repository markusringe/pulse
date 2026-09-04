# Operations-Runbook — Pulse v1.5.11

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
| `GET /api/health/ready` | Readiness (DB R/W, Redis, Modus, Manifest, kein Update/Restore) | 200 mit `"ok":true` oder **503** |
| `GET /metrics` | Prometheus (intern) | Nur aus vertrauenswürdigem Netz |

### Readiness-Felder (Auszug)

- `operation.mode`: `single` | `cluster`
- `operation.instanceId`: Bus-Instanz (kein Secret)
- `readiness.degraded`: true = läuft, aber Konfigurationswarnung (z. B. SQLite im Cluster)
- `readiness.checks[]` — u. a. `db_readwrite`, `asset_manifest`, `update_in_progress`, `restore_in_progress`
- `dependencies.db.latencyMs`, `eventLoopLagMs`
- Prometheus: `pulse_readiness`, `pulse_degraded`, `pulse_event_loop_lag_ms`

## Diagnose-Befehle

```bash
# Container
docker compose ps
docker compose logs -f pulse pulse-b nginx redis
docker images | grep pulse-app

# In-App (ohne Secrets)
docker exec pulse-pulse-1 node scripts/diagnose-pulse.js
curl -sS https://<domain>/api/health | jq .
curl -sS https://<domain>/api/health/ready | jq '{ok, checks: [.checks[]|{id,ok}]}'
npm run smoke:remote -- --url https://<domain> --expect-version 1.5.11
```

## Incident: Live-State divergiert (zwei Container)

1. `curl /api/health` auf **beiden** Instanzen — gleiche `version`?
2. Redis: `docker compose exec redis redis-cli ping`
3. nginx: `ip_hash` aktiv? Query-String `?h=` **nicht** strippen (`deploy/nginx.conf`)
4. SQLite im Cluster? → **PostgreSQL migrieren**, `PULSE_ALLOW_SQLITE_CLUSTER` entfernen
5. Kurzfristig: auf **Einzelinstanz** wechseln (`docker-compose.single.yml`)

## Incident: Redis ausgefallen (Cluster)

- Symptom: Stimmen/Folien nur auf einer Instanz sichtbar
- Readiness: `/api/health/ready` → 503
- Maßnahme: Redis neu starten; bei anhaltendem Ausfall **Wartungsmodus** / Einzelinstanz

## Update (VPS)

```bash
cd /opt/pulse
sudo ./scripts/update-vps-ubuntu.sh --tag v1.5.11 --yes
# Docker: compose build + up mit pulse-app:<version> — nicht nur Admin-UI-Update
curl -sS https://<domain>/api/health/ready | jq '{ok, version, checks: .checks|map({id,ok})}'
```

**Rollback (automatisch):** Bei Readiness-Timeout stellt der Updater v1.1 Git und `pulse-app:<vorherige-version>` wieder her.  
**Rollback (manuell):** `PULSE_IMAGE_TAG=1.5.10 docker compose up -d --no-build` nach `git checkout v1.5.10` — Pre-Update-Backup unter `backups/vps-update-*` prüfen.

## Rollback-Drill (Abnahme v1.5.11+)

Einmal pro Release-Zyklus außerhalb laufender Veranstaltungen:

```bash
cd /opt/pulse
sudo ./scripts/rollback-drill.sh --yes
cat backups/rollback-drill-*.json | tail -1
```

Erwartung: Rollback auf `pulse-app:<vorherige-version>` → Ready `ok:true` → Remote-Smoke → Wiederherstellung auf Zielversion → Protokoll `outcome: success`. Details: `docs/stabilization/smoke-checklist.md`.

---

## Incident: asset_manifest fehlgeschlagen

- Symptom: Container startet nicht (Production) oder Ready 503, Check `asset_manifest` false
- Ursache: fehlendes/kaputtes `frontend/asset-manifest.json` im Image
- Maßnahme: `npm run build` lokal prüfen, Docker-Image neu bauen, erneut deployen

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

Referenz-Baselines: `docs/stabilization/load-baseline-100.json`, `load-baseline-300.json`.

Gates: `LOAD_GATE_P95_JOIN_MS`, `LOAD_GATE_P95_VOTE_MS`, `LOAD_GATE_ERROR_RATE`.
