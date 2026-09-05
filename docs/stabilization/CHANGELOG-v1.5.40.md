# Changelog v1.5.40

**Datum:** 2026-09-05  
**Typ:** Stabilisierung / Abnahme Sonderfolien

## Neu

- `test-special-slides-remote.js` — Prod-Bundle-Checks (Presenter-Dock, passive Stage, Mobil-CSS)
- `test-special-slides-ws.js` — WS: Presenter steuert Sonderfolien, Stage nur Empfang
- Docker-Image: `smoke-remote-url.js`, `test-special-slides-remote.js` für Container-Diagnose

## Tests

```bash
npm run test:special-slides-remote -- --url https://pulse.ringe.us --expect-version 1.5.40
npm run test:special-slides-ws
npm run test:presenter-special-slide-dock
```

Container:

```bash
docker exec pulse-pulse-1 node scripts/test-special-slides-remote.js --expect-version 1.5.40
docker exec pulse-pulse-1 node scripts/test-presenter-special-slide-dock.js
```
