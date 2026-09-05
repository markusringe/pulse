# Abnahme-Checkliste — Sonderfolien & Presenter/Stage (v1.5.37+)

**Stand:** 2026-09-05 · Prod `https://pulse.ringe.us` · Zielversion **v1.5.41**  
**Architektur:** Presenter = Steuerung · Stage = reine Ausgabe  
**Fortschritt (Detail):** [abnahme-sonderfolien-v1.5.37-fortschritt.md](abnahme-sonderfolien-v1.5.37-fortschritt.md)  
**Ergänzt:** `smoke-checklist.md`, `prod-freigabe-checkliste.md`

Legende: `[ ]` offen · `[x]` OK · `[!]` Fehler (Ticket/Commit notieren)

**Test-Events (Prod):** **807435** Townhall (Countdown + Pause + Ende) · **241184** Bürgerversammlung (Countdown + Folien)

---

## 0 — Automatisiert (vor manueller Abnahme)

```bash
npm run test:presenter-special-slide-dock
npm run test:event-special-slides
npm run test:special-slides-remote -- --url https://pulse.ringe.us --expect-version 1.5.41
npm run test:special-slides-ws
npm run smoke:remote -- --url https://pulse.ringe.us --expect-version 1.5.41
```

| # | Erwartung | Status |
|---|-----------|--------|
| 0.1 | `test-presenter-special-slide-dock` → OK | [x] |
| 0.2 | Remote-Smoke 16/16, Version 1.5.41 | [x] |
| 0.3 | `/api/health/ready` → `"ok": true` | [x] |
| 0.4 | `test-special-slides-remote` 15/15 | [x] |
| 0.5 | `test:special-slides-ws` → OK | [x] |

---

## 1 — Test-Event vorbereiten

| Feld | Wert (807435 Townhall) |
|------|------------------------|
| Startzeit | 2099-12-01 (Countdown) |
| Pausefolie | aktiviert, Titel „Pause“ |
| Endfolie | aktiviert, Titel „Danke“ |
| Countdown-Stil | classic |

Join-Code **807435** · Presenter `#/present/807435` · Stage `#/stage/807435?share=1`

---

## 2 — Presenter: Dock + Folienleiste (Desktop)

Browser: **Chrome** ✅ · **Safari** ✅ · **Firefox** ☐ (Stichprobe offen)

### Folienleiste (`#present-deck`)

| # | Aktion | Erwartung | Chrome | FF | Safari |
|---|--------|-----------|--------|-----|--------|
| 2.1 | Countdown-Chip klicken | Stage/Presenter zeigen Countdown; Chip aktiv | [x] | [ ] | [x] |
| 2.2 | Pause-Chip klicken | Pausefolie sichtbar; Chip aktiv | [x] | [ ] | [x] |
| 2.3 | Folie `1` klicken | Reguläre Folie; Sonder-Chips inaktiv | [x] | [ ] | [x] |
| 2.4 | Ende-Chip klicken | Bestätigungsdialog erscheint | [x] | [ ] | [x] |
| 2.5 | Ende bestätigen | Event `ended`; Ende-Chip dauerhaft hervorgehoben | [x] | [ ] | [~] |

*(2.5: Townhall getestet; nach Test wieder `status: active`. Safari: Abbrechen bestätigt, vollständiges Beenden optional.)*

### Dock (`#present-special-slide-nav`)

| # | Aktion | Erwartung | Chrome | FF | Safari |
|---|--------|-----------|--------|-----|--------|
| 2.6 | Countdown/Pause/Ende im Dock | Gleicher Zustand wie Folienleiste (sync) | [x] | [ ] | [x] |
| 2.7 | Hilfe-Button `?` | Hilfe-Modal öffnet, rollengefiltert | [x] | [ ] | [x] |

---

## 3 — Stage: rein passive Ausgabe

Townhall **807435** · Tabs normal + `?share=1`

| # | Prüfung | Erwartung | normal | share=1 |
|---|---------|-----------|--------|---------|
| 3.1 | Keine Sonderfolien-Buttons | Kein FAB, keine Countdown/Pause/Ende-Steuerung | [x] | [x] |
| 3.2 | Keine Hilfe-FAB | Kein schwebender Hilfe-Button | [x] | [x] |
| 3.3 | Countdown von Presenter aus | Stage wechselt passiv mit | [x] | [x] |
| 3.4 | Pause von Presenter aus | Pausefolie auf Stage | [x] | [x] |
| 3.5 | Endfolie von Presenter aus | Endfolie auf Stage | [x] | [x] |
| 3.6 | Vollbild-Button `#stage-fs` | Nur Anzeige-Hilfe, keine Event-Steuerung | [x] | [x] |

**v1.5.41:** Kaltstart `#/stage/807435?share=1` respektiert `countdownDismissed` (kein Auto-Countdown nach Reload).

---

## 4 — Beamer / Projektor (~3 m Lesbarkeit)

| # | Prüfung | Erwartung | OK |
|---|---------|-----------|-----|
| 4.1 | Folientitel / Frage | Aus ~3 m lesbar | [ ] |
| 4.2 | Countdown-Ziffern | Gut erkennbar (Stil Modern/Classic/Retro) | [ ] |
| 4.3 | Pause- & Endfolie | Titel + Untertitel kontrastreich | [ ] |
| 4.4 | QR-Join-Karte (falls aktiv) | Scannbar aus Nahbereich | [ ] |
| 4.5 | Hintergrundeffekt (optional) | Kein Flackern, Text bleibt lesbar | [ ] |
| 4.6 | **Keine UI-Chrome** | Keine Buttons/Leisten auf der Leinwand | [ ] |

*Beim nächsten Pilot vor Ort.*

---

## 5 — Screen-Share (Videokonferenz)

| # | Tool | Aktion | Erwartung | OK |
|---|------|--------|-----------|-----|
| 5.1 | Zoom / Teams / Meet | Stage-Tab teilen | Nur Folien/Countdown/Pause/Ende sichtbar | [ ] |
| 5.2 | — | Countdown → Pause → Folie 1 (Presenter) | Geteilte Ansicht folgt ohne Fensterwechsel | [ ] |
| 5.3 | — | Presenter bleibt in `#/present` | Steuerung aus Dock oder Folienleiste | [ ] |
| 5.4 | — | Teilnehmer-Join parallel | Join weiterhin möglich (bis Event-Ende) | [ ] |

---

## 6 — Mobile Presenter (Stichprobe)

| # | Prüfung | Erwartung | iOS | Android |
|---|---------|-----------|-----|---------|
| 6.1 | Folienleiste horizontal scrollbar | Alle Chips erreichbar | [ ] | [ ] |
| 6.2 | Sonder-Chips | Icon-only, tippbar | [~] | [ ] |
| 6.3 | Dock-Buttons | Bedienbar, min. ~44 px | [~] | [ ] |
| 6.4 | End-Dialog | Modal vollständig sichtbar | [ ] | [ ] |

*[~] Chrome DevTools 375 px (Townhall) — physische Geräte offen.*

---

## 7 — Regression (kurz)

| # | Bereich | Erwartung | OK |
|---|---------|-----------|-----|
| 7.1 | Folienwechsel Prev/Next | Reguläre Folien, WS-Sync zu Join | [x] |
| 7.2 | Countdown-Stile im Event-Editor | Änderung auf Stage sichtbar | [~] |
| 7.3 | Stage-Effekte | Sunrise/Wasserfall/Parallaxe ohne JS-Fehler | [x] |
| 7.4 | Hilfe rollenbasiert | `#/help` — nur erlaubte Artikel | [x] |

---

## Ergebnis

| Feld | Wert |
|------|------|
| Datum | 2026-09-05 |
| Version Prod | **v1.5.41** |
| Tester | markus |
| Browser | Chrome ✅ · Firefox ☐ · Safari ✅ |
| Beamer | Nein (offen) |
| Screen-Share | — (offen) |

**Gesamt:** ☐ Freigegeben · ☑ **RC Pilot** (Chrome + Safari, Prod v1.5.41) · ☐ Nicht freigegeben

**Bemerkungen:**

```
Bugfix v1.5.41: stage.js countdownDismissed beim Kaltstart.
Firefox-Stichprobe + Beamer/Screen-Share/physische Mobilgeräte offen.
Details: abnahme-sonderfolien-v1.5.37-fortschritt.md
```

---

## Referenzen

- Spec: `docs/spec/PROMPT-PRESENTER-SPECIAL-SLIDES-DOCK.md`
- Changelog: `docs/stabilization/CHANGELOG-v1.5.41.md`
- Release: https://github.com/markusringe/pulse/releases/tag/v1.5.41
- FF/Safari-Stichprobe: [abnahme-ff-safari-stichprobe.md](abnahme-ff-safari-stichprobe.md)
