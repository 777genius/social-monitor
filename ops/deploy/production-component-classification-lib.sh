#!/usr/bin/env bash

# Sourced by social-monitor-production-deploy.sh after REPO, STATE, and fail()
# are defined. Keep component path ownership and backend service selection in
# this focused control library so the production entrypoint remains a small
# orchestration shell.

FRONTEND_PATHS=(
  apps/frontend
  libs/contracts/rest
)

BACKEND_PATHS=(
  Dockerfile
  .dockerignore
  docker-compose.yml
  package.json
  package-lock.json
  tsconfig.json
  tsconfig.build.json
  prisma.config.ts
  prisma
  vendor
  libs
  ':(exclude)libs/contracts/rest/openapi.snapshot.json'
  apps/api-gateway
  apps/agent-runtime
  apps/ingestion-worker
  apps/intelligence-worker
  apps/delivery-service
  apps/event-relay
  apps/x-collector
  ops/deploy/production-runtime/x-collector.Dockerfile
  apps/social-research-runtime
  apps/social-research-grpc
  apps/social-research-mcp
  scripts
  ops/evals
  ops/observability
  ops/deploy/backend-runtime-health-lib.sh
  ops/deploy/rabbitmq-quorum-health.sh
  ops/deploy/rabbitmq-quorum-recovery.sh
  ops/deploy/reader-summary-publication-deploy-lib.sh ops/deploy/reader-summary-publication-system-dsn-bootstrap-lib.sh ops/deploy/reader-summary-publication-system-runtime-deploy-lib.sh
  ops/deploy/reader-summary-publication-pre-migration.sql
  ops/deploy/reader-summary-publication-post-migration.sql
  test
)
CONTROL_PATHS=(
  .github/workflows/production-deploy.yml
  ops/deploy
  ops/recovery/backup-restore-contract.json
)
# Consumed by deploy-control-lib.sh after this sourced library is loaded.
# shellcheck disable=SC2034
RUNTIME_CONTROL_PATHS=(
  ops/deploy/production-runtime/daily-c1-runtime.sh
  ops/deploy/production-runtime/daily-run.sh
  ops/deploy/production-runtime/rolling-run.sh
  ops/deploy/production-runtime/rolling-summary-receipt.mjs
  ops/deploy/production-runtime/compose.daily-artifacts.yml
  ops/deploy/production-runtime/reader-summary-daily-c1.readiness
  ops/deploy/postgres-runtime-daily-c1-readiness-lib.sh ops/deploy/postgres-runtime-weekly-timer-state-lib.sh ops/deploy/postgres-runtime-activation-boundary-lib.sh
  ops/deploy/production-runtime/github-premidnight-capture-v1.activation
  ops/deploy/production-runtime/github-premidnight-capture-v1.sh
  ops/deploy/production-runtime/social-monitor-github-premidnight-capture-v1.service
  ops/deploy/production-runtime/social-monitor-github-premidnight-capture-v1.timer
  ops/deploy/production-runtime/social-monitor-daily.service ops/deploy/production-runtime/social-monitor-daily.timer
  ops/deploy/production-runtime/social-monitor-rolling.service ops/deploy/production-runtime/social-monitor-rolling.timer
  ops/deploy/production-runtime/social-monitor-reader-summary-production-day.service.d-10-daily-c1-owner.conf
  ops/deploy/production-runtime/social-monitor-weekly.service ops/deploy/production-runtime/social-monitor-weekly.timer
)

marker_value() {
  local component=$1
  local marker=$STATE/$component.sha
  [[ -s $marker ]] && tr -d '\n' < "$marker"
}

component_changed() {
  local component=$1
  local target=$2
  shift 2
  local marker
  marker=$(marker_value "$component")
  if [[ -z $marker ]] || ! git -C "$REPO" cat-file -e "$marker^{commit}" 2>/dev/null; then
    return 0
  fi
  if git -C "$REPO" merge-base --is-ancestor "$target" "$marker"; then
    return 1
  fi
  git -C "$REPO" merge-base --is-ancestor "$marker" "$target" || fail "$component marker diverged from target"
  ! git -C "$REPO" diff --quiet "$marker" "$target" -- "$@"
}

print_plan() {
  local sha=$1
  fetch_main
  validate_main_commit "$sha"
  local frontend=false backend=false control=false x_collector=false backend_base
  backend_base=$(marker_value backend)
  if [[ ! $backend_base =~ ^[0-9a-f]{40}$ ]] || \
    ! git -C "$REPO" cat-file -e "$backend_base^{commit}" 2>/dev/null || \
    ! git -C "$REPO" merge-base --is-ancestor "$backend_base" "$sha"; then
    backend_base=0000000000000000000000000000000000000000
  fi
  component_changed frontend "$sha" "${FRONTEND_PATHS[@]}" && frontend=true
  component_changed backend "$sha" "${BACKEND_PATHS[@]}" && backend=true
  component_changed control "$sha" "${CONTROL_PATHS[@]}" && control=true
  component_changed backend "$sha" \
    apps/x-collector \
    ops/deploy/production-runtime/x-collector.Dockerfile && x_collector=true
  local postgres_pool_bootstrap=uninstalled
  local postgres_pool_bootstrap_sha=0000000000000000000000000000000000000000
  if postgres_pool_bootstrap_installed "$sha"; then
    postgres_pool_bootstrap=$POSTGRES_POOL_BOOTSTRAP_VERSION
    postgres_pool_bootstrap_sha=$(tr -d '\n' < "$STATE/postgres-pool-bootstrap.sha")
  fi
  printf 'frontend=%s\nbackend=%s\nbackend_base=%s\ncontrol=%s\nx_collector=%s\npostgres_pool_bootstrap=%s\npostgres_pool_bootstrap_sha=%s\n' \
    "$frontend" "$backend" "$backend_base" "$control" "$x_collector" \
    "$postgres_pool_bootstrap" "$postgres_pool_bootstrap_sha"
}

changed_between() {
  local from=$1
  local to=$2
  shift 2
  [[ -z $from ]] && return 0
  ! git -C "$REPO" diff --quiet "$from" "$to" -- "$@"
}

script_change_services() {
  changed_between "$1" "$2" scripts || return 0
  printf '%s\n' migrate daily-runner
}

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
    if changed_between "$from" "$to" apps/social-research-runtime; then
      services+=(api)
    fi
    if changed_between "$from" "$to" \
      ops/deploy/reader-summary-publication-deploy-lib.sh ops/deploy/reader-summary-publication-system-dsn-bootstrap-lib.sh \
      ops/deploy/reader-summary-publication-pre-migration.sql \
      ops/deploy/reader-summary-publication-post-migration.sql; then
      services+=(migrate)
    fi
    while IFS= read -r service; do
      services+=("$service")
    done < <(script_change_services "$from" "$to")
    if changed_between "$from" "$to" ops/evals test; then
      services+=(daily-runner)
    fi
    if changed_between "$from" "$to" ops/observability; then
      services+=(otel-collector)
    fi
  fi
  if changed_between "$from" "$to" \
    apps/x-collector \
    ops/deploy/production-runtime/x-collector.Dockerfile; then
    services+=(x-collector)
  fi
  printf '%s\n' "${services[@]}" | awk 'NF && !seen[$0]++'
}
