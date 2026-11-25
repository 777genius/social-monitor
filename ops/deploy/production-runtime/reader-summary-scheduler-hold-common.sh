#!/usr/bin/env bash

# Shared fail-closed state parsing for scheduled reader-summary dispatches.

reader_summary_hold_root() {
  if [[ ${SOCIAL_MONITOR_READER_SUMMARY_HOLD_TEST_MODE:-} == 1 ]]; then
    local root=${SOCIAL_MONITOR_READER_SUMMARY_HOLD_TEST_ROOT:?hold test root is required}
    [[ $root == /tmp/* ]] || return 64
    printf '%s\n' "$root"
  elif [[ ${SOCIAL_MONITOR_DAILY_RUN_TEST_MODE:-} == 1 ]]; then
    printf '%s\n' "${SOCIAL_MONITOR_DAILY_RUN_TEST_ROOT:?daily test root is required}"
  elif [[ ${SOCIAL_MONITOR_ROLLING_RUN_TEST_MODE:-} == 1 ]]; then
    printf '%s\n' "${SOCIAL_MONITOR_ROLLING_RUN_TEST_ROOT:?rolling test root is required}"
  elif [[ ${SOCIAL_MONITOR_GITHUB_PREMIDNIGHT_CAPTURE_TEST_MODE:-} == 1 ]]; then
    printf '%s\n' "${SOCIAL_MONITOR_GITHUB_PREMIDNIGHT_CAPTURE_TEST_ROOT:?pre-midnight test root is required}"
  else
    printf '/var/data/social-monitor\n'
  fi
}

reader_summary_hold_validate_target() {
  [[ ${1:-} =~ ^[0-9a-f]{40}$ ]]
}

reader_summary_hold_read_regular() {
  local path=$1 before after value
  [[ -f $path && ! -L $path ]] || return 1
  before=$(stat -Lc '%d:%i:%f:%s:%Y:%Z' "$path") || return 1
  value=$(<"$path") || return 1
  after=$(stat -Lc '%d:%i:%f:%s:%Y:%Z' "$path") || return 1
  [[ $before == "$after" ]] || return 1
  printf '%s\n' "$value"
}

reader_summary_runtime_hold_path() {
  local root
  root=$(reader_summary_hold_root) || return
  printf '%s/control/deploy-state/reader-summary-scheduler-hold.v1\n' "$root"
}

reader_summary_transition_hold_path() {
  local root
  root=$(reader_summary_hold_root) || return
  printf '%s/control/deploy-state/production-transition-scheduler-hold.v2\n' \
    "$root"
}

reader_summary_hold_lock_path() {
  local root
  root=$(reader_summary_hold_root) || return
  printf '%s/control/reader-summary-scheduler-dispatch.lock\n' "$root"
}

reader_summary_runtime_hold_record() {
  local target=$1
  reader_summary_hold_validate_target "$target" || return 1
  printf '%s\n' \
    'version=social-monitor-reader-summary-scheduler-hold-v1' \
    'phase=held' \
    "target=$target"
}

reader_summary_runtime_hold_target() {
  local marker record target
  marker=$(reader_summary_runtime_hold_path) || return
  [[ -e $marker || -L $marker ]] || return 1
  record=$(reader_summary_hold_read_regular "$marker") || return 2
  target=$(printf '%s\n' "$record" | sed -n '3s/^target=//p')
  [[ $record == "$(reader_summary_runtime_hold_record "$target")" ]] || return 2
  printf '%s\n' "$target"
}

reader_summary_transition_hold_is_safe() {
  local marker record
  marker=$(reader_summary_transition_hold_path) || return
  [[ -e $marker || -L $marker ]] || return 1
  record=$(reader_summary_hold_read_regular "$marker") || return 2
  [[ $record == version=social-monitor-production-transition-scheduler-hold-v2$'\n'phase=held$'\n'* || \
     $record == version=social-monitor-production-transition-scheduler-hold-v2$'\n'phase=release-authorized$'\n'* ]] || return 2
}

reader_summary_scheduler_is_held() {
  local status
  reader_summary_runtime_hold_target >/dev/null 2>&1 && return 0
  status=$?
  ((status == 1)) || return 2
  reader_summary_transition_hold_is_safe >/dev/null 2>&1 && return 0
  status=$?
  ((status == 1)) || return 2
  return 1
}

reader_summary_require_scheduler_clear() {
  local status
  if reader_summary_scheduler_is_held; then
    printf 'reader-summary scheduler dispatch is durably held\n' >&2
    return 75
  else
    status=$?
  fi
  if ((status != 1)); then
    printf 'reader-summary scheduler hold state is invalid\n' >&2
    return 76
  fi
}
