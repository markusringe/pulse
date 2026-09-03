#!/usr/bin/env bash
# Pulse — Grundeinstellungen in data/ anlegen (nur fehlende Dateien, nichts überschreiben).
# Nutzung: ./scripts/seed-data.sh [Zielverzeichnis]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-$ROOT/data}"

log() { printf '==> %s\n' "$*"; }

mkdir -p "$DEST/ssl"

# Branding & Datenschutz: aktuelle Repo-Grundeinstellungen (Saarbrücken-Preset)
for f in branding.json privacy.json; do
  if [ ! -f "$DEST/$f" ] && [ -f "$ROOT/data/$f" ]; then
    cp "$ROOT/data/$f" "$DEST/$f"
    log "Grunddaten kopiert: $f"
  fi
done

# Leerer Event-Katalog — Demo-Event „Bürgerversammlung“ legt der Server beim ersten Start an
if [ ! -f "$DEST/events.json" ]; then
  printf '%s\n' '{"events":[]}' > "$DEST/events.json"
  log "events.json angelegt (leer — Demo-Event folgt beim ersten Serverstart)"
fi

# Leeres Audit-Log
if [ ! -f "$DEST/audit.json" ]; then
  printf '%s\n' '[]' > "$DEST/audit.json"
  log "audit.json angelegt (leer)"
fi

# SQLite wird beim ersten App-Start unter SQLITE_PATH angelegt — pulse.db nicht vorkopieren

# Schreibrechte für den Node-User im Container (uid 1000)
if [ "$(id -u)" -eq 0 ]; then
  chown -R 1000:1000 "$DEST" 2>/dev/null || true
fi
chmod -R u+rwX "$DEST"

log "Datenverzeichnis bereit: $DEST"
