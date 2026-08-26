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
cp "$SCRIPT_DIR"/{production-host-policy-lib.sh,postgres-runtime-deploy-lib.sh,postgres-runtime-daily-c1-readiness-lib.sh,postgres-runtime-weekly-timer-state-lib.sh,postgres-runtime-activation-boundary-lib.sh,backend-runtime-health-lib.sh,backend-image-rescue-lib.sh,x-collector-image-deploy-lib.sh} \
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
