#!/usr/bin/env bash
# shellcheck disable=SC1091
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d /tmp/social-monitor-scripts-transaction.XXXXXX)
trap 'rm -rf "$FIXTURE"' EXIT
REPO=$FIXTURE/repo
ROOT=$FIXTURE/root
CONTROL=$ROOT/control
STATE=$CONTROL/deploy-state
STAGING=$ROOT/runtime/deploy-staging
COMPOSE_LOG=$FIXTURE/compose.log

install -d "$REPO/ops/deploy" "$REPO/apps/api-gateway" \
  "$REPO/scripts" "$STATE" "$STAGING"
cp "$SCRIPT_DIR"/{production-component-classification-lib.sh,postgres-runtime-deploy-lib.sh,postgres-runtime-daily-c1-readiness-lib.sh,postgres-runtime-weekly-timer-state-lib.sh,postgres-runtime-activation-boundary-lib.sh,backend-runtime-health-lib.sh,backend-image-rescue-lib.sh,x-collector-image-deploy-lib.sh} \
  "$REPO/ops/deploy/"
printf 'base\n' > "$REPO/apps/api-gateway/base.ts"
printf 'export {};\n' > "$REPO/scripts/base.ts"
git init -q -b main "$REPO"
git -C "$REPO" config user.name 'Scripts Transaction Test'
git -C "$REPO" config user.email scripts-transaction@example.invalid
git -C "$REPO" add .
git -C "$REPO" commit -qm base
BASE=$(git -C "$REPO" rev-parse HEAD)

git -C "$REPO" checkout -qb scripts-only
printf 'export {};\n' > \
  "$REPO/scripts/check-feed-promotion-index-recovery.ts"
git -C "$REPO" add scripts/check-feed-promotion-index-recovery.ts
git -C "$REPO" commit -qm scripts-only
SCRIPTS_ONLY=$(git -C "$REPO" rev-parse HEAD)

git -C "$REPO" checkout -qb scripts-api "$BASE"
printf 'api\n' > "$REPO/apps/api-gateway/change.ts"
printf 'export {};\n' > \
  "$REPO/scripts/check-feed-promotion-index-recovery.ts"
git -C "$REPO" add apps/api-gateway/change.ts \
  scripts/check-feed-promotion-index-recovery.ts
git -C "$REPO" commit -qm scripts-api
SCRIPTS_API=$(git -C "$REPO" rev-parse HEAD)

git -C "$REPO" checkout -qb scripts-common "$BASE"
printf 'FROM scratch\n' > "$REPO/Dockerfile"
printf 'export {};\n' > \
  "$REPO/scripts/check-feed-promotion-index-recovery.ts"
git -C "$REPO" add Dockerfile \
  scripts/check-feed-promotion-index-recovery.ts
git -C "$REPO" commit -qm scripts-common
SCRIPTS_COMMON=$(git -C "$REPO" rev-parse HEAD)

# shellcheck source=ops/deploy/social-monitor-production-deploy.sh
SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
SOCIAL_MONITOR_DEPLOY_ROOT=$ROOT \
SOCIAL_MONITOR_DEPLOY_REPO=$REPO \
SOCIAL_MONITOR_DEPLOY_CONTROL=$CONTROL \
SOCIAL_MONITOR_DEPLOY_STATE=$STATE \
SOCIAL_MONITOR_DEPLOY_STAGING=$STAGING \
  source "$SCRIPT_DIR/social-monitor-production-deploy.sh"

SCRIPT_SERVICES=$'migrate\ndaily-runner'
FULL_SERVICES=$'migrate\notel-collector\napi\nagent-runtime\ningestion-worker\nintelligence-worker\ndelivery-service\nevent-relay\ndaily-runner\nx-collector'
[[ $(backend_services "$BASE" "$SCRIPTS_ONLY") == "$SCRIPT_SERVICES" ]]
[[ $(backend_services "$BASE" "$SCRIPTS_API") == \
   $'api\nmigrate\ndaily-runner' ]]
[[ $(backend_services "$BASE" "$SCRIPTS_COMMON") == \
   "${FULL_SERVICES%$'\nx-collector'}" ]]
[[ -z $(backend_services "$BASE" "$BASE") ]]
[[ $(backend_services '' "$SCRIPTS_ONLY") == "$FULL_SERVICES" ]]

printf '%s\n' "$BASE" > "$STATE/backend.sha"
: > "$COMPOSE_LOG"
ENTRYPOINT=$SCRIPT_DIR/social-monitor-production-deploy.sh \
COMPOSE_LOG=$COMPOSE_LOG TARGET_SHA=$SCRIPTS_ONLY \
SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
SOCIAL_MONITOR_DEPLOY_ROOT=$ROOT \
SOCIAL_MONITOR_DEPLOY_REPO=$REPO \
SOCIAL_MONITOR_DEPLOY_CONTROL=$CONTROL \
SOCIAL_MONITOR_DEPLOY_STATE=$STATE \
SOCIAL_MONITOR_DEPLOY_STAGING=$STAGING \
  bash -c '
    set -euo pipefail
    source "$ENTRYPOINT"
    cleanup_stopped_project_containers() { :; }
    daily_runner_image_bootstrap_before_rescue() { :; }
    backend_image_rescue_prepare() { :; }
    reader_summary_publication_migrator_preflight() { :; }
    verify_migration_compatibility() { :; }
    backup_database() { :; }
    deploy_reader_summary_publication_migrations() { :; }
    fake_compose() {
      if [[ " $* " == *" build "* ]]; then
        printf "build:%s:%s\n" "${!#}" "$*" >> "$COMPOSE_LOG"
      elif [[ " $* " == *" up "* ]]; then
        printf "up:%s\n" "$*" >> "$COMPOSE_LOG"
      else
        printf "unexpected:%s\n" "$*" >> "$COMPOSE_LOG"
        return 97
      fi
    }
    COMPOSE=(fake_compose)
    deploy_backend "$TARGET_SHA"
  '

expected_compose=$'build:migrate:--profile app --profile daily build migrate\nbuild:daily-runner:--profile daily build daily-runner'
[[ $(< "$COMPOSE_LOG") == "$expected_compose" ]]
[[ $(grep -c '^build:' "$COMPOSE_LOG") == 2 ]]
if grep -Eq '^(up|unexpected):' "$COMPOSE_LOG"; then
  echo 'scripts-only transaction recreated a persistent service' >&2
  exit 1
fi

echo 'Production scripts-only transaction tests passed'
