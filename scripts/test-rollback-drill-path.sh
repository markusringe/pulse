#!/usr/bin/env bash
# Syntax- und Pfadtests für rollback-drill.sh (ohne VPS/Docker-Recreate).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/rollback-drill.sh"
LIB="$ROOT/scripts/update-vps-lib.sh"

ok() { printf 'OK  %s\n' "$*"; }
die() { printf 'DIE %s\n' "$*" >&2; exit 1; }

echo "test-rollback-drill-path: Syntax…"
bash -n "$SCRIPT"
bash -n "$LIB"

echo "test-rollback-drill-path: Hilfe und Dry-run…"
"$SCRIPT" --help >/dev/null || die "--help fehlgeschlagen"
"$SCRIPT" --dir "$ROOT" --dry-run --yes --json 2>/dev/null | head -1 >/dev/null || true

grep -q 'rollback-drill-' "$SCRIPT" || die "Protokoll-Pfad fehlt"
grep -q 'pulse-app:' "$SCRIPT" || die "Image-Tag-Referenz fehlt"
grep -q 'curl_readiness_ok' "$SCRIPT" || die "Readiness-Helfer fehlt"

ok "rollback-drill.sh Struktur"

echo "test-rollback-drill-path: OK"
