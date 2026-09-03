#!/usr/bin/env bash
# =============================================================================
# Pulse — VPS-Deinstallation unter Ubuntu (20.04 / 22.04 / 24.04)
# =============================================================================
#
# Stoppt den Pulse-Stack und entfernt die Installation (Standard: /opt/pulse).
# Spiegelt das Installations-Skript — gleiche Ausführungsarten.
#
# Ausführung:
#
#   A) Lokal:  cd /opt/pulse && sudo ./scripts/uninstall-vps-ubuntu.sh
#
#   B) Remote One-Liner (curl | bash):
#      curl -fsSL https://raw.githubusercontent.com/markusringe/pulse/main/scripts/uninstall-vps-ubuntu.sh | sudo bash
#
#   C) Download: curl -fsSL …/uninstall-vps-ubuntu.sh -o uninstall.sh && sudo bash uninstall.sh
#
# Optionen:
#   --dir PATH         Installationsverzeichnis (Default: /opt/pulse)
#   --keep-data        data/ und .env behalten (nur Stack stoppen)
#   --purge-certs      Let's-Encrypt-Zertifikat für DOMAIN aus .env entfernen
#   --purge-volumes    Docker-Volumes (redis, grafana, …) mit löschen
#   --yes, -y          Ohne Rückfrage bestätigen
#   --json             Zusammenfassung als JSON
#   -h, --help         Diese Hilfe
#
# =============================================================================

set -eo pipefail

readonly DEFAULT_INSTALL_DIR="/opt/pulse"
readonly PULSE_UNINSTALLER_VER="1.0"

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

usage() {
  cat <<'EOF'
Pulse — VPS-Deinstallation

  Remote: curl -fsSL …/uninstall-vps-ubuntu.sh | sudo bash

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

step() { STEP=$((STEP + 1)); }

require_root() {
  [ "$(id -u)" -eq 0 ] || die "Bitte als root ausführen: sudo bash $0"
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
  echo "$DEFAULT_INSTALL_DIR"
}

read_env_value() {
  local file="$1"
  local key="$2"
  grep "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- || true
}

confirm_uninstall() {
  local dir="$1"
  if [ "$ASSUME_YES" -eq 1 ]; then
    return 0
  fi
  if [ ! -t 0 ]; then
    warn "Nicht-interaktiv — setzen Sie --yes oder PULSE_UNINSTALL_YES=1"
    [ "${PULSE_UNINSTALL_YES:-}" = "1" ] || die "Abbruch ohne --yes"
    return 0
  fi
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  Pulse wird deinstalliert                                    ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
  echo "  Verzeichnis:  $dir"
  echo "  Daten behalten: $([ "$KEEP_DATA" -eq 1 ] && echo ja || echo 'nein, alles löschen')"
  echo "  Zertifikate:  $([ "$PURGE_CERTS" -eq 1 ] && echo löschen || echo behalten)"
  echo ""
  printf 'Fortfahren? Tippe „ja“ zum Bestätigen: '
  read -r answer
  [ "$answer" = "ja" ] || die "Abgebrochen."
}

stop_docker_stack() {
  local dir="$1"
  if [ ! -f "$dir/docker-compose.yml" ]; then
    ok "Kein docker-compose.yml — Stack-Stop übersprungen"
    return
  fi
  if ! command -v docker >/dev/null 2>&1; then
    warn "Docker nicht installiert — Stack-Stop übersprungen"
    return
  fi
  step
  log "Docker-Stack stoppen…"
  cd "$dir"
  if [ "$PURGE_VOLUMES" -eq 1 ]; then
    docker compose down -v --remove-orphans 2>/dev/null || docker compose down --remove-orphans 2>/dev/null || true
    ok "Container und Volumes gestoppt"
  else
    docker compose down --remove-orphans 2>/dev/null || true
    ok "Container gestoppt (Volumes bleiben)"
  fi
}

stop_npm_process() {
  local dir="$1"
  step
  log "Node-Prozesse (Pulse) beenden…"
  if command -v pkill >/dev/null 2>&1; then
    pkill -f "node.*${dir}" 2>/dev/null || true
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
    return
  fi
  log "Let's-Encrypt-Zertifikat für $domain entfernen…"
  certbot delete --cert-name "$domain" --non-interactive 2>/dev/null \
    || warn "Zertifikat $domain nicht gefunden oder bereits entfernt"
  ok "Zertifikat-Bereinigung abgeschlossen"
}

remove_installation() {
  local dir="$1"
  step
  if [ "$KEEP_DATA" -eq 1 ]; then
    log "Installationsdateien entfernen (data/ und .env bleiben)…"
    cd "$dir" 2>/dev/null || return 0
    find . -mindepth 1 -maxdepth 1 ! -name 'data' ! -name '.env' ! -name 'INSTALL-CREDENTIALS.txt' -exec rm -rf {} + 2>/dev/null || true
    ok "Code entfernt — data/ und .env erhalten"
    return
  fi
  log "Installationsverzeichnis entfernen: $dir"
  if [ -d "$dir" ]; then
    rm -rf "$dir"
    ok "Verzeichnis gelöscht: $dir"
  else
    warn "Verzeichnis existiert nicht: $dir"
  fi
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
  require_root
  local dir
  dir="$(resolve_install_dir)"
  local domain=""
  local env_file="$dir/.env"

  if [ "$IS_REMOTE" -eq 1 ]; then
    ok "Remote-Deinstallation erkannt (curl|bash)"
  fi

  ok "Pulse VPS-Deinstaller v${PULSE_UNINSTALLER_VER}"
  log "Ziel: $dir"

  if [ -f "$env_file" ]; then
    domain="$(read_env_value "$env_file" "DOMAIN")"
    [ -z "$domain" ] && domain="$(read_env_value "$env_file" "BOOTSTRAP_ADMIN_EMAIL")"
    domain="${domain#*@}"
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
