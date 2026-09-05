# Presenter: Hilfe, Start-/Pause-/Endfolie

Spezifikation für das Presenter-Feature-Paket (Freigabe außerhalb Feature-Freeze).

## 1. Hilfe in der Presenter-Leiste

- Position: unten rechts, fest verankert (`#presenter-program-control`)
- Icon: `?` (Designsystem-Hilfe-Icon)
- Öffnet Modal mit rollengefilterten Artikeln — **nicht** der globale Hilfe-FAB
- Der globale FAB bleibt auf `#/present` und `#/stage` ausgeblendet

## 2. Datenmodell (Event)

```json
{
  "startSlide": { "enabled": true, "type": "title", "title": "…", "subtitle": "…", "style": "modern" },
  "pauseSlide": { "enabled": true, "type": "pause", "title": "Pause", "subtitle": "Gleich geht es weiter", "style": "modern" },
  "endSlide": { "enabled": true, "type": "thanks", "title": "…", "subtitle": "…", "style": "modern" }
}
```

- Stile: `classic`, `modern`, `retro` (wie Countdown)
- Titel/Untertitel max. 120 Zeichen, kein HTML

## 3. Session-Runtime

- `session.specialSlide`: `null` | `start` | `pause` | `end`
- WebSocket `slide`-Payload erweitert um `specialSlide`
- Endfolie: `event.status = ended`, Interaktionen werden finalisiert, `participantEventGate` blockiert `event_ended`

## 4. Presenter-Steuerung

- Kacheln Start / Pause / Ende mit Mini-Vorschau
- Hilfe-Button rechts daneben
- Normale Folien-Navigation setzt `specialSlide` zurück

## 5. Stage-Priorität

1. Notfall-Pause (`session.paused`)
2. Event-Countdown
3. Sonderfolie
4. Warteraum
5. Deck-Folien

## 6. Tests

- `scripts/test-event-special-slides.js`
- Erweiterung `scripts/test-events.js` optional
