#!/usr/bin/env bash
# Pfad- und Parser-Tests für update-vps-ubuntu.sh (ohne root/Docker).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/update-vps-ubuntu.sh"

echo "test-update-vps-path: Syntax…"
bash -n "$SCRIPT"

echo "test-update-vps-path: --help (lokal)…"
bash "$SCRIPT" --help >/dev/null

echo "test-update-vps-path: --help (Pipe wie curl|bash)…"
bash -s -- --help < "$SCRIPT" >/dev/null

echo "test-update-vps-path: kein BASH_SOURCE-Fehler bei Pipe…"
if bash -s -- --help < "$SCRIPT" 2>&1 | grep -q 'BASH_SOURCE'; then
  echo "FEHLER: BASH_SOURCE-Fehler bei Pipe-Ausführung" >&2
  exit 1
fi

echo "test-update-vps-path: Helfer vorhanden…"
grep -q "render_progress_bar()" "$SCRIPT" || exit 1
grep -q "run_with_spinner()" "$SCRIPT" || exit 1
grep -q "read_package_version()" "$SCRIPT" || exit 1

echo "test-update-vps-path: OK"
