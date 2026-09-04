# Stabilitäts- und Performance-Audit — Pulse v1.5.5

**Datum:** 2026-09-04 · **Branch:** `main` · **Feature-Freeze:** aktiv  
**Audit-Umfang:** Betriebsmodi, Health/Readiness, Live-State, Lasttest, Update/Backup, Testisolation, Assets  
**Keine neuen Nutzerfunktionen** — nur Befund, Fixes, Tests, Ops-Doku.

---

## Executive Summary

| Bereich | Bewertung | Produktionsfreigabe |
|---------|-----------|---------------------|
| Betriebsmodi (Logik) | **Gut** — Start-Blockade, Compose-Profile | Cluster auf VPS **nicht empfohlen** (SQLite) |
| Health Live/Ready | **Gut** nach Audit-Fixes | Ready inkl. DB-R/W, Wartung, Restore |
| Live-State / stateVersion | **Unzureichend** | **Blocker Phase 2** (C-011) |
| Lasttest | **Gut** — isoliert, Gates, Report | Baseline 100/300 TN auf Staging |
| Update Docker-VPS | **Kritisch** | Admin-UI-Update **reicht nicht** — `docker compose build` |
| Backup/Restore | **Gut** — Zip-Slip abgesichert | Restore-Probe regelmäßig |
| Asset-Cache | **Unzureichend** | Content-Hash **Phase 5** (C-010) |
| Testisolation | **Gut** | Volle Suite unter Node 22 empfohlen |

**Empfehlung VPS `pulse.ringe.us`:** **`docker-compose.single.yml`** (Einzelinstanz, SQLite, kein Redis-Zwang) bis PostgreSQL migriert ist.

**Produktionsbereit:** **Nein** — siehe [Blockierende Restpunkte](#blockierende-restpunkte-vor-produktivfreigabe).

---

## Teil 1 — Betriebsmodus

### Ist-Zustand

| Modus | Konfiguration | Verhalten |
|-------|---------------|-----------|
| **single** | `PULSE_OPERATION_MODE=single`, `PULSE_EXPECT_INSTANCES=1` | SQLite OK, Redis optional, ein Prozess |
| **cluster** | `REDIS_URL`, `PULSE_EXPECT_INSTANCES=2`, Compose `pulse` + `pulse-b` | Redis Pflicht; Postgres Pflicht in Prod (strict); SQLite nur mit `PULSE_ALLOW_SQLITE_CLUSTER=1` → **degraded** |

**Implementierung:** `lib/operationMode.js` — eindeutige Modus-Auflösung, `assertStartupAllowed()` blockiert Prod+Cluster+SQLite.

### Audit-Befunde

| ID | Schwere | Befund | Maßnahme |
|----|---------|--------|----------|
| A-001 | **Hoch** | VPS läuft Cluster+SQLite (`PULSE_ALLOW_SQLITE_CLUSTER`) | Migration Single-Compose oder Postgres |
| A-002 | **Mittel** | Kein automatischer Versionsabgleich zwischen Instanzen | Ops-Checkliste (Release-Gates) |
| A-003 | **Niedrig** | nginx `ip_hash` sticky, kein Active Health-Routing | `max_fails` ergänzt; kein nginx Plus |

### Tests (neu/erweitert)

- `scripts/test-operation-mode.js` — Single, Cluster+PG, Cluster ohne Redis, Redis down, Legacy-SQLite
- `scripts/test-operation-start-block.js` — Prod-Cluster+SQLite → Exit 1

### Offen (Freeze Phase 2)

- Container-Restart während aktiver Session (Integrationstest Mehrinstanz)
- Redis-Ausfall unter Last (Staging)

---

## Teil 2 — Health & Readiness

### Ist-Zustand (nach Audit-Fixes)

| Endpoint | Semantik |
|----------|----------|
| `GET /api/health/live` | Prozess lebt — `{ ok, live, instanceId }` |
| `GET /api/health/ready` | Traffic-fähig — 200/503, `operation`, `checks` |
| `GET /api/health` | Vollstatus inkl. Auth-Metadaten (keine Secrets) |

**Readiness prüft jetzt:**

- Betriebsmodus (Redis/Postgres/SQLite-Regeln)
- **DB Lese/Schreib-Probe** (`db.healthCheck()`)
- **Update/Neustart** (`updateService.isMaintenanceBusy()`)
- **Restore** (`backupService.isRestoreInProgress()`)
- Datenverzeichnis beschreibbar
- Bootstrap abgeschlossen

**Operationalisierung:**

- Docker `HEALTHCHECK` → `/api/health/ready`
- `update-vps-ubuntu.sh` wartet auf Ready (Fallback Legacy `/api/health`)
- Prometheus: `pulse_readiness`, `pulse_degraded`, `pulse_event_loop_lag_ms`, `pulse_db_health_latency_ms`

### Audit-Befund (behoben)

| ID | Befund | Fix |
|----|--------|-----|
| A-010 | Readiness nutzte gecachte Start-Bewertung | Live-Neubewertung in `buildHealthPayload()` |
| A-011 | Keine DB-R/W-Probe | `healthCheck()` in SQLite/Postgres/JSON |
| A-012 | Update/Restore blockierten Ready nicht | Maintenance-/Restore-Flags |

### nginx-Limitierung

Open-Source-nginx leitet **nicht** nur an Ready-Instanzen — nur passives `max_fails`. Für Active Health Checks: nginx Plus oder externer LB.

---

## Teil 3 — Datenkonsistenz & Live-State

### Geprüfte Module

- `lib/interactionState.js` — B-007 behoben (stale Referenz nach `normalizeSlide`)
- `lib/liveState.js` — In-Memory + Redis-Fanout via `lib/bus.js` (Echo-Filter `instanceId`)
- Reconnect: `test-ws-reconnect.js`, `test-reconnect-sync.js`

### Kritische Lücke (unverändert — Freeze)

| ID | Thema | Risiko |
|----|-------|--------|
| **C-011** | Kein `stateVersion` / optimistische Concurrency | Parallele Presenter-Tabs können sich überschreiben |
| **C-011b** | Kein idempotentes Event-Modell | Doppelte WS-Events theoretisch möglich |

**Empfehlung:** Phase-2-Release mit ADR, Migration, Client-Filter — **nicht in v1.5.5**.

### Race-Tests vorhanden

- `test-interaction-state.js` — Start/Pause/Ende
- `test-live.js`, `test-presenter.js`
- `test-ws-reconnect.js`

---

## Teil 4 — Lasttest

### `npm run load-test`

| Kriterium | Status |
|-----------|--------|
| Isolierte Testdaten (ephemeral Port/cwd) | ✓ |
| Keine Prod ohne `--allow-remote` | ✓ |
| P50/P95/P99 Join/Vote/Health | ✓ |
| Runtime: Eventloop, RAM, DB-Latenz, Ready | ✓ (neu) |
| JSON-Report `--report=` | ✓ |
| Release-Gates + Exit ≠ 0 | ✓ |
| `--url=` für Staging | ✓ (WS nur lokal) |

**Baseline (v1.5.7, lokal, Single):**

| TN | Join P95 | Vote P95 | Fehlerrate | Report |
|----|----------|----------|------------|--------|
| 100 | 15 ms | 402 ms | 0 % | `load-baseline-100.json` |
| 300 | 15 ms | 403 ms | 0 % | `load-baseline-300.json` |

**Offen:** Wortwolke/Q&A/Quiz-Szenarien, Reconnect-Welle, Mehrinstanz-Last — Staging optional.

---

## Teil 5 — Update, Backup, Restore

### Update

| Aspekt | Befund |
|--------|--------|
| Pre-Update-Backup | ✓ (updateService, update-vps) |
| Git-Tag Checkout | ✓ |
| **Docker Image Rebuild** | **Pflicht auf VPS** — Admin-UI allein reicht nicht |
| Readiness nach Update | ✓ (update-vps wartet Ready) |
| Rekursion updateService | ✓ behoben (B-008) |

**Blocker B-010:** Docker-Deploy: Code-Update im Container ohne `docker compose build` → Rollback auf Image-Version.

### Backup/Restore

| Aspekt | Status |
|--------|--------|
| Zip-Slip-Schutz | ✓ `lib/safeZipExtract.js` |
| Dateiname-Validierung | ✓ |
| Pre-Restore-Backup | ✓ (Hooks) |
| Restore blockiert Ready | ✓ (neu) |
| Zip-Bomb / Größenlimit Upload | Teilweise (100 MB Upload-Grenze Admin) |

---

## Teil 6 — Testisolation

| Kriterium | Status |
|-----------|--------|
| `test-server-env.js` — isoliertes cwd/data | ✓ |
| Sendmail skip bei `NODE_ENV=test` | ✓ |
| Kein Port 3000 in Tests | ✓ |
| Cleanup tmpDir + SIGTERM Server | ✓ |
| Permissions-Test isoliertes cwd | ✓ |

**Hinweis:** Integrationstests gelegentlich flaky unter Node 26 — **Node 22 LTS** für CI.

---

## Teil 7 — Asset- & Cache-Konsistenz

| Aspekt | Status |
|--------|--------|
| Manuelle `?v=nav63` in index.html | **Offen (C-010)** |
| Cache-Control JS/CSS 24h | `server.js` — Risiko bei Update ohne Query-Change |
| HTML `no-cache` | ✓ |
| Content-Hash Build | **Nicht implementiert (Freeze Phase 5)** |

**Workaround bis Hash-Build:** Query-Bump bei Release + `docker compose build`.

---

## Risikomatrix

| ID | Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|----|--------|-------------------|--------|------------|
| R-001 | SQLite Multi-Writer Cluster | Hoch (VPS) | Kritisch | Single-Compose oder Postgres |
| R-002 | Kein stateVersion | Mittel | Hoch | Phase 2 |
| R-003 | Docker-Update ohne Rebuild | Hoch | Hoch | Host-Skript `update-vps-ubuntu.sh` |
| R-004 | Asset-Cache stale | Mittel | Mittel | Query-Bump / Phase 5 Hash |
| R-005 | Redis-Ausfall Cluster | Niedrig | Kritisch | Ready=503, Runbook Einzelinstanz |
| R-006 | nginx kein Active Ready | Mittel | Mittel | max_fails + manuelles Failover |

---

## Messwerte (Audit-Lauf)

| Metrik | Vor Optimierung | Nach Audit-Fixes |
|--------|-----------------|----------------|
| Readiness DB-Probe | fehlte | ~0–2 ms (SQLite lokal) |
| Health stale assessment | ja | nein (live) |
| Load-test 30 TN Error Rate | 0 % | 0 % |
| Load-test Join P95 | ~400 ms | ~350 ms (variiert) |
| Docker HEALTHCHECK | `/api/health` | `/api/health/ready` |

---

## Testbericht (Audit-Suite)

```
test-operation-mode          OK
test-operation-start-block   OK
test-health-readiness        OK
test-smoke                   OK
test-interaction-state       OK
load-test --participants=30  OK (gates passed)
```

---

## Empfehlung VPS

**Aktuell:** Cluster + SQLite + Redis auf `pulse.ringe.us` — **degraded, nicht produktionsreif für Mehrinstanz**.

**Zielkonfiguration (kurzfristig):**

```bash
cd /opt/pulse
sudo docker compose -f docker-compose.single.yml up -d --build
```

**Langfristig (Cluster):** PostgreSQL (`DATABASE_URL`), `PULSE_ALLOW_SQLITE_CLUSTER` entfernen, zwei Instanzen + Redis.

---

## Blockierende Restpunkte vor Produktivfreigabe

1. ~~**v1.5.7 auf VPS deployen**~~ — **erledigt** (2026-09-04)
2. ~~**Betriebsmodus Single auf VPS**~~ — **erledigt** (`migrate-vps-single.sh`, Prod single, nicht degraded)
3. ~~**Post-Deploy-Smoke**~~ — **erledigt** (12/12, v1.5.7)
4. ~~**Last-Baseline 100/300 TN**~~ — **erledigt** (`load-baseline-100.json`, `load-baseline-300.json`)
5. **C-011 stateVersion** — separates Release (Freeze-Freigabe, Phase 2)
6. **C-010 Content-Hash Assets** — Phase 5
7. **Manuelle Smoke-Checkliste** (`docs/stabilization/smoke-checklist.md`) — offen
8. **SSH-Key rotieren** — Key im Chat exponiert

---

## Referenzen

- ADR: `docs/stabilization/architecture-operation-modes.md`
- Runbook: `docs/stabilization/operations-runbook.md`
- Gates: `docs/stabilization/release-gates.md`
- Backlog: `docs/stabilization/backlog.md`
