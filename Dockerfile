FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY lib ./lib
COPY frontend ./frontend
COPY server.js ./
RUN mkdir -p /app/data/ssl && chown -R node:node /app /app/data
USER node
EXPOSE 3000 80 443 3443
ENV SSL_DIR=/app/data/ssl
HEALTHCHECK --interval=20s --timeout=3s --start-period=8s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
