#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/daily-final-bridge.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT
REPO=$FIXTURE/repo

fail() { printf 'daily-final-bridge-test-error: %s\n' "$*" >&2; exit 1; }
deploy_control_file_digest() { sha256sum "$1" | awk '{ print $1 }'; }
deploy_control_git_blob_digest() {
  git -C "$REPO" show "$1:$2" | sha256sum | awk '{ print $1 }'
}
# shellcheck source=ops/deploy/deploy-control-bridge-lib.sh
source "$SCRIPT_DIR/deploy-control-bridge-lib.sh"

git init -q -b main "$REPO"
git -C "$REPO" config user.name test
git -C "$REPO" config user.email test@example.invalid
mkdir -p "$REPO/ops/deploy"
while IFS= read -r path; do
  mkdir -p "$REPO/$(dirname "$path")"
  printf 'anchor %s\n' "$path" > "$REPO/$path"
done < <(deploy_control_bridge_sealed_paths)
printf 'final helper\n' > \
  "$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_PATH"
git -C "$REPO" add .
git -C "$REPO" commit -qm anchor
anchor=$(git -C "$REPO" rev-parse HEAD)
DEPLOY_CONTROL_DAILY_FINAL_BASE=$anchor

printf 'bridge policy\n' > "$REPO/$DEPLOY_CONTROL_BRIDGE_SELF_PATH"
printf 'bridge helper\n' > \
  "$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_PATH"
printf 'reviewed bridge fixture\n' > \
  "$REPO/ops/deploy/daily-final-control-bridge.test.sh"
printf 'bridge-only rollback fixture\n' > "$REPO/bridge-only"
git -C "$REPO" add .
git -C "$REPO" commit -qm bridge
bridge=$(git -C "$REPO" rev-parse HEAD)

git -C "$REPO" checkout -qb final-base "$bridge"
git -C "$REPO" rm -q bridge-only
git -C "$REPO" show \
  "$anchor:$DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_PATH" > \
  "$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_PATH"
git -C "$REPO" add .
git -C "$REPO" commit -qm final-base
target=$(git -C "$REPO" rev-parse HEAD)
DEPLOY_CONTROL_DAILY_FINAL_HELPER_BLOB=$(git -C "$REPO" rev-parse \
  "$target:$DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_PATH")
DEPLOY_CONTROL_DAILY_FINAL_BASE=$anchor

deploy_control_is_reviewed_daily_final_transition "$bridge" "$target" || \
  fail 'reviewed linear bridge transition was rejected'
DEPLOY_CONTROL_BRIDGE_INITIALIZED_HEAD=$bridge
deploy_control_daily_final_transition_matches "$bridge" "$target" || \
  fail 'reviewed sealed-path transition was rejected'
verify_deploy_control_daily_final_transition_files "$target" || \
  fail 'reviewed transition filesystem was rejected'

printf 'tampered helper\n' >> \
  "$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_PATH"
if verify_deploy_control_daily_final_transition_files "$target"; then
  fail 'tampered transition filesystem was admitted'
fi
git -C "$REPO" restore --source="$target" -- \
  "$DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_PATH"

printf 'drift\n' >> "$REPO/$DEPLOY_CONTROL_BRIDGE_LIBRARY_PATH"
git -C "$REPO" add .
git -C "$REPO" commit -qm drift
drift=$(git -C "$REPO" rev-parse HEAD)
if deploy_control_is_reviewed_daily_final_transition "$bridge" "$drift"; then
  fail 'drifted target was admitted'
fi

git -C "$REPO" checkout -q main
while read -r _ path; do
  mkdir -p "$REPO/$(dirname "$path")"
  printf 'recovery base %s\n' "$path" > "$REPO/$path"
done < <(deploy_control_daily_recovery_release_blobs)
git -C "$REPO" add .
git -C "$REPO" commit -qm recovery-base
recovery_base=$(git -C "$REPO" rev-parse HEAD)
DEPLOY_CONTROL_DAILY_RECOVERY_BASE=$recovery_base

printf 'recovery bridge policy\n' > "$REPO/$DEPLOY_CONTROL_BRIDGE_SELF_PATH"
printf 'recovery bridge fixture\n' > \
  "$REPO/ops/deploy/daily-final-control-bridge.test.sh"
git -C "$REPO" add .
git -C "$REPO" commit -qm recovery-bridge
recovery_bridge=$(git -C "$REPO" rev-parse HEAD)

while read -r _ path; do
  printf 'reviewed recovery %s\n' "$path" > "$REPO/$path"
done < <(deploy_control_daily_recovery_release_blobs)
git -C "$REPO" add .
git -C "$REPO" commit -qm recovery-target
recovery_target=$(git -C "$REPO" rev-parse HEAD)

deploy_control_daily_recovery_release_blobs() {
  local path
  git -C "$REPO" diff --name-only --no-renames \
    "$recovery_bridge" "$recovery_target" -- | while IFS= read -r path; do
    printf '%s %s\n' "$(git -C "$REPO" rev-parse "$recovery_target:$path")" "$path"
  done
}

deploy_control_is_reviewed_daily_recovery_transition \
  "$recovery_bridge" "$recovery_target" || \
  fail 'reviewed daily recovery transition was rejected'
DEPLOY_CONTROL_BRIDGE_INITIALIZED_HEAD=$recovery_bridge
verify_deploy_control_daily_final_transition_files "$recovery_target" || \
  fail 'reviewed daily recovery filesystem was rejected'

printf 'unexpected recovery drift\n' > "$REPO/unreviewed"
git -C "$REPO" add .
git -C "$REPO" commit -qm recovery-drift
recovery_drift=$(git -C "$REPO" rev-parse HEAD)
if deploy_control_is_reviewed_daily_recovery_transition \
    "$recovery_bridge" "$recovery_drift"; then
  fail 'daily recovery transition admitted an extra path'
fi

printf 'daily final control bridge tests passed\n'
