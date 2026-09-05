# Changelog v1.5.12 – v1.5.35

**Stand:** 2026-09-05  
**Produktiv:** https://pulse.ringe.us/ — **v1.5.35** (Commit `547b974`)  
**Letztes GitHub-Release (vorher):** v1.5.11

> Dieses Dokument fasst alle Änderungen zwischen dem letzten GitHub-Release **v1.5.11** und dem aktuellen Produktionsstand **v1.5.35** zusammen.

---

## v1.5.35 — Stage-Sonderfolien-Navigation (`547b974`)

### Neu

- **Floating Action Bar auf der Stage** (`#/stage/:code`): Countdown, Pause, Ende
- Nur für **Presenter/Admin** (Cookie-Session oder Admin-Key), serverseitig via `capabilities.specialSlideControl`
- **Automatisch ausgeblendet** bei `?share=1` (Screen-Share) und `prefers-reduced-motion`
- **Keine Keyboard-Shortcuts** auf der Stage — reine Anzeige mit optionaler Presenter-Steuerung
- End-Event mit Bestätigungsdialog (Mausklick)
- Gemeinsame Logik: `specialSlideNavCore.js` (Presenter-Dock + Stage-FAB)

### Server

- Stage-Join: `client.stageCanControl` bei authentifizierten Presentern
- `event_countdown` / `set_current_special_slide` auch für berechtigte Stage-Clients

### Doku

- `docs/spec/PROMPT-STAGE-SPECIAL-SLIDES-NAVIGATION-FINAL.md`

---

## v1.5.34 — Presenter-Dock Sonderfolien (`2bbc848`)

- Countdown / Pause / Ende als Ghost-Buttons **in der Presenter-Leiste** (nicht mehr floating unten rechts)
- Feld `currentSpecialSlide` am Event (`countdown` | `pause` | `end` | `null`)
- WebSocket: `action: "set_current_special_slide"`

---

## v1.5.33 — Hilfe, Start-/Endfolie, Pause (`2853078`)

- Hilfe-Button (`?`) in der Presenter-Leiste
- Konfigurierbare **Start-/Pause-/Endfolie** im Event-Editor
- Pause-Grafik mit „Gleich geht es weiter …“
- `session.specialSlide` / Event-Meta-Sync

---

## v1.5.30–v1.5.32 — Stage-Effekte & Polish

| Version | Inhalt |
|---------|--------|
| **v1.5.32** | Flüssige Effekte (Mount-once), Hilfe-FAB auf Stage aus |
| **v1.5.31** | Presenter-Hilfe, Titel-Kontrast, nahtlose Effekte |
| **v1.5.30** | Stage-Hintergrundeffekte: Sunrise, Wasserfall, Parallaxe |

---

## v1.5.28–v1.5.29 — Countdown & Stage-QR

- Countdown-Stile: **Classic**, **Modern**, **Retro**
- Stage-QR-Join-Karte, optionales Datum/Uhrzeit auf der Leinwand
- Presenter-Leiste statt Vollbild-Countdown in `#/present`
- Screen-Share-Modus `?share=1`

---

## v1.5.26–v1.5.27 — Hilfe rollenbasiert

- Serverseitige Rollenfilterung für Hilfe-Artikel
- Hilfe-API Phase 2 mit `roleCache`
- Statische Hilfe-HTML geschützt
- Generische Platzhalter statt Saarbrücken-Defaults (Datenschutz)

---

## v1.5.12–v1.5.25 — Stabilisierung Join/Mobile/Admin

- **Join/Mobile:** Folienwechsel-Sync, Abstimmungsstart-Sync, Event-Status-Warteraum
- **Admin:** Asset-Cache-Bust, Events/Backups-Boot, Backup-Löschen
- **SSL:** Redirect hinter nginx, Healthcheck `/api/health/ready`
- **E-Mail:** Mailgun-Integration (Outbox, Webhooks, Domain-UI)
- **Ops:** Rollback-Drill, Lasttest-Flags, Abnahme-Suite

---

## Migration / Datenbank

**Kein manueller Migrations-Schritt nötig.** Neue Event-Felder werden beim Laden/Speichern automatisch sanitized:

| Feld | Seit | Default |
|------|------|---------|
| `currentSpecialSlide` | v1.5.34 | `null` |
| `pauseSlide` / `endSlide` | v1.5.33 | disabled |
| `countdownStyle` | v1.5.28 | `modern` |
| `showStageQr` / `showStageDateTime` | v1.5.28 | `false` |
| `stageEffect` / `stageEffectIntensity` | v1.5.30 | `none` / `medium` |

Bestehende Events in `events.json` bleiben abwärtskompatibel.

---

## Tests (automatisiert)

| Skript | Bereich |
|--------|---------|
| `scripts/test-event-special-slides.js` | Sonderfolien, `currentSpecialSlide` |
| `scripts/test-stage-countdown.js` | Countdown-Stile, Stage-Meta |
| `scripts/test-help-api.js` | Hilfe-API, Rollenfilter |
| `scripts/test-events.js` | Event-CRUD |
| `npm run smoke:remote` | Prod-Smoke (16 Checks) |

**Nicht automatisiert (manuell empfohlen):** Beamer-Lesbarkeit, Screen-Share (Zoom/Teams/Meet), iOS/Android Join-Flow.

---

## Deploy

```bash
sudo ./scripts/update-vps-ubuntu.sh --tag v1.5.35 --yes
npm run smoke:remote
```

---

## Stage-Navigation — Use-Case

| Tab | URL | FAB |
|-----|-----|-----|
| Presenter-Steuerung | `#/stage/CODE` (ohne `share`) | ✅ sichtbar (wenn eingeloggt) |
| Beamer / Screen-Share | `#/stage/CODE?share=1` | ❌ ausgeblendet |
| Presenter-Dock | `#/present/CODE` | ✅ Dock-Buttons parallel nutzbar |

---

## Bekannte Einschränkungen

- Feature-dichte Phase (v1.5.12–v1.5.35): intensive Entwicklung — **Feature-Freeze** empfohlen
- E2E-Tests für Sonderfolien-Workflow noch nicht im CI
- GitHub-Release-Notes erst ab Erstellung dieses Dokuments / Release v1.5.35 nachgezogen
