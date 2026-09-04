# Feature-Freeze — Pulse / Team Townhall

**Status:** aktiv  
**Branch:** `stabilization/feature-freeze`  
**Basisversion:** 1.4.7  
**Ziel:** Stabilitätsrelease (geplant v1.5.0 oder v1.4.7+)

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
| 1 | Release- und Installationsbasis | in Arbeit |
| 2 | Administration, Login, Routing | in Arbeit |
| 3 | Bootstrap-Admin und Kennwort-Login | teilweise (v1.4.6) |
| 4 | Rollen- und Teamrechte | offen |
| 5 | Event-/Session-/Deck-Logik | offen |
| 6 | Interaktions- und Countdown-Logik | offen |
| 7 | Performance / Admin-Ladezeit | teilweise (v1.4.4) |
| 8 | Mobile Darstellung | offen |
| 9 | Barrierefreiheit | offen |
| 10 | Sicherheit | offen |
| 11 | Teststrategie | in Arbeit |
| 12 | Fehler-Backlog | siehe `docs/stabilization/backlog.md` |
| 13 | Abschlusskriterien | offen |

## Diagnose (ohne Secrets)

```bash
npm run pulse:diagnose    # Gesamtstatus Instanz
npm run auth:diagnose     # Auth/Bootstrap
```

## Tests

```bash
npm test                  # Vollsuite
npm run test:smoke        # HTTP-Smoke (ephemerer Port, nicht 3000)
npm run test:auth
npm run test:permissions
npm run test:routes
npm run test:performance
npm run test:accessibility
npm run test:install
npm run test:backup
```

## Abschlusskriterien (Auszug)

- Administration-Klick Desktop + Mobil zuverlässig
- Bootstrap-Login mit Installations-Kennwort
- Passwort-Login ohne Mail; PIN-Login mit Mail
- Rollen/Teams serverseitig durchgesetzt
- Deck-Editor, Live-Sync, Timer, Mobile, Backup/Update reproduzierbar
- Alle automatisierten Tests grün
- Stabilitätsbericht, Changelog, Rollback-Hinweis

Details: `docs/stabilization/backlog.md`, `docs/stabilization/smoke-checklist.md`, `docs/stabilization/test-matrix.md`.
