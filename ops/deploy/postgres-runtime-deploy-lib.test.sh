#!/usr/bin/env bash
set -euo pipefail
if ((EUID != 0)); then
  if [[ ${POSTGRES_RUNTIME_DEPLOY_LIB_TEST_ROOT_REEXEC:-} == 1 ]]; then
    echo 'PostgreSQL runtime deploy library tests require root; sudo re-exec did not obtain root privileges' >&2
    exit 1
  fi
  sudo_path=$(type -P sudo || true)
  if [[ -z $sudo_path ]]; then
    echo 'PostgreSQL runtime deploy library tests require root; sudo is unavailable' >&2
    exit 1
  fi
  if ! "$sudo_path" --non-interactive true; then
    echo 'PostgreSQL runtime deploy library tests require root; passwordless sudo elevation is unavailable' >&2
    exit 1
  fi
  export POSTGRES_RUNTIME_DEPLOY_LIB_TEST_ROOT_REEXEC=1
  exec "$sudo_path" --non-interactive \
    --preserve-env=POSTGRES_RUNTIME_DEPLOY_LIB_TEST_ROOT_REEXEC \
    /bin/bash "${BASH_SOURCE[0]}" "$@"
fi
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SOURCE_REPO=$(cd "$SCRIPT_DIR/../.." && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/postgres-runtime-deploy-lib-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT
REPO=$FIXTURE/repo
ROOT=$FIXTURE/root
CONTROL=$ROOT/control
STATE=$CONTROL/deploy-state
POSTGRES_RUNTIME_RELEASES=$CONTROL/postgres-runtime-releases
POSTGRES_RUNTIME_CURRENT=$CONTROL/postgres-runtime-current
SYSTEMD_UNIT_DIR=$ROOT/systemd
POSTGRES_RUNTIME_DAILY_C1_HELPER_TEST_MODE=1
COMPOSE=(docker compose)
SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
FAILED_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
CONTROL_ONLY_SHA=cccccccccccccccccccccccccccccccccccccccc
BACKEND_COMPATIBLE_SHA=dddddddddddddddddddddddddddddddddddddddd
ENABLED_TIMER_SHA=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
ACTIVE_TIMER_SHA=ffffffffffffffffffffffffffffffffffffffff
BRIDGE_SHA=1111111111111111111111111111111111111111
ACTIVE_SERVICE_SHA=2222222222222222222222222222222222222222
ROLLBACK_FAILURE_SHA=3333333333333333333333333333333333333333
INVALID_MARKER_SHA=4444444444444444444444444444444444444444
MASKED_TIMER_SHA=5555555555555555555555555555555555555555
CAPTURE_ENABLE_FAILURE_SHA=5656565656565656565656565656565656565656
CAPTURE_PROOF_FAILURE_SHA=5757575757575757575757575757575757575757
TAMPERED_RELEASE_SHA=6666666666666666666666666666666666666666
TAMPERED_C1_READINESS_SHA=1212121212121212121212121212121212121212
MISSING_C1_READINESS_SHA=1313131313131313131313131313131313131313
LEGACY_TIMERLESS_SHA=1414141414141414141414141414141414141414
CRASH_RESTART_SHA=1515151515151515151515151515151515151515
WEEKLY_ENABLE_FAILURE_SHA=7777777777777777777777777777777777777777
WEEKLY_START_FAILURE_SHA=8888888888888888888888888888888888888888
WEEKLY_PROOF_FAILURE_SHA=9999999999999999999999999999999999999999
WEEKLY_ROLLBACK_FAILURE_SHA=abababababababababababababababababababab
REJECT_DROPIN=false
SERVICE_ACTIVE_STATE=inactive
TIMER_NEXT_TRIGGER='Thu 2026-08-13 23:50:00 UTC'
TIMER_ENABLE_STATUS=0
TIMER_DISABLE_STATUS=0
DAEMON_RELOAD_STATUS=0
WEEKLY_TIMER_NEXT_TRIGGER='Mon 2026-08-03 06:30:00 UTC'
WEEKLY_TIMER_ENABLE_STATUS=0
WEEKLY_TIMER_START_STATUS=0
WEEKLY_TIMER_DISABLE_STATUS=0
WEEKLY_TIMER_STOP_STATUS=0
ROLLING_TIMER_NEXT_TRIGGER='Sat 2026-08-15 12:15:00 UTC'
ROLLING_TIMER_UNIT_FILE_STATE=$FIXTURE/rolling-timer-unit-file-state
ROLLING_TIMER_ACTIVE_STATE=$FIXTURE/rolling-timer-active-state
LEGACY_DAILY_TIMER_ENABLED=true
V6_DAILY_TIMER_ENABLED=false
DAILY_HANDOFF_STATE_MODE=true
LEGACY_DAILY_TIMER_ACTIVE_STATE=active
V6_DAILY_TIMER_ACTIVE_STATE=inactive
DAILY_TIMER_ACTIVE_STATE=active
DAILY_TIMER_ACTIVE_STATE_AFTER_START=active
DAILY_TIMER_NEXT_TRIGGER='Thu 2026-07-30 00:00:00 UTC'
DAILY_TIMER_START_STATUS=0
SYSTEMCTL_EVENTS=$FIXTURE/systemctl-events
WEEKLY_TIMER_UNIT_FILE_STATE=$FIXTURE/weekly-timer-unit-file-state
WEEKLY_TIMER_ACTIVE_STATE=$FIXTURE/weekly-timer-active-state
TIMER_UNIT_FILE_STATE=$FIXTURE/github-premidnight-timer-unit-file-state
TIMER_ACTIVE_STATE=$FIXTURE/github-premidnight-timer-active-state
FAKE_SYSTEMCTL=$SCRIPT_DIR/fixtures/github-premidnight-capture-fake-systemctl.sh
printf 'disabled\n' > "$WEEKLY_TIMER_UNIT_FILE_STATE"
printf 'inactive\n' > "$WEEKLY_TIMER_ACTIVE_STATE"
printf 'disabled\n' > "$ROLLING_TIMER_UNIT_FILE_STATE"
printf 'inactive\n' > "$ROLLING_TIMER_ACTIVE_STATE"
printf 'disabled\n' > "$TIMER_UNIT_FILE_STATE"
printf 'inactive\n' > "$TIMER_ACTIVE_STATE"
install -d "$STATE" "$SYSTEMD_UNIT_DIR" "$CONTROL/old-runtime" \
  "$REPO/ops/deploy"
cp -a "$SOURCE_REPO/ops/deploy/production-runtime" \
  "$REPO/ops/deploy/production-runtime"
cp -a "$SOURCE_REPO/ops/deploy/verify-postgres-runtime-topology.py" \
  "$REPO/ops/deploy/verify-postgres-runtime-topology.py"
printf 'old\n' > "$CONTROL/old-runtime/marker"
install -m 0755 \
  "$REPO/ops/deploy/production-runtime/daily-run.sh" \
  "$CONTROL/daily-run.sh"
install -m 0755 \
  "$REPO/ops/deploy/production-runtime/daily-run.sh" \
  "$CONTROL/run-reader-summary-production-day.sh"
ln -s "$CONTROL/old-runtime" "$POSTGRES_RUNTIME_CURRENT"
capture_units=(
  social-monitor-github-premidnight-capture-v1.service
  social-monitor-github-premidnight-capture-v1.timer
)
base_units=(
  social-monitor-daily.service
  social-monitor-daily.timer
  social-monitor-prod.service
  social-monitor-rolling.service
  social-monitor-rolling.timer
  social-monitor-weekly.service
  social-monitor-weekly.timer
)
units=("${capture_units[@]}" "${base_units[@]}")
for unit in "${base_units[@]}"; do
  install -m 0644 "$REPO/ops/deploy/production-runtime/$unit" \
    "$SYSTEMD_UNIT_DIR/$unit"
done
printf 'unrelated-service\n' > "$SYSTEMD_UNIT_DIR/unrelated.service"
printf 'unrelated-timer\n' > "$SYSTEMD_UNIT_DIR/unrelated.timer"
unrelated_service_inode=$(stat -c '%i' "$SYSTEMD_UNIT_DIR/unrelated.service")
unrelated_timer_inode=$(stat -c '%i' "$SYSTEMD_UNIT_DIR/unrelated.timer")
fail() {
  printf 'test deploy failure: %s\n' "$*" >&2
  return 1
}
probe_daily_singleton_clear() {
  return 0
}
systemctl() {
  case "$*" in
    'show --property=InvocationID --value social-monitor-daily.service')
      printf '\n'
      return 0
      ;;
    'show --property=ExecMainStartTimestampMonotonic --value social-monitor-daily.service')
      printf '0\n'
      return 0
      ;;
    'show --property=ActiveState --value social-monitor-daily.service'|\
    'show --property=ActiveState --value social-monitor-rolling.service'|\
    'show --property=ActiveState --value social-monitor-reader-summary-production-day.service')
      printf 'inactive\n'
      return 0
      ;;
    'show --property=Unit --value social-monitor-daily.timer')
      printf 'social-monitor-daily.service\n'
      return 0
      ;;
    'enable --now social-monitor-github-premidnight-capture-v1.timer')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      ((TIMER_ENABLE_STATUS == 0)) || return "$TIMER_ENABLE_STATUS"
      printf 'enabled\n' > "$TIMER_UNIT_FILE_STATE"
      printf 'active\n' > "$TIMER_ACTIVE_STATE"
      return 0
      ;;
    'disable --now social-monitor-github-premidnight-capture-v1.timer')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      ((TIMER_DISABLE_STATUS == 0)) || return "$TIMER_DISABLE_STATUS"
      printf 'disabled\n' > "$TIMER_UNIT_FILE_STATE"
      printf 'inactive\n' > "$TIMER_ACTIVE_STATE"
      return 0
      ;;
    'show --property=NextElapseUSecRealtime --value social-monitor-github-premidnight-capture-v1.timer')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      printf '%s\n' "$TIMER_NEXT_TRIGGER"
      return 0
      ;;
    'show --property=UnitFileState --value social-monitor-github-premidnight-capture-v1.timer')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      cat "$TIMER_UNIT_FILE_STATE"
      return 0
      ;;
    'show --property=ActiveState --value social-monitor-github-premidnight-capture-v1.timer')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      cat "$TIMER_ACTIVE_STATE"
      return 0
      ;;
    'show --property=ActiveState --value social-monitor-github-premidnight-capture-v1.service')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      printf '%s\n' "$SERVICE_ACTIVE_STATE"
      return 0
      ;;
    'show --property=UnitFileState --value social-monitor-weekly.timer')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      cat "$WEEKLY_TIMER_UNIT_FILE_STATE"
      return
      ;;
    'show --property=ActiveState --value social-monitor-weekly.timer')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      cat "$WEEKLY_TIMER_ACTIVE_STATE"
      return
      ;;
    'show --property=NextElapseUSecRealtime --value social-monitor-weekly.timer')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      printf '%s\n' "$WEEKLY_TIMER_NEXT_TRIGGER"
      return
      ;;
    'show --property=UnitFileState --value social-monitor-rolling.timer')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      cat "$ROLLING_TIMER_UNIT_FILE_STATE"
      return
      ;;
    'show --property=ActiveState --value social-monitor-rolling.timer')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      cat "$ROLLING_TIMER_ACTIVE_STATE"
      return
      ;;
    'show --property=NextElapseUSecRealtime --value social-monitor-rolling.timer')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      printf '%s\n' "$ROLLING_TIMER_NEXT_TRIGGER"
      return
      ;;
    'enable --now social-monitor-rolling.timer')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      printf 'enabled\n' > "$ROLLING_TIMER_UNIT_FILE_STATE"
      printf 'active\n' > "$ROLLING_TIMER_ACTIVE_STATE"
      return 0
      ;;
    'disable --now social-monitor-rolling.timer')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      printf 'disabled\n' > "$ROLLING_TIMER_UNIT_FILE_STATE"
      printf 'inactive\n' > "$ROLLING_TIMER_ACTIVE_STATE"
      return 0
      ;;
    'enable social-monitor-weekly.timer')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      ((WEEKLY_TIMER_ENABLE_STATUS == 0)) || return "$WEEKLY_TIMER_ENABLE_STATUS"
      printf 'enabled\n' > "$WEEKLY_TIMER_UNIT_FILE_STATE"
      return 0
      ;;
    'start social-monitor-weekly.timer')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      ((WEEKLY_TIMER_START_STATUS == 0)) || return "$WEEKLY_TIMER_START_STATUS"
      printf 'active\n' > "$WEEKLY_TIMER_ACTIVE_STATE"
      return 0
      ;;
    'disable social-monitor-weekly.timer')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      ((WEEKLY_TIMER_DISABLE_STATUS == 0)) || return "$WEEKLY_TIMER_DISABLE_STATUS"
      printf 'disabled\n' > "$WEEKLY_TIMER_UNIT_FILE_STATE"
      return 0
      ;;
    'stop social-monitor-weekly.timer')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      ((WEEKLY_TIMER_STOP_STATUS == 0)) || return "$WEEKLY_TIMER_STOP_STATUS"
      printf 'inactive\n' > "$WEEKLY_TIMER_ACTIVE_STATE"
      return 0
      ;;
    'is-enabled --quiet social-monitor-daily.timer')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      [[ $LEGACY_DAILY_TIMER_ENABLED == true ]]
      return
      ;;
    'is-enabled --quiet social-monitor-reader-summary-production-day.timer')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      [[ $V6_DAILY_TIMER_ENABLED == true ]]
      return
      ;;
    'show --property=UnitFileState --value social-monitor-daily.timer')
      [[ $LEGACY_DAILY_TIMER_ENABLED == true ]] && printf 'enabled\n' || \
        printf 'disabled\n'
      return
      ;;
    'show --property=UnitFileState --value social-monitor-reader-summary-production-day.timer')
      [[ $V6_DAILY_TIMER_ENABLED == true ]] && printf 'enabled\n' || \
        printf 'disabled\n'
      return
      ;;
    'show --property=ActiveState --value social-monitor-daily.timer'|\
    'show --property=ActiveState --value social-monitor-reader-summary-production-day.timer')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      if [[ $DAILY_HANDOFF_STATE_MODE == true ]]; then
        [[ $* == *social-monitor-daily.timer ]] && \
          printf '%s\n' "$LEGACY_DAILY_TIMER_ACTIVE_STATE" || \
          printf '%s\n' "$V6_DAILY_TIMER_ACTIVE_STATE"
      else
        printf '%s\n' "$DAILY_TIMER_ACTIVE_STATE"
      fi
      return
      ;;
    'show --property=NextElapseUSecRealtime --value social-monitor-daily.timer'|\
    'show --property=NextElapseUSecRealtime --value social-monitor-reader-summary-production-day.timer')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      printf '%s\n' "$DAILY_TIMER_NEXT_TRIGGER"
      return
      ;;
    'show --property=DropInPaths --value social-monitor-reader-summary-production-day.service')
      if [[ $REJECT_DROPIN == true ]]; then
        printf '/unreviewed.conf\n'
      else
        printf '%s/%s/%s\n' "$SYSTEMD_UNIT_DIR" \
          "$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_DIRECTORY" \
          "$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN"
      fi
      return
      ;;
    'enable social-monitor-daily.timer')
      LEGACY_DAILY_TIMER_ENABLED=true
      return 0
      ;;
    'enable social-monitor-reader-summary-production-day.timer')
      V6_DAILY_TIMER_ENABLED=true
      return 0
      ;;
    'disable social-monitor-daily.timer')
      LEGACY_DAILY_TIMER_ENABLED=false
      return 0
      ;;
    'disable social-monitor-reader-summary-production-day.timer')
      V6_DAILY_TIMER_ENABLED=false
      return 0
      ;;
    'stop social-monitor-daily.timer')
      LEGACY_DAILY_TIMER_ACTIVE_STATE=inactive
      return 0
      ;;
    'stop social-monitor-reader-summary-production-day.timer')
      V6_DAILY_TIMER_ACTIVE_STATE=inactive
      return 0
      ;;
    'start social-monitor-daily.timer'|\
    'start social-monitor-reader-summary-production-day.timer')
      [[ $DAILY_HANDOFF_STATE_MODE == true ]] || \
        printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      ((DAILY_TIMER_START_STATUS == 0)) || return "$DAILY_TIMER_START_STATUS"
      if [[ $DAILY_HANDOFF_STATE_MODE == true ]]; then
        [[ $* == *social-monitor-daily.timer ]] && \
          LEGACY_DAILY_TIMER_ACTIVE_STATE=active || \
          V6_DAILY_TIMER_ACTIVE_STATE=active
      else
        DAILY_TIMER_ACTIVE_STATE=$DAILY_TIMER_ACTIVE_STATE_AFTER_START
      fi
      return
      ;;
    'cat social-monitor-reader-summary-production-day.service')
      printf '%s\n' "$*" >> "$SYSTEMCTL_EVENTS"
      printf '[Service]\nExecStart=%s/run-reader-summary-production-day.sh --yesterday\nTimeoutStartSec=23400\nRestart=no\n' \
        "$CONTROL"
      return
      ;;
  esac
  GITHUB_PREMIDNIGHT_FAKE_SYSTEMD_UNIT_DIR=$SYSTEMD_UNIT_DIR \
  GITHUB_PREMIDNIGHT_FAKE_SYSTEMCTL_CONTROL=$CONTROL \
  GITHUB_PREMIDNIGHT_FAKE_SYSTEMCTL_EVENTS=$SYSTEMCTL_EVENTS \
  GITHUB_PREMIDNIGHT_FAKE_SYSTEMCTL_REJECT_DROPIN=$REJECT_DROPIN \
  GITHUB_PREMIDNIGHT_FAKE_TIMER_UNIT_FILE_STATE=$(<"$TIMER_UNIT_FILE_STATE") \
  GITHUB_PREMIDNIGHT_FAKE_TIMER_ACTIVE_STATE=$(<"$TIMER_ACTIVE_STATE") \
  GITHUB_PREMIDNIGHT_FAKE_SERVICE_ACTIVE_STATE=$SERVICE_ACTIVE_STATE \
  GITHUB_PREMIDNIGHT_FAKE_SYSTEMCTL_DAEMON_RELOAD_STATUS=$DAEMON_RELOAD_STATUS \
    "$FAKE_SYSTEMCTL" "$@"
}
# shellcheck source=ops/deploy/postgres-runtime-deploy-lib.sh
source "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh"
owner_marker=$(postgres_runtime_daily_c1_owner_marker)
printf '%s\n' schemaVersion=reader_summary.daily_c1_owner.v1 owner=LEGACY \
  "releaseSha=$BRIDGE_SHA" > "$owner_marker"
chmod 0444 "$owner_marker"
rm -f \
  "$REPO/ops/deploy/production-runtime/github-premidnight-capture-v1.activation"
bridge_snapshot=$(snapshot_postgres_runtime_control "$BRIDGE_SHA")
activate_postgres_runtime_control "$BRIDGE_SHA"
bridge_release=$POSTGRES_RUNTIME_RELEASES/$BRIDGE_SHA
readiness_source=$REPO/ops/deploy/production-runtime/reader-summary-daily-c1.readiness
readiness_name=reader-summary-daily-c1.readiness
[[ ! -e $bridge_release/github-premidnight-capture-v1.activation ]]
[[ ! -e $bridge_release/github-premidnight-capture-v1.sh ]]
for unit in "${capture_units[@]}"; do
  [[ ! -e $bridge_release/$unit ]]
  [[ ! -e $SYSTEMD_UNIT_DIR/$unit ]]
done
[[ ! -e $CONTROL/github-premidnight-capture-v1.sh ]]
[[ $(find "$bridge_release" -mindepth 1 -maxdepth 1 | wc -l) == 16 ]]
[[ $(stat -c '%a' "$bridge_release/$readiness_name") == 644 ]]
cmp -s "$readiness_source" "$bridge_release/$readiness_name"
cmp -s "$bridge_release/$readiness_name" \
  "$POSTGRES_RUNTIME_CURRENT/$readiness_name"
restore_postgres_runtime_control "$bridge_snapshot"
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$CONTROL/old-runtime" ]]
mv "$readiness_source" "$readiness_source.missing"
set +e
missing_readiness_error=$(activate_postgres_runtime_control \
  "$MISSING_C1_READINESS_SHA" 2>&1)
missing_readiness_status=$?
set -e
mv "$readiness_source.missing" "$readiness_source"
((missing_readiness_status != 0))
grep -F 'runtime source is not a regular file' \
  <<< "$missing_readiness_error" >/dev/null
[[ ! -e $POSTGRES_RUNTIME_RELEASES/$MISSING_C1_READINESS_SHA ]]
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$CONTROL/old-runtime" ]]
printf 'install-disabled-v1\n' > \
  "$REPO/ops/deploy/production-runtime/github-premidnight-capture-v1.activation"
printf 'enable-immediately-v1\n' > \
  "$REPO/ops/deploy/production-runtime/github-premidnight-capture-v1.activation"
set +e
invalid_marker_error=$(
  snapshot_postgres_runtime_control "$INVALID_MARKER_SHA" 2>&1
)
invalid_marker_status=$?
set -e
((invalid_marker_status != 0))
grep -F 'activation marker is invalid' <<< "$invalid_marker_error" >/dev/null
printf 'enable-now-v1\n' > \
  "$REPO/ops/deploy/production-runtime/github-premidnight-capture-v1.activation"
printf 'old-GitHub-premidnight-runner\n' > \
  "$CONTROL/github-premidnight-capture-v1.sh"
for unit in "${capture_units[@]}"; do
  printf 'old-%s\n' "$unit" > "$SYSTEMD_UNIT_DIR/$unit"
done
daily_runner_inode=$(stat -c '%i' "$CONTROL/daily-run.sh")
declare -A base_unit_inodes=()
for unit in "${base_units[@]}"; do
  base_unit_inodes[$unit]=$(stat -c '%i' "$SYSTEMD_UNIT_DIR/$unit")
done
: > "$SYSTEMCTL_EVENTS"
rollback_snapshot=$(snapshot_postgres_runtime_control "$SHA")
activate_postgres_runtime_control "$SHA"
release=$POSTGRES_RUNTIME_RELEASES/$SHA
rm -f \
  "$REPO/ops/deploy/production-runtime/github-premidnight-capture-v1.activation"
set +e
marker_removal_error=$(
  snapshot_postgres_runtime_control "$INVALID_MARKER_SHA" 2>&1
)
marker_removal_status=$?
set -e
((marker_removal_status != 0))
grep -F 'activation marker cannot be removed' \
  <<< "$marker_removal_error" >/dev/null
printf 'enable-now-v1\n' > \
  "$REPO/ops/deploy/production-runtime/github-premidnight-capture-v1.activation"
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$release" ]]
[[ $(cat "$release/READY") == "$SHA" ]]
[[ $(cat "$release/SOURCE_SHA") == "$SHA" ]]
[[ $(find "$release" -mindepth 1 -maxdepth 1 | wc -l) == 20 ]]
[[ $(stat -c '%a' "$release/$readiness_name") == 644 ]]
cmp -s "$readiness_source" "$release/$readiness_name"
cmp -s "$release/$readiness_name" \
  "$POSTGRES_RUNTIME_CURRENT/$readiness_name"
cmp -s "$REPO/ops/deploy/production-runtime/social-monitor-daily.timer" \
  "$release/social-monitor-daily.timer"
cmp -s "$release/social-monitor-daily.timer" \
  "$SYSTEMD_UNIT_DIR/social-monitor-daily.timer"
grep -Fx 'OnCalendar=*-*-* 00:15:00 UTC' \
  "$release/social-monitor-daily.timer" >/dev/null
grep -Fx 'AccuracySec=1min' "$release/social-monitor-daily.timer" >/dev/null
grep -Fx 'RandomizedDelaySec=0' "$release/social-monitor-daily.timer" >/dev/null
grep -Fx 'Persistent=true' "$release/social-monitor-daily.timer" >/dev/null
grep -Fx 'Unit=social-monitor-daily.service' \
  "$release/social-monitor-daily.timer" >/dev/null
[[ ${COMPOSE[-1]} == "$POSTGRES_RUNTIME_CURRENT/compose.postgres-runtime.yml" ]]
cmp -s "$release/daily-run.sh" "$CONTROL/daily-run.sh"
cmp -s "$release/rolling-run.sh" "$CONTROL/rolling-run.sh"
cmp -s "$release/rolling-containerd-fallback.sh" \
  "$CONTROL/rolling-containerd-fallback.sh"
cmp -s "$release/github-premidnight-capture-v1.sh" \
  "$CONTROL/github-premidnight-capture-v1.sh"
for unit in "${units[@]}"; do
  cmp -s "$REPO/ops/deploy/production-runtime/$unit" "$release/$unit"
  cmp -s "$release/$unit" "$SYSTEMD_UNIT_DIR/$unit"
done
[[ $(stat -c '%i' "$CONTROL/daily-run.sh") == "$daily_runner_inode" ]]
for unit in "${base_units[@]}"; do
  [[ $(stat -c '%i' "$SYSTEMD_UNIT_DIR/$unit") == \
    "${base_unit_inodes[$unit]}" ]]
done
[[ $(<"$SYSTEMD_UNIT_DIR/unrelated.service") == unrelated-service ]]
[[ $(<"$SYSTEMD_UNIT_DIR/unrelated.timer") == unrelated-timer ]]
[[ $(stat -c '%i' "$SYSTEMD_UNIT_DIR/unrelated.service") == \
  "$unrelated_service_inode" ]]
[[ $(stat -c '%i' "$SYSTEMD_UNIT_DIR/unrelated.timer") == \
  "$unrelated_timer_inode" ]]
[[ $(grep -E '(^| )(enable|disable|start|stop|restart)( |$)' \
  "$SYSTEMCTL_EVENTS") == \
  $'enable --now social-monitor-github-premidnight-capture-v1.timer\nenable social-monitor-weekly.timer\nstart social-monitor-weekly.timer\nenable --now social-monitor-rolling.timer' ]]
[[ $(<"$TIMER_UNIT_FILE_STATE") == enabled ]]
[[ $(<"$TIMER_ACTIVE_STATE") == active ]]
[[ $(<"$WEEKLY_TIMER_UNIT_FILE_STATE") == enabled ]]
[[ $(<"$WEEKLY_TIMER_ACTIVE_STATE") == active ]]
grep -Fx \
  'show --property=NextElapseUSecRealtime --value social-monitor-weekly.timer' \
  "$SYSTEMCTL_EVENTS" >/dev/null
grep -Fx \
  'show --property=UnitFileState --value social-monitor-github-premidnight-capture-v1.timer' \
  "$SYSTEMCTL_EVENTS" >/dev/null
grep -Fx \
  'show --property=ActiveState --value social-monitor-github-premidnight-capture-v1.timer' \
  "$SYSTEMCTL_EVENTS" >/dev/null
grep -Fx \
  'show --property=ActiveState --value social-monitor-github-premidnight-capture-v1.service' \
  "$SYSTEMCTL_EVENTS" >/dev/null
restore_postgres_runtime_control "$rollback_snapshot"
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$CONTROL/old-runtime" ]]
[[ $(<"$WEEKLY_TIMER_UNIT_FILE_STATE") == disabled ]]
[[ $(<"$WEEKLY_TIMER_ACTIVE_STATE") == inactive ]]
[[ $(<"$TIMER_UNIT_FILE_STATE") == disabled ]]
[[ $(<"$TIMER_ACTIVE_STATE") == inactive ]]
for unit in "${units[@]}"; do
  if [[ $unit == social-monitor-github-premidnight-capture-v1.* ]]; then
    [[ $(cat "$SYSTEMD_UNIT_DIR/$unit") == "old-$unit" ]]
  else
    cmp -s "$REPO/ops/deploy/production-runtime/$unit" \
      "$SYSTEMD_UNIT_DIR/$unit"
  fi
done
cmp -s "$REPO/ops/deploy/production-runtime/daily-run.sh" \
  "$CONTROL/daily-run.sh"
[[ $(cat "$CONTROL/github-premidnight-capture-v1.sh") == \
   old-GitHub-premidnight-runner ]]
[[ $(<"$SYSTEMD_UNIT_DIR/unrelated.service") == unrelated-service ]]
[[ $(<"$SYSTEMD_UNIT_DIR/unrelated.timer") == unrelated-timer ]]
[[ $(stat -c '%i' "$SYSTEMD_UNIT_DIR/unrelated.service") == \
  "$unrelated_service_inode" ]]
[[ $(stat -c '%i' "$SYSTEMD_UNIT_DIR/unrelated.timer") == \
  "$unrelated_timer_inode" ]]
tampered_release=$POSTGRES_RUNTIME_RELEASES/$TAMPERED_RELEASE_SHA
cp -a "$release" "$tampered_release"
printf '%s\n' "$TAMPERED_RELEASE_SHA" > "$tampered_release/SOURCE_SHA"
printf '%s\n' "$TAMPERED_RELEASE_SHA" > "$tampered_release/READY"
rm -f "$tampered_release/github-premidnight-capture-v1.sh"
ln -s "$REPO/ops/deploy/production-runtime/github-premidnight-capture-v1.sh" \
  "$tampered_release/github-premidnight-capture-v1.sh"
set +e
activate_postgres_runtime_control "$TAMPERED_RELEASE_SHA" >/dev/null 2>&1
tampered_release_status=$?
set -e
((tampered_release_status != 0))
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$CONTROL/old-runtime" ]]
[[ $(cat "$CONTROL/github-premidnight-capture-v1.sh") == \
   old-GitHub-premidnight-runner ]]
legacy_timerless_release=$POSTGRES_RUNTIME_RELEASES/$LEGACY_TIMERLESS_SHA
cp -a "$release" "$legacy_timerless_release"
printf '%s\n' "$LEGACY_TIMERLESS_SHA" > \
  "$legacy_timerless_release/SOURCE_SHA"
printf '%s\n' "$LEGACY_TIMERLESS_SHA" > \
  "$legacy_timerless_release/READY"
rm "$legacy_timerless_release/social-monitor-daily.timer"
legacy_timerless_current=$(readlink -f "$POSTGRES_RUNTIME_CURRENT")
set +e
activate_postgres_runtime_control "$LEGACY_TIMERLESS_SHA" >/dev/null 2>&1
legacy_timerless_status=$?
set -e
if ((legacy_timerless_status == 0)); then
  echo 'same-SHA incomplete legacy runtime release was upgraded in place' >&2
  exit 1
fi
[[ ! -e $legacy_timerless_release/social-monitor-daily.timer ]]
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$legacy_timerless_current" ]]
tampered_readiness_release=$POSTGRES_RUNTIME_RELEASES/$TAMPERED_C1_READINESS_SHA
cp -a "$release" "$tampered_readiness_release"
printf '%s\n' "$TAMPERED_C1_READINESS_SHA" > \
  "$tampered_readiness_release/SOURCE_SHA"
printf '%s\n' "$TAMPERED_C1_READINESS_SHA" > \
  "$tampered_readiness_release/READY"
sed -i 's/^state=READY$/state=BLOCKED/' \
  "$tampered_readiness_release/$readiness_name"
set +e
tampered_readiness_error=$(activate_postgres_runtime_control \
  "$TAMPERED_C1_READINESS_SHA" 2>&1)
tampered_readiness_status=$?
set -e
((tampered_readiness_status != 0))
grep -F 'daily C1 readiness marker differs from source' \
  <<< "$tampered_readiness_error" >/dev/null
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$CONTROL/old-runtime" ]]
control_only_snapshot=$(snapshot_postgres_runtime_control "$CONTROL_ONLY_SHA")
activate_postgres_runtime_control \
  "$CONTROL_ONLY_SHA" "$BACKEND_COMPATIBLE_SHA"
control_only_release=$POSTGRES_RUNTIME_RELEASES/$CONTROL_ONLY_SHA
[[ $(cat "$control_only_release/SOURCE_SHA") == "$CONTROL_ONLY_SHA" ]]
[[ $(cat "$control_only_release/READY") == "$BACKEND_COMPATIBLE_SHA" ]]
restore_postgres_runtime_control "$control_only_snapshot"
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$CONTROL/old-runtime" ]]
cmp -s "$REPO/ops/deploy/production-runtime/daily-run.sh" \
  "$CONTROL/daily-run.sh"
[[ $(cat "$CONTROL/github-premidnight-capture-v1.sh") == \
   old-GitHub-premidnight-runner ]]
REJECT_DROPIN=true
set +e
activate_postgres_runtime_control "$FAILED_SHA" >/dev/null 2>&1
failed_status=$?
set -e
((failed_status != 0))
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$CONTROL/old-runtime" ]]
for unit in "${units[@]}"; do
  if [[ $unit == social-monitor-github-premidnight-capture-v1.* ]]; then
    [[ $(cat "$SYSTEMD_UNIT_DIR/$unit") == "old-$unit" ]]
  else
    cmp -s "$REPO/ops/deploy/production-runtime/$unit" \
      "$SYSTEMD_UNIT_DIR/$unit"
  fi
done
cmp -s "$REPO/ops/deploy/production-runtime/daily-run.sh" \
  "$CONTROL/daily-run.sh"
[[ $(cat "$CONTROL/github-premidnight-capture-v1.sh") == \
   old-GitHub-premidnight-runner ]]
[[ $(<"$SYSTEMD_UNIT_DIR/unrelated.service") == unrelated-service ]]
[[ $(<"$SYSTEMD_UNIT_DIR/unrelated.timer") == unrelated-timer ]]
REJECT_DROPIN=false
TIMER_ENABLE_STATUS=51
set +e
activate_postgres_runtime_control "$CAPTURE_ENABLE_FAILURE_SHA" >/dev/null 2>&1
capture_enable_failure_status=$?
set -e
((capture_enable_failure_status != 0))
[[ $(<"$TIMER_UNIT_FILE_STATE") == disabled ]]
[[ $(<"$TIMER_ACTIVE_STATE") == inactive ]]
TIMER_ENABLE_STATUS=0
TIMER_NEXT_TRIGGER=
set +e
activate_postgres_runtime_control "$CAPTURE_PROOF_FAILURE_SHA" >/dev/null 2>&1
capture_proof_failure_status=$?
set -e
((capture_proof_failure_status != 0))
[[ $(<"$TIMER_UNIT_FILE_STATE") == disabled ]]
[[ $(<"$TIMER_ACTIVE_STATE") == inactive ]]
TIMER_NEXT_TRIGGER='Thu 2026-08-13 23:50:00 UTC'
printf 'enabled\n' > "$TIMER_UNIT_FILE_STATE"
printf 'active\n' > "$TIMER_ACTIVE_STATE"
enabled_timer_snapshot=$(snapshot_postgres_runtime_control "$ENABLED_TIMER_SHA")
activate_postgres_runtime_control "$ENABLED_TIMER_SHA" >/dev/null 2>&1
[[ $(<"$TIMER_UNIT_FILE_STATE") == enabled ]]
[[ $(<"$TIMER_ACTIVE_STATE") == active ]]
restore_postgres_runtime_control "$enabled_timer_snapshot"
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$CONTROL/old-runtime" ]]
[[ $(cat "$CONTROL/github-premidnight-capture-v1.sh") == \
   old-GitHub-premidnight-runner ]]
printf 'disabled\n' > "$TIMER_UNIT_FILE_STATE"
printf 'active\n' > "$TIMER_ACTIVE_STATE"
set +e
activate_postgres_runtime_control "$ACTIVE_TIMER_SHA" >/dev/null 2>&1
active_timer_status=$?
set -e
((active_timer_status != 0))
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$CONTROL/old-runtime" ]]
[[ $(cat "$CONTROL/github-premidnight-capture-v1.sh") == \
   old-GitHub-premidnight-runner ]]
printf 'inactive\n' > "$TIMER_ACTIVE_STATE"
SERVICE_ACTIVE_STATE=active
set +e
activate_postgres_runtime_control "$ACTIVE_SERVICE_SHA" >/dev/null 2>&1
active_service_status=$?
set -e
((active_service_status != 0))
[[ $(<"$TIMER_UNIT_FILE_STATE") == disabled ]]
[[ $(<"$TIMER_ACTIVE_STATE") == inactive ]]
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$CONTROL/old-runtime" ]]
[[ $(cat "$CONTROL/github-premidnight-capture-v1.sh") == \
   old-GitHub-premidnight-runner ]]
SERVICE_ACTIVE_STATE=inactive
rm -f \
  "$SYSTEMD_UNIT_DIR/social-monitor-github-premidnight-capture-v1.timer"
ln -s /dev/null \
  "$SYSTEMD_UNIT_DIR/social-monitor-github-premidnight-capture-v1.timer"
set +e
activate_postgres_runtime_control "$MASKED_TIMER_SHA" >/dev/null 2>&1
masked_timer_status=$?
set -e
((masked_timer_status != 0))
[[ -L $SYSTEMD_UNIT_DIR/social-monitor-github-premidnight-capture-v1.timer ]]
[[ $(readlink \
  "$SYSTEMD_UNIT_DIR/social-monitor-github-premidnight-capture-v1.timer") == \
  /dev/null ]]
rm -f \
  "$SYSTEMD_UNIT_DIR/social-monitor-github-premidnight-capture-v1.timer"
printf 'old-%s\n' social-monitor-github-premidnight-capture-v1.timer > \
  "$SYSTEMD_UNIT_DIR/social-monitor-github-premidnight-capture-v1.timer"
DAEMON_RELOAD_STATUS=1
set +e
activate_postgres_runtime_control "$ROLLBACK_FAILURE_SHA" >/dev/null 2>&1
rollback_failure_status=$?
set -e
((rollback_failure_status != 0))
mapfile -t retained_backups < <(
  find "$STATE" -maxdepth 1 -type d \
    -name 'postgres-runtime-control-backup.*'
)
[[ ${#retained_backups[@]} == 1 ]]
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$CONTROL/old-runtime" ]]
DAEMON_RELOAD_STATUS=0
restore_postgres_runtime_control "${retained_backups[0]}"
[[ ! -e ${retained_backups[0]} ]]
if grep -E '(^| )(enable|disable|start|stop|restart)( |$)' \
  "$SYSTEMCTL_EVENTS" | \
  grep -Fv 'social-monitor-weekly.timer' | \
  grep -Fv 'social-monitor-rolling.timer' | \
  grep -Fv 'social-monitor-github-premidnight-capture-v1.timer' >/dev/null; then
  echo 'runtime rollback mutated an unrelated systemd unit state' >&2
  exit 1
fi
[[ $(<"$SYSTEMD_UNIT_DIR/unrelated.service") == unrelated-service ]]
[[ $(<"$SYSTEMD_UNIT_DIR/unrelated.timer") == unrelated-timer ]]
reset_weekly_reconciliation_fixture() {
  printf 'disabled\n' > "$WEEKLY_TIMER_UNIT_FILE_STATE"
  printf 'inactive\n' > "$WEEKLY_TIMER_ACTIVE_STATE"
  WEEKLY_TIMER_NEXT_TRIGGER='Mon 2026-08-03 06:30:00 UTC'
  WEEKLY_TIMER_ENABLE_STATUS=0
  WEEKLY_TIMER_START_STATUS=0
  WEEKLY_TIMER_DISABLE_STATUS=0
  WEEKLY_TIMER_STOP_STATUS=0
  : > "$SYSTEMCTL_EVENTS"
}
reset_weekly_reconciliation_fixture
WEEKLY_TIMER_ENABLE_STATUS=41
set +e
activate_postgres_runtime_control "$WEEKLY_ENABLE_FAILURE_SHA" >/dev/null 2>&1
weekly_failure_status=$?
set -e
if ((weekly_failure_status == 0)); then
  echo 'weekly timer enable failure was accepted' >&2
  exit 1
fi
[[ $(<"$WEEKLY_TIMER_UNIT_FILE_STATE") == disabled ]]
[[ $(<"$WEEKLY_TIMER_ACTIVE_STATE") == inactive ]]
[[ $(grep -Fxc 'enable social-monitor-weekly.timer' "$SYSTEMCTL_EVENTS") == 1 ]]
reset_weekly_reconciliation_fixture
WEEKLY_TIMER_START_STATUS=42
set +e
activate_postgres_runtime_control "$WEEKLY_START_FAILURE_SHA" >/dev/null 2>&1
weekly_failure_status=$?
set -e
if ((weekly_failure_status == 0)); then
  echo 'weekly timer start failure was accepted' >&2
  exit 1
fi
[[ $(<"$WEEKLY_TIMER_UNIT_FILE_STATE") == disabled ]]
[[ $(<"$WEEKLY_TIMER_ACTIVE_STATE") == inactive ]]
[[ $(grep -Fxc 'disable social-monitor-weekly.timer' "$SYSTEMCTL_EVENTS") == 1 ]]
reset_weekly_reconciliation_fixture
WEEKLY_TIMER_NEXT_TRIGGER=
set +e
activate_postgres_runtime_control "$WEEKLY_PROOF_FAILURE_SHA" >/dev/null 2>&1
weekly_failure_status=$?
set -e
if ((weekly_failure_status == 0)); then
  echo 'weekly timer missing next trigger was accepted' >&2
  exit 1
fi
[[ $(<"$WEEKLY_TIMER_UNIT_FILE_STATE") == disabled ]]
[[ $(<"$WEEKLY_TIMER_ACTIVE_STATE") == inactive ]]
[[ $(grep -Fxc 'stop social-monitor-weekly.timer' "$SYSTEMCTL_EVENTS") == 1 ]]
reset_weekly_reconciliation_fixture
WEEKLY_TIMER_NEXT_TRIGGER=
WEEKLY_TIMER_STOP_STATUS=43
set +e
activate_postgres_runtime_control "$WEEKLY_ROLLBACK_FAILURE_SHA" >/dev/null 2>&1
weekly_failure_status=$?
set -e
if ((weekly_failure_status == 0)); then
  echo 'weekly timer rollback failure was accepted' >&2
  exit 1
fi
mapfile -t weekly_retained_backups < <(
  find "$STATE" -maxdepth 1 -type d \
    -name 'postgres-runtime-control-backup.*'
)
[[ ${#weekly_retained_backups[@]} == 1 ]]
[[ $(<"$WEEKLY_TIMER_UNIT_FILE_STATE") == enabled ]]
[[ $(<"$WEEKLY_TIMER_ACTIVE_STATE") == active ]]
WEEKLY_TIMER_STOP_STATUS=0
restore_postgres_runtime_control "${weekly_retained_backups[0]}"
[[ $(<"$WEEKLY_TIMER_UNIT_FILE_STATE") == disabled ]]
[[ $(<"$WEEKLY_TIMER_ACTIVE_STATE") == inactive ]]
[[ ! -e ${weekly_retained_backups[0]} ]]
reset_weekly_reconciliation_fixture
# Failed rollback fixtures may deliberately mutate/remove bridge assets.
# Reconciliation cases start from the exact current reviewed bridge.
install -m 0755 \
  "$REPO/ops/deploy/production-runtime/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME" \
  "$POSTGRES_RUNTIME_CURRENT/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME"
install -m 0644 \
  "$REPO/ops/deploy/production-runtime/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_ASSET" \
  "$POSTGRES_RUNTIME_CURRENT/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_ASSET"
install_postgres_runtime_daily_c1_bridge_assets \
  "$POSTGRES_RUNTIME_CURRENT" "$SYSTEMD_UNIT_DIR"
daily_reconciliation_inode_snapshot=$(
  stat -c '%n:%i' \
    "$SYSTEMD_UNIT_DIR/social-monitor-daily.service" \
    "$SYSTEMD_UNIT_DIR/social-monitor-daily.timer" \
    "$SYSTEMD_UNIT_DIR/social-monitor-weekly.service" \
    "$SYSTEMD_UNIT_DIR/social-monitor-weekly.timer" \
    "$SYSTEMD_UNIT_DIR/social-monitor-github-premidnight-capture-v1.service" \
    "$SYSTEMD_UNIT_DIR/social-monitor-github-premidnight-capture-v1.timer" \
    "$SYSTEMD_UNIT_DIR/unrelated.service" \
    "$SYSTEMD_UNIT_DIR/unrelated.timer"
)
DAILY_HANDOFF_STATE_MODE=false
reset_daily_reconciliation_fixture() {
  LEGACY_DAILY_TIMER_ENABLED=true
  V6_DAILY_TIMER_ENABLED=false
  DAILY_TIMER_ACTIVE_STATE=active
  DAILY_TIMER_ACTIVE_STATE_AFTER_START=active
  DAILY_TIMER_NEXT_TRIGGER='Thu 2026-07-30 00:00:00 UTC'
  DAILY_TIMER_START_STATUS=0
  : > "$SYSTEMCTL_EVENTS"
}
assert_daily_reconciliation_mutations() {
  local expected=$1 actual
  actual=$(grep -E '(^| )(enable|disable|start|stop|restart)( |$)' \
    "$SYSTEMCTL_EVENTS" || true)
  [[ $actual == "$expected" ]]
}
reset_daily_reconciliation_fixture
verify_effective_postgres_daily_topology
assert_daily_reconciliation_mutations ''
[[ $(grep -Fxc \
  'show --property=ActiveState --value social-monitor-daily.timer' \
  "$SYSTEMCTL_EVENTS") == 2 ]]
reset_daily_reconciliation_fixture
DAILY_TIMER_ACTIVE_STATE=inactive
verify_effective_postgres_daily_topology
[[ $(grep -Fxc 'start social-monitor-daily.timer' "$SYSTEMCTL_EVENTS") == 1 ]]
assert_daily_reconciliation_mutations 'start social-monitor-daily.timer'
reset_daily_reconciliation_fixture
LEGACY_DAILY_TIMER_ENABLED=false
V6_DAILY_TIMER_ENABLED=true
DAILY_TIMER_ACTIVE_STATE=inactive
verify_effective_postgres_daily_topology
[[ $(grep -Fxc \
  'start social-monitor-reader-summary-production-day.timer' \
  "$SYSTEMCTL_EVENTS") == 1 ]]
assert_daily_reconciliation_mutations \
  'start social-monitor-reader-summary-production-day.timer'
reset_daily_reconciliation_fixture
DAILY_TIMER_ACTIVE_STATE=inactive
DAILY_TIMER_START_STATUS=1
if verify_effective_postgres_daily_topology >/dev/null 2>&1; then
  echo 'daily timer start failure was accepted' >&2
  exit 1
fi
[[ $(grep -Fxc 'start social-monitor-daily.timer' "$SYSTEMCTL_EVENTS") == 1 ]]
assert_daily_reconciliation_mutations 'start social-monitor-daily.timer'
reset_daily_reconciliation_fixture
DAILY_TIMER_ACTIVE_STATE=inactive
DAILY_TIMER_ACTIVE_STATE_AFTER_START=failed
if verify_effective_postgres_daily_topology >/dev/null 2>&1; then
  echo 'daily timer failed post-start state was accepted' >&2
  exit 1
fi
assert_daily_reconciliation_mutations 'start social-monitor-daily.timer'
reset_daily_reconciliation_fixture
DAILY_TIMER_ACTIVE_STATE=activating
if verify_effective_postgres_daily_topology >/dev/null 2>&1; then
  echo 'ambiguous daily timer active state was accepted' >&2
  exit 1
fi
assert_daily_reconciliation_mutations ''
reset_daily_reconciliation_fixture
DAILY_TIMER_NEXT_TRIGGER=
if verify_effective_postgres_daily_topology >/dev/null 2>&1; then
  echo 'active daily timer without a next trigger was accepted' >&2
  exit 1
fi
for enabled_pair in 'true true' 'false false'; do
  reset_daily_reconciliation_fixture
  read -r LEGACY_DAILY_TIMER_ENABLED V6_DAILY_TIMER_ENABLED <<< "$enabled_pair"
  if verify_effective_postgres_daily_topology >/dev/null 2>&1; then
    echo "ambiguous daily timer enablement was accepted: $enabled_pair" >&2
    exit 1
  fi
  assert_daily_reconciliation_mutations ''
done
[[ $daily_reconciliation_inode_snapshot == "$(
  stat -c '%n:%i' \
    "$SYSTEMD_UNIT_DIR/social-monitor-daily.service" \
    "$SYSTEMD_UNIT_DIR/social-monitor-daily.timer" \
    "$SYSTEMD_UNIT_DIR/social-monitor-weekly.service" \
    "$SYSTEMD_UNIT_DIR/social-monitor-weekly.timer" \
    "$SYSTEMD_UNIT_DIR/social-monitor-github-premidnight-capture-v1.service" \
    "$SYSTEMD_UNIT_DIR/social-monitor-github-premidnight-capture-v1.timer" \
    "$SYSTEMD_UNIT_DIR/unrelated.service" \
    "$SYSTEMD_UNIT_DIR/unrelated.timer"
)" ]]
reset_daily_reconciliation_fixture
SOAK_CONTAINER=stable-ingestion-container
SOAK_RESTARTS=7
SOAK_LOG=$FIXTURE/soak.log
docker() {
  if [[ $1 == run ]]; then
    while (($# > 0)); do
      if [[ $1 == sh && ${2:-} == -c ]]; then
        /bin/sh -n -c "$3"
        return
      fi
      shift
    done
    return 1
  fi
  if [[ $1 == compose ]]; then
    [[ ${*: -3} == 'ps -q ingestion-worker' ]] || return 1
    printf '%s\n' "$SOAK_CONTAINER"
    return
  fi
  if [[ $1 == inspect ]]; then
    [[ $2 == "$SOAK_CONTAINER" && $3 == --format && $4 == '{{.RestartCount}}' ]] || return 1
    printf '%s\n' "$SOAK_RESTARTS"
    return
  fi
  if [[ $1 == logs ]]; then
    [[ $2 == --since && $4 == "$SOAK_CONTAINER" ]] || return 1
    cat "$SOAK_LOG"
    return
  fi
  return 1
}
probe_env=$FIXTURE/probe.env
printf 'DATABASE_URL=postgresql://fixture.invalid/test\n' > "$probe_env"
probe_postgres_maximum_envelope "$probe_env"
soak_baseline=$FIXTURE/soak-baseline.txt
printf 'ingestion-worker %s %s 2026-07-15T00:00:00.000000000+00:00\n' \
  "$SOAK_CONTAINER" "$SOAK_RESTARTS" > "$soak_baseline"
printf 'scan queue drain loop tick completed failed=0 retry=0\n' > "$SOAK_LOG"
verify_backend_soak_state "$soak_baseline"
verify_backend_soak_logs "$soak_baseline"
verify_ingestion_queue_recovery "$soak_baseline"
for hostile_log in \
  'request handled errorClassification=postgres.too_many_connections' \
  'request handled errorCode=53300' \
  'proxy request handled upstream status=502' \
  'GET /ready HTTP/1.1" 502 157'; do
  printf '%s\n' "$hostile_log" > "$SOAK_LOG"
  verify_backend_soak_state "$soak_baseline"
  if verify_backend_soak_logs "$soak_baseline" >/dev/null 2>&1; then
    echo "handled hostile soak error was accepted: $hostile_log" >&2
    exit 1
  fi
done
proxy_frontend_container=frontend-proxy-container
fake_proxy_compose() {
  [[ $* == '--profile app ps -q frontend' ]] || return 1
  printf '%s\n' "$proxy_frontend_container"
}
COMPOSE=(fake_proxy_compose)
docker() {
  case "$*" in
    "inspect $proxy_frontend_container --format {{.State.Status}}")
      printf 'running\n'
      ;;
    "inspect $proxy_frontend_container --format {{.State.OOMKilled}}")
      printf 'false\n'
      ;;
    *)
      return 1
      ;;
  esac
}
curl() {
  [[ ${*: -1} == http://127.0.0.1:13080/auth/session ]] || return 90
  [[ $* == *'Host: social-monitor.app'* ]] || return 90
  [[ ${PROXY_CURL_TRANSPORT:-0} != 1 ]] || return 7
  printf '%s' "$PROXY_AUTH_BODY"
  printf '\n%s' "$PROXY_AUTH_STATUS"
}
assert_proxy_probe_accepts() {
  PROXY_AUTH_STATUS=$1
  PROXY_AUTH_BODY=${2:-}
  unset PROXY_CURL_TRANSPORT
  verify_frontend_api_proxy || {
    echo "frontend proxy auth probe rejected expected $PROXY_AUTH_STATUS" >&2
    exit 1
  }
}
assert_proxy_probe_rejects() {
  local label=$1
  PROXY_AUTH_STATUS=$2
  PROXY_AUTH_BODY=${3:-}
  unset PROXY_CURL_TRANSPORT
  if verify_frontend_api_proxy >/dev/null 2>&1; then
    echo "frontend proxy auth probe accepted invalid $label" >&2
    exit 1
  fi
}
expected_auth_denial='{"status":403,"code":"authorization.denied","detail":"Bearer JWT workspace membership is missing","details":{}}'
assert_proxy_probe_accepts 200 '{"userId":"fixture-user"}'
assert_proxy_probe_accepts 204 ''
assert_proxy_probe_accepts 403 "$expected_auth_denial"
assert_proxy_probe_rejects http-500 500 "$expected_auth_denial"
assert_proxy_probe_rejects http-404 404 "$expected_auth_denial"
assert_proxy_probe_rejects html-403 403 '<html>denied</html>'
assert_proxy_probe_rejects empty-403 403 ''
assert_proxy_probe_rejects malformed-403 403 '{"status":403'
assert_proxy_probe_rejects wrong-code-403 403 \
  '{"status":403,"code":"internal.unexpected","detail":"Bearer JWT workspace membership is missing"}'
assert_proxy_probe_rejects wrong-detail-403 403 \
  '{"status":403,"code":"authorization.denied","detail":"Bearer JWT user session is required"}'
assert_proxy_probe_rejects wrong-status-json-403 403 \
  '{"status":401,"code":"authorization.denied","detail":"Bearer JWT workspace membership is missing"}'
PROXY_AUTH_STATUS=200
PROXY_AUTH_BODY='{"userId":"fixture-user"}'
PROXY_CURL_TRANSPORT=1
if verify_frontend_api_proxy >/dev/null 2>&1; then
  echo 'frontend proxy auth probe accepted curl transport failure' >&2
  exit 1
fi
unset PROXY_CURL_TRANSPORT
# Simulate SIGKILL after current exposure and durable V6 -> LEGACY commit. No
# EXIT trap or marker propagation runs; restore must derive the fence from the
# owner state captured in the outer backup.
chmod 0644 "$owner_marker"
printf '%s\n' schemaVersion=reader_summary.daily_c1_owner.v1 owner=V6 \
  "releaseSha=$SHA" > "$owner_marker"
chmod 0444 "$owner_marker"
crash_restart_backup=$(snapshot_postgres_runtime_control "$CRASH_RESTART_SHA")
[[ ! -e $crash_restart_backup/$POSTGRES_RUNTIME_FORWARD_ONLY_MARKER ]]
[[ $(postgres_runtime_control_rollback_owner_basis "$crash_restart_backup") == V6 ]]
rm -f "$POSTGRES_RUNTIME_CURRENT"
ln -s "$release" "$POSTGRES_RUNTIME_CURRENT"
chmod 0644 "$owner_marker"
printf '%s\n' schemaVersion=reader_summary.daily_c1_owner.v1 owner=LEGACY \
  "releaseSha=$SHA" > "$owner_marker"
chmod 0444 "$owner_marker"
postgres_runtime_daily_c1_fsync_path_and_parent "$owner_marker"
set +e
restore_postgres_runtime_control "$crash_restart_backup" >/dev/null 2>&1
crash_restart_restore_status=$?
set -e
((crash_restart_restore_status != 0))
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$release" ]]
[[ -d $crash_restart_backup ]]
echo 'PostgreSQL runtime deploy library tests passed'
