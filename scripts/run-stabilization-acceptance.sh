#!/usr/bin/env bash
# Stabilisierungs-Abnahme gemäß docs/stabilization/PROMPT-WEITERES-VORGEHEN.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE="${NODE:-node}"
URL="${PULSE_SMOKE_URL:-https://pulse.ringe.us}"
VER="${PULSE_EXPECT_VERSION:-1.5.17}"

cd "$ROOT"
echo "=== Stabilisierungs-Abnahme v${VER} ==="

echo "--- Backup ---"
"$NODE" scripts/test-backups.js
"$NODE" scripts/backup-restore-drill.js

echo "--- Öffentliche Browser-Abnahme ---"
"$NODE" scripts/browser-acceptance-public.js --url "$URL" --expect-version "$VER"

echo "--- Remote-Smoke ---"
"$NODE" scripts/smoke-remote-url.js --url "$URL" --expect-version "$VER"

echo "--- Mobil / A11y ---"
"$NODE" scripts/test-mobile-layout.js
"$NODE" scripts/test-accessibility.js

echo "--- Last (Burst) ---"
bash scripts/load-test-scenarios.sh quick

echo "--- Rollback-Pfad ---"
bash scripts/test-update-rollback-path.sh
bash scripts/test-rollback-drill-path.sh

echo "=== Stabilisierungs-Abnahme: OK ==="
