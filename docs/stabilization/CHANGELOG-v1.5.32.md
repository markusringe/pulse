# Changelog v1.5.32 — Flüssige Stage-Effekte & Hilfe auf Stage aus

**Datum:** 2026-09-05  
**Tag:** `v1.5.32`

## Stage-Effekte (kritisch)

- **Ursache:** Countdown baute jede Sekunde per `innerHTML` die Effekt-Layer neu auf → Animationen starteten ständig neu
- **Fix:** Mount-once in `mountCountdown()` — nur Ziffern/Status pro Tick, Effekt-DOM bleibt erhalten
- CSS: Wasserfall per `translate3d` (nahtlose Periode), Sunrise/Parallaxe ohne Loop-Sprung

## Hilfe-FAB

- Ausgeblendet auf `#/stage` und `#/present-view` (zusätzlich zu `#/present`)
- `body.route-stage` + Hash-Erkennung + Aufruf in `enterStage()`
