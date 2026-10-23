# Interface React compilée, servie par Caddy (HTTPS automatique)
FROM node:22-alpine AS compilation
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM caddy:2.8.4-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=compilation /app/dist /srv
