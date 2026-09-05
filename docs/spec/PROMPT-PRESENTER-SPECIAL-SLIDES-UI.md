# Presenter: Sonderfolien-Buttons in der Dock-Leiste

Spezifikation für UI-Integration (Countdown / Pause / Ende).

## Layout

Drei Ghost-Buttons in `#present-special-slide-nav` innerhalb `.present-nav-core`:

```
[⏱ Countdown] [⏸ Pause] [✓ Ende] [? Hilfe]
```

## Zustände

| Zustand | Darstellung |
|---------|-------------|
| Inaktiv | Standard Ghost-Button |
| Aktiv | Border + Hintergrund (`.is-active`) |
| Event beendet | Ende dauerhaft aktiv, andere deaktiviert |

## Datenmodell (Event)

```json
{
  "currentSpecialSlide": "countdown" | "pause" | "end" | null
}
```

Broadcast via `event_meta` — `updateSpecialSlideButtons()` synchronisiert die UI.

## WebSocket

```json
{
  "type": "event_countdown",
  "payload": {
    "action": "set_current_special_slide",
    "currentSpecialSlide": "countdown" | "pause" | "end" | null
  }
}
```

## Stage-Priorität

1. Endfolie (`currentSpecialSlide === "end"`)
2. Pausefolie
3. Countdown (erzwungen oder automatisch vor Start)
4. Warteraum / Deck

## Ende-Button

Bestätigungsdialog (`<dialog>`) vor serverseitigem Abschluss.

## Tests

- `scripts/test-event-special-slides.js`
