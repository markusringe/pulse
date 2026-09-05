# Presenter-Countdown & Stage-Redesign — Spezifikation

> **Feature-Freeze (Stabilisierungszyklus):** Dieses Dokument ist die umsetzungsbereite Spezifikation.  
> Die beschriebenen **Neu-Funktionen** (Countdown-Stile, QR auf Stage, Countdown-Editor, Screen-Sharing-Modus) erfordern eine **explizite Freigabe** außerhalb des Freezes — analog Mailgun/Hilfe Phase 2.  
> Freeze-konform vor Umsetzung: Bugfixes, Deduplizierung doppelter Renderpfade, A11y-Kontrast, Tests ohne neue Produktfläche.

## 1. Ziel

Countdown und Präsentations-Leinwand (`#/stage/:code`) für **Beamer**, **Videokonferenz-Screen-Share** und **mobile Teilnehmer** optimieren — ohne Admin-Controls oder technische Details auf der öffentlichen Stage.

| Zielgruppe | Route | Darstellung |
|------------|-------|-------------|
| Publikum (Beamer/VC) | `#/stage/:code` | Eventname, Status, Countdown, Datum/Uhrzeit, optional QR, Branding |
| Presenter | `#/present/:code` | Steuerung + Vorschau, **keine** Controls in geteiltem Stage-Fenster |
| Teilnehmer | `#/join/:code` | Interaktionen, keine überladene Stage |

---

## 2. Ist-Stand im Repo (Pulse v1.5.27)

| Bereich | Pfad | Stand |
|---------|------|-------|
| Countdown-Logik | `frontend/js/eventCountdown.js` | `remainingMs`, `mountCountdown`, `countdownHtml`, Urgency-Stufen |
| Stage (Screen-Share) | `frontend/js/stage.js` | WS-Rolle `stage`, Countdown via `mountCountdown`, Logo/Footer aus Branding |
| Presenter | `frontend/js/app.js` | Countdown auf Presenter-View, „Los geht's“, Lobby-QR im Presenter-Panel |
| Event-Modell | `lib/events.js` | `startTime`, `eventImage`, `countdownDismissed`, `countdownActive` |
| Server | `server.js` | WS `event_countdown`, `eventMeta` an Session |
| CSS Countdown | `frontend/css/event-countdown.css` | Ein Stil, Gradient/Hintergrundbild, Urgency-Farben |
| CSS Stage | `frontend/css/stage.css` | `#view-stage`, Vollbild, Pause-Overlay |
| Event-Editor | `frontend/js/events.js` | `startTime`, `eventImage`, kein Style-Picker |
| QR | `frontend/js/qrRender.js` | QR nur Presenter/Lobby — **nicht** auf `#/stage` |
| Branding Stage | `lib/branding.js` | `stageShowLogo`, `stageShowFooter` (Admin-Einstellungen) |
| Fonts | — | System-Stack / Theme-Variablen, **kein** lokales Font-Bundle |

**Bekannte Lücke:** Countdown wird an mehreren Stellen gerendert (Stage, Presenter, Startseite) — Spec verlangt **bereinigte, gemeinsame Render-Pipeline**.

---

## 3. Countdown-Stile im Event-Editor

### 3.1 Drei Stile (persistiert)

| ID | Label | Charakter | Einsatz |
|----|-------|-----------|---------|
| `classic` | Klassisch | Seriös, ruhig, behördlich | Formelle Sitzungen, öffentliche Veranstaltungen |
| `modern` | Modern (**Standard**) | Zeitgemäß, wertig, lebendig | Townhalls, Produkt-Events, VC |
| `retro` | Retro | Charaktervoll, spielerisch | Workshops, lockere Formate |

**Datenmodell (Vorschlag):**

```json
{
  "countdownStyle": "modern",
  "showStageDateTime": true,
  "showStageQr": false
}
```

- Feld `countdownStyle` in Event-Record (`lib/events.js`), Migration Default `modern` für bestehende Events.
- Sanitize: nur `classic` | `modern` | `retro`.

### 3.2 UI Event-Editor

- **Kein reines Dropdown** — drei **Karten mit Mini-Vorschau** (live CSS-Variante oder statisches Mock).
- Auswahl beim Anlegen und Bearbeiten (`frontend/js/events.js`).
- **Live-Änderung:** Dialog „Publikum sieht die Änderung sofort auf der Stage“ — nur Presenter/Editor.

### 3.3 Anwendung

```html
<main class="stage" data-countdown-style="modern">
```

Countdown-Host und Stage-Frame lesen `eventMeta.countdownStyle` (WS + REST).

---

## 4. Stage-Anzeige (Beamer & Video-Share)

### 4.1 Informationshierarchie (nur `#/stage`)

1. **Eventname** — Orientierung („richtige Veranstaltung“)
2. **Status** — „Wir starten in …“, „Pause“, „Beginnt gleich“
3. **Countdown** — sehr groß, sekundengenau (`tabular-nums`)
4. **Datum & Uhrzeit** — formatiert, ohne Sekunden
5. **QR-Code** (optional) — öffentliche Join-URL
6. **Branding** — Logo dezent (bestehend: `stageShowLogo`)

### 4.2 Explizit verboten auf Stage

- Admin-Controls, Session-IDs, API-/WS-Status
- Presenter-Buttons („Los geht's“ nur im Presenter-Fenster, nicht auf Stage)
- Passwörter, Admin-Token, Cookies im QR

### 4.3 Datum & Uhrzeit

- **Standard: an** (`showStageDateTime: true`, ausblendbar im Editor)
- Format: `Intl.DateTimeFormat` mit Event-Zeitzone + UI-Sprache (`frontend/js/i18n.js`)
- **Beispiel DE:** `Samstag, 5. September 2026 · 09:30 Uhr`
- **Keine Sekunden** — Konkurrenz zum Countdown vermeiden
- Schrift groß genug für VC-Kacheln (clamp + Screen-Sharing-Modus)

Implementierung: Hilfsfunktion `formatEventStartDisplay(startTime, locale, timeZone)` in `eventCountdown.js` oder `lib/eventDisplay.js`.

---

## 5. Presenter-Control (Countdown-Editor)

### 5.1 UI-Elemente

| Element | Beschreibung |
|---------|--------------|
| Große Zeit | `tabular-nums`, Restzeit bis `startTime` |
| Status-Pille | Bereit · Läuft · Pausiert · Abgelaufen |
| Controls | Start (bestehend „Los geht's“), Pause/Fortsetzen, Zurücksetzen |
| Zeit-Editor (Popover) | Presets 1–30 min, Min+Sek-Eingabe, optional ±30s |
| Sync-Status | „Synchronisiert“ / „Verbindung wird hergestellt …“ |
| Stage-Vorschau | „Stage in neuem Fenster öffnen“ → `#/stage/:code` |
| Screen-Sharing-Modus | Größere Ränder, weniger Animation, größere Typo |

### 5.2 Validierung Countdown-Dauer (manueller Timer vs. Event-Start)

- Event-Countdown: `startTime` in der Zukunft (bestehend)
- Optionaler **manueller Presenter-Timer** (falls separat): 1 s – 4 h
- Popover-Validierung clientseitig + serverseitig bei PATCH Event

### 5.3 Dateien

- Neues Modul `frontend/js/presenterCountdownControl.js` (Presenter-Leiste)
- Anbindung WS `event_countdown` in `app.js` / `server.js`
- Keine Duplikation von `mountCountdown`-Markup — gemeinsame `renderCountdownPanel()` in `eventCountdown.js`

---

## 6. QR-Code auf der Bühne

### 6.1 Zwei Toggles

| Ort | Feld | Verhalten |
|-----|------|-----------|
| Event-Editor | `showStageQr` (persistiert) | Default aus |
| Presenter-Control | Live-Toggle | WS an Stage, sofort sichtbar |

### 6.2 Sicherheit

- QR encodiert nur **öffentliche Join-URL** (`joinUrlFromLocation` / `sessionCode`)
- Keine Admin-Keys, keine Auth-Cookies
- Toggle nur für Presenter/Editor (`canManageSession` / Event-Admin)
- Join-View zeigt Toggle **nicht**

### 6.3 Technik

- Canvas wie `qrRender.js`, auf Stage unter Countdown platziert
- `eventMeta.showStageQr` via WS `event_countdown` oder dediziertes `event_meta`-Envelope

---

## 7. Style-System (CSS-Variablen)

### 7.1 Tokens (pro `data-countdown-style`)

```css
/* Basis — in event-countdown.css / stage.css */
.stage,
.event-countdown-host {
  --stage-bg: …;
  --stage-surface: …;
  --stage-text: #fff;
  --stage-muted: …;
  --stage-accent: var(--primary-color, #007cc1);
  --stage-warning: …;
  --stage-progress: …;
  --stage-radius: 1rem;
  --stage-shadow: …;
}

[data-countdown-style="classic"] { /* ruhige Flächen, wenig Animation */ }
[data-countdown-style="modern"] { /* Standard, leichte Bewegung */ }
[data-countdown-style="retro"] { /* monospace-Akzente, Pixel/Retro optional */ }
```

### 7.2 Anforderungen

- Hell/Dunkel (`prefers-color-scheme`) + Branding-Farben
- **WCAG AA** Kontrast — bei Branding-Override Fallback auf sichere Defaults (`lib/branding.js` / `docs/contrast.md`)
- `prefers-reduced-motion`: Animationen abschalten (bestehend teilweise in `event-countdown.css` prüfen)

---

## 8. Beamer- & VC-Optimierung

| Szenario | Maßnahmen |
|----------|-----------|
| Beamer 16:9 | `clamp()` Typo, hoher Kontrast, keine feinen Linien < 2 px |
| Zoom/Teams/Meet | Screen-Sharing-Modus, wenig visuelles Rauschen |
| Mobile TN | Stage synchron, Interaktion in Join-View — Stage nicht überladen |

**Screen-Sharing-Modus:** URL-Parameter `?share=1` oder Presenter-Toggle setzt `data-stage-mode="share"` auf `#view-stage`.

---

## 9. Lokale Fonts (ohne CDN)

- Fonts unter `frontend/assets/fonts/` (WOFF2)
- `@font-face` in `frontend/css/fonts.css`, Import in `index.html`
- `asset-manifest.json` / `scripts/build-asset-manifest.js` einbinden
- **tabular-nums** für Countdown-Ziffern (Font-Feature oder system-ui fallback)

---

## 10. Backend & Sync

### 10.1 Event-Felder (Migration)

```javascript
// lib/events.js — sanitizeEvent / publicEventCard
countdownStyle: "modern" | "classic" | "retro",
showStageDateTime: boolean,
showStageQr: boolean,
```

- Rückwärtskompatibel: fehlende Felder → Defaults
- `scripts/test-events.js` erweitern

### 10.2 WebSocket

Bestehend: `event_countdown` — Payload erweitern um:

```json
{
  "type": "event_countdown",
  "payload": {
    "countdownDismissed": false,
    "countdownStyle": "modern",
    "showStageDateTime": true,
    "showStageQr": false,
    "startTime": "2026-09-05T07:30:00.000Z"
  }
}
```

Stage-Clients (`role: stage`) und Join erhalten gefiltertes `eventMeta` (keine Admin-Felder).

---

## 11. Implementierungsphasen

### Phase A — Freeze-konform (Stabilisierung)

- [ ] Doppelte Countdown-Renderpfade in `eventCountdown.js` / `stage.js` / `app.js` konsolidieren
- [ ] Kontrast-/A11y-Fixes bestehender Countdown-CSS
- [ ] Unit-Tests für `formatEventStartDisplay`, `remainingMs` (bereits teilweise in Tests)
- [ ] Doku: `docs/contrast.md` Stage-Abschnitt

### Phase B — Produkt (Freigabe erforderlich)

- [ ] Event-Felder + Migration + Editor-Karten
- [ ] Drei CSS-Stile + Mini-Vorschau
- [ ] Stage-Hierarchie (Titel, Status, Datum, QR)
- [ ] Presenter Countdown-Control + Popover-Editor
- [ ] QR Stage-Toggle (Editor + live)
- [ ] Screen-Sharing-Modus
- [ ] Lokale Fonts

### Phase C — Qualitätssicherung

- [ ] `scripts/test-events.js` — neue Felder
- [ ] `scripts/test-stage-countdown.js` (neu) — HTML-Snapshot / DOM-Logik
- [ ] Manuell: Beamer, VC-Screen-Share, reduced-motion, DE/EN/FR
- [ ] `npm run acceptance:public` — Stage-Route

---

## 12. Tests (Checkliste)

### Unit

- `countdownStyle` Sanitize (ungültig → `modern`)
- `formatEventStartDisplay` — DE/EN, ohne Sekunden
- `shouldShowCountdown` + `showStageQr` Kombinationen
- QR-URL enthält kein `adminKey`

### E2E / Browser

- Event anlegen → Style-Karte wählen → Stage zeigt gewählten Stil
- Presenter toggelt QR → Stage aktualisiert ohne Reload
- Style-Wechsel live → Bestätigungsdialog
- `#/stage/:code` — keine Presenter-Buttons im DOM

### Beamer / VC (manuell)

- [ ] 3 m Lesbarkeit Eventtitel + Countdown
- [ ] Zoom geteiltes Fenster: Datum lesbar
- [ ] Dunkler Raum / heller Raum

---

## 13. Commit-Vorlage

```
feat(stage): Countdown-Stile und Beamer-Ansicht modernisieren

- doppelte Countdown-Renderpfade und Timer bereinigt
- drei persistente Event-Stile ergänzt: classic, modern, retro
- Stage für Beamer und Videokonferenzen mit Titel, Begrüßung, Datum/Uhrzeit optimiert
- QR-Code sicher und live auf der Bühne ein-/ausblendbar
- lokales Font-Setup und Asset-Manifest-Integration ergänzt
- Countdown-Editor, Echtzeit-Sync, Accessibility und E2E-Tests erweitert
```

*(Nur nach expliziter Freigabe außerhalb Feature-Freeze committen.)*

---

## 14. Referenzen im Repo

- `frontend/js/eventCountdown.js` — Countdown-Kern
- `frontend/js/stage.js` — Präsentations-Leinwand
- `frontend/js/events.js` — Event-Editor
- `lib/events.js` — Event-Datenmodell
- `server.js` — `event_countdown`, `eventMetaForSession`
- `docs/contrast.md` — Kontrast-Richtlinien
- `frontend/help/interaction-control.html` — Interaktionssteuerung (Presenter)
- `docs/feature-freeze.md` — Stabilisierungsregeln
