#!/usr/bin/env bash
# Gemeinsame Helfer für update-vps-ubuntu.sh — Rollback, Image-Tags, Readiness.
# Wird von scripts/update-vps-ubuntu.sh und test-update-rollback-path.sh genutzt.

# Versionsstring normalisieren: v1.5.10 → 1.5.10 (Docker-Image-Tag).
normalize_version_tag() {
  local ver="${1:-}"
  ver="${ver#v}"
  printf '%s' "$ver"
}

# Pfad zur Deploy-Statusdatei (letzter bekannter guter Stand).
deploy_state_file() {
  local dir="$1"
  printf '%s/backups/.pulse-deploy-state.json' "$dir"
}

# Deploy-Status vor Git-Update sichern (Git-Ref + Version für Rollback).
save_deploy_state() {
  local dir="$1"
  local version="$2"
  local git_ref="$3"
  local state_file
  state_file="$(deploy_state_file "$dir")"
  mkdir -p "$(dirname "$state_file")"
  local norm tag
  norm="$(normalize_version_tag "$version")"
  tag="pulse-app:${norm}"
  cat > "$state_file" <<EOF
{
  "version": "${version}",
  "imageTag": "${tag}",
  "gitRef": "${git_ref}",
  "savedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
}

# Laufendes Release-Image vor Build taggen — Basis für Docker-Rollback ohne Rebuild.
tag_running_release_image() {
  local dir="$1"
  local version="$2"
  local norm target img_id cid

  need_cmd docker
  norm="$(normalize_version_tag "$version")"
  target="pulse-app:${norm}"
  cd "$dir"

  if docker image inspect "$target" >/dev/null 2>&1; then
    ok "Rollback-Image bereits vorhanden: $target"
    return 0
  fi

  cid="$(docker compose ps -q pulse 2>/dev/null | head -1 || true)"
  if [ -n "$cid" ]; then
    img_id="$(docker inspect --format='{{.Image}}' "$cid")"
    if docker tag "$img_id" "$target" 2>/dev/null; then
      ok "Rollback-Image aus laufendem Container: $target"
      return 0
    fi
  fi

  if docker image inspect pulse-app:latest >/dev/null 2>&1; then
    docker tag pulse-app:latest "$target"
    ok "Rollback-Image aus pulse-app:latest: $target"
    return 0
  fi

  # Legacy-Images vor Einführung pulse-app:* (z. B. pulse-pulse:latest auf Prod).
  if docker image inspect pulse-pulse:latest >/dev/null 2>&1; then
    docker tag pulse-pulse:latest "$target"
    ok "Rollback-Image aus Legacy pulse-pulse:latest: $target"
    return 0
  fi

  warn "Kein laufendes Image zum Taggen für v${norm} — Rollback nur über Git-Rebuild möglich."
}

# Readiness: JSON mit "ok":true (strikt — kein health_only-Fallback).
curl_readiness_ok() {
  local url="$1"
  local body
  body="$(curl -fsS "$url" 2>/dev/null || return 1)"
  printf '%s' "$body" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'
}

# Git auf vorherigen Stand zurücksetzen (Tag oder Commit).
rollback_git_ref() {
  local dir="$1"
  local git_ref="$2"
  local from_ver="$3"

  need_cmd git
  cd "$dir"

  if [ -n "$git_ref" ]; then
    git checkout "$git_ref" || die "Git-Rollback auf $git_ref fehlgeschlagen."
    ok "Git zurückgesetzt: ${git_ref:0:12}"
    return 0
  fi

  if git rev-parse "v${from_ver}" >/dev/null 2>&1; then
    git checkout "v${from_ver}" || die "Git-Rollback auf v${from_ver} fehlgeschlagen."
    ok "Git zurückgesetzt: v${from_ver}"
    return 0
  fi

  die "Kein Git-Ref für Rollback (weder Commit noch Tag v${from_ver})."
}

# Daten/.env aus Update-Backup wiederherstellen (optional).
restore_data_backup() {
  local dir="$1"
  local backup_dir="$2"

  [ -n "$backup_dir" ] || return 0
  [ -d "$backup_dir" ] || return 0

  if [ -d "$backup_dir/data" ]; then
    warn "Stelle data/ aus Backup wieder her…"
    mkdir -p "$dir/data"
    cp -a "$backup_dir/data/." "$dir/data/"
  fi
  if [ -f "$backup_dir/.env" ]; then
    cp -a "$backup_dir/.env" "$dir/.env"
  fi
}

# Docker-Rollback: Git + getaggtes Image, ohne Rebuild.
rollback_docker_release() {
  local dir="$1"
  local from_ver="$2"
  local git_ref="$3"
  local backup_dir="${4:-}"

  need_cmd docker
  cd "$dir"

  warn "Automatischer Docker-Rollback auf v${from_ver}…"
  rollback_git_ref "$dir" "$git_ref" "$from_ver"

  local norm="$from_ver"
  norm="$(normalize_version_tag "$norm")"

  if docker image inspect "pulse-app:${norm}" >/dev/null 2>&1; then
    PULSE_IMAGE_TAG="$norm" docker compose up -d --no-build --force-recreate \
      || die "Docker-Rollback (pulse-app:${norm}) fehlgeschlagen."
    ok "Container mit pulse-app:${norm} neu gestartet"
  else
    warn "Kein pulse-app:${norm} — versuche docker compose up ohne Build (Legacy-Compose)…"
    docker compose up -d --no-build --force-recreate \
      || die "Docker-Rollback (Legacy) fehlgeschlagen — manuell eingreifen."
  fi

  restore_data_backup "$dir" "$backup_dir"
}

# npm-Rollback: Git, Build der alten Version, Dienst neu starten.
rollback_npm_release() {
  local dir="$1"
  local from_ver="$2"
  local git_ref="$3"
  local backup_dir="${4:-}"

  cd "$dir"
  warn "Automatischer npm-Rollback auf v${from_ver}…"
  rollback_git_ref "$dir" "$git_ref" "$from_ver"
  restore_data_backup "$dir" "$backup_dir"

  need_cmd npm
  npm install || die "npm install beim Rollback fehlgeschlagen."
  npm run build || die "npm run build beim Rollback fehlgeschlagen."
  npm prune --omit=dev || true

  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files pulse.service 2>/dev/null | grep -q pulse.service; then
    systemctl restart pulse.service || die "systemctl restart beim Rollback fehlgeschlagen."
    ok "pulse.service nach Rollback neu gestartet"
  else
    warn "Kein pulse.service — manuell neu starten: cd $dir && npm start"
  fi
}
