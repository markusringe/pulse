#!/usr/bin/env bash
# =============================================================================
# Pulse — VPS von Cluster (2× pulse + Redis) auf Einzelinstanz umstellen
# =============================================================================
#
# Empfohlen bei SQLite ohne PostgreSQL (Audit v1.5.5). Behebt degraded-Ready.
#
# Ausführung auf dem Server:
#   cd /opt/pulse && sudo ./scripts/migrate-vps-single.sh --yes
#
# Optionen:
#   --dir PATH    Installationsverzeichnis (Default: /opt/pulse)
#   --yes, -y     Ohne Rückfrage
#   --skip-backup Kein Backup vor Migration
#   -h, --help    Hilfe
# =============================================================================

set -eo pipefail

readonly DEFAULT_DIR="/opt/pulse"
INSTALL_DIR=""
ASSUME_YES=0
SKIP_BACKUP=0

log() { printf '\033[1;33m→\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32m✔\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✖\033[0m %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    --skip-backup) SKIP_BACKUP=1; shift ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *) die "Unbekannte Option: $1" ;;
  esac
done

[ -n "$INSTALL_DIR" ] || INSTALL_DIR="$DEFAULT_DIR"
[ -d "$INSTALL_DIR" ] || die "Verzeichnis fehlt: $INSTALL_DIR"
[ -f "$INSTALL_DIR/docker-compose.yml" ] || die "Kein docker-compose.yml in $INSTALL_DIR"

if [ "$ASSUME_YES" -ne 1 ]; then
  printf 'Einzelinstanz-Migration in %s — pulse-b stoppen, nginx auf eine Instanz.\n' "$INSTALL_DIR"
  read -r -p "Fortfahren? [j/N] " ans
  case "$ans" in j|J|y|Y|ja|Ja) ;; *) die "Abgebrochen." ;; esac
fi

cd "$INSTALL_DIR"

if [ "$SKIP_BACKUP" -eq 0 ]; then
  log "Backup erstellen…"
  ts="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
  backup_dir="$INSTALL_DIR/backups/single-migrate-${ts}"
  mkdir -p "$backup_dir"
  [ -d data ] && cp -a data "$backup_dir/"
  [ -f .env ] && cp -a .env "$backup_dir/"
  [ -f deploy/nginx.conf ] && cp -a deploy/nginx.conf "$backup_dir/"
  ok "Backup: $backup_dir"
fi

log ".env: Einzelinstanz-Variablen setzen…"
touch .env
grep -q '^PULSE_OPERATION_MODE=' .env && sed -i 's/^PULSE_OPERATION_MODE=.*/PULSE_OPERATION_MODE=single/' .env || echo 'PULSE_OPERATION_MODE=single' >> .env
grep -q '^PULSE_EXPECT_INSTANCES=' .env && sed -i 's/^PULSE_EXPECT_INSTANCES=.*/PULSE_EXPECT_INSTANCES=1/' .env || echo 'PULSE_EXPECT_INSTANCES=1' >> .env

log "nginx: Upstream auf eine Instanz (pulse)…"
NGINX_CONF="$INSTALL_DIR/deploy/nginx.conf"
if [ -f "$NGINX_CONF" ]; then
  cp -a "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%s)"
  # pulse-b aus upstream entfernen — nur pulse:3000
  sed -i '/server pulse-b:3000/d' "$NGINX_CONF"
  ok "nginx.conf angepasst (Backup: ${NGINX_CONF}.bak.*)"
fi

log "Docker: pulse-b stoppen, Stack neu starten…"
need_cmd() { command -v "$1" >/dev/null 2>&1 || die "$1 fehlt."; }
need_cmd docker
docker compose version >/dev/null 2>&1 || die "docker compose fehlt."

docker compose stop pulse-b 2>/dev/null || true
docker compose rm -f pulse-b 2>/dev/null || true
docker compose up -d --build pulse nginx redis
docker compose ps

log "Readiness prüfen…"
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1/api/health/ready" >/dev/null 2>&1; then
    ok "Ready: $(curl -sS http://127.0.0.1/api/health/ready | head -c 200)"
    exit 0
  fi
  sleep 2
done

die "Readiness-Timeout — Logs: docker compose logs pulse nginx"
