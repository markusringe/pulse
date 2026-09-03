#!/usr/bin/env bash
# GitHub-Release für einen bestehenden Tag veröffentlichen.
# Voraussetzung: GITHUB_TOKEN mit repo-Rechten in der Umgebung.
#
# Beispiel:
#   export GITHUB_TOKEN=ghp_...
#   ./scripts/publish-release.sh v1.0.0

set -euo pipefail

TAG="${1:-v1.0.0}"
REPO="${UPDATE_REPO:-markusringe/pulse}"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "GITHUB_TOKEN fehlt — Release manuell anlegen:"
  echo "  https://github.com/${REPO}/releases/new?tag=${TAG}"
  exit 1
fi

BODY=$(cat <<EOF
## Pulse ${TAG}

### Features
- Live-Interaktion: Umfragen, Wortwolke, Q&A, Quiz, Ranking, Picker
- Events mit Join-Codes und Session-Deck-Editor
- Branding, Datenschutz, SSL (Let's Encrypt)
- Benutzerverwaltung mit E-Mail-PIN-Login
- Automatisches Update-System über GitHub Releases (\`#/admin/updates\`)

### Hinweise
- Semantische Versionierung ab v1.0.0
- Updates: \`UPDATE_REPO=${REPO}\` in \`.env\` setzen
EOF
)

payload=$(TAG="$TAG" BODY="$BODY" python3 - <<'PY'
import json, os
print(json.dumps({
  "tag_name": os.environ["TAG"],
  "name": "Pulse " + os.environ["TAG"],
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
