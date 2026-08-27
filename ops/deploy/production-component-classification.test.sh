#!/usr/bin/env bash
# shellcheck disable=SC1091
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
mkdir -p "$REPO/libs/contracts/rest" "$REPO/libs/contracts/other" \
  "$REPO/apps/api-gateway" "$REPO/scripts" "$STATE" "$STAGING"
mkdir -p "$REPO/ops/deploy"
cp "$SCRIPT_DIR"/{production-component-classification-lib.sh,postgres-runtime-deploy-lib.sh,postgres-runtime-daily-c1-readiness-lib.sh,postgres-runtime-weekly-timer-state-lib.sh,postgres-runtime-activation-boundary-lib.sh,backend-runtime-health-lib.sh,backend-image-rescue-lib.sh,x-collector-image-deploy-lib.sh} \
  "$REPO/ops/deploy/"
printf 'snapshot-a\n' > "$REPO/libs/contracts/rest/openapi.snapshot.json"
printf 'base\n' > "$REPO/apps/api-gateway/base.ts"
printf 'export {};\n' > "$REPO/scripts/base.ts"
git -C "$REPO" add .
git -C "$REPO" commit -qm base
BASE=$(git -C "$REPO" rev-parse HEAD)
printf '%s\n' "$BASE" > "$STATE/frontend.sha"
printf '%s\n' "$BASE" > "$STATE/backend.sha"

# shellcheck source=ops/deploy/social-monitor-production-deploy.sh
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

services_between() {
  backend_services "$1" "$2"
}

FULL_BACKEND_SERVICES=$'migrate\notel-collector\napi\nagent-runtime\ningestion-worker\nintelligence-worker\ndelivery-service\nevent-relay\ndaily-runner\nx-collector'
SCRIPT_SERVICES=$'migrate\ndaily-runner'

# An empty diff selects nothing.
[[ -z $(services_between "$LIBS_ADJACENT" "$LIBS_ADJACENT") ]]

# A scripts-only release selects exactly the two images that execute scripts.
git -C "$REPO" checkout -qb scripts-only "$LIBS_ADJACENT"
printf 'export {};\n' > "$REPO/scripts/check-feed-promotion-index-recovery.ts"
git -C "$REPO" add scripts/check-feed-promotion-index-recovery.ts
git -C "$REPO" commit -qm scripts-only
SCRIPTS_ONLY=$(git -C "$REPO" rev-parse HEAD)
[[ $(services_between "$LIBS_ADJACENT" "$SCRIPTS_ONLY") == \
   "$SCRIPT_SERVICES" ]]

# Script selection unions with service-specific paths in stable first-selection
# order without dropping or duplicating either migration image.
git -C "$REPO" checkout -qb scripts-api "$LIBS_ADJACENT"
printf 'api\n' > "$REPO/apps/api-gateway/change.ts"
printf 'export {};\n' > "$REPO/scripts/check-feed-promotion-index-recovery.ts"
git -C "$REPO" add apps/api-gateway/change.ts \
  scripts/check-feed-promotion-index-recovery.ts
git -C "$REPO" commit -qm scripts-api
SCRIPTS_API=$(git -C "$REPO" rev-parse HEAD)
SCRIPTS_API_SERVICES=$'api\nmigrate\ndaily-runner'
[[ $(services_between "$LIBS_ADJACENT" "$SCRIPTS_API") == \
   "$SCRIPTS_API_SERVICES" ]]
[[ $(services_between "$LIBS_ADJACENT" "$SCRIPTS_API") == \
   $(services_between "$LIBS_ADJACENT" "$SCRIPTS_API") ]]

# A migration-specific path plus scripts still emits migrate once.
git -C "$REPO" checkout -qb scripts-publication "$LIBS_ADJACENT"
printf 'export {};\n' > "$REPO/scripts/check-feed-promotion-index-recovery.ts"
printf '%s\n' '-- publication change' > \
  "$REPO/ops/deploy/reader-summary-publication-pre-migration.sql"
git -C "$REPO" add scripts/check-feed-promotion-index-recovery.ts \
  ops/deploy/reader-summary-publication-pre-migration.sql
git -C "$REPO" commit -qm scripts-publication
SCRIPTS_PUBLICATION=$(git -C "$REPO" rev-parse HEAD)
[[ $(services_between "$LIBS_ADJACENT" "$SCRIPTS_PUBLICATION") == \
   "$SCRIPT_SERVICES" ]]

# Common plus scripts remains the unchanged full rebuild in canonical order.
git -C "$REPO" checkout -qb scripts-common "$LIBS_ADJACENT"
printf 'FROM scratch\n' > "$REPO/Dockerfile"
printf 'export {};\n' > "$REPO/scripts/check-feed-promotion-index-recovery.ts"
git -C "$REPO" add Dockerfile scripts/check-feed-promotion-index-recovery.ts
git -C "$REPO" commit -qm scripts-common
SCRIPTS_COMMON=$(git -C "$REPO" rev-parse HEAD)
[[ $(services_between "$LIBS_ADJACENT" "$SCRIPTS_COMMON") == \
   "${FULL_BACKEND_SERVICES%$'\nx-collector'}" ]]

# A missing/invalid marker keeps the historical fail-safe full rebuild,
# including the independently classified collector image.
[[ $(services_between '' "$SCRIPTS_COMMON") == "$FULL_BACKEND_SERVICES" ]]
rm -f "$STATE/backend.sha"
if ! component_changed backend "$SCRIPTS_COMMON" "${BACKEND_PATHS[@]}"; then
  echo 'missing backend marker did not request a full rebuild' >&2
  exit 1
fi

# Mutation probes prove the exact scripts-only set and order are executable
# assertions, not incidental string coverage.
assert_scripts_mutation_rejected() {
  local mutation=$1 mutant=$FIXTURE/classification-$1.sh
  cp "$SCRIPT_DIR/production-component-classification-lib.sh" "$mutant"
  case $mutation in
    omit-migrate)
      sed -i "s/printf '%s\\\\n' migrate daily-runner/printf '%s\\\\n' daily-runner/" "$mutant"
      ;;
    reverse-order)
      sed -i "s/printf '%s\\\\n' migrate daily-runner/printf '%s\\\\n' daily-runner migrate/" "$mutant"
      ;;
  esac
  if (
    # shellcheck source=/dev/null
    source "$mutant"
    [[ $(backend_services "$LIBS_ADJACENT" "$SCRIPTS_ONLY") == \
       "$SCRIPT_SERVICES" ]]
  ); then
    echo "service-selection mutation survived: $mutation" >&2
    exit 1
  fi
}
assert_scripts_mutation_rejected omit-migrate
assert_scripts_mutation_rejected reverse-order

echo 'Production component classification tests passed'
