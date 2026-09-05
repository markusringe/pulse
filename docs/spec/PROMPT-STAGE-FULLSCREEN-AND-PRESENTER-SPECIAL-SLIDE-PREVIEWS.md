# Stage: Vollbild-Overlay & Presenter: Sonderfolien-Vorschau

> **Stand:** 2026-09-05 · **Basis:** v1.5.42  
> **Architektur:** Presenter = Steuerung · Stage = reine Ausgabe (unverändert)  
> **Bezug:** `PROMPT-PRESENTER-SPECIAL-SLIDES-DOCK.md`, `PROMPT-PRESENTER-COUNTDOWN-STAGE-REDESIGN.md`

---

## Ziel

1. **Stage:** Dezente, auto-ausblendbare Vollbildsteuerung — ohne fachliche Buttons, Screen-Share bleibt leer.
2. **Presenter:** Visuelle Vorschau für Countdown, Pause, Ende — identisch zur Stage, mit „Auf Stage anzeigen“.

---

## A — Stage: Auto-ausblendbare Vollbildsteuerung

### Verhalten

| Trigger | Aktion |
|---------|--------|
| Stage geöffnet / Folie sichtbar | Overlay **3 s** einblenden, dann ausblenden |
| Maus bewegt sich in **Hot Corner** (unten rechts) | Einblenden, Timer **3 s** neu starten |
| **Erster Touch** auf der Stage (Tablet/Touchscreen) | Overlay **einmalig 3 s** einblenden (wie beim Öffnen), danach ausblenden |
| Weitere Touches **außerhalb** Hot Corner | Overlay **nicht** dauerhaft einblenden (kein Vollbild-Chrome auf der Leinwand) |
| Touch in Hot Corner | Wie Maus: einblenden + 3 s Timer |
| 3 s ohne erneuten Trigger | Ausblenden (`opacity` / `visibility`, kein Layout-Shift) |
| Klick/Tap auf Control | `requestFullscreen` / `exitFullscreen` — **nur lokal**, kein WS, kein Event-State |

### Hot Corner

- Fläche: `min(240px, 25vw)` × `min(160px, 22vh)`, unten rechts, an `#view-stage` gebunden
- Nur Bewegung **in** dieser Zone (Maus) re-triggert das Overlay
- Rest der Stage: **kein** sichtbares UI

### Touch (Entscheidung)

- **Erster Touch** irgendwo auf `#view-stage`: kurzes Einblenden (3 s), damit Bedienung ohne Maus möglich ist
- Optional: `pointer: coarse` — Hot Corner für erneutes Einblenden wie Maus
- Kein Dauer-Overlay nach jedem Tap auf Folieninhalt

### Screen-Share

- URL mit `?share=1`: **kein** Vollbild-Control rendern, **kein** Hot-Listener
- Abnahme: geteilte Leinwand 100 % Inhalt

### Vollbild-API

- `Element.requestFullscreen()` / `document.exitFullscreen()`
- Label: bestehende i18n `stage.fullscreen` / `stage.fullscreenExit`
- F10 optional beibehalten (nur wenn Control gemountet)

### Ist → Soll

- Heute: fester `#stage-fs` in `stage.js` / `stage.css`
- Soll: `frontend/js/stageDisplayControls.js` — Mount, Auto-Hide, Hot Corner, Touch, `share=1`-Guard

---

## B — Presenter: Vorschau für Sonderfolien

### Scope

- Buttons: **Countdown**, **Pause**, **Ende** (Dock `#present-special-slide-nav` und/oder Folienleiste `#present-deck`)
- **Ende:** Bestätigungsdialog (`#present-special-end-confirm`) bleibt **zwingend** vor Aktivierung

### Interaktion

| Eingabe | Verhalten |
|---------|-----------|
| **Hover / Focus** (Desktop) | Vorschau-Panel öffnet (Popover/anchored) |
| **Touch** (Presenter-Tablet) | Erster Tap auf Chip/Button: Vorschau öffnet; zweiter Tap auf CTA oder außerhalb schließt (siehe unten) |
| **„Auf Stage anzeigen“** (CTA) | Bestehende Logik: `set_current_special_slide` / `gotoSpecialSlide` — keine neue API |
| **Escape** | Vorschau **schließen**, Fokus zurück auf auslösenden Button |
| **Tab** | Fokus in Vorschau (CTA, Schließen); Fokus-Falle **nicht** modal — nur Popover |

### Tastatur (Entscheidung)

- **Escape** schließt die Vorschau immer (auch wenn Fokus im CTA)
- Auslösender Button behält `aria-expanded="true/false"`
- Kein Verlassen von `#/present` bei Escape

### Vorschau-Inhalt (1:1 Stage)

| Sonderfolie | Anzeige |
|-------------|---------|
| Countdown | Stil (`countdownStyle`), Eventtitel, Zielzeit/Restzeit, Hintergrund |
| Pause | Titel, Untertitel, Stil, Hintergrund |
| Ende | Titel, Untertitel, Stil, Hintergrund |

### Technik

```
frontend/js/
├── stageDisplayControls.js       # A: Vollbild-Overlay
├── presenterSpecialPreview.js    # B: Popover, Events, CTA
└── specialSlides/
    ├── renderSpecialSlide.js     # Gemeinsamer Renderer (Stage + Vorschau)
    ├── countdownRenderer.js      # Tick nur Ziffern/DOM-Patch
    └── specialSlideState.js        # meta → View-Model
```

- **Eine** Render-Pipeline: `mountSpecialSlide` / Logik aus `eventSpecialSlides.js` schrittweise hierher ziehen
- Countdown-Tick: **kein** komplettes Re-Render der Vorschau/Stage — nur Zeit-Text

### UI-Hinweise

- Vorschau skaliert (z. B. max-width/min-height), Inhalt **pixelgleich** zur Stage-Proportion
- Mobil Presenter (375 px): Popover unter Button, scrollbar falls nötig; Touch-Target CTA ≥ 44 px

---

## Abnahmekriterien

| # | Kriterium |
|---|-----------|
| 1 | Stage ohne fachliche Sonderfolien-Buttons (unverändert) |
| 2 | Vollbild-Control nur unten rechts, auto-ausblendbar |
| 3 | Hot Corner + 3 s Inaktivität |
| 4 | Erster Touch: 3 s Einblenden |
| 5 | `?share=1`: kein Vollbild-Control |
| 6 | Presenter: Vorschau Countdown/Pause/Ende |
| 7 | Vorschau visuell = Stage (gemeinsamer Renderer) |
| 8 | Ende: Dialog vor Aktivierung |
| 9 | Escape schließt Vorschau |
| 10 | Tests: Hot Corner, Auto-Hide, share=1, Preview open/close, Escape |

---

## Tests (geplant)

```bash
npm run test:presenter-special-slide-dock   # Regression Stage ohne Steuer-UI
# neu:
# test-stage-display-controls.js
# test-presenter-special-preview.js
```

- Unit/DOM: Overlay sichtbar 3 s nach Mount, hidden danach
- `?share=1`: kein `#stage-fs` / kein Overlay-Root
- Preview: Escape → Panel zu, `aria-expanded=false`
- Renderer: gleicher HTML-Snapshot für Stage-Frame und Preview-Container (fixture meta)

---

## Umsetzungsreihenfolge

1. `specialSlides/*` — Renderer extrahieren, Stage umstellen
2. `stageDisplayControls.js` — inkl. Touch + Hot Corner
3. `presenterSpecialPreview.js` — Hover/Focus/Touch + Escape
4. Tests + Abnahme Chrome/Safari (Stage share=1, Presenter 807435)

---

## Feature-Freeze

Neues UX — nur nach expliziter Freigabe oder nach Stabilisierungsabschluss. Spec darf committet werden; Code in kleinen PRs.
