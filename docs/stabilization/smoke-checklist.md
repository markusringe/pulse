# Manuelle Smoke-Checkliste — Stabilisierungsrelease

Vor Betriebsfreigabe abhaken. Browser: Chrome/Firefox/Safari · Mobil: 375 px und 430 px Breite.

## Automatisiert (Prod v1.5.7, 2026-09-04)

Remote-Smoke `npm run smoke:remote -- --url https://pulse.ringe.us --expect-version 1.5.7` — **12/12 OK**:

- GET `/`, `/js/app.js`, `/api/health`, `/api/health/live`, `/api/health/ready`, `/api/auth/status`
- Version 1.5.7, Betriebsmodus **single**, Readiness **ready**, nicht degraded

Manuelle Punkte unten weiterhin Pflicht (Login, Mobil, Live-Session, Rollen).

## Startseite & Join

- [ ] Startseite lädt ohne ungestylte Links/Buttons
- [ ] Kein horizontaler Scroll (320–430 px)
- [ ] Join mit 6-stelligem Code funktioniert
- [ ] Datenschutz-Hinweis blockiert keine Klicks dauerhaft

## Administration & Login

- [ ] Klick „Administration“ (Icon) → Modal **oder** `#/admin/login`
- [ ] Gleiches im mobilen Menü
- [ ] Bootstrap-Login mit Installations-E-Mail/Kennwort
- [ ] Nach Login: Redirect zu `#/admin` / gespeicherte Route
- [ ] Deep Link `#/admin/events` ohne Session → Login → Events
- [ ] Logout → `#/` Startseite
- [ ] Abgelaufene Session → Login, keine Endlosschleife

## Admin-Routen (angemeldet als Admin)

- [ ] `#/admin` — Sessions-Hub lädt < 3 s (typisch)
- [ ] `#/admin/events`, `#/admin/users`, `#/admin/teams`
- [ ] `#/admin/backups`, `#/admin/settings`, `#/admin/ssl`

## Rollen (je Rolle testen)

- [ ] Teamleader: nur eigenes Team
- [ ] Teammember: kein Benutzer-Management
- [ ] Viewer: Lesezugriff, kein Schreiben
- [ ] 403-Ansicht bei verbotener Route

## Live-Session (Kurztest)

- [ ] Presenter + 1 Join-Tab: gleiche aktive Folie
- [ ] Eingabe vor „Interaktion starten“ abgelehnt
- [ ] Nach Start: Eingabe möglich
- [ ] Pause / Ende blockiert Eingabe
- [ ] Reconnect stellt Zustand wieder her

## Backup & Update

- [ ] Backup erstellen und herunterladen
- [ ] Restore in Testinstanz (nicht Prod!)
- [ ] Update-Skript mit Backup; Version in UI/`package.json` stimmt

## Barrierefreiheit (Kurz)

- [ ] Tab-Reihenfolge Login-Formular
- [ ] Modal: Escape, Fokus-Rückgabe
- [ ] Sichtbarer Fokus auf Buttons/Links

## Diagnose

```bash
npm run pulse:diagnose
npm run auth:diagnose
```

Beide ohne Secrets; `ok: true` oder dokumentierte Hinweise.
