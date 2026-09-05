# Changelog v1.5.46 — Presenter-Sonderfolie skaliert in der Hauptbox

**Datum:** 2026-09-05  
**Tag:** `v1.5.46`

## Fix

- **Presenter:** Sonderfolien (Countdown/Pause/Ende) in `#present-slide-canvas` auf 16:9-Referenzleinwand gerendert und per CSS in die Box skaliert — gesamte Grafik sichtbar, Stage unverändert.

## Tests

```bash
npm run test:presenter-main-canvas
npm run test:special-slides-remote -- --url https://pulse.ringe.us --expect-version 1.5.46
```
