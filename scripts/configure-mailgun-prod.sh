#!/usr/bin/env bash
# Mailgun-Env auf dem VPS setzen und Pulse neu starten (ohne Secrets ins Repo).
# Nutzung auf dem Server:
#   sudo ./scripts/configure-mailgun-prod.sh \
#     --api-key 'key-…' \
#     --domain 'ringe.us' \
#     --webhook-key '…' \
#     [--from 'noreply@ringe.us'] \
#     [--admin-email 'markus@ringe.us']
set -euo pipefail

INSTALL_DIR="${PULSE_DIR:-/opt/pulse}"
ENV_FILE="$INSTALL_DIR/.env"
API_KEY=""
DOMAIN=""
WEBHOOK_KEY=""
FROM_EMAIL=""
ADMIN_EMAIL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-key) API_KEY="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --webhook-key) WEBHOOK_KEY="$2"; shift 2 ;;
    --from) FROM_EMAIL="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *) echo "Unbekannte Option: $1" >&2; exit 1 ;;
  esac
done

[[ -n "$API_KEY" && -n "$DOMAIN" ]] || {
  echo "Pflicht: --api-key, --domain" >&2
  exit 1
}

if [[ -z "$WEBHOOK_KEY" ]]; then
  echo "Hinweis: --webhook-key fehlt — Bounce-Webhooks akzeptieren erst nach Eintrag in .env." >&2
fi

upsert_env() {
  local key="$1" val="$2" file="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$file"
  else
    echo "${key}=${val}" >> "$file"
  fi
}

upsert_env "MAILGUN_API_KEY" "$API_KEY" "$ENV_FILE"
upsert_env "MAILGUN_DOMAIN" "$DOMAIN" "$ENV_FILE"
upsert_env "MAILGUN_API_BASE" "https://api.eu.mailgun.net" "$ENV_FILE"
if [[ -n "$WEBHOOK_KEY" ]]; then
  upsert_env "MAILGUN_WEBHOOK_SIGNING_KEY" "$WEBHOOK_KEY" "$ENV_FILE"
fi
upsert_env "PUBLIC_BASE_URL" "https://pulse.ringe.us" "$ENV_FILE"
chmod 600 "$ENV_FILE"

FROM_EMAIL="${FROM_EMAIL:-noreply@${DOMAIN}}"
ADMIN_EMAIL="${ADMIN_EMAIL:-markus@ringe.us}"

docker exec pulse-pulse-1 node -e "
const fs=require('fs');
const p='/app/data/email-config.json';
let c={}; try{c=JSON.parse(fs.readFileSync(p,'utf8'));}catch(e){}
Object.assign(c,{provider:'mailgun',from:'${FROM_EMAIL}',fromName:'Pulse',confirmedAdminEmail:'${ADMIN_EMAIL}',updatedAt:Date.now()});
fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n',{mode:0o600});
console.log('[mailgun] email-config.json → provider=mailgun');
"

cd "$INSTALL_DIR"
docker compose up -d --force-recreate pulse
echo "Warte auf Readiness…"
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1/api/health/ready" 2>/dev/null | grep -q '"ok":true'; then
    echo "Pulse bereit."
    exit 0
  fi
  sleep 2
done
echo "Warnung: Readiness-Timeout — logs prüfen: docker compose logs pulse" >&2
exit 1
