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
grep -F 'http://127.0.0.1:13080/auth/session' "$ENTRYPOINT" >/dev/null
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
bootstrap_commit_line=$(grep -nF 'commit_postgres_pool_bootstrap "$sha"' \
  "$ENTRYPOINT" | cut -d: -f1)
# shellcheck disable=SC2016
control_marker_line=$(grep -nF 'printf '\''%s\n'\'' "$sha" > "$STATE/control.sha.next"' \
  "$ENTRYPOINT" | cut -d: -f1)
((entrypoint_sync_line < bootstrap_commit_line))
((bootstrap_commit_line < control_marker_line))

grep -F 'activate_postgres_runtime_control "$sha"' "$ENTRYPOINT" >/dev/null
grep -F 'snapshot_postgres_runtime_control "$sha"' "$ENTRYPOINT" >/dev/null
grep -F 'restore_postgres_runtime_control "$runtime_control_backup"' \
  "$ENTRYPOINT" >/dev/null
grep -F 'rollback_backend_images "$previous_images"' "$ENTRYPOINT" >/dev/null
grep -F 'verify_live_postgres_admission "$postgres_env"' "$ENTRYPOINT" >/dev/null
grep -F 'probe_postgres_maximum_envelope "$postgres_env"' "$ENTRYPOINT" >/dev/null
grep -F "'externalConnectionOccupancy'" \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
grep -F "'stoppedRuntimeConnectionOccupancy'" \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
grep -F 'capture_backend_soak_baseline' \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
grep -F 'verify_backend_soak_logs' "$ENTRYPOINT" >/dev/null
grep -F 'verify_ingestion_queue_recovery' "$ENTRYPOINT" >/dev/null
grep -F 'verify-postgres-runtime-topology.py' "$ENTRYPOINT" >/dev/null
grep -F 'install -m 0644 "$source/social-monitor-prod.service"' \
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
