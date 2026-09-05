# Changelog v1.5.36 — Presenter-Dock only

**Datum:** 2026-09-05  
**Tag:** `v1.5.36`  
**Commit:** (nach Deploy)

## Architektur

**Presenter = Steuerung · Stage = reine Ausgabe**

- Stage-FAB aus v1.5.35 **entfernt** (Rollback der Stage-Steuerung)
- Sonderfolien-Buttons **ausschließlich** im Presenter-Dock (`#/present/:code`)
- Stage (`#/stage/:code`) zeigt Countdown/Pause/Ende passiv via `event_meta`

## Änderungen

- `stageSpecialSlideNav.js` entfernt
- Server: `set_current_special_slide` wieder **nur Presenter**
- Spec: `docs/spec/PROMPT-PRESENTER-SPECIAL-SLIDES-DOCK.md`
- Test: `npm run test:presenter-special-slide-dock`

## Deploy

```bash
sudo ./scripts/update-vps-ubuntu.sh --tag v1.5.36 --yes
npm run smoke:remote
```
