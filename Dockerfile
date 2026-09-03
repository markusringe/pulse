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
COPY package.json ./
RUN npm install --omit=dev
COPY lib ./lib
COPY frontend ./frontend
COPY server.js ./
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /app/data/ssl \
  && chown -R node:node /app /app/data
EXPOSE 3000 80 443 3443
ENV SSL_DIR=/app/data/ssl
HEALTHCHECK --interval=20s --timeout=3s --start-period=8s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
