#!/bin/sh
# Pulse-Container: Postfix (Sendmail) starten, dann als node-User den App-Prozess ausführen.
set -e

if [ -x /usr/sbin/postfix ]; then
  postfix start 2>/dev/null || true
fi

# Gemountetes data/ kann root gehören — Schreibrechte für node sicherstellen
if [ "$(id -u)" = "0" ] && [ -d /app/data ]; then
  chown -R node:node /app/data 2>/dev/null || true
fi

if [ "$(id -u)" = "0" ]; then
  exec su-exec node "$@"
fi

exec "$@"
