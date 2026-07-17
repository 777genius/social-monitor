#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ENTRYPOINT=$SCRIPT_DIR/social-monitor-production-deploy.sh
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/social-monitor-deploy-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

REPO=$FIXTURE/repo
ORIGIN=$FIXTURE/origin.git
ROOT=$FIXTURE/root
CONTROL=$ROOT/control
STATE=$CONTROL/deploy-state
STAGING=$ROOT/runtime/deploy-staging

git init --bare -q "$ORIGIN"
git init -q -b main "$REPO"
git -C "$REPO" config user.name 'Deploy Contract Test'
git -C "$REPO" config user.email deploy-contract@example.invalid
git -C "$REPO" remote add origin "$ORIGIN"
install -d "$REPO/apps/frontend" "$REPO/apps/api-gateway" \
  "$REPO/apps/x-collector" "$REPO/ops/deploy" "$REPO/ops/recovery" \
  "$STATE" "$STAGING"
cp "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/deploy-control-lib.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh" \
  "$SCRIPT_DIR/reader-summary-publication-pre-migration.sql" \
  "$SCRIPT_DIR/reader-summary-publication-post-migration.sql" \
  "$REPO/ops/deploy/"
cp "$ENTRYPOINT" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/verify-postgres-runtime-topology.py" "$REPO/ops/deploy/"
cp -R "$SCRIPT_DIR/production-runtime" "$REPO/ops/deploy/"
printf 'base\n' > "$REPO/README.md"
git -C "$REPO" add README.md ops/deploy
git -C "$REPO" commit -qm 'test: base'
git -C "$REPO" push -q -u origin main
BASE_SHA=$(git -C "$REPO" rev-parse HEAD)

printf 'frontend\n' > "$REPO/apps/frontend/change.txt"
git -C "$REPO" add apps/frontend/change.txt
git -C "$REPO" commit -qm 'test: frontend change'
git -C "$REPO" push -q origin main
TARGET_SHA=$(git -C "$REPO" rev-parse HEAD)

for component in frontend backend control; do
  printf '%s\n' "$BASE_SHA" > "$STATE/$component.sha"
done
cp "$ENTRYPOINT" "$CONTROL/github-production-deploy.sh"
printf '%s\n' "$BASE_SHA" > "$STATE/postgres-pool-bootstrap.sha"

run_entrypoint() {
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
  SOCIAL_MONITOR_DEPLOY_REPO="$REPO" \
  SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
  SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
  SOCIAL_MONITOR_DEPLOY_STAGING="$STAGING" \
    bash "$ENTRYPOINT" "$@"
}

plan=$(run_entrypoint plan "$TARGET_SHA")
grep -Fx 'frontend=true' <<< "$plan" >/dev/null
grep -Fx 'backend=false' <<< "$plan" >/dev/null
grep -Fx "backend_base=$BASE_SHA" <<< "$plan" >/dev/null
grep -Fx 'control=false' <<< "$plan" >/dev/null
grep -Fx 'x_collector=false' <<< "$plan" >/dev/null
grep -Fx 'postgres_pool_bootstrap=postgres-pool-v1' <<< "$plan" >/dev/null
grep -Fx "postgres_pool_bootstrap_sha=$BASE_SHA" <<< "$plan" >/dev/null

printf '%s\n' "$TARGET_SHA" > "$STATE/frontend.sha"
plan=$(run_entrypoint plan "$TARGET_SHA")
grep -Fx 'frontend=false' <<< "$plan" >/dev/null

if run_entrypoint plan invalid-sha >/dev/null 2>&1; then
  echo 'invalid SHA was accepted' >&2
  exit 1
fi
if SSH_ORIGINAL_COMMAND=$'plan '"$TARGET_SHA"$'\ndeploy '"$TARGET_SHA" \
  run_entrypoint >/dev/null 2>&1; then
  echo 'multiline command was accepted' >&2
  exit 1
fi

printf '{"schemaVersion":1}\n' > "$REPO/ops/recovery/backup-restore-contract.json"
git -C "$REPO" add ops/recovery/backup-restore-contract.json
git -C "$REPO" commit -qm 'test: backup contract control change'
git -C "$REPO" push -q origin main
CONTROL_TARGET_SHA=$(git -C "$REPO" rev-parse HEAD)
plan=$(run_entrypoint plan "$CONTROL_TARGET_SHA")
grep -Fx 'frontend=false' <<< "$plan" >/dev/null
grep -Fx 'backend=false' <<< "$plan" >/dev/null
grep -Fx 'control=true' <<< "$plan" >/dev/null

grep -F "if printf '%s\\n' \"\${persistent[@]}\" | grep -qx api && ! refresh_frontend_api_proxy; then" \
  "$ENTRYPOINT" >/dev/null
grep -F "if [[ \$api_rolled_back == true ]]; then" "$ENTRYPOINT" >/dev/null
grep -F 'refresh_frontend_api_proxy || return 1' \
  "$ENTRYPOINT" >/dev/null
grep -F 'http://127.0.0.1:13080/auth/session' \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
# shellcheck disable=SC2016
grep -F '[[ ! -e $output && ! -L $output && ! -e $partial && ! -L $partial ]]' \
  "$ENTRYPOINT" >/dev/null
# shellcheck disable=SC2016
grep -F '"$ROOT/backups" 10 "$output"' \
  "$ENTRYPOINT" >/dev/null
grep -F 'verify-postgres-backup-coverage.sh' "$ENTRYPOINT" >/dev/null
# shellcheck disable=SC2016
backup_move_line=$(grep -nF 'mv "$partial" "$output"' "$ENTRYPOINT" | cut -d: -f1)
# shellcheck disable=SC2016
backup_prune_line=$(grep -nF 'prune-pre-autodeploy-backups.sh' \
  "$ENTRYPOINT" | cut -d: -f1)
((backup_move_line < backup_prune_line))
grep -F 'ops/deploy/host/refresh-codex-auth.sh' "$ENTRYPOINT" >/dev/null
# shellcheck disable=SC2016
grep -F 'install -m 0700 -o root -g root "$auth_refresh_source" "$auth_refresh_destination.next"' \
  "$ENTRYPOINT" >/dev/null
# shellcheck disable=SC2016
grep -F 'mv -f "$auth_refresh_destination.next" "$auth_refresh_destination"' \
  "$ENTRYPOINT" >/dev/null
# shellcheck disable=SC2016
grep -F 'install -m 0755 -o root -g root "$source" "$destination.next"' \
  "$ENTRYPOINT" >/dev/null
# shellcheck disable=SC2016
auth_sync_line=$(grep -nF 'install -m 0700 -o root -g root "$auth_refresh_source"' \
  "$ENTRYPOINT" | cut -d: -f1)
# shellcheck disable=SC2016
entrypoint_sync_line=$(grep -nF 'install -m 0755 -o root -g root "$source"' \
  "$ENTRYPOINT" | tail -1 | cut -d: -f1)
((auth_sync_line < entrypoint_sync_line))
# shellcheck disable=SC2016
control_library=$SCRIPT_DIR/deploy-control-lib.sh
control_sync_line=$(grep -nF 'sync_control_script "$sha"' \
  "$control_library" | tail -1 | cut -d: -f1)
bootstrap_commit_line=$(grep -nF 'commit_postgres_pool_bootstrap "$sha"' \
  "$control_library" | tail -1 | cut -d: -f1)
# shellcheck disable=SC2016
control_marker_line=$(grep -nF 'printf '\''%s\n'\'' "$sha" > "$STATE/control.sha.next"' \
  "$control_library" | cut -d: -f1)
((control_sync_line < bootstrap_commit_line))
((bootstrap_commit_line < control_marker_line))

grep -F 'deploy_release_runtime_transaction "$sha" "$backend" "$runtime_control"' \
  "$SCRIPT_DIR/deploy-control-lib.sh" >/dev/null
grep -F 'activate_postgres_runtime_control "$sha" "$compatible_backend_sha"' \
  "$ENTRYPOINT" >/dev/null
grep -F 'snapshot_postgres_runtime_control "$sha"' \
  "$ENTRYPOINT" >/dev/null
grep -F 'restore_postgres_runtime_control "$runtime_control_backup"' \
  "$ENTRYPOINT" >/dev/null
grep -F 'rollback_backend_images "$previous_images"' \
  "$ENTRYPOINT" >/dev/null
grep -F 'verify_live_postgres_admission "$postgres_env"' "$ENTRYPOINT" >/dev/null
grep -F 'probe_postgres_maximum_envelope "$postgres_env"' "$ENTRYPOINT" >/dev/null
grep -F 'deploy_reader_summary_publication_migrations' "$ENTRYPOINT" >/dev/null
grep -F 'reader-summary-publication-admin-url' \
  "$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh" >/dev/null
# The admin URL must be a mounted file, never a Docker argument or the
# production runtime environment.
if grep -E -- '--(env|set)[ =]DATABASE_URL' \
  "$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh" >/dev/null; then
  echo 'publication admin URL is exposed through a container argument' >&2
  exit 1
fi
grep -F 'PGDATABASE=$(cat /run/secrets/reader-summary-publication-admin-url)' \
  "$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh" >/dev/null
if grep -F 'psql "$DATABASE_URL"' \
  "$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh" >/dev/null; then
  echo 'publication admin URL is exposed through the psql argument list' >&2
  exit 1
fi
grep -F 'social_monitor_app' \
  "$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh" >/dev/null
grep -F "'externalConnectionOccupancy'" \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
grep -F "'stoppedRuntimeConnectionOccupancy'" \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
grep -F 'capture_backend_soak_baseline' \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
grep -F 'verify_backend_soak_logs' "$ENTRYPOINT" >/dev/null
grep -F 'verify_ingestion_queue_recovery' "$ENTRYPOINT" >/dev/null
SOAK_TIME_STATE=$FIXTURE/soak-time
printf '0\n' > "$SOAK_TIME_STATE"
heartbeat_output=$(
  ENTRYPOINT="$ENTRYPOINT" \
  SOAK_TIME_STATE="$SOAK_TIME_STATE" \
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
  SOCIAL_MONITOR_DEPLOY_REPO="$REPO" \
  SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
  SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
    bash -c '
      source "$ENTRYPOINT"
      ((POSTGRES_ROLLOUT_SOAK_SECONDS == 300))
      ((POSTGRES_ROLLOUT_SOAK_HEARTBEAT_SECONDS == 30))
      POSTGRES_ROLLOUT_SOAK_SECONDS=65
      POSTGRES_ROLLOUT_SOAK_HEARTBEAT_SECONDS=30
      capture_backend_soak_baseline() { : > "$1"; }
      verify_backend() { return 0; }
      verify_backend_proxy_readiness() { return 0; }
      verify_concurrent_backend_readiness() { return 0; }
      verify_backend_soak_state() { return 0; }
      verify_backend_soak_logs() { return 0; }
      verify_ingestion_queue_recovery() { return 0; }
      sleep() { :; }
      date() {
        local now
        read -r now < "$SOAK_TIME_STATE"
        printf "%s\n" "$((now + 5))" > "$SOAK_TIME_STATE"
        printf "%s\n" "$now"
      }
      soak_backend_release api
    '
)
grep -Fx 'backend-soak-heartbeat elapsed_seconds=0 target_seconds=65' \
  <<< "$heartbeat_output" >/dev/null
grep -Fx 'backend-soak-heartbeat elapsed_seconds=30 remaining_seconds=35' \
  <<< "$heartbeat_output" >/dev/null
grep -Fx 'backend-soak-heartbeat elapsed_seconds=60 remaining_seconds=5' \
  <<< "$heartbeat_output" >/dev/null
[[ $(grep -c '^backend-soak-heartbeat ' <<< "$heartbeat_output") == 3 ]]
grep -F 'verify-postgres-runtime-topology.py' "$ENTRYPOINT" >/dev/null
grep -F 'install -m 0644 "$source/social-monitor-prod.service"' \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
grep -F 'install -m 0644 "$source/social-monitor-daily.service"' \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
grep -F 'DropInPaths' "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
grep -F 'postgres-runtime-current/compose.postgres-runtime.yml' \
  "$SCRIPT_DIR/production-runtime/daily-run.sh" >/dev/null
if find "$SCRIPT_DIR/production-runtime" -name '*.timer' -print -quit | grep -q .; then
  echo 'PostgreSQL runtime release unexpectedly owns a timer' >&2
  exit 1
fi
grep -F 'dailyTimerOwner' \
  "$SCRIPT_DIR/postgres-pool-release-contract.json" >/dev/null
grep -F 'runtime_release != "$backend_release"' \
  "$SCRIPT_DIR/production-runtime/daily-run.sh" >/dev/null
grep -F 'daily-run-singleton.lock' \
  "$SCRIPT_DIR/production-runtime/daily-run.sh" >/dev/null
grep -F 'flock -w "$POSTGRES_ADMISSION_WAIT_SECONDS" 8' \
  "$SCRIPT_DIR/production-runtime/daily-run.sh" >/dev/null
grep -Fx 'TimeoutStartSec=23400' \
  "$SCRIPT_DIR/production-runtime/social-monitor-daily.service" >/dev/null
grep -Fx 'Restart=no' \
  "$SCRIPT_DIR/production-runtime/social-monitor-daily.service" >/dev/null
deploy_library_source_line=$(grep -nF 'source "$REPO/ops/deploy/deploy-control-lib.sh"' \
  "$ENTRYPOINT" | cut -d: -f1)
bridge_initialization_line=$(grep -nF 'initialize_deploy_control_bridge' \
  "$ENTRYPOINT" | tail -1 | cut -d: -f1)
((deploy_library_source_line < bridge_initialization_line))
grep -F 'advance_integration "$sha"' \
  "$SCRIPT_DIR/deploy-control-lib.sh" >/dev/null

# A bridge-current entrypoint classifies a later daily asset-only release as
# control-only runtime activation and uses the already-sourced bridge library.
BRIDGE_SHA=$CONTROL_TARGET_SHA
for component in frontend backend control; do
  printf '%s\n' "$BRIDGE_SHA" > "$STATE/$component.sha"
done
printf '# final daily runtime asset\n' >> \
  "$REPO/ops/deploy/production-runtime/daily-run.sh"
git -C "$REPO" add ops/deploy/production-runtime/daily-run.sh
git -C "$REPO" commit -qm 'test: final daily runtime asset'
git -C "$REPO" push -q origin HEAD:main
RUNTIME_CONTROL_TARGET_SHA=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" checkout -q "$BRIDGE_SHA"

ACTIVATION_LOG=$FIXTURE/runtime-control-activation.log
activation_output=$(
  ENTRYPOINT="$ENTRYPOINT" ACTIVATION_LOG="$ACTIVATION_LOG" \
  RUNTIME_CONTROL_TARGET_SHA="$RUNTIME_CONTROL_TARGET_SHA" \
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
  SOCIAL_MONITOR_DEPLOY_REPO="$REPO" \
  SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
  SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
  SOCIAL_MONITOR_DEPLOY_STAGING="$STAGING" \
    bash -c '
      source "$ENTRYPOINT"
      sync_control_script() { :; }
      commit_postgres_pool_bootstrap() { :; }
      deploy_release_runtime_transaction() {
        verify_deploy_control_bridge_compatibility
        printf "%s %s %s\n" "$1" "$2" "$3" > "$ACTIVATION_LOG"
      }
      deploy_release "$RUNTIME_CONTROL_TARGET_SHA"
    '
)
grep -F "deployed=$RUNTIME_CONTROL_TARGET_SHA" <<< "$activation_output" >/dev/null
[[ $(cat "$ACTIVATION_LOG") == \
   "$RUNTIME_CONTROL_TARGET_SHA false true" ]]
[[ $(cat "$STATE/control.sha") == "$RUNTIME_CONTROL_TARGET_SHA" ]]

# The next target is intentionally invalid: it combines another daily runtime
# asset with a controller-library change. The bridge-current process must fail
# before any runtime-control snapshot or activation.
printf '# incompatible controller mutation\n' >> \
  "$REPO/ops/deploy/deploy-control-lib.sh"
printf '# incompatible daily mutation\n' >> \
  "$REPO/ops/deploy/production-runtime/daily-run.sh"
git -C "$REPO" add ops/deploy/deploy-control-lib.sh \
  ops/deploy/production-runtime/daily-run.sh
git -C "$REPO" commit -qm 'test: reject combined control activation'
git -C "$REPO" push -q origin HEAD:main
INCOMPATIBLE_TARGET_SHA=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" checkout -q "$RUNTIME_CONTROL_TARGET_SHA"
for component in frontend backend control; do
  printf '%s\n' "$RUNTIME_CONTROL_TARGET_SHA" > "$STATE/$component.sha"
done
rm -f "$ACTIVATION_LOG"
set +e
incompatible_error=$(
  ENTRYPOINT="$ENTRYPOINT" ACTIVATION_LOG="$ACTIVATION_LOG" \
  INCOMPATIBLE_TARGET_SHA="$INCOMPATIBLE_TARGET_SHA" \
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
  SOCIAL_MONITOR_DEPLOY_REPO="$REPO" \
  SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
  SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
  SOCIAL_MONITOR_DEPLOY_STAGING="$STAGING" \
    bash -c '
      source "$ENTRYPOINT"
      sync_control_script() { :; }
      commit_postgres_pool_bootstrap() { :; }
      snapshot_postgres_runtime_control() {
        : > "$ACTIVATION_LOG"
        return 99
      }
      deploy_release "$INCOMPATIBLE_TARGET_SHA"
    ' 2>&1
)
incompatible_status=$?
set -e
((incompatible_status != 0))
grep -F 'deploy the bridge release first' <<< "$incompatible_error" >/dev/null
[[ ! -e $ACTIVATION_LOG ]]
[[ $(git -C "$REPO" rev-parse HEAD) == "$RUNTIME_CONTROL_TARGET_SHA" ]]

RELEASE_FIXTURE=$FIXTURE/frontend-release
install -d "$RELEASE_FIXTURE/public" "$RELEASE_FIXTURE/admin"
printf '<html>public</html>\n' > "$RELEASE_FIXTURE/public/index.html"
printf '<html>admin</html>\n' > "$RELEASE_FIXTURE/admin/index.html"
printf 'https://social-monitor.app\n' > "$RELEASE_FIXTURE/public/main.dart.js"
printf 'https://admin.social-monitor.app\n' > "$RELEASE_FIXTURE/admin/main.dart.js"
printf 'self.registration.unregister()\n' > "$RELEASE_FIXTURE/public/flutter_service_worker.js"
printf 'self.registration.unregister()\n' > "$RELEASE_FIXTURE/admin/flutter_service_worker.js"
printf '%s\n' "$TARGET_SHA" > "$RELEASE_FIXTURE/public/release-sha.txt"
printf '%s\n' "$TARGET_SHA" > "$RELEASE_FIXTURE/admin/release-sha.txt"
COPYFILE_DISABLE=1 tar -C "$RELEASE_FIXTURE" -czf "$FIXTURE/frontend.tgz" public admin
run_entrypoint upload "$TARGET_SHA" < "$FIXTURE/frontend.tgz" >/dev/null
[[ $(cat "$STAGING/$TARGET_SHA/frontend/READY") == "$TARGET_SHA" ]]

BAD_FIXTURE=$FIXTURE/bad-release
install -d "$BAD_FIXTURE/public" "$BAD_FIXTURE/admin"
ln -s /etc/passwd "$BAD_FIXTURE/public/escape"
COPYFILE_DISABLE=1 tar -C "$BAD_FIXTURE" -czf "$FIXTURE/bad-frontend.tgz" public admin
rm -rf "$STAGING/$TARGET_SHA/frontend"
if run_entrypoint upload "$TARGET_SHA" < "$FIXTURE/bad-frontend.tgz" >/dev/null 2>&1; then
  echo 'unsafe frontend archive was accepted' >&2
  exit 1
fi

echo 'Production deploy contract tests passed'
bash "$SCRIPT_DIR/postgres-runtime-deploy-lib.test.sh"
bash "$SCRIPT_DIR/verify-postgres-runtime-topology.test.sh"
bash "$SCRIPT_DIR/refresh-codex-auth.test.sh"
bash "$SCRIPT_DIR/prune-pre-autodeploy-backups.test.sh"
bash "$SCRIPT_DIR/verify-postgres-backup-coverage.test.sh"
