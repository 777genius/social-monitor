#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
SOURCE_REPO=${PRODUCTION_PACKAGING_TEST_SOURCE_REPO:-$PROJECT_ROOT}
BASE=50a377f2b56bd71558c676ffc1c7d92cc6535619
PHASE_C=13f62fa628a9efe297577d87e915caf5facd6732
TARGET=${PRODUCTION_PACKAGING_TARGET_SHA:-$(git -C "$SOURCE_REPO" rev-parse HEAD)}
ENTRYPOINT=ops/deploy/social-monitor-production-deploy.sh
CLASSIFIER=ops/deploy/production-component-classification-lib.sh
FIXTURE=$(mktemp -d /tmp/social-monitor-packaging-topology.XXXXXX)
trap 'rm -rf "$FIXTURE"' EXIT
REPO=$FIXTURE/repo
ROOT=$FIXTURE/root
CONTROL=$ROOT/control
STATE=$CONTROL/deploy-state
STAGING=$ROOT/runtime/deploy-staging
RELEASES=$ROOT/runtime/frontend-releases
SEQUENCE_LOG=$FIXTURE/sequence.log

for commit in "$BASE" "$PHASE_C" "$TARGET"; do
  git -C "$SOURCE_REPO" cat-file -e "$commit^{commit}"
done

read -r -a phase_c_parents <<< "$(
  git -C "$SOURCE_REPO" rev-list --parents -n 1 "$PHASE_C"
)"
[[ ${#phase_c_parents[@]} == 2 && ${phase_c_parents[1]} == "$BASE" ]]
expected_c_paths=$(printf '%s\n' \
  ops/deploy/daily-runner-image-bootstrap-deploy.test.sh \
  ops/deploy/postgres-pool-bootstrap-transition.test.sh \
  ops/deploy/postgres-pool-bootstrap-transition.test-support.sh \
  ops/deploy/production-component-classification-lib.sh \
  ops/deploy/production-component-classification.test.sh \
  ops/deploy/production-release-a-transition.test.sh \
  ops/deploy/reader-summary-publication-migrator-validation.test-support.sh \
  ops/deploy/reader-summary-publication-migrator-validation.test.sh \
  ops/deploy/social-monitor-production-deploy.sh \
  ops/deploy/social-monitor-production-deploy.test.sh | LC_ALL=C sort)
actual_c_paths=$(git -C "$SOURCE_REPO" diff --name-only --no-renames \
  "$BASE" "$PHASE_C" -- | LC_ALL=C sort)
[[ $actual_c_paths == "$expected_c_paths" ]]
if grep -Ev '^ops/deploy/' <<< "$actual_c_paths"; then
  echo 'Phase C contains a non-control path' >&2
  exit 1
fi
[[ $(git -C "$SOURCE_REPO" show "$PHASE_C:$ENTRYPOINT" | wc -l) -lt 1000 ]]
[[ $(git -C "$SOURCE_REPO" ls-tree "$PHASE_C" -- "$CLASSIFIER" |
      awk '{ print $1, $2 }') == '100644 blob' ]]

read -r -a target_parents <<< "$(
  git -C "$SOURCE_REPO" rev-list --parents -n 1 "$TARGET"
)"
[[ ${#target_parents[@]} == 2 && ${target_parents[1]} == "$PHASE_C" ]]
expected_d_paths=$(printf '%s\n' \
  .github/workflows/pull-request.yml \
  Dockerfile \
  ops/deploy/production-packaging-two-phase-topology.test.sh \
  ops/deploy/production-scripts-only-transaction.test.sh \
  ops/deploy/rabbitmq-quorum-deploy-bridge-transition.test.sh \
  package.json \
  scripts/check-container.mjs \
  scripts/check-feed-promotion-index-recovery.ts \
  scripts/check-feed-promotion-migration-contract.mjs \
  scripts/check-migration-image-runtime.mjs \
  scripts/check-source-line-cap.mjs | LC_ALL=C sort)
actual_d_paths=$(git -C "$SOURCE_REPO" diff --name-only --no-renames \
  "$PHASE_C" "$TARGET" -- | LC_ALL=C sort)
[[ $actual_d_paths == "$expected_d_paths" ]]
git -C "$SOURCE_REPO" diff --quiet "$PHASE_C" "$TARGET" -- \
  "$ENTRYPOINT" "$CLASSIFIER"

git clone -q --shared "$SOURCE_REPO" "$REPO"
git -C "$REPO" update-ref refs/remotes/origin/main "$TARGET"
git -C "$REPO" checkout -q "$BASE"
install -d "$STATE" "$STAGING" "$RELEASES"
for component in frontend backend control; do
  printf '%s\n' "$BASE" > "$STATE/$component.sha"
done
git -C "$REPO" show "$BASE:$ENTRYPOINT" > "$FIXTURE/base-entrypoint.sh"
chmod 0755 "$FIXTURE/base-entrypoint.sh"

ENTRYPOINT_FILE=$FIXTURE/base-entrypoint.sh \
TARGET_SHA=$PHASE_C SEQUENCE_LOG=$SEQUENCE_LOG \
SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
SOCIAL_MONITOR_DEPLOY_ROOT=$ROOT \
SOCIAL_MONITOR_DEPLOY_REPO=$REPO \
SOCIAL_MONITOR_DEPLOY_CONTROL=$CONTROL \
SOCIAL_MONITOR_DEPLOY_STATE=$STATE \
SOCIAL_MONITOR_DEPLOY_STAGING=$STAGING \
SOCIAL_MONITOR_DEPLOY_RELEASES=$RELEASES \
  bash -c '
    set -euo pipefail
    source "$ENTRYPOINT_FILE"
    postgres_pool_atomic_legacy_state() { return 1; }
    fetch_main() { :; }
    postgres_pool_bootstrap_installed() { return 0; }
    reconcile_completed_backend_image_rescues() { :; }
    sync_control_script() { printf "phase-c:sync\n" >> "$SEQUENCE_LOG"; }
    deploy_release_runtime_transaction() {
      [[ $1 == "$TARGET_SHA" && $2 == false && $3 == false ]]
      printf "phase-c:runtime:false:false\n" >> "$SEQUENCE_LOG"
    }
    commit_postgres_pool_bootstrap() {
      printf "phase-c:bootstrap\n" >> "$SEQUENCE_LOG"
    }
    output=$(deploy_release "$TARGET_SHA")
    grep -Fx "deployed=$TARGET_SHA frontend=false backend=false control=true" \
      <<< "$output" >/dev/null
  '
[[ $(git -C "$REPO" rev-parse HEAD) == "$PHASE_C" ]]
[[ $(< "$STATE/control.sha") == "$PHASE_C" ]]
[[ $(< "$SEQUENCE_LOG") == \
   $'phase-c:sync\nphase-c:runtime:false:false\nphase-c:bootstrap' ]]

: > "$SEQUENCE_LOG"
ENTRYPOINT_FILE=$REPO/$ENTRYPOINT TARGET_SHA=$TARGET \
PHASE_C=$PHASE_C SEQUENCE_LOG=$SEQUENCE_LOG \
SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
SOCIAL_MONITOR_DEPLOY_ROOT=$ROOT \
SOCIAL_MONITOR_DEPLOY_REPO=$REPO \
SOCIAL_MONITOR_DEPLOY_CONTROL=$CONTROL \
SOCIAL_MONITOR_DEPLOY_STATE=$STATE \
SOCIAL_MONITOR_DEPLOY_STAGING=$STAGING \
SOCIAL_MONITOR_DEPLOY_RELEASES=$RELEASES \
  bash -c '
    set -euo pipefail
    source "$ENTRYPOINT_FILE"
    git -C "$REPO" checkout -qb invalid-packaging-controller "$PHASE_C"
    printf "\n# invalid sealed controller mutation\n" >> \
      "$REPO/ops/deploy/social-monitor-production-deploy.sh"
    git -C "$REPO" add ops/deploy/social-monitor-production-deploy.sh
    git -C "$REPO" -c user.name=Topology -c user.email=topology@example.invalid \
      commit -qm invalid-controller
    invalid=$(git -C "$REPO" rev-parse HEAD)
    git -C "$REPO" checkout -q "$PHASE_C"
    if (verify_deploy_control_bridge_target_compatibility "$invalid" \
        >/dev/null 2>&1); then
      echo "Phase C controller admitted sealed-path drift" >&2
      exit 1
    fi
    verify_deploy_control_bridge_target_compatibility "$TARGET_SHA"
    postgres_pool_atomic_legacy_state() { return 1; }
    fetch_main() { :; }
    postgres_pool_bootstrap_installed() { return 0; }
    reconcile_completed_backend_image_rescues() { :; }
    load_target_rabbitmq_quorum_backend_health() { :; }
    load_target_reader_summary_publication_deploy_library() { :; }
    sync_control_script() { printf "phase-d:sync\n" >> "$SEQUENCE_LOG"; }
    deploy_release_runtime_transaction() {
      [[ $1 == "$TARGET_SHA" && $2 == true && $3 == false ]]
      printf "phase-d:runtime:true:false\n" >> "$SEQUENCE_LOG"
    }
    commit_postgres_pool_bootstrap() {
      printf "phase-d:bootstrap\n" >> "$SEQUENCE_LOG"
    }
    output=$(deploy_release "$TARGET_SHA")
    grep -Fx "deployed=$TARGET_SHA frontend=false backend=true control=true" \
      <<< "$output" >/dev/null
  '
[[ $(git -C "$REPO" rev-parse HEAD) == "$TARGET" ]]
[[ $(< "$STATE/control.sha") == "$TARGET" ]]
[[ $(< "$SEQUENCE_LOG") == \
   $'phase-d:sync\nphase-d:runtime:true:false\nphase-d:bootstrap' ]]

echo 'Production packaging two-phase topology tests passed'
