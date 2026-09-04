# Test-Audit v1.5.3 — Stabilisierungslauf

Stand: 2026-09-04 · Zielversion **v1.5.3** · Branch `main`

## Ausführung

```bash
# Empfohlen: Node 22 LTS (package.json engines >=22)
npm test
npm run test:smoke
npm run test:auth        # Unit + HTTP
npm run test:permissions
npm run test:reconnect
```

## Ergebnis Unit-/Lib-Tests (ohne Server-Spawn)

| Skript | Status | Anmerkung |
|--------|--------|-----------|
| test-security.js | ✓ | IP-Sperre explizit aktivieren für Cap-Test |
| test-interaction-state.js | ✓ | Regression B-005/B-007 |
| test-events.js | ✓ | teamId für Aktivierung |
| test-event-team-access.js | ✓ | nodeAssert.throws |
| test-auth.js | ✓ | Team-basierte eventAccess |
| test-bootstrap.js | ✓ | |
| test-help.js | ✓ | Katalog v10 |
| test-branding.js | ✓ | Live-branding optional |
| test-routes.js | ✓ | Open-Redirect |
| test-reconnect-sync.js | ✓ | |

## HTTP-/WebSocket-Integration

| Skript | Abdeckung | Risiko |
|--------|-----------|--------|
| test-smoke.js | Health, auth/status, Static, Cache | Ephemerer Port, isoliertes cwd |
| test-auth-http.js | Login, 401, Logout, PIN+Admin-PW | Neu v1.5.3 |
| test-api-permissions.js | 401/403, Teams, Session-Folie | events.json Backup |
| test-ws-reconnect.js | WS join nach Reconnect | stdio ignore, SIGKILL cleanup |
| test-cors.js | CORS ohne Wildcard | |

**Hinweis:** Server-Spawn-Tests dürfen **nicht** gegen Port 3000 oder Prod-`data/` laufen. Gemeinsame Hilfe: `scripts/test-server-env.js` (isoliertes cwd, `DATABASE_URL`/`REDIS_URL` leer).

## Fehlende / geplante Tests

| Bereich | Lücke | Priorität |
|---------|-------|-----------|
| A Admin-Klick/Routing | Nur Unit (`test-routes`); Browser E2E fehlt | P1 manuell |
| B Bootstrap Docker | Kein docker-compose Integrationstest | P2 |
| D Stage read-only WS | Kein automatisierter Stage-join-Test | P1 |
| E Redis Zwei-Container | Nur Unit bus; kein CI Redis | P2 manuell |
| F Admin-Route Performance | Nur Lib-Smoke `test-performance` | P1 |
| G Mobile | `test-mobile-layout` statisch; keine Browser | P1 manuell |
| H Backup Zip-Slip | `test-backups` vorhanden; Restore E2E begrenzt | P2 |

## Behobene Test-Regressionen (v1.5.3)

1. **test-security.js** — Default `IP_BLOCK=0`: Cap-Test setzt `setIpBlockEnabled(true)`.
2. **test-interaction-state.js** — Produktbug: `applyAction('start')` schrieb in stale `ix` nach `normalizeSlide`.
3. **test-events.js** — Events benötigen `teamId` vor Aktivierung.
4. **test-event-team-access.js** — `assert.throws` → `nodeAssert.throws`.
5. **test-auth.js** — Owner-Zugriff nur noch über Team-Kontext.
6. **test-help.js** / **test-branding.js** — Version/Live-Daten entkoppelt.

## Produktfix v1.5.3 (lib/interactionState.js)

| ID | Symptom | Ursache | Fix |
|----|---------|---------|-----|
| B-007 | „Interaktion starten“ ohne Wirkung; Eingaben blockiert | `normalizeSlide` ersetzte Objekt; `applyAction` mutierte alte Referenz | `Object.assign` in-place |
| B-007b | Timer-Ende nicht persistiert | `finalizeSlide` brach bei computed `ended` ab | Nur skip wenn `state === 'ended'` |
| B-007c | `onTimerExpired` lieferte null | `effectiveState` ohne `now`-Parameter | Prüfung über `endsAt` + `now` |

Regression: `npm run test:interaction-state` bzw. `scripts/test-interaction-state.js`.

## Manuelle Smoke

Siehe `docs/stabilization/smoke-checklist.md` (aktualisiert v1.5.3).

## Nächster Stabilitätsrelease

Erst nach: alle Tests grün lokal (Node 22), Prod v1.5.3 deployt, Smoke-Checkliste abgehakt → Tag **v1.5.3**.
