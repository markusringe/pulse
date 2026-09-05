# Changelog v1.5.30 — Stage-Effekte & Presenter ohne Hilfe-FAB

**Datum:** 2026-09-05  
**Tag:** `v1.5.30`

## Phase C — `stageEffect`

### Datenmodell & Sync

- Felder `stageEffect` (`none` | `sunrise` | `waterfall` | `parallax`) und `stageEffectIntensity` (`low` | `medium` | `high`)
- Sanitize serverseitig (`lib/stageEffectMeta.js`) und im Frontend (`eventCountdown.js`)
- WebSocket: `set_stage_effect`, `set_stage_effect_intensity` (Presenter)

### Stage & CSS

- CSS-only Hintergrundlayer (Sunrise, Wasserfall, Parallaxe)
- `prefers-reduced-motion` und Screen-Share ohne Animation
- Kombinierbar mit `countdownStyle`; bei aktivem Effekt keine BG-Pulse-Animation

### Event-Editor

- Eigene Sektion „Hintergrundeffekt“ mit Mini-Vorschau und Intensität
- Live-Event: Bestätigungsdialog bei visuellen Änderungen

## Presenter

- Hilfe-FAB unten rechts auf `#/present` ausgeblendet (keine Ablenkung während Präsentation)

## Tests

- `test-stage-countdown.js`: Sanitize, Persistenz, `eventMetaFor`, `patchEventMeta` für Stage-Effekte
