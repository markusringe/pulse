# Changelog v1.5.47 — Presenter-Folienwechsel, Layout, Skalierung

**Datum:** 2026-09-05  
**Tag:** `v1.5.47`

## Fixes

- **Hauptbox:** Sonderfolie nur bei explizitem `currentSpecialSlide` — Folienwechsel zeigt wieder die reguläre Folie (kein Auto-Countdown).
- **Layout:** Dock/Buttons (`#present-dock`) oberhalb der Statistik (`#presenter-stats`).
- **Skalierung:** Sonderfolien-Vorschau weiter verkleinert (`--present-canvas-extra-shrink: 0.76`).

## Tests

```bash
npm run test:presenter-main-canvas
npm run test:special-slides-remote -- --url https://pulse.ringe.us --expect-version 1.5.47
```
