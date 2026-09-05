# Presenter: Klares, kompaktes UI (Clean Restructure)

## Ziel

Eine Hauptbox (80–85 %), ein kompaktes Dock (15–20 %), **keine Folienleiste**, Sonderfolien **nur** im Dock, Status oben rechts in der Hauptbox.

## Layout

```
Header
Hauptbox (+ Status oben rechts bei Sonderfolie)
Dock: [◀ 1/n ▶ +] | [⏱ ⏸ ✓] | [Ergebnisse 🔗 ? Stage …]
Statistik
```

## Regeln

- `#present-deck` entfernt (keine Miniatur-Folienleiste)
- Sonderfolien-Buttons nur in `#present-special-slide-nav` (Icon-only)
- Klick auf **aktiven** Sonderfolien-Button → deaktivieren (`currentSpecialSlide: null`)
- Ende: Bestätigungsdialog, kein Toggle-off
- `#present-stage-status` zeigt aktiven Modus

## Abnahme

- [ ] Kein `#present-deck` im DOM
- [ ] Status bei Sonderfolie sichtbar
- [ ] Toggle-off für Countdown/Pause
- [ ] Dock drei Sektionen, kein QR, kein vertikales Scrollen
- [ ] `aria-pressed` auf Sonderfolien-Buttons
