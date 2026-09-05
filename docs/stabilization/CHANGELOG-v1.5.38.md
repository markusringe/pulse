# Changelog v1.5.38 — Abnahme & Diagnose

**Datum:** 2026-09-05  
**Tag:** `v1.5.38`

## Änderungen

- Docker-Image: `test-presenter-special-slide-dock.js` für Prod-Diagnose (`docker exec`)
- Doku: Abnahme-Fortschritt Sonderfolien (`abnahme-sonderfolien-v1.5.37-fortschritt.md`)
- Backlog auf Prod-Stand v1.5.37 aktualisiert

## Keine Funktionsänderung

Identisches Verhalten wie v1.5.37 — Ops/Doku-Release.

## Deploy

```bash
sudo ./scripts/update-vps-ubuntu.sh --tag v1.5.38 --yes
docker exec pulse-pulse-1 node scripts/test-presenter-special-slide-dock.js
npm run smoke:remote -- --url https://pulse.ringe.us --expect-version 1.5.38
```
