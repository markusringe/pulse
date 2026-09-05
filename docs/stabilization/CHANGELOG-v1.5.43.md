# Changelog v1.5.43 — Stage-Vollbild-Overlay & Presenter-Vorschau

**Datum:** 2026-09-05  
**Tag:** `v1.5.43`  
**Spec:** `docs/spec/PROMPT-STAGE-FULLSCREEN-AND-PRESENTER-SPECIAL-SLIDE-PREVIEWS.md`

## Neu

- **Stage:** Auto-ausblendbare Vollbildsteuerung unten rechts (`stageDisplayControls.js`) — Hot Corner, 3 s Auto-Hide, erster Touch blendet kurz ein; bei `?share=1` kein Control.
- **Presenter:** Vorschau für Countdown/Pause/Ende (`presenterSpecialPreview.js`) — gemeinsamer Renderer (`specialSlides/renderSpecialSlide.js`), CTA „Auf Stage anzeigen“, Escape schließt.

## Tests

```bash
npm run test:stage-display-controls
npm run test:presenter-special-preview
npm run test:presenter-special-slide-dock
npm run test:special-slides-remote -- --url https://pulse.ringe.us --expect-version 1.5.43
```
