# Abnahme-Fortschritt — Sonderfolien v1.5.37

**Datum:** 2026-09-05  
**Prod:** https://pulse.ringe.us/ · **v1.5.37**  
**Checkliste:** `abnahme-sonderfolien-v1.5.37.md`

---

## Automatisiert / Remote (erledigt)

| # | Prüfung | Ergebnis | Notiz |
|---|---------|----------|-------|
| 0.3 | `/api/health/ready` | ✅ `ok: true` | 2026-09-05 |
| — | `/api/health` Version | ✅ `1.5.37` / `v1.5.37` | |
| — | Prod `stage.js` | ✅ kein `stageSpecialSlideNav` | Bundle-Check |
| — | Prod `deck.js` | ✅ `deck-chip-special` vorhanden | Folienleiste v1.5.37 |

**Offen lokal/VPS-Container:** Ab **v1.5.38** im Docker-Image — `docker exec pulse-pulse-1 node scripts/test-presenter-special-slide-dock.js`

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
2. Optional: `npm run smoke:remote -- --expect-version 1.5.37` von Entwicklungsrechner mit Node 22.
3. Feature-Freeze 2–3 Tage — nur Bugfixes aus Abnahme.
