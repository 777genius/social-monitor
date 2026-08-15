#!/usr/bin/env bash

# Sourced by postgres-runtime-deploy-lib.sh. Owns the weekly systemd timer's
# exact snapshot, rollback, and post-activation reconciliation contract.

# This helper also owns the adjacent pre-midnight capture and rolling timers
# because all three need the same deployment-transaction snapshot boundary.

github_premidnight_capture_marker_mode() {
  local root=$1 marker
  marker=$root/github-premidnight-capture-v1.activation
  if [[ ! -e $marker && ! -L $marker ]]; then
    printf 'absent\n'
    return
  fi
  [[ -f $marker && ! -L $marker ]] || {
    fail 'GitHub pre-midnight activation marker is not a regular file'
    return 1
  }
  if cmp -s "$marker" <(printf 'install-disabled-v1\n'); then
    printf 'install-disabled\n'
  elif cmp -s "$marker" <(printf 'enable-now-v1\n'); then
    printf 'enable-now\n'
  else
    fail 'GitHub pre-midnight activation marker is invalid'
    return 1
  fi
}

github_premidnight_capture_marker_state() {
  local mode
  mode=$(github_premidnight_capture_marker_mode "$1") || return
  [[ $mode == absent ]] && printf 'inactive\n' || printf 'active\n'
}

postgres_runtime_scope_includes_github_capture() {
  [[ $1 == capture-only || $1 == full ]]
}

snapshot_github_premidnight_capture_timer() {
  local backup=$1 unit_state active_state service_state
  unit_state=$(systemctl show --property=UnitFileState --value \
    social-monitor-github-premidnight-capture-v1.timer) || return 1
  active_state=$(systemctl show --property=ActiveState --value \
    social-monitor-github-premidnight-capture-v1.timer) || return 1
  service_state=$(systemctl show --property=ActiveState --value \
    social-monitor-github-premidnight-capture-v1.service) || return 1
  [[ "$unit_state $active_state" =~ ^(enabled\ active|disabled\ inactive)$ ]] || {
    fail "GitHub pre-midnight timer state is not rollback-safe: $unit_state/$active_state"
    return 1
  }
  [[ $service_state == inactive ]] || {
    fail "GitHub pre-midnight service is not rollback-safe: $service_state"
    return 1
  }
  printf '%s %s\n' "$unit_state" "$active_state" > \
    "$backup/github-premidnight-timer-state"
}

restore_github_premidnight_capture_timer() {
  local backup=$1 unit_state active_state timer
  timer=social-monitor-github-premidnight-capture-v1.timer
  read -r unit_state active_state < \
    "$backup/github-premidnight-timer-state" || return 1
  case "$unit_state/$active_state" in
    enabled/active) systemctl enable --now "$timer" || return 1 ;;
    disabled/inactive) systemctl disable --now "$timer" || return 1 ;;
    *) return 1 ;;
  esac
  [[ $(systemctl show --property=UnitFileState --value "$timer") == \
      "$unit_state" && \
     $(systemctl show --property=ActiveState --value "$timer") == \
      "$active_state" ]]
}

reconcile_github_premidnight_capture_timer() {
  local timer=social-monitor-github-premidnight-capture-v1.timer
  local unit_state active_state next_trigger service_state
  systemctl enable --now "$timer" || {
    fail 'GitHub pre-midnight timer could not be enabled and started'
    return 1
  }
  unit_state=$(systemctl show --property=UnitFileState --value "$timer") || return 1
  active_state=$(systemctl show --property=ActiveState --value "$timer") || return 1
  next_trigger=$(systemctl show --property=NextElapseUSecRealtime --value \
    "$timer") || return 1
  service_state=$(systemctl show --property=ActiveState --value \
    social-monitor-github-premidnight-capture-v1.service) || return 1
  [[ $unit_state == enabled && $active_state == active && \
     -n $next_trigger && $service_state == inactive ]] || {
    fail "GitHub pre-midnight timer activation proof is invalid: $unit_state/$active_state/$service_state"
    return 1
  }
}

snapshot_postgres_runtime_weekly_timer() {
  local backup=$1 unit_state active_state
  unit_state=$(systemctl show --property=UnitFileState --value social-monitor-weekly.timer) ||
    { fail 'systemd weekly timer enablement is unavailable'; return 1; }
  active_state=$(systemctl show --property=ActiveState --value social-monitor-weekly.timer) ||
    { fail 'systemd weekly timer active state is unavailable'; return 1; }
  [[ "$unit_state $active_state" =~ ^(enabled\ active|disabled\ inactive)$ ]] ||
    { fail "systemd weekly timer state is not rollback-safe: $unit_state/$active_state"; return 1; }
  printf '%s %s\n' "$unit_state" "$active_state" > "$backup/weekly-timer-state"
}

restore_postgres_runtime_weekly_timer() {
  local backup=$1 unit_state active_state
  read -r unit_state active_state < "$backup/weekly-timer-state" || return 1
  [[ "$unit_state $active_state" =~ ^(enabled\ active|disabled\ inactive)$ ]] || return 1
  case "$unit_state/$active_state" in
    enabled/active) systemctl enable social-monitor-weekly.timer && systemctl start social-monitor-weekly.timer || return 1 ;;
    disabled/inactive) systemctl stop social-monitor-weekly.timer && systemctl disable social-monitor-weekly.timer || return 1 ;;
  esac
  [[ $(systemctl show --property=UnitFileState --value social-monitor-weekly.timer) == "$unit_state" && $(systemctl show --property=ActiveState --value social-monitor-weekly.timer) == "$active_state" ]]
}

reconcile_postgres_runtime_weekly_timer() {
  local timer=social-monitor-weekly.timer unit_state active_state next_trigger
  unit_state=$(systemctl show --property=UnitFileState --value "$timer") ||
    { fail 'systemd weekly timer enablement is unavailable'; return 1; }
  case $unit_state in
    enabled) ;;
    disabled) systemctl enable "$timer" ||
      { fail 'systemd weekly timer could not be enabled'; return 1; } ;;
    *) fail "systemd weekly timer enablement is not reconcilable: $unit_state"; return 1 ;;
  esac
  active_state=$(systemctl show --property=ActiveState --value "$timer") ||
    { fail 'systemd weekly timer active state is unavailable'; return 1; }
  case $active_state in
    active) ;;
    inactive) systemctl start "$timer" || {
      fail 'systemd weekly timer could not be started'; return 1; } ;;
    *) fail "systemd weekly timer active state is not reconcilable: $active_state"; return 1 ;;
  esac
  unit_state=$(systemctl show --property=UnitFileState --value "$timer") ||
    { fail 'systemd weekly timer proof is unavailable'; return 1; }
  active_state=$(systemctl show --property=ActiveState --value "$timer") ||
    { fail 'systemd weekly timer proof is unavailable'; return 1; }
  next_trigger=$(systemctl show --property=NextElapseUSecRealtime --value "$timer") ||
    { fail 'systemd weekly timer proof is unavailable'; return 1; }
  [[ $unit_state == enabled && $active_state == active && -n $next_trigger ]] ||
    { fail "systemd weekly timer proof is invalid: $unit_state/$active_state"; return 1; }
}

snapshot_postgres_runtime_rolling_timer() {
  local backup=$1 unit_state active_state
  unit_state=$(systemctl show --property=UnitFileState --value \
    social-monitor-rolling.timer) || {
    fail 'systemd rolling timer enablement is unavailable'
    return 1
  }
  active_state=$(systemctl show --property=ActiveState --value \
    social-monitor-rolling.timer) || {
    fail 'systemd rolling timer active state is unavailable'
    return 1
  }
  [[ "$unit_state $active_state" =~ ^(enabled\ active|disabled\ inactive|not-found\ inactive)$ ]] || {
    fail "systemd rolling timer state is not rollback-safe: $unit_state/$active_state"
    return 1
  }
  printf '%s %s\n' "$unit_state" "$active_state" > \
    "$backup/rolling-timer-state"
}

restore_postgres_runtime_rolling_timer() {
  local backup=$1 unit_state active_state timer
  timer=social-monitor-rolling.timer
  read -r unit_state active_state < "$backup/rolling-timer-state" || return 1
  case "$unit_state/$active_state" in
    enabled/active) systemctl enable --now "$timer" || return 1 ;;
    disabled/inactive) systemctl disable --now "$timer" || return 1 ;;
    not-found/inactive)
      systemctl disable --now "$timer" >/dev/null 2>&1 || true
      ;;
    *) return 1 ;;
  esac
  [[ $(systemctl show --property=UnitFileState --value "$timer") == \
      "$unit_state" && \
     $(systemctl show --property=ActiveState --value "$timer") == \
      "$active_state" ]]
}

reconcile_postgres_runtime_rolling_timer() {
  local timer=social-monitor-rolling.timer
  local unit_state active_state next_trigger service_state
  systemctl enable --now "$timer" || {
    fail 'systemd rolling timer could not be enabled and started'
    return 1
  }
  unit_state=$(systemctl show --property=UnitFileState --value "$timer") || return 1
  active_state=$(systemctl show --property=ActiveState --value "$timer") || return 1
  next_trigger=$(systemctl show --property=NextElapseUSecRealtime --value \
    "$timer") || return 1
  service_state=$(systemctl show --property=ActiveState --value \
    social-monitor-rolling.service) || return 1
  [[ $unit_state == enabled && $active_state == active && \
     -n $next_trigger && $service_state == inactive ]] || {
    fail "systemd rolling timer activation proof is invalid: $unit_state/$active_state/$service_state"
    return 1
  }
}
