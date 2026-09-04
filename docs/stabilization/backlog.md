# Fehler-Backlog — Stabilisierungszyklus

Stand: Feature-Freeze Start · Basis v1.4.6 · Branch `stabilization/feature-freeze`

Legende: **P0** Blocker · **P1** Kritisch · **P2** Hoch · **P3** Mittel/Niedrig · **OBS** Beobachtung

---

## P0 — Blocker

| ID | Thema | Beschreibung | Status | Fix/Notiz |
|----|-------|--------------|--------|-----------|
| B-001 | Auth | Klick „Administration“ ohne sichtbare Reaktion | **behoben (lokal)** | nav59: Modal-Fallback, Route-Trigger, try/catch |
| B-002 | Auth | Bootstrap-Admin kann sich nicht anmelden (Prod) | **teilweise** | v1.4.9: `test:bootstrap` — VPS: `auth:diagnose` |
| B-003 | Auth | Redirect-Schleife Login ↔ Onboarding | behoben | v1.4.5: eine authClient-Instanz |
| B-004 | Rechte | Teamrechte serverseitig umgehbar | **teilweise** | `test-api-permissions.js`: fremdes Team/Event, User-Anlage |
| B-005 | Live | Antworten vor Interaktionsstart | **behoben (Unit)** | `test-interaction-state.js` + Server-Gate in applyVote |
| B-006 | Live | Falsche aktive Folie bei Reconnect | **teilweise** | v1.5.0: WS-Mock-Hintergrund-Reconnect, clamp activeSlideIndex |

---

## P1 — Kritisch

| ID | Thema | Beschreibung | Status |
|----|-------|--------------|--------|
| C-001 | Performance | Hohe Admin-Ladezeit beim ersten `#/admin` | teilweise (v1.4.4) |
| C-002 | Auth | Session-/Auth-Redirect-Schleifen | teilweise |
| C-003 | Auth | Abgelaufene Session → unklarer Zustand | **teilweise** | v1.5.0: session_expired + Login-Hinweis |
| C-004 | Auth | PIN fälschlich statt Passwort ohne SMTP | teilweise (test-auth) |
| C-005 | Auth | Passwort-Login blockiert bei SMTP-Fehler | prüfen |
| C-006 | Mobile | Startseite/Join nicht nutzbar | **teilweise** | v1.4.8: Admin-Icon sichtbar, Drawer-Fokus, Overflow |
| C-007 | Mobile | Overlays blockieren Klicks | teilweise (Modal z-index) |
| C-008 | WS | Synchronisierung fehlerhaft nach Reconnect | **teilweise** | v1.5.0: Mock gibt Server nicht auf, join erneut |
| C-009 | Security | CORS `*` bei Cookie-Auth | **behoben** | v1.4.9: lib/cors.js — nur Same-Host + Whitelist |
| B-002 | Auth | Bootstrap-Admin kann sich nicht anmelden (Prod) | **teilweise** | test:bootstrap + auth:diagnose — VPS verifizieren |
| C-010 | Cache | JS/CSS 24h Cache ohne Query-Bust nach Update | OBS — `?v=` in index.html Pflicht |

---

## P2 — Hoch

| ID | Thema | Status |
|----|-------|--------|
| H-001 | Unklare Fehlermeldungen (401/403/500) | **teilweise** | v1.5.0: HTTP 401 + session_expired |
| H-002 | 403-Ansicht für berechtigte Nutzer ohne Recht | **behoben (lokal)** | `#view-forbidden` + `canAccessAdminHash` |
| H-003 | Logout → Startseite nicht zuverlässig | **teilweise** | v1.5.0: teardownRealtime + navigate |
| H-004 | Deep Links `#/admin/*` ohne Session | in Arbeit |
| H-005 | Events ohne Team — historische Daten | teilweise |
| H-006 | Dark-Mode-Kontrast | siehe `docs/contrast.md` |
| H-007 | Admin-Listen ohne Pagination bei großen Daten | offen |

---

## P3 — Mittel / Niedrig

| ID | Thema | Status |
|----|-------|--------|
| M-001 | Visuelle Detailfehler Mobile | offen |
| M-002 | Textinkonsistenzen Hilfe/Doku | laufend |
| M-003 | Doppelter Event-Listener Administration | **behoben** (nav59) |
| M-004 | nginx ohne explizite Cache-Control für Proxy | OBS — App setzt Header |

---

## OBS — Beobachtungen

- **Version:** `package.json` 1.5.0
- **Docker:** `pulse` + `pulse-b` teilen `./data`, `.env`, `REDIS_URL` ✓
- **Update:** `update-vps-ubuntu.sh` führt `npm run css:build` aus ✓
- **Assets:** HTML `no-cache`; JS/CSS `max-age=86400` — Cache-Bust via `?v=` in `index.html` erforderlich
- **Diagnose:** `npm run auth:diagnose` vorhanden; `npm run pulse:diagnose` neu

---

## Nächste Schritte (priorisiert)

1. Admin-Login-Fix committen, testen, Release v1.4.7
2. `pulse:diagnose` auf VPS ausführen
3. Block 4: Negative Permission-Tests API
4. Block 8: Mobile Smoke 320–430 px
5. Block 11: `test:smoke` in CI/local grün
