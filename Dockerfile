FROM node:22-alpine AS css-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY frontend/css/tailwind.input.css ./frontend/css/tailwind.input.css
COPY frontend/index.html ./frontend/index.html
COPY frontend/js ./frontend/js
COPY frontend/help ./frontend/help
COPY scripts/build-css.sh ./scripts/build-css.sh
RUN npm run css:build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Postfix liefert /usr/sbin/sendmail — Pulse versendet PIN-E-Mails standardmäßig per Sendmail
RUN apk add --no-cache postfix su-exec ca-certificates \
  && postconf -e 'inet_interfaces = loopback-only' \
  && postconf -e 'mynetworks = 127.0.0.0/8 [::1]/128' \
  && postconf -e 'smtpd_relay_restrictions = permit_mynetworks,reject_unauth_destination' \
  && postconf -e 'smtpd_recipient_restrictions = permit_mynetworks,reject' \
  && mkdir -p /app/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY lib ./lib
COPY frontend ./frontend
COPY --from=css-builder /app/frontend/css/pulse.css ./frontend/css/pulse.css
COPY server.js ./
# Diagnose und Bootstrap-Tests im Container (npm run pulse:diagnose / auth:diagnose / test:bootstrap)
COPY scripts/diagnose-pulse.js scripts/diagnose-auth.js scripts/test-bootstrap.js scripts/test-reconnect-sync.js ./scripts/
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /app/data/ssl \
  && chown -R node:node /app /app/data
EXPOSE 3000 80 443 3443
ENV SSL_DIR=/app/data/ssl
HEALTHCHECK --interval=20s --timeout=3s --start-period=8s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
