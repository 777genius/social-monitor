#!/usr/bin/env bash

# Sourced by postgres-runtime-deploy-lib.sh. Owns the weekly systemd timer's
# exact snapshot, rollback, and post-activation reconciliation contract.

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
