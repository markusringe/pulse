# Manuelle Smoke-Checkliste — Stabilisierungsrelease

Stand: **v1.5.10** · Prod `https://pulse.ringe.us` · geprüft **2026-09-04**

Browser: Chrome (Automatisierung) + API/VPS-Diagnose. Mobil: 320 / 375 / 430 px (Emulation).

Legende: **✓** erledigt · **~** teilweise / Regression lokal · **✗** offen · **—** bewusst nicht auf Prod

---

## Automatisiert (Prod v1.5.10, 2026-09-04)

Remote-Smoke `npm run smoke:remote -- --url https://pulse.ringe.us --expect-version 1.5.10` — **16/16 OK**:

- GET `/`, `/js/app.js?h=…`, `/api/health`, `/api/health/live`, `/api/health/ready`, `/api/auth/status`
- Version **1.5.10**, Betriebsmodus **cluster**, Readiness **ready**, Check **asset_manifest** ok
- Gehashtes JS: `Cache-Control: immutable`; `__PULSE_ASSET_H__` injiziert

---

## Startseite & Join

- [x] Startseite lädt ohne ungestylte Links/Buttons (Prod 2026-09-04)
- [x] Kein horizontaler Scroll (320–430 px) — Emulation 320/375/430, `scrollWidth === clientWidth`
- [~] Join mit 6-stelligem Code funktioniert — Session **200576** per API angelegt, `GET /api/sessions/200576` OK; Join-UI in Automatisierung durch **Ersteinrichtungs-Overlay** blockiert → **manuell im Browser (Inkognito) mit Code 200576** nachholen
- [~] Datenschutz-Hinweis blockiert keine Klicks dauerhaft — auf Startseite kein Banner; Join-Datenschutz **nach erfolgreichem Join** manuell prüfen

---

## Administration & Login

- [~] Klick „Administration“ → `#/admin` (Desktop) — Navigation reagiert; **Login-Gate `#/admin/login` fehlt** wenn nicht angemeldet (Hash bleibt `#/admin` / `#/admin/events`)
- [ ] Gleiches im mobilen Menü — Menü-Button sichtbar (375 px); Admin aus Drawer **manuell** prüfen
- [ ] Bootstrap-/Admin-Login — Prod: **PIN per E-Mail** (`passwordLoginMode: false`, Sendmail). PIN-Anforderung OK, Zustellung **Postfix-Queue hängt** → Login derzeit nicht automatisierbar
- [ ] Nach Login: Redirect zu `#/admin` / gespeicherte Route
- [~] Deep Link `#/admin/events` ohne Session — Hash wird gesetzt, **kein Redirect zu Login** (s. o.)
- [ ] Logout → `#/` Startseite
- [ ] Abgelaufene Session → Login, keine Endlosschleife

**Hinweis Prod:** Für Admin-Smoke entweder SMTP-Zustellung reparieren oder temporär Kennwort-Login (`passwordLoginMode`) in Testfenster — nicht dauerhaft ohne Absprache.

---

## Admin-Routen (angemeldet als Admin)

- [ ] `#/admin` — Sessions-Hub lädt < 3 s
- [ ] `#/admin/events`, `#/admin/users`, `#/admin/teams`
- [ ] `#/admin/backups`, `#/admin/settings`, `#/admin/ssl`

*(Blockiert durch fehlenden Admin-Login auf Prod — lokal: `test-auth-http`, `test-routes` OK)*

---

## Rollen (je Rolle testen)

- [ ] Teamleader: nur eigenes Team
- [ ] Teammember: kein Benutzer-Management
- [ ] Viewer: Lesezugriff, kein Schreiben
- [ ] 403-Ansicht bei verbotener Route

*(Lokal: `test-permissions` / `test-api-permissions` OK — Prod mit Testkonten manuell)*

---

## Live-Session (Kurztest)

- [~] Presenter + Join — Session **200576** (Poll, Lobby) auf Prod vorhanden; Presenter-Flow **manuell** (Presenter-Tab + Join-Tab)
- [~] Eingabe vor „Interaktion starten“ abgelehnt — **lokal:** `test-interaction-state` OK
- [ ] Nach Start: Eingabe möglich
- [ ] Pause / Ende blockiert Eingabe
- [~] Reconnect stellt Zustand wieder her — **lokal:** `test-reconnect-sync`, `test-live` OK

---

## Backup & Update

- [ ] Backup erstellen und herunterladen — Admin-Login nötig
- [—] Restore in Testinstanz (nicht Prod!)
- [x] Update-Skript mit Backup; Version stimmt — Deploy **v1.5.9** via `update-vps-ubuntu.sh --tag v1.5.9`, Backup `vps-update-2026-09-04T18-49-46Z`, `/api/health` → **1.5.9**

---

## Barrierefreiheit (Kurz)

- [~] Tab-Reihenfolge Login-Formular — **lokal:** `test-accessibility` OK; Prod Login manuell
- [ ] Modal: Escape, Fokus-Rückgabe
- [ ] Sichtbarer Fokus auf Buttons/Links

---

## Diagnose (VPS, 2026-09-04)

```bash
docker exec pulse-pulse-1 npm run pulse:diagnose
docker exec pulse-pulse-1 npm run auth:diagnose
```

- [x] **pulse:diagnose** — `ok`, Single-Modus, SQLite, Disk ~28 GB frei; Hinweis: kein Backup-Verzeichnis in Diagnose
- [x] **auth:diagnose** — Auth aktiv, Sendmail konfiguriert, 1 Admin; keine Secrets in Ausgabe

---

## Regression lokal (Ephemeral, 2026-09-04)

| Test | Ergebnis |
|------|----------|
| `test-smoke` | OK |
| `test-auth-http` | OK |
| `test-routes` | OK |
| `test-live` | OK |
| `test-interaction-state` | OK |
| `test-reconnect-sync` | OK |
| `test-permissions` | OK |
| `test-accessibility` | OK |

---

## Offene Prod-Manualchecks (Priorität)

1. **Postfix/SMTP:** PIN-Zustellung für Admin-Login (Queue prüfen: `postqueue -p` auf VPS)
2. **Login-Gate:** `#/admin/*` ohne Session → `#/admin/login` (Verhalten prüfen / ggf. Bug)
3. **Join UI:** Inkognito, Code **200576**, Lobby → Interaktion (Session ggf. vorher beenden)
4. **Rollen:** Testuser Teamleader / Member / Viewer auf Prod
5. **Backup-Download** nach Admin-Login

---

## Freigabe

| Kriterium | Status |
|-----------|--------|
| Remote-Smoke 12/12 | ✓ |
| Diagnose VPS | ✓ |
| Mobil Layout 320–430 | ✓ |
| Admin/Login/Rollen Prod | ✗ (SMTP + manuell) |
| Live-Session Prod End-to-End | ~ |
| Gesamt Freigabe Stabilisierung | **ausstehend** — Admin-/Rollen-Block |
