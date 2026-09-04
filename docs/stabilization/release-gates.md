# Release-Gates — Stabilisierungszyklus v1.5.x

Messbare Kriterien vor Tag/Deploy. **Feature-Freeze:** nur Fixes, Tests, Ops — keine neuen Endnutzerfunktionen.

## Gate A — Automatisierte Tests (Pflicht)

| Check | Befehl | Grün wenn |
|-------|--------|-----------|
| Unit-Suite | `npm test` | Exit 0 |
| Smoke | `npm run test:smoke` | Exit 0 |
| Auth HTTP | `npm run test:auth` | Exit 0 |
| Permissions | `npm run test:permissions` | Exit 0 |
| Reconnect | `npm run test:reconnect` | Exit 0 |
| Betriebsmodi | `npm run test:operation-mode` | Exit 0 |
| Start-Blockade Cluster | `npm run test:operation-start-block` | Exit 0 |
| Health Live/Ready | `npm run test:health-readiness` | Exit 0 |
| Remote-Smoke (Prod) | `npm run smoke:remote -- --expect-version X.Y.Z` | Exit 0 |

## Gate B — Lasttest (Staging, reproduzierbar)

Skript: `scripts/load-test.js` (kein externer Prod-Dienst).

| Metrik | Standard-Gate | Env-Override |
|--------|---------------|--------------|
| P95 Join → Session-Snapshot (WS) | ≤ **800 ms** | `LOAD_GATE_P95_JOIN_MS` |
| P95 Vote → Broadcast (WS) | ≤ **500 ms** | `LOAD_GATE_P95_VOTE_MS` |
| Fehlerrate (Join+Vote) | ≤ **1 %** | `LOAD_GATE_ERROR_RATE=0.01` |
| Readiness nach Lauf | `readinessReady === true` | Report-Feld `runtime` |
| Eventloop-Lag (Health) | ≤ **200 ms** | `runtime.eventLoopLagMs` |
| Verlorene/doppelte Stimmen | **0** | Manuell / Zählvergleich |
| unhandledRejection | **0** | Server-Log |

Szenarien (mindestens):

- 100 TN — Gate B Pflicht
- 300 TN — vor größerem Release
- 1000 TN — optional, dokumentierte Hardware

```bash
node scripts/load-test.js --participants=100 --report=baseline-100.json
node scripts/load-test.js --participants=300 --report=baseline-300.json
```

## Gate C — Betriebsmodus (Prod)

| Modus | Pflicht |
|-------|---------|
| Single | `PULSE_OPERATION_MODE=single`, ein Container |
| Cluster | `DATABASE_URL` (Postgres), `REDIS_URL`, gleiche App-Version, `/api/health/ready` = 200, Check `db_readwrite` ok |

**Docker-VPS:** Update nur mit `scripts/update-vps-ubuntu.sh` + `docker compose build` — Admin-UI allein reicht nicht (B-010).

**Verboten in Prod (strict):** zwei Container + gemeinsame SQLite ohne `DATABASE_URL`.

## Gate D — Manueller Smoke

Checkliste: `docs/stabilization/smoke-checklist.md`

- Admin-Klick + Login (Desktop + Mobil 320–430 px)
- Deep-Link `#/admin/backups`
- Interaktionsstart Presenter
- WS-Reconnect (Folie synchron)

## Gate E — Performance Admin (Budgets, Ziel v1.5.5+)

| Route | Ziel P95 (ms) | Max Payload (KB) | Status v1.5.4 |
|-------|---------------|------------------|---------------|
| `#/admin` Shell | 800 | 150 | teilweise (lazy teils) |
| `#/admin/events` Liste | 600 | 200 | Pagination offen (H-007) |
| Join-Seite | 400 | 100 | OK |

Messung: Browser DevTools + `scripts/test-performance.js` (Lib-Baseline).

## Phase 2 (nicht Gate v1.5.4) — Live stateVersion

- Monotone `stateVersion` pro Session
- Optimistic concurrency auf Presenter-Aktionen
- Clients ignorieren stale Broadcasts
- **Blockiert Freeze-Abschluss v1.6** — separates ADR + Migration

## Phase 5 (nicht Gate v1.5.4) — Asset Content-Hash

- Webpack/Vite-ähnlicher Hash-Build für JS/CSS
- HTML referenziert gehashte Dateien
- Kein manuelles `?v=nav63`
- **Kein Service Worker** ohne Offline-Konzept

## Alerts (Prometheus — empfohlen)

| Alert | Bedingung |
|-------|-----------|
| PulseDown | `up{job="pulse"} == 0` |
| ReadinessFailed | HTTP 503 `/api/health/ready` |
| HighErrorRate | 5xx > 1 % / 5 min |
| EventLoopLag | `eventLoopLagMs > 200` |
| RedisDown | Cluster + Redis ping fail |
| DiskLow | `< 10 %` frei auf Data-Volume |
| BackupStale | > 48 h kein erfolgreiches Backup |
| CertExpiry | SSL < 14 Tage |

## Freigabe-Workflow

1. Gates A + B grün (CI/lokal)
2. Gate C auf Staging mit Ziel-Compose
3. Gate D manuell
4. Tag + Release Notes
5. Prod-Deploy + `npm run smoke:remote` + `/api/health/ready` (db_readwrite, operation.mode)
6. 24 h Beobachtung (Grafana/Logs)
