# syntax=docker/dockerfile:1

# Coophile production image.
#
# Two things about this build are worth understanding before changing it:
#
#  1. NEXT_PUBLIC_* values are inlined into the browser bundle by `next build`,
#     so they must be present as build args. Baking them in is safe — they are
#     public identifiers, not credentials.
#
#  2. Everything else (the Mongo URI, the Firebase service account, the LiveKit
#     secret) is a real secret and is supplied at *run* time only. None of it
#     belongs in a build arg, where it would be readable forever in the image
#     history by anyone who can pull the image.

ARG NODE_VERSION=24-alpine

# ── Dependencies ─────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# Only the manifests, so this layer is reused whenever source changes but
# dependencies do not.
COPY package.json package-lock.json ./
RUN npm ci

# ── Build ────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Public Firebase config, needed at build time because it ends up in the client
# bundle. Empty defaults keep the build working; the app then renders its
# "sign-in is not configured" screen instead of failing at runtime.
ARG NEXT_PUBLIC_FIREBASE_API_KEY=""
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=""
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID=""
ARG NEXT_PUBLIC_FIREBASE_APP_ID=""
ARG NEXT_PUBLIC_LIVEKIT_URL=""

ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── Runtime ──────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    ROM_CACHE_DIR=/var/cache/coophile/roms

# Unprivileged: nothing this server does needs root, and a container escape is
# a great deal less interesting from an account that owns nothing.
RUN addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S nextjs -G nodejs \
 && mkdir -p /var/cache/coophile/roms \
 && chown -R nextjs:nodejs /var/cache/coophile

# `output: "standalone"` bundles server.js plus only the traced dependencies.
# static/ and public/ are not included automatically and must be copied.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# Hits a real route rather than just checking the port is open, so a server
# that is listening but broken is reported unhealthy. 401 is the expected
# answer for an unauthenticated request and means the stack is up.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/auth/session').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
