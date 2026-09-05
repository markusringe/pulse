# Changelog v1.5.31 — Presenter-Hilfe, Titel-Kontrast, Effekt-Polish

**Datum:** 2026-09-05  
**Tag:** `v1.5.31`

## Presenter

- Hilfe-FAB unten rechts zuverlässig ausgeblendet (`body.route-present` + CSS `display: none !important`)
- Zusätzliche Synchronisation beim Betreten von `#/present`

## Stage / Countdown

- Veranstaltungsname größer auf der Leinwand (bis ~4.25rem)
- Titel-Kontrast: explizite `--cd-title-color` — behebt schwarz auf schwarz durch globales `h1 { color: var(--ink) }`

## Stage-Effekte

- Intensität moderat erhöht
- Wasserfall: nahtlose `background-position`-Schleife (kein sichtbarer Bruch)
- Sunrise/Parallaxe: geschlossene Keyframe-Schleifen
