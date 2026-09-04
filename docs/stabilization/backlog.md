# Fehler-Backlog — Stabilisierungszyklus

Stand: v1.5.1 · Prod login ✓ · Branch `main`

Legende: **P0** Blocker · **P1** Kritisch · **P2** Hoch · **P3** Mittel/Niedrig · **OBS** Beobachtung

---

## P0 — Blocker

| ID | Thema | Beschreibung | Status | Fix/Notiz |
|----|-------|--------------|--------|-----------|
| B-001 | Auth | Klick „Administration“ ohne sichtbare Reaktion | **behoben** | nav59: Modal-Fallback, Route-Trigger |
| B-002 | Auth | Bootstrap-Admin kann sich nicht anmelden (Prod) | **behoben** | v1.5.1: authClient nav62 + sync:install-password |
| B-003 | Auth | Redirect-Schleife Login ↔ Onboarding | **behoben** | v1.4.5 / v1.5.1 |
| B-004 | Rechte | Teamrechte serverseitig umgehbar | **teilweise** | `test-api-permissions.js` |
| B-005 | Live | Antworten vor Interaktionsstart | **behoben (Unit)** | `test-interaction-state.js` |
| B-006 | Live | Falsche aktive Folie bei Reconnect | **teilweise** | v1.5.0 + join sofort bei WS-open (nav63) |

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
| C-008 | WS | Synchronisierung fehlerhaft nach Reconnect | **teilweise** | v1.5.0 Mock-Reconnect |
| C-009 | Security | CORS `*` bei Cookie-Auth | **behoben** | v1.4.9 |
| C-010 | Cache | JS/CSS 24h Cache ohne Query-Bust | OBS — `?v=` in index.html |

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

## OBS — Beobachtungen

- **Version:** `package.json` 1.5.1 · Prod `app.js?v=nav62` (nav63 nach Deploy)
- **Docker:** `pulse` + `pulse-b` teilen `./data`, `.env`, `REDIS_URL` ✓
- **Diagnose:** `docker exec pulse-pulse-1 npm run pulse:diagnose` (Skripte im Image ab v1.5.0)

---

## Nächste Schritte (priorisiert)

1. v1.5.2 deployen (Deep-Link + Reconnect-join)
2. Smoke-Checkliste Live-Reconnect manuell (Presenter + Join)
3. Block 4: Permission-Tests erweitern
4. Mobile Smoke 320–430 px
5. Freeze-Abschluss: `docs/feature-freeze.md` Kriterien abhaken
