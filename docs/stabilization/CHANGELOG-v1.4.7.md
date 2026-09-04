# Changelog v1.4.7 — Stabilisierungsrelease

**Branch:** `stabilization/feature-freeze`  
**Schwerpunkt:** Administration, Login, Berechtigungen (keine neuen Features)

## Behoben

- **Administration-Klick:** Modal oder `#/admin/login` zuverlässig; Fallback bei `showModal`-Fehler oder Lade-Timeout
- **Hash-Routing:** `navigateAdminLoginPage` stößt Route auch bei gleichem Hash an
- **Open-Redirect:** Login-Rücksprung nur auf interne Admin-/Presenter-Routen (`lib/internalRoute.js`)
- **403-Ansicht:** Angemeldete Nutzer ohne Nav-Recht sehen `#view-forbidden` statt leerer Seite
- **Router:** `canAccessAdminHash` prüft Rollen-Navigation vor Admin-Routen

## Neu (Betrieb & Qualität)

- `npm run pulse:diagnose` — Instanzstatus ohne Secrets
- Test-Skripte: `test:smoke`, `test:routes`, `test:permissions` (inkl. API), `test:install`, `test:accessibility`, `test:performance`
- Feature-Freeze-Dokumentation unter `docs/feature-freeze.md`

## Update

```bash
cd /opt/pulse
sudo ./scripts/update-vps-ubuntu.sh --tag v1.4.7
npm run pulse:diagnose
npm run auth:diagnose
```

Nach Update: Browser-Cache leeren oder Hard-Reload (HTML `app.js?v=nav59`).

## Rollback

```bash
sudo ./scripts/update-vps-ubuntu.sh --tag v1.4.6
# Backup aus backups/vps-update-* wiederherstellen falls nötig
```
