# Release- und Installationsaudit — v1.4.6

Datum: Feature-Freeze Start · Branch `stabilization/feature-freeze`

## Versionierung

| Quelle | Version | Status |
|--------|---------|--------|
| `package.json` | 1.4.6 | ✓ |
| Git-Tag | v1.4.6 | ✓ (neuester Tag) |
| `frontend/index.html` app.js | `?v=nav59` | nach Admin-Fix |

**Empfehlung:** Stabilitätsrelease als **v1.4.7** (Fixes) oder **v1.5.0** (Freeze abgeschlossen).

## Installation / Update

| Prüfpunkt | Ergebnis |
|-----------|----------|
| `.env.example` Bootstrap-Variablen | ✓ `BOOTSTRAP_ADMIN_*` dokumentiert |
| `ADMIN_PASSWORD_HASH` veraltet | ✓ in .env.example + Diagnose gewarnt |
| Docker `env_file: .env` | ✓ |
| `pulse` + `pulse-b` gleiches Volume | ✓ `./data:/app/data` |
| Gemeinsamer Redis | ✓ `REDIS_URL=redis://redis:6379` |
| Update führt `css:build` aus | ✓ `update-vps-ubuntu.sh` |
| Backup vor Update | ✓ Standard ( `--skip-backup` optional) |
| Secrets in Installer-Output | manuell prüfen — Installer maskiert Passwort-Eingabe |

## Cache / Assets

| Asset | Cache-Control (server.js) | Mitigation |
|-------|---------------------------|------------|
| HTML | `no-cache` | ✓ |
| JS/CSS | `max-age=86400` | Query `?v=` in index.html **Pflicht** bei Releases |
| nginx | proxied, keine Extra-Header | App-Header gelten |

## Diagnose

```bash
npm run pulse:diagnose   # neu — Gesamtinstanz
npm run auth:diagnose    # Auth/Bootstrap
```

## Offene Punkte (Block 1)

1. Nach Release `?v=` in allen geänderten Modulen anheben
2. VPS auf v1.4.7+ aktualisieren und `pulse:diagnose` + manuelle Smoke-Checkliste
3. Optional: nginx `Cache-Control` für `/js/`/`/css/` mit `no-cache` bei fehlendem Query-String (niedrige Prio)

## Docker Compose Secrets-Durchreichung

Relevante Variablen in `docker-compose.yml` → `environment` + `env_file`:

- `BOOTSTRAP_ADMIN_PASSWORD` ✓
- `USER_AUTH_ENABLED` ✓
- `ADMIN_SECRET` ✓
- `REDIS_URL` (fest im Compose) ✓

**Hinweis:** Nach `.env`-Änderung `docker compose up -d --force-recreate` erforderlich.
