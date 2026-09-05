# Abnahme-Checkliste — Sonderfolien & Presenter/Stage (v1.5.37+)

**Stand:** 2026-09-05 · Prod `https://pulse.ringe.us` · Zielversion **v1.5.40**  
**Architektur:** Presenter = Steuerung · Stage = reine Ausgabe  
**Ergänzt:** `smoke-checklist.md` (allgemeiner Pilot-Gate), `prod-freigabe-checkliste.md`

Legende: `[ ]` offen · `[x]` OK · `[!]` Fehler (Ticket/Commit notieren)

---

## 0 — Automatisiert (vor manueller Abnahme)

```bash
npm run test:presenter-special-slide-dock
npm run test:event-special-slides
npm run test:special-slides-remote -- --url https://pulse.ringe.us --expect-version 1.5.40
npm run test:special-slides-ws
npm run smoke:remote -- --url https://pulse.ringe.us --expect-version 1.5.40
```

| # | Erwartung | Status |
|---|-----------|--------|
| 0.1 | `test-presenter-special-slide-dock` → OK | [x] |
| 0.2 | Remote-Smoke 16/16, Version 1.5.40 | [ ] |
| 0.3 | `/api/health/ready` → `"ok": true` | [x] |
| 0.4 | `test-special-slides-remote` 15/15 | [ ] |
| 0.5 | `test-special-slides-ws` → OK | [ ] |

---

## 1 — Test-Event vorbereiten

Event mit mindestens **2 regulären Folien** und Sonderfolien-Konfiguration:

| Feld | Wert (Beispiel) |
|------|-----------------|
| Startzeit | in der Zukunft (Countdown sichtbar) |
| Pausefolie | aktiviert, Titel gesetzt |
| Endfolie | aktiviert, Titel gesetzt |
| Countdown-Stil | z. B. Modern |

Notieren: Join-Code `______` · Presenter-URL `#/present/<code>` · Stage-URL `#/stage/<code>`

---

## 2 — Presenter: Dock + Folienleiste (Desktop)

Browser: **Chrome** (Pflicht), danach **Firefox** und **Safari** (Stichprobe).

**Einloggen** als Presenter/Admin, dann `#/present/<code>` öffnen.

### Folienleiste (`#present-deck`)

Reihenfolge von links:

```
[⏱ Countdown] [⏸ Pause] [1] [2] … [+] [✓ Ende]
```

| # | Aktion | Erwartung | Chrome | FF | Safari |
|---|--------|-----------|--------|-----|--------|
| 2.1 | Countdown-Chip klicken | Stage/Presenter zeigen Countdown; Chip aktiv | [ ] | [ ] | [ ] |
| 2.2 | Pause-Chip klicken | Pausefolie sichtbar; Chip aktiv | [ ] | [ ] | [ ] |
| 2.3 | Folie `1` klicken | Reguläre Folie; Sonder-Chips inaktiv | [ ] | [ ] | [ ] |
| 2.4 | Ende-Chip klicken | Bestätigungsdialog erscheint | [ ] | [ ] | [ ] |
| 2.5 | Ende bestätigen | Event `ended`; Ende-Chip dauerhaft hervorgehoben | [ ] | [ ] | [ ] |

*(Für 2.4–2.5 ggf. zweites Test-Event ohne vorheriges Beenden nutzen.)*

### Dock (`#present-special-slide-nav`)

| # | Aktion | Erwartung | Chrome | FF | Safari |
|---|--------|-----------|--------|-----|--------|
| 2.6 | Countdown/Pause/Ende im Dock | Gleicher Zustand wie Folienleiste (sync) | [ ] | [ ] | [ ] |
| 2.7 | Hilfe-Button `?` | Hilfe-Modal öffnet, rollengefiltert | [ ] | [ ] | [ ] |

---

## 3 — Stage: rein passive Ausgabe

Zwei Tabs: **Stage normal** und **Stage Screen-Share**.

| URL | Zweck |
|-----|--------|
| `#/stage/<code>` | Presenter-Vorschau (optional Vollbild) |
| `#/stage/<code>?share=1` | Geteilte Leinwand (Zoom/Teams/Meet) |

| # | Prüfung | Erwartung | normal | share=1 |
|---|---------|-----------|--------|---------|
| 3.1 | Keine Sonderfolien-Buttons | Kein FAB, keine Countdown/Pause/Ende-Steuerung | [ ] | [ ] |
| 3.2 | Keine Hilfe-FAB | Kein schwebender Hilfe-Button | [ ] | [ ] |
| 3.3 | Countdown von Presenter aus | Stage wechselt passiv mit | [ ] | [ ] |
| 3.4 | Pause von Presenter aus | Pausefolie auf Stage | [ ] | [ ] |
| 3.5 | Endfolie von Presenter aus | Endfolie auf Stage | [ ] | [ ] |
| 3.6 | Vollbild-Button `#stage-fs` | Nur Anzeige-Hilfe, keine Event-Steuerung | [ ] | [ ] |

---

## 4 — Beamer / Projektor (~3 m Lesbarkeit)

Setup: Stage auf **zweitem Monitor** oder Beamer, `#/stage/<code>?share=1` empfohlen.

| # | Prüfung | Erwartung | OK |
|---|---------|-----------|-----|
| 4.1 | Folientitel / Frage | Aus ~3 m lesbar | [ ] |
| 4.2 | Countdown-Ziffern | Gut erkennbar (Stil Modern/Classic/Retro) | [ ] |
| 4.3 | Pause- & Endfolie | Titel + Untertitel kontrastreich | [ ] |
| 4.4 | QR-Join-Karte (falls aktiv) | Scannbar aus Nahbereich | [ ] |
| 4.5 | Hintergrundeffekt (optional) | Kein Flackern, Text bleibt lesbar | [ ] |
| 4.6 | **Keine UI-Chrome** | Keine Buttons/Leisten auf der Leinwand | [ ] |

---

## 5 — Screen-Share (Videokonferenz)

Presenter am Laptop; geteilte Ansicht = Stage (`?share=1`).

| # | Tool | Aktion | Erwartung | OK |
|---|------|--------|-----------|-----|
| 5.1 | Zoom / Teams / Meet | Stage-Tab teilen | Nur Folien/Countdown/Pause/Ende sichtbar | [ ] |
| 5.2 | — | Countdown → Pause → Folie 1 (Presenter) | Geteilte Ansicht folgt ohne Fensterwechsel | [ ] |
| 5.3 | — | Presenter bleibt in `#/present` | Steuerung aus Dock oder Folienleiste | [ ] |
| 5.4 | — | Teilnehmer-Join parallel | Join weiterhin möglich (bis Event-Ende) | [ ] |

---

## 6 — Mobile Presenter (Stichprobe)

Viewport **375 px** (iOS Safari) und **Android Chrome**.

| # | Prüfung | Erwartung | iOS | Android |
|---|---------|-----------|-----|---------|
| 6.1 | Folienleiste horizontal scrollbar | Alle Chips erreichbar | [ ] | [ ] |
| 6.2 | Sonder-Chips | Auf schmalen Viewports Icon-only, tippbar | [ ] | [ ] |
| 6.3 | Dock-Buttons | Bedienbar, nicht abgeschnitten | [ ] | [ ] |
| 6.4 | End-Dialog | Modal vollständig sichtbar | [ ] | [ ] |

---

## 7 — Regression (kurz)

| # | Bereich | Erwartung | OK |
|---|---------|-----------|-----|
| 7.1 | Folienwechsel Prev/Next | Reguläre Folien, WS-Sync zu Join | [ ] |
| 7.2 | Countdown-Stile im Event-Editor | Änderung auf Stage sichtbar | [ ] |
| 7.3 | Stage-Effekte | Sunrise/Wasserfall/Parallaxe ohne JS-Fehler | [ ] |
| 7.4 | Hilfe rollenbasiert | `#/help` — nur erlaubte Artikel | [ ] |

---

## Ergebnis

| Feld | Wert |
|------|------|
| Datum | |
| Version Prod | v1.5.40 |
| Tester | |
| Browser | Chrome ___ · Firefox ___ · Safari ___ |
| Beamer | Ja / Nein |
| Screen-Share | Zoom / Teams / Meet / — |

**Gesamt:** ☐ Freigegeben · ☐ RC (kleine Mängel dokumentiert) · ☐ Nicht freigegeben

**Bemerkungen / Tickets:**

```
(hier eintragen)
```

---

## Referenzen

- Spec: `docs/spec/PROMPT-PRESENTER-SPECIAL-SLIDES-DOCK.md`
- Changelog: `docs/stabilization/CHANGELOG-v1.5.37.md`
- Release: https://github.com/markusringe/pulse/releases/tag/v1.5.37
