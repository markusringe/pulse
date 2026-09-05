# GitHub-Release-Body — v1.5.41

Zum Einfügen unter: https://github.com/markusringe/pulse/releases/new?tag=v1.5.41

**Title:** `v1.5.41: fix(stage): countdownDismissed beim Kaltstart`

---

## v1.5.41 — Stage-Kaltstart Countdown

**Typ:** Bugfix (Abnahme Sonderfolien)

### Fix

- **Stage:** `countdownDismissed` aus Session-Metadaten beim Kaltstart übernehmen (`enterStage`, WS `session`) — symmetrisch zu `event_meta`, damit nach Reload nicht fälschlich der Auto-Countdown erscheint, wenn das Event bereits gestartet wurde.

### Tests

```bash
npm run test:stage-countdown
npm run test:special-slides-remote -- --url https://pulse.ringe.us --expect-version 1.5.41
npm run test:presenter-special-slide-dock
```

Container nach Deploy:

```bash
docker exec pulse-pulse-1 node scripts/test-special-slides-remote.js --expect-version 1.5.41
```

### Doku

- `docs/stabilization/abnahme-sonderfolien-v1.5.37-fortschritt.md`
- `docs/stabilization/CHANGELOG-v1.5.41.md`
