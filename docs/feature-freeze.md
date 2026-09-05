# Feature-Freeze — Pulse / Team Townhall

**Status:** aktiv  
**Branch:** `main` (Stabilisierung) · `stabilization/feature-freeze` (Referenz)  
**Basisversion:** 1.5.41  
**Ziel:** Stabilitätsrelease v1.5.41 (Stabilisierungszyklus, Sonderfolien-Abnahme)

## Ziel des Zyklus

Ausschließlich:

- Fehler finden und beheben
- Stabilität, Performance, Auth, Berechtigungen, Mobile, Barrierefreiheit, Sicherheit
- Tests, Diagnose, Dokumentation und Release-Prozess vervollständigen

**Keine neuen Features.** Änderungen, die wie Features wirken, nur wenn zwingend nötig, um **bestehende** Funktionen zuverlässig, sicher oder verständlich zu machen.

## Freeze-Regeln (Kurzfassung)

| Kategorie | Verboten |
|-----------|----------|
| Produkt | Neue Folientypen, Rollen, Teamhierarchien, Integrationen, KI, Reporting, Branding-Optionen |
| Technik | React/Vue/Angular/Svelte; Austausch von Node/Vanilla JS/WebSocket/Hash-Routing |
| Daten/API | Modell- oder API-Änderungen ohne Migration, Backup, Tests, Rückwärtskompatibilität |
| Auth | Änderungen ohne Security-Tests |

Erlaubt: Bugfixes, Security-/Performance-Fixes, Fehlermeldungen, Tests, Monitoring/Diagnose, Doku, A11y, kontrollierte Reparatur-Migrationen, kleine begründete Refactorings mit Tests.

## Vorgehensmodell

1. Ausgangszustand sichern (Backup, Branch)
2. Fehler reproduzieren
3. Ursache identifizieren
4. Minimalen Fix umsetzen
5. Unit-/Integrationstests ergänzen
6. Manuell Browser + Mobil
7. Regression angrenzender Funktionen
8. Dokumentation aktualisieren
9. Nächster Fehlerblock

## Arbeitspakete (Reihenfolge)

| # | Block | Status |
|---|-------|--------|
| 1 | Release- und Installationsbasis | **weitgehend** (v1.4.9–v1.5.2, Diagnose im Docker-Image) |
| 2 | Administration, Login, Routing | **weitgehend** (B-001, B-002 Prod ✓, Deep-Link v1.5.2) |
| 3 | Bootstrap-Admin und Kennwort-Login | **weitgehend** (v1.5.1 sync:install-password) |
| 4 | Rollen- und Teamrechte | **teilweise** (`test-api-permissions.js`) |
| 5 | Event-/Session-/Deck-Logik | **teilweise** (Sonderfolien RC Pilot v1.5.41) |
| 6 | Interaktions- und Countdown-Logik | **weitgehend** (B-005 Unit) |
| 7 | Performance / Admin-Ladezeit | teilweise (v1.4.4) |
| 8 | Mobile Darstellung | teilweise (v1.4.8) |
| 9 | Barrierefreiheit | teilweise (`test:accessibility`) |
| 10 | Sicherheit | **teilweise** (C-009 CORS v1.4.9) |
| 11 | Teststrategie | **in Arbeit** (Smoke, Permissions, WS-Reconnect) |
| 12 | Fehler-Backlog | siehe `docs/stabilization/backlog.md` |
| 13 | Abschlusskriterien | **teilweise** (Sonderfolien Chrome+Safari; FF/Beamer offen) |

## Diagnose (ohne Secrets)

```bash
npm run pulse:diagnose    # Gesamtstatus Instanz
npm run auth:diagnose     # Auth/Bootstrap
```

Auf dem VPS (ab v1.5.0 im Image):

```bash
docker exec pulse-pulse-1 npm run pulse:diagnose
docker exec pulse-pulse-1 npm run auth:diagnose
docker exec pulse-pulse-1 npm run sync:install-password
```

## Tests

```bash
npm test                  # Vollsuite
npm run test:smoke        # HTTP-Smoke (ephemerer Port, nicht 3000)
npm run test:auth
npm run test:permissions  # inkl. test-api-permissions.js
npm run test:routes
npm run test:reconnect    # Unit + WS-Integration
npm run test:performance
npm run test:accessibility
npm run test:install
npm run test:backup
```

## Abschlusskriterien (Auszug)

| Kriterium | Stand |
|-----------|-------|
| Administration-Klick Desktop + Mobil | ✓ nav59 |
| Bootstrap-Login mit Installations-Kennwort | ✓ Prod v1.5.1 |
| Deep-Link `#/admin/*` nach Login | ✓ v1.5.2 (Deploy ausstehend) |
| Passwort-Login ohne Mail; PIN-Login mit Mail | prüfen (C-004/C-005) |
| Rollen/Teams serverseitig durchgesetzt | teilweise (API-Tests) |
| Deck-Editor, Live-Sync, Timer | teilweise (Sonderfolien Presenter/Stage ✓) |
| Reconnect korrekte Folie | teilweise (Unit + WS-Test) |
| Mobile 320–430 px | manuell |
| Backup/Update reproduzierbar | Skripte vorhanden |
| Alle automatisierten Tests grün | laufend |
| Stabilitätsbericht, Changelog, Rollback | v1.5.x Releases |

Details: `docs/stabilization/backlog.md`, `docs/stabilization/smoke-checklist.md`, `docs/stabilization/test-matrix.md`.

## Prod-Update (v1.5.41)

```bash
cd /opt/pulse
sudo ./scripts/update-vps-ubuntu.sh --tag v1.5.41 --yes
npm run smoke:remote -- --url https://pulse.ringe.us --expect-version 1.5.41
docker exec pulse-pulse-1 node scripts/test-special-slides-remote.js --expect-version 1.5.41
```

Erwartung: `/api/health` → `"version":"1.5.41"`, Ready-Check `asset_manifest` ok, Frontend-Assets mit `?h=` (normaler Reload nach Update).

**Sonderfolien-Abnahme:** `docs/stabilization/abnahme-sonderfolien-v1.5.37-fortschritt.md`
