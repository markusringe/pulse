# Abnahme-Fortschritt — Sonderfolien v1.5.37

**Datum:** 2026-09-05  
**Prod:** https://pulse.ringe.us/ · **v1.5.41**  
**Checkliste:** `abnahme-sonderfolien-v1.5.37.md`  
**Test-Events:**
- **241184** — Bürgerversammlung Klimaschutz (Countdown + Folien, ohne Pause/Ende)
- **807435** — Townhall `ev_29b1623b31d6` (Countdown + Pause + Ende + Folie 1)

Presenter: `markus@ringe.us` · Chrome (Prod)

---

## Automatisiert / Remote (erledigt)

| # | Prüfung | Ergebnis | Notiz |
|---|---------|----------|-------|
| 0.1 | `test-presenter-special-slide-dock` | ✅ OK | Container v1.5.41 |
| 0.2 | Remote-Smoke 16/16 | ✅ OK | v1.5.41 |
| 0.3 | `/api/health/ready` | ✅ `ok: true` | |
| 0.4 | `test-special-slides-remote` 15/15 | ✅ OK | Container v1.5.41 |
| 0.5 | `test-special-slides-ws` | ✅ OK | Presenter steuert, Stage passiv |
| 0.6 | `test:event-special-slides` | ✅ OK | Unit (lokal/CI) |
| — | Prod `stage.js` / `deck.js` | ✅ | Bundle-Check |
| — | Browser Stage `#/stage/…?share=1` | ✅ | 0× `data-pss-kind`, Hilfe-FAB hidden |

---

## Manuell — Browser-Abnahme (2026-09-05, Chrome)

**Login:** Presenter-Konto auf Prod · `#/present/241184` + `#/stage/241184?share=1`

### Abschnitt 2 — Presenter Dock + Folienleiste (Chrome ✅)

| # | Ergebnis | Notiz |
|---|----------|-------|
| 2.1 Countdown-Chip | ✅ | Chip + Dock `aria-pressed=true`, Countdown sichtbar |
| 2.2 Pause-Chip | ⏭ | Event **241184** hat keine Pausefolie konfiguriert (nur Countdown) |
| 2.3 Folie 1 | ✅ | Frage „Welches Thema…“, Countdown-Chip inaktiv |
| 2.4–2.5 Ende-Chip/Dialog | ⏭ | Keine Endfolie am Event — separates Test-Event nötig |
| 2.6 Dock-Sync | ✅ | Countdown-Chip ↔ Dock-Button synchron |
| 2.7 Hilfe `?` | ✅ | Dock-Button „Hilfe“ vorhanden (64×44 px Mobil) |

**Folienleiste:** `[⏱ Countdown] [1]…[12] [+]` — Pause/Ende fehlen wegen Event-Konfiguration, nicht UI-Bug.

### Abschnitt 3 — Stage passiv (Chrome ✅)

| # | normal | share=1 | Notiz |
|---|--------|---------|-------|
| 3.1 Keine Sonderfolien-Buttons | ✅ | ✅ | 0× `[data-pss-kind]` |
| 3.2 Keine Hilfe-FAB | ✅ | ✅ | `help-fab` hidden |
| 3.3 Countdown von Presenter | ✅ | ✅ | „Wir starten in“, Event-Titel, Timer |
| 3.4 Pause | ⏭ | ⏭ | Nicht konfiguriert |
| 3.5 Endfolie | ⏭ | ⏭ | Nicht konfiguriert |
| 3.6 Vollbild `#stage-fs` | ✅ | ✅ | Nur Anzeige-Hilfe, keine Steuerung |
| 3.x WS-Sync Folie 1 | ✅ | ✅ | Stage zeigt dieselbe MC-Frage wie Presenter |

### Abschnitt 6 — Mobile Presenter (Chrome DevTools 375 px ✅)

| # | Ergebnis |
|---|----------|
| 6.1 Folienleiste scrollbar | ✅ `overflow-x: auto` |
| 6.2 Sonder-Chips Icon-only | ✅ `.deck-chip-special-label { display: none }` |
| 6.3 Dock-Buttons | ✅ min. 44 px Höhe |
| 6.4 End-Dialog | ⏭ | Endfolie am Event nicht aktiv |

### Noch offen (physisch / andere Browser)

| Abschnitt | Status |
|-----------|--------|
| 2 FF / Safari | ☐ Stichprobe → [Checkliste](abnahme-ff-safari-stichprobe.md) |
| 4 Beamer ~3 m | ☐ |
| 5 Screen-Share | ☐ Zoom / Teams / Meet |
| 6 iOS / Android Gerät | ☐ (CSS/Layout Chrome simuliert ✅) |
| 7 Regression kurz | ✅ Chrome (siehe Abschnitt 7) |
| Pause/Ende vollständig | ✅ Townhall **807435** (siehe unten) |

**Gesamt-Freigabe:** ☑ **RC Pilot** · ☑ **Funktional freigegeben** (Chrome, v1.5.41 Prod) · ☐ Vollständig (FF/Safari/Beamer/Gerät)

---

## Manuell — Townhall 807435 (2026-09-05, Chrome)

**Konfiguration (PATCH):** `pauseSlide` „Pause“, `endSlide` „Danke“, `startTime` 2099-12-01T18:00Z  
**URLs:** `#/present/807435` · `#/stage/807435` · `#/stage/807435?share=1`

### Abschnitt 2 — Presenter (Townhall ✅)

| # | Ergebnis | Notiz |
|---|----------|-------|
| 2.1 Countdown-Chip | ✅ | Chip + Dock `aria-pressed=true` |
| 2.2 Pause-Chip | ✅ | Chip + Dock synchron, Titel „Pause“ |
| 2.3 Folie 1 | ✅ | „Willkommen — erste Frage“, Sonder-Chips inaktiv |
| 2.4 Ende-Chip | ✅ | Chip aktiv nach Bestätigung |
| 2.5 End-Dialog | ✅ | `#present-special-end-confirm`, Titel „Event wirklich beenden?“, Abbrechen + Bestätigen |
| 2.6 Dock-Sync | ✅ | Chip ↔ Dock für Countdown, Pause, Ende; Dock-Klicks steuern Folienleiste |
| 2.7 Hilfe `?` | ✅ | Dock-Button vorhanden |

**Folienleiste:** `[⏱ Countdown] [⏸ Pause] [1] [+] [✓ Ende]`

### Abschnitt 3 — Stage passiv (Townhall ✅)

| # | normal | share=1 | Notiz |
|---|--------|---------|-------|
| 3.1 Keine Steuer-Buttons | ✅ | ✅ | 0× `[data-pss-kind]` |
| 3.2 Keine Hilfe-FAB | ✅ | ✅ | `help-fab` hidden |
| 3.3 Countdown | ✅ | ✅ | „Townhall“, Timer 2099 (WS-Sync) |
| 3.4 Pause | ✅ | ✅ | Titel „Pause“, Untertitel „Kurze Unterbrechung“ |
| 3.5 Endfolie | ✅ | ✅ | „Danke“ / „Veranstaltung beendet“ |
| 3.6 Vollbild `#stage-fs` | ✅ | ✅ | Nur Anzeige |
| 3.x WS-Sync Folie 1 | ✅ | ✅ | „Willkommen — erste Frage“ (nach `countdownDismissed` + WS) |

**Hinweis:** Bei `startTime` in der Zukunft zeigt Stage nach **Kaltstart** ggf. noch Auto-Countdown, bis WS `event_meta`/`slide` eintrifft oder `countdownDismissed` gesetzt ist. Live-Sync nach Presenter-Aktionen: OK.

### Abschnitt 6 — Mobile Presenter 375 px (Townhall ✅)

| # | Ergebnis |
|---|----------|
| 6.1 Folienleiste scrollbar | ✅ `overflow-x: auto` |
| 6.2 Sonder-Chips Icon-only | ✅ `.deck-chip-special-label { display: none }` |
| 6.3 Dock-Buttons | ✅ 44 px Höhe |
| 6.4 End-Dialog | ✅ Dialog geöffnet (Desktop); nach Event-Ende Chip `is-confirmed` |

**Nach Test:** Event Townhall per Endfolie auf `ended` gesetzt; PATCH `status: active` + `currentSpecialSlide: null` zur Wiederherstellung. Stand geprüft: **`status: active`**.

---

## Abschnitt 7 — Regression kurz (Chrome, 2026-09-05)

| # | Ergebnis | Notiz |
|---|----------|-------|
| 7.1 Folienwechsel Prev/Next | ✅ | **241184**: Folie 2 per Chip, Stage `#/stage/241184?share=1` folgt („Bürgerbeteiligung…“) |
| 7.2 Countdown-Stile Editor | ⏭ | Nicht erneut geändert; Townhall `countdownStyle: classic` auf Stage sichtbar |
| 7.3 Stage-Effekte | ✅ | Townhall `sunrise` / `high`, `#view-stage` dataset, keine JS-Fehler |
| 7.4 Hilfe rollenbasiert | ✅ | Dock „Hilfe“ → Modal „Hilfe für Presenter“ + Link „Vollständige Hilfe“ |

**Prod:** `/api/health/ready` → `ok: true`

**Bugfix deployed v1.5.41:** `frontend/js/stage.js` — `countdownDismissed` beim Stage-Kaltstart aus Session-Metadaten (symmetrisch zu WS `event_meta`).  
**Verifiziert nach Deploy:** `#/stage/807435?share=1` Kaltstart → Folie „Willkommen — erste Frage“, kein Auto-Countdown (Townhall, `countdownDismissed: true`).

**Release:** Tag `v1.5.41` auf GitHub · Release-Body: [RELEASE-v1.5.41-body.md](RELEASE-v1.5.41-body.md) (manuell einfügen — PAT ohne `contents: write`)

---

## Fortsetzung 2026-09-05 (Nachmittag)

| # | Aktion | Ergebnis |
|---|--------|----------|
| — | `git push origin main` (SSH) | ✅ `8a9c9c3`, `34f02ef` auf GitHub |
| — | Prod Health + Remote 15/15 | ✅ v1.5.41 |
| — | `test-presenter-special-slide-dock` (Container) | ✅ |
| — | Stage Kaltstart `#/stage/807435?share=1` | ✅ „Willkommen — erste Frage“, 0× `[data-pss-kind]` |
| — | Firefox + Safari geöffnet (807435) | ☐ Stichprobe manuell → [Checkliste](abnahme-ff-safari-stichprobe.md) |
| — | GitHub Release-Body | ☐ PAT/API 403 — [Body-Vorlage](RELEASE-v1.5.41-body.md) |

**Townhall 807435:** `status: active`, `countdownDismissed: true` — bereit für FF/Safari.

---

## Nächste Schritte

1. Firefox/Safari-Stichprobe → [abnahme-ff-safari-stichprobe.md](abnahme-ff-safari-stichprobe.md) (15–20 Min./Browser).
2. Beamer ~3 m + Screen-Share (Abschnitt 4–5) beim nächsten Pilot.
3. Physische Geräte iOS/Android (Abschnitt 6).
4. Feature-Freeze 2–3 Tage — nur Bugfixes aus Abnahme.
5. GitHub Release: [Neues Release](https://github.com/markusringe/pulse/releases/new?tag=v1.5.41) — Body aus [RELEASE-v1.5.41-body.md](RELEASE-v1.5.41-body.md).
