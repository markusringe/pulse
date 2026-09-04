# Produktionsfreigabe — Checkliste

**Stand:** v1.5.11 · 2026-09-04  
**Verantwortlich:** Betrieb / Produktowner  
**Ergebnis:** ☐ Freigegeben · ☐ RC Pilot · ☐ Nicht freigegeben

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
| B1 | Prod-Deploy v1.5.11, Ready `ok:true` | |
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
