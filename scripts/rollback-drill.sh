#!/usr/bin/env bash
# =============================================================================
# Pulse — Rollback-Drill (v1.5.11+)
# =============================================================================
#
# Kontrollierter Nachweis: versioniertes Rollback-Image startet, Readiness ok:true,
# danach Wiederherstellung auf Zielversion. Nur außerhalb laufender Veranstaltungen.
#
# Auf dem VPS (empfohlen):
#   cd /opt/pulse && sudo ./scripts/rollback-drill.sh --yes
#
# Remote One-Liner:
#   curl -fsSL …/rollback-drill.sh | sudo bash -s -- --dir /opt/pulse --yes
#
# Optionen:
#   --dir PATH              Installationsverzeichnis (Default: /opt/pulse)
#   --rollback-version VER  Image-Tag für Rollback (Default: eine Minor unter aktuell)
#   --target-version VER    Wiederherstellung (Default: aktuelle package.json-Version)
#   --public-url URL        Öffentliche URL für Version-Smoke (Default: aus .env DOMAIN)
#   --yes, -y               Ohne Rückfrage
#   --skip-restore          Nur Rollback testen, nicht zurück auf Zielversion
#   --dry-run               Ablauf anzeigen, nichts ändern
#   --json                  Zusammenfassung als JSON (zusätzlich zur Log-Datei)
#   -h, --help              Hilfe
#
# Protokoll: backups/rollback-drill-<UTC>.json
# Dokumentation: docs/stabilization/smoke-checklist.md
# =============================================================================

set -eo pipefail

readonly DEFAULT_DIR="/opt/pulse"
readonly HEALTH_TIMEOUT_SEC=90
readonly DRILL_VER="1.0"

INSTALL_DIR=""
ROLLBACK_VER=""
TARGET_VER=""
PUBLIC_URL=""
ASSUME_YES=0
SKIP_RESTORE=0
DRY_RUN=0
OUTPUT_JSON=0

DRILL_START_TS=""
REPORT_FILE=""
PHASE_RESULTS=()

# shellcheck source=scripts/update-vps-lib.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "${SCRIPT_DIR}/update-vps-lib.sh"

die() { printf '\033[1;31mFehler:\033[0m %s\n' "$*" >&2; exit 1; }
ok() { printf '\033[1;32m✔\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
log() { printf '\033[1;36m→\033[0m %s\n' "$*"; }
need_cmd() { command -v "$1" >/dev/null 2>&1 || die "Befehl '$1' fehlt."; }

usage() {
  cat <<'EOF'
Pulse — Rollback-Drill

  cd /opt/pulse && sudo ./scripts/rollback-drill.sh --yes

Optionen: --dir, --rollback-version, --target-version, --public-url,
          --yes, --skip-restore, --dry-run, --json, --help
EOF
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --dir)
        INSTALL_DIR="${2:-}"
        shift 2
        ;;
      --rollback-version)
        ROLLBACK_VER="${2:-}"
        shift 2
        ;;
      --target-version)
        TARGET_VER="${2:-}"
        shift 2
        ;;
      --public-url)
        PUBLIC_URL="${2:-}"
        shift 2
        ;;
      --yes|-y)
        ASSUME_YES=1
        shift
        ;;
      --skip-restore)
        SKIP_RESTORE=1
        shift
        ;;
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      --json)
        OUTPUT_JSON=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "Unbekannte Option: $1"
        ;;
    esac
  done
}

read_package_version() {
  local pkg="$1/package.json"
  [ -f "$pkg" ] || die "package.json fehlt in $1"
  grep -m1 '"version"' "$pkg" | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/'
}

# Vorherige Patch-Version erraten (1.5.11 → 1.5.10).
guess_previous_version() {
  local ver="$1"
  local major minor patch
  IFS=. read -r major minor patch <<< "$ver"
  patch="${patch:-0}"
  if [ "$patch" -gt 0 ]; then
    printf '%s.%s.%s' "$major" "$minor" "$((patch - 1))"
    return 0
  fi
  die "Keine Rollback-Version erraten für $ver — bitte --rollback-version setzen."
}

resolve_public_url() {
  local dir="$1"
  if [ -n "$PUBLIC_URL" ]; then
    printf '%s' "$PUBLIC_URL"
    return 0
  fi
  if [ -f "$dir/.env" ] && grep -q '^DOMAIN=' "$dir/.env" 2>/dev/null; then
    local domain
    domain="$(grep '^DOMAIN=' "$dir/.env" | cut -d= -f2- | tr -d '"')"
    printf 'https://%s' "$domain"
    return 0
  fi
  printf '%s' "http://127.0.0.1"
}

record_phase() {
  local name="$1"
  local status="$2"
  local detail="${3:-}"
  PHASE_RESULTS+=("${name}|${status}|${detail}")
}

# Kurzes Backup vor dem Drill (data/, .env).
create_drill_backup() {
  local dir="$1"
  local ts backup_dir
  ts="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
  backup_dir="$dir/backups/rollback-drill-${ts}"
  mkdir -p "$backup_dir"
  [ -d "$dir/data" ] && cp -a "$dir/data" "$backup_dir/data"
  [ -f "$dir/.env" ] && cp -a "$dir/.env" "$backup_dir/.env"
  printf '%s' "$backup_dir"
}

# Version aus /api/health (öffentlich oder lokal via nginx).
fetch_health_version() {
  local base="$1"
  local body
  body="$(curl -fsS "${base%/}/api/health" 2>/dev/null || return 1)"
  printf '%s' "$body" | grep -Eo '"version"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | sed -E 's/.*"([^"]+)".*/\1/'
}

wait_ready_local() {
  local url="${1:-http://127.0.0.1/api/health/ready}"
  local i=0
  local max=$((HEALTH_TIMEOUT_SEC / 2))
  while [ "$i" -lt "$max" ]; do
    if curl_readiness_ok "$url"; then
      return 0
    fi
    sleep 2
    i=$((i + 1))
  done
  return 1
}

now_ms() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import time; print(int(time.time() * 1000))'
    return 0
  fi
  echo $(($(date +%s) * 1000))
}

docker_compose_up_tag() {
  local dir="$1"
  local tag="$2"
  cd "$dir"
  local norm
  norm="$(normalize_version_tag "$tag")"
  if [ "$DRY_RUN" -eq 1 ]; then
    log "[dry-run] PULSE_IMAGE_TAG=${norm} docker compose up -d --no-build --force-recreate pulse pulse-b nginx"
    return 0
  fi
  need_cmd docker
  docker compose version >/dev/null 2>&1 || die "docker compose fehlt."
  docker image inspect "pulse-app:${norm}" >/dev/null 2>&1 \
    || die "Image pulse-app:${norm} fehlt — vorher Update mit tag_running_release_image ausführen."
  # Nur App + nginx neu starten — Redis/Prometheus/Grafana nicht anfassen.
  PULSE_IMAGE_TAG="$norm" docker compose up -d --no-build --force-recreate pulse pulse-b nginx
}

measure_switch_downtime_ms() {
  local url="$1"
  local start end
  start="$(now_ms)"
  local i=0
  while [ "$i" -lt 60 ]; do
    if curl_readiness_ok "$url" 2>/dev/null; then
      end="$(now_ms)"
      if [[ "$start" =~ ^[0-9]+$ ]] && [[ "$end" =~ ^[0-9]+$ ]]; then
        printf '%s' "$((end - start))"
      else
        printf '0'
      fi
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  printf '-1'
}

run_remote_smoke_if_available() {
  local dir="$1"
  local base="$2"
  local expect="$3"
  if [ ! -f "$dir/package.json" ]; then
    return 0
  fi
  if ! command -v node >/dev/null 2>&1; then
    warn "node fehlt auf dem Host — Remote-Smoke bitte lokal: npm run smoke:remote -- --url $base --expect-version $expect"
    return 2
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    log "[dry-run] npm run smoke:remote -- --url $base --expect-version $expect"
    return 0
  fi
  (cd "$dir" && npm run smoke:remote -- --url "$base" --expect-version "$expect")
}

write_report() {
  local dir="$1"
  local baseline_ver="$2"
  local rollback_ver="$3"
  local target_ver="$4"
  local outcome="$5"
  local downtime_ms="${6:-}"

  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  mkdir -p "$dir/backups"
  REPORT_FILE="$dir/backups/rollback-drill-${ts//:/-}.json"

  {
    printf '{\n'
    printf '  "drillVersion": "%s",\n' "$DRILL_VER"
    printf '  "completedAt": "%s",\n' "$ts"
    printf '  "outcome": "%s",\n' "$outcome"
    printf '  "baselineVersion": "%s",\n' "$baseline_ver"
    printf '  "rollbackVersion": "%s",\n' "$rollback_ver"
    printf '  "targetVersion": "%s",\n' "$target_ver"
    printf '  "switchDowntimeMs": "%s",\n' "$downtime_ms"
    printf '  "publicUrl": "%s",\n' "$(resolve_public_url "$dir")"
    printf '  "phases": [\n'
    local i=0
    local total=${#PHASE_RESULTS[@]}
    for entry in "${PHASE_RESULTS[@]}"; do
      i=$((i + 1))
      local name status detail
      IFS='|' read -r name status detail <<< "$entry"
      printf '    {"phase":"%s","status":"%s","detail":"%s"}' "$name" "$status" "$detail"
      [ "$i" -lt "$total" ] && printf ','
      printf '\n'
    done
    printf '  ]\n'
    printf '}\n'
  } > "$REPORT_FILE"

  ok "Protokoll: $REPORT_FILE"
}

confirm_drill() {
  local dir="$1"
  local from_ver="$2"
  local rb_ver="$3"

  if [ "$ASSUME_YES" -eq 1 ] || [ "$DRY_RUN" -eq 1 ]; then
    return 0
  fi

  echo ""
  printf '\033[1mRollback-Drill — kurze Unterbrechung beim Container-Recreate\033[0m\n'
  printf '  Verzeichnis:   %s\n' "$dir"
  printf '  Baseline:      v%s\n' "$from_ver"
  printf '  Rollback auf:  v%s\n' "$rb_ver"
  printf '  Wiederherst.:  %s\n' "$([ "$SKIP_RESTORE" -eq 1 ] && echo nein || echo ja)"
  echo ""
  printf 'Fortfahren? [j/N] '
  local ans
  read -r ans
  case "$ans" in
    j|J|y|Y|ja|Ja|yes|Yes) ;;
    *) die "Abgebrochen." ;;
  esac
}

main() {
  parse_args "$@"
  DRILL_START_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  local dir="${INSTALL_DIR:-$DEFAULT_DIR}"
  [ -d "$dir" ] || die "Verzeichnis nicht gefunden: $dir"
  [ -f "$dir/docker-compose.yml" ] || die "docker-compose.yml fehlt — Drill nur im Docker-Modus."

  need_cmd curl

  local baseline_ver target_ver rollback_ver public_url ready_url downtime_ms
  baseline_ver="$(read_package_version "$dir")"
  target_ver="${TARGET_VER:-$baseline_ver}"
  rollback_ver="${ROLLBACK_VER:-$(guess_previous_version "$baseline_ver")}"
  public_url="$(resolve_public_url "$dir")"
  ready_url="http://127.0.0.1/api/health/ready"

  printf '\n\033[1;36mPulse Rollback-Drill v%s\033[0m — %s\n\n' "$DRILL_VER" "$DRILL_START_TS"

  confirm_drill "$dir" "$baseline_ver" "$rollback_ver"

  # Dry-run: Ablauf ohne Docker/Curl-Abhängigkeiten (lokale Entwicklung / CI).
  if [ "$DRY_RUN" -eq 1 ]; then
    log "Phase 0 — Baseline (dry-run)"
    record_phase "baseline" "skipped" "v${baseline_ver}"
    log "Phase 1 — Rollback auf v${rollback_ver} (dry-run)"
    docker_compose_up_tag "$dir" "$rollback_ver"
    record_phase "rollback" "skipped" "dry-run"
    if [ "$SKIP_RESTORE" -eq 0 ]; then
      log "Phase 2 — Wiederherstellung auf v${target_ver} (dry-run)"
      docker_compose_up_tag "$dir" "$target_ver"
      record_phase "restore" "skipped" "dry-run"
    fi
    write_report "$dir" "$baseline_ver" "$rollback_ver" "$target_ver" "dry_run" ""
    ok "Dry-run abgeschlossen."
    if [ "$OUTPUT_JSON" -eq 1 ] && [ -f "$REPORT_FILE" ]; then
      cat "$REPORT_FILE"
      rm -f "$REPORT_FILE"
    fi
    exit 0
  fi

  log "Phase 0 — Baseline erfassen"
  local backup_dir health_ver images_before
  backup_dir="$(create_drill_backup "$dir")"
  ok "Backup: $backup_dir"

  if ! wait_ready_local "$ready_url"; then
    record_phase "baseline_ready" "fail" "ready nicht ok vor Drill"
    die "Baseline Readiness fehlgeschlagen — Drill abgebrochen."
  fi
  record_phase "baseline_ready" "ok" "ok:true"

  health_ver="$(fetch_health_version "$public_url" || fetch_health_version "http://127.0.0.1")"
  images_before="$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep '^pulse-app:' | sort -u | tr '\n' ' ' || true)"
  record_phase "baseline_version" "ok" "package=${baseline_ver} health=${health_ver:-?}"
  record_phase "baseline_images" "ok" "${images_before:-keine}"

  log "Phase 1 — Rollback auf v${rollback_ver} (Image pulse-app:${rollback_ver})"
  docker_compose_up_tag "$dir" "$rollback_ver"

  downtime_ms="$(measure_switch_downtime_ms "$ready_url")"
  if ! wait_ready_local "$ready_url"; then
    record_phase "rollback_ready" "fail" "timeout nach Rollback"
    write_report "$dir" "$baseline_ver" "$rollback_ver" "$target_ver" "failed_rollback_ready" "$downtime_ms"
    die "Rollback-Container nicht ready — manuell prüfen (Backup: $backup_dir)."
  fi
  health_ver="$(fetch_health_version "$public_url" || fetch_health_version "http://127.0.0.1")"
  if [ "$health_ver" != "$rollback_ver" ]; then
    record_phase "rollback_version" "fail" "erwartet ${rollback_ver}, ist ${health_ver:-?}"
    warn "Health-Version weicht ab — prüfen, ob nginx/Cache."
  else
    record_phase "rollback_version" "ok" "$health_ver"
  fi
  record_phase "rollback_ready" "ok" "downtimeMs=${downtime_ms}"
  ok "Rollback aktiv: v${health_ver:-$rollback_ver} (Downtime ca. ${downtime_ms} ms)"

  run_remote_smoke_if_available "$dir" "$public_url" "$rollback_ver"
  local smoke_rc=$?
  if [ "$smoke_rc" -eq 0 ]; then
    record_phase "rollback_smoke" "ok" "$rollback_ver"
  elif [ "$smoke_rc" -eq 2 ]; then
    record_phase "rollback_smoke" "skipped" "node fehlt — lokal prüfen"
  else
    record_phase "rollback_smoke" "fail" "$rollback_ver"
    warn "Remote-Smoke nach Rollback fehlgeschlagen."
  fi

  if [ "$SKIP_RESTORE" -eq 1 ]; then
    warn "Wiederherstellung übersprungen (--skip-restore)."
    write_report "$dir" "$baseline_ver" "$rollback_ver" "$target_ver" "rollback_only" "${downtime_ms:-}"
    exit 0
  fi

  log "Phase 2 — Wiederherstellung auf v${target_ver}"
  docker_compose_up_tag "$dir" "$target_ver"

  if ! wait_ready_local "$ready_url"; then
    record_phase "restore_ready" "fail" "timeout"
    write_report "$dir" "$baseline_ver" "$rollback_ver" "$target_ver" "failed_restore_ready" "${downtime_ms:-}"
    die "Wiederherstellung nicht ready — ggf. manuell PULSE_IMAGE_TAG=${target_ver} docker compose up -d --no-build"
  fi
  health_ver="$(fetch_health_version "$public_url" || fetch_health_version "http://127.0.0.1")"
  record_phase "restore_version" "ok" "${health_ver:-?}"
  record_phase "restore_ready" "ok" "ok:true"

  run_remote_smoke_if_available "$dir" "$public_url" "$target_ver"
  smoke_rc=$?
  if [ "$smoke_rc" -eq 0 ]; then
    record_phase "restore_smoke" "ok" "$target_ver"
    write_report "$dir" "$baseline_ver" "$rollback_ver" "$target_ver" "success" "${downtime_ms:-}"
    ok "Rollback-Drill abgeschlossen — wieder auf v${target_ver}"
  elif [ "$smoke_rc" -eq 2 ]; then
    record_phase "restore_smoke" "skipped" "node fehlt — lokal prüfen"
    write_report "$dir" "$baseline_ver" "$rollback_ver" "$target_ver" "success_smoke_local" "${downtime_ms:-}"
    ok "Rollback-Drill abgeschlossen — wieder auf v${target_ver} (Remote-Smoke lokal nachziehen)"
  else
    record_phase "restore_smoke" "fail" "$target_ver"
    write_report "$dir" "$baseline_ver" "$rollback_ver" "$target_ver" "failed_restore_smoke" "${downtime_ms:-}"
    die "Wiederherstellung ready, aber Remote-Smoke fehlgeschlagen."
  fi

  if [ "$OUTPUT_JSON" -eq 1 ] && [ -f "$REPORT_FILE" ]; then
    cat "$REPORT_FILE"
  fi
}

main "$@"
