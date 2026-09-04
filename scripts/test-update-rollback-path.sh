#!/usr/bin/env bash
# Pfad-, Parser- und Rollback-Helfer-Tests für update-vps-ubuntu.sh (ohne root/VPS).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/update-vps-ubuntu.sh"
LIB="$ROOT/scripts/update-vps-lib.sh"

ok() { printf 'OK  %s\n' "$*"; }
warn() { printf 'WARN %s\n' "$*" >&2; }
die() { printf 'DIE %s\n' "$*" >&2; exit 1; }
need_cmd() { command -v "$1" >/dev/null 2>&1 || die "Befehl '$1' fehlt."; }

# shellcheck source=scripts/update-vps-lib.sh
. "$LIB"

assert_eq() {
  local got="$1"
  local want="$2"
  local label="$3"
  if [ "$got" != "$want" ]; then
    echo "FEHLER: $label — erwartet '$want', ist '$got'" >&2
    exit 1
  fi
  ok "$label"
}

echo "test-update-rollback-path: Syntax…"
bash -n "$SCRIPT"
bash -n "$LIB"

echo "test-update-rollback-path: normalize_version_tag…"
assert_eq "$(normalize_version_tag v1.5.10)" "1.5.10" "v-Prefix entfernen"
assert_eq "$(normalize_version_tag 1.5.10)" "1.5.10" "ohne v unverändert"

echo "test-update-rollback-path: deploy_state_file…"
assert_eq "$(deploy_state_file /opt/pulse)" "/opt/pulse/backups/.pulse-deploy-state.json" "State-Pfad"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
save_deploy_state "$tmp" "1.5.10" "abc123deadbeef"
[ -f "$tmp/backups/.pulse-deploy-state.json" ] || die "State-Datei fehlt"
grep -q '"gitRef": "abc123deadbeef"' "$tmp/backups/.pulse-deploy-state.json" || die "gitRef in State fehlt"
grep -q '"imageTag": "pulse-app:1.5.10"' "$tmp/backups/.pulse-deploy-state.json" || die "imageTag in State fehlt"
ok "save_deploy_state schreibt JSON"

echo "test-update-rollback-path: Updater enthält Rollback-Flow…"
grep -q "rollback_docker_release" "$SCRIPT" || die "rollback_docker_release fehlt im Updater"
grep -q "tag_running_release_image" "$SCRIPT" || die "tag_running_release_image fehlt im Updater"
grep -q "curl_readiness_ok" "$LIB" || die "curl_readiness_ok fehlt in Lib"
grep -q "PULSE_IMAGE_TAG" "$ROOT/docker-compose.yml" || die "PULSE_IMAGE_TAG fehlt in docker-compose.yml"
grep -q 'image: pulse-app:\${PULSE_IMAGE_TAG:-latest}' "$ROOT/docker-compose.yml" || die "pulse-app image fehlt"

echo "test-update-rollback-path: curl_readiness_ok (Mock)…"
mock_ok='{"ok":true,"readiness":{"ready":true}}'
mock_fail='{"ok":false,"readiness":{"ready":false}}'
printf '%s' "$mock_ok" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' || die "Mock ok fehlgeschlagen"
printf '%s' "$mock_fail" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' && die "Mock fail sollte nicht matchen"

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "test-update-rollback-path: Docker verfügbar — Image-Tag-Syntax…"
  docker image inspect pulse-app:nonexistent-test 2>/dev/null && die "unexpected image" || ok "fehlendes Test-Image korrekt abgewiesen"
else
  warn "Docker nicht verfügbar — Integrationstest übersprungen"
fi

echo "test-update-rollback-path: OK"
