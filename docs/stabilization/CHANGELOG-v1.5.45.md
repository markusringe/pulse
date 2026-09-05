# Changelog v1.5.45 — Sonderfolien in der Presenter-Hauptbox

**Datum:** 2026-09-05  
**Tag:** `v1.5.45`  
**Spec:** `docs/spec/PROMPT-PRESENTER-SPECIAL-SLIDE-PREVIEW-IN-MAIN-BOX.md`

## Änderung

- **Presenter:** Countdown, Pause und Ende werden **live in `#present-slide-canvas`** angezeigt (wie Stage) — kein Hover-Overlay mehr.
- **Entfernt:** `presenterSpecialPreview.js`, `presenter-special-preview.css`
- **Neu:** `presenterMainCanvas.js` — gemeinsamer Renderer `renderSpecialSlideInto`

## Tests

```bash
npm run test:presenter-main-canvas
npm run test:presenter-special-slide-dock
npm run test:special-slides-remote -- --url https://pulse.ringe.us --expect-version 1.5.45
```

## Deploy

```bash
cd /opt/pulse && sudo ./scripts/update-vps-ubuntu.sh --tag v1.5.45 --yes
```
