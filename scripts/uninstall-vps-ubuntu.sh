#!/usr/bin/env bash
# =============================================================================
# Pulse — VPS-Deinstallation unter Ubuntu (20.04 / 22.04 / 24.04 / 26.04)
# =============================================================================
#
# Stoppt den Pulse-Stack und entfernt die Installation (Standard: /opt/pulse).
#
# Ausführung:
#
#   A) Lokal:  cd /opt/pulse && sudo ./scripts/uninstall-vps-ubuntu.sh
#   B) Remote: curl -fsSL …/uninstall-vps-ubuntu.sh | sudo bash
#   C) Mit Optionen: sudo bash …/uninstall-vps-ubuntu.sh --yes --purge-volumes
#
# Optionen:
#   --dir PATH         Installationsverzeichnis (Default: /opt/pulse)
#   --keep-data        data/ und .env behalten
#   --purge-certs      Let's-Encrypt-Zertifikat entfernen
#   --purge-volumes    Docker-Volumes mit löschen
#   --yes, -y          Ohne Rückfrage
#   --json             JSON-Zusammenfassung
#   -h, --help         Hilfe
#
# =============================================================================

set -eo pipefail

readonly DEFAULT_INSTALL_DIR="/opt/pulse"
readonly PULSE_UNINSTALLER_VER="1.1"

INSTALL_DIR=""
KEEP_DATA=0
PURGE_CERTS=0
PURGE_VOLUMES=0
ASSUME_YES=0
OUTPUT_JSON=0
IS_REMOTE=0

STEP=0
TOTAL_STEPS=6

resolve_script_dir() {
  local src="${BASH_SOURCE[0]:-}"
  if [[ -n "$src" && "$src" != "bash" && -f "$src" ]]; then
    cd "$(dirname "$src")" && pwd
    return 0
  fi
  if [[ -d "${DEFAULT_INSTALL_DIR}/scripts" && -f "${DEFAULT_INSTALL_DIR}/scripts/uninstall-vps-ubuntu.sh" ]]; then
    echo "${DEFAULT_INSTALL_DIR}/scripts"
    return 0
  fi
  pwd
}

detect_remote_invocation() {
  if [[ -n "${PULSE_REMOTE_UNINSTALL:-}" && "${PULSE_REMOTE_UNINSTALL}" == "1" ]]; then
    return 0
  fi
  local src="${BASH_SOURCE[0]:-}"
  if [[ ! -t 0 ]] || [[ -z "$src" ]] || [[ "$src" == "bash" ]]; then
    return 0
  fi
  return 1
}

SCRIPT_DIR="$(resolve_script_dir)"
if detect_remote_invocation; then
  IS_REMOTE=1
fi

set -u

log()  { printf '\033[1;33m==> [%s/%s]\033[0m %s\n' "$STEP" "$TOTAL_STEPS" "$*"; }
ok()   { printf '\033[1;32m✔\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mFehler:\033[0m %s\n' "$*" >&2; exit 1; }

has_tty() {
  [ -t 0 ] || { [ -r /dev/tty ] 2>/dev/null && [ -w /dev/tty ] 2>/dev/null; }
}

is_fully_noninteractive() {
  ! has_tty
}

read_tty() {
  if [ -r /dev/tty ] 2>/dev/null; then
    read -r "$@" < /dev/tty
  else
    read -r "$@"
  fi
}

prompt_tty() {
  if [ -w /dev/tty ] 2>/dev/null; then
    printf '%s' "$*" > /dev/tty
  else
    printf '%s' "$*"
  fi
}

usage() {
  cat <<'EOF'
Pulse — VPS-Deinstallation

  Lokal:   cd /opt/pulse && sudo ./scripts/uninstall-vps-ubuntu.sh
  Remote:  curl -fsSL …/uninstall-vps-ubuntu.sh | sudo bash
  Schnell: sudo bash …/uninstall-vps-ubuntu.sh --yes

Optionen:
  --dir PATH         Installationsverzeichnis (Default: /opt/pulse)
  --keep-data        data/ und .env behalten
  --purge-certs      Let's-Encrypt-Zertifikat entfernen
  --purge-volumes    Docker-Volumes löschen
  --yes, -y          Ohne Rückfrage
  --json             JSON-Zusammenfassung
  -h, --help         Hilfe
EOF
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --dir)
        INSTALL_DIR="${2:-}"
        shift 2
        ;;
      --dir=*)
        INSTALL_DIR="${1#--dir=}"
        shift
        ;;
      --keep-data)
        KEEP_DATA=1
        shift
        ;;
      --purge-certs)
        PURGE_CERTS=1
        shift
        ;;
      --purge-volumes)
        PURGE_VOLUMES=1
        shift
        ;;
      --yes|-y)
        ASSUME_YES=1
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
        die "Unbekannte Option: $1 (siehe --help)"
        ;;
    esac
  done
}

step() { STEP=$((STEP + 1)); }

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    die "Bitte als root ausführen: sudo bash $0  (oder: sudo -t ./scripts/uninstall-vps-ubuntu.sh)"
  fi
}

resolve_install_dir() {
  if [ -n "$INSTALL_DIR" ]; then
    echo "$INSTALL_DIR"
    return
  fi
  if [ -f "${SCRIPT_DIR}/../docker-compose.yml" ]; then
    cd "${SCRIPT_DIR}/.." && pwd
    return
  fi
  if [ -f "${DEFAULT_INSTALL_DIR}/docker-compose.yml" ]; then
    echo "$DEFAULT_INSTALL_DIR"
    return
  fi
  echo "$DEFAULT_INSTALL_DIR"
}

read_env_value() {
  local file="$1"
  local key="$2"
  grep "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- || true
}

confirm_answer_ok() {
  local a
  a="$(echo "${1:-}" | tr '[:upper:]' '[:lower:]' | xargs)"
  case "$a" in
    ja|j|yes|y) return 0 ;;
    *) return 1 ;;
  esac
}

confirm_uninstall() {
  local dir="$1"
  if [ "$ASSUME_YES" -eq 1 ]; then
    ok "Bestätigung übersprungen (--yes)"
    return 0
  fi
  if is_fully_noninteractive; then
    warn "Kein Terminal — bitte --yes oder PULSE_UNINSTALL_YES=1 setzen"
    [ "${PULSE_UNINSTALL_YES:-}" = "1" ] || die "Abbruch ohne --yes"
    return 0
  fi

  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  Pulse wird deinstalliert                                    ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
  echo "  Verzeichnis:    $dir"
  if [ ! -d "$dir" ]; then
    warn "Verzeichnis existiert nicht — es werden nur laufende Container/Prozesse gestoppt."
  fi
  echo "  Daten behalten: $([ "$KEEP_DATA" -eq 1 ] && echo ja || echo nein, alles löschen)"
  echo "  Zertifikate:    $([ "$PURGE_CERTS" -eq 1 ] && echo löschen || echo behalten)"
  echo ""

  local answer=""
  while true; do
    prompt_tty "Fortfahren? Tippe ja (oder j): "
    read_tty answer
    if confirm_answer_ok "$answer"; then
      break
    fi
    warn "Ungültige Eingabe — bitte ja, j, yes oder y (Strg+C zum Abbrechen)."
  done
  ok "Bestätigt — starte Deinstallation…"
}

# Docker-Compose-Befehl ausführen (Plugin oder Standalone).
run_compose() {
  local dir="$1"
  shift
  cd "$dir" || return 1
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
    return $?
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
    return $?
  fi
  return 1
}

has_compose() {
  docker compose version >/dev/null 2>&1 || command -v docker-compose >/dev/null 2>&1
}

stop_docker_stack() {
  local dir="$1"
  if [ ! -f "$dir/docker-compose.yml" ]; then
    ok "Kein docker-compose.yml in $dir — Docker-Stop übersprungen"
    return 0
  fi
  if ! command -v docker >/dev/null 2>&1; then
    warn "Docker nicht installiert — Stack-Stop übersprungen"
    return 0
  fi

  step
  log "Docker-Stack in $dir stoppen…"

  if ! has_compose; then
    warn "Docker Compose nicht gefunden — versuche laufende Pulse-Container zu stoppen…"
    docker ps -q --filter "name=pulse" 2>/dev/null | xargs -r docker stop 2>/dev/null || true
    docker ps -q --filter "name=nginx" 2>/dev/null | xargs -r docker stop 2>/dev/null || true
    return 0
  fi

  local down_args=(down --remove-orphans)
  if [ "$PURGE_VOLUMES" -eq 1 ]; then
    down_args=(down -v --remove-orphans)
  fi

  if ! run_compose "$dir" "${down_args[@]}"; then
    warn "docker compose down fehlgeschlagen — erzwinge Stopp…"
    run_compose "$dir" kill 2>/dev/null || true
    run_compose "$dir" rm -f 2>/dev/null || true
    run_compose "$dir" "${down_args[@]}" 2>/dev/null || warn "Stack evtl. noch teilweise aktiv — rm kann scheitern"
  fi
  ok "Docker-Stack gestoppt"
}

stop_npm_process() {
  local dir="$1"
  step
  log "Node-Prozesse (Pulse) beenden…"
  if command -v pkill >/dev/null 2>&1; then
    pkill -f "node.*${dir}" 2>/dev/null || true
    pkill -f "node.*/opt/pulse" 2>/dev/null || true
  fi
  if command -v systemctl >/dev/null 2>&1 && systemctl is-active pulse.service >/dev/null 2>&1; then
    systemctl stop pulse.service 2>/dev/null || true
    systemctl disable pulse.service 2>/dev/null || true
  fi
  ok "Prozesse beendet (falls vorhanden)"
}

purge_letsencrypt() {
  local domain="$1"
  [ -n "$domain" ] || return 0
  [ "$PURGE_CERTS" -eq 1 ] || return 0
  step
  if ! command -v certbot >/dev/null 2>&1; then
    warn "certbot nicht installiert — Zertifikat manuell prüfen"
    return 0
  fi
  log "Let's-Encrypt-Zertifikat für $domain entfernen…"
  certbot delete --cert-name "$domain" --non-interactive 2>/dev/null \
    || warn "Zertifikat $domain nicht gefunden oder bereits entfernt"
  ok "Zertifikat-Bereinigung abgeschlossen"
}

remove_installation() {
  local dir="$1"
  step
  if [ ! -d "$dir" ]; then
    warn "Installationsverzeichnis $dir existiert nicht — nichts zu löschen"
    return 0
  fi

  if [ "$KEEP_DATA" -eq 1 ]; then
    log "Installationsdateien entfernen (data/ und .env bleiben)…"
    cd "$dir" || return 0
    find . -mindepth 1 -maxdepth 1 ! -name 'data' ! -name '.env' ! -name 'INSTALL-CREDENTIALS.txt' -exec rm -rf {} + 2>/dev/null || true
    ok "Code entfernt — data/ und .env erhalten"
    return 0
  fi

  log "Installationsverzeichnis entfernen: $dir"
  if rm -rf "$dir" 2>/dev/null; then
    ok "Verzeichnis gelöscht: $dir"
    return 0
  fi

  warn "Löschen fehlgeschlagen (evtl. Docker-Mounts) — stoppe Stack erneut…"
  if [ -f "$dir/docker-compose.yml" ] && has_compose; then
    run_compose "$dir" down -v --remove-orphans 2>/dev/null || true
  fi
  sleep 2
  if rm -rf "$dir" 2>/dev/null; then
    ok "Verzeichnis nach erneutem Docker-Stopp gelöscht: $dir"
    return 0
  fi

  die "Konnte $dir nicht löschen. Bitte manuell: cd $dir && docker compose down -v && cd .. && rm -rf $dir"
}

remove_credentials_file() {
  local dir="$1"
  [ -f "$dir/INSTALL-CREDENTIALS.txt" ] && rm -f "$dir/INSTALL-CREDENTIALS.txt" 2>/dev/null || true
}

print_summary() {
  local dir="$1"
  local domain="$2"
  cat <<EOF

╔══════════════════════════════════════════════════════════════╗
║  Pulse Deinstallation abgeschlossen (v${PULSE_UNINSTALLER_VER})           ║
╚══════════════════════════════════════════════════════════════╝

  Verzeichnis:     ${dir}
  Daten behalten:  $([ "$KEEP_DATA" -eq 1 ] && echo ja || echo nein)
  Domain:          ${domain:-—}

  Neu installieren:
    curl -fsSL https://raw.githubusercontent.com/markusringe/pulse/main/scripts/install-vps-ubuntu.sh | sudo bash

EOF
  if [ "$OUTPUT_JSON" -eq 1 ]; then
    printf '{"ok":true,"removed":"%s","keepData":%s,"domain":"%s"}\n' "$dir" "$KEEP_DATA" "${domain:-}"
  fi
}

main() {
  parse_args "$@"
  require_root

  local dir
  dir="$(resolve_install_dir)"
  local domain=""
  local env_file="$dir/.env"

  if [ "$IS_REMOTE" -eq 1 ]; then
    ok "Remote-Deinstallation erkannt (curl|bash)"
  fi

  ok "Pulse VPS-Deinstaller v${PULSE_UNINSTALLER_VER}"
  step
  log "Zielverzeichnis: $dir"

  if [ -f "$env_file" ]; then
    domain="$(read_env_value "$env_file" "DOMAIN")"
    if [ -z "$domain" ]; then
      local admin_email
      admin_email="$(read_env_value "$env_file" "BOOTSTRAP_ADMIN_EMAIL")"
      domain="${admin_email#*@}"
    fi
  fi

  confirm_uninstall "$dir"
  stop_docker_stack "$dir"
  stop_npm_process "$dir"
  purge_letsencrypt "$domain"
  remove_credentials_file "$dir"
  remove_installation "$dir"
  print_summary "$dir" "$domain"
}

main "$@"
