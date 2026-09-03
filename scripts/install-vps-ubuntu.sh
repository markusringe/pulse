#!/usr/bin/env bash
# =============================================================================
# Pulse — VPS-Installation unter Ubuntu (20.04 / 22.04 / 24.04)
# =============================================================================
#
# Installiert Abhängigkeiten, klont optional das Repository nach /opt/pulse,
# richtet .env und data/ ein und startet Pulse per Docker Compose (Standard)
# oder per Node.js (Option --npm).
#
# Ausführungsszenarien:
#
#   A) Lokal im Repository:
#      cd /opt/pulse && sudo ./scripts/install-vps-ubuntu.sh
#
#   B) Remote One-Liner (curl | bash):
#      curl -fsSL https://raw.githubusercontent.com/markusringe/pulse/main/scripts/install-vps-ubuntu.sh | sudo bash
#
#   C) Download und Ausführung:
#      curl -fsSL …/install-vps-ubuntu.sh -o install.sh && sudo bash install.sh
#
# Optionen:
#   --dir PATH           Installationsverzeichnis (Default: Repo oder /opt/pulse)
#   --git URL            Repository klonen (Default bei Remote: markusringe/pulse)
#   --branch NAME        Git-Branch (Default: main)
#   --npm                Node.js 22 + npm install statt Docker-Stack
#   --expose-grafana     UFW: Port 3001 für Grafana öffnen
#   --skip-firewall      Keine UFW-Regeln setzen
#   --skip-docker        Docker nicht installieren (nur mit --npm sinnvoll)
#   --json               Zusammenfassung als JSON auf stdout (zusätzlich)
#   -h, --help           Diese Hilfe
#
# Dokumentation: docs/installation.md
# Support: https://github.com/markusringe/pulse/issues
# =============================================================================

set -euo pipefail

# --- Konstanten ---
readonly DEFAULT_INSTALL_DIR="/opt/pulse"
readonly DEFAULT_GIT_URL="https://github.com/markusringe/pulse.git"
readonly DEFAULT_GIT_BRANCH="main"
readonly PULSE_REPO="markusringe/pulse"

# --- Optionen (werden per getopts-Loop gesetzt) ---
INSTALL_DIR=""
GIT_URL=""
GIT_BRANCH="$DEFAULT_GIT_BRANCH"
EXPOSE_GRAFANA=0
SKIP_FIREWALL=0
SKIP_DOCKER=0
USE_NPM=0
OUTPUT_JSON=0
IS_REMOTE=0

STEP=0
TOTAL_STEPS=10

# =============================================================================
# Robuste Pfadermittlung — funktioniert lokal, per curl|bash und nach Download.
# Mit set -u darf BASH_SOURCE[0] nicht ungeprüft expandiert werden.
# =============================================================================
resolve_script_dir() {
  local src=""
  if [[ -n "${BASH_SOURCE[0]+x}" && -n "${BASH_SOURCE[0]}" && "${BASH_SOURCE[0]}" != "bash" ]]; then
    src="${BASH_SOURCE[0]}"
    cd "$(dirname "$src")" && pwd
    return 0
  fi
  if [[ -d "${DEFAULT_INSTALL_DIR}/scripts" && -f "${DEFAULT_INSTALL_DIR}/scripts/install-vps-ubuntu.sh" ]]; then
    echo "${DEFAULT_INSTALL_DIR}/scripts"
    return 0
  fi
  if [[ -d "./scripts" && -f "./scripts/install-vps-ubuntu.sh" ]]; then
    cd "./scripts" && pwd
    return 0
  fi
  pwd
}

detect_remote_invocation() {
  if [[ -n "${PULSE_REMOTE_INSTALL:-}" && "${PULSE_REMOTE_INSTALL}" == "1" ]]; then
    return 0
  fi
  if [[ ! -n "${BASH_SOURCE[0]+x}" || -z "${BASH_SOURCE[0]}" || "${BASH_SOURCE[0]}" == "bash" ]]; then
    return 0
  fi
  return 1
}

SCRIPT_DIR="$(resolve_script_dir)"
if [[ -f "${SCRIPT_DIR}/../docker-compose.yml" && -f "${SCRIPT_DIR}/../package.json" ]]; then
  DEFAULT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
else
  DEFAULT_ROOT="$DEFAULT_INSTALL_DIR"
fi

if detect_remote_invocation; then
  IS_REMOTE=1
fi

# --- Ausgabe-Helfer (vor Optionen-Parser, da --help/Fehler sie brauchen) ---
log()  { printf '\033[1;32m==> [%s/%s]\033[0m %s\n' "$STEP" "$TOTAL_STEPS" "$*"; }
ok()   { printf '\033[1;32m✔\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mFehler:\033[0m %s\n' "$*" >&2; exit 1; }
need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Befehl '$1' fehlt — bitte manuell installieren und erneut ausführen."
}

usage() {
  cat <<'EOF'
Pulse — VPS-Installation unter Ubuntu (20.04 / 22.04 / 24.04)

  A) Lokal:  cd /opt/pulse && sudo ./scripts/install-vps-ubuntu.sh
  B) Remote: curl -fsSL …/install-vps-ubuntu.sh | sudo bash
  C) Download: curl -fsSL … -o install.sh && sudo bash install.sh

Optionen:
  --dir PATH           Installationsverzeichnis (Default: /opt/pulse)
  --git URL            Repository klonen (Remote-Default: markusringe/pulse)
  --branch NAME        Git-Branch (Default: main)
  --npm                Node.js 22 + npm statt Docker
  --expose-grafana     UFW: Port 3001 für Grafana
  --skip-firewall      Keine UFW-Regeln
  --skip-docker        Docker überspringen
  --json               Zusammenfassung zusätzlich als JSON
  -h, --help           Diese Hilfe

Dokumentation: docs/installation.md
EOF
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
    --npm)
      USE_NPM=1
      SKIP_DOCKER=1
      shift
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
    --json)
      OUTPUT_JSON=1
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
      die "Unbekannte Option: $1 (siehe --help)"
      ;;
  esac
done

# Bei Remote-Ausführung ohne lokales Repo: Standard-Git-URL setzen.
if [[ "$IS_REMOTE" -eq 1 && -z "$GIT_URL" ]]; then
  if [[ ! -f "${DEFAULT_ROOT}/docker-compose.yml" ]]; then
    GIT_URL="$DEFAULT_GIT_URL"
  fi
fi

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

step() {
  STEP=$((STEP + 1))
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    die "Bitte als root ausführen: sudo bash $0"
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
        20.04|22.04|24.04) ;;
        *)
          warn "Getestet für Ubuntu 20.04/22.04/24.04 — Sie verwenden ${VERSION_ID:-unbekannt}."
          ;;
      esac
      ;;
    debian)
      warn "Debian erkannt — Paketnamen können abweichen."
      ;;
    *)
      die "Dieses Skript ist für Ubuntu-VPS gedacht (ID=${ID:-?})."
      ;;
  esac
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
  echo "$DEFAULT_INSTALL_DIR"
}

system_update() {
  step
  log "System aktualisieren (apt update/upgrade)…"
  need_cmd apt-get
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq || warn "apt upgrade mit Warnungen — Installation wird fortgesetzt."
  ok "System aktualisiert"
}

install_git() {
  step
  log "Git installieren…"
  if command -v git >/dev/null 2>&1; then
    ok "Git vorhanden: $(git --version | head -1)"
    return
  fi
  apt-get install -y git || die "Git-Installation fehlgeschlagen — manuell: apt-get install -y git"
  ok "Git installiert"
}

install_nodejs() {
  step
  log "Node.js 22 prüfen/installieren…"
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")"
    if [ "${major:-0}" -ge 22 ]; then
      ok "Node.js vorhanden: $(node -v)"
      return
    fi
    warn "Node.js $(node -v) ist älter als 22 — wird aktualisiert."
  fi
  apt-get install -y ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - || die "NodeSource-Setup fehlgeschlagen."
  apt-get install -y nodejs || die "Node.js-Installation fehlgeschlagen."
  need_cmd node
  need_cmd npm
  ok "Node.js installiert: $(node -v), npm $(npm -v)"
}

install_docker() {
  if [ "$SKIP_DOCKER" -eq 1 ]; then
    step
    log "Docker-Installation übersprungen (--skip-docker / --npm)"
    return
  fi
  step
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    ok "Docker vorhanden: $(docker --version)"
    return
  fi

  log "Docker Engine und Compose-Plugin installieren…"
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
  [ -n "$codename" ] || die "Ubuntu-Codename nicht ermittelbar — Docker manuell installieren."

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${codename} stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin \
    || die "Docker-Pakete konnten nicht installiert werden."

  systemctl enable --now docker
  ok "Docker installiert: $(docker --version)"
}

prepare_project() {
  step
  local dir="$1"
  install_git

  if [ -n "$GIT_URL" ]; then
    if [ -d "$dir/.git" ]; then
      log "Git-Repo vorhanden — aktualisiere $dir (Branch $GIT_BRANCH)…"
      git -C "$dir" fetch --all || warn "git fetch fehlgeschlagen"
      git -C "$dir" checkout "$GIT_BRANCH" || true
      git -C "$dir" pull --ff-only || warn "git pull fehlgeschlagen — ggf. manuell prüfen"
    elif [ -d "$dir" ] && [ "$(ls -A "$dir" 2>/dev/null | wc -l)" -gt 0 ]; then
      die "Verzeichnis $dir ist nicht leer und kein Git-Clone — --dir wählen oder leeren."
    else
      log "Klone $GIT_URL nach $dir (Branch $GIT_BRANCH)…"
      mkdir -p "$(dirname "$dir")"
      git clone --branch "$GIT_BRANCH" --depth 1 "$GIT_URL" "$dir" \
        || die "Git clone fehlgeschlagen — URL und Netzwerk prüfen."
    fi
  else
    [ -f "$dir/docker-compose.yml" ] || die "Kein Pulse-Projekt in $dir — --git URL angeben oder Skript im Repo ausführen."
  fi
  ok "Projekt bereit: $dir"
}

ensure_data_dir() {
  step
  local dir="$1"
  local data_dir="$dir/data"
  log "Datenverzeichnis anlegen: $data_dir"
  mkdir -p "$data_dir"
  chmod 750 "$data_dir"
  if [ -n "${SUDO_USER:-}" ]; then
    chown -R "${SUDO_USER}:${SUDO_USER}" "$data_dir" 2>/dev/null || true
  fi
  ok "data/ angelegt"
}

# Optionale Benutzerverwaltung in .env eintragen.
AUTH_CREDS_EXTRA=""
ADMIN_SECRET_VALUE=""
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
    log "USER_AUTH_ENABLED=1 (nicht-interaktiv — SMTP in .env prüfen)"
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
  ok "Benutzerverwaltung in .env konfiguriert"
}

write_env_file() {
  step
  local dir="$1"
  local env_file="$dir/.env"
  log ".env erstellen und absichern…"

  if [ ! -f "$env_file" ] && [ -f "$dir/.env.example" ]; then
    cp "$dir/.env.example" "$env_file"
    ok ".env aus .env.example erstellt"
  fi
  [ -f "$env_file" ] || die ".env fehlt in $dir"

  local admin_secret grafana_pw
  admin_secret="$(random_hex 32)"
  grafana_pw="$(random_hex 12)"

  if grep -q '^ADMIN_SECRET=bitte-langen-zufallswert-setzen' "$env_file" 2>/dev/null \
    || grep -q '^ADMIN_SECRET=bitte-in-produktion-setzen' "$env_file" 2>/dev/null \
    || ! grep -q '^ADMIN_SECRET=' "$env_file" 2>/dev/null; then
    if grep -q '^ADMIN_SECRET=' "$env_file" 2>/dev/null; then
      sed -i "s/^ADMIN_SECRET=.*/ADMIN_SECRET=${admin_secret}/" "$env_file"
    else
      printf '\nADMIN_SECRET=%s\n' "$admin_secret" >> "$env_file"
    fi
    ok "ADMIN_SECRET gesetzt (openssl rand)"
  else
    admin_secret="$(grep '^ADMIN_SECRET=' "$env_file" | cut -d= -f2- || true)"
  fi
  ADMIN_SECRET_VALUE="$admin_secret"

  if ! grep -q '^GRAFANA_PASSWORD=' "$env_file" 2>/dev/null; then
    printf '\nGRAFANA_PASSWORD=%s\n' "$grafana_pw" >> "$env_file"
  else
    grafana_pw="$(grep '^GRAFANA_PASSWORD=' "$env_file" | cut -d= -f2-)"
  fi

  grep -q '^REDIS_URL=' "$env_file" || printf 'REDIS_URL=redis://redis:6379\n' >> "$env_file"
  grep -q '^UPDATE_REPO=' "$env_file" || printf 'UPDATE_REPO=%s\n' "$PULSE_REPO" >> "$env_file"

  configure_user_auth "$env_file"

  chmod 600 "$env_file"
  ok ".env geschützt (chmod 600)"

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
  ok "Zugangsdaten: $CREDS_FILE"
}

configure_firewall() {
  if [ "$SKIP_FIREWALL" -eq 1 ]; then
    step
    log "Firewall übersprungen (--skip-firewall)"
    return
  fi
  step
  if ! command -v ufw >/dev/null 2>&1; then
    warn "ufw nicht installiert — Ports 22, 80, 443, 3000 manuell öffnen."
    return
  fi
  log "UFW: SSH, HTTP, HTTPS, Pulse (3000)…"
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 3000/tcp
  if [ "$EXPOSE_GRAFANA" -eq 1 ]; then
    ufw allow 3001/tcp
    warn "Grafana Port 3001 öffentlich — starkes Passwort in .env setzen!"
  fi
  if ufw status 2>/dev/null | grep -q inactive; then
    ufw --force enable
  fi
  ok "Firewall konfiguriert"
  ufw status numbered 2>/dev/null || true
}

start_docker_stack() {
  step
  local dir="$1"
  cd "$dir"
  need_cmd docker
  chmod +x scripts/seed-data.sh 2>/dev/null || true
  ./scripts/seed-data.sh "$dir/data"

  log "Docker-Images bauen…"
  docker compose build || die "docker compose build fehlgeschlagen — Logs prüfen."
  log "Stack starten…"
  docker compose up -d || die "docker compose up fehlgeschlagen."

  log "Warte auf Healthcheck…"
  local i=0
  while [ "$i" -lt 45 ]; do
    if curl -fsS http://127.0.0.1/api/health >/dev/null 2>&1; then
      ok "Pulse antwortet auf /api/health"
      return
    fi
    sleep 2
    i=$((i + 1))
  done
  warn "Healthcheck-Timeout — Logs: docker compose -f $dir/docker-compose.yml logs pulse"
}

start_npm_stack() {
  step
  local dir="$1"
  cd "$dir"
  install_nodejs
  log "npm install (Produktion)…"
  npm install --omit=dev || die "npm install fehlgeschlagen."
  chmod +x scripts/seed-data.sh 2>/dev/null || true
  ./scripts/seed-data.sh "$dir/data"
  ok "npm-Abhängigkeiten installiert — Start: cd $dir && npm start"
}

print_summary() {
  local dir="$1"
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$ip" ] || ip="<server-ip>"

  local start_hint
  if [ "$USE_NPM" -eq 1 ]; then
    start_hint="cd ${dir} && npm start   # Port 3000"
  else
    start_hint="cd ${dir} && docker compose up -d"
  fi

  cat <<EOF

╔══════════════════════════════════════════════════════════════╗
║  Pulse VPS-Installation abgeschlossen                        ║
╚══════════════════════════════════════════════════════════════╝

  Pulse (HTTP):       http://${ip}:3000/
  Administration:     http://${ip}:3000/#/admin
  Anmeldung (Auth):   http://${ip}:3000/#/admin/login
  Health:             http://${ip}:3000/api/health
  Updates (Admin):    http://${ip}:3000/#/admin/updates

  ADMIN_SECRET (einmalig — auch in INSTALL-CREDENTIALS.txt):
  ${ADMIN_SECRET_VALUE}

  Geheimnisse:        ${dir}/INSTALL-CREDENTIALS.txt  (chmod 600)
  Daten (Backup):     ${dir}/data/
  Umgebung:           ${dir}/.env  (chmod 600)

  Start / Neustart:
    ${start_hint}

  Nützliche Befehle:
    docker compose -f ${dir}/docker-compose.yml ps
    docker compose -f ${dir}/docker-compose.yml logs -f pulse

  Nächste Schritte:
    1. ADMIN_SECRET sicher notieren
    2. DNS auf ${ip} zeigen lassen
    3. HTTPS: #/admin/ssl (Port 80 muss erreichbar sein)
    4. Optional: UPDATE_REPO=${PULSE_REPO} in .env (bereits gesetzt)

  Dokumentation: docs/installation.md
  Repository:    https://github.com/${PULSE_REPO}

EOF

  if [ "$OUTPUT_JSON" -eq 1 ]; then
    print_summary_json "$dir" "$ip"
  fi
}

print_summary_json() {
  local dir="$1"
  local ip="$2"
  local mode="docker"
  [ "$USE_NPM" -eq 1 ] && mode="npm"
  cat <<EOF
{"ok":true,"mode":"${mode}","installDir":"${dir}","adminUrl":"http://${ip}:3000/#/admin","healthUrl":"http://${ip}:3000/api/health","credentialsFile":"${dir}/INSTALL-CREDENTIALS.txt","remote":${IS_REMOTE}}
EOF
}

main() {
  require_root
  check_ubuntu

  if [ "$IS_REMOTE" -eq 1 ]; then
    ok "Remote-Installation erkannt (curl|bash oder Download)"
  fi

  local dir
  dir="$(resolve_install_dir)"
  STEP=0
  log "Pulse VPS-Installer — Zielverzeichnis: $dir"

  system_update
  if [ "$USE_NPM" -eq 1 ]; then
    install_git
    prepare_project "$dir"
    ensure_data_dir "$dir"
    write_env_file "$dir"
    configure_firewall
    start_npm_stack "$dir"
  else
    install_docker
    prepare_project "$dir"
    ensure_data_dir "$dir"
    write_env_file "$dir"
    configure_firewall
    start_docker_stack "$dir"
  fi

  print_summary "$dir"
}

main "$@"
