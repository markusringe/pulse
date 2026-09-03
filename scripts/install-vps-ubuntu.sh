#!/usr/bin/env bash
# Pulse — VPS-Installation unter Ubuntu (22.04 / 24.04).
# Installiert Docker, Docker Compose, richtet Daten-Grundeinstellungen ein und startet den Stack.
#
# Nutzung (als root oder mit sudo):
#   curl -fsSL …/install-vps-ubuntu.sh | sudo bash -s --
#   sudo ./scripts/install-vps-ubuntu.sh
#   sudo ./scripts/install-vps-ubuntu.sh --dir /opt/pulse --expose-grafana
#
# Optionen:
#   --dir PATH          Installationsverzeichnis (Default: Verzeichnis dieses Repos bzw. /opt/pulse)
#   --git URL           Repo klonen nach --dir (überschreibt nicht vorhandene Dateien)
#   --branch NAME       Git-Branch (Default: main)
#   --expose-grafana    UFW: Port 3001 für Grafana öffnen (sonst nur lokal/SSH-Tunnel)
#   --skip-firewall     Keine UFW-Regeln setzen
#   --skip-docker       Docker nicht installieren (bereits vorhanden)
#   -h, --help          Hilfe

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_DIR=""
GIT_URL=""
GIT_BRANCH="main"
EXPOSE_GRAFANA=0
SKIP_FIREWALL=0
SKIP_DOCKER=0

usage() {
  sed -n '3,18p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dir)
      INSTALL_DIR="${2:-}"
      shift 2
      ;;
    --git)
      GIT_URL="${2:-}"
      shift 2
      ;;
    --branch)
      GIT_BRANCH="${2:-main}"
      shift 2
      ;;
    --expose-grafana)
      EXPOSE_GRAFANA=1
      shift
      ;;
    --skip-firewall)
      SKIP_FIREWALL=1
      shift
      ;;
    --skip-docker)
      SKIP_DOCKER=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --dir=*)
      INSTALL_DIR="${1#--dir=}"
      shift
      ;;
    --git=*)
      GIT_URL="${1#--git=}"
      shift
      ;;
    --branch=*)
      GIT_BRANCH="${1#--branch=}"
      shift
      ;;
    *)
      echo "Unbekannte Option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

log() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31mFehler:\033[0m %s\n' "$*" >&2; exit 1; }

random_hex() {
  local bytes="${1:-32}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
  elif command -v node >/dev/null 2>&1; then
    node -e "console.log(require('crypto').randomBytes($bytes).toString('hex'))"
  else
    die "Weder openssl noch node für Zufallssecrets verfügbar."
  fi
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    die "Bitte als root ausführen: sudo $0 $*"
  fi
}

check_ubuntu() {
  if [ ! -f /etc/os-release ]; then
    die "Nur Ubuntu/Debian-basierte Systeme werden unterstützt."
  fi
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}" in
    ubuntu)
      case "${VERSION_ID:-}" in
        22.04|24.04) ;;
        *)
          warn "Getestet für Ubuntu 22.04/24.04 — Sie verwenden ${VERSION_ID:-unbekannt}. Fortfahren auf eigenes Risiko."
          ;;
      esac
      ;;
    debian)
      warn "Debian erkannt — Docker-Installation kann abweichen, meist funktionsfähig."
      ;;
    *)
      die "Dieses Skript ist für Ubuntu-VPS gedacht (ID=${ID:-?})."
      ;;
  esac
}

install_docker() {
  if [ "$SKIP_DOCKER" -eq 1 ]; then
    log "Docker-Installation übersprungen (--skip-docker)"
    return
  fi
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "Docker bereits vorhanden: $(docker --version)"
    return
  fi

  log "Docker Engine und Compose-Plugin installieren…"
  apt-get update -qq
  apt-get install -y ca-certificates curl gnupg

  install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.asc ]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi

  # shellcheck disable=SC1091
  . /etc/os-release
  local codename="${VERSION_CODENAME:-}"
  if [ -z "$codename" ] && [ -f /usr/lib/os-release ]; then
    # shellcheck disable=SC1091
    . /usr/lib/os-release
    codename="${VERSION_CODENAME:-}"
  fi
  [ -n "$codename" ] || die "Ubuntu-Codename nicht ermittelbar."

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${codename} stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  systemctl enable --now docker
  log "Docker installiert: $(docker --version)"
}

configure_firewall() {
  if [ "$SKIP_FIREWALL" -eq 1 ]; then
    log "Firewall übersprungen (--skip-firewall)"
    return
  fi
  if ! command -v ufw >/dev/null 2>&1; then
    log "ufw nicht installiert — Firewall manuell konfigurieren (Ports 22, 80, 443)."
    return
  fi
  log "UFW: SSH, HTTP, HTTPS erlauben…"
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  if [ "$EXPOSE_GRAFANA" -eq 1 ]; then
    ufw allow 3001/tcp
    warn "Grafana-Port 3001 ist öffentlich — starkes Passwort in .env setzen!"
  fi
  if ufw status | grep -q inactive; then
    ufw --force enable
  fi
  ufw status numbered || true
}

resolve_install_dir() {
  if [ -n "$INSTALL_DIR" ]; then
    echo "$INSTALL_DIR"
    return
  fi
  if [ -f "$DEFAULT_ROOT/docker-compose.yml" ] && [ -f "$DEFAULT_ROOT/package.json" ]; then
    echo "$DEFAULT_ROOT"
    return
  fi
  echo "/opt/pulse"
}

prepare_project() {
  local dir="$1"
  if [ -n "$GIT_URL" ]; then
    apt-get install -y git
    if [ -d "$dir/.git" ]; then
      log "Git-Repo vorhanden — pull in $dir"
      git -C "$dir" fetch --all
      git -C "$dir" checkout "$GIT_BRANCH"
      git -C "$dir" pull --ff-only || true
    elif [ -d "$dir" ] && [ "$(ls -A "$dir" 2>/dev/null | wc -l)" -gt 0 ]; then
      die "Verzeichnis $dir ist nicht leer und kein Git-Clone — --dir wählen oder leeren."
    else
      log "Klone $GIT_URL nach $dir (Branch $GIT_BRANCH)…"
      mkdir -p "$(dirname "$dir")"
      git clone --branch "$GIT_BRANCH" --depth 1 "$GIT_URL" "$dir"
    fi
  else
    [ -f "$dir/docker-compose.yml" ] || die "Kein Pulse-Projekt in $dir — --git URL angeben oder Skript im Repo ausführen."
  fi
}

# Optionale Benutzerverwaltung in .env eintragen (interaktiv oder Default).
AUTH_CREDS_EXTRA=""
configure_user_auth() {
  local env_file="$1"
  if grep -q '^USER_AUTH_ENABLED=' "$env_file" 2>/dev/null; then
    return
  fi
  local enable=0
  if [ -t 0 ]; then
    printf 'Benutzerverwaltung (E-Mail-PIN) aktivieren? [J/n]: '
    read -r auth_answer
    if [ -z "$auth_answer" ] || echo "$auth_answer" | grep -qi '^j'; then
      enable=1
    fi
  else
    enable=1
    log "USER_AUTH_ENABLED=1 (nicht-interaktiv — SMTP und Bootstrap in .env prüfen)"
  fi
  if [ "$enable" -eq 0 ]; then
    return
  fi
  printf 'USER_AUTH_ENABLED=1\n' >> "$env_file"
  local admin_name admin_email admin_pw
  if [ -t 0 ]; then
    printf 'Bootstrap-Admin Name [admin]: '
    read -r admin_name
    admin_name="${admin_name:-admin}"
    printf 'Bootstrap-Admin E-Mail: '
    read -r admin_email
    admin_email="${admin_email:-admin@example.org}"
    printf 'Bootstrap-Admin Kennwort (nur Kontoänderungen): '
    read -r -s admin_pw
    echo ""
    admin_pw="${admin_pw:-$(random_hex 8)}"
    printf 'SMTP in .env konfigurieren (SMTP_HOST, SMTP_USER, …) — sonst PIN-Versand ausbleibend.\n'
  else
    admin_name="admin"
    admin_email="admin@example.org"
    admin_pw="$(random_hex 12)"
  fi
  cat >> "$env_file" <<EOF
BOOTSTRAP_ADMIN_NAME=${admin_name}
BOOTSTRAP_ADMIN_EMAIL=${admin_email}
BOOTSTRAP_ADMIN_PASSWORD=${admin_pw}
EOF
  AUTH_CREDS_EXTRA="
Benutzerverwaltung: aktiv (USER_AUTH_ENABLED=1)
Bootstrap-Admin E-Mail: ${admin_email}
Bootstrap-Admin Kennwort (Profil): ${admin_pw}
Login: http://<server>/#/admin/login (PIN per SMTP)
"
  log "Benutzerverwaltung in .env konfiguriert"
}

write_env_file() {
  local dir="$1"
  local env_file="$dir/.env"
  if [ ! -f "$env_file" ] && [ -f "$dir/.env.example" ]; then
    cp "$dir/.env.example" "$env_file"
    log ".env aus .env.example erstellt"
  fi
  [ -f "$env_file" ] || die ".env fehlt in $dir"

  local admin_secret grafana_pw
  admin_secret="$(random_hex 32)"
  grafana_pw="$(random_hex 12)"

  if grep -q '^ADMIN_SECRET=bitte-langen-zufallswert-setzen' "$env_file" 2>/dev/null \
    || grep -q '^ADMIN_SECRET=bitte-in-produktion-setzen' "$env_file" 2>/dev/null; then
    sed -i "s/^ADMIN_SECRET=.*/ADMIN_SECRET=${admin_secret}/" "$env_file"
    log "ADMIN_SECRET in .env gesetzt"
  else
    admin_secret="$(grep '^ADMIN_SECRET=' "$env_file" | cut -d= -f2- || true)"
  fi

  if ! grep -q '^GRAFANA_PASSWORD=' "$env_file" 2>/dev/null; then
    printf '\nGRAFANA_PASSWORD=%s\n' "$grafana_pw" >> "$env_file"
    log "GRAFANA_PASSWORD in .env ergänzt"
  else
    grafana_pw="$(grep '^GRAFANA_PASSWORD=' "$env_file" | cut -d= -f2-)"
  fi

  # Compose-Defaults für Docker-Stack
  grep -q '^REDIS_URL=' "$env_file" || printf 'REDIS_URL=redis://redis:6379\n' >> "$env_file"

  configure_user_auth "$env_file"

  CREDS_FILE="$dir/INSTALL-CREDENTIALS.txt"
  cat > "$CREDS_FILE" <<EOF
Pulse — Installationszugangsdaten ($(date -u +%Y-%m-%dT%H:%M:%SZ))
Speichern Sie diese Datei sicher und löschen Sie sie nach dem Notieren.

ADMIN_SECRET (API / Instanz-Admin):
  ${admin_secret}

Grafana (http://<server>:3001, User admin):
  ${grafana_pw}
${AUTH_CREDS_EXTRA}
Installationsverzeichnis: ${dir}
EOF
  chmod 600 "$CREDS_FILE"
  log "Zugangsdaten gespeichert: $CREDS_FILE"
}

start_stack() {
  local dir="$1"
  cd "$dir"
  chmod +x scripts/seed-data.sh 2>/dev/null || true
  ./scripts/seed-data.sh "$dir/data"

  log "Docker-Images bauen…"
  docker compose build
  log "Stack starten…"
  docker compose up -d

  log "Warte auf Healthcheck…"
  local i=0
  while [ "$i" -lt 45 ]; do
    if curl -fsS http://127.0.0.1/api/health >/dev/null 2>&1; then
      log "Pulse antwortet auf /api/health"
      break
    fi
    sleep 2
    i=$((i + 1))
  done
  if [ "$i" -ge 45 ]; then
    warn "Healthcheck-Timeout — Logs prüfen: docker compose -f $dir/docker-compose.yml logs pulse"
  fi
}

print_summary() {
  local dir="$1"
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$ip" ] || ip="<server-ip>"

  cat <<EOF

╔══════════════════════════════════════════════════════════════╗
║  Pulse VPS-Installation abgeschlossen                        ║
╚══════════════════════════════════════════════════════════════╝

  Pulse (HTTP):     http://${ip}/
  Health:           http://${ip}/api/health
  Administration:   http://${ip}/#/admin
  Anmeldung (Auth): http://${ip}/#/admin/login
  Grafana:          http://${ip}:3001/  (nur wenn --expose-grafana oder Port frei)

  Geheimnisse:      ${dir}/INSTALL-CREDENTIALS.txt
  Daten (Backup):   ${dir}/data/
  Umgebung:         ${dir}/.env

  Nützliche Befehle (im Verzeichnis ${dir}):
    docker compose ps
    docker compose logs -f pulse
    docker compose restart
    docker compose down

  HTTPS: DNS auf diesen Server, Port 80 offen, dann #/admin/ssl (Let's Encrypt).

  Dokumentation: docs/installation.md

EOF
}

main() {
  require_root
  check_ubuntu

  local dir
  dir="$(resolve_install_dir)"
  log "Installationsverzeichnis: $dir"

  install_docker
  prepare_project "$dir"
  write_env_file "$dir"
  configure_firewall
  start_stack "$dir"
  print_summary "$dir"
}

main
