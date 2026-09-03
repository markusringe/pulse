#!/usr/bin/env bash
# Pulse — Tailwind CSS v4 Produktions-Build (minified pulse.css)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v npx >/dev/null 2>&1; then
  echo "build-css: npx nicht gefunden — Node.js ≥ 22 erforderlich." >&2
  exit 1
fi

if [ ! -d node_modules/tailwindcss ]; then
  echo "==> Tailwind fehlt — npm install (devDependencies)…"
  npm install
fi

INPUT="./frontend/css/tailwind.input.css"
OUTPUT="./frontend/css/pulse.css"

echo "==> Tailwind CSS v4 Build: $INPUT → $OUTPUT"
npx @tailwindcss/cli -i "$INPUT" -o "$OUTPUT" --minify

BYTES="$(wc -c < "$OUTPUT" | tr -d ' ')"
echo "==> pulse.css erstellt ($BYTES Bytes)"
