# ── Build stage — compile Vite PWA ───────────────────────────────────────────
FROM node:20.19.1-alpine3.21 AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY index.html vite.config.js ./
COPY public/  ./public/
COPY src/     ./src/

# Production build uses same-origin fetch — the nginx reverse proxy handles
# routing. No GATEWAY_URL needed at build time.
RUN npm run build

# ── Runtime stage — nginx serving static files ────────────────────────────────
FROM nginx:1.27.4-alpine3.21 AS runtime

# Remove default config and replace with SPA config
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

# nginx default user is already non-root (nginx uid 101 in alpine image)
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
