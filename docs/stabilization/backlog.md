# Fehler-Backlog — Stabilisierungszyklus

Stand: v1.5.4 · Prod Deploy v1.5.4 ausstehend · Branch `main`

Legende: **P0** Blocker · **P1** Kritisch · **P2** Hoch · **P3** Mittel/Niedrig · **OBS** Beobachtung

---

## P0 — Blocker

| ID | Thema | Beschreibung | Status | Fix/Notiz |
|----|-------|--------------|--------|-----------|
| B-001 | Auth | Klick „Administration“ ohne sichtbare Reaktion | **behoben** | nav59: Modal-Fallback, Route-Trigger |
| B-002 | Auth | Bootstrap-Admin kann sich nicht anmelden (Prod) | **behoben** | v1.5.1: authClient nav62 + sync:install-password |
| B-003 | Auth | Redirect-Schleife Login ↔ Onboarding | **behoben** | v1.4.5 / v1.5.1 |
| B-004 | Rechte | Teamrechte serverseitig umgehbar | **teilweise** | `test-api-permissions.js` (+ Session/Viewer/Branding) |
| B-005 | Live | Antworten vor Interaktionsstart | **behoben** | v1.5.3: interactionState in-place + test-interaction-state |
| B-006 | Live | Falsche aktive Folie bei Reconnect | **teilweise** | v1.5.0 clamp + v1.5.2 join; `test-ws-reconnect.js` |
| B-007 | Live | „Interaktion starten“ ohne serverseitige Wirkung | **behoben** | v1.5.3: stale ix nach normalizeSlide |
| B-008 | Update | loadState/effectiveRepo Endlosrekursion | **behoben** | v1.5.3: readStoredRepo + emptyConfig |
| B-009 | Ops | SQLite + 2 Container ohne Startwarnung | **teilweise** | v1.5.4: operationMode block/warn + Compose-Flags |

---

## P1 — Kritisch

| ID | Thema | Beschreibung | Status |
|----|-------|--------------|--------|
| C-001 | Performance | Hohe Admin-Ladezeit beim ersten `#/admin` | teilweise (v1.4.4) |
| C-002 | Auth | Session-/Auth-Redirect-Schleifen | **teilweise** | v1.5.1 Login; Deep-Link nav63 |
| C-003 | Auth | Abgelaufene Session → unklarer Zustand | **teilweise** | v1.5.0: session_expired |
| C-004 | Auth | PIN fälschlich statt Passwort ohne SMTP | teilweise (test-auth) |
| C-005 | Auth | Passwort-Login blockiert bei SMTP-Fehler | prüfen |
| C-006 | Mobile | Startseite/Join nicht nutzbar | **teilweise** | v1.4.8 |
| C-007 | Mobile | Overlays blockieren Klicks | teilweise |
| C-008 | WS | Synchronisierung fehlerhaft nach Reconnect | **teilweise** | v1.5.0 Mock-Reconnect + WS-Integrationstest |
| C-009 | Security | CORS `*` bei Cookie-Auth | **behoben** | v1.4.9 |
| C-010 | Cache | JS/CSS 24h Cache ohne Query-Bust | OBS — Phase 5 Content-Hash |
| C-011 | Live | Kein stateVersion — parallele Presenter-Konflikte | **offen** | Phase 2 (ADR, nicht v1.5.4) |
| C-012 | Ops | Kein reproduzierbarer Lasttest | **teilweise** | v1.5.4: `scripts/load-test.js` |

---

## P2 — Hoch

| ID | Thema | Status |
|----|-------|--------|
| H-001 | Unklare Fehlermeldungen (401/403/500) | **teilweise** | v1.5.0 |
| H-002 | 403-Ansicht für berechtigte Nutzer ohne Recht | **behoben** |
| H-003 | Logout → Startseite nicht zuverlässig | **teilweise** | v1.5.0 |
| H-004 | Deep Links `#/admin/*` ohne Session | **teilweise** | nav63: consumeAdminRedirect nach Login |
| H-005 | Events ohne Team — historische Daten | teilweise |
| H-006 | Dark-Mode-Kontrast | siehe `docs/contrast.md` |
| H-007 | Admin-Listen ohne Pagination bei großen Daten | offen |

---

## P3 — Mittel / Niedrig

| ID | Thema | Status |
|----|-------|--------|
| M-001 | Visuelle Detailfehler Mobile | offen |
| M-002 | Textinkonsistenzen Hilfe/Doku | laufend |
| M-003 | Doppelter Event-Listener Administration | **behoben** |
| M-004 | nginx ohne explizite Cache-Control für Proxy | OBS |

---

## Behoben (v1.5.x)

| ID | Fix-Version | Regressionstest |
|----|-------------|-----------------|
| B-001 | v1.4.7 | manuell + nav59 |
| B-002 | v1.5.1 | test-bootstrap, auth-http |
| B-003 | v1.4.5 | test-routes |
| B-005, B-007, B-008 | **v1.5.3** | test-interaction-state.js, test-updates.js |
| B-009, C-012 | **v1.5.4** | test-operation-mode.js, load-test.js |
| C-009 | v1.4.9 | test-cors.js |
| H-002 | v1.4.7 | test-routes |

---

## OBS — Beobachtungen

- **Version:** `package.json` 1.5.4 · Prod Deploy ausstehend
- **Betriebsmodi:** ADR `docs/stabilization/architecture-operation-modes.md`
- **Lasttest:** `npm run load-test` · Gates in `release-gates.md`
- **Docker:** `pulse` + `pulse-b` teilen `./data`, `.env`, `REDIS_URL` ✓
- **Diagnose:** `docker exec pulse-pulse-1 npm run pulse:diagnose` (Skripte im Image ab v1.5.0)

---

## Nächste Schritte (priorisiert)

1. **v1.5.4** deployen + Betriebsmodus in `.env` setzen
2. Last-Baseline 100/300 TN (`load-test.js --report=`)
3. Postgres-Migration für Cluster-Compose (R-001)
4. Phase 2: stateVersion (separates Release, Freeze-Freigabe nötig)
5. Smoke-Checkliste + `/api/health/ready` auf Prod
