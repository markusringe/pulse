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
# Deinstallation (gleiches Muster):
#   curl -fsSL …/uninstall-vps-ubuntu.sh | sudo bash
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

# set -u bewusst erst nach Pfadermittlung — bei curl|bash ist BASH_SOURCE[0] oft unset.
set -eo pipefail

# --- Konstanten ---
readonly DEFAULT_INSTALL_DIR="/opt/pulse"
readonly DEFAULT_GIT_URL="https://github.com/markusringe/pulse.git"
readonly DEFAULT_GIT_BRANCH="main"
readonly PULSE_REPO="markusringe/pulse"
readonly PULSE_INSTALLER_VER="2.5"

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

# Interaktive Installations-Konfiguration
INSTALL_DOMAIN=""
INSTALL_SSL=0
SSL_ENABLED=0
SSL_CERT_PATH=""
SSL_KEY_PATH=""
INSTALL_ADMIN_EMAIL=""
INSTALL_ADMIN_NAME="admin"
INSTALL_ADMIN_PASSWORD=""

STEP=0
TOTAL_STEPS=11

# =============================================================================
# Robuste Pfadermittlung — funktioniert lokal, per curl|bash und nach Download.
# Mit set -u darf BASH_SOURCE[0] nicht ungeprüft expandiert werden.
# =============================================================================
resolve_script_dir() {
  local src="${BASH_SOURCE[0]:-}"
  if [[ -n "$src" && "$src" != "bash" && -f "$src" ]]; then
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
  local src="${BASH_SOURCE[0]:-}"
  if [[ ! -t 0 ]] || [[ -z "$src" ]] || [[ "$src" == "bash" ]]; then
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

# Ab hier dürfen unset-Variablen als Fehler gelten (nach Pfad-/Remote-Erkennung).
set -u

# --- Ausgabe-Helfer (vor Optionen-Parser, da --help/Fehler sie brauchen) ---
log()  { printf '\033[1;32m==> [%s/%s]\033[0m %s\n' "$STEP" "$TOTAL_STEPS" "$*"; }
ok()   { printf '\033[1;32m✔\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mFehler:\033[0m %s\n' "$*" >&2; exit 1; }
need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Befehl '$1' fehlt — bitte manuell installieren und erneut ausführen."
}

# Bei curl|bash kommt das Skript über stdin — Eingaben laufen über /dev/tty.
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

read_secret_tty() {
  if [ -r /dev/tty ] 2>/dev/null; then
    read -r -s "$@" < /dev/tty
  else
    read -r -s "$@"
  fi
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
        20.04|22.04|24.04|26.04) ;;
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

# Postfix/Sendmail für PIN-E-Mails (npm-Modus auf dem Host — Docker-Image bringt Postfix mit)
install_sendmail() {
  step
  log "Sendmail/Postfix für PIN-E-Mails prüfen…"
  if command -v sendmail >/dev/null 2>&1 || [ -x /usr/sbin/sendmail ]; then
    ok "Sendmail vorhanden: $(command -v sendmail 2>/dev/null || echo /usr/sbin/sendmail)"
  else
    log "Postfix installieren (Versand nach außen, nur localhost lauscht)…"
    debconf-set-selections <<'DEBCONF' || true
postfix postfix/mailname string localhost
postfix postfix/main_mailer_type select Internet Site
DEBCONF
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postfix libsasl2-modules \
      || die "Postfix-Installation fehlgeschlagen — PIN-E-Mails benötigen Sendmail."
    ok "Postfix installiert"
  fi
  postconf -e 'inet_interfaces=loopback-only' 2>/dev/null || true
  postconf -e 'mynetworks=127.0.0.0/8 [::1]/128' 2>/dev/null || true
  postconf -e 'mydestination=localhost, $myhostname' 2>/dev/null || true
  postconf -e 'smtpd_relay_restrictions=permit_mynetworks,reject_unauth_destination' 2>/dev/null || true
  postconf -e 'smtpd_recipient_restrictions=permit_mynetworks,reject' 2>/dev/null || true
  systemctl enable postfix 2>/dev/null || true
  systemctl restart postfix 2>/dev/null || true
  ok "Postfix abgesichert (nur localhost, Versand nach außen möglich)"
}

configure_pulse_sendmail() {
  local dir="$1"
  log "Pulse-E-Mail-Konfiguration auf Sendmail setzen…"
  if (cd "$dir" && node -e "
    require('./lib/sendmailSetup')
      .ensureSendmailForPulse({ allowInstall: false })
      .then((r) => {
        if (r.configured) console.log('[sendmail] Standard-Versand aktiviert:', r.sendmailPath);
        else if (r.sendmailPath) console.log('[sendmail] Sendmail bereit:', r.sendmailPath);
        else console.warn('[sendmail] Kein Sendmail-Binary gefunden');
      })
      .catch((e) => { console.warn('[sendmail]', e.message || e); process.exit(0); });
  "); then
    ok "Sendmail als Standard-Versand konfiguriert"
  else
    warn "Sendmail-Konfiguration übersprungen — später unter #/admin/email einrichten"
  fi
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

# Interaktive Konfiguration: optional Backup, Domain, SSL, Admin-Kennwort.
configure_interactive() {
  if [ -n "${PULSE_DOMAIN:-}" ]; then
    INSTALL_DOMAIN="$PULSE_DOMAIN"
  fi
  if [ -n "${PULSE_ADMIN_EMAIL:-}" ]; then
    INSTALL_ADMIN_EMAIL="$PULSE_ADMIN_EMAIL"
  fi
  if [ -n "${PULSE_ADMIN_PASSWORD:-}" ]; then
    INSTALL_ADMIN_PASSWORD="$PULSE_ADMIN_PASSWORD"
  fi
  if [ "${PULSE_INSTALL_SSL:-}" = "1" ]; then
    INSTALL_SSL=1
  fi

  if is_fully_noninteractive; then
    if [ -z "$INSTALL_DOMAIN" ]; then
      die "PULSE_DOMAIN ist erforderlich (kein Terminal — z. B. CI)."
    fi
    INSTALL_ADMIN_EMAIL="${INSTALL_ADMIN_EMAIL:-admin@${INSTALL_DOMAIN}}"
    if [ -z "$INSTALL_ADMIN_PASSWORD" ]; then
      INSTALL_ADMIN_PASSWORD="$(random_hex 16)"
    fi
    if [ -z "${PULSE_INSTALL_SSL+x}" ]; then
      INSTALL_SSL=1
    elif [ "${PULSE_INSTALL_SSL}" = "1" ]; then
      INSTALL_SSL=1
    else
      INSTALL_SSL=0
    fi
    warn "Nicht-interaktiv: Domain ${INSTALL_DOMAIN}, Admin ${INSTALL_ADMIN_EMAIL} — Details in INSTALL-CREDENTIALS.txt"
    return
  fi

  echo ""
  echo "=== Team Townhall (Pulse) Konfiguration ==="
  echo ""

  while [ -z "$INSTALL_DOMAIN" ]; do
    printf 'Domain unter der Pulse erreichbar sein soll (z.B. pulse.example.com): '
    read_tty INSTALL_DOMAIN
    INSTALL_DOMAIN="$(echo "$INSTALL_DOMAIN" | tr '[:upper:]' '[:lower:]' | xargs)"
    if [ -z "$INSTALL_DOMAIN" ]; then
      warn "Eine Domain ist für die Server-Installation erforderlich (DNS muss auf diesen Server zeigen)."
    elif ! echo "$INSTALL_DOMAIN" | grep -Eq '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'; then
      warn "Ungültiges Domain-Format — bitte erneut eingeben."
      INSTALL_DOMAIN=""
    fi
  done

  if [ "$INSTALL_SSL" -eq 0 ]; then
    printf "Let's Encrypt SSL für %s einrichten? [J/n]: " "$INSTALL_DOMAIN"
    read_tty ssl_answer
    if [ -z "$ssl_answer" ] || echo "$ssl_answer" | grep -qi '^j'; then
      INSTALL_SSL=1
    else
      INSTALL_SSL=0
    fi
  fi

  echo ""
  echo "Administrator-Konto (Erstlogin per Kennwort, kein E-Mail-Versand):"
  if [ -z "$INSTALL_ADMIN_EMAIL" ]; then
    printf 'Admin E-Mail-Adresse: '
    read_tty INSTALL_ADMIN_EMAIL
  fi
  INSTALL_ADMIN_EMAIL="$(echo "$INSTALL_ADMIN_EMAIL" | tr '[:upper:]' '[:lower:]' | xargs)"
  if [ -z "$INSTALL_ADMIN_EMAIL" ]; then
    die "Admin E-Mail ist erforderlich."
  fi

  if [ -z "$INSTALL_ADMIN_PASSWORD" ]; then
    while true; do
      printf 'Initiales Admin-Kennwort (mind. 8 Zeichen): '
      read_secret_tty INSTALL_ADMIN_PASSWORD
      echo ""
      if [ "${#INSTALL_ADMIN_PASSWORD}" -ge 8 ]; then
        break
      fi
      warn "Kennwort muss mindestens 8 Zeichen lang sein."
    done
  fi
  if [ "${#INSTALL_ADMIN_PASSWORD}" -lt 8 ]; then
    die "Admin-Kennwort muss mindestens 8 Zeichen lang sein."
  fi

  ok "Konfiguration erfasst (Domain: ${INSTALL_DOMAIN}, SSL: $([ "$INSTALL_SSL" -eq 1 ] && echo ja || echo nein))"
}

# Branding: Domain und IP-Sperre aus in data/branding.json.
configure_branding() {
  local dir="$1"
  local domain="$2"
  local data_dir="$dir/data"
  mkdir -p "$data_dir"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$data_dir" "$domain" <<'PY'
import json, os, sys
data_dir, domain = sys.argv[1], sys.argv[2]
path = os.path.join(data_dir, "branding.json")
branding = {}
if os.path.isfile(path):
    with open(path, encoding="utf-8") as fh:
        branding = json.load(fh)
branding["customDomain"] = domain
branding["ipBlock"] = False
with open(path, "w", encoding="utf-8") as fh:
    json.dump(branding, fh, indent=2, ensure_ascii=False)
    fh.write("\n")
PY
    ok "Branding: customDomain=${domain}, ipBlock=false"
  elif command -v node >/dev/null 2>&1; then
    node -e "
      const fs=require('fs'); const p='${data_dir}/branding.json';
      let b={}; try{b=JSON.parse(fs.readFileSync(p,'utf8'));}catch{}
      b.customDomain='${domain}'; b.ipBlock=false;
      fs.writeFileSync(p, JSON.stringify(b,null,2)+'\n');
    "
    ok "Branding: customDomain=${domain}, ipBlock=false"
  else
    warn "python3/node fehlt — branding.json manuell anpassen (customDomain, ipBlock=false)"
  fi
}

# nginx für Docker-Stack: server_name und optional HTTPS.
write_nginx_config() {
  local dir="$1"
  local domain="$2"
  local ssl="$3"
  local nginx_file="$dir/deploy/nginx.conf"
  mkdir -p "$dir/deploy/certs"

  if [ "$ssl" -eq 1 ]; then
    cat > "$nginx_file" <<NGINX
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /tmp/nginx.pid;

events {
    worker_connections 4096;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    keepalive_timeout 65;
    server_tokens off;

    map \$http_upgrade \$connection_upgrade {
        default upgrade;
        ""      close;
    }

    upstream pulse_app {
        ip_hash;
        server pulse:3000;
        server pulse-b:3000;
    }

    server {
        listen 80;
        server_name ${domain};
        return 301 https://\$host\$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name ${domain};
        ssl_certificate     /etc/nginx/certs/fullchain.pem;
        ssl_certificate_key /etc/nginx/certs/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;

        location /metrics {
            allow 10.0.0.0/8;
            allow 172.16.0.0/12;
            allow 192.168.0.0/16;
            deny all;
            proxy_pass http://pulse_app;
        }

        location /.well-known/acme-challenge/ {
            proxy_pass http://pulse_app;
            proxy_set_header Host \$host;
        }

        location / {
            proxy_pass http://pulse_app;
            proxy_http_version 1.1;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto https;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection \$connection_upgrade;
            proxy_read_timeout 3600s;
            proxy_send_timeout 3600s;
        }
    }
}
NGINX
  else
    cat > "$nginx_file" <<NGINX
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /tmp/nginx.pid;

events {
    worker_connections 4096;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    keepalive_timeout 65;
    server_tokens off;

    map \$http_upgrade \$connection_upgrade {
        default upgrade;
        ""      close;
    }

    upstream pulse_app {
        ip_hash;
        server pulse:3000;
        server pulse-b:3000;
    }

    server {
        listen 80;
        server_name ${domain};

        location /metrics {
            allow 10.0.0.0/8;
            allow 172.16.0.0/12;
            allow 192.168.0.0/16;
            deny all;
            proxy_pass http://pulse_app;
        }

        location /.well-known/acme-challenge/ {
            proxy_pass http://pulse_app;
            proxy_set_header Host \$host;
        }

        location / {
            proxy_pass http://pulse_app;
            proxy_http_version 1.1;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection \$connection_upgrade;
            proxy_read_timeout 3600s;
            proxy_send_timeout 3600s;
        }
    }
}
NGINX
  fi
  ok "nginx konfiguriert für ${domain} (SSL=$([ "$ssl" -eq 1 ] && echo an || echo aus))"
}

# Domain in Branding, nginx und Zertifikate für den Docker-Reverse-Proxy.
configure_server_domain() {
  local dir="$1"
  step
  log "Server für Domain ${INSTALL_DOMAIN} konfigurieren…"
  configure_branding "$dir" "$INSTALL_DOMAIN"

  if [ "$USE_NPM" -eq 1 ] || [ "$SKIP_DOCKER" -eq 1 ]; then
    ok "npm-Modus — Pulse nutzt DOMAIN/SSL_DIR aus .env (kein nginx)"
    return
  fi

  write_nginx_config "$dir" "$INSTALL_DOMAIN" "$SSL_ENABLED"

  if [ "$SSL_ENABLED" -eq 1 ]; then
    local cert_src="$dir/data/ssl/$INSTALL_DOMAIN"
    if [ -f "$cert_src/fullchain.pem" ] && [ -f "$cert_src/privkey.pem" ]; then
      cp "$cert_src/fullchain.pem" "$dir/deploy/certs/fullchain.pem"
      cp "$cert_src/privkey.pem" "$dir/deploy/certs/privkey.pem"
      chmod 600 "$dir/deploy/certs/privkey.pem"
      ok "TLS-Zertifikate für nginx bereitgestellt"
    else
      warn "SSL-Zertifikate fehlen in $cert_src — nginx HTTPS evtl. nicht erreichbar"
    fi
  fi
}

# Let's Encrypt per Certbot (standalone — Port 80 muss frei sein).
install_letsencrypt() {
  local domain="$1"
  local email="$2"
  local dir="$3"
  local ssl_root="$dir/data/ssl/$domain"

  step
  log "Certbot installieren und Zertifikat für $domain anfordern…"
  apt-get install -y certbot || die "Certbot-Installation fehlgeschlagen."

  if command -v ufw >/dev/null 2>&1; then
    ufw allow 80/tcp >/dev/null 2>&1 || true
  fi

  if certbot certonly --standalone -d "$domain" \
    --agree-tos \
    --non-interactive \
    --email "$email" \
    --keep-until-expiring; then
    mkdir -p "$ssl_root"
    cp "/etc/letsencrypt/live/$domain/privkey.pem" "$ssl_root/privkey.pem"
    cp "/etc/letsencrypt/live/$domain/fullchain.pem" "$ssl_root/fullchain.pem"
    cp "/etc/letsencrypt/live/$domain/cert.pem" "$ssl_root/cert.pem"
    cp "/etc/letsencrypt/live/$domain/chain.pem" "$ssl_root/chain.pem"
    chmod 600 "$ssl_root/privkey.pem"
    SSL_ENABLED=1
    SSL_CERT_PATH="$ssl_root/fullchain.pem"
    SSL_KEY_PATH="$ssl_root/privkey.pem"
    ok "SSL-Zertifikat installiert: $domain"
  else
    warn "SSL-Zertifikat konnte nicht ausgestellt werden — Installation ohne HTTPS fortgesetzt."
    SSL_ENABLED=0
  fi
}

# .env-Schlüssel sicher setzen (Sonderzeichen im Kennwort werden nicht von sed zerstört).
set_env_var() {
  local env_file="$1"
  local key="$2"
  local value="$3"
  local tmp
  tmp="$(mktemp)"
  grep -v "^${key}=" "$env_file" > "$tmp" 2>/dev/null || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$env_file"
}

# Optionale Benutzerverwaltung in .env eintragen — ohne SMTP (später in #/admin/email).
AUTH_CREDS_EXTRA=""
ADMIN_SECRET_VALUE=""
configure_user_auth() {
  local env_file="$1"
  printf 'USER_AUTH_ENABLED=1\n' >> "$env_file"
  printf 'AUTH_DEV_MAILBOX=0\n' >> "$env_file"
  printf 'BOOTSTRAP_ADMIN_NAME=%s\n' "$INSTALL_ADMIN_NAME" >> "$env_file"
  printf 'BOOTSTRAP_ADMIN_EMAIL=%s\n' "$INSTALL_ADMIN_EMAIL" >> "$env_file"
  printf 'BOOTSTRAP_ADMIN_PASSWORD=%s\n' "$INSTALL_ADMIN_PASSWORD" >> "$env_file"
  AUTH_CREDS_EXTRA="
Benutzerverwaltung: aktiv (USER_AUTH_ENABLED=1)
Bootstrap-Admin E-Mail: ${INSTALL_ADMIN_EMAIL}
Erstlogin: Kennwort (bei Installation festgelegt)
E-Mail-Versand: später unter #/admin/email konfigurieren
"
  ok "Admin-Konto in .env hinterlegt (kein SMTP bei Installation)"
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
  grep -q '^IP_BLOCK=' "$env_file" || printf 'IP_BLOCK=0\n' >> "$env_file"
  if grep -q '^IP_BLOCK=' "$env_file" 2>/dev/null; then
    sed -i 's/^IP_BLOCK=.*/IP_BLOCK=0/' "$env_file"
  fi

  if [ -n "$INSTALL_DOMAIN" ]; then
    if grep -q '^DOMAIN=' "$env_file" 2>/dev/null; then
      sed -i "s/^DOMAIN=.*/DOMAIN=${INSTALL_DOMAIN}/" "$env_file"
    else
      printf 'DOMAIN=%s\n' "$INSTALL_DOMAIN" >> "$env_file"
    fi
  fi

  if [ "$SSL_ENABLED" -eq 1 ] && [ -n "$INSTALL_DOMAIN" ]; then
    grep -q '^SSL_DIR=' "$env_file" || printf 'SSL_DIR=%s/data/ssl\n' "$dir" >> "$env_file"
    grep -q '^HTTPS_PORT=' "$env_file" || printf 'HTTPS_PORT=443\n' >> "$env_file"
    grep -q '^SSL_REDIRECT=' "$env_file" || printf 'SSL_REDIRECT=1\n' >> "$env_file"
  fi

  if ! grep -q '^USER_AUTH_ENABLED=' "$env_file" 2>/dev/null; then
    configure_user_auth "$env_file"
  elif [ -n "$INSTALL_ADMIN_EMAIL" ] && [ -n "$INSTALL_ADMIN_PASSWORD" ]; then
    grep -q '^AUTH_DEV_MAILBOX=' "$env_file" && sed -i 's/^AUTH_DEV_MAILBOX=.*/AUTH_DEV_MAILBOX=0/' "$env_file" || printf 'AUTH_DEV_MAILBOX=0\n' >> "$env_file"
    set_env_var "$env_file" "BOOTSTRAP_ADMIN_NAME" "$INSTALL_ADMIN_NAME"
    set_env_var "$env_file" "BOOTSTRAP_ADMIN_EMAIL" "$INSTALL_ADMIN_EMAIL"
    set_env_var "$env_file" "BOOTSTRAP_ADMIN_PASSWORD" "$INSTALL_ADMIN_PASSWORD"
    AUTH_CREDS_EXTRA="
Benutzerverwaltung: aktiv
Bootstrap-Admin E-Mail: ${INSTALL_ADMIN_EMAIL}
Erstlogin: Installations-Kennwort (siehe INSTALL-CREDENTIALS.txt bei Remote-Install)
E-Mail-Versand: #/admin/email
"
    ok "Bootstrap-Admin in .env aktualisiert"
  fi

  chmod 600 "$env_file"
  ok ".env geschützt (chmod 600)"

  CREDS_FILE="$dir/INSTALL-CREDENTIALS.txt"
  local admin_pw_line=""
  if [ -n "$INSTALL_ADMIN_PASSWORD" ]; then
    admin_pw_line="
Admin Erstlogin-Kennwort:
  ${INSTALL_ADMIN_PASSWORD}
"
  fi
  cat > "$CREDS_FILE" <<EOF
Pulse — Installationszugangsdaten ($(date -u +%Y-%m-%dT%H:%M:%SZ))
Speichern Sie diese Datei sicher und löschen Sie diese nach dem Notieren.

ADMIN_SECRET (API / Instanz-Admin):
  ${admin_secret}

Grafana (http://<server>:3001, User admin):
  ${grafana_pw}
${admin_pw_line}${AUTH_CREDS_EXTRA}
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
  log "UFW: SSH, HTTP, HTTPS…"
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  if [ "$USE_NPM" -eq 1 ]; then
    ufw allow 3000/tcp
    log "npm-Modus: Port 3000 geöffnet"
  else
    log "Docker/nginx-Modus: Pulse nur intern — kein öffentlicher Port 3000"
  fi
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
  npm install || die "npm install fehlgeschlagen."
  log "Tailwind CSS v4 kompilieren…"
  npm run css:build || die "css:build fehlgeschlagen."
  npm prune --omit=dev || die "npm prune fehlgeschlagen."
  chmod +x scripts/seed-data.sh 2>/dev/null || true
  ./scripts/seed-data.sh "$dir/data"
  ok "npm-Abhängigkeiten installiert — Start: cd $dir && npm start"
}

print_summary() {
  local dir="$1"
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$ip" ] || ip="<server-ip>"

  local host_label="$INSTALL_DOMAIN"
  local scheme="http"
  local port_suffix=""
  if [ "$SSL_ENABLED" -eq 1 ]; then
    scheme="https"
  fi

  local start_hint
  if [ "$USE_NPM" -eq 1 ]; then
    start_hint="cd ${dir} && npm start   # Port 3000"
  else
    start_hint="cd ${dir} && docker compose up -d"
  fi

  cat <<EOF

╔══════════════════════════════════════════════════════════════╗
║  Pulse VPS-Installation abgeschlossen (v${PULSE_INSTALLER_VER})          ║
╚══════════════════════════════════════════════════════════════╝

  Domain:             ${INSTALL_DOMAIN}
  SSL:                $([ "$SSL_ENABLED" -eq 1 ] && echo "aktiv (Let's Encrypt)" || echo "nein")
  Pulse:              ${scheme}://${host_label}${port_suffix}/
  Administration:     ${scheme}://${host_label}${port_suffix}/#/admin
  Erstlogin:          ${scheme}://${host_label}${port_suffix}/#/admin/login
  E-Mail konfig.:     ${scheme}://${host_label}${port_suffix}/#/admin/email
  Health (intern):    http://${ip}:3000/api/health

  Admin E-Mail:       ${INSTALL_ADMIN_EMAIL:-—}
  Erstlogin:          Kennwort (bei Installation festgelegt — nicht per E-Mail)

  ADMIN_SECRET (Notfall / API):
  ${ADMIN_SECRET_VALUE}

  Geheimnisse:        ${dir}/INSTALL-CREDENTIALS.txt  (chmod 600)
  Daten (Backup):     ${dir}/data/
  Umgebung:           ${dir}/.env  (chmod 600)

  Start / Neustart:
    ${start_hint}

  Nächste Schritte:
    1. Anwendung starten (falls noch nicht läuft)
    2. Erstlogin mit E-Mail + Installations-Kennwort — optional Backup unter #/admin/onboarding einspielen
    3. PIN-Versand läuft standardmäßig per Sendmail (Postfix); SMTP optional unter #/admin/email
    4. Vollständige Backups und gruppenweise Wiederherstellung unter #/admin/backups

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
  local scheme="http"
  [ "$SSL_ENABLED" -eq 1 ] && scheme="https"
  cat <<EOF
{"ok":true,"mode":"${mode}","domain":"${INSTALL_DOMAIN}","installDir":"${dir}","url":"${scheme}://${INSTALL_DOMAIN}/","adminUrl":"${scheme}://${INSTALL_DOMAIN}/#/admin","credentialsFile":"${dir}/INSTALL-CREDENTIALS.txt","remote":${IS_REMOTE}}
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
  ok "Pulse VPS-Installer v${PULSE_INSTALLER_VER}"
  log "Pulse VPS-Installer — Zielverzeichnis: $dir"

  configure_interactive

  system_update
  if [ "$USE_NPM" -eq 1 ]; then
    install_git
    prepare_project "$dir"
    ensure_data_dir "$dir"
    if [ "$INSTALL_SSL" -eq 1 ] && [ -n "$INSTALL_DOMAIN" ]; then
      install_letsencrypt "$INSTALL_DOMAIN" "$INSTALL_ADMIN_EMAIL" "$dir"
    fi
    write_env_file "$dir"
    configure_server_domain "$dir"
    configure_firewall
    install_sendmail
    start_npm_stack "$dir"
    configure_pulse_sendmail "$dir"
  else
    install_docker
    prepare_project "$dir"
    ensure_data_dir "$dir"
    if [ "$INSTALL_SSL" -eq 1 ] && [ -n "$INSTALL_DOMAIN" ]; then
      install_letsencrypt "$INSTALL_DOMAIN" "$INSTALL_ADMIN_EMAIL" "$dir"
    fi
    write_env_file "$dir"
    configure_server_domain "$dir"
    configure_firewall
    start_docker_stack "$dir"
  fi

  print_summary "$dir"
}

main "$@"
