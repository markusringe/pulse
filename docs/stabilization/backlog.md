# Fehler-Backlog — Stabilisierungszyklus

Stand: v1.5.31 · Prod **v1.5.31** (single, ready) · Branch `main`

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
| B-009 | Ops | SQLite + 2 Container ohne Startwarnung | **behoben** | v1.5.4/5: operationMode block/warn + Compose-Flags |
| B-010 | Update | Docker: Admin-UI-Update ohne Image-Rebuild | **behoben** | Admin-Install/Rollback in Docker blockiert; Hinweis `update-vps-ubuntu.sh` |
| B-011 | Join | „Das hat nicht geklappt“ beim Öffnen Join-Link | **behoben** | v1.5.26–27: WS-Join + deriveStatus; `test-event-join-planned.js`, `test-join-live-remote.js` |

---

## P1 — Kritisch

| ID | Thema | Beschreibung | Status |
|----|-------|--------------|--------|
| C-001 | Performance | Hohe Admin-Ladezeit beim ersten `#/admin` | teilweise (v1.4.4) |
| C-002 | Auth | Session-/Auth-Redirect-Schleifen | **teilweise** | v1.5.1 Login; Deep-Link nav63 |
| C-003 | Auth | Abgelaufene Session → unklarer Zustand | **teilweise** | v1.5.0: session_expired |
| C-004 | Auth | PIN fälschlich statt Passwort ohne SMTP | teilweise (test-auth) |
| C-005 | Auth | Passwort-Login blockiert bei SMTP-Fehler | prüfen |
| C-006 | Mobile | Startseite/Join nicht nutzbar | **teilweise** | v1.4.8 Layout; v1.5.21–26 Sync/Fehlerbanner |
| C-007 | Mobile | Overlays blockieren Klicks | teilweise |
| C-008 | WS | Synchronisierung fehlerhaft nach Reconnect | **teilweise** | v1.5.0 Mock-Reconnect + WS-Integrationstest |
| C-009 | Security | CORS `*` bei Cookie-Auth | **behoben** | v1.4.9 |
| C-010 | Cache | JS/CSS 24h Cache ohne Query-Bust | **behoben** | Phase 5: Content-Hash `?h=`, ADR, `test:asset-manifest` |
| C-011 | Live | Kein stateVersion — parallele Presenter-Konflikte | **behoben** | Phase 2: `lib/sessionVersion.js`, ADR, Tests |
| C-012 | Ops | Kein reproduzierbarer Lasttest | **behoben** | v1.5.5: `load-test.js` + Gates + `--url` |
| C-013 | Ops | Readiness ohne DB-R/W und Wartungs-Flags | **behoben** | v1.5.5 Audit: healthCheck, maintenance, restore |
| C-014 | Ops | Update ohne atomaren Rollback bei Ready-Fail | **behoben** | v1.5.11: `pulse-app:`-Tags, auto-Rollback, `test:update-rollback` |
| C-015 | Join | Generische Fehlermeldung statt Server-Hinweis | **behoben** | v1.5.25–26: `explainServerError`, `eventMeta.status` |

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
| B-009, C-012, C-013 | **v1.5.5** | test-operation-mode, load-test, test-health-readiness |
| C-009 | v1.4.9 | test-cors.js |
| H-002 | v1.4.7 | test-routes |

---

## OBS — Beobachtungen

- **Version:** `package.json` **1.5.31** · Prod: **v1.5.31**
- **Live-Demo:** Event `241184` — `node scripts/prepare-live-demo.js` + Container-Neustart
- **Remote-Tests:** `node scripts/smoke-remote-url.js --expect-version 1.5.27` · `node scripts/test-join-live-remote.js --vote`
- **Last-Baseline:** `load-baseline-100.json`, `load-baseline-300.json` (lokal, Single, Gates grün)
- **Betriebsmodi:** ADR `docs/stabilization/architecture-operation-modes.md`
- **Lasttest:** `npm run load-test` · Gates in `release-gates.md`
- **Docker:** `pulse` + `pulse-b` teilen `./data`, `.env`, `REDIS_URL` ✓
- **Diagnose:** `docker exec pulse-pulse-1 npm run pulse:diagnose` (Skripte im Image ab v1.5.0)

---

## Nächste Schritte (priorisiert)

1. ~~**v1.5.7** deployen + `migrate-vps-single.sh --yes`~~ — **erledigt** (Prod single, 2026-09-04)
2. ~~Last-Baseline 300 TN dokumentieren~~ — **erledigt** (`load-baseline-300.json`)
3. ~~Phase 2: stateVersion (C-011)~~ — **erledigt** (v1.5.8, ADR `adr-state-version.md`)
4. ~~Phase 5: Content-Hash Assets (C-010)~~ — **erledigt** (v1.5.9–v1.5.10, ADR `adr-asset-content-hash.md`)
5. ~~Phase 6: Update/Rollback (C-014)~~ — **erledigt** (v1.5.11, `test:update-rollback`)
6. ~~Smoke-Checkliste manuell abhaken (`smoke-checklist.md`)~~ — **teilweise** (2026-09-04, s. Checkliste — Admin/Rollen offen wegen PIN-Mail)
7. ~~**v1.5.11** auf Prod deployen~~ — **erledigt** (2026-09-04, Remote-Smoke 16/16)
8. ~~Rollback-Drill auf Prod~~ — **erledigt** (2026-09-04)
9. ~~Automatisierte Stabilisierungs-Abnahme~~ — **erledigt** (`acceptance:stabilization` 2026-09-04)
10. Browser-Pflichtpfad 19 Schritte + iOS/Android (manuell)
11. Last-Dauerläufe 30/45 min (`npm run load:scenarios:full`)
12. SSH-Key auf VPS rotieren (Key im Chat exponiert)
