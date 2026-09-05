# Presenter: Sonderfolien in der Haupt-Präsentationsbox

## Ziel

Die **Haupt-Präsentationsbox** (`#present-stage` / `#present-slide-canvas`) zeigt die **aktive Sonderfolie live** — identisch zur Stage. Kein Hover-Overlay, keine separate Vorschau-Fläche.

## Nicht mehr

- Overlay-Panel neben/über den Buttons
- Separate Vorschau-Fläche (`presenterSpecialPreview.js`)
- Hover/Focus öffnet Panel

## Gewünschtes Verhalten

| Zustand | Hauptbox |
|--------|----------|
| Countdown aktiv | Countdown (live) |
| Pause aktiv | Pausefolie |
| Ende aktiv | Endfolie |
| Keine Sonderfolie | Normale Folie |

## Architektur

```
Presenter (#/present/:code)
├── Dock / Folienleiste
│   ├── [Countdown] [Pause] [Ende]  (aria-pressed)
│   └── [Folie 1] [Folie 2] …
└── Hauptbox (#present-slide-canvas)
    ├── Reguläre Folie ODER
    └── Aktive Sonderfolie (renderSpecialSlideInto, variant: stage)
```

## Umsetzung

1. **`presenterMainCanvas.js`** — `resolvePresenterSpecialKind`, `syncPresenterMainCanvas`, `destroyPresenterMainCanvas`
2. **`index.html`** — `#present-slide-canvas` mit `data-slide-canvas`
3. **`app.js`** — `renderActiveSlide()` nutzt Hauptbox statt `#present-special-slide` / Overlay
4. **Gemeinsamer Renderer** — `specialSlides/renderSpecialSlide.js` (Stage + Presenter)
5. **Countdown-Tick** — `mountCountdown` / `updateCountdownTicks` (nur Ziffern, kein Shell-Rebuild)

## Abnahme

- [ ] Hauptbox zeigt aktive Sonderfolie live (wie Stage)
- [ ] Hauptbox zeigt normale Folie ohne aktive Sonderfolie
- [ ] Kein Overlay-Panel
- [ ] Dock-Buttons: `aria-pressed="true"` bei aktiver Sonderfolie
- [ ] Countdown-Tick ohne DOM-Rebuild
- [ ] Darstellung Stage = Presenter

## Tests

```bash
npm run test:presenter-main-canvas
npm run test:presenter-special-slide-dock
npm run test:special-slides-remote
```
