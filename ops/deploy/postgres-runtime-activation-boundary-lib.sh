#!/usr/bin/env bash

# These filesystem boundaries are shared by activation and rollback. Keeping
# them with the activation-boundary helper prevents the runtime transaction
# library from becoming another over-cap deployment monolith.
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

require_postgres_runtime_regular_source() {
  local path=$1 expected_mode=$2
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
  local path=$1 expected_mode=${2:-}
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

# Sourced by postgres-runtime-deploy-lib.sh after the daily C1 helper. This
# file owns release-exposure exclusion and the outer forward-only boundary.

STATE=${STATE:?caller must define STATE before sourcing activation boundary helper}
POSTGRES_RUNTIME_FORWARD_ONLY_MARKER=daily-c1-forward-only
POSTGRES_RUNTIME_ROLLBACK_OWNER_BASIS=daily-c1-owner-before-activation

postgres_runtime_activation_failpoint() {
  [[ ${POSTGRES_RUNTIME_ACTIVATION_FAILPOINT:-} != "$1" ]] || {
    fail "PostgreSQL runtime activation failpoint reached: $1"
    return 1
  }
}

postgres_runtime_daily_c1_current_readiness_state() {
  local marker=$POSTGRES_RUNTIME_CURRENT/$POSTGRES_RUNTIME_DAILY_C1_MARKER
  if [[ ! -e $marker && ! -L $marker ]]; then
    printf 'ABSENT\n'
    return 0
  fi
  postgres_runtime_daily_c1_readiness_state "$marker"
}

prepare_postgres_runtime_daily_c1_ready_reexposure() {
  local target_state=$1 current_state runtime
  current_state=$(postgres_runtime_daily_c1_current_readiness_state) || return 1
  [[ $current_state == READY && $target_state == READY ]] || return 0
  runtime=$CONTROL/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME
  [[ -f $runtime && ! -L $runtime && -x $runtime ]] || {
    fail 'installed daily C1 runtime check is unavailable'
    return 1
  }
  systemctl stop "$POSTGRES_RUNTIME_DAILY_TIMER" || {
    fail 'daily C1 READY re-exposure could not stop the legacy timer'
    return 1
  }
  "$runtime" --check-no-unresolved || {
    fail 'daily C1 READY re-exposure found an unresolved invocation journal'
    return 1
  }
  prove_postgres_runtime_daily_c1_flip_idle || return 1
  postgres_runtime_activation_failpoint after-ready-journal-check-before-exposure
}

prepare_postgres_runtime_daily_c1_owner_before_exposure() {
  persist_postgres_runtime_daily_c1_v6_owner "$1" || return 1
  postgres_runtime_activation_failpoint after-v6-owner-before-exposure
}

postgres_runtime_control_forward_only_state() {
  local marker=$1/$POSTGRES_RUNTIME_FORWARD_ONLY_MARKER
  if [[ ! -e $marker && ! -L $marker ]]; then
    printf 'reversible\n'
    return 0
  fi
  [[ -f $marker && ! -L $marker && ! -s $marker ]] || {
    fail 'PostgreSQL runtime forward-only boundary marker is invalid'
    return 1
  }
  printf 'crossed\n'
}

initialize_postgres_runtime_control_rollback_basis() {
  local backup=$1 state record file
  state=$(postgres_runtime_daily_c1_owner_state) || return 1
  if [[ $state == absent ]]; then
    record=absent
  else
    record=$(postgres_runtime_daily_c1_owner_record) || return 1
  fi
  install -d -m 0700 "$backup"
  file=$backup/$POSTGRES_RUNTIME_ROLLBACK_OWNER_BASIS
  printf '%s\n' "$record" > "$file"
  chmod 0444 "$file"
  postgres_runtime_daily_c1_fsync_path_and_parent "$file"
  postgres_runtime_daily_c1_fsync_parent "$backup"
}

postgres_runtime_control_rollback_owner_basis() {
  local backup=$1 file=$1/$POSTGRES_RUNTIME_ROLLBACK_OWNER_BASIS record mode
  if [[ ! -e $file && ! -L $file ]]; then
    printf 'unrecorded\n'
    return 0
  fi
  [[ -f $file && ! -L $file ]] || {
    fail 'PostgreSQL runtime rollback owner basis is not a regular file'
    return 1
  }
  mode=$(stat -c '%a' "$file" 2>/dev/null || stat -f '%Lp' "$file") || return 1
  [[ $mode == 444 ]] || {
    fail 'PostgreSQL runtime rollback owner basis mode is invalid'
    return 1
  }
  record=$(<"$file") || return 1
  [[ $record == absent || $record =~ ^(V6|LEGACY)$'\t'[0-9a-f]{40}$ ]] || {
    fail 'PostgreSQL runtime rollback owner basis is invalid'
    return 1
  }
  printf '%s\n' "${record%%$'\t'*}"
}

postgres_runtime_control_rollback_state() {
  local backup=$1 marker_state basis current
  marker_state=$(postgres_runtime_control_forward_only_state "$backup") || return 1
  [[ $marker_state != crossed ]] || { printf 'crossed\n'; return 0; }
  basis=$(postgres_runtime_control_rollback_owner_basis "$backup") || return 1
  current=$(postgres_runtime_daily_c1_owner_state) || return 1
  if [[ $current == LEGACY && $basis != LEGACY ]]; then
    printf 'crossed\n'
    return 0
  fi
  [[ $basis != LEGACY || $current == LEGACY ]] && \
    [[ $basis != V6 || $current != absent ]] || {
    fail 'PostgreSQL runtime daily C1 owner regressed after rollback snapshot'
    return 1
  }
  printf 'reversible\n'
}

propagate_postgres_runtime_control_forward_only_boundary() {
  local inner=$1 outer=${2:-} state marker staged
  state=$(postgres_runtime_control_forward_only_state "$inner") || return 1
  [[ $state == crossed && -n $outer ]] || return 0
  [[ -d $outer && ! -L $outer && \
     $outer == "$STATE"/postgres-runtime-release-rollback-* ]] || {
    fail 'outer PostgreSQL runtime rollback backup is invalid'
    return 1
  }
  marker=$outer/$POSTGRES_RUNTIME_FORWARD_ONLY_MARKER
  if [[ -e $marker || -L $marker ]]; then
    [[ $(postgres_runtime_control_forward_only_state "$outer") == crossed ]]
    return 0
  fi
  staged=$marker.next.$$
  : > "$staged"
  chmod 0444 "$staged"
  postgres_runtime_daily_c1_fsync_path_and_parent "$staged"
  ln "$staged" "$marker" || { rm -f "$staged"; return 1; }
  rm -f "$staged"
  postgres_runtime_daily_c1_fsync_parent "$marker"
  [[ $(postgres_runtime_control_forward_only_state "$outer") == crossed ]]
}

require_postgres_runtime_control_rollback_allowed() {
  local state
  state=$(postgres_runtime_control_rollback_state "$1") || return 1
  [[ $state == reversible ]] || {
    printf 'deploy-error: daily C1 owner handoff crossed the forward-only boundary; rollback is forbidden and backup is retained at %s\n' \
      "$1" >&2
    return 1
  }
}

rollback_backend_and_runtime_control_forward_only_safe() {
  local backend_status=0
  if require_postgres_runtime_control_rollback_allowed "$3"; then
    rollback_backend_and_runtime_control "$@"
    return
  fi
  if [[ $1 == true ]]; then
    rollback_backend_images "$2" || backend_status=$?
    if ((backend_status != 0)); then
      printf 'deploy-error: backend image/container rollback failed (status=%d)\n' \
        "$backend_status" >&2
    fi
  fi
  return 1
}
