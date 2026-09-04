# Stabilitätsbericht — Pulse v1.5.4

Stand: 2026-09-04 · Basis: v1.5.2-Analyse + Stabilisierungslauf bis v1.5.4 · Feature-Freeze aktiv

## Executive Summary

| Bereich | v1.5.2 Ist | v1.5.4 Stand | Nächster Schritt |
|---------|------------|--------------|------------------|
| Betriebsmodi | Nur Doku-Hinweise | **Codified** (`operationMode.js`, Start-Block) | Postgres in Compose |
| Live-State | In-Memory + Redis-Fanout, **kein stateVersion** | unverändert + Tests | Phase 2 ADR |
| Lasttests | Keine | **`scripts/load-test.js`** + Gates | CI + 300/1000 TN |
| Health | `/api/health` monolithisch | **+ live/ready**, operation, lag | startup-Phase |
| Assets | Manuelles `?v=` | unverändert | Phase 5 Hash-Build |
| Admin-Perf | Lazy teilweise | Lib-Smoke | Route-Budgets messen |

## Ist-Analyse v1.5.2 (kritisch)

### Docker / Mehrinstanz

- `docker-compose.yml`: **pulse + pulse-b** teilen `./data` → **eine SQLite-Datei** (Multi-Writer-Risiko)
- `REDIS_URL` gesetzt → Live-Fanout aktiv, aber **Sessions pro Prozess** (In-Memory)
- nginx: **`ip_hash`** korrekt für WebSocket-Sticky
- **Keine Start-Sperre** bei fehlerhafter Kombination (behoben v1.5.4)

### Live-State

- Folienwechsel, Timer, Interaktion: `interactionState.js`, `qaTimer.js`, Redis-Bus
- Reconnect: `join` liefert Session-Snapshot (v1.5.2)
- **Fehlt:** globale `stateVersion`, idempotente Presenter-Requests, stale-Broadcast-Filter

### Tests v1.5.2

- Unit/HTTP gut; **kein** Lasttest, **kein** Chaos (Redis kill, Container restart)
- Permissions-Test nutzte Prod-Email-Leak (behoben v1.5.4)

## v1.5.4 Deliverables (Freeze-konform)

| Deliverable | Datei |
|-------------|-------|
| Betriebsmodi-Logik | `lib/operationMode.js` |
| Start-Validierung | `server.js` |
| Health live/ready | `/api/health/live`, `/api/health/ready` |
| Lasttest | `scripts/load-test.js` |
| Einzelinstanz-Compose | `docker-compose.single.yml` |
| ADR Betriebsmodi | `docs/stabilization/architecture-operation-modes.md` |
| Runbook | `docs/stabilization/operations-runbook.md` |
| Release-Gates | `docs/stabilization/release-gates.md` |

## Performance-Baseline (Vorlage)

> Werte nach erstem Lauf auf Referenz-Hardware eintragen (`node scripts/load-test.js --report=...`).

| TN | Join P50 | Join P95 | Join P99 | Vote P95 | Fehlerrate | Modus |
|----|----------|----------|----------|----------|------------|-------|
| 100 | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | single |
| 300 | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | single |
| 1000 | _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ | cluster+PG |

Referenz-Hardware: _CPU/RAM/OS notieren_

## Verbleibende Risiken

| ID | Schwere | Beschreibung | Empfehlung |
|----|---------|--------------|------------|
| R-001 | **Hoch** | SQLite + 2 Container (Legacy Compose) | Postgres + `PULSE_ALLOW_SQLITE_CLUSTER` entfernen |
| R-002 | **Hoch** | Kein `stateVersion` | Phase 2 — parallele Presenter-Tabs |
| R-003 | Mittel | Asset `?v=` manuell | Phase 5 — Content-Hash-Build |
| R-004 | Mittel | Admin-Listen ohne Pagination | H-007 — serverseitig paginieren |
| R-005 | Niedrig | Eventloop-Lag nur Health-Schätzung | Prometheus-Histogramm erweitern |

## Architekturentscheidung (Empfehlung)

| Last | Modus | Begründung |
|------|-------|------------|
| ≤ 300 TN, ein Server | **Einzelinstanz** | Einfach, SQLite, kein Redis-Zwang |
| > 300 TN oder HA | **Cluster** | Postgres + Redis + nginx ip_hash |

## Akzeptanz Stabilisierungslauf (Teil 1 — v1.5.4)

- [x] Betriebsmodi dokumentiert und im Code erzwungen (Start)
- [x] Health live/ready/degraded-Grundlage
- [x] Lasttest-Skript + Release-Gates definiert
- [x] Runbook + ADR
- [ ] Baseline 100/300 TN gemessen (lokal/Staging)
- [ ] Prod auf v1.5.4 + Modus explizit gesetzt
- [ ] Phase 2 stateVersion (separates Release)
