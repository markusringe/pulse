# Abnahme-Fortschritt — Sonderfolien v1.5.37

**Datum:** 2026-09-05  
**Prod:** https://pulse.ringe.us/ · **v1.5.39**  
**Checkliste:** `abnahme-sonderfolien-v1.5.37.md`

---

## Automatisiert / Remote (erledigt)

| # | Prüfung | Ergebnis | Notiz |
|---|---------|----------|-------|
| 0.1 | `test-presenter-special-slide-dock` | ✅ OK | Container v1.5.39, 2026-09-05 |
| 0.2 | Remote-Smoke 16/16, Version 1.5.39 | ✅ OK | via `docker exec … node -` + smoke-script |
| 0.3 | `/api/health/ready` | ✅ `ok: true` | 2026-09-05 |
| — | `/api/health` Version | ✅ `1.5.39` / `v1.5.39` | |
| — | Prod `stage.js` | ✅ kein `stageSpecialSlideNav` | Bundle-Check |
| — | Prod `deck.js` | ✅ `deck-chip-special` vorhanden | Folienleiste v1.5.37 |

**Container-Test:** `docker exec pulse-pulse-1 node scripts/test-presenter-special-slide-dock.js`

**Remote-Smoke (ohne lokales Node):**  
`ssh pulse 'docker exec -i pulse-pulse-1 node -' < scripts/smoke-remote-url.js --url https://pulse.ringe.us --expect-version 1.5.39`

---

## Manuell (offen — durch Betrieb)

| Abschnitt | Status |
|-----------|--------|
| 2 Presenter Dock + Folienleiste | ☐ Chrome / FF / Safari |
| 3 Stage passiv | ☐ normal + `?share=1` |
| 4 Beamer ~3 m | ☐ |
| 5 Screen-Share | ☐ Zoom / Teams / Meet |
| 6 Mobile Presenter | ☐ iOS / Android |
| 7 Regression kurz | ☐ |

**Gesamt-Freigabe:** ☐ RC Pilot · ☐ Freigegeben (nach manueller Matrix)

---

## Nächste Schritte

1. Checkliste Abschnitt 2–7 mit Test-Event durchklicken (Presenter-Login nötig).
2. Feature-Freeze 2–3 Tage — nur Bugfixes aus Abnahme.
