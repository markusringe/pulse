# ADR — Live stateVersion (Phase 2)

Stand: 2026-09-04 · Status: **implementiert (v1.5.8+)**

## Kontext

Parallele Presenter-Tabs (oder REST + WebSocket doppelt) konnten Live-Session-Stand gegenseitig überschreiben (C-011). Es gab keinen globalen Versionszähler — nur `interaction.seq` pro Folie.

## Entscheidung

- Pro Session eine monotone **`stateVersion`** (Integer ab 0).
- **Presenter-Mutationen** senden optional `expectedVersion`; bei Abweichung **409** / WS-Fehler `STATE_VERSION_CONFLICT`.
- Nach jeder erfolgreichen Presenter-Mutation: `stateVersion++`, persistiert in `payload.stateVersion`.
- **Strukturelle WS-Events** tragen `stateVersion`; Clients **ignorieren** Events mit niedrigerer Version als lokal.
- **Teilnehmer-Aktionen** (Vote, Wortwolke, Q&A-Eingabe) prüfen keine `expectedVersion` (Performance).

## Strukturelle Event-Typen

`session`, `deck`, `slide`, `slide_updated`, `lobby`, `results`, `emergency_*`, `interaction`, `reset`, `qa_timer`

## API

- REST/WS Body: `expectedVersion: number` (optional — fehlend = keine Prüfung, Übergang)
- Antwort/Konflikt: `{ code: "STATE_VERSION_CONFLICT", stateVersion: <aktuell> }`
- `GET /api/sessions/:code` / WS `session`: `session.stateVersion`

## Migration

- Bestehende Sessions ohne Feld → `0` in `hydrate()`.
- Kein DB-Schema-Change (JSON in `payload`).

## Docker-VPS

Unverändert: Code-Updates weiter über `scripts/update-vps-ubuntu.sh` (B-010).

## Nicht enthalten (später)

- Idempotente Event-IDs (C-011b)
- Per-Folien-Version statt Session-global

## Referenzen

- `lib/sessionVersion.js`
- `docs/stabilization/release-gates.md` Phase 2
- `scripts/test-state-version.js`
