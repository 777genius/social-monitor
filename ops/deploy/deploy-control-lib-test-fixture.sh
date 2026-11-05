#!/usr/bin/env bash
# shellcheck disable=SC2034 # Fixture variables are consumed by the sourcing test and its libraries.

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/deploy-control-lib-test.XXXXXX")
trap 'touch "$FIXTURE/release"; rm -rf "$FIXTURE"' EXIT
REPO=$FIXTURE/repo
ROOT=$FIXTURE/root
CONTROL=$FIXTURE/control
STATE=$CONTROL/deploy-state
STAGING=$ROOT/runtime/deploy-staging
RELEASES=$ROOT/runtime/frontend-releases
DEPLOY_LOCK=$CONTROL/production-deploy.lock
DAILY_SINGLETON_LOCK=$CONTROL/daily-run-singleton.lock
POSTGRES_ADMISSION_LOCK=$CONTROL/daily-run.lock
# The sourced deploy-control library consumes this fixture-scoped path.
# shellcheck disable=SC2034
POSTGRES_RUNTIME_CURRENT=$CONTROL/postgres-runtime-current
POSTGRES_RUNTIME_RELEASES=$CONTROL/postgres-runtime-releases
SYSTEMD_UNIT_DIR=$ROOT/runtime/systemd
COMPOSE=(docker compose)
FRONTEND_PATHS=(frontend)
BACKEND_PATHS=(backend)
CONTROL_PATHS=(control)
RUNTIME_CONTROL_PATHS=(runtime-control)

install -d "$REPO/ops/deploy" "$CONTROL" "$STATE" "$SYSTEMD_UNIT_DIR"
cp "$SCRIPT_DIR/social-monitor-production-deploy.sh" \
  "$SCRIPT_DIR/social-monitor-production-ssh-wrapper.sh" \
  "$SCRIPT_DIR/deploy-control-lib.sh" "$SCRIPT_DIR/deploy-control-bridge-lib.sh" \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" \
  "$SCRIPT_DIR/postgres-runtime-asset-lib.sh" \
  "$SCRIPT_DIR/postgres-runtime-activation-boundary-lib.sh" \
  "$SCRIPT_DIR/postgres-runtime-daily-c1-readiness-lib.sh" \
  "$SCRIPT_DIR/postgres-runtime-weekly-timer-state-lib.sh" \
  "$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.sh" \
  "$SCRIPT_DIR/backend-image-rescue-lib.sh" \
  "$SCRIPT_DIR/backend-image-rescue-pin-cleanup-lib.sh" \
  "$SCRIPT_DIR/x-collector-image-deploy-lib.sh" \
  "$SCRIPT_DIR/verify-postgres-runtime-topology.py" \
  "$REPO/ops/deploy/"
cp -a "$SCRIPT_DIR/production-runtime" "$REPO/ops/deploy/"
git -C "$REPO" init -q -b main
git -C "$REPO" config user.name 'Deploy Control Fixture'
git -C "$REPO" config user.email deploy-control-fixture@example.invalid
git -C "$REPO" add ops/deploy
git -C "$REPO" commit -qm 'test: seed reviewed deploy control sources'
