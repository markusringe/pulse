# Testmatrix — Feature-Freeze

**Stand:** Programmversion **v1.5.41** · 2026-09-05

| Bereich | Automatisiert | Skript | Manuell |
|---------|---------------|--------|---------|
| Installation | teilweise | `test:install`, `test-install-vps-path.sh` | VPS-Install |
| Update | teilweise | `test-update-vps-path.sh`, `test:update-rollback`, `test:rollback-drill`, `rollback-drill.sh` (VPS) | VPS-Update + Rollback-Drill |
| Asset-Manifest | ja | `test:asset-manifest`, `npm run build` | Readiness `asset_manifest` |
| Remote-Smoke | ja | `smoke:remote` | Prod nach Deploy |
| Bootstrap-Admin | ja | `test:auth` | Installer + Erstlogin |
| Passwort-Login | ja | `test:auth` | `#/admin/login` |
| PIN-Login | ja | `test:auth`, `test:email-config` | SMTP + PIN |
| Logout / Session | teilweise | `test:auth` | Browser |
| Rollen / Teams | ja | `test:permissions`, `test:event-team-access` | Admin-UI |
| Events / Sessions | ja | `test:events` | Deck-Editor |
| Deck / Folien | ja | `test:deck`, `test:slides` | Presenter |
| Join / Lobby | teilweise | `test:live` | Mobil |
| Reconnect / WS-Sync | ja | `test:reconnect` (Unit + `test-ws-reconnect.js`) | smoke-checklist Live |
| Interaktion / Timer | ja | `test:interaction-state`, `test:qa-timer` | Live-Session |
| Quiz / Q&A / Picker | teilweise | `test:slides` | Live |
| Stage / Presenter | ja | `test:presenter` | Screen |
| Mobile Nav | nein | — | smoke-checklist |
| Backups | ja | `test:backup` | Admin UI |
| SSL | ja | `test:ssl` | Let's Encrypt |
| Datenschutz | ja | `test:privacy` | — |
| Settings | ja | `test:settings` | Import/Export |
| Performance | teilweise | `test:performance` | Admin-Routen |
| WebSocket / Redis | teilweise | `test:live`, `test:reconnect` | Zwei Container |
| Security | ja | `test:security` | Audit |
| Accessibility | teilweise | `test:accessibility` | VoiceOver/NVDA |
| HTTP Smoke | ja | `test:smoke` | — |
| Admin-Routing | ja | `test:routes` | Administration-Klick |

## Ausführung

```bash
npm test                    # Alles (ohne test:smoke — separat wegen Server-Start)
npm run test:smoke          # Ephemerer Port, kein Kill von :3000
npm run test:auth
npm run test:permissions
npm run test:routes
npm run test:performance
npm run test:accessibility
npm run test:install
npm run test:backup
npm run test:reconnect
npm run pulse:diagnose
```

## Regression pro Fix

Jeder reproduzierte Fehler → mindestens ein Test in der passenden Suite.
