# Produktionsfreigabe — Checkliste

**Stand:** v1.5.41 · 2026-09-05  
**Verantwortlich:** Betrieb / Produktowner  
**Ergebnis:** ☐ Freigegeben · ☑ **RC Pilot** · ☐ Nicht freigegeben

**Prod:** https://pulse.ringe.us · Release: https://github.com/markusringe/pulse/releases/tag/v1.5.41

---

## A — Automatisierte Gates

| # | Kriterium | Befehl / Nachweis | Status |
|---|-----------|-------------------|--------|
| A1 | Unit-Suite grün | `npm test` | |
| A2 | Remote-Smoke 16/16 | `npm run smoke:remote` | |
| A3 | Asset-Manifest | `npm run test:asset-manifest` | |
| A4 | Update-Rollback-Pfad | `npm run test:update-rollback` | |
| A5 | Backup-Unit | `npm run test:backup` | |
| A6 | Backup-Restore-Drill | `npm run backup:restore-drill` | |
| A7 | Last L-100 | `load-baseline-100.json` / Report | |
| A8 | Last L-300 | `load-baseline-300.json` / Report | |

---

## B — Betrieb

| # | Kriterium | Status |
|---|-----------|--------|
| B1 | Prod-Deploy v1.5.41, Ready `ok:true` | ✓ |
| B2 | Rollback-Drill Prod (`outcome: success`) | |
| B3 | Rollback-Image `pulse-app:<vorherige>` vorhanden | |
| B4 | Betriebsmodus dokumentiert (single vs. cluster) | |
| B5 | Backup-Intervall und Retention konfiguriert | |

---

## C — Browser & Mobil (manuell)

| # | Kriterium | Status |
|---|-----------|--------|
| C1 | Pflichtpfad 19 Schritte (Desktop Chrome) | |
| C2 | Mobil 320–430 px | |
| C3 | Inkognito Login + Join | |
| C4 | Update-Reload ohne Cache-Leeren | |
| C5 | iOS Safari / Android Chrome (Kernabläufe) | |

---

## D — Auth & Rollen (Prod)

| # | Kriterium | Status |
|---|-----------|--------|
| D1 | Admin-Login (PIN/E-Mail oder Bootstrap) | |
| D2 | Deep-Link `#/admin/*` nach Login | |
| D3 | Rollen/Teams (Stichprobe) | |

---

## E — No-Go-Kriterien

- [ ] Readiness dauerhaft `degraded` ohne Maßnahmenplan
- [ ] Restore auf Testinstanz fehlgeschlagen
- [ ] L-300 Fehlerrate > 1 % oder p95 Join > 800 ms
- [ ] Rollback-Drill nicht dokumentiert
- [ ] Admin-Login auf Prod nicht nutzbar

---

## F — Sonderfolien Presenter/Stage (v1.5.37+)

Siehe [abnahme-sonderfolien-v1.5.37.md](abnahme-sonderfolien-v1.5.37.md) und [Fortschritt](abnahme-sonderfolien-v1.5.37-fortschritt.md).

| # | Kriterium | Status |
|---|-----------|--------|
| F1 | Remote `test-special-slides-remote` 15/15 | ✓ v1.5.41 |
| F2 | Presenter-Dock + Folienleiste (Chrome) | ✓ |
| F3 | Stage passiv, kein Steuer-UI | ✓ |
| F4 | Safari Desktop-Stichprobe | ✓ 2026-09-05 |
| F5 | Firefox Desktop-Stichprobe | ☐ |
| F6 | Beamer ~3 m / Screen-Share | ☐ Pilot |
| F7 | Bugfix Kaltstart `countdownDismissed` | ✓ v1.5.41 |

---

## Freigabeprotokoll

| Feld | Wert |
|------|------|
| Datum | |
| Version | |
| Umgebung | https://pulse.ringe.us |
| Tester | |
| Ergebnis | |
| Offene Punkte | |
| Nächster Review | |
