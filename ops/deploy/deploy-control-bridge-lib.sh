#!/usr/bin/env bash

# Sourced by deploy-control-lib.sh after the deploy entrypoint has defined
# REPO and fail(). Release A installs this bridge before a later RabbitMQ
# quorum release can replace backend health behavior.

DEPLOY_CONTROL_BRIDGE_ENTRYPOINT_PATH=ops/deploy/social-monitor-production-deploy.sh
DEPLOY_CONTROL_BRIDGE_LIBRARY_PATH=ops/deploy/deploy-control-lib.sh
DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_PATH=ops/deploy/postgres-runtime-deploy-lib.sh
DEPLOY_CONTROL_BRIDGE_POSTGRES_WEEKLY_TIMER_HELPER_PATH=ops/deploy/postgres-runtime-weekly-timer-state-lib.sh
DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_PATH=ops/deploy/postgres-runtime-daily-c1-readiness-lib.sh
DEPLOY_CONTROL_BRIDGE_POSTGRES_ACTIVATION_BOUNDARY_HELPER_PATH=ops/deploy/postgres-runtime-activation-boundary-lib.sh
DEPLOY_CONTROL_BRIDGE_RECOVERY_MAINTENANCE_LIBRARY_PATH=ops/deploy/reader-summary-recovery-maintenance-lib.sh
DEPLOY_CONTROL_BRIDGE_IMAGE_RESCUE_LIBRARY_PATH=ops/deploy/backend-image-rescue-lib.sh
DEPLOY_CONTROL_BRIDGE_X_IMAGE_LIBRARY_PATH=ops/deploy/x-collector-image-deploy-lib.sh
DEPLOY_CONTROL_BRIDGE_SELF_PATH=ops/deploy/deploy-control-bridge-lib.sh
DEPLOY_CONTROL_DAILY_FINAL_BASE=d494c143c242873bfac53f54c15b0f24df0ab33d
DEPLOY_CONTROL_DAILY_FINAL_HELPER_BLOB=119726c2f2aff06798cade4dc3a127f24a2d2cc9
DEPLOY_CONTROL_SCHEDULED_SUMMARY_CATCH_UP_BASE=e377453d5b440aacc8077e8af1345eb5a74aae7b
DEPLOY_CONTROL_ROLLING_SUMMARY_FINAL_TREE=6a68fd8f88477811e220c042d5176e452241389f
DEPLOY_CONTROL_DAILY_RECOVERY_BASE=cb1595d9bdca844d6a221d21fd3c53e6845cc4cf
DEPLOY_CONTROL_DAILY_RECOVERY_BACKEND_RESCUE_BLOB=a4291fad8b1f36f0cbb0760f3dbca6e7603138bc
DEPLOY_CONTROL_DAILY_RECOVERY_MIGRATE_TEST_BLOB=f62a83ce95cc768c4e888e7c576bad3bd6fdbced
DEPLOY_CONTROL_DAILY_RECOVERY_CLIENT_BLOB=5539203fb8204b8ba230bf5dd5cfb0035329cc71
DEPLOY_CONTROL_DAILY_RECOVERY_CLIENT_TEST_BLOB=1d9306b3cba76fba5c04709c69e3cf692236b3cb
DEPLOY_CONTROL_DAILY_RECOVERY_RUNNER_BLOB=524a2d6105439de397a67411f01ee5f6373e13f5
DEPLOY_CONTROL_DAILY_RECOVERY_RUNNER_TEST_BLOB=74550928c6606304410386a5075806ec1b8559f3
DEPLOY_CONTROL_DAILY_RECOVERY_MAINTENANCE_BLOB=128a43549f117b0c934c91270581080a72d7c7b8
DEPLOY_CONTROL_DAILY_RECOVERY_ENTRYPOINT_BLOB=3e6fa93501ee56b392618c319ec554dd99d5c4fd
DEPLOY_CONTROL_DAILY_RECOVERY_SSH_WRAPPER_BLOB=bb0792969f366393f0ad126441bc722f8fcc6ff9
DEPLOY_CONTROL_DAILY_RECOVERY_SSH_TEST_BLOB=1fda773628cfabc4d3bed779352391d5fd11016c
DEPLOY_CONTROL_DAILY_RECOVERY_ABSENT_TEST_BLOB=bf9ad2356276d469aef3d493d2a238ef40422f60
DEPLOY_CONTROL_DAILY_RECOVERY_ARTIFACTS_BLOB=85fdf0ef6d217eded040313a3c80117ef552bc04
DEPLOY_CONTROL_DAILY_RECOVERY_HISTORY_BLOB=a3bae65e501a59401bfc4c72163e1580b471c142
DEPLOY_CONTROL_DAILY_RECOVERY_HISTORY_TEST_BLOB=c7307f3e2808d02207ce8b8a62624271cc90caa7
RABBITMQ_QUORUM_HEALTH_LIBRARY_PATH=ops/deploy/backend-runtime-health-lib.sh
RABBITMQ_QUORUM_HEALTH_SCRIPT_PATH=ops/deploy/rabbitmq-quorum-health.sh
RABBITMQ_QUORUM_RECOVERY_SCRIPT_PATH=ops/deploy/rabbitmq-quorum-recovery.sh

deploy_control_bridge_sealed_paths() {
  printf '%s\n' \
    "$DEPLOY_CONTROL_BRIDGE_ENTRYPOINT_PATH" \
    "$DEPLOY_CONTROL_BRIDGE_LIBRARY_PATH" \
    "$DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_PATH" \
    "$DEPLOY_CONTROL_BRIDGE_POSTGRES_WEEKLY_TIMER_HELPER_PATH" \
    "$DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_PATH" \
    "$DEPLOY_CONTROL_BRIDGE_POSTGRES_ACTIVATION_BOUNDARY_HELPER_PATH" \
    "$DEPLOY_CONTROL_BRIDGE_RECOVERY_MAINTENANCE_LIBRARY_PATH" \
    "$DEPLOY_CONTROL_BRIDGE_IMAGE_RESCUE_LIBRARY_PATH" \
    "$DEPLOY_CONTROL_BRIDGE_X_IMAGE_LIBRARY_PATH" \
    "$DEPLOY_CONTROL_BRIDGE_SELF_PATH"
}

deploy_control_daily_c1_bridge_release_paths() {
  printf '%s\n' \
    .github/workflows/production-deploy.yml \
    ops/deploy/daily-c1-control-bridge-workflow.test.sh \
    ops/deploy/daily-runner-image-bootstrap-lib.sh \
    ops/deploy/daily-runner-image-bootstrap-lib.test.sh \
    ops/deploy/deploy-control-bridge-lib.sh \
    ops/deploy/deploy-control-bridge-runtime-helper.test.sh \
    ops/deploy/deploy-control-lib-test-fixture.sh \
    ops/deploy/deploy-control-lib.sh \
    ops/deploy/deploy-control-lib.test.sh \
    ops/deploy/deploy-control-reviewed-library-source.test.sh \
    ops/deploy/postgres-runtime-activation-boundary-lib.sh \
    ops/deploy/postgres-runtime-daily-c1-readiness-lib.sh \
    ops/deploy/postgres-runtime-deploy-lib.sh \
    ops/deploy/postgres-runtime-weekly-timer-state-lib.sh \
    ops/deploy/production-release-a-transition.sh \
    ops/deploy/production-release-a-transition.test.sh \
    ops/deploy/reader-summary-publication-deploy-lib.sh \
    ops/deploy/reader-summary-recovery-maintenance-lib.sh \
    ops/deploy/social-monitor-production-deploy.sh \
    ops/deploy/x-collector-image-deploy-lib.test.sh
}

deploy_control_is_exact_daily_c1_bridge_release() {
  local base=$1 target=$2 repository=${REPO:-.}
  local expected actual

  git -C "$repository" merge-base --is-ancestor "$base" "$target" || return 1
  expected=$(deploy_control_daily_c1_bridge_release_paths | LC_ALL=C sort)
  actual=$(git -C "$repository" diff --name-only --no-renames \
    "$base" "$target" -- | LC_ALL=C sort)
  [[ $actual == "$expected" ]]
}

deploy_control_daily_c1_bridge_classification() {
  printf 'frontend=false\nbackend=false\ncontrol=true\n'
}

deploy_control_is_reviewed_daily_final_transition() {
  local bridge=$1 target=$2 repository=${REPO:-.}
  local target_parent changed final_delta path
  local -a sealed_paths=() target_ancestry=()
  target_parent=$(git -C "$repository" rev-parse "$target^" 2>/dev/null) || return 1
  read -r -a target_ancestry <<< "$(git -C "$repository" \
    rev-list --parents -n 1 "$target")" || return 1
  git -C "$repository" cat-file -e \
    "$DEPLOY_CONTROL_DAILY_FINAL_BASE^{commit}" 2>/dev/null || return 1
  git -C "$repository" merge-base --is-ancestor \
    "$DEPLOY_CONTROL_DAILY_FINAL_BASE" "$bridge" 2>/dev/null || return 1
  [[ $target_parent == "$bridge" && ${#target_ancestry[@]} == 2 ]] || return 1
  final_delta=$(git -C "$repository" diff --name-only --no-renames \
    "$DEPLOY_CONTROL_DAILY_FINAL_BASE" "$target" -- 2>/dev/null) || return 1
  [[ $final_delta == $'ops/deploy/daily-final-control-bridge.test.sh\nops/deploy/deploy-control-bridge-lib.sh' ]] || return 1
  while IFS= read -r path; do sealed_paths+=("$path"); done < <(deploy_control_bridge_sealed_paths)
  changed=$(git -C "$repository" diff --name-only --no-renames \
    "$bridge" "$target" -- "${sealed_paths[@]}" 2>/dev/null) || return 1
  [[ $changed == "$DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_PATH" &&
     $(git -C "$repository" rev-parse \
       "$target:$DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_PATH" 2>/dev/null) == \
       "$DEPLOY_CONTROL_DAILY_FINAL_HELPER_BLOB" ]]
}

deploy_control_daily_recovery_release_blobs() {
  printf '%s %s\n' \
    "$DEPLOY_CONTROL_DAILY_RECOVERY_BACKEND_RESCUE_BLOB" ops/deploy/backend-image-rescue-lib.sh \
    "$DEPLOY_CONTROL_DAILY_RECOVERY_MIGRATE_TEST_BLOB" ops/deploy/backend-image-rescue-migrate-fallback.test.sh \
    "$DEPLOY_CONTROL_DAILY_RECOVERY_ABSENT_TEST_BLOB" ops/deploy/backend-image-rescue-absent-service.test.sh \
    "$DEPLOY_CONTROL_DAILY_RECOVERY_CLIENT_BLOB" ops/deploy/github-production-deploy-client.sh \
    "$DEPLOY_CONTROL_DAILY_RECOVERY_CLIENT_TEST_BLOB" ops/deploy/github-production-deploy-client.test.sh \
    "$DEPLOY_CONTROL_DAILY_RECOVERY_ARTIFACTS_BLOB" ops/deploy/production-runtime/compose.daily-artifacts.yml \
    "$DEPLOY_CONTROL_DAILY_RECOVERY_RUNNER_BLOB" ops/deploy/production-runtime/daily-run.sh \
    "$DEPLOY_CONTROL_DAILY_RECOVERY_RUNNER_TEST_BLOB" ops/deploy/production-runtime/daily-run.test.sh \
    "$DEPLOY_CONTROL_DAILY_RECOVERY_MAINTENANCE_BLOB" ops/deploy/reader-summary-recovery-maintenance-lib.sh \
    "$DEPLOY_CONTROL_DAILY_RECOVERY_HISTORY_BLOB" ops/deploy/run-reader-summary-production-history.sh \
    "$DEPLOY_CONTROL_DAILY_RECOVERY_HISTORY_TEST_BLOB" ops/deploy/run-reader-summary-production-history.test.sh \
    "$DEPLOY_CONTROL_DAILY_RECOVERY_ENTRYPOINT_BLOB" ops/deploy/social-monitor-production-deploy.sh \
    "$DEPLOY_CONTROL_DAILY_RECOVERY_SSH_WRAPPER_BLOB" ops/deploy/social-monitor-production-ssh-wrapper.sh \
    "$DEPLOY_CONTROL_DAILY_RECOVERY_SSH_TEST_BLOB" ops/deploy/social-monitor-production-ssh-wrapper.test.sh
}

deploy_control_is_reviewed_daily_recovery_transition() {
  local bridge=$1 target=$2 repository=${REPO:-.}
  local target_parent bridge_delta expected actual expected_blob path
  local -a target_ancestry=()

  git -C "$repository" cat-file -e \
    "$DEPLOY_CONTROL_DAILY_RECOVERY_BASE^{commit}" 2>/dev/null || return 1
  target_parent=$(git -C "$repository" rev-parse "$target^" 2>/dev/null) || return 1
  read -r -a target_ancestry <<< "$(git -C "$repository" \
    rev-list --parents -n 1 "$target" 2>/dev/null)" || return 1
  [[ $target_parent == "$bridge" && ${#target_ancestry[@]} == 2 ]] || return 1
  bridge_delta=$(git -C "$repository" diff --name-only --no-renames \
    "$DEPLOY_CONTROL_DAILY_RECOVERY_BASE" "$bridge" -- 2>/dev/null) || return 1
  [[ $bridge_delta == $'ops/deploy/daily-final-control-bridge.test.sh\nops/deploy/deploy-control-bridge-lib.sh' ]] || return 1
  expected=$(deploy_control_daily_recovery_release_blobs | awk '{ print $2 }' | LC_ALL=C sort)
  actual=$(git -C "$repository" diff --name-only --no-renames \
    "$bridge" "$target" -- 2>/dev/null | LC_ALL=C sort) || return 1
  [[ $actual == "$expected" ]] || return 1
  while read -r expected_blob path; do
    [[ $(git -C "$repository" rev-parse "$target:$path" 2>/dev/null) == \
       "$expected_blob" ]] || return 1
  done < <(deploy_control_daily_recovery_release_blobs)
}

deploy_control_is_reviewed_scheduled_summary_catch_up_transition() {
  local bridge=$1 target=$2 repository=${REPO:-.}
  local target_parent final_delta
  local -a target_ancestry=()

  git -C "$repository" cat-file -e \
    "$DEPLOY_CONTROL_SCHEDULED_SUMMARY_CATCH_UP_BASE^{commit}" \
    2>/dev/null || return 1
  target_parent=$(git -C "$repository" rev-parse "$target^" 2>/dev/null) || \
    return 1
  read -r -a target_ancestry <<< "$(git -C "$repository" \
    rev-list --parents -n 1 "$target" 2>/dev/null)" || return 1
  git -C "$repository" merge-base --is-ancestor \
    "$DEPLOY_CONTROL_SCHEDULED_SUMMARY_CATCH_UP_BASE" "$bridge" \
    2>/dev/null || return 1
  [[ $target_parent == "$bridge" && ${#target_ancestry[@]} == 2 ]] || \
    return 1
  final_delta=$(git -C "$repository" diff --name-only --no-renames \
    "$DEPLOY_CONTROL_SCHEDULED_SUMMARY_CATCH_UP_BASE" "$target" -- \
    2>/dev/null) || return 1
  [[ $final_delta == $'ops/deploy/daily-final-control-bridge.test.sh\nops/deploy/deploy-control-bridge-lib.sh' ]] || \
    return 1
  [[ $(git -C "$repository" rev-parse \
       "$bridge:ops/deploy/daily-final-control-bridge.test.sh" 2>/dev/null) == \
       $(git -C "$repository" rev-parse \
       "$target:ops/deploy/daily-final-control-bridge.test.sh" 2>/dev/null) && \
     $(git -C "$repository" rev-parse \
       "$bridge:$DEPLOY_CONTROL_BRIDGE_SELF_PATH" 2>/dev/null) == \
       $(git -C "$repository" rev-parse \
       "$target:$DEPLOY_CONTROL_BRIDGE_SELF_PATH" 2>/dev/null) ]]
}

deploy_control_is_reviewed_rolling_summary_transition() {
  local bridge=$1 target=$2 repository=${REPO:-.}
  local target_parent final_delta
  local -a target_ancestry=()

  git -C "$repository" cat-file -e \
    "$DEPLOY_CONTROL_ROLLING_SUMMARY_FINAL_TREE^{commit}" \
    2>/dev/null || return 1
  target_parent=$(git -C "$repository" rev-parse "$target^" \
    2>/dev/null) || return 1
  read -r -a target_ancestry <<< "$(git -C "$repository" \
    rev-list --parents -n 1 "$target" 2>/dev/null)" || return 1
  git -C "$repository" merge-base --is-ancestor \
    "$DEPLOY_CONTROL_ROLLING_SUMMARY_FINAL_TREE" "$target" \
    2>/dev/null || return 1
  [[ $target_parent == "$bridge" && ${#target_ancestry[@]} == 2 ]] || \
    return 1
  final_delta=$(git -C "$repository" diff --name-only --no-renames \
    "$DEPLOY_CONTROL_ROLLING_SUMMARY_FINAL_TREE" "$target" -- \
    2>/dev/null) || return 1
  [[ $final_delta == "$DEPLOY_CONTROL_BRIDGE_SELF_PATH" && \
     $(git -C "$repository" rev-parse \
       "$bridge:$DEPLOY_CONTROL_BRIDGE_SELF_PATH" 2>/dev/null) == \
       $(git -C "$repository" rev-parse \
       "$target:$DEPLOY_CONTROL_BRIDGE_SELF_PATH" 2>/dev/null) ]]
}

deploy_control_reviewed_transition_matches() {
  local bridge=$1 target=$2
  if deploy_control_daily_final_transition_matches "$bridge" "$target"; then
    return 0
  fi
  if deploy_control_is_reviewed_scheduled_summary_catch_up_transition \
      "$bridge" "$target"; then
    return 0
  fi
  if deploy_control_is_reviewed_rolling_summary_transition \
      "$bridge" "$target"; then
    return 0
  fi
  deploy_control_is_reviewed_daily_recovery_transition "$bridge" "$target"
}

deploy_control_daily_final_transition_compatible_paths() {
  printf '%s\n' \
    "$DEPLOY_CONTROL_BRIDGE_ENTRYPOINT_PATH" \
    "$DEPLOY_CONTROL_BRIDGE_LIBRARY_PATH" \
    "$DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_PATH" \
    "$DEPLOY_CONTROL_BRIDGE_POSTGRES_WEEKLY_TIMER_HELPER_PATH" \
    "$DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_PATH" \
    "$DEPLOY_CONTROL_BRIDGE_POSTGRES_ACTIVATION_BOUNDARY_HELPER_PATH" \
    "$DEPLOY_CONTROL_BRIDGE_RECOVERY_MAINTENANCE_LIBRARY_PATH" \
    "$DEPLOY_CONTROL_BRIDGE_IMAGE_RESCUE_LIBRARY_PATH" \
    "$DEPLOY_CONTROL_BRIDGE_X_IMAGE_LIBRARY_PATH"
}

deploy_control_daily_final_transition_matches() {
  local bridge=$1 target=$2 path
  deploy_control_is_reviewed_daily_final_transition "$bridge" "$target" || return 1
  while IFS= read -r path; do
    [[ $path == "$DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_PATH" ]] && continue
    [[ $(git -C "$REPO" rev-parse "$bridge:$path" 2>/dev/null) == \
       $(git -C "$REPO" rev-parse "$target:$path" 2>/dev/null) ]] || return 1
  done < <(deploy_control_daily_final_transition_compatible_paths)
}

verify_deploy_control_daily_final_transition_files() {
  local target=$1 path actual expected
  deploy_control_reviewed_transition_matches \
    "$DEPLOY_CONTROL_BRIDGE_INITIALIZED_HEAD" "$target" || return 1
  while IFS= read -r path; do
    actual=$(deploy_control_file_digest "$REPO/$path") || return 1
    expected=$(deploy_control_git_blob_digest "$target" "$path") || return 1
    [[ $actual == "$expected" ]] || return 1
  done < <(deploy_control_bridge_sealed_paths)
}

load_target_reader_summary_publication_deploy_library() {
  local sha=$1
  local relative_path=ops/deploy/reader-summary-publication-deploy-lib.sh
  local publication_library=$REPO/$relative_path
  local repository_root publication_real mode reviewed_digest actual_digest
  local target_entry target_mode target_type target_object target_path

  repository_root=$(readlink -f "$REPO") || \
    fail 'integration repository path cannot be resolved'
  [[ -f $publication_library && ! -L $publication_library ]] || \
    fail 'target publication deploy library is not a regular non-symlink file'
  publication_real=$(readlink -f "$publication_library") || \
    fail 'target publication deploy library path cannot be resolved'
  [[ $publication_real == "$repository_root/"* ]] || \
    fail 'target publication deploy library is outside integration'
  [[ -r $publication_real ]] || \
    fail 'target publication deploy library is unreadable'
  mode=$(stat -c '%A' "$publication_real") || \
    fail 'target publication deploy library mode cannot be read'
  [[ ${mode:1:1} == r || ${mode:4:1} == r || ${mode:7:1} == r ]] || \
    fail 'target publication deploy library is unreadable'
  target_entry=$(git -C "$REPO" ls-tree "$sha" -- "$relative_path") || \
    fail 'target commit publication deploy library cannot be inspected'
  read -r target_mode target_type target_object target_path <<< "$target_entry"
  [[ ($target_mode == 100644 || $target_mode == 100755) && \
     $target_type == blob && $target_object =~ ^[0-9a-f]+$ && \
     $target_path == "$relative_path" ]] || \
    fail 'target commit publication deploy library is not a regular blob'
  reviewed_digest=$(deploy_control_git_blob_digest "$sha" "$relative_path") || \
    fail 'target commit is missing the publication deploy library'
  actual_digest=$(deploy_control_file_digest "$publication_real") || \
    fail 'target publication deploy library digest cannot be read'
  [[ $actual_digest == "$reviewed_digest" ]] || \
    fail 'target publication deploy library differs from reviewed target'
  ! declare -F deploy_reader_summary_publication_migrations >/dev/null || \
    fail 'publication migration entrypoint was loaded before target validation'
  # The bridge release deliberately lacks this target-only source file.
  # shellcheck source=/dev/null
  source "$publication_real" || \
    fail 'target publication deploy library could not be loaded'
  declare -F deploy_reader_summary_publication_migrations >/dev/null || \
    fail 'target publication deploy library is missing its migration entrypoint'
}

deploy_control_bridge_file_identity() {
  [[ -f $1 && ! -L $1 ]] || return 1
  stat -c '%d:%i:%f:%s:%y:%z' "$1"
}

deploy_control_bridge_git_regular_blob() {
  local sha=$1 relative_path=$2 label=$3
  local entry mode type object tree_path extra

  entry=$(git -C "$REPO" ls-tree "$sha" -- "$relative_path") || \
    fail "$label cannot be inspected at reviewed target"
  read -r mode type object tree_path extra <<< "$entry"
  [[ -z ${extra:-} && \
     ($mode == 100644 || $mode == 100755) && \
     $type == blob && $object =~ ^[0-9a-f]+$ && \
     $tree_path == "$relative_path" ]] || \
    fail "$label is not a regular blob at reviewed target"
  printf '%s\n' "$mode"
}

deploy_control_bridge_require_initialized() {
  [[ -n ${DEPLOY_CONTROL_BRIDGE_ENTRYPOINT_DIGEST:-} && \
     -n ${DEPLOY_CONTROL_BRIDGE_LIBRARY_DIGEST:-} && \
     -n ${DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_DIGEST:-} && \
     -n ${DEPLOY_CONTROL_BRIDGE_POSTGRES_WEEKLY_TIMER_HELPER_DIGEST:-} && \
     -n ${DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_DIGEST:-} && \
     -n ${DEPLOY_CONTROL_BRIDGE_POSTGRES_ACTIVATION_BOUNDARY_HELPER_DIGEST:-} && \
     -n ${DEPLOY_CONTROL_BRIDGE_RECOVERY_MAINTENANCE_LIBRARY_DIGEST:-} && \
     -n ${DEPLOY_CONTROL_BRIDGE_IMAGE_RESCUE_LIBRARY_DIGEST:-} && \
     -n ${DEPLOY_CONTROL_BRIDGE_X_IMAGE_LIBRARY_DIGEST:-} && \
     -n ${DEPLOY_CONTROL_BRIDGE_SELF_DIGEST:-} ]] || \
    fail 'deploy control bridge was not initialized before verification'
}

initialize_deploy_control_bridge() {
  local entrypoint=$REPO/$DEPLOY_CONTROL_BRIDGE_ENTRYPOINT_PATH
  local deploy_library=$REPO/$DEPLOY_CONTROL_BRIDGE_LIBRARY_PATH
  local postgres_library=$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_PATH
  local weekly_timer_helper=$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_WEEKLY_TIMER_HELPER_PATH
  local daily_c1_helper=$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_PATH
  local activation_boundary_helper=$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_ACTIVATION_BOUNDARY_HELPER_PATH
  local recovery_maintenance_library=$REPO/$DEPLOY_CONTROL_BRIDGE_RECOVERY_MAINTENANCE_LIBRARY_PATH
  local image_rescue_library=$REPO/$DEPLOY_CONTROL_BRIDGE_IMAGE_RESCUE_LIBRARY_PATH
  local x_image_library=$REPO/$DEPLOY_CONTROL_BRIDGE_X_IMAGE_LIBRARY_PATH
  local bridge_library=$REPO/$DEPLOY_CONTROL_BRIDGE_SELF_PATH

  [[ -f $entrypoint && ! -L $entrypoint && \
     -f $deploy_library && ! -L $deploy_library && \
     -f $postgres_library && ! -L $postgres_library && \
     -f $weekly_timer_helper && ! -L $weekly_timer_helper && \
     -f $daily_c1_helper && ! -L $daily_c1_helper && \
     -f $activation_boundary_helper && ! -L $activation_boundary_helper && \
     -f $recovery_maintenance_library && ! -L $recovery_maintenance_library && \
     -f $image_rescue_library && ! -L $image_rescue_library && \
     -f $x_image_library && ! -L $x_image_library && \
     -f $bridge_library && ! -L $bridge_library ]] || \
    fail 'current integration is missing deploy control bridge sources'
  DEPLOY_CONTROL_BRIDGE_ENTRYPOINT_DIGEST=$(deploy_control_file_digest "$entrypoint")
  DEPLOY_CONTROL_BRIDGE_LIBRARY_DIGEST=$(deploy_control_file_digest "$deploy_library")
  DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_DIGEST=$(deploy_control_file_digest "$postgres_library")
  DEPLOY_CONTROL_BRIDGE_POSTGRES_WEEKLY_TIMER_HELPER_DIGEST=$(deploy_control_file_digest "$weekly_timer_helper")
  DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_DIGEST=$(deploy_control_file_digest "$daily_c1_helper")
  DEPLOY_CONTROL_BRIDGE_POSTGRES_ACTIVATION_BOUNDARY_HELPER_DIGEST=$(deploy_control_file_digest "$activation_boundary_helper")
  DEPLOY_CONTROL_BRIDGE_RECOVERY_MAINTENANCE_LIBRARY_DIGEST=$(deploy_control_file_digest "$recovery_maintenance_library")
  DEPLOY_CONTROL_BRIDGE_IMAGE_RESCUE_LIBRARY_DIGEST=$(deploy_control_file_digest "$image_rescue_library")
  DEPLOY_CONTROL_BRIDGE_X_IMAGE_LIBRARY_DIGEST=$(deploy_control_file_digest "$x_image_library")
  DEPLOY_CONTROL_BRIDGE_SELF_DIGEST=$(deploy_control_file_digest "$bridge_library")
  DEPLOY_CONTROL_BRIDGE_INITIALIZED_HEAD=$(git -C "$REPO" rev-parse HEAD) || \
    fail 'deploy control bridge integration marker cannot be read'
}

verify_deploy_control_bridge_compatibility() {
  local entrypoint=$REPO/$DEPLOY_CONTROL_BRIDGE_ENTRYPOINT_PATH
  local deploy_library=$REPO/$DEPLOY_CONTROL_BRIDGE_LIBRARY_PATH
  local postgres_library=$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_PATH
  local weekly_timer_helper=$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_WEEKLY_TIMER_HELPER_PATH
  local daily_c1_helper=$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_PATH
  local activation_boundary_helper=$REPO/$DEPLOY_CONTROL_BRIDGE_POSTGRES_ACTIVATION_BOUNDARY_HELPER_PATH
  local recovery_maintenance_library=$REPO/$DEPLOY_CONTROL_BRIDGE_RECOVERY_MAINTENANCE_LIBRARY_PATH
  local image_rescue_library=$REPO/$DEPLOY_CONTROL_BRIDGE_IMAGE_RESCUE_LIBRARY_PATH
  local x_image_library=$REPO/$DEPLOY_CONTROL_BRIDGE_X_IMAGE_LIBRARY_PATH
  local bridge_library=$REPO/$DEPLOY_CONTROL_BRIDGE_SELF_PATH

  deploy_control_bridge_require_initialized
  [[ -f $entrypoint && ! -L $entrypoint && \
     -f $deploy_library && ! -L $deploy_library && \
     -f $postgres_library && ! -L $postgres_library && \
     -f $weekly_timer_helper && ! -L $weekly_timer_helper && \
     -f $daily_c1_helper && ! -L $daily_c1_helper && \
     -f $activation_boundary_helper && ! -L $activation_boundary_helper && \
     -f $recovery_maintenance_library && ! -L $recovery_maintenance_library && \
     -f $image_rescue_library && ! -L $image_rescue_library && \
     -f $x_image_library && ! -L $x_image_library && \
     -f $bridge_library && ! -L $bridge_library ]] || \
    fail 'target integration is missing deploy control bridge sources'
  if verify_deploy_control_daily_final_transition_files \
      "$(git -C "$REPO" rev-parse HEAD)"; then
    return 0
  fi
  [[ $(deploy_control_file_digest "$entrypoint") == "$DEPLOY_CONTROL_BRIDGE_ENTRYPOINT_DIGEST" && \
     $(deploy_control_file_digest "$deploy_library") == "$DEPLOY_CONTROL_BRIDGE_LIBRARY_DIGEST" && \
     $(deploy_control_file_digest "$postgres_library") == "$DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_DIGEST" && \
     $(deploy_control_file_digest "$weekly_timer_helper") == "$DEPLOY_CONTROL_BRIDGE_POSTGRES_WEEKLY_TIMER_HELPER_DIGEST" && \
     $(deploy_control_file_digest "$daily_c1_helper") == "$DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_DIGEST" && \
     $(deploy_control_file_digest "$activation_boundary_helper") == "$DEPLOY_CONTROL_BRIDGE_POSTGRES_ACTIVATION_BOUNDARY_HELPER_DIGEST" && \
     $(deploy_control_file_digest "$recovery_maintenance_library") == "$DEPLOY_CONTROL_BRIDGE_RECOVERY_MAINTENANCE_LIBRARY_DIGEST" && \
     $(deploy_control_file_digest "$image_rescue_library") == "$DEPLOY_CONTROL_BRIDGE_IMAGE_RESCUE_LIBRARY_DIGEST" && \
     $(deploy_control_file_digest "$x_image_library") == "$DEPLOY_CONTROL_BRIDGE_X_IMAGE_LIBRARY_DIGEST" && \
     $(deploy_control_file_digest "$bridge_library") == "$DEPLOY_CONTROL_BRIDGE_SELF_DIGEST" ]] || \
    fail 'deploy control changed with backend or runtime assets; deploy the bridge release first'
}

verify_deploy_control_bridge_target_compatibility() {
  local sha=$1
  local entrypoint_digest deploy_library_digest postgres_library_digest
  local weekly_timer_helper_digest daily_c1_helper_digest
  local activation_boundary_helper_digest recovery_maintenance_library_digest
  local image_rescue_library_digest x_image_library_digest bridge_library_digest

  deploy_control_bridge_require_initialized
  deploy_control_bridge_git_regular_blob "$sha" \
    "$DEPLOY_CONTROL_BRIDGE_ENTRYPOINT_PATH" 'target deploy entrypoint bridge' >/dev/null
  deploy_control_bridge_git_regular_blob "$sha" \
    "$DEPLOY_CONTROL_BRIDGE_LIBRARY_PATH" 'target deploy control bridge library' >/dev/null
  deploy_control_bridge_git_regular_blob "$sha" \
    "$DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_PATH" 'target PostgreSQL control bridge library' >/dev/null
  deploy_control_bridge_git_regular_blob "$sha" \
    "$DEPLOY_CONTROL_BRIDGE_POSTGRES_WEEKLY_TIMER_HELPER_PATH" 'target PostgreSQL weekly timer state helper' >/dev/null
  deploy_control_bridge_git_regular_blob "$sha" \
    "$DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_PATH" 'target PostgreSQL daily C1 readiness helper' >/dev/null
  deploy_control_bridge_git_regular_blob "$sha" \
    "$DEPLOY_CONTROL_BRIDGE_POSTGRES_ACTIVATION_BOUNDARY_HELPER_PATH" 'target PostgreSQL activation boundary helper' >/dev/null
  deploy_control_bridge_git_regular_blob "$sha" \
    "$DEPLOY_CONTROL_BRIDGE_RECOVERY_MAINTENANCE_LIBRARY_PATH" 'target reader summary recovery maintenance library' >/dev/null
  deploy_control_bridge_git_regular_blob "$sha" \
    "$DEPLOY_CONTROL_BRIDGE_IMAGE_RESCUE_LIBRARY_PATH" 'target backend image rescue bridge library' >/dev/null
  deploy_control_bridge_git_regular_blob "$sha" \
    "$DEPLOY_CONTROL_BRIDGE_X_IMAGE_LIBRARY_PATH" 'target X image provenance bridge library' >/dev/null
  deploy_control_bridge_git_regular_blob "$sha" \
    "$DEPLOY_CONTROL_BRIDGE_SELF_PATH" 'target deploy control bridge library' >/dev/null
  entrypoint_digest=$(deploy_control_git_blob_digest "$sha" "$DEPLOY_CONTROL_BRIDGE_ENTRYPOINT_PATH") || \
    fail 'target integration is missing the deploy entrypoint bridge'
  deploy_library_digest=$(deploy_control_git_blob_digest "$sha" "$DEPLOY_CONTROL_BRIDGE_LIBRARY_PATH") || \
    fail 'target integration is missing the deploy control bridge library'
  postgres_library_digest=$(deploy_control_git_blob_digest "$sha" "$DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_PATH") || \
    fail 'target integration is missing the PostgreSQL control bridge library'
  weekly_timer_helper_digest=$(deploy_control_git_blob_digest "$sha" "$DEPLOY_CONTROL_BRIDGE_POSTGRES_WEEKLY_TIMER_HELPER_PATH") || \
    fail 'target integration is missing the PostgreSQL weekly timer state helper'
  daily_c1_helper_digest=$(deploy_control_git_blob_digest "$sha" "$DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_PATH") || \
    fail 'target integration is missing the PostgreSQL daily C1 readiness helper'
  activation_boundary_helper_digest=$(deploy_control_git_blob_digest "$sha" "$DEPLOY_CONTROL_BRIDGE_POSTGRES_ACTIVATION_BOUNDARY_HELPER_PATH") || \
    fail 'target integration is missing the PostgreSQL activation boundary helper'
  recovery_maintenance_library_digest=$(deploy_control_git_blob_digest "$sha" "$DEPLOY_CONTROL_BRIDGE_RECOVERY_MAINTENANCE_LIBRARY_PATH") || \
    fail 'target integration is missing the reader summary recovery maintenance library'
  image_rescue_library_digest=$(deploy_control_git_blob_digest "$sha" "$DEPLOY_CONTROL_BRIDGE_IMAGE_RESCUE_LIBRARY_PATH") || \
    fail 'target integration is missing the backend image rescue bridge library'
  x_image_library_digest=$(deploy_control_git_blob_digest "$sha" "$DEPLOY_CONTROL_BRIDGE_X_IMAGE_LIBRARY_PATH") || \
    fail 'target integration is missing the X image provenance bridge library'
  bridge_library_digest=$(deploy_control_git_blob_digest "$sha" "$DEPLOY_CONTROL_BRIDGE_SELF_PATH") || \
    fail 'target integration is missing the deploy control bridge library'
  if deploy_control_reviewed_transition_matches \
      "$DEPLOY_CONTROL_BRIDGE_INITIALIZED_HEAD" "$sha"; then
    return 0
  fi
  [[ $entrypoint_digest == "$DEPLOY_CONTROL_BRIDGE_ENTRYPOINT_DIGEST" && \
     $deploy_library_digest == "$DEPLOY_CONTROL_BRIDGE_LIBRARY_DIGEST" && \
     $postgres_library_digest == "$DEPLOY_CONTROL_BRIDGE_POSTGRES_LIBRARY_DIGEST" && \
     $weekly_timer_helper_digest == "$DEPLOY_CONTROL_BRIDGE_POSTGRES_WEEKLY_TIMER_HELPER_DIGEST" && \
     $daily_c1_helper_digest == "$DEPLOY_CONTROL_BRIDGE_POSTGRES_DAILY_C1_HELPER_DIGEST" && \
     $activation_boundary_helper_digest == "$DEPLOY_CONTROL_BRIDGE_POSTGRES_ACTIVATION_BOUNDARY_HELPER_DIGEST" && \
     $recovery_maintenance_library_digest == "$DEPLOY_CONTROL_BRIDGE_RECOVERY_MAINTENANCE_LIBRARY_DIGEST" && \
     $image_rescue_library_digest == "$DEPLOY_CONTROL_BRIDGE_IMAGE_RESCUE_LIBRARY_DIGEST" && \
     $x_image_library_digest == "$DEPLOY_CONTROL_BRIDGE_X_IMAGE_LIBRARY_DIGEST" && \
     $bridge_library_digest == "$DEPLOY_CONTROL_BRIDGE_SELF_DIGEST" ]] || \
    fail 'deploy control changed with backend or runtime assets; deploy the bridge release first'
}

verify_target_rabbitmq_quorum_asset() {
  local sha=$1 relative_path=$2 label=$3 required_target_mode=$4
  local repository_root actual_path actual_real target_mode actual_mode
  local reviewed_digest actual_digest identity_before identity_after

  repository_root=$(readlink -f -- "$REPO") || \
    fail 'integration repository path cannot be resolved for RabbitMQ quorum assets'
  actual_path=$REPO/$relative_path
  [[ -f $actual_path && ! -L $actual_path ]] || \
    fail "$label is not a regular non-symlink file"
  actual_real=$(readlink -f -- "$actual_path") || \
    fail "$label path cannot be resolved"
  [[ $actual_real == "$repository_root/$relative_path" ]] || \
    fail "$label is outside its canonical integration path"
  identity_before=$(deploy_control_bridge_file_identity "$actual_real") || \
    fail "$label identity cannot be inventoried"
  target_mode=$(deploy_control_bridge_git_regular_blob "$sha" "$relative_path" "$label")
  [[ $target_mode == "$required_target_mode" ]] || \
    fail "$label committed target Git mode must be $required_target_mode"
  actual_mode=$(stat -c '%a' "$actual_real") || fail "$label mode cannot be read"
  [[ $actual_mode == "${required_target_mode#100}" ]] || \
    fail "$label mode does not match its target Git mode"
  reviewed_digest=$(deploy_control_git_blob_digest "$sha" "$relative_path") || \
    fail "$label digest cannot be read at reviewed target"
  actual_digest=$(deploy_control_file_digest "$actual_real") || \
    fail "$label digest cannot be read"
  identity_after=$(deploy_control_bridge_file_identity "$actual_real") || \
    fail "$label identity cannot be re-inventoried"
  [[ $identity_after == "$identity_before" ]] || \
    fail "$label changed while being verified"
  [[ $actual_digest == "$reviewed_digest" ]] || \
    fail "$label differs from reviewed target"
}

load_target_rabbitmq_quorum_backend_health() {
  local sha=$1 health_library=$REPO/$RABBITMQ_QUORUM_HEALTH_LIBRARY_PATH

  [[ $sha =~ ^[0-9a-f]{40}$ ]] || \
    fail 'target RabbitMQ quorum health SHA is invalid'
  verify_target_rabbitmq_quorum_asset "$sha" \
    "$RABBITMQ_QUORUM_HEALTH_LIBRARY_PATH" 'target backend health library' 100644
  verify_target_rabbitmq_quorum_asset "$sha" \
    "$RABBITMQ_QUORUM_HEALTH_SCRIPT_PATH" 'target RabbitMQ quorum health script' 100755
  verify_target_rabbitmq_quorum_asset "$sha" \
    "$RABBITMQ_QUORUM_RECOVERY_SCRIPT_PATH" 'target RabbitMQ quorum recovery script' 100755
  unset -f verify_backend verify_backend_with_retry
  # shellcheck source=/dev/null
  source "$health_library" || fail 'target backend health library could not be loaded'
  declare -F verify_backend >/dev/null || \
    fail 'target backend health library is missing its verification entrypoint'
  declare -F verify_backend_with_retry >/dev/null || \
    fail 'target backend health library is missing its retry entrypoint'
}
