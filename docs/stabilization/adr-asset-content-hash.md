# ADR: Content-Hash für Frontend-Assets (Phase 5)

**Status:** umgesetzt (v1.5.9)  
**Kontext:** C-010 — JS/CSS mit `Cache-Control: max-age=86400` ohne zuverlässiges Cache-Busting.

## Entscheidung

1. **SHA-256-Kurzhash (8 Hex)** pro Asset unter `/js`, `/css`, `/i18n`, `/help/articles.json`.
2. **Auslieferung:** Server injiziert `?h=<hash>` in `index.html` und schreibt JS-`import`-Pfade beim Serve um (`lib/assetManifest.js`).
3. **Runtime-Fetches:** `assetUrl()` liest `window.__PULSE_ASSET_H__` aus dem injizierten Head-Script.
4. **Build:** `npm run assets:manifest` schreibt `frontend/asset-manifest.json` (gitignored); Docker-Build nutzt `npm run build`.
5. **Kein Bundler, kein Service Worker** — bewusst minimal im Feature-Freeze.

## Konsequenzen

- Manuelle `?v=navXX`-Bumps entfallen in Quellcode.
- Nach Deploy: Hard-Reload genügt; Hash ändert sich nur bei geändertem Dateiinhalt.
- Tests: `npm run test:asset-manifest`.
