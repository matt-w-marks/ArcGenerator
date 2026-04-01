# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20.19.1-alpine3.21 AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20.19.1-alpine3.21 AS runtime

WORKDIR /app

RUN chown node:node /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src/ ./src/

USER node

EXPOSE 3000

CMD ["node", "src/index.js"]
