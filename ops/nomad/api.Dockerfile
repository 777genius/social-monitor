# Standalone immutable image for the Nomad-managed API vertical slice.
# `apps/api-gateway` has compile-time references into sibling apps (provider
# tokens, module wiring for health reporting), so the full `apps` tree is
# required at build time even though only the API entrypoint runs here; the
# runtime image itself carries no other app's server code invoked at startup.
FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS app

WORKDIR /app

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --chmod=0644 package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY scripts/check-feed-promotion-index-recovery.ts ./scripts/
COPY apps ./apps
COPY libs ./libs
COPY ops/nomad/api-env-entrypoint.mjs ./ops/nomad/api-env-entrypoint.mjs

ARG PRISMA_GENERATE_DATABASE_URL=postgresql://social_monitor:social_monitor_local_password@localhost:5432/social_monitor
RUN DATABASE_URL="${PRISMA_GENERATE_DATABASE_URL}" npm run prisma:generate && npm run build

# Host checkouts may use umask 077. Keep public image assets root-owned and
# readable by node, preserving executable tools and directory traversal.
RUN chmod -R u=rwX,go=rX \
  apps libs prisma scripts vendor dist ops \
  tsconfig.json tsconfig.build.json prisma.config.ts

ARG SOCIAL_MONITOR_RELEASE_SHA
LABEL org.opencontainers.image.revision="${SOCIAL_MONITOR_RELEASE_SHA}"
LABEL org.opencontainers.image.title="social-monitor-api"
LABEL org.opencontainers.image.source="https://github.com/777genius/social-monitor"

EXPOSE 3000
ENV NODE_ENV=production
ENV SERVICE=api
ENV PATH="/app/node_modules/.bin:${PATH}"
ENV SOCIAL_MONITOR_API_ENV_FILE=/run/social-monitor/api.env
USER node

# The entrypoint reads SOCIAL_MONITOR_API_ENV_FILE (a read-only named host
# volume mount, plan section 6) without eval/shell sourcing, then execs the
# real API process. See ops/nomad/api-env-entrypoint.mjs.
ENTRYPOINT ["node", "ops/nomad/api-env-entrypoint.mjs"]
CMD ["node", "dist/apps/api-gateway/src/main.js"]
