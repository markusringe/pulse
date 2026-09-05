# Changelog v1.5.41 — Stage-Kaltstart Countdown

**Datum:** 2026-09-05  
**Tag:** `v1.5.41`  
**Release:** https://github.com/markusringe/pulse/releases/tag/v1.5.41  
**Typ:** Bugfix (Abnahme Sonderfolien)

## Fix

- **Stage:** `countdownDismissed` aus Session-Metadaten beim Kaltstart übernehmen (`enterStage`, WS `session`) — symmetrisch zu `event_meta`, damit nach Reload nicht fälschlich der Auto-Countdown erscheint, wenn das Event bereits gestartet wurde.

## Doku / Abnahme

- `abnahme-sonderfolien-v1.5.37-fortschritt.md` — Townhall 807435 vollständig (Chrome), Safari ✅, Release veröffentlicht
- `abnahme-sonderfolien-v1.5.37.md` — Checkliste auf v1.5.41 synchronisiert
- `abnahme-ff-safari-stichprobe.md` — Safari-Stichprobe abgeschlossen

## Tests

```bash
npm run test:stage-countdown
npm run test:special-slides-remote -- --url https://pulse.ringe.us --expect-version 1.5.41
npm run test:presenter-special-slide-dock
```

Container nach Deploy:

```bash
docker exec pulse-pulse-1 node scripts/test-special-slides-remote.js --expect-version 1.5.41
```
