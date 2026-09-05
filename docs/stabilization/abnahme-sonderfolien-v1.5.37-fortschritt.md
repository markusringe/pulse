# Abnahme-Fortschritt — Sonderfolien v1.5.37

**Datum:** 2026-09-05  
**Prod:** https://pulse.ringe.us/ · **v1.5.40**  
**Checkliste:** `abnahme-sonderfolien-v1.5.37.md`

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
| — | Browser Stage `#/stage/…?share=1` | ✅ | 0× `data-pss-kind`, Hilfe-FAB hidden, kein stage-nav |

**Container (v1.5.40+):**

```bash
docker exec pulse-pulse-1 node scripts/test-presenter-special-slide-dock.js
docker exec pulse-pulse-1 node scripts/test-special-slides-remote.js --expect-version 1.5.40
docker exec -i pulse-pulse-1 node - < scripts/smoke-remote-url.js --expect-version 1.5.40
```

---

## Manuell (offen — Presenter-Login)

| Abschnitt | Status |
|-----------|--------|
| 2 Presenter Dock + Folienleiste | ☐ Chrome / FF / Safari |
| 3 Stage WS-Sync (Countdown/Pause/Ende) | ☐ Presenter klicken → Stage folgt |
| 4 Beamer ~3 m | ☐ |
| 5 Screen-Share | ☐ Zoom / Teams / Meet |
| 6 Mobile Presenter | ☐ iOS / Android (CSS auto-geprüft) |
| 7 Regression kurz | ☐ |

**Gesamt-Freigabe:** ☐ RC Pilot · ☐ Freigegeben

---

## Nächste Schritte

1. Nach Deploy v1.5.40: Container-Tests oben wiederholen.
2. Checkliste Abschnitt 2–7 mit Test-Event (Presenter-Login).
3. Feature-Freeze 2–3 Tage — nur Bugfixes aus Abnahme.
