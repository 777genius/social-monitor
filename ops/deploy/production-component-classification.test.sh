#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d /tmp/social-monitor-component-classification.XXXXXX)
trap 'rm -rf "$FIXTURE"' EXIT
REPO=$FIXTURE/repo
ROOT=$FIXTURE/root
CONTROL=$ROOT/control
STATE=$CONTROL/deploy-state
STAGING=$ROOT/runtime/deploy-staging

git init -q -b main "$REPO"
git -C "$REPO" config user.name 'Component Classification Test'
git -C "$REPO" config user.email classification@example.invalid
mkdir -p "$REPO/libs/contracts/rest" "$REPO/libs/contracts/other" "$STATE" "$STAGING"
mkdir -p "$REPO/ops/deploy"
cp "$SCRIPT_DIR"/{postgres-runtime-deploy-lib.sh,postgres-runtime-daily-c1-readiness-lib.sh,postgres-runtime-weekly-timer-state-lib.sh,postgres-runtime-activation-boundary-lib.sh,backend-runtime-health-lib.sh,backend-image-rescue-lib.sh,x-collector-image-deploy-lib.sh} \
  "$REPO/ops/deploy/"
printf 'snapshot-a\n' > "$REPO/libs/contracts/rest/openapi.snapshot.json"
git -C "$REPO" add .
git -C "$REPO" commit -qm base
BASE=$(git -C "$REPO" rev-parse HEAD)
printf '%s\n' "$BASE" > "$STATE/frontend.sha"
printf '%s\n' "$BASE" > "$STATE/backend.sha"

SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
SOCIAL_MONITOR_DEPLOY_ROOT=$ROOT \
SOCIAL_MONITOR_DEPLOY_REPO=$REPO \
SOCIAL_MONITOR_DEPLOY_CONTROL=$CONTROL \
SOCIAL_MONITOR_DEPLOY_STATE=$STATE \
SOCIAL_MONITOR_DEPLOY_STAGING=$STAGING \
  source "$SCRIPT_DIR/social-monitor-production-deploy.sh"

printf 'snapshot-b\n' > "$REPO/libs/contracts/rest/openapi.snapshot.json"
git -C "$REPO" add .
git -C "$REPO" commit -qm snapshot
SNAPSHOT=$(git -C "$REPO" rev-parse HEAD)
component_changed frontend "$SNAPSHOT" "${FRONTEND_PATHS[@]}"
if component_changed backend "$SNAPSHOT" "${BACKEND_PATHS[@]}"; then
  echo 'OpenAPI snapshot was backend classified' >&2
  exit 1
fi
printf '%s\n' "$SNAPSHOT" > "$STATE/frontend.sha"
printf '%s\n' "$SNAPSHOT" > "$STATE/backend.sha"

printf 'rest-adjacent\n' > "$REPO/libs/contracts/rest/adjacent.ts"
git -C "$REPO" add .
git -C "$REPO" commit -qm rest-adjacent
REST_ADJACENT=$(git -C "$REPO" rev-parse HEAD)
component_changed frontend "$REST_ADJACENT" "${FRONTEND_PATHS[@]}"
component_changed backend "$REST_ADJACENT" "${BACKEND_PATHS[@]}"
printf '%s\n' "$REST_ADJACENT" > "$STATE/frontend.sha"
printf '%s\n' "$REST_ADJACENT" > "$STATE/backend.sha"

printf 'libs-adjacent\n' > "$REPO/libs/contracts/other/adjacent.ts"
git -C "$REPO" add .
git -C "$REPO" commit -qm libs-adjacent
LIBS_ADJACENT=$(git -C "$REPO" rev-parse HEAD)
component_changed backend "$LIBS_ADJACENT" "${BACKEND_PATHS[@]}"
if component_changed frontend "$LIBS_ADJACENT" "${FRONTEND_PATHS[@]}"; then
  echo 'adjacent libs path was frontend classified' >&2
  exit 1
fi

printf '%s\n' "$LIBS_ADJACENT" > "$STATE/backend.sha"
git -C "$REPO" checkout -qb unrelated-script
mkdir -p "$REPO/scripts"
printf 'export {};\n' > "$REPO/scripts/unrelated.ts"
git -C "$REPO" add scripts/unrelated.ts
git -C "$REPO" commit -qm unrelated-script
UNRELATED_SCRIPT=$(git -C "$REPO" rev-parse HEAD)
mapfile -t unrelated_services < <(
  backend_services "$LIBS_ADJACENT" "$UNRELATED_SCRIPT"
)
[[ ${unrelated_services[*]} == daily-runner ]]

git -C "$REPO" checkout -q main
mkdir -p "$REPO/ops/deploy/production-runtime"
printf '#!/bin/sh\n' > \
  "$REPO/ops/deploy/production-runtime/rolling-summary-container-run.sh"
git -C "$REPO" add ops/deploy/production-runtime/rolling-summary-container-run.sh
git -C "$REPO" commit -qm rolling-container-runner
ROLLING_CONTAINER_RUNNER=$(git -C "$REPO" rev-parse HEAD)
component_changed backend "$ROLLING_CONTAINER_RUNNER" "${BACKEND_PATHS[@]}"
mapfile -t rolling_container_services < <(
  backend_services "$LIBS_ADJACENT" "$ROLLING_CONTAINER_RUNNER"
)
[[ ${rolling_container_services[*]} == daily-runner ]]

git -C "$REPO" checkout -q main
mkdir -p "$REPO/scripts"
printf 'export {};\n' > \
  "$REPO/scripts/check-feed-promotion-index-recovery.ts"
git -C "$REPO" add scripts/check-feed-promotion-index-recovery.ts
git -C "$REPO" commit -qm feed-promotion-recovery-script
RECOVERY_SCRIPT=$(git -C "$REPO" rev-parse HEAD)
mapfile -t recovery_services < <(
  backend_services "$LIBS_ADJACENT" "$RECOVERY_SCRIPT"
)
[[ ${recovery_services[*]} == 'migrate daily-runner' ]]

DEPLOY_LOG=$FIXTURE/recovery-script-deploy.log
cleanup_stopped_project_containers() { printf 'cleanup\n' >> "$DEPLOY_LOG"; }
daily_runner_image_bootstrap_before_rescue() {
  printf 'daily-bootstrap\n' >> "$DEPLOY_LOG"
}
backend_image_rescue_prepare() {
  printf 'rescue:%s\n' "${*:3}" >> "$DEPLOY_LOG"
}
reader_summary_publication_migrator_preflight() {
  printf 'preflight\n' >> "$DEPLOY_LOG"
}
backup_database() { printf 'backup\n' >> "$DEPLOY_LOG"; }
deploy_reader_summary_publication_migrations() {
  printf 'migration\n' >> "$DEPLOY_LOG"
}
fake_compose() { printf 'build:%s\n' "${!#}" >> "$DEPLOY_LOG"; }
# shellcheck disable=SC2034 # Consumed by deploy_backend from the sourced entrypoint.
COMPOSE=(fake_compose)
deploy_backend "$RECOVERY_SCRIPT"
[[ $(< "$DEPLOY_LOG") == $'cleanup\ndaily-bootstrap\nrescue:migrate daily-runner\npreflight\nbackup\nbuild:migrate\nbuild:daily-runner\nmigration' ]]
