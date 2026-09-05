# Presenter-Dock: Sonderfolien-Steuerung (Final)

> **Architektur:** Presenter = Steuerung · Stage = reine Ausgabe  
> Supersedes: `PROMPT-STAGE-SPECIAL-SLIDES-NAVIGATION-FINAL.md` (Stage-FAB entfernt in v1.5.36)

## Klare Trennung

### Presenter (`#/present/:code`)

- **Sonderfolien in der Folienleiste:** Countdown (vor 1), Pause, Folien, `+`, Ende (nach `+`)
- **Zusätzlich Dock:** Countdown, Pause, Ende (+ Hilfe `?`) in `#present-special-slide-nav`
- **Steuerung:** Volle Kontrolle über Event (nur Rolle `presenter` / Admin-Auth)
- **Ziel:** Presenter steuert vom Laptop/Tablet aus

### Stage (`#/stage/:code`)

- **Keine Buttons** jeglicher Art (keine FAB, keine Keyboard-Shortcuts)
- **Reine Ausgabe:** Folien, Countdown, Pause, Ende — passiv via `event_meta`
- **Ziel:** Beamer / Videokonferenz zeigt nur Inhalt (`?share=1` für Screen-Share-Typo)

## UI — Presenter-Dock

```
[⏱ Countdown] [⏸ Pause] [✓ Ende]  [? Hilfe]
```

| Aspekt | Umsetzung |
|--------|-----------|
| Layout | Horizontal im Dock, Ghost-Buttons mit Icon + Label |
| Aktiv | `is-active`, `aria-pressed="true"`, Akzentfarbe |
| Ende bestätigt | `is-confirmed`, Button disabled |
| Responsive | Desktop nebeneinander; Mobile wrap/zentriert (`present-mobile.css`) |

## Server

- WebSocket `event_countdown`, Aktion `set_current_special_slide`
- **Nur** `client.role === "presenter"` darf steuern (`applyEventCountdownControl`)
- Broadcast: `event_meta` → Stage + Join + Presenter synchron

```javascript
// server.js — vereinfacht
if (client.role !== "presenter") return { error: "forbidden" };
// applyCurrentSpecialSlide(session, payload.currentSpecialSlide)
```

## Button-Verhalten

| Button | Aktion | Idempotent |
|--------|--------|------------|
| Countdown | `currentSpecialSlide: "countdown"` | Ja |
| Pause | `currentSpecialSlide: "pause"` | Ja |
| Ende | Dialog → `currentSpecialSlide: "end"`, Event `ended` | Ja (nach Ende locked) |

## Dateien

| Datei | Rolle |
|-------|-------|
| `frontend/js/presenterSpecialSlideButtons.js` | Dock-Mount |
| `frontend/js/specialSlideNavCore.js` | Gemeinsame Button-Logik |
| `frontend/js/stage.js` | Nur Render, kein Send |
| `server.js` | `applyCurrentSpecialSlide`, Presenter-only |

## Tests

```bash
npm run test:presenter-special-slide-dock
npm run test:event-special-slides
```

- Presenter-Dock enthält Sonderfolien-Buttons
- Stage enthält **keine** Steuer-UI
- `specialSlideNavCore` — End-Dialog, `updateSpecialSlideButtons`

## Abnahme

- ✅ Drei Sonderfolien-Buttons **nur** im Presenter
- ❌ **Keine** Buttons auf der Stage
- ✅ Stage bleibt professionelle Ausgabefläche
- ✅ Keine Regression bei Countdown, Effekten, Join (Chrome + Safari, Prod v1.5.41)
- **Fortschritt:** `docs/stabilization/abnahme-sonderfolien-v1.5.37-fortschritt.md`
