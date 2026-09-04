# ADR: Content-Hash für Frontend-Assets (Phase 5)

**Status:** umgesetzt (v1.5.9), gehärtet (v1.5.10), Prod **v1.5.11**  
**Kontext:** C-010 — JS/CSS mit langem Cache ohne zuverlässiges Cache-Busting; Mischversionen nach Deploy vermeiden.

## Entscheidung

1. **SHA-256-Kurzhash (8 Hex)** pro Asset unter `/js`, `/css`, `/i18n`, `/help/**`, `/assets/*`.
2. **Auslieferung:** Server injiziert `?h=<hash>` in `index.html` und schreibt nur **bekannte lokale** JS-`import`-Pfade beim Serve um (`lib/assetManifest.js`). Externe, data-, blob- und API-URLs bleiben unberührt.
3. **Runtime-Fetches:** `assetUrl()` liest `window.__PULSE_ASSET_H__` (i18n, Hilfe-Katalog, Hilfe-HTML).
4. **Build:** `npm run assets:manifest` schreibt `frontend/asset-manifest.json` (gitignored); bricht ab bei fehlenden referenzierten Assets. Docker baut Manifest **nach** vollständigem `frontend/`-Copy.
5. **Production-Start:** Manifest aus Datei laden (kein Hash pro HTTP-Request); fehlend/kaputt → `process.exit(1)` + Readiness-Check `asset_manifest` = false.
6. **Caching:** Gehashte URLs (`?h=` korrekt) → `immutable, max-age=31536000`; `index.html` → `no-cache, must-revalidate`; Auth/Admin/Team-API → `no-store, private`.
7. **Kein Bundler, kein Service Worker** — bewusst minimal im Feature-Freeze.

## Konsequenzen

- Manuelle `?v=navXX`-Bumps entfallen in Quellcode.
- Nach Deploy: Hard-Reload genügt; Hash ändert sich nur bei geändertem Dateiinhalt.
- nginx/proxy: Query-String `?h=` darf nicht entfernt werden.
- Tests: `npm run test:asset-manifest`; Remote-Smoke prüft Hash-URLs und Readiness.
