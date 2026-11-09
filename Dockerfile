# syntax=docker/dockerfile:1
# Cloud Run image for the dashboard (Next.js standalone output).
# Build context rules live in .dockerignore — `.env` and `secrets/` must never
# reach this image (Next copies `.env` into the standalone output).

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` runs the postinstall hook, which patches node_modules/firebase.
COPY scripts/fix-firebase-exports.mjs ./scripts/
RUN npm ci

FROM node:24-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values come from .env.production (written by CI from Secret
# Manager); Next inlines them into the bundle at build time.
RUN npm run build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=8080 \
    NODE_OPTIONS=--max-old-space-size=1536
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 8080
CMD ["node", "server.js"]
