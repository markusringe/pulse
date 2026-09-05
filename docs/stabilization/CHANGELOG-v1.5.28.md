# Changelog v1.5.28 — Countdown & Stage

**Datum:** 2026-09-05  
**Branch:** `main`  
**Tag:** `v1.5.28`

## Highlights

### Countdown & Präsentations-Leinwand (`757806e`)

- Drei Countdown-Stile: **Classic**, **Modern** (Standard), **Retro** — Auswahl als Karten im Event-Editor
- Stage (`#/stage/:code`): Titel, Status, Countdown, optionales Datum/Uhrzeit, optionaler QR-Code (öffentliche Join-URL)
- Presenter-Leiste statt Vollbild-Countdown in der Presenter-Ansicht
- Screen-Share-Modus via `?share=1` — größere Typo, weniger Animation
- Serverseitige Felder: `countdownStyle`, `showStageDateTime`, `showStageQr`
- WebSocket `event_countdown`: Start, QR-Toggle, Startzeit-Anpassung (nur Presenter)
- Tests: `scripts/test-stage-countdown.js`

### Stabilisierung Presenter-Leiste

- Mount-once, Event-Delegation, Tick ohne `innerHTML`-Neuaufbau
- Sauberes Teardown bei View-Wechsel (`destroyPresenterCountdownControl`)

### Dokumentation

- `docs/spec/PROMPT-PRESENTER-COUNTDOWN-STAGE-REDESIGN.md` (Umsetzung)
- `docs/spec/PROMPT-STAGE-ANIMATIONS-EFFEKTE.md` (Phase 2 — Hintergrundeffekte, noch nicht implementiert)

## Deploy

```bash
sudo ./scripts/update-vps-ubuntu.sh --tag v1.5.28 --yes
npm run smoke:remote
```

## Nächste Schritte (geplant)

1. Visuelles Stil-Polish (Classic/Modern/Retro, QR-Join-Karte)
2. `stageEffect` (Sunrise, Wasserfall, Parallaxe) — separate Freigabe
