# Stage-Hintergrundeffekte — Spezifikation (Phase 2)

> **Feature-Freeze:** `stageEffect` ist eine **Neu-Funktion** und erfordert explizite Freigabe außerhalb des Stabilisierungszyklus — analog Countdown-Redesign (`757806e`).  
> **Voraussetzung:** Countdown-/Stage-Redesign auf `main` (Commit `757806e`, Spec `PROMPT-PRESENTER-COUNTDOWN-STAGE-REDESIGN.md`) ist deployed und release-getaggt.

## 1. Ziel

Die Warte-/Countdown-Ansicht auf `#/stage/:code` emotionaler und moderner gestalten — **ohne** Countdown-Lesbarkeit, Live-Sync oder schlanke Architektur zu gefährden.

| Prinzip | Vorgabe |
|---------|---------|
| Technik | **Nur CSS** — Layer mit `transform` und `opacity` |
| Verboten | Canvas-Animationen, Video, Lottie, JS-Animationsengines, externe Libraries |
| Trennung | `countdownStyle` (Typo/Farbe/Rahmen) und `stageEffect` (Bewegung) sind **zwei Felder** |
| Fallback | `prefers-reduced-motion` und `?share=1` → statische Endansicht, keine Bewegung |

---

## 2. Ist-Stand nach Countdown-Redesign (v1.5.27 / `757806e`)

| Bereich | Pfad | Stand |
|---------|------|-------|
| Countdown-Stile | `countdownStyle`: `classic` \| `modern` \| `retro` | CSS-Varianten in `event-countdown.css`, begrenzte visuelle Differenz |
| Stage-Meta | `showStageDateTime`, `showStageQr` | `lib/events.js`, `eventMetaFor()`, WS `event_countdown` |
| Render-Pipeline | `renderCountdownPanel()` | `frontend/js/eventCountdown.js` |
| Screen-Share | `data-stage-mode="share"` | `stage.js` + `stage.css` — größere Typo, Animation aus |
| Presenter | `presenterCountdownControl.js` | Kompakte Leiste statt Vollbild-Overlay |
| QR Stage | Canvas via `qrRender.js` | Funktional; Join-Karte visuell ausbaufähig |
| Fonts | System-Stack / `tabular-nums` | Kein lokales Display-Font-Bundle |

### 2.1 Bekannte Schwächen (Review Stand 2026-09-05)

| Bereich | Einschätzung |
|---------|--------------|
| Classic / Modern / Retro | Stilistisch erkennbar, aber noch nicht stark differenziert |
| Retro | Monospace + Verlauf — noch kein überzeugender Retro-Look |
| Animation | Bestehende BG-Pulse; wenig gestalterische Tiefe |
| Presenter-Leiste | DOM-Neuaufbau pro Tick behoben in Stabilisierungs-Fix (s. Phase A) |

---

## 3. Datenmodell (Vorschlag)

```json
{
  "countdownStyle": "modern",
  "stageEffect": "none",
  "stageEffectIntensity": "medium",
  "showStageDateTime": true,
  "showStageQr": false
}
```

| Feld | Werte | Default |
|------|-------|---------|
| `stageEffect` | `none` \| `sunrise` \| `waterfall` \| `parallax` | `none` |
| `stageEffectIntensity` | `low` \| `medium` \| `high` | `medium` |

- Sanitize serverseitig in `lib/events.js` (Spiegel `lib/eventCountdownMeta.js` oder neues `lib/stageEffectMeta.js`).
- `eventMetaFor()` liefert beide Felder an Stage/Join/Present.
- Live-Änderung im Editor: Bestätigungsdialog wenn Event `active` (wie bei `countdownStyle`).

**Kombinatorik:** Stil und Effekt unabhängig — z. B. „Modern + Sunrise“, „Classic + none“.

---

## 4. Effekte (CSS-only)

| ID | Label | Wirkung | Empfohlene Stil-Kombination |
|----|-------|---------|----------------------------|
| `none` | Keine Animation | Ruhig, formell, maximal zuverlässig | Classic |
| `sunrise` | Sunrise | Warmer Aufbruch — langsam aufsteigender Lichtkegel | Modern |
| `waterfall` | Wasserfall | Kühle seitliche Licht-/Wasserbahnen | Modern |
| `parallax` | Parallaxe | Langsame Tiefe durch abstrakte Layer | Retro, Modern |

### 4.1 DOM-Aufbau Stage (Countdown aktiv)

```html
<div id="stage-event-countdown" class="event-countdown-host"
     data-countdown-style="modern"
     data-stage-effect="sunrise"
     data-stage-effect-intensity="medium">
  <div class="event-countdown-bg" aria-hidden="true"></div>
  <!-- Dekorative Effekt-Layer — aria-hidden, pointer-events: none -->
  <div class="stage-effect stage-effect--sunrise" aria-hidden="true">
    <span class="stage-effect__layer stage-effect__layer--a"></span>
    <span class="stage-effect__layer stage-effect__layer--b"></span>
  </div>
  <div class="event-countdown-panel">…</div>
</div>
```

- Inhalt (Titel, Countdown, QR) bleibt **vor** den Effekt-Layern (`z-index`).
- Effekt-Layer: `position: absolute; inset: 0; pointer-events: none; aria-hidden`.

### 4.2 CSS-Umsetzungsvorgaben

**Sunrise**
- 2–3 radial/linear Gradients als Pseudo-Layer
- `@keyframes stage-sunrise-rise` — `transform: translateY()` + `opacity` über 18–24 s, `animation-timing-function: ease-in-out`, `alternate infinite`
- Intensity steuert Opazität und Amplitude (low: 4 %, medium: 8 %, high: 12 %)

**Wasserfall**
- Vertikale Streifen via `repeating-linear-gradient` auf schmalen Layern
- `@keyframes stage-waterfall-drift` — `transform: translateX()` langsam
- Max. 2 animierte Layer

**Parallaxe**
- 2 abstrakte Blob-Formen (`border-radius`, `filter: blur()`)
- Gegensätzliche `@keyframes` auf `transform: translate3d()` — unterschiedliche Dauer (30 s / 45 s)

**Performance-Budget**
- Max. **3** animierte Layer gleichzeitig
- Nur `transform` und `opacity` animieren — **kein** `filter`-Animation, **kein** `box-shadow`-Animation
- `will-change: transform` sparsam, nur auf Effekt-Layern

**Reduced motion / Share**

```css
@media (prefers-reduced-motion: reduce),
       ([data-stage-mode="share"] .event-countdown-host) {
  .stage-effect__layer { animation: none !important; }
  /* Statisches hochwertiges Gradient-Endbild beibehalten */
}
```

---

## 5. Event-Editor UI

- **Separate Sektion** „Hintergrundeffekt“ — **nicht** in die Stil-Karten mischen.
- Vier Karten mit Mini-Vorschau (CSS-Klasse in Editor, gleiche Tokens wie Stage):
  - Keine Animation, Sunrise, Wasserfall, Parallaxe
- Optional: Intensity als drei Radio-Buttons (Niedrig / Mittel / Hoch).
- Live-Event: Dialog „Publikum sieht die Änderung sofort auf der Stage“.

Dateien: `frontend/js/events.js`, `frontend/css/event-countdown.css` (Editor-Karten), i18n de/en/fr.

---

## 6. Backend & Sync

### 6.1 Persistenz

- `sanitizeEvent` / `patchEventMeta` erweitern
- WS `event_countdown` optional: `set_stage_effect`, `set_stage_effect_intensity` (Presenter only)
- Oder PATCH `/api/events/:id` + `announceEventMeta()`

### 6.2 Rechte

- Nur `role: presenter` darf Effekt live toggeln (wie `showStageQr`)
- Stage-Clients: read-only via `event_meta`

---

## 7. QR-Join-Karte (optional, Phase 2b)

Visuelle Verbesserung ohne neues Datenfeld:

```html
<div class="event-countdown-qr-card">
  <canvas …></canvas>
  <p class="event-countdown-qr-url">pulse.example/j/123456</p>
  <p class="event-countdown-qr-hint">Scannen zum Beitreten</p>
</div>
```

Kurz-URL aus `joinUrlFromLocation()` — keine Secrets im QR.

---

## 8. Tests & Abnahme

| Test | Inhalt |
|------|--------|
| `scripts/test-stage-effect.js` | Sanitize, Defaults, `eventMetaFor`, `patchEventMeta` |
| Erweiterung `test-events.js` | Migration Defaults |
| Presenter-Control | Kein doppeltes Interval, kein Listener-Leak bei wiederholten `syncPresenterCountdownControl()` |
| Manuell Beamer | 16:9, 3 m Abstand, Kontrast AA |
| Manuell VC | Teams/Zoom Screen-Share, `?share=1` statisch |
| Manuell Reconnect | Stage offen, Presenter ändert Effekt — `event_meta` sync |

**Abnahmekriterien**
- [ ] Keine doppelten Effekt-Layer nach Reconnect/Re-render
- [ ] Countdown-Ziffern bleiben sekundengenau und lesbar
- [ ] `prefers-reduced-motion`: keine Bewegung
- [ ] Share-Modus: keine Animation, größere Typo unverändert
- [ ] Lighthouse/Performance: kein spürbarer Jank auf Mittelklasse-Laptop

---

## 9. Implementierungsphasen

### Phase A — Stabilisierung (freeze-konform)

1. Presenter-Leiste: Mount-once, Tick nur Text-Update (kein `innerHTML` pro Sekunde)
2. Release-Tag für Countdown-Redesign (`v1.5.28` o. ä.)
3. Browser-/Reconnect-Smoke auf Prod

### Phase B — Stil-Polish (geringer Scope, Freigabe optional)

- Classic / Modern / Retro visuell schärfen — **ohne** neue Bewegung
- QR-Join-Karte mit Kurz-URL
- Optional: lokale WOFF2 Display-Fonts (`tabular-nums` beibehalten)

### Phase C — `stageEffect` (Produkt, explizite Freigabe)

1. Datenmodell + Editor-Karten
2. **Sunrise** zuerst (einfachster Effekt, Beamer-tauglich)
3. Wasserfall + Parallaxe nach Performance-Abnahme
4. WS-Live-Toggle (optional, Presenter)

---

## 10. Referenz-Commits

| Commit | Inhalt |
|--------|--------|
| `757806e` | Countdown-Stile, Stage-QR, Presenter-Leiste, Share-Modus |
| (geplant) | Presenter-Control Stabilisierung, Release-Tag |
| (geplant) | `stageEffect` Phase C |

---

## 11. Nicht-Ziele

- Keine JavaScript-Partikel-Engines
- Keine Video-Hintergründe
- Keine Abhängigkeit von CDN-Fonts für Effekte
- Keine Verschmelzung von Stil + Effekt in einem Enum (unwartbar bei N×M-Kombinationen)
