FROM node:22-bookworm-slim AS app

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
COPY scripts/recover-hn-verified-remainder.ts scripts/import-hn-verified-remainder.ts scripts/import-hn-verified-sep28.ts ./scripts/
COPY scripts/import-rss-sep24-verified.ts scripts/recover-rss-sep24-verified.ts ./scripts/
# Public closure of npm run run:reader-summary-clean-real-day-collection.
# Keep this positive list scoped to that consumer; never copy all of scripts.
COPY scripts/run-with-timeout.mjs scripts/run-reader-summary-clean-real-day-collection.ts ./scripts/
COPY scripts/lib/clean-real-day-collection-report.ts \
  scripts/lib/clean-real-day-provider-acquisition.ts \
  scripts/lib/clean-real-day-scan-policy-targets.ts \
  scripts/lib/clean-real-day-source-config-reader.ts \
  scripts/lib/clean-real-day-target-discovery.ts \
  scripts/lib/collection-scan-execution.ts \
  scripts/lib/env-file.ts \
  scripts/lib/github-trending-durable-snapshot-candidate-budget.ts \
  scripts/lib/github-trending-durable-snapshot-reuse.ts \
  scripts/lib/private-evaluation-file.ts \
  scripts/lib/production-collection-quality-policy.ts \
  scripts/lib/production-collection-scan-job-reporter.ts \
  scripts/lib/provider-collection-observability.ts \
  scripts/lib/provider-scan-result-selection.ts \
  scripts/lib/quality-gates.ts \
  scripts/lib/reader-summary-clean-real-day-collection-artifact.ts \
  scripts/lib/reader-summary-clean-real-day-collection-cli.ts \
  scripts/lib/reader-summary-daily-maintenance-bounds.ts \
  scripts/lib/reader-summary-daily-maintenance-scope.ts \
  scripts/lib/reader-summary-daily-provider-catch-up.ts \
  scripts/lib/reader-summary-multi-day-corpus-security.ts \
  scripts/lib/reader-summary-quality-eval-support.ts \
  scripts/lib/targeted-provider-collection.ts \
  scripts/lib/x-collection-retry-policy.ts \
  scripts/lib/yesterday-social-replay-support.ts ./scripts/lib/
COPY apps ./apps
COPY libs ./libs

ARG PRISMA_GENERATE_DATABASE_URL=postgresql://social_monitor:social_monitor_local_password@localhost:5432/social_monitor
RUN DATABASE_URL="${PRISMA_GENERATE_DATABASE_URL}" npm run prisma:generate && npm run build

# Host checkouts may use umask 077. Keep public image assets root-owned and
# readable by node, preserving executable tools and directory traversal.
RUN chmod -R u=rwX,go=rX \
  apps libs prisma scripts vendor dist \
  tsconfig.json tsconfig.build.json prisma.config.ts

ARG SERVICE=api
ENV NODE_ENV=production
ENV SERVICE=${SERVICE}
ENV PATH="/app/node_modules/.bin:${PATH}"
USER node

CMD ["sh", "-c", "case \"$SERVICE\" in api) exec node dist/apps/api-gateway/src/main.js ;; agent-runtime) exec node dist/apps/agent-runtime/src/main.js ;; ingestion) exec node dist/apps/ingestion-worker/src/main.js ;; intelligence) exec node dist/apps/intelligence-worker/src/main.js ;; delivery) exec node dist/apps/delivery-service/src/main.js ;; event-relay) exec node dist/apps/event-relay/src/main.js ;; *) echo \"Unknown service: $SERVICE\" >&2; exit 64 ;; esac"]
