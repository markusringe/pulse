#!/usr/bin/env bash
# Pulse — vereinfachte Installation (lokal oder Docker Compose).
# Nutzung: ./scripts/install.sh [--docker] [--test] [--help]

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

USE_DOCKER=0
RUN_TESTS=0

usage() {
  cat <<'EOF'
Pulse — Installation

  ./scripts/install.sh              Lokal: npm install, .env anlegen
  ./scripts/install.sh --test       Zusätzlich npm test
  ./scripts/install.sh --docker     Docker Compose bauen und starten
  ./scripts/install.sh --docker --test

Nach lokaler Installation:  npm start  →  http://localhost:3000
EOF
}

for arg in "$@"; do
  case "$arg" in
    --docker) USE_DOCKER=1 ;;
    --test) RUN_TESTS=1 ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unbekannte Option: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

log() { printf '==> %s\n' "$*"; }
die() { printf 'Fehler: %s\n' "$*" >&2; exit 1; }

# Node ≥ 22 (package.json engines)
if ! command -v node >/dev/null 2>&1; then
  die "Node.js nicht gefunden. Bitte Node ≥ 22 installieren (https://nodejs.org/)."
fi

NODE_MAJOR="$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")"
if [ "${NODE_MAJOR:-0}" -lt 22 ]; then
  die "Node.js $(node -v) ist zu alt. Pulse benötigt Node ≥ 22."
fi

if ! command -v npm >/dev/null 2>&1; then
  die "npm nicht gefunden (sollte mit Node mitgeliefert sein)."
fi

log "Projektverzeichnis: $ROOT"
log "Node $(node -v), npm $(npm -v)"

log "Abhängigkeiten installieren (npm install)…"
npm install

log "Tailwind CSS v4 kompilieren (pulse.css)…"
npm run css:build

# .env aus Vorlage, ADMIN_SECRET nur setzen wenn noch Platzhalter
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    log ".env aus .env.example erstellt"
  else
    die ".env.example fehlt — Installation unvollständig."
  fi
else
  log ".env existiert bereits — wird nicht überschrieben"
fi

if [ -f .env ]; then
  SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  if grep -q 'ADMIN_SECRET=bitte-langen-zufallswert-setzen' .env 2>/dev/null; then
    if sed --version >/dev/null 2>&1; then
      sed -i "s/^ADMIN_SECRET=.*/ADMIN_SECRET=${SECRET}/" .env
    else
      sed -i '' "s/^ADMIN_SECRET=.*/ADMIN_SECRET=${SECRET}/" .env
    fi
    log "ADMIN_SECRET in .env gesetzt (zufällig generiert)"
  fi
  # Lokaler Default ohne Redis — ein Prozess reicht für Entwicklung
  if grep -q '^REDIS_URL=redis://redis:6379' .env 2>/dev/null && [ "$USE_DOCKER" -eq 0 ]; then
    if sed --version >/dev/null 2>&1; then
      sed -i 's/^REDIS_URL=redis:\/\/redis:6379/# REDIS_URL=redis:\/\/redis:6379  # nur mit Docker Compose/' .env
    else
      sed -i '' 's/^REDIS_URL=redis:\/\/redis:6379/# REDIS_URL=redis:\/\/redis:6379  # nur mit Docker Compose/' .env
    fi
    log "REDIS_URL für lokalen Einzelprozess auskommentiert"
  fi
fi

# Optionale interaktive Einrichtung der Benutzerverwaltung (nur bei frischer .env oder fehlenden Werten)
if [ -f .env ] && [ -t 0 ]; then
  if ! grep -q '^USER_AUTH_ENABLED=' .env 2>/dev/null; then
    printf 'Benutzerverwaltung mit E-Mail-PIN aktivieren? [J/n]: '
    read -r auth_answer
    if [ -z "$auth_answer" ] || echo "$auth_answer" | grep -qi '^j'; then
      printf 'USER_AUTH_ENABLED=1\nAUTH_DEV_MAILBOX=1\n' >> .env
      log "USER_AUTH_ENABLED=1 und AUTH_DEV_MAILBOX=1 in .env ergänzt"
      printf 'Bootstrap-Admin anlegen? Name [admin]: '
      read -r admin_name
      admin_name="${admin_name:-admin}"
      printf 'Bootstrap-Admin E-Mail [admin@localhost]: '
      read -r admin_email
      admin_email="${admin_email:-admin@localhost}"
      printf 'Initiales Admin-Kennwort (mind. 8 Zeichen, Eingabe verborgen): '
      read -r -s admin_pw
      echo ""
      if [ "${#admin_pw}" -lt 8 ]; then
        admin_pw="${admin_pw:-admin}"
      fi
      cat >> .env <<EOF
BOOTSTRAP_ADMIN_NAME=${admin_name}
BOOTSTRAP_ADMIN_EMAIL=${admin_email}
BOOTSTRAP_ADMIN_PASSWORD=${admin_pw}
EOF
      log "Bootstrap-Admin in .env hinterlegt (Erstlogin per Kennwort unter #/admin/login)"
    fi
  fi
fi

mkdir -p data

chmod +x scripts/seed-data.sh 2>/dev/null || true
./scripts/seed-data.sh "$ROOT/data"

if [ "$USE_DOCKER" -eq 1 ]; then
  if ! command -v docker >/dev/null 2>&1; then
    die "Docker nicht gefunden. Für --docker Docker installieren oder lokal ohne Flag starten."
  fi
  COMPOSE="docker compose"
  if ! docker compose version >/dev/null 2>&1; then
    if command -v docker-compose >/dev/null 2>&1; then
      COMPOSE="docker-compose"
    else
      die "docker compose / docker-compose nicht verfügbar."
    fi
  fi
  if [ -f .env ] && ! grep -q '^GRAFANA_PASSWORD=' .env 2>/dev/null; then
    GRAFANA_PW="$(node -e "console.log(require('crypto').randomBytes(12).toString('hex'))")"
    printf '\nGRAFANA_PASSWORD=%s\n' "$GRAFANA_PW" >> .env
    log "GRAFANA_PASSWORD in .env ergänzt"
  fi
  log "Docker-Images bauen…"
  $COMPOSE build
  log "Stack starten ($COMPOSE up -d)…"
  $COMPOSE up -d
  log "Docker-Stack läuft. Pulse: http://localhost/  Grafana: http://localhost:3001"
else
  log "Lokale Installation abgeschlossen."
  echo ""
  echo "  Starten:"
  echo "    export \$(grep -v '^#' .env | xargs) && npm start"
  echo "  oder:"
  echo "    npm start   # mit Default-Pepper, nur für kurze Tests ohne .env-Export"
  echo ""
  echo "  Browser: http://localhost:3000"
  echo "  Health:    http://localhost:3000/api/health"
fi

if [ "$RUN_TESTS" -eq 1 ]; then
  log "Tests ausführen (npm test)…"
  npm test
fi

log "Fertig. Ausführliche Anleitung: docs/installation.md"
