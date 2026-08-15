#!/usr/bin/env bash

# Sourced by social-monitor-production-deploy.sh after its project paths and
# fail helper are defined. Keeping the transaction here preserves the root
# entrypoint's source-line cap without making this file independently runnable.

ROOT=${ROOT:?caller must define ROOT before sourcing postgres-runtime-deploy-lib.sh}
load_postgres_runtime_reviewed_helper() {
  local relative_path=$1 label=$2 helper entry mode type object tree_path
  local reviewed_digest actual_digest
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 || \
        ${POSTGRES_RUNTIME_DAILY_C1_HELPER_TEST_MODE:-} == 1 ]]; then
    helper=${BASH_SOURCE[0]%/*}/${relative_path##*/}
  else
    helper=$REPO/$relative_path
    [[ -f $helper && ! -L $helper ]] || \
      fail "$label is not a regular non-symlink file"
    entry=$(git -C "$REPO" ls-tree HEAD -- "$relative_path") || \
      fail "$label cannot be inspected at current HEAD"
    read -r mode type object tree_path <<< "$entry"
    [[ $mode == 100644 && $type == blob && $object =~ ^[0-9a-f]+$ && \
       $tree_path == "$relative_path" ]] || \
      fail "$label is not a regular blob at current HEAD"
    reviewed_digest=$(git -C "$REPO" show "HEAD:$relative_path" | \
      sha256sum | awk '{print $1}')
    actual_digest=$(sha256sum "$helper" | awk '{print $1}')
    [[ $actual_digest == "$reviewed_digest" ]] || \
      fail "$label differs from current HEAD"
  fi
  [[ -f $helper && ! -L $helper ]] || \
    fail "$label is not a regular non-symlink file"
  # shellcheck source=/dev/null
  source "$helper"
}
load_postgres_runtime_reviewed_helper \
  ops/deploy/postgres-runtime-weekly-timer-state-lib.sh \
  'weekly timer state helper'
load_postgres_runtime_reviewed_helper \
  ops/deploy/postgres-runtime-daily-c1-readiness-lib.sh \
  'daily C1 readiness helper'
load_postgres_runtime_reviewed_helper \
  ops/deploy/postgres-runtime-activation-boundary-lib.sh \
  'PostgreSQL runtime activation boundary helper'
unset -f load_postgres_runtime_reviewed_helper

postgres_runtime_control_mutation_scope() {
  local source_mode current_mode=absent
  source_mode=$(
    github_premidnight_capture_marker_mode \
      "$REPO/ops/deploy/production-runtime"
  ) || return
  if [[ -e $POSTGRES_RUNTIME_CURRENT || -L $POSTGRES_RUNTIME_CURRENT ]]; then
    current_mode=$(
      github_premidnight_capture_marker_mode "$POSTGRES_RUNTIME_CURRENT"
    ) || return
  fi
  if [[ $source_mode == absent && $current_mode != absent ]]; then
    fail 'GitHub pre-midnight activation marker cannot be removed'
    return 1
  fi
  if [[ $source_mode == install-disabled && $current_mode == enable-now ]]; then
    fail 'GitHub pre-midnight activation marker cannot disable an activated timer'
    return 1
  fi
  if [[ $source_mode != "$current_mode" && $source_mode != absent ]]; then
    if postgres_runtime_base_control_matches_source; then
      printf 'capture-only\n'
    else
      printf 'full\n'
    fi
  elif [[ $source_mode != absent ]]; then
    printf 'full\n'
  else
    printf 'base\n'
  fi
}

postgres_runtime_base_control_matches_source() {
  local source=$REPO/ops/deploy/production-runtime launcher unit
  local -a launchers units
  mapfile -t launchers < <(
    postgres_runtime_control_launchers_for_scope base
  )
  mapfile -t units < <(postgres_runtime_control_units_for_scope base)
  for launcher in "${launchers[@]}"; do
    cmp -s "$source/$launcher" "$CONTROL/$launcher" || return 1
  done
  for unit in "${units[@]}"; do
    cmp -s "$source/$unit" "$SYSTEMD_UNIT_DIR/$unit" || return 1
  done
}

postgres_runtime_control_units_for_scope() {
  case $1 in
    base)
      printf '%s\n' \
        social-monitor-daily.service \
        social-monitor-daily.timer \
        social-monitor-prod.service \
        social-monitor-rolling.service \
        social-monitor-rolling.timer \
        social-monitor-weekly.service \
        social-monitor-weekly.timer
      ;;
    capture-only)
      printf '%s\n' \
        social-monitor-github-premidnight-capture-v1.service \
        social-monitor-github-premidnight-capture-v1.timer
      ;;
    full)
      printf '%s\n' \
        social-monitor-github-premidnight-capture-v1.service \
        social-monitor-github-premidnight-capture-v1.timer \
        social-monitor-daily.service \
        social-monitor-daily.timer \
        social-monitor-prod.service \
        social-monitor-rolling.service \
        social-monitor-rolling.timer \
        social-monitor-weekly.service \
        social-monitor-weekly.timer
      ;;
    *)
      fail 'PostgreSQL runtime-control mutation scope is invalid'
      return 1
      ;;
  esac
}

postgres_runtime_control_launchers_for_scope() {
  case $1 in
    base) printf '%s\n' daily-run.sh rolling-run.sh ;;
    capture-only) printf '%s\n' github-premidnight-capture-v1.sh ;;
    full)
      printf '%s\n' daily-run.sh github-premidnight-capture-v1.sh rolling-run.sh
      ;;
    *)
      fail 'PostgreSQL runtime-control launcher scope is invalid'
      return 1
      ;;
  esac
}

require_postgres_runtime_regular_source() {
  local path=$1
  local expected_mode=$2
  [[ -f $path && ! -L $path ]] || {
    fail "PostgreSQL runtime source is not a regular file: $path"
    return 1
  }
  [[ $(stat -c '%a' "$path") == "$expected_mode" ]] || {
    fail "PostgreSQL runtime source mode is invalid: $path"
    return 1
  }
}

require_postgres_runtime_regular_release_file() {
  local path=$1
  local expected_mode=${2:-}
  [[ -f $path && ! -L $path ]] || {
    fail "immutable PostgreSQL runtime release entry is not a regular file: $path"
    return 1
  }
  if [[ -n $expected_mode && $(stat -c '%a' "$path") != "$expected_mode" ]]; then
    fail "immutable PostgreSQL runtime release mode is invalid: $path"
    return 1
  fi
}

require_postgres_runtime_safe_mutation_target() {
  local path=$1
  if [[ -e $path || -L $path ]]; then
    [[ -f $path && ! -L $path ]] || {
      fail "PostgreSQL runtime mutation target is not a regular file: $path"
      return 1
    }
  fi
}

activate_postgres_runtime_control() {
  local sha=$1
  local compatible_backend_sha=${2:-$sha}
  local outer_backup=${3:-} activation_status
  activate_postgres_runtime_control_transaction "$sha" "$compatible_backend_sha" "$outer_backup"
  activation_status=$?
  ((activation_status == 0)) || return "$activation_status"
  if [[ ${COMPOSE[-1]} != "$POSTGRES_RUNTIME_CURRENT/compose.postgres-runtime.yml" ]]; then
    COMPOSE+=(
      -f "$POSTGRES_RUNTIME_CURRENT/compose.postgres-runtime.yml"
    )
  fi
}

rollback_postgres_runtime_control_activation() {
  local staged_release=$1 next_link=$2 current_link=$3 previous_target=$4
  local backup=$5 unit_directory=$6
  local outer_backup=${7:-}
  local launcher rollback_link scope unit
  local rollback_status=0
  local -a launchers units

  propagate_postgres_runtime_control_forward_only_boundary \
    "$backup" "$outer_backup" || return 1
  if ! require_postgres_runtime_control_rollback_allowed "$backup"; then
    rm -rf "$staged_release" || true
    rm -f "$next_link" "$next_link.rollback" || true
    return 1
  fi

  scope=$(<"$backup/mutation-scope") || rollback_status=1
  [[ $scope =~ ^(base|capture-only|full)$ ]] || rollback_status=1
  mapfile -t units < <(postgres_runtime_control_units_for_scope "$scope") || \
    rollback_status=1
  mapfile -t launchers < <(
    postgres_runtime_control_launchers_for_scope "$scope"
  ) || rollback_status=1

  rm -rf "$staged_release" || rollback_status=1
  rm -f "$next_link" || rollback_status=1
  rollback_link=$next_link.rollback
  rm -f "$rollback_link" || rollback_status=1
  for unit in "${units[@]}"; do
    if [[ -e $backup/$unit || -L $backup/$unit ]]; then
      cp -a "$backup/$unit" "$unit_directory/$unit.restore" || \
        rollback_status=1
      if [[ -e $unit_directory/$unit.restore || \
            -L $unit_directory/$unit.restore ]]; then
        mv -f "$unit_directory/$unit.restore" "$unit_directory/$unit" || \
          rollback_status=1
      fi
    elif [[ -f $backup/$unit.absent ]]; then
      rm -f "$unit_directory/$unit" || rollback_status=1
    else
      rollback_status=1
    fi
  done
  for launcher in "${launchers[@]}"; do
    if [[ -e $backup/$launcher || -L $backup/$launcher ]]; then
      cp -a "$backup/$launcher" "$CONTROL/$launcher.restore" || \
        rollback_status=1
      if [[ -e $CONTROL/$launcher.restore || \
            -L $CONTROL/$launcher.restore ]]; then
        mv -f "$CONTROL/$launcher.restore" "$CONTROL/$launcher" || \
          rollback_status=1
      fi
    elif [[ -f $backup/$launcher.absent ]]; then
      rm -f "$CONTROL/$launcher" || rollback_status=1
    else
      rollback_status=1
    fi
  done
  if [[ -f $backup/daily-timer-states ]]; then
    restore_postgres_runtime_daily_handoff_units "$backup" "$unit_directory" || \
      rollback_status=1
  fi
  if [[ -n $previous_target ]]; then
    ln -s "$previous_target" "$rollback_link" || rollback_status=1
    if [[ -L $rollback_link ]]; then
      mv -Tf "$rollback_link" "$current_link" || rollback_status=1
    fi
  else
    rm -f "$current_link" || rollback_status=1
  fi
  if ((EUID == 0)) && [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    systemctl daemon-reload || rollback_status=1
  fi
  [[ ! -f $backup/daily-timer-states ]] || \
    restore_postgres_runtime_daily_handoff_states "$backup" || rollback_status=1
  [[ ! -f $backup/weekly-timer-state ]] ||
    restore_postgres_runtime_weekly_timer "$backup" || rollback_status=1
  [[ ! -f $backup/rolling-timer-state ]] ||
    restore_postgres_runtime_rolling_timer "$backup" || rollback_status=1
  [[ ! -f $backup/github-premidnight-timer-state ]] || \
    restore_github_premidnight_capture_timer "$backup" || rollback_status=1
  if ((rollback_status == 0)); then
    rm -rf "$backup" || rollback_status=1
  else
    printf 'deploy-error: PostgreSQL runtime-control activation rollback failed; backup retained at %s\n' \
      "$backup" >&2
  fi
  ((rollback_status == 0))
}

activate_postgres_runtime_control_transaction() (
  set -euo pipefail
  local sha=$1
  local compatible_backend_sha=${2:-$sha}
  local outer_backup=${3:-}
  local source=$REPO/ops/deploy/production-runtime
  local release=$POSTGRES_RUNTIME_RELEASES/$sha
  local staged_release=$release.next.$$
  local next_link=$POSTGRES_RUNTIME_CURRENT.next.$$
  local backup=$STATE/postgres-runtime-control-backup.$$
  local previous_target
  local cleanup_command
  local expected_release_entry_count launcher launcher_source_mode
  local daily_c1_containment daily_c1_state release_entry_markers release_state scope source_state unit
  local -a launchers release_launchers release_units units

  [[ $sha =~ ^[0-9a-f]{40}$ && \
     $compatible_backend_sha =~ ^[0-9a-f]{40}$ ]] || \
    fail 'PostgreSQL runtime control release markers are invalid'
  source_state=$(github_premidnight_capture_marker_state "$source") || return
  scope=$(postgres_runtime_control_mutation_scope) || return
  mapfile -t units < <(postgres_runtime_control_units_for_scope "$scope")
  mapfile -t launchers < <(
    postgres_runtime_control_launchers_for_scope "$scope"
  )
  if [[ $source_state == active ]]; then
    mapfile -t release_units < <(
      postgres_runtime_control_units_for_scope full
    )
    mapfile -t release_launchers < <(
      postgres_runtime_control_launchers_for_scope full
    )
  else
    mapfile -t release_units < <(
      postgres_runtime_control_units_for_scope base
    )
    mapfile -t release_launchers < <(
      postgres_runtime_control_launchers_for_scope base
    )
  fi
  require_postgres_runtime_regular_source \
    "$source/compose.postgres-runtime.yml" 644
  require_postgres_runtime_daily_c1_source "$source"
  daily_c1_state=$(postgres_runtime_daily_c1_readiness_state \
    "$source/$POSTGRES_RUNTIME_DAILY_C1_MARKER")
  require_postgres_runtime_daily_c1_transition \
    "$daily_c1_state" "$POSTGRES_RUNTIME_CURRENT"
  daily_c1_containment=$(postgres_runtime_daily_c1_containment_state)
  if [[ $daily_c1_containment != clear && \
        ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]] && ((EUID == 0)); then
    enforce_postgres_runtime_daily_c1_containment \
      "$POSTGRES_RUNTIME_CURRENT" "$SYSTEMD_UNIT_DIR"
  fi
  for launcher in "${release_launchers[@]}"; do
    launcher_source_mode=755
    [[ $launcher != daily-run.sh ]] || launcher_source_mode=644
    require_postgres_runtime_regular_source \
      "$source/$launcher" "$launcher_source_mode"
  done
  for unit in "${release_units[@]}"; do
    require_postgres_runtime_regular_source "$source/$unit" 644
  done
  if [[ $source_state == active ]]; then
    require_postgres_runtime_regular_source \
      "$source/github-premidnight-capture-v1.activation" 644
  fi
  for unit in "${units[@]}"; do
    require_postgres_runtime_safe_mutation_target "$SYSTEMD_UNIT_DIR/$unit"
  done
  for launcher in "${launchers[@]}"; do
    require_postgres_runtime_safe_mutation_target "$CONTROL/$launcher"
  done
  require_postgres_runtime_safe_mutation_target \
    "$CONTROL/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME"
  require_postgres_runtime_safe_mutation_target \
    "$SYSTEMD_UNIT_DIR/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_DIRECTORY/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN"

  previous_target=$(readlink "$POSTGRES_RUNTIME_CURRENT" 2>/dev/null || true)
  initialize_postgres_runtime_control_rollback_basis "$backup"
  printf '%s\n' "$scope" > "$backup/mutation-scope"
  if ((EUID == 0)) && [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    snapshot_postgres_runtime_weekly_timer "$backup"
    snapshot_postgres_runtime_rolling_timer "$backup"
    snapshot_postgres_runtime_daily_handoff "$backup" "$SYSTEMD_UNIT_DIR"
    if postgres_runtime_scope_includes_github_capture "$scope"; then
      snapshot_github_premidnight_capture_timer "$backup"
    fi
  fi
  if [[ -n $previous_target ]]; then
    printf '%s\n' "$previous_target" > "$backup/current-target"
  elif [[ -e $POSTGRES_RUNTIME_CURRENT || -L $POSTGRES_RUNTIME_CURRENT ]]; then
    fail 'PostgreSQL runtime current path is not a symlink'
  else
    : > "$backup/current.absent"
  fi
  for unit in "${units[@]}"; do
    if [[ -e $SYSTEMD_UNIT_DIR/$unit || -L $SYSTEMD_UNIT_DIR/$unit ]]; then
      cp -a "$SYSTEMD_UNIT_DIR/$unit" "$backup/$unit"
    else
      : > "$backup/$unit.absent"
    fi
  done
  for launcher in "${launchers[@]}"; do
    if [[ -e $CONTROL/$launcher || -L $CONTROL/$launcher ]]; then
      cp -a "$CONTROL/$launcher" "$backup/$launcher"
    else
      : > "$backup/$launcher.absent"
    fi
  done
  printf -v cleanup_command \
    'rollback_postgres_runtime_control_activation %q %q %q %q %q %q %q' \
    "$staged_release" "$next_link" "$POSTGRES_RUNTIME_CURRENT" \
    "$previous_target" "$backup" "$SYSTEMD_UNIT_DIR" "$outer_backup"
  # Literal, shell-escaped paths must be captured before local scope unwinds.
  # shellcheck disable=SC2064
  trap "$cleanup_command" EXIT

  if ((EUID == 0)) && [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    prepare_postgres_runtime_daily_c1_ready_reexposure "$daily_c1_state"
    [[ $daily_c1_state != READY ]] || prepare_postgres_runtime_daily_c1_baseline "$sha"
  fi
  install -d -m 0755 "$POSTGRES_RUNTIME_RELEASES" "$SYSTEMD_UNIT_DIR"
  if [[ ! -f $release/SOURCE_SHA || $(cat "$release/SOURCE_SHA") != "$sha" || \
        ! -f $release/READY || \
        $(cat "$release/READY") != "$compatible_backend_sha" ]]; then
    [[ ! -e $release && ! -L $release ]] || \
      fail 'PostgreSQL runtime control release is incomplete'
    [[ ! -e $staged_release && ! -L $staged_release ]] || \
      fail 'PostgreSQL runtime control staging path exists'
    install -d -m 0755 "$staged_release"
    install -m 0644 "$source/compose.postgres-runtime.yml" \
      "$staged_release/compose.postgres-runtime.yml"
    stage_postgres_runtime_daily_c1_readiness "$source" "$staged_release"
    for launcher in "${release_launchers[@]}"; do
      install -m 0755 "$source/$launcher" "$staged_release/$launcher"
    done
    for unit in "${release_units[@]}"; do
      install -m 0644 "$source/$unit" "$staged_release/$unit"
    done
    if [[ $source_state == active ]]; then
      install -m 0644 "$source/github-premidnight-capture-v1.activation" \
        "$staged_release/github-premidnight-capture-v1.activation"
    fi
    printf '%s\n' "$sha" > "$staged_release/SOURCE_SHA"
    printf '%s\n' "$compatible_backend_sha" > "$staged_release/READY"
    mv "$staged_release" "$release"
  fi
  [[ -d $release && ! -L $release ]] || \
    fail 'PostgreSQL runtime control release is not an immutable directory'
  release_state=$(github_premidnight_capture_marker_state "$release") || return
  [[ $release_state == "$source_state" ]] || \
    fail 'PostgreSQL runtime control release activation state is immutable'
  expected_release_entry_count=$((
    ${#release_launchers[@]} + ${#release_units[@]} + 6
  ))
  if [[ $source_state == active ]]; then
    expected_release_entry_count=$((expected_release_entry_count + 1))
  fi
  release_entry_markers=$(
    find "$release" -mindepth 1 -maxdepth 1 -printf x
  )
  ((${#release_entry_markers} == expected_release_entry_count)) || \
    fail 'immutable PostgreSQL runtime release manifest is not exact'
  require_postgres_runtime_regular_release_file \
    "$release/compose.postgres-runtime.yml" 644
  require_postgres_runtime_regular_release_file "$release/SOURCE_SHA"
  require_postgres_runtime_regular_release_file "$release/READY"
  cmp -s "$source/compose.postgres-runtime.yml" \
    "$release/compose.postgres-runtime.yml" || \
    fail 'immutable PostgreSQL runtime Compose release differs from source'
  verify_postgres_runtime_daily_c1_release "$source" "$release"
  for launcher in "${release_launchers[@]}"; do
    require_postgres_runtime_regular_release_file \
      "$release/$launcher" 755
    cmp -s "$source/$launcher" "$release/$launcher" || \
      fail "immutable PostgreSQL runtime launcher differs from source: $launcher"
  done
  for unit in "${release_units[@]}"; do
    require_postgres_runtime_regular_release_file "$release/$unit" 644
    cmp -s "$source/$unit" "$release/$unit" || \
      fail "immutable PostgreSQL runtime unit differs from source: $unit"
  done
  if [[ $source_state == active ]]; then
    require_postgres_runtime_regular_release_file \
      "$release/github-premidnight-capture-v1.activation" 644
    cmp -s "$source/github-premidnight-capture-v1.activation" \
      "$release/github-premidnight-capture-v1.activation" || \
      fail 'immutable GitHub pre-midnight activation marker differs from source'
  fi

  if ((EUID == 0)) && [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    prepare_postgres_runtime_daily_c1_owner_before_exposure "$sha"
  fi
  for unit in "${units[@]}"; do
    install -m 0644 "$release/$unit" "$SYSTEMD_UNIT_DIR/$unit.next"
    mv -f "$SYSTEMD_UNIT_DIR/$unit.next" "$SYSTEMD_UNIT_DIR/$unit"
  done
  for launcher in "${launchers[@]}"; do
    install -m 0755 "$release/$launcher" "$CONTROL/$launcher.next"
    mv -f "$CONTROL/$launcher.next" "$CONTROL/$launcher"
  done
  install_postgres_runtime_daily_c1_bridge_assets "$release" "$SYSTEMD_UNIT_DIR"
  ln -s "$release" "$next_link"
  mv -Tf "$next_link" "$POSTGRES_RUNTIME_CURRENT"
  if ((EUID == 0)) && [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    systemctl daemon-reload
    if [[ $daily_c1_containment == clear ]]; then
      bridge_postgres_runtime_daily_c1_owner \
        "$release" "$SYSTEMD_UNIT_DIR" "$sha"
    fi
    if [[ $daily_c1_state == READY ]]; then
      if [[ $daily_c1_containment != clear ]]; then
        enforce_postgres_runtime_daily_c1_containment \
          "$release" "$SYSTEMD_UNIT_DIR"
      else
        activate_postgres_runtime_daily_c1_handoff \
          "$release" "$SYSTEMD_UNIT_DIR" "$sha" "$backup"
        postgres_runtime_activation_failpoint \
          after-legacy-owner-before-boundary-propagation
        propagate_postgres_runtime_control_forward_only_boundary \
          "$backup" "$outer_backup"
      fi
    fi
  fi
  verify_installed_postgres_runtime_control "$sha" "$compatible_backend_sha"
  rm -rf "$backup"
  trap - EXIT
)

verify_installed_postgres_runtime_control() {
  local sha=$1
  local compatible_backend_sha=${2:-$sha}
  local source=$REPO/ops/deploy/production-runtime
  local release=$POSTGRES_RUNTIME_RELEASES/$sha
  local containment launcher release_state source_mode source_state unit
  local -a launchers units

  source_state=$(github_premidnight_capture_marker_state "$source") || return
  source_mode=$(github_premidnight_capture_marker_mode "$source") || return
  release_state=$(github_premidnight_capture_marker_state "$release") || return
  [[ $release_state == "$source_state" ]] || \
    fail 'installed PostgreSQL runtime activation state differs from the release'
  if [[ $source_state == active ]]; then
    mapfile -t units < <(postgres_runtime_control_units_for_scope full)
    mapfile -t launchers < <(
      postgres_runtime_control_launchers_for_scope full
    )
    cmp -s "$source/github-premidnight-capture-v1.activation" \
      "$release/github-premidnight-capture-v1.activation" || \
      fail 'installed GitHub pre-midnight activation marker differs from the release'
  else
    mapfile -t units < <(postgres_runtime_control_units_for_scope base)
    mapfile -t launchers < <(
      postgres_runtime_control_launchers_for_scope base
    )
  fi

  [[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$release" ]] || \
    fail 'PostgreSQL runtime control symlink is not on the release'
  [[ -f $release/SOURCE_SHA && $(cat "$release/SOURCE_SHA") == "$sha" ]] || \
    fail 'PostgreSQL runtime control source marker is invalid'
  [[ -f $release/READY && \
     $(cat "$release/READY") == "$compatible_backend_sha" ]] || \
    fail 'PostgreSQL runtime control backend-compatibility marker is invalid'
  cmp -s "$source/compose.postgres-runtime.yml" \
    "$POSTGRES_RUNTIME_CURRENT/compose.postgres-runtime.yml" || \
    fail 'installed PostgreSQL Compose overlay differs from the release'
  verify_installed_postgres_runtime_daily_c1_readiness \
    "$source" "$release" "$POSTGRES_RUNTIME_CURRENT"
  for launcher in "${launchers[@]}"; do
    cmp -s "$source/$launcher" "$release/$launcher" || \
      fail "versioned launcher differs from the release source: $launcher"
    cmp -s "$release/$launcher" "$CONTROL/$launcher" || \
      fail "control-owned launcher differs from the PostgreSQL release: $launcher"
  done
  for unit in "${units[@]}"; do
    cmp -s "$source/$unit" "$release/$unit" || \
      fail "versioned systemd unit differs from the release source: $unit"
    cmp -s "$release/$unit" "$SYSTEMD_UNIT_DIR/$unit" || \
      fail "installed systemd unit differs from the release: $unit"
  done
  if ((EUID == 0)) && [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    for unit in "${units[@]}"; do
      [[ $(systemctl show --property=FragmentPath --value "$unit") == \
        "$SYSTEMD_UNIT_DIR/$unit" ]] || \
        fail "systemd is not using the installed unit: $unit"
      [[ -z $(systemctl show --property=DropInPaths --value "$unit") ]] || \
        fail "systemd unit has an unreviewed drop-in: $unit"
    done
    if [[ $source_mode == enable-now ]]; then
      reconcile_github_premidnight_capture_timer
    elif [[ $source_state == active ]]; then
      [[ $(systemctl show --property=UnitFileState --value \
        social-monitor-github-premidnight-capture-v1.timer) == disabled ]] || \
        fail 'GitHub pre-midnight timer must remain disabled'
      [[ $(systemctl show --property=ActiveState --value \
        social-monitor-github-premidnight-capture-v1.timer) == inactive ]] || \
        fail 'GitHub pre-midnight timer must remain inactive'
      [[ $(systemctl show --property=ActiveState --value \
        social-monitor-github-premidnight-capture-v1.service) == inactive ]] || \
        fail 'GitHub pre-midnight service must remain inactive'
    fi
    containment=$(postgres_runtime_daily_c1_containment_state) || return
    if [[ $containment != clear ]]; then
      verify_postgres_runtime_daily_c1_contained_topology \
        "$release" "$SYSTEMD_UNIT_DIR"
    else
      verify_effective_postgres_daily_topology
    fi
    reconcile_postgres_runtime_weekly_timer
    reconcile_postgres_runtime_rolling_timer
  fi
}

snapshot_postgres_runtime_control() {
  local sha=$1
  local backup=$STATE/postgres-runtime-release-rollback-${sha:0:12}.$$
  local containment launcher scope target unit
  local -a launchers units

  scope=$(postgres_runtime_control_mutation_scope) || return
  mapfile -t units < <(postgres_runtime_control_units_for_scope "$scope")
  mapfile -t launchers < <(
    postgres_runtime_control_launchers_for_scope "$scope"
  )
  containment=$(postgres_runtime_daily_c1_containment_state) || return
  if [[ $containment != clear && \
        ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]] && ((EUID == 0)); then
    enforce_postgres_runtime_daily_c1_containment \
      "$POSTGRES_RUNTIME_CURRENT" "$SYSTEMD_UNIT_DIR"
  fi
  initialize_postgres_runtime_control_rollback_basis "$backup"
  printf '%s\n' "$scope" > "$backup/mutation-scope"
  if ((EUID == 0)) && [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    snapshot_postgres_runtime_weekly_timer "$backup"
    snapshot_postgres_runtime_rolling_timer "$backup"
    snapshot_postgres_runtime_daily_handoff "$backup" "$SYSTEMD_UNIT_DIR"
    if postgres_runtime_scope_includes_github_capture "$scope"; then
      snapshot_github_premidnight_capture_timer "$backup"
    fi
  fi
  target=$(readlink "$POSTGRES_RUNTIME_CURRENT" 2>/dev/null || true)
  if [[ -n $target ]]; then
    printf '%s\n' "$target" > "$backup/current-target"
  elif [[ -e $POSTGRES_RUNTIME_CURRENT || -L $POSTGRES_RUNTIME_CURRENT ]]; then
    fail 'PostgreSQL runtime current path is not a symlink'
  else
    : > "$backup/current.absent"
  fi
  for unit in "${units[@]}"; do
    if [[ -e $SYSTEMD_UNIT_DIR/$unit || -L $SYSTEMD_UNIT_DIR/$unit ]]; then
      cp -a "$SYSTEMD_UNIT_DIR/$unit" "$backup/$unit"
    else
      : > "$backup/$unit.absent"
    fi
  done
  for launcher in "${launchers[@]}"; do
    if [[ -e $CONTROL/$launcher || -L $CONTROL/$launcher ]]; then
      cp -a "$CONTROL/$launcher" "$backup/$launcher"
    else
      : > "$backup/$launcher.absent"
    fi
  done
  printf '%s\n' "$backup"
}

restore_postgres_runtime_control() {
  local backup=$1
  local next_link=$POSTGRES_RUNTIME_CURRENT.rollback.$$
  local launcher scope target unit
  local -a launchers units

  [[ -d $backup ]] || return 1
  require_postgres_runtime_control_rollback_allowed "$backup" || return 1
  scope=$(<"$backup/mutation-scope") || return 1
  [[ $scope =~ ^(base|capture-only|full)$ ]] || return 1
  mapfile -t units < <(
    postgres_runtime_control_units_for_scope "$scope"
  ) || return 1
  mapfile -t launchers < <(
    postgres_runtime_control_launchers_for_scope "$scope"
  ) || return 1
  if [[ -f $backup/current-target ]]; then
    target=$(cat "$backup/current-target")
    [[ -n $target ]] || return 1
  elif [[ ! -f $backup/current.absent ]]; then
    return 1
  fi
  for unit in "${units[@]}"; do
    if [[ ! -e $backup/$unit && ! -L $backup/$unit && \
          ! -f $backup/$unit.absent ]]; then
      return 1
    fi
  done
  for launcher in "${launchers[@]}"; do
    if [[ ! -e $backup/$launcher && ! -L $backup/$launcher && \
          ! -f $backup/$launcher.absent ]]; then
      return 1
    fi
  done
  for unit in "${units[@]}"; do
    if [[ -e $backup/$unit || -L $backup/$unit ]]; then
      cp -a "$backup/$unit" "$SYSTEMD_UNIT_DIR/$unit.restore" || return 1
      mv -f "$SYSTEMD_UNIT_DIR/$unit.restore" "$SYSTEMD_UNIT_DIR/$unit" || return 1
    elif [[ -f $backup/$unit.absent ]]; then
      rm -f "$SYSTEMD_UNIT_DIR/$unit" || return 1
    else
      return 1
    fi
  done
  for launcher in "${launchers[@]}"; do
    if [[ -e $backup/$launcher || -L $backup/$launcher ]]; then
      cp -a "$backup/$launcher" "$CONTROL/$launcher.restore" || return 1
      mv -f "$CONTROL/$launcher.restore" "$CONTROL/$launcher" || return 1
    elif [[ -f $backup/$launcher.absent ]]; then
      rm -f "$CONTROL/$launcher" || return 1
    else
      return 1
    fi
  done
  [[ ! -f $backup/daily-timer-states ]] || \
    restore_postgres_runtime_daily_handoff_units "$backup" "$SYSTEMD_UNIT_DIR" || \
    return 1
  rm -f "$next_link" || return 1
  if [[ -f $backup/current-target ]]; then
    ln -s "$target" "$next_link" || return 1
    mv -Tf "$next_link" "$POSTGRES_RUNTIME_CURRENT" || return 1
  elif [[ -f $backup/current.absent ]]; then
    rm -f "$POSTGRES_RUNTIME_CURRENT" || return 1
  else
    return 1
  fi
  if ((EUID == 0)) && [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    systemctl daemon-reload || return 1
  fi
  [[ ! -f $backup/daily-timer-states ]] || \
    restore_postgres_runtime_daily_handoff_states "$backup" || return 1
  [[ ! -f $backup/weekly-timer-state ]] ||
    restore_postgres_runtime_weekly_timer "$backup" || return 1
  [[ ! -f $backup/rolling-timer-state ]] ||
    restore_postgres_runtime_rolling_timer "$backup" || return 1
  [[ ! -f $backup/github-premidnight-timer-state ]] || \
    restore_github_premidnight_capture_timer "$backup" || return 1
  rm -rf "$backup"
}

capture_effective_postgres_environment() {
  local output=$1
  local api_id database_url
  api_id=$("${COMPOSE[@]}" --profile app ps -q api)
  [[ -n $api_id ]] || fail 'production API container is unavailable for PostgreSQL discovery'
  database_url=$(docker inspect "$api_id" --format '{{range .Config.Env}}{{println .}}{{end}}' | \
    awk -F= '$1 == "DATABASE_URL" {sub(/^[^=]*=/, ""); print; exit}')
  [[ -n $database_url ]] || fail 'production API has no effective database URL'
  umask 077
  printf 'DATABASE_URL=%s\n' "$database_url" > "$output"
}

capture_live_postgres_capacity() (
  local output=$1
  local env_file=$2
  [[ -s $env_file ]] || fail 'effective PostgreSQL environment is unavailable'
  local postgres_image=postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15
  docker run --rm \
    --env-file "$env_file" \
    --env PGAPPNAME=social-monitor/capacity-verifier \
    -v "$ROOT/secrets/db/ca-certificate.crt:/run/social-monitor-db/ca-certificate.crt:ro" \
    "$postgres_image" \
    sh -c 'psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "$1"' _ \
    "SELECT json_build_object(
      'serverMaxConnections', current_setting('max_connections')::integer,
      'superuserReservedConnections', current_setting('superuser_reserved_connections')::integer,
      'reservedConnections', COALESCE(NULLIF(current_setting('reserved_connections', true), ''), '0')::integer,
      'roleConnectionLimit', (SELECT rolconnlimit FROM pg_roles WHERE rolname = current_user),
      'databaseConnectionLimit', (SELECT datconnlimit FROM pg_database WHERE datname = current_database()),
      'totalClientConnectionOccupancy', (
        SELECT count(*) FROM pg_stat_activity
        WHERE backend_type = 'client backend' AND pid <> pg_backend_pid()
      ),
      'managedRuntimeConnectionOccupancy', (
        SELECT count(*) FROM pg_stat_activity
        WHERE backend_type = 'client backend'
          AND pid <> pg_backend_pid()
          AND application_name = ANY (ARRAY[
            'social-monitor/runtime/api-gateway',
            'social-monitor/runtime/ingestion-worker',
            'social-monitor/runtime/intelligence-worker',
            'social-monitor/runtime/delivery-service',
            'social-monitor/runtime/event-relay',
            'social-monitor/runtime/social-research-grpc',
            'social-monitor/runtime/social-research-mcp',
            'social-monitor/runtime/daily-runner',
            'social-monitor/runtime/admin-tool'
          ])
      ),
      'stoppedRuntimeConnectionOccupancy', (
        SELECT count(*) FROM pg_stat_activity
        WHERE backend_type = 'client backend'
          AND pid <> pg_backend_pid()
          AND application_name = ANY (ARRAY[
            'social-monitor/runtime/api-gateway',
            'social-monitor/runtime/ingestion-worker',
            'social-monitor/runtime/intelligence-worker',
            'social-monitor/runtime/delivery-service',
            'social-monitor/runtime/event-relay'
          ])
      ),
      'externalConnectionOccupancy', (
        SELECT count(*) FROM pg_stat_activity
        WHERE backend_type = 'client backend'
          AND pid <> pg_backend_pid()
          AND application_name <> ALL (ARRAY[
            'social-monitor/runtime/api-gateway',
            'social-monitor/runtime/ingestion-worker',
            'social-monitor/runtime/intelligence-worker',
            'social-monitor/runtime/delivery-service',
            'social-monitor/runtime/event-relay',
            'social-monitor/runtime/social-research-grpc',
            'social-monitor/runtime/social-research-mcp',
            'social-monitor/runtime/daily-runner',
            'social-monitor/runtime/admin-tool'
          ])
      ),
      'capturePhase', 'post-old-container-stop-pre-new-start'
    )::text" > "$output"
  [[ -s $output ]] || fail 'live PostgreSQL capacity discovery returned no facts'
)

verify_live_postgres_admission() (
  local env_file=$1
  local rendered=$STATE/postgres-admission-rendered.$$.json
  local capacity=$STATE/postgres-admission-capacity.$$.json
  trap 'rm -f "$rendered" "$capacity"' EXIT
  umask 077
  "${COMPOSE[@]}" --profile app --profile daily config --format json > "$rendered"
  capture_live_postgres_capacity "$capacity" "$env_file"
  python3 "$REPO/ops/deploy/verify-postgres-runtime-topology.py" \
    "$rendered" "$capacity" "$ROOT/secrets/production.env"
)

probe_postgres_maximum_envelope() {
  local env_file=$1
  [[ -s $env_file ]] || fail 'effective PostgreSQL environment is unavailable for envelope probe'
  local postgres_image=postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15
  local -a slots=(
    api-1 api-2
    ingestion-1 ingestion-2
    intelligence-1 intelligence-2
    delivery-1 event-relay-1
    daily-1 daily-2 daily-auxiliary-1
    manual-1 manual-2 manual-3
    optional-1
  )
  docker run --rm \
    --env-file "$env_file" \
    -v "$ROOT/secrets/db/ca-certificate.crt:/run/social-monitor-db/ca-certificate.crt:ro" \
    "$postgres_image" \
    sh -c '
      set -eu
      pids=""
      trap '\''for pid in $pids; do kill "$pid" 2>/dev/null || true; done'\'' EXIT
      managed=$(PGAPPNAME=social-monitor/envelope-probe-planner \
        psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc \
        "SELECT count(*) FROM pg_stat_activity WHERE backend_type = '\''client backend'\'' AND application_name = ANY (ARRAY['\''social-monitor/runtime/api-gateway'\'', '\''social-monitor/runtime/ingestion-worker'\'', '\''social-monitor/runtime/intelligence-worker'\'', '\''social-monitor/runtime/delivery-service'\'', '\''social-monitor/runtime/event-relay'\'', '\''social-monitor/runtime/social-research-grpc'\'', '\''social-monitor/runtime/social-research-mcp'\'', '\''social-monitor/runtime/daily-runner'\'', '\''social-monitor/runtime/admin-tool'\''])" \
        2>/dev/null) || exit 69
      [ -n "$managed" ] || exit 69
      case "$managed" in *[!0-9]*) exit 69 ;; esac
      [ "$managed" -le 15 ] || exit 72
      sleepers=$((15 - managed))
      launched=0
      for slot in "$@"; do
        [ "$launched" -lt "$sleepers" ] || break
        PGAPPNAME="social-monitor/envelope-probe/$slot" \
          psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
          -c "BEGIN READ ONLY; SELECT 1; SELECT pg_sleep(12); COMMIT" \
          >/dev/null 2>&1 &
        pids="$pids $!"
        launched=$((launched + 1))
      done
      [ "$launched" -eq "$sleepers" ] || exit 73
      observed=0
      for _attempt in 1 2 3 4 5 6 7 8; do
        observed=$(PGAPPNAME=social-monitor/envelope-probe/optional-2 \
          psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc \
          "SELECT count(*) FROM pg_stat_activity WHERE backend_type = '\''client backend'\'' AND (application_name LIKE '\''social-monitor/envelope-probe/%'\'' OR application_name = ANY (ARRAY['\''social-monitor/runtime/api-gateway'\'', '\''social-monitor/runtime/ingestion-worker'\'', '\''social-monitor/runtime/intelligence-worker'\'', '\''social-monitor/runtime/delivery-service'\'', '\''social-monitor/runtime/event-relay'\'', '\''social-monitor/runtime/social-research-grpc'\'', '\''social-monitor/runtime/social-research-mcp'\'', '\''social-monitor/runtime/daily-runner'\'', '\''social-monitor/runtime/admin-tool'\'']))" \
          2>/dev/null) || exit 70
        [ "$observed" -eq 16 ] && break
        sleep 1
      done
      [ "$observed" -eq 16 ] || exit 71
      for pid in $pids; do wait "$pid"; done
      trap - EXIT
    ' _ "${slots[@]}" >/dev/null 2>&1 || \
    fail 'bounded PostgreSQL maximum-envelope concurrency probe failed'
}

capture_backend_soak_baseline() {
  local output=$1
  shift
  : > "$output"
  local service container restart_count cursor
  local -a container_ids
  for service in "$@"; do
    mapfile -t container_ids < <("${COMPOSE[@]}" --profile app ps -q "$service")
    ((${#container_ids[@]} == 1)) || return 1
    container=${container_ids[0]}
    restart_count=$(docker inspect "$container" --format '{{.RestartCount}}') || return 1
    [[ $restart_count =~ ^[0-9]+$ ]] || return 1
    cursor=$(date --utc --iso-8601=ns) || return 1
    printf '%s %s %s %s\n' \
      "$service" "$container" "$restart_count" "$cursor" >> "$output"
  done
  LC_ALL=C sort -o "$output" "$output"
}

verify_backend_soak_state() {
  local baseline=$1
  local service expected_container expected_restarts cursor actual_restarts
  local -a container_ids
  while read -r service expected_container expected_restarts cursor; do
    mapfile -t container_ids < <("${COMPOSE[@]}" --profile app ps -q "$service")
    ((${#container_ids[@]} == 1)) || return 1
    [[ ${container_ids[0]} == "$expected_container" ]] || return 1
    actual_restarts=$(docker inspect "$expected_container" --format '{{.RestartCount}}') || return 1
    [[ $actual_restarts == "$expected_restarts" ]] || return 1
  done < "$baseline"
}

assert_backend_soak_log_is_clean() {
  local log=$1
  local service=$2
  if grep -Eiq \
    'SQLSTATE[[:space:]_:=.-]*53300|(^|[^0-9])53300([^0-9]|$)|TooManyConnections|too[ _-]*many[ _-]*connections|postgres[.]too_many_connections|upstream[^[:cntrl:]]*502|502[^[:cntrl:]]*upstream|status[[:space:]_:=.-]+502|HTTP/[0-9.]+"[[:space:]]+502' \
    "$log"; then
    printf 'deploy-error: %s emitted a redacted database-capacity or upstream-502 failure during soak\n' \
      "$service" >&2
    return 1
  fi
}

verify_backend_soak_logs() (
  local baseline=$1
  local log=$STATE/backend-soak-log.$$.txt
  local service container _restarts cursor
  trap 'rm -f "$log"' EXIT
  while read -r service container _restarts cursor; do
    docker logs --since "$cursor" "$container" > "$log" 2>&1 || return 1
    assert_backend_soak_log_is_clean "$log" "$service" || return 1
  done < "$baseline"
)

verify_ingestion_queue_recovery() (
  local baseline=$1
  local log=$STATE/backend-soak-ingestion.$$.txt
  local service container _restarts cursor
  trap 'rm -f "$log"' EXIT
  while read -r service container _restarts cursor; do
    [[ $service == ingestion-worker ]] || continue
    docker logs --since "$cursor" "$container" > "$log" 2>&1 || return 1
    grep -E 'scan queue drain loop tick completed.*failed=0' "$log" >/dev/null || {
      printf 'deploy-error: ingestion queue did not prove a failure-free recovery tick during soak\n' >&2
      return 1
    }
    return 0
  done < "$baseline"
  return 1
)

verify_concurrent_backend_readiness() {
  local -a pids=()
  local _attempt pid status=0
  for _attempt in 1 2 3 4; do
    curl -fsS --max-time 15 http://127.0.0.1:13000/ready \
      >/dev/null 2>&1 &
    pids+=("$!")
    curl -fsS --max-time 15 \
      -H 'Host: social-monitor.app' \
      http://127.0.0.1:13080/ready >/dev/null 2>&1 &
    pids+=("$!")
  done
  for pid in "${pids[@]}"; do
    wait "$pid" || status=1
  done
  ((status == 0))
}

frontend_api_proxy_expected_auth_denial() {
  local body=$1
  [[ -n $body ]] || return 1
  printf '%s' "$body" | python3 -c '
import json
import sys

try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(1)

if not isinstance(payload, dict):
    sys.exit(1)

expected = (
    payload.get("status") == 403
    and payload.get("code") == "authorization.denied"
    and payload.get("detail") == "Bearer JWT workspace membership is missing"
)
sys.exit(0 if expected else 1)
'
}

verify_frontend_api_proxy_auth_session() {
  local body response status suffix
  response=$(
    curl -sS --max-time 15 \
      -H 'Host: social-monitor.app' \
      -w $'\n%{http_code}' \
      http://127.0.0.1:13080/auth/session
  ) || return 1
  status=${response##*$'\n'}
  [[ $status =~ ^[0-9]{3}$ ]] || return 1
  [[ $status =~ ^2[0-9][0-9]$ ]] && return 0
  [[ $status == 403 ]] || return 1
  suffix=$'\n'"$status"
  body=${response%"$suffix"}
  frontend_api_proxy_expected_auth_denial "$body"
}

verify_frontend_api_proxy() {
  local frontend_id status oom
  frontend_id=$("${COMPOSE[@]}" --profile app ps -q frontend)
  [[ -n $frontend_id ]] || return 1
  status=$(docker inspect "$frontend_id" --format '{{.State.Status}}')
  oom=$(docker inspect "$frontend_id" --format '{{.State.OOMKilled}}')
  [[ $status == running && $oom == false ]] || return 1
  verify_frontend_api_proxy_auth_session
}

refresh_frontend_api_proxy() {
  "${COMPOSE[@]}" --profile app up -d --no-deps \
    --force-recreate frontend || return 1
  for _ in {1..20}; do
    verify_frontend_api_proxy && return 0
    sleep 3
  done
  return 1
}
