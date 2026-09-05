# Stage: Sonderfolien-Navigation (Final)

## Ziel

Floating Action Bar auf der **Stage** (`#/stage/:code`) für Presenter/Admin:

- **Countdown** — erzwungene Countdown-Ansicht
- **Pause** — Pausefolie
- **Ende** — Event beenden (mit Bestätigungsdialog)

## Grundsätze

**Die Stage ist eine reine Anzeige-Fläche:**

- Vollbild auf zweitem Bildschirm oder Bildschirmfreigabe in Videokonferenzen
- **Keine Keyboard-Shortcuts** auf der Stage
- **Keine** direkte Interaktion außer der Sonderfolien-Navigation für berechtigte Presenter
- Navigation dient **ausschließlich** dem Presenter zur schnellen Steuerung ohne Fensterwechsel

## Sichtbarkeit

| Bedingung | FAB sichtbar |
|-----------|--------------|
| Presenter/Admin (Cookie oder Admin-Key) | Ja |
| `?share=1` (Screen-Share) | Nein |
| `prefers-reduced-motion: reduce` | Nein |
| Keine Sonderfolien konfiguriert | Nein |

## Use-Cases

1. **Beamer:** Stage im Vollbild auf zweitem Bildschirm, Presenter steuert vom Laptop
2. **Videokonferenz:** Stage als Bildschirmfreigabe (`?share=1` ohne FAB), Steuerung in separatem Tab ohne `share=1`
3. **Hybrid:** Beides parallel — Presenter hat Vorschau mit FAB und geteilte Leinwand ohne FAB

## WebSocket

Presenter-Dock und Stage-FAB nutzen dieselbe Aktion:

```json
{
  "type": "event_countdown",
  "payload": {
    "code": "123456",
    "action": "set_current_special_slide",
    "currentSpecialSlide": "pause"
  }
}
```

Stage-Clients mit Rolle `stage` und `stageCanControl` (serverseitig nach Auth) dürfen **nur** `set_current_special_slide` senden.

Join-Antwort:

```json
{
  "capabilities": {
    "specialSlideControl": true
  }
}
```

## Dateien

| Datei | Rolle |
|-------|-------|
| `frontend/js/stageSpecialSlideNav.js` | FAB-Mount, Sync, Teardown |
| `frontend/js/specialSlideNavCore.js` | Gemeinsame Button-Logik (Presenter + Stage) |
| `frontend/js/stage.js` | Integration in `renderStage` / `leaveStage` |
| `frontend/css/event-special-slides.css` | FAB-Styles |
| `server.js` | `stageCanControl`, `applyEventCountdownControl` |

## Accessibility

- `role="group"` + `aria-label` für Button-Gruppe
- `aria-pressed` pro Toggle-Button
- Kontrast via bestehende `--accent` / Ghost-Buttons
- `:focus-visible` Outline auf Stage-Buttons
- End-Dialog: natives `<dialog>` mit Fokus-Falle

## Tests

- `scripts/test-event-special-slides.js` — Backend-Sanitize/Persistenz
- Manuell: Stage ohne `share=1` als eingeloggter Presenter → FAB sichtbar; mit `?share=1` → ausgeblendet
