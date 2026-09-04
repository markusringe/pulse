# Stabilisierungs-Abnahme — Bericht

**Datum:** 2026-09-04  
**Version:** 1.5.11  
**Umgebung Prod:** https://pulse.ringe.us

## Automatisiert (`npm run acceptance:stabilization`)

| Bereich | Ergebnis |
|---------|----------|
| `test-backups` | OK |
| `backup:restore-drill` | OK — branding selektiv wiederhergestellt |
| `acceptance:public` | **20/20** (Startseite, Assets, Hilfe, i18n, Health) |
| `smoke:remote` | **16/16** |
| `test:mobile` | OK |
| `test:accessibility` | OK |
| Load L-100 Burst | OK — `load-report-100-burst.json` |
| Load L-300 Burst | OK — `load-report-300-burst.json` |
| Load Dauer-Smoke 50×3 min | OK — `load-report-50-3min-smoke.json` |
| Rollback-Pfad-Tests | OK |

## Prod (manuell / VPS)

| Bereich | Ergebnis |
|---------|----------|
| Rollback-Drill VPS | OK — `outcome: success` |
| Browser-Pflichtpfad 19 Schritte | offen |
| Admin-Login Prod (PIN/SMTP) | offen |
| iOS Safari / Android Chrome | offen |
| Last L-100/300 **Dauer** (30/45 min) | offen — `npm run load:scenarios:full` |
| Last 500 / 4h | optional |

## Freigabe

**Status: RC Pilot** — automatisierte Abnahme grün; manuelle Browser-Matrix und Auth Prod ausstehend.

Siehe `docs/stabilization/prod-freigabe-checkliste.md`.
