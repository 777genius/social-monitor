#!/usr/bin/env bash
# shellcheck disable=SC2016
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ENTRYPOINT=$SCRIPT_DIR/social-monitor-production-deploy.sh
FIXTURE=$(mktemp -d "/tmp/daily-runner-bootstrap-deploy-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

ROOT=$FIXTURE/root
REPO=$FIXTURE/repo
CONTROL=$FIXTURE/control
STATE=$CONTROL/deploy-state
STAGING=$ROOT/runtime/deploy-staging
TARGET_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
PREVIOUS_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
EVENTS=$FIXTURE/events.log

install -d "$REPO/ops/deploy" "$CONTROL" "$STATE" "$STAGING"
cp "$ENTRYPOINT" \
  "$SCRIPT_DIR/deploy-control-lib.sh" \
  "$SCRIPT_DIR/deploy-control-bridge-lib.sh" \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" \
  "$SCRIPT_DIR/backend-runtime-health-lib.sh" \
  "$SCRIPT_DIR/backend-image-rescue-lib.sh" \
  "$SCRIPT_DIR/daily-runner-image-bootstrap-lib.sh" \
  "$SCRIPT_DIR/postgres-runtime-activation-boundary-lib.sh" \
  "$SCRIPT_DIR/postgres-runtime-daily-c1-readiness-lib.sh" \
  "$SCRIPT_DIR/postgres-runtime-weekly-timer-state-lib.sh" \
  "$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.sh" \
  "$SCRIPT_DIR/x-collector-image-deploy-lib.sh" \
  "$REPO/ops/deploy/"
git -C "$REPO" init -q
git -C "$REPO" config user.name 'Deploy Contract Test'
git -C "$REPO" config user.email deploy-contract@example.invalid
git -C "$REPO" add ops/deploy
git -C "$REPO" commit -qm 'test: bootstrap deploy fixture'

run_deploy_backend_case() {
  local services=$1
  local bootstrap_status=${2:-0}

  : > "$EVENTS"
  ENTRYPOINT="$ENTRYPOINT" EVENTS="$EVENTS" SERVICES="$services" \
  BOOTSTRAP_STATUS="$bootstrap_status" TARGET_SHA="$TARGET_SHA" \
  PREVIOUS_SHA="$PREVIOUS_SHA" \
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
  SOCIAL_MONITOR_DEPLOY_REPO="$REPO" \
  SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
  SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
  SOCIAL_MONITOR_DEPLOY_STAGING="$STAGING" \
    bash -c '
      set -euo pipefail
      source "$ENTRYPOINT"
      backend_services() {
        tr " " "\n" <<< "$SERVICES"
      }
      marker_value() {
        printf "%s\n" "$PREVIOUS_SHA"
      }
      daily_runner_image_bootstrap_before_rescue() {
        [[ $1 == "$PREVIOUS_SHA" && $2 == "$TARGET_SHA" ]]
        printf "bootstrap\n" >> "$EVENTS"
        [[ $BOOTSTRAP_STATUS == 0 ]]
      }
      backend_image_rescue_prepare() {
        [[ $1 == "$TARGET_SHA" ]]
        printf "rescue\n" >> "$EVENTS"
        return 79
      }
      deploy_backend "$TARGET_SHA"
    ' 2>&1
}

source_line=$(grep -nF "source \"\$daily_runner_bootstrap_library\"" \
  "$ENTRYPOINT" | cut -d: -f1)
call_line=$(grep -nF \
  "daily_runner_image_bootstrap_before_rescue \"\$from\" \"\$sha\"" \
  "$ENTRYPOINT" | cut -d: -f1)
rescue_line=$(grep -nF \
  "backend_image_rescue_prepare \"\$sha\" \"\$previous\"" \
  "$ENTRYPOINT" | cut -d: -f1)
((source_line < call_line && call_line < rescue_line))

set +e
daily_output=$(run_deploy_backend_case 'api daily-runner')
daily_status=$?
set -e
((daily_status != 0))
grep -F 'required rollback images could not be pinned before build' \
  <<< "$daily_output" >/dev/null
[[ $(<"$EVENTS") == $'bootstrap\nrescue' ]]

set +e
bootstrap_output=$(run_deploy_backend_case 'api daily-runner' 71)
bootstrap_status=$?
set -e
((bootstrap_status != 0))
grep -F 'missing prior daily-runner image could not be reconstructed' \
  <<< "$bootstrap_output" >/dev/null
[[ $(<"$EVENTS") == bootstrap ]]

set +e
ordinary_output=$(run_deploy_backend_case api)
ordinary_status=$?
set -e
((ordinary_status != 0))
grep -F 'required rollback images could not be pinned before build' \
  <<< "$ordinary_output" >/dev/null
[[ $(<"$EVENTS") == rescue ]]

printf 'Daily-runner bootstrap deploy hook tests passed\n'
