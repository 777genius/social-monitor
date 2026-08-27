FROM node:22-bookworm-slim AS app

WORKDIR /app

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY apps ./apps
COPY libs ./libs

ARG PRISMA_GENERATE_DATABASE_URL=postgresql://social_monitor:social_monitor_local_password@localhost:5432/social_monitor
RUN DATABASE_URL="${PRISMA_GENERATE_DATABASE_URL}" npm run prisma:generate && npm run build
COPY scripts ./scripts

ARG SERVICE=api
ENV NODE_ENV=production
ENV SERVICE=${SERVICE}
ENV PATH="/app/node_modules/.bin:${PATH}"
USER node

CMD ["sh", "-c", "case \"$SERVICE\" in api) exec node dist/apps/api-gateway/src/main.js ;; agent-runtime) exec node dist/apps/agent-runtime/src/main.js ;; ingestion) exec node dist/apps/ingestion-worker/src/main.js ;; intelligence) exec node dist/apps/intelligence-worker/src/main.js ;; delivery) exec node dist/apps/delivery-service/src/main.js ;; event-relay) exec node dist/apps/event-relay/src/main.js ;; *) echo \"Unknown service: $SERVICE\" >&2; exit 64 ;; esac"]
