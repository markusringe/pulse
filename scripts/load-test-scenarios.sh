#!/usr/bin/env bash
# Lasttest-Szenarien gemäß PROMPT-WEITERES-VORGEHEN.md
# --quick: Burst-Tests (100, 300) — für CI/Abnahme
# --full:  inkl. Dauerläufe (30/45/60 min, 4h) — nur manuell/Wartungsfenster
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE="${NODE:-node}"
MODE="${1:-quick}"
REPORT_DIR="$ROOT/docs/stabilization"

run_load() {
  local participants="$1"
  local duration="${2:-0}"
  local label="$3"
  local report="$REPORT_DIR/load-report-${label}.json"
  echo "==> Last $label: ${participants} TN${duration:+, ${duration} min}"
  if [ "$duration" -gt 0 ]; then
    "$NODE" "$ROOT/scripts/load-test.js" --participants="$participants" --duration-minutes="$duration" --report="$report"
  else
    "$NODE" "$ROOT/scripts/load-test.js" --participants="$participants" --report="$report"
  fi
}

cd "$ROOT"

echo "load-test-scenarios: Modus=$MODE"

run_load 100 0 "100-burst"
run_load 300 0 "300-burst"

if [ "$MODE" = "full" ]; then
  run_load 100 30 "100-30min"
  run_load 300 45 "300-45min"
  run_load 500 60 "500-60min"
  run_load 200 240 "200-4h"
else
  echo "==> Dauer-Szenarien übersprungen (--full für 30/45/60 min und 4h)"
  # Kurz-Dauer-Smoke (3 min) als Nachweis der Dauer-Logik
  run_load 50 3 "50-3min-smoke"
fi

echo "load-test-scenarios: OK"
