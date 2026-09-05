# Changelog v1.5.48 — Presenter: Pause/Folienwechsel & kompaktes Dock

**Datum:** 2026-09-05  
**Tag:** `v1.5.48`

## Fixes

- **Hauptbox:** Leerer Screen nach Pause/Folienwechsel behoben — Overlay wird zuverlässig ausgeblendet, Fit-Leinwand bleibt erhalten (`ensurePresenterCanvasFit`).
- **Dock:** Kein QR-Code, keine vertikale Scroll-Leiste; Join-Code + Link kopieren kompakt; kleinere Buttons in `present-dock-toolbar`.

## Tests

```bash
npm run test:presenter-main-canvas
npm run test:special-slides-remote -- --url https://pulse.ringe.us --expect-version 1.5.48
```
