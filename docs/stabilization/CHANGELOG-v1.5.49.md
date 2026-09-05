# Changelog v1.5.49 — Presenter: Clean UI ohne Folienleiste

**Datum:** 2026-09-05  
**Tag:** `v1.5.49`

## Fixes

- **Folienleiste entfernt:** `#present-deck` nicht mehr im DOM — keine doppelten Sonderfolien-Buttons, mehr Platz für die Hauptbox.
- **Dock in drei Sektionen:** Navigation (◀ 1/n ▶ +) | Sonderfolien (Icon-only ⏱ ⏸ ✓) | Tools (Ergebnisse, Link, Hilfe, Stage).
- **Status-Badge:** Oben rechts in der Hauptbox bei aktiver Sonderfolie (`#present-stage-status`).
- **Toggle:** Erneuter Klick auf aktiven Countdown/Pause-Button deaktiviert die Sonderfolie; Ende weiterhin nur mit Bestätigungsdialog.
- **Navigation:** ◀/▶ deaktiviert bei aktiver Sonderfolie (auch Tastatur).

## Tests

```bash
npm run test:presenter-special-slide-dock
npm run test:presenter-main-canvas
npm run test:special-slides-remote -- --url https://pulse.ringe.us --expect-version 1.5.49
```
