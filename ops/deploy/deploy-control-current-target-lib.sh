#!/usr/bin/env bash
# A fresh ordinary retry already loaded the exact authenticated target. The
# historical bridge mistakes target=current for its first bootstrap and tries
# to source readonly B0 functions again. Preserve its checks for all transitions;
# for this identity case prove all loaded/installed control blobs instead.
deploy_control_verify_loaded_current_target() {
  local target=$1 path index=0 variable expected actual mode
  [[ $target == "${PRODUCTION_TRANSITION_PRELUDE_COMMIT:-}" && \
     $target == "${DEPLOY_CONTROL_BRIDGE_INITIALIZED_HEAD:-}" && \
     $target == "$(git -C "$REPO" rev-parse --verify 'HEAD^{commit}')" ]] || return 1
  local -a digest_keys=(ENTRYPOINT LIBRARY POSTGRES_LIBRARY POSTGRES_WEEKLY_TIMER_HELPER \
    POSTGRES_DAILY_C1_HELPER POSTGRES_ACTIVATION_BOUNDARY_HELPER \
    RECOVERY_MAINTENANCE_LIBRARY IMAGE_RESCUE_LIBRARY IMAGE_RESCUE_PIN_CLEANUP_LIBRARY \
    X_IMAGE_LIBRARY SELF)
  while IFS= read -r path; do
    ((index < ${#digest_keys[@]})) || fail 'current target control path count differs'
    mode=$(deploy_control_bridge_git_regular_blob "$target" "$path" 'current target control')
    verify_postgres_pool_bootstrap_recovery_file "$target" "$path" "$REPO/$path" \
      'current target control'
    [[ $(stat -c '%a' "$REPO/$path") == "${mode#100}" ]] || \
      fail 'current target control mode differs'
    expected=$(deploy_control_git_blob_digest "$target" "$path")
    variable=DEPLOY_CONTROL_BRIDGE_${digest_keys[$index]}_DIGEST
    actual=${!variable:-}
    [[ $expected == "$actual" ]] || fail 'current target differs from initialized control'
    index=$((index + 1))
  done < <(deploy_control_bridge_sealed_paths)
  ((index == ${#digest_keys[@]})) || fail 'current target control path set is incomplete'
}

deploy_control_install_current_target_checks() {
  local definition
  definition=$(declare -f verify_deploy_control_bridge_target_compatibility)
  definition=${definition/verify_deploy_control_bridge_target_compatibility/deploy_control_legacy_target_compatibility}
  eval "$definition"
  definition=$(declare -f verify_deploy_control_bridge_compatibility)
  definition=${definition/verify_deploy_control_bridge_compatibility/deploy_control_legacy_runtime_compatibility}
  eval "$definition"
  verify_deploy_control_bridge_target_compatibility() {
    if deploy_control_verify_loaded_current_target "$1"; then return 0; fi
    deploy_control_legacy_target_compatibility "$@"
  }
  verify_deploy_control_bridge_compatibility() {
    local current
    current=$(git -C "$REPO" rev-parse --verify 'HEAD^{commit}') || \
      fail 'current target identity is unavailable'
    if deploy_control_verify_loaded_current_target "$current"; then return 0; fi
    deploy_control_legacy_runtime_compatibility "$@"
  }
}
