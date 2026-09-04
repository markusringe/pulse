#!/usr/bin/env bash
# =============================================================================
# Pulse — VPS-Update unter Ubuntu (20.04 / 22.04 / 24.04)
# =============================================================================
#
# Aktualisiert eine bestehende Pulse-Installation per Git (Branch oder Tag),
# legt optional ein Backup an und startet den Stack neu (Docker oder npm).
#
# Ausführung:
#
#   A) Lokal im Installationsverzeichnis:
#      cd /opt/pulse && sudo ./scripts/update-vps-ubuntu.sh
#
#   B) Remote One-Liner:
#      curl -fsSL https://raw.githubusercontent.com/markusringe/pulse/main/scripts/update-vps-ubuntu.sh | sudo bash
#
#   C) Mit Optionen:
#      sudo ./scripts/update-vps-ubuntu.sh --dir /opt/pulse --yes
#
# Optionen:
#   --dir PATH         Installationsverzeichnis (Default: /opt/pulse oder Repo)
#   --branch NAME      Git-Branch (Default: main)
#   --tag TAG          Statt Branch: festen Tag auschecken (z. B. v1.3.0)
#   --npm              npm-Modus erzwingen (Node direkt)
#   --docker           Docker-Modus erzwingen
#   --skip-backup      Kein Backup vor dem Update
#   --skip-health      Kein Warten auf /api/health
#   --yes, -y          Ohne Rückfrage
#   --json             Zusammenfassung als JSON
#   -h, --help         Diese Hilfe
#
# Dokumentation: docs/installation.md
# =============================================================================

set -eo pipefail

readonly DEFAULT_INSTALL_DIR="/opt/pulse"
readonly DEFAULT_BRANCH="main"
readonly PULSE_UPDATER_VER="1.0"
readonly PROGRESS_BAR_WIDTH=28
readonly HEALTH_TIMEOUT_SEC=90

INSTALL_DIR=""
GIT_BRANCH="$DEFAULT_BRANCH"
GIT_TAG=""
USE_NPM=-1
SKIP_BACKUP=0
SKIP_HEALTH=0
ASSUME_YES=0
OUTPUT_JSON=0
IS_REMOTE=0

STEP=0
PROGRESS_TOTAL=7

# Ergebnis für JSON-Ausgabe
RESULT_DIR=""
RESULT_MODE=""
RESULT_FROM_VER=""
RESULT_TO_VER=""
RESULT_BACKUP=""
RESULT_HEALTH="unknown"
RESULT_ELAPSED_MS=0

START_TS=0

# =============================================================================
# Pfadermittlung — lokal, curl|bash, nach Download
# =============================================================================
resolve_script_dir() {
  local src="${BASH_SOURCE[0]:-}"
  if [[ -n "$src" && "$src" != "bash" && -f "$src" ]]; then
    cd "$(dirname "$src")" && pwd
    return 0
  fi
  if [[ -d "${DEFAULT_INSTALL_DIR}/scripts" && -f "${DEFAULT_INSTALL_DIR}/scripts/update-vps-ubuntu.sh" ]]; then
    echo "${DEFAULT_INSTALL_DIR}/scripts"
    return 0
  fi
  if [[ -d "./scripts" && -f "./scripts/update-vps-ubuntu.sh" ]]; then
    cd "./scripts" && pwd
    return 0
  fi
  pwd
}

detect_remote_invocation() {
  if [[ -n "${PULSE_REMOTE_UPDATE:-}" && "${PULSE_REMOTE_UPDATE}" == "1" ]]; then
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

set -u

# --- Terminal-Helfer ---
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

use_progress_bar() {
  [ "$OUTPUT_JSON" -eq 1 ] && return 1
  has_tty || return 1
  return 0
}

# --- Fortschrittsbalken [████████░░░░] 57% (4/7) ---
render_progress_bar() {
  local current="$1"
  local total="$2"
  local label="${3:-}"

  if ! use_progress_bar; then
    return 0
  fi

  local width="$PROGRESS_BAR_WIDTH"
  local filled=0
  local empty="$width"
  local pct=0

  if [ "$total" -gt 0 ]; then
    filled=$((current * width / total))
    empty=$((width - filled))
    pct=$((current * 100 / total))
  fi

  local bar=""
  local i
  for ((i = 0; i < filled; i++)); do bar+="█"; done
  for ((i = 0; i < empty; i++)); do bar+="░"; done

  printf '\033[1;36mFortschritt\033[0m [\033[1;32m%s\033[0m] \033[1m%3d%%\033[0m (\033[1m%d/%d\033[0m)\n' \
    "$bar" "$pct" "$current" "$total"
  if [ -n "$label" ]; then
    printf '  \033[1;33m→\033[0m %s\n' "$label"
  fi
}

progress_step() {
  STEP=$((STEP + 1))
  render_progress_bar "$STEP" "$PROGRESS_TOTAL" "$1"
  if ! use_progress_bar; then
    printf '\033[1;33m==> [%s/%s]\033[0m %s\n' "$STEP" "$PROGRESS_TOTAL" "$1"
  fi
}

progress_complete() {
  if use_progress_bar; then
    render_progress_bar "$PROGRESS_TOTAL" "$PROGRESS_TOTAL" "Abgeschlossen"
    printf '\n'
  fi
}

log()  { progress_step "$*"; }
ok()   { printf '\033[1;32m✔\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mFehler:\033[0m %s\n' "$*" >&2; exit 1; }
need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Befehl '$1' fehlt."
}

# --- Banner (nur interaktiv) ---
print_banner() {
  if [ "$OUTPUT_JSON" -eq 1 ]; then
    return 0
  fi
  printf '\n'
  printf '\033[1;36m╔══════════════════════════════════════════════════════════╗\033[0m\n'
  printf '\033[1;36m║\033[0m  \033[1mPulse — VPS-Update\033[0m  (Updater v%s)                    \033[1;36m║\033[0m\n' "$PULSE_UPDATER_VER"
  printf '\033[1;36m╚══════════════════════════════════════════════════════════╝\033[0m\n'
  printf '\n'
}

# Versionsstring aus package.json (ohne Node).
read_package_version() {
  local pkg="$1/package.json"
  [ -f "$pkg" ] || die "package.json fehlt in $1"
  grep -m1 '"version"' "$pkg" | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/'
}

# Laufenden Modus erkennen: Docker-Stack vs. npm.
detect_run_mode() {
  local dir="$1"
  if [ "$USE_NPM" -eq 1 ]; then
    echo "npm"
    return 0
  fi
  if [ "$USE_NPM" -eq 0 ]; then
    echo "docker"
    return 0
  fi
  if [ -f "$dir/docker-compose.yml" ] && command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    if docker compose -f "$dir/docker-compose.yml" ps --status running 2>/dev/null | grep -q pulse; then
      echo "docker"
      return 0
    fi
    if [ -f "$dir/docker-compose.yml" ]; then
      echo "docker"
      return 0
    fi
  fi
  if command -v node >/dev/null 2>&1 && [ -f "$dir/server.js" ]; then
    echo "npm"
    return 0
  fi
  echo "docker"
}

# Spinner für lange Befehle (docker build, npm install).
run_with_spinner() {
  local msg="$1"
  shift

  if ! use_progress_bar; then
    printf '    %s…\n' "$msg"
    "$@"
    return $?
  fi

  "$@" &
  local pid=$!
  local spin='|/-\'
  local i=0
  while kill -0 "$pid" 2>/dev/null; do
    i=$(( (i + 1) % 4 ))
    printf '\r  \033[1;36m%s\033[0m %s ' "$msg" "${spin:$i:1}"
    sleep 0.12
  done
  wait "$pid"
  local rc=$?
  printf '\r\033[K'
  if [ "$rc" -eq 0 ]; then
    ok "$msg — fertig"
  else
    die "$msg fehlgeschlagen (Exit $rc)"
  fi
  return 0
}

usage() {
  cat <<'EOF'
Pulse — VPS-Update

  Lokal:   cd /opt/pulse && sudo ./scripts/update-vps-ubuntu.sh
  Remote:  curl -fsSL …/update-vps-ubuntu.sh | sudo bash
  Tag:     sudo ./scripts/update-vps-ubuntu.sh --tag v1.3.0 --yes

Optionen:
  --dir PATH         Installationsverzeichnis
  --branch NAME      Git-Branch (Default: main)
  --tag TAG          Festen Release-Tag auschecken
  --npm              npm-Modus erzwingen
  --docker           Docker-Modus erzwingen
  --skip-backup      Kein Backup
  --skip-health      Healthcheck überspringen
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
      --branch)
        GIT_BRANCH="${2:-main}"
        shift 2
        ;;
      --tag)
        GIT_TAG="${2:-}"
        shift 2
        ;;
      --npm)
        USE_NPM=1
        shift
        ;;
      --docker)
        USE_NPM=0
        shift
        ;;
      --skip-backup)
        SKIP_BACKUP=1
        shift
        ;;
      --skip-health)
        SKIP_HEALTH=1
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
        die "Unbekannte Option: $1 ( --help )"
        ;;
    esac
  done
}

resolve_install_dir() {
  if [ -n "$INSTALL_DIR" ]; then
    echo "$INSTALL_DIR"
    return 0
  fi
  if [ -d "$DEFAULT_ROOT" ] && [ -f "$DEFAULT_ROOT/package.json" ]; then
    echo "$DEFAULT_ROOT"
    return 0
  fi
  echo "$DEFAULT_INSTALL_DIR"
}

confirm_update() {
  local dir="$1"
  local from_ver="$2"
  local mode="$3"

  if [ "$ASSUME_YES" -eq 1 ] || is_fully_noninteractive; then
    return 0
  fi

  echo ""
  printf '\033[1mUpdate-Zusammenfassung\033[0m\n'
  printf '  Verzeichnis:  %s\n' "$dir"
  printf '  Modus:        %s\n' "$mode"
  printf '  Version:      v%s → (nach git pull)\n' "$from_ver"
  if [ -n "$GIT_TAG" ]; then
    printf '  Git-Tag:      %s\n' "$GIT_TAG"
  else
    printf '  Git-Branch:   %s\n' "$GIT_BRANCH"
  fi
  printf '  Backup:       %s\n' "$([ "$SKIP_BACKUP" -eq 1 ] && echo nein || echo ja)"
  echo ""
  prompt_tty "Fortfahren? [j/N] "
  local ans
  read_tty ans
  case "$ans" in
    j|J|y|Y|ja|Ja|yes|Yes) ;;
    *) die "Abgebrochen." ;;
  esac
}

# Backup: data/ und .env (analog updateService).
create_backup() {
  local dir="$1"
  local ts backup_root backup_dir

  ts="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
  backup_root="$dir/backups"
  backup_dir="$backup_root/vps-update-${ts}"
  mkdir -p "$backup_dir"

  if [ -d "$dir/data" ]; then
    cp -a "$dir/data" "$backup_dir/data"
  fi
  if [ -f "$dir/.env" ]; then
    cp -a "$dir/.env" "$backup_dir/.env"
  fi
  if [ -f "$dir/package.json" ]; then
    cp -a "$dir/package.json" "$backup_dir/package.json"
  fi

  echo "$backup_dir"
}

git_update() {
  local dir="$1"
  need_cmd git
  [ -d "$dir/.git" ] || die "Kein Git-Repository in $dir — Installation per install-vps-ubuntu.sh --git …"

  if [ -n "$GIT_TAG" ]; then
    log "Git: Tags holen und $GIT_TAG auschecken…"
    git -C "$dir" fetch --tags origin
    git -C "$dir" checkout "$GIT_TAG" || die "Tag $GIT_TAG nicht gefunden."
    ok "Ausgecheckt: $GIT_TAG"
    return 0
  fi

  log "Git: Branch $GIT_BRANCH aktualisieren…"
  git -C "$dir" fetch origin "$GIT_BRANCH"
  git -C "$dir" checkout "$GIT_BRANCH" 2>/dev/null || true
  git -C "$dir" pull --ff-only origin "$GIT_BRANCH" || die "git pull fehlgeschlagen — Konflikte manuell lösen."
  ok "Git auf dem neuesten Stand ($GIT_BRANCH)"
}

update_docker() {
  local dir="$1"
  cd "$dir"
  need_cmd docker
  docker compose version >/dev/null 2>&1 || die "docker compose fehlt."

  log "Docker: Images neu bauen…"
  run_with_spinner "docker compose build" docker compose build

  log "Docker: Stack neu starten…"
  docker compose up -d || die "docker compose up fehlgeschlagen."
  ok "Docker-Stack gestartet"
}

update_npm() {
  local dir="$1"
  cd "$dir"
  need_cmd node
  need_cmd npm

  local major
  major="$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")"
  [ "${major:-0}" -ge 22 ] || die "Node.js ≥ 22 erforderlich (aktuell: $(node -v))."

  log "npm: Abhängigkeiten installieren…"
  run_with_spinner "npm install" npm install

  log "npm: Frontend-Build (CSS + Asset-Manifest)…"
  if npm run build; then
    ok "build erfolgreich (css + asset-manifest)"
  else
    warn "build fehlgeschlagen — Fallback pulse.css / Laufzeit-Manifest bleibt aktiv."
  fi

  log "npm: Dev-Abhängigkeiten entfernen…"
  npm prune --omit=dev || die "npm prune fehlgeschlagen."

  log "npm: Daten-Migrationen…"
  if node -e "require('./lib/dataMigration').runDataMigrations({ label: 'vps-update' }).then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})"; then
    ok "Migrationen abgeschlossen"
  else
    warn "Migrationen mit Warnung — Logs prüfen."
  fi

  log "npm: Dienst neu starten…"
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files pulse.service 2>/dev/null | grep -q pulse.service; then
    systemctl restart pulse.service || die "systemctl restart pulse.service fehlgeschlagen."
    ok "pulse.service neu gestartet"
  else
    warn "Kein pulse.service — bitte manuell neu starten: cd $dir && npm start"
  fi
}

wait_for_health() {
  local dir="$1"
  local mode="$2"
  local url="http://127.0.0.1/api/health/ready"
  local fallback="http://127.0.0.1/api/health"
  local i=0
  local max=$((HEALTH_TIMEOUT_SEC / 2))

  if [ "$SKIP_HEALTH" -eq 1 ]; then
    RESULT_HEALTH="skipped"
    return 0
  fi

  need_cmd curl
  log "Readiness: $url …"

  while [ "$i" -lt "$max" ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      ok "Pulse bereit (/api/health/ready → 200)"
      RESULT_HEALTH="ready"
      return 0
    fi
    if curl -fsS "$fallback" >/dev/null 2>&1; then
      ok "Pulse antwortet (/api/health — Ready noch 503 oder Legacy)"
      RESULT_HEALTH="health_only"
      return 0
    fi
    if [ "$mode" = "npm" ] && curl -fsS "http://127.0.0.1:3000/api/health/ready" >/dev/null 2>&1; then
      ok "Pulse bereit auf Port 3000"
      RESULT_HEALTH="ready"
      return 0
    fi
    if [ "$mode" = "npm" ] && curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
      ok "Pulse antwortet auf Port 3000 (/api/health)"
      RESULT_HEALTH="health_only"
      return 0
    fi
    sleep 2
    i=$((i + 1))
    if use_progress_bar; then
      printf '\r  \033[1;36mWarte auf Healthcheck\033[0m … %ds / %ds' "$((i * 2))" "$HEALTH_TIMEOUT_SEC"
    fi
  done

  printf '\n' 2>/dev/null || true
  warn "Healthcheck-Timeout — Logs prüfen."
  if [ "$mode" = "docker" ]; then
    warn "  docker compose -f $dir/docker-compose.yml logs pulse"
  else
    warn "  journalctl -u pulse.service -n 50"
  fi
  RESULT_HEALTH="timeout"
}

print_summary() {
  local dir="$1"
  local ip host

  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$ip" ] || ip="<server-ip>"
  host="$ip"
  if [ -f "$dir/.env" ] && grep -q '^DOMAIN=' "$dir/.env" 2>/dev/null; then
    host="$(grep '^DOMAIN=' "$dir/.env" | cut -d= -f2- | tr -d '"')"
  fi

  progress_complete

  if [ "$OUTPUT_JSON" -eq 1 ]; then
    printf '{"ok":true,"dir":"%s","mode":"%s","fromVersion":"%s","toVersion":"%s","backup":"%s","health":"%s","elapsedMs":%s,"host":"%s"}\n' \
      "$dir" "$RESULT_MODE" "$RESULT_FROM_VER" "$RESULT_TO_VER" "$RESULT_BACKUP" "$RESULT_HEALTH" "$RESULT_ELAPSED_MS" "$host"
    return 0
  fi

  printf '\n'
  printf '\033[1;32m╔══════════════════════════════════════════════════════════╗\033[0m\n'
  printf '\033[1;32m║\033[0m  \033[1mUpdate abgeschlossen\033[0m                                      \033[1;32m║\033[0m\n'
  printf '\033[1;32m╚══════════════════════════════════════════════════════════╝\033[0m\n'
  printf '\n'
  printf '  \033[1mVersion:\033[0m     v%s → \033[1;32mv%s\033[0m\n' "$RESULT_FROM_VER" "$RESULT_TO_VER"
  printf '  \033[1mModus:\033[0m       %s\n' "$RESULT_MODE"
  printf '  \033[1mHealth:\033[0m      %s\n' "$RESULT_HEALTH"
  if [ -n "$RESULT_BACKUP" ]; then
    printf '  \033[1mBackup:\033[0m      %s\n' "$RESULT_BACKUP"
  fi
  printf '  \033[1mURL:\033[0m         http://%s/\n' "$host"
  printf '  \033[1mAdmin:\033[0m       http://%s/#/admin/updates\n' "$host"
  printf '\n'
}

main() {
  parse_args "$@"
  START_TS=$(date +%s%3N 2>/dev/null || echo $(($(date +%s) * 1000)))

  print_banner

  RESULT_DIR="$(resolve_install_dir)"
  [ -d "$RESULT_DIR" ] || die "Verzeichnis nicht gefunden: $RESULT_DIR"
  [ -f "$RESULT_DIR/package.json" ] || die "Kein Pulse-Projekt in $RESULT_DIR"

  RESULT_MODE="$(detect_run_mode "$RESULT_DIR")"
  RESULT_FROM_VER="$(read_package_version "$RESULT_DIR")"

  log "Installation prüfen ($RESULT_DIR, Modus: $RESULT_MODE)…"
  ok "Pulse v$RESULT_FROM_VER erkannt"

  confirm_update "$RESULT_DIR" "$RESULT_FROM_VER" "$RESULT_MODE"

  if [ "$SKIP_BACKUP" -eq 0 ]; then
    log "Backup erstellen (data/, .env)…"
    RESULT_BACKUP="$(create_backup "$RESULT_DIR")"
    ok "Backup: $RESULT_BACKUP"
  else
    warn "Backup übersprungen (--skip-backup)"
  fi

  git_update "$RESULT_DIR"
  RESULT_TO_VER="$(read_package_version "$RESULT_DIR")"

  if [ "$RESULT_FROM_VER" = "$RESULT_TO_VER" ] && [ -z "$GIT_TAG" ]; then
    warn "Version unverändert (v$RESULT_TO_VER) — Code wurde trotzdem aktualisiert, falls Commits ohne Versionsbump."
  else
    ok "Neue Zielversion: v$RESULT_TO_VER"
  fi

  if [ "$RESULT_MODE" = "docker" ]; then
    update_docker "$RESULT_DIR"
  else
    update_npm "$RESULT_DIR"
  fi

  wait_for_health "$RESULT_DIR" "$RESULT_MODE"

  local end_ts elapsed
  end_ts=$(date +%s%3N 2>/dev/null || echo $(($(date +%s) * 1000)))
  if [[ "$START_TS" =~ ^[0-9]+$ ]] && [[ "$end_ts" =~ ^[0-9]+$ ]]; then
    RESULT_ELAPSED_MS=$((end_ts - START_TS))
  fi

  print_summary "$RESULT_DIR"
}

main "$@"
