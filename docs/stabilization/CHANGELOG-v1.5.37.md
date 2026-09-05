# Changelog v1.5.37 — Sonderfolien in der Presenter-Folienleiste

**Datum:** 2026-09-05  
**Tag:** `v1.5.37`

## Neu

- **Folienleiste (`#/present`):** Countdown vor Folie 1, Pause davor, Ende nach dem Plus-Button
- Klick aktiviert Sonderfolie via `set_current_special_slide` (wie Dock-Buttons)
- Ende mit Bestätigungsdialog; aktiver Chip hervorgehoben
- Countdown-Chip bei Event-Sessions immer sichtbar (deaktiviert ohne Startzeit)

## Unverändert

- Stage bleibt reine Ausgabe ohne Buttons
- Dock-Buttons Countdown/Pause/Ende parallel nutzbar

## Test

```bash
npm run test:presenter-special-slide-dock
```
