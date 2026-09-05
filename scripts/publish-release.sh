#!/usr/bin/env bash
# GitHub-Release für einen bestehenden Tag veröffentlichen.
# Voraussetzung: GITHUB_TOKEN mit repo-Rechten in der Umgebung.
#
# Beispiel:
#   export GITHUB_TOKEN=ghp_...
#   ./scripts/publish-release.sh v1.5.35
#   ./scripts/publish-release.sh v1.5.35 docs/stabilization/CHANGELOG-v1.5.35.md

set -euo pipefail

TAG="${1:-v1.0.0}"
BODY_FILE="${2:-}"
REPO="${UPDATE_REPO:-markusringe/pulse}"
NAME="${RELEASE_NAME:-Pulse ${TAG}}"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "GITHUB_TOKEN fehlt — Release manuell anlegen:"
  echo "  https://github.com/${REPO}/releases/new?tag=${TAG}"
  if [ -n "$BODY_FILE" ] && [ -f "$BODY_FILE" ]; then
    echo "  Text aus: $BODY_FILE"
  fi
  exit 1
fi

if [ -n "$BODY_FILE" ] && [ -f "$BODY_FILE" ]; then
  BODY="$(cat "$BODY_FILE")"
else
  BODY=$(cat <<EOF
## Pulse ${TAG}

Siehe \`docs/stabilization/\` für detaillierte Release-Notes.
EOF
)
fi

payload=$(TAG="$TAG" NAME="$NAME" BODY="$BODY" python3 - <<'PY'
import json, os
print(json.dumps({
  "tag_name": os.environ["TAG"],
  "name": os.environ["NAME"],
  "body": os.environ["BODY"],
  "draft": False,
  "prerelease": False,
}))
PY
)

curl -fsSL -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/${REPO}/releases" \
  -d "${payload}"

echo ""
echo "Release ${TAG} veröffentlicht: https://github.com/${REPO}/releases/tag/${TAG}"
