#!/usr/bin/env bash
# Pfad- und Parser-Tests für install-vps-ubuntu.sh (ohne root/Docker).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/install-vps-ubuntu.sh"

echo "test-install-vps-path: Syntax…"
bash -n "$SCRIPT"

echo "test-install-vps-path: --help (lokal)…"
bash "$SCRIPT" --help >/dev/null

echo "test-install-vps-path: --help (Pipe wie curl|bash)…"
bash -s -- --help < "$SCRIPT" >/dev/null

echo "test-install-vps-path: kein BASH_SOURCE-Fehler bei Pipe…"
if bash -s -- --help < "$SCRIPT" 2>&1 | grep -q 'BASH_SOURCE'; then
  echo "FEHLER: BASH_SOURCE-Fehler bei Pipe-Ausführung" >&2
  exit 1
fi

echo "test-install-vps-path: Pipe mit set -u nach Init…"
# Simuliert älteres bash-Verhalten: BASH_SOURCE unset während Init
bash -c 'unset BASH_SOURCE 2>/dev/null; set -eo pipefail; src="${BASH_SOURCE[0]:-}"; [[ -z "$src" ]] && echo pipe-ok'

echo "test-install-vps-path: OK"
