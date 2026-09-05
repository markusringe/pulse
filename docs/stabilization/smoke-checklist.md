# Manuelle Smoke-Checkliste — Stabilisierungsrelease

Stand: **v1.5.41** · Prod `https://pulse.ringe.us` · geprüft **2026-09-05**

Browser: Chrome (Desktop) + iOS Safari / Android Chrome (Kernabläufe). Mobil-Emulation: 320 / 375 / 430 px.

Legende: **✓** erledigt · **~** teilweise · **✗** offen · **—** bewusst nicht auf Prod

---

## Automatisiert (nach jedem Deploy)

```bash
npm run smoke:remote -- --url https://pulse.ringe.us --expect-version X.Y.Z
npm run test:update-rollback
curl -fsS https://pulse.ringe.us/api/health/ready | jq '.ok, .checks[] | select(.id=="asset_manifest")'
```

**Prod v1.5.41 (2026-09-05):** Sonderfolien — Chrome + Safari ✅, Remote 15/15, Release veröffentlicht. Details: **`abnahme-sonderfolien-v1.5.37-fortschritt.md`**.

**Prod v1.5.37 (2026-09-05):** Sonderfolien Presenter/Stage — siehe **`abnahme-sonderfolien-v1.5.37.md`** (Dock, Folienleiste, Beamer, Screen-Share).

**Prod v1.5.11 (2026-09-04):** Remote-Smoke **16/16 OK** — Version 1.5.11, `pulse-app:1.5.11`, Rollback-Image `pulse-app:1.5.10` gesichert, Backup `vps-update-2026-09-04T19-05-47Z`.

---

## Browser-Abnahme nach Update (Pilot-Gate)

**Ziel:** Keine Mischversion (altes JS/CSS, fehlende dynamische Module, kaputte i18n/Hilfe) nach normalem Reload **ohne** Cache-Leeren.

### Vorbereitung

1. Bestehendes Browserfenster offen lassen (simuliert Nutzer nach Update).
2. Update auf VPS ausführen: `sudo ./scripts/update-vps-ubuntu.sh --tag v1.5.11 --yes`
3. Seite **normal neu laden** (F5) — kein Hard-Reload, kein `?v=`, kein „Cache leeren“.

### Konsole & Netzwerk (während aller Schritte)

In DevTools prüfen — **keine** dieser Fehler:

- `404` auf `/js/`, `/css/`, `/i18n/`, `/help/`
- `Failed to fetch dynamically imported module`
- falsche MIME-Types für JS/CSS
- CORS-Fehler auf Same-Origin
- Asset-URLs **ohne** `?h=` (lokale JS/CSS/i18n/help)
- fehlgeschlagenes Laden von `articles.json` oder Hilfe-HTML

### Pflicht-Klickpfad (Desktop)

| # | Route / Aktion | Erwartung |
|---|----------------|-----------|
| 1 | `/` Startseite | Styles vollständig, Logo/Favicon |
| 2 | Klick **Administration** | `#/admin` oder Login-Gate |
| 3 | Admin-Login | Session/Cookie, Redirect zur Admin-Route |
| 4 | `#/admin/events` | Eventliste lädt |
| 5 | Event öffnen / Detail | Keine leeren Panels |
| 6 | Deck-Editor `#/admin/sessions/:code` | Folienliste, Lazy-Module (picker, …) |
| 7 | Folie bearbeiten | Speichern ohne Konsolenfehler |
| 8 | `#/admin/users` | Nutzerverwaltung |
| 9 | `#/admin/teams` | Teams |
| 10 | `#/admin/privacy` | Datenschutz |
| 11 | `#/admin/ssl` | SSL |
| 12 | `#/admin/settings` | Einstellungen |
| 13 | `#/admin/backups` | Backup-UI |
| 14 | `#/admin/updates` | Update-Seite |
| 15 | `#/admin/help` / `#/help` | Hilfe-Katalog, Suche, Artikel-HTML |
| 16 | Join `#/join` oder `/j/XXXXXX` | Teilnehmer-UI |
| 17 | `#/stage` / Presenter | Stage-Modul (`wordcloud`, …) |
| 18 | Sprache DE → EN → FR | i18n ohne 404 |
| 19 | Dark Mode umschalten | Theme ohne FOUC-Regression |

### Mobil (320–430 px)

- [ ] Startseite: kein horizontaler Scroll
- [ ] Admin über Hamburger-Menü erreichbar
- [ ] Join-Formular bedienbar (Daumenzone)
- [ ] Gleiche Netzwerk-Checks wie Desktop

### Inkognito (frischer Cache)

- [ ] Login von Null
- [ ] Join mit Test-Code (z. B. **200576** wenn aktiv)
- [ ] Hilfe-Artikel einzeln öffnen (dynamisches `/help/*.html` via `assetUrl`)

### Nach Update ohne Browser-Neustart

- [ ] Schritt 1–3 in **bestehendem Tab** nach Reload
- [ ] Kein „altes“ `app.js` ohne passenden Hash (Netzwerk-Tab: `app.js?h=`)

---

## Rollback-Drill (v1.5.11+, einmal pro Release-Zyklus)

**Ziel:** Nachweis, dass versionierte Images (`pulse-app:<version>`) per `--no-build` starten, Readiness `ok:true` liefert und danach die Zielversion wiederhergestellt wird.

**Skript:** `scripts/rollback-drill.sh` · Test: `npm run test:rollback-drill`

```bash
# Auf dem VPS (Wartungsfenster, keine laufende Veranstaltung):
cd /opt/pulse
sudo ./scripts/rollback-drill.sh --yes
# Protokoll: backups/rollback-drill-*.json
```

Ablauf im Skript:

1. Backup `data/` + `.env`
2. Baseline: Ready + Version + `docker images | grep pulse-app`
3. Rollback: `PULSE_IMAGE_TAG=<alt>` · `compose up -d --no-build --force-recreate`
4. Prüfen: `/api/health/ready` → `ok:true`, Version = alte Version, Remote-Smoke
5. Wiederherstellung auf Zielversion (Default: package.json)
6. Remote-Smoke gegen Zielversion

**Hinweis:** Beim Recreate gibt es eine **kurze Unterbrechung** (kein Zero-Downtime). Buildfehler-Rollback (Updater v1.1) hält alte Container ohne Recreate — separater Test optional.

| Schritt | Status | Notiz |
|---------|--------|-------|
| Skript + Pfadtest | ✓ | `rollback-drill.sh`, `test:rollback-drill-path.sh` |
| Prod-Baseline Remote-Smoke | ✓ | 16/16, v1.5.11 (2026-09-04) |
| VPS-Drill ausgeführt | ✓ | **2026-09-04T19:16:55Z**, `outcome: success` |
| Rollback v1.5.10 | ✓ | Ready `ok:true`, Health-Version 1.5.10 |
| Wiederherstellung v1.5.11 | ✓ | Ready `ok:true`, Remote-Smoke 16/16 (lokal) |
| Protokoll | ✓ | `backups/rollback-drill-2026-09-04T19-16-55Z.json` auf VPS |
| Downtime | ~ | ca. 10–20 s Cutover; Skript recreated nur App + nginx |

## Startseite & Join

- [x] Startseite lädt ohne ungestylte Links/Buttons (Prod 2026-09-04)
- [x] Kein horizontaler Scroll (320–430 px)
- [~] Join mit Code **200576** — API OK; UI manuell (Inkognito)
- [~] Datenschutz-Hinweis blockiert keine Klicks dauerhaft

---

## Administration & Login

- [~] Klick „Administration“ → `#/admin` — Login-Gate teils unklar ohne Session
- [ ] Gleiches im mobilen Menü
- [ ] Admin-Login — Prod: PIN per E-Mail; **Postfix-Queue** prüfen
- [ ] Nach Login: Redirect zu gespeicherter Route
- [ ] Deep Link `#/admin/events` ohne Session → Login
- [ ] Logout → `#/`
- [ ] Abgelaufene Session → Login, keine Schleife

---

## Admin-Routen (angemeldet)

- [ ] `#/admin`, `#/admin/events`, `#/admin/users`, `#/admin/teams`
- [ ] `#/admin/backups`, `#/admin/settings`, `#/admin/ssl`

*(Blockiert durch Admin-Login auf Prod — lokal: `test-auth-http`, `test-routes` OK)*

---

## Rollen

- [ ] Teamleader / Teammember / Viewer / 403-Ansicht  
*(Lokal: `test-permissions` OK)*

---

## Live-Session

- [~] Presenter + Join (Session **200576**)
- [~] Interaktion starten / Pause — lokal: `test-interaction-state` OK
- [~] Reconnect — lokal: `test-reconnect-sync` OK

---

## Backup & Update

- [ ] Backup erstellen und herunterladen
- [—] Restore nur in Testinstanz
- [x] Deploy v1.5.11 — Backup `vps-update-2026-09-04T19-05-47Z`, Ready OK, `pulse-app:1.5.10` Rollback-Image

---

## Diagnose (VPS)

```bash
docker exec pulse-pulse-1 npm run pulse:diagnose
docker exec pulse-pulse-1 npm run auth:diagnose
docker images | grep pulse-app
```

---

## Regression lokal

| Test | Ergebnis |
|------|----------|
| `test-smoke` | OK |
| `test-asset-manifest` | OK |
| `test-update-rollback` | OK (v1.5.11) |
| `test-auth-http` / `test-routes` | OK |
| `test-live` / `test-reconnect-sync` | OK |

---

## Freigabe Pilotbetrieb

| Kriterium | Status |
|-----------|--------|
| Remote-Smoke 16/16 | ✓ (v1.5.41 Prod) |
| Sonderfolien Remote 15/15 | ✓ (v1.5.41) |
| `asset_manifest` Ready | ✓ |
| Automatisierter Rollback (Code) | ✓ (v1.5.11) |
| Rollback-Drill Prod | ✓ (2026-09-04, success) |
| Sonderfolien Chrome + Safari | ✓ / ☐ FF |
| Browser-Pflichtpfad (19 Schritte) | ✗ |
| Admin/Login/Rollen Prod | ✗ (SMTP) |
| Gesamt Freigabe | **RC Pilot** — Sonderfolien funktional (v1.5.41); manuell: Browser 19 Schritte, Auth Prod, Firefox, Beamer, Mobilgeräte |

### Automatisierte Abnahme (2026-09-04)

```bash
npm run acceptance:stabilization   # OK
```

| Check | Ergebnis |
|-------|----------|
| `acceptance:public` | 20/20 Prod |
| `smoke:remote` | 16/16 |
| `backup:restore-drill` | OK |
| Load 100/300 Burst + 3-min-Dauer-Smoke | OK |
| Bericht | `acceptance-report-2026-09-04.md` |
