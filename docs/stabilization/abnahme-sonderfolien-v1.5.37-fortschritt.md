# Abnahme-Fortschritt — Sonderfolien v1.5.37

**Datum:** 2026-09-05  
**Prod:** https://pulse.ringe.us/ · **v1.5.40**  
**Checkliste:** `abnahme-sonderfolien-v1.5.37.md`  
**Test-Event:** Bürgerversammlung Klimaschutz · Join-Code **241184** · Presenter `markus@ringe.us`

---

## Automatisiert / Remote (erledigt)

| # | Prüfung | Ergebnis | Notiz |
|---|---------|----------|-------|
| 0.1 | `test-presenter-special-slide-dock` | ✅ OK | Container v1.5.40 |
| 0.2 | Remote-Smoke 16/16 | ✅ OK | v1.5.40 |
| 0.3 | `/api/health/ready` | ✅ `ok: true` | |
| 0.4 | `test-special-slides-remote` 15/15 | ✅ OK | Container v1.5.40 |
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
| 2 FF / Safari | ☐ Stichprobe |
| 4 Beamer ~3 m | ☐ |
| 5 Screen-Share | ☐ Zoom / Teams / Meet |
| 6 iOS / Android Gerät | ☐ (CSS/Layout Chrome simuliert ✅) |
| 7 Regression kurz | ☐ |
| Pause/Ende vollständig | ☐ Zweites Event mit Sonderfolien-Konfiguration |

**Gesamt-Freigabe:** ☑ **RC Pilot** (Kernpfad Countdown + Folienwechsel + Stage-Sync OK) · ☐ Freigegeben (nach FF/Safari + Pause/Ende-Event)

---

## Nächste Schritte

1. Test-Event mit **Pause + Endfolie** anlegen → 2.2, 2.4–2.5, 3.4–3.5, 6.4 nachholen.
2. Firefox/Safari-Stichprobe Abschnitt 2.
3. Beamer + Screen-Share (Abschnitt 4–5) beim nächsten Pilot.
4. Feature-Freeze 2–3 Tage — nur Bugfixes aus Abnahme.
