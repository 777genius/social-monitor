#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/deploy-control-bridge-helper-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT
REPO=$FIXTURE/repo

install -d "$REPO/ops/deploy"
bridge_sources=(
  social-monitor-production-deploy.sh
  deploy-control-lib.sh
  deploy-control-bridge-lib.sh
  postgres-runtime-deploy-lib.sh
  postgres-runtime-weekly-timer-state-lib.sh
  postgres-runtime-daily-c1-readiness-lib.sh
  postgres-runtime-activation-boundary-lib.sh
  reader-summary-recovery-maintenance-lib.sh
  backend-image-rescue-lib.sh
  x-collector-image-deploy-lib.sh
)
for source_name in "${bridge_sources[@]}"; do
  cp "$SCRIPT_DIR/$source_name" "$REPO/ops/deploy/$source_name"
done

git -C "$REPO" init -q
git -C "$REPO" config user.email deploy-control-bridge-test@example.invalid
git -C "$REPO" config user.name deploy-control-bridge-test
git -C "$REPO" add ops/deploy
git -C "$REPO" commit -qm 'test: seed reviewed bridge sources'
reviewed_sha=$(git -C "$REPO" rev-parse HEAD)

fail() {
  printf 'test deploy failure: %s\n' "$*" >&2
  exit 1
}

deploy_control_file_digest() {
  sha256sum "$1" | awk '{print $1}'
}

deploy_control_git_blob_digest() {
  git -C "$REPO" show "$1:$2" | sha256sum | awk '{print $1}'
}

# shellcheck source=ops/deploy/deploy-control-bridge-lib.sh
source "$SCRIPT_DIR/deploy-control-bridge-lib.sh"

assert_fails_with() {
  local expected=$1
  shift
  local error status

  set +e
  error=$("$@" 2>&1)
  status=$?
  set -e
  ((status != 0))
  grep -F "$expected" <<< "$error" >/dev/null
}

restore_helper() {
  cp "$SCRIPT_DIR/${1##*/}" "$REPO/$1"
}

initialize_deploy_control_bridge
[[ -n $DEPLOY_CONTROL_BRIDGE_POSTGRES_WEEKLY_TIMER_HELPER_DIGEST ]]
[[ -n $DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_DIGEST ]]
[[ -n $DEPLOY_CONTROL_BRIDGE_POSTGRES_ACTIVATION_BOUNDARY_HELPER_DIGEST ]]
[[ -n $DEPLOY_CONTROL_BRIDGE_RECOVERY_MAINTENANCE_LIBRARY_DIGEST ]]
verify_deploy_control_bridge_compatibility
verify_deploy_control_bridge_target_compatibility "$reviewed_sha"

sealed_dependencies=(
  ops/deploy/postgres-runtime-weekly-timer-state-lib.sh
  ops/deploy/postgres-runtime-daily-c1-readiness-lib.sh
  ops/deploy/postgres-runtime-activation-boundary-lib.sh
  ops/deploy/reader-summary-recovery-maintenance-lib.sh
)
for dependency in "${sealed_dependencies[@]}"; do
  rm "$REPO/$dependency"
  assert_fails_with 'missing deploy control bridge sources' \
    initialize_deploy_control_bridge
  assert_fails_with 'missing deploy control bridge sources' \
    verify_deploy_control_bridge_compatibility
  restore_helper "$dependency"

  mv "$REPO/$dependency" "$FIXTURE/sealed-dependency-source"
  ln -s "$FIXTURE/sealed-dependency-source" "$REPO/$dependency"
  assert_fails_with 'missing deploy control bridge sources' \
    initialize_deploy_control_bridge
  assert_fails_with 'missing deploy control bridge sources' \
    verify_deploy_control_bridge_compatibility
  rm "$REPO/$dependency"
  mv "$FIXTURE/sealed-dependency-source" "$REPO/$dependency"

  printf '# unreviewed sealed dependency mutation\n' >> "$REPO/$dependency"
  assert_fails_with 'deploy the bridge release first' \
    verify_deploy_control_bridge_compatibility
  restore_helper "$dependency"
done

# Existing bridge dependencies stay sealed alongside the new helpers.
printf '# unreviewed PostgreSQL controller mutation\n' >> \
  "$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_PATH"
assert_fails_with 'deploy the bridge release first' \
  verify_deploy_control_bridge_compatibility
cp "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" \
  "$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_PATH"

commit_target_state() {
  local message=$1
  git -C "$REPO" add -A
  git -C "$REPO" commit -qm "$message"
  git -C "$REPO" rev-parse HEAD
}

for dependency in "${sealed_dependencies[@]}"; do
  rm "$REPO/$dependency"
  missing_sha=$(commit_target_state 'test: remove sealed runtime helper')
  assert_fails_with 'is not a regular blob at reviewed target' \
    verify_deploy_control_bridge_target_compatibility "$missing_sha"
  restore_helper "$dependency"
  commit_target_state 'test: restore sealed runtime helper' >/dev/null

  mv "$REPO/$dependency" "$FIXTURE/sealed-dependency-source"
  ln -s "$FIXTURE/sealed-dependency-source" "$REPO/$dependency"
  symlink_sha=$(commit_target_state 'test: replace sealed runtime helper with symlink')
  assert_fails_with 'is not a regular blob at reviewed target' \
    verify_deploy_control_bridge_target_compatibility "$symlink_sha"
  rm "$REPO/$dependency"
  mv "$FIXTURE/sealed-dependency-source" "$REPO/$dependency"
  commit_target_state 'test: restore regular sealed runtime helper' >/dev/null

  printf '# changed reviewed target dependency\n' >> "$REPO/$dependency"
  changed_sha=$(commit_target_state 'test: change sealed runtime helper')
  assert_fails_with 'deploy the bridge release first' \
    verify_deploy_control_bridge_target_compatibility "$changed_sha"
  restore_helper "$dependency"
  commit_target_state 'test: restore exact sealed runtime helper' >/dev/null
done

printf '# changed reviewed PostgreSQL controller\n' >> \
  "$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_PATH"
changed_postgres_sha=$(commit_target_state 'test: change existing sealed dependency')
assert_fails_with 'deploy the bridge release first' \
  verify_deploy_control_bridge_target_compatibility "$changed_postgres_sha"
cp "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" \
  "$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_PATH"
commit_target_state 'test: restore existing sealed dependency' >/dev/null

verify_deploy_control_bridge_compatibility
verify_deploy_control_bridge_target_compatibility "$reviewed_sha"

printf '# reviewed readiness-only transition\n' >> \
  "$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_PATH"
readiness_parent=$(git -C "$REPO" rev-parse HEAD)
readiness_sha=$(commit_target_state 'test: readiness-only transition')
git -C "$REPO" checkout -q "$readiness_parent"
verify_deploy_control_bridge_target_compatibility "$readiness_sha"

printf '# reviewed exact bridge transition\n' >> \
  "$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_PATH"
printf '# reviewed exact bridge transition\n' >> \
  "$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_PATH"
reviewed_bridge_parent=$(git -C "$REPO" rev-parse HEAD)
reviewed_bridge_sha=$(commit_target_state 'test: reviewed exact bridge transition')
git -C "$REPO" checkout -q "$reviewed_bridge_parent"
deploy_control_is_reviewed_daily_c1_bridge_transition() {
  [[ $1 == "$reviewed_bridge_parent" && $2 == "$reviewed_bridge_sha" ]]
}
verify_deploy_control_bridge_target_compatibility "$reviewed_bridge_sha"
printf 'deploy control bridge runtime helper tests passed\n'
