#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/rolling-timer-state-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT
source "$SCRIPT_DIR/fixtures/postgres-runtime-deploy-test-state.sh"
source "$SCRIPT_DIR/postgres-runtime-weekly-timer-state-lib.sh"
fail() { printf '%s\n' "$*" >&2; return 1; }
systemctl() {
  printf '%s\n' "$*" >> "$FIXTURE/events"
  case "$*" in
    'show --property=UnitFileState --value social-monitor-rolling.timer')
      cat "$ROLLING_TIMER_UNIT_FILE_STATE" ;;
    'show --property=ActiveState --value social-monitor-rolling.timer')
      cat "$ROLLING_TIMER_ACTIVE_STATE" ;;
    'show --property=NextElapseUSecRealtime --value social-monitor-rolling.timer')
      printf '%s\n' "$ROLLING_TIMER_NEXT_TRIGGER" ;;
    'show --property=ActiveState --value social-monitor-rolling.service')
      printf '%s\n' "$SERVICE_ACTIVE_STATE" ;;
    *) return 91 ;;
  esac
}
for state in 'disabled inactive' 'enabled active'; do
  read -r unit active <<< "$state"
  printf '%s\n' "$unit" > "$ROLLING_TIMER_UNIT_FILE_STATE"
  printf '%s\n' "$active" > "$ROLLING_TIMER_ACTIVE_STATE"
  SERVICE_ACTIVE_STATE=inactive
  ROLLING_TIMER_NEXT_TRIGGER=
  [[ $unit == disabled ]] || ROLLING_TIMER_NEXT_TRIGGER='Sat 2026-08-15 12:15:00 UTC'
  snapshot_postgres_runtime_rolling_timer "$FIXTURE"
  : > "$FIXTURE/events"
  reconcile_postgres_runtime_rolling_timer
  reconcile_postgres_runtime_rolling_timer
  [[ $(cat "$FIXTURE/rolling-timer-state") == "$state" ]]
  [[ $(cat "$ROLLING_TIMER_UNIT_FILE_STATE") == "$unit" ]]
  [[ $(cat "$ROLLING_TIMER_ACTIVE_STATE") == "$active" ]]
  ! grep -Ev '^show ' "$FIXTURE/events"
  SERVICE_ACTIVE_STATE=active
  if reconcile_postgres_runtime_rolling_timer 2>/dev/null; then
    fail 'active rolling service was accepted'
    exit 1
  fi
done
SERVICE_ACTIVE_STATE=inactive
ROLLING_TIMER_NEXT_TRIGGER=
if reconcile_postgres_runtime_rolling_timer 2>/dev/null; then
  fail 'enabled timer without a next trigger was accepted'
  exit 1
fi
for state in 'disabled active' 'enabled inactive' 'masked inactive' 'not-found inactive'; do
  read -r unit active <<< "$state"
  printf '%s\n' "$unit" > "$ROLLING_TIMER_UNIT_FILE_STATE"
  printf '%s\n' "$active" > "$ROLLING_TIMER_ACTIVE_STATE"
  if reconcile_postgres_runtime_rolling_timer 2>/dev/null; then
    fail "invalid rolling timer state was accepted: $state"
    exit 1
  fi
done
echo 'Rolling timer state tests passed'
