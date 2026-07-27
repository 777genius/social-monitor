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
TAMPERED_RELEASE_SHA=6666666666666666666666666666666666666666
REJECT_DROPIN=false
TIMER_UNIT_FILE_STATE=disabled
TIMER_ACTIVE_STATE=inactive
SERVICE_ACTIVE_STATE=inactive
DAEMON_RELOAD_STATUS=0
SYSTEMCTL_EVENTS=$FIXTURE/systemctl-events
FAKE_SYSTEMCTL=$SCRIPT_DIR/fixtures/github-premidnight-capture-fake-systemctl.sh
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
ln -s "$CONTROL/old-runtime" "$POSTGRES_RUNTIME_CURRENT"

capture_units=(
  social-monitor-github-premidnight-capture-v1.service
  social-monitor-github-premidnight-capture-v1.timer
)
base_units=(
  social-monitor-daily.service
  social-monitor-prod.service
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

systemctl() {
  GITHUB_PREMIDNIGHT_FAKE_SYSTEMD_UNIT_DIR=$SYSTEMD_UNIT_DIR \
  GITHUB_PREMIDNIGHT_FAKE_SYSTEMCTL_CONTROL=$CONTROL \
  GITHUB_PREMIDNIGHT_FAKE_SYSTEMCTL_EVENTS=$SYSTEMCTL_EVENTS \
  GITHUB_PREMIDNIGHT_FAKE_SYSTEMCTL_REJECT_DROPIN=$REJECT_DROPIN \
  GITHUB_PREMIDNIGHT_FAKE_TIMER_UNIT_FILE_STATE=$TIMER_UNIT_FILE_STATE \
  GITHUB_PREMIDNIGHT_FAKE_TIMER_ACTIVE_STATE=$TIMER_ACTIVE_STATE \
  GITHUB_PREMIDNIGHT_FAKE_SERVICE_ACTIVE_STATE=$SERVICE_ACTIVE_STATE \
  GITHUB_PREMIDNIGHT_FAKE_SYSTEMCTL_DAEMON_RELOAD_STATUS=$DAEMON_RELOAD_STATUS \
    "$FAKE_SYSTEMCTL" "$@"
}

# shellcheck source=ops/deploy/postgres-runtime-deploy-lib.sh
source "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh"

rm -f \
  "$REPO/ops/deploy/production-runtime/github-premidnight-capture-v1.activation"
bridge_snapshot=$(snapshot_postgres_runtime_control "$BRIDGE_SHA")
activate_postgres_runtime_control "$BRIDGE_SHA"
bridge_release=$POSTGRES_RUNTIME_RELEASES/$BRIDGE_SHA
[[ ! -e $bridge_release/github-premidnight-capture-v1.activation ]]
[[ ! -e $bridge_release/github-premidnight-capture-v1.sh ]]
for unit in "${capture_units[@]}"; do
  [[ ! -e $bridge_release/$unit ]]
  [[ ! -e $SYSTEMD_UNIT_DIR/$unit ]]
done
[[ ! -e $CONTROL/github-premidnight-capture-v1.sh ]]
restore_postgres_runtime_control "$bridge_snapshot"
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$CONTROL/old-runtime" ]]

printf 'install-disabled-v1\n' > \
  "$REPO/ops/deploy/production-runtime/github-premidnight-capture-v1.activation"
printf 'enable-now\n' > \
  "$REPO/ops/deploy/production-runtime/github-premidnight-capture-v1.activation"
set +e
invalid_marker_error=$(
  snapshot_postgres_runtime_control "$INVALID_MARKER_SHA" 2>&1
)
invalid_marker_status=$?
set -e
((invalid_marker_status != 0))
grep -F 'activation marker is invalid' <<< "$invalid_marker_error" >/dev/null
printf 'install-disabled-v1\n' > \
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
printf 'install-disabled-v1\n' > \
  "$REPO/ops/deploy/production-runtime/github-premidnight-capture-v1.activation"
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$release" ]]
[[ $(cat "$release/READY") == "$SHA" ]]
[[ $(cat "$release/SOURCE_SHA") == "$SHA" ]]
[[ ${COMPOSE[-1]} == "$POSTGRES_RUNTIME_CURRENT/compose.postgres-runtime.yml" ]]
cmp -s "$release/daily-run.sh" "$CONTROL/daily-run.sh"
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
if grep -Eq '(^| )(enable|disable|start|stop|restart)( |$)' \
  "$SYSTEMCTL_EVENTS"; then
  echo 'runtime deployment mutated a systemd unit state' >&2
  exit 1
fi
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
TIMER_UNIT_FILE_STATE=enabled
set +e
activate_postgres_runtime_control "$ENABLED_TIMER_SHA" >/dev/null 2>&1
enabled_timer_status=$?
set -e
((enabled_timer_status != 0))
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$CONTROL/old-runtime" ]]
[[ $(cat "$CONTROL/github-premidnight-capture-v1.sh") == \
   old-GitHub-premidnight-runner ]]

TIMER_UNIT_FILE_STATE=disabled
TIMER_ACTIVE_STATE=active
set +e
activate_postgres_runtime_control "$ACTIVE_TIMER_SHA" >/dev/null 2>&1
active_timer_status=$?
set -e
((active_timer_status != 0))
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$CONTROL/old-runtime" ]]
[[ $(cat "$CONTROL/github-premidnight-capture-v1.sh") == \
   old-GitHub-premidnight-runner ]]
TIMER_ACTIVE_STATE=inactive

SERVICE_ACTIVE_STATE=active
set +e
activate_postgres_runtime_control "$ACTIVE_SERVICE_SHA" >/dev/null 2>&1
active_service_status=$?
set -e
((active_service_status != 0))
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
if grep -Eq '(^| )(enable|disable|start|stop|restart)( |$)' \
  "$SYSTEMCTL_EVENTS"; then
  echo 'runtime rollback mutated a systemd unit state' >&2
  exit 1
fi
[[ $(<"$SYSTEMD_UNIT_DIR/unrelated.service") == unrelated-service ]]
[[ $(<"$SYSTEMD_UNIT_DIR/unrelated.timer") == unrelated-timer ]]

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

echo 'PostgreSQL runtime deploy library tests passed'
