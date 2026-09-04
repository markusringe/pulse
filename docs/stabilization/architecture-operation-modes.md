# ADR: Betriebsmodi Einzelinstanz vs. Cluster

Stand: v1.5.23 · Status: **angenommen (Stabilisierung)** · Feature-Freeze aktiv

## Kontext

Pulse kann als **ein Node-Prozess** oder als **zwei+ Container hinter nginx** betrieben werden. Ohne klare Modus-Grenzen entstehen:

- SQLite-Schreibkonflikte bei zwei Containern auf `./data`
- geteilter In-Memory-Live-State (Sessions nur pro Prozess)
- Redis-Ausfall → divergierende Stimmen/Folien zwischen `pulse` und `pulse-b`
- doppelte oder fehlende Broadcasts

Implementierung: `lib/operationMode.js`, Startprüfung in `server.js`, Diagnose in `/api/health`.

## Entscheidung

### Modus 1 — Einzelinstanz (`single`)

| Aspekt | Vorgabe |
|--------|---------|
| Prozesse | Genau **1** App-Container oder `npm start` |
| Persistenz | **SQLite** (Standard) oder PostgreSQL |
| Redis | **Optional** — ohne `REDIS_URL` In-Process-Bus |
| Einsatz | Kleine/mittlere Veranstaltungen, Dev, einfache VPS-Installation |
| Compose | `docker compose -f docker-compose.single.yml up -d` |

Env: `PULSE_OPERATION_MODE=single`, `PULSE_EXPECT_INSTANCES=1`, `REDIS_URL` leer.

### Modus 2 — Cluster (`cluster`)

| Aspekt | Vorgabe |
|--------|---------|
| Prozesse | **2+** (`pulse`, `pulse-b`, …) |
| Persistenz | **PostgreSQL** (`DATABASE_URL`) — SQLite **blockiert** (Prod) |
| Redis | **Pflicht** (`REDIS_URL`) für Live-Fanout |
| Proxy | nginx **`ip_hash`** (Sticky Sessions für WS) |
| Einsatz | Hohe Teilnehmerzahl, HA, Compose-Standard |
| Compose | `docker-compose.yml` |

Env: `PULSE_OPERATION_MODE=cluster`, `PULSE_EXPECT_INSTANCES=2`, `DATABASE_URL`, `REDIS_URL`.

**Übergang:** `PULSE_ALLOW_SQLITE_CLUSTER=1` erlaubt SQLite+Cluster nur mit **degraded**-Warnung (bestehende Installationen). Für Produktion entfernen und PostgreSQL migrieren.

## Startverhalten

- **Blockiert** (Exit 1): Cluster + SQLite + strict (Prod oder expliziter Cluster-Modus ohne Allow-Flag).
- **Degraded** (Start OK, Warnung): Cluster + SQLite mit `PULSE_ALLOW_SQLITE_CLUSTER=1`.
- **Readiness** (`GET /api/health/ready`): HTTP 503 wenn kritische Checks fehlschlagen.

## Phase 2 — Live stateVersion (v1.5.8)

Implementiert — siehe `docs/stabilization/adr-state-version.md` und `lib/sessionVersion.js`.

- Monotone `stateVersion` pro Session
- Optimistic concurrency auf Presenter-Aktionen
- Clients ignorieren stale Broadcasts

## Risiken (verbleibend)

| ID | Risiko | Maßnahme |
|----|--------|----------|
| R-001 | Compose-Default noch SQLite+2 Container | Postgres-Service + Migration dokumentieren |
| R-002 | Kein `stateVersion` — parallele Presenter-Tabs | **behoben** v1.5.8 |
| R-003 | Asset-Cache-Busting manuell (`?v=`) | **behoben** v1.5.9–v1.5.10 Content-Hash `?h=` |
| R-004 | Update ohne Rollback bei Ready-Fail | **behoben** v1.5.11 `pulse-app:`-Tags + auto-Rollback |

## Referenzen

- `docker-compose.yml`, `docker-compose.single.yml`
- `lib/operationMode.js`, `scripts/test-operation-mode.js`
- `docs/stabilization/operations-runbook.md`
