#!/usr/bin/env bash

# Focused backend image classification extracted from the production deploy
# entrypoint before extending reader-summary runtime behavior.

backend_services() {
  local from=$1
  local to=$2
  local -a services=()
  local -a common_paths=(Dockerfile .dockerignore docker-compose.yml package.json package-lock.json tsconfig.json tsconfig.build.json prisma.config.ts prisma vendor libs)
  if changed_between "$from" "$to" "${common_paths[@]}"; then
    services=(migrate otel-collector api agent-runtime ingestion-worker intelligence-worker delivery-service event-relay daily-runner)
  else
    local mapping
    for mapping in \
      'apps/api-gateway:api' \
      'apps/agent-runtime:agent-runtime' \
      'apps/ingestion-worker:ingestion-worker' \
      'apps/intelligence-worker:intelligence-worker' \
      'apps/delivery-service:delivery-service' \
      'apps/event-relay:event-relay'; do
      local path=${mapping%%:*}
      local service=${mapping##*:}
      if changed_between "$from" "$to" "$path"; then
        services+=("$service")
      fi
    done
    if changed_between "$from" "$to" apps/social-research-runtime; then services+=(api); fi
    if changed_between "$from" "$to" \
      ops/deploy/reader-summary-publication-deploy-lib.sh ops/deploy/reader-summary-publication-system-dsn-bootstrap-lib.sh \
      ops/deploy/reader-summary-publication-pre-migration.sql \
      ops/deploy/reader-summary-publication-post-migration.sql; then
      services+=(migrate)
    fi
    if changed_between "$from" "$to" scripts/check-feed-promotion-index-recovery.ts; then services+=(migrate); fi
    if changed_between "$from" "$to" \
      scripts ops/evals test \
      ops/deploy/postgres-runtime-asset-lib.sh \
      ops/deploy/production-runtime/reader-summary-one-shot.sh \
      ops/deploy/production-runtime/reader-summary-scheduler-hold-common.sh \
      ops/deploy/production-runtime/reader-summary-scheduler-hold-status.sh \
      ops/deploy/production-runtime/reader-summary-scheduler-hold-prepare.sh \
      ops/deploy/production-runtime/reader-summary-scheduler-hold-restore.sh \
      ops/deploy/production-runtime/reader-summary-control-action.sh \
      ops/deploy/production-runtime/rolling-containerd-fallback.sh \
      ops/deploy/production-runtime/rolling-summary-container-run.sh \
      ops/deploy/production-runtime/rolling-summary-receipt.mjs; then
      services+=(daily-runner)
    fi
    if changed_between "$from" "$to" \
      ops/deploy/production-runtime/compose.agent-runtime-model.yml; then
      services+=(agent-runtime daily-runner)
    fi
    if changed_between "$from" "$to" ops/observability; then services+=(otel-collector); fi
  fi
  if changed_between "$from" "$to" \
    apps/x-collector \
    ops/deploy/production-runtime/x-collector.Dockerfile; then
    services+=(x-collector)
  fi
  printf '%s\n' "${services[@]}" | awk 'NF && !seen[$0]++'
}

compose_image_name() {
  printf '%s-%s:latest\n' "$PROJECT" "$1"
}
