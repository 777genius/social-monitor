#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/postgres-daily-c1-test.XXXXXX")
FIXTURE=$(cd "$FIXTURE" && pwd -P)
trap 'rm -rf "$FIXTURE"' EXIT
REPO=$FIXTURE/repo
CONTROL=$FIXTURE/control
STATE=$CONTROL/state
SYSTEMD_UNIT_DIR=$FIXTURE/systemd
POSTGRES_RUNTIME_RELEASES=$CONTROL/releases
POSTGRES_RUNTIME_CURRENT=$CONTROL/current
SOURCE=$REPO/ops/deploy/production-runtime
RELEASE=$POSTGRES_RUNTIME_RELEASES/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
BACKUP=$STATE/backup
EVENTS=$FIXTURE/systemctl-events
install -d "$SOURCE" "$RELEASE" "$CONTROL" "$STATE" "$SYSTEMD_UNIT_DIR"

fail() {
  printf 'test failure: %s\n' "$*" >&2
  return 1
}

file_mode() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}

file_inode() {
  stat -c '%i' "$1" 2>/dev/null || stat -f '%i' "$1"
}

require_postgres_runtime_regular_source() {
  local path=$1 expected_mode=$2
  [[ -f $path && ! -L $path ]] || \
    { fail "PostgreSQL runtime source is not a regular file: $path"; return 1; }
  [[ $(file_mode "$path") == "$expected_mode" ]] || \
    { fail "PostgreSQL runtime source mode is invalid: $path"; return 1; }
}

require_postgres_runtime_regular_release_file() {
  local path=$1 expected_mode=${2:-}
  [[ -f $path && ! -L $path ]] || \
    { fail "immutable PostgreSQL runtime release entry is not a regular file: $path"; return 1; }
  [[ -z $expected_mode || $(file_mode "$path") == "$expected_mode" ]] || \
    { fail "immutable PostgreSQL runtime release mode is invalid: $path"; return 1; }
}

# shellcheck source=ops/deploy/postgres-runtime-daily-c1-readiness-lib.sh
source "$SCRIPT_DIR/postgres-runtime-daily-c1-readiness-lib.sh"

LEGACY_UNIT_STATE=disabled
LEGACY_ACTIVE_STATE=inactive
V6_UNIT_STATE=enabled
V6_ACTIVE_STATE=active
LEGACY_SERVICE_STATE=inactive
V6_SERVICE_STATE=inactive
NEXT_TRIGGER='Wed 2026-08-12 00:15:00 UTC'
FAIL_COMMAND=
OWNER_EVENTS=
SINGLETON_CLEAR=true
POSTGRES_RUNTIME_DAILY_C1_TEST_IDLE_ATTEMPTS=1

timer_unit_state() {
  [[ $1 == "$POSTGRES_RUNTIME_DAILY_TIMER" ]] && \
    printf '%s\n' "$LEGACY_UNIT_STATE" || printf '%s\n' "$V6_UNIT_STATE"
}

timer_active_state() {
  [[ $1 == "$POSTGRES_RUNTIME_DAILY_TIMER" ]] && \
    printf '%s\n' "$LEGACY_ACTIVE_STATE" || printf '%s\n' "$V6_ACTIVE_STATE"
}

set_timer_unit_state() {
  if [[ $1 == "$POSTGRES_RUNTIME_DAILY_TIMER" ]]; then
    LEGACY_UNIT_STATE=$2
  else
    V6_UNIT_STATE=$2
  fi
}

set_timer_active_state() {
  if [[ $1 == "$POSTGRES_RUNTIME_DAILY_TIMER" ]]; then
    LEGACY_ACTIVE_STATE=$2
  else
    V6_ACTIVE_STATE=$2
  fi
}

systemctl() {
  local command=$*
  printf '%s\n' "$command" >> "$EVENTS"
  if [[ -n $OWNER_EVENTS && $1 =~ ^(disable|enable|start|stop)$ ]]; then
    printf '%s\t%s\n' "$(postgres_runtime_daily_c1_owner_state)" \
      "$command" >> "$OWNER_EVENTS"
  fi
  [[ $command != "$FAIL_COMMAND" ]] || return 1
  case $1 in
    show)
      local property=${2#--property=} unit=$4
      case $property in
        UnitFileState) timer_unit_state "$unit" ;;
        ActiveState)
          case $unit in
            "$POSTGRES_RUNTIME_DAILY_SERVICE") printf '%s\n' "$LEGACY_SERVICE_STATE" ;;
            "$POSTGRES_RUNTIME_DAILY_V6_SERVICE") printf '%s\n' "$V6_SERVICE_STATE" ;;
            *) timer_active_state "$unit" ;;
          esac
          ;;
        NextElapseUSecRealtime) printf '%s\n' "$NEXT_TRIGGER" ;;
        InvocationID) printf '\n' ;;
        ExecMainStartTimestampMonotonic) printf '0\n' ;;
        FragmentPath) printf '%s/%s\n' "$SYSTEMD_UNIT_DIR" "$unit" ;;
        DropInPaths)
          if [[ $unit == "$POSTGRES_RUNTIME_DAILY_V6_SERVICE" ]]; then
            printf '%s/%s/%s\n' "$SYSTEMD_UNIT_DIR" \
              "$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_DIRECTORY" \
              "$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN"
          else
            printf '\n'
          fi
          ;;
        Unit) printf '%s\n' "$POSTGRES_RUNTIME_DAILY_SERVICE" ;;
        *) return 1 ;;
      esac
      ;;
    stop) set_timer_active_state "$2" inactive ;;
    start) set_timer_active_state "$2" active ;;
    enable) set_timer_unit_state "$2" enabled ;;
    disable) set_timer_unit_state "$2" disabled ;;
    *) return 1 ;;
  esac
}

probe_daily_singleton_clear() {
  [[ $SINGLETON_CLEAR == true ]]
}

write_marker() {
  local state=$1 path=$2
  local activation=forbidden
  local requires=H_GREEN,C0_GREEN,reviewed_activation
  if [[ $state == READY ]]; then
    activation=reviewed
    requires=H_GREEN,C0_GREEN,C1_SCAN_TERMINAL_REPAIR_GREEN
  fi
  printf '%s\n' \
    schemaVersion=reader_summary.daily_delivery_readiness.c1 \
    "state=$state" \
    "requires=$requires" \
    "activation=$activation" > "$path"
  chmod 0644 "$path"
}

cp "$SCRIPT_DIR/production-runtime/daily-c1-runtime.sh" \
  "$SOURCE/daily-c1-runtime.sh"
chmod 0755 "$SOURCE/daily-c1-runtime.sh"
cp "$SCRIPT_DIR/production-runtime/social-monitor-reader-summary-production-day.service.d-10-daily-c1-owner.conf" \
  "$SOURCE/social-monitor-reader-summary-production-day.service.d-10-daily-c1-owner.conf"
chmod 0644 "$SOURCE/social-monitor-reader-summary-production-day.service.d-10-daily-c1-owner.conf"
write_marker READY "$SOURCE/$POSTGRES_RUNTIME_DAILY_C1_MARKER"
require_postgres_runtime_daily_c1_source "$SOURCE"
[[ $(postgres_runtime_daily_c1_readiness_state \
  "$SOURCE/$POSTGRES_RUNTIME_DAILY_C1_MARKER") == READY ]]
: > "$EVENTS"
for malformed_marker in \
  $'schemaVersion=reader_summary.daily_delivery_readiness.c1\nstate=READY\nstate=BLOCKED\nrequires=H_GREEN,C0_GREEN,C1_SCAN_TERMINAL_REPAIR_GREEN\nactivation=reviewed' \
  $'schemaVersion=reader_summary.daily_delivery_readiness.c1\nstate=READY\nrequires=H_GREEN,C0_GREEN,C1_SCAN_TERMINAL_REPAIR_GREEN\nactivation=forbidden' \
  $'schemaVersion=reader_summary.daily_delivery_readiness.c1\nstate=READY\nrequires=C0_GREEN,H_GREEN,reviewed_activation\nactivation=reviewed' \
  $'schemaVersion=reader_summary.daily_delivery_readiness.c1\nstate=READY\nrequires=H_GREEN,C0_GREEN,C1_SCAN_TERMINAL_REPAIR_GREEN\nactivation=reviewed\nextra=true'; do
  printf '%s\n' "$malformed_marker" > \
    "$SOURCE/$POSTGRES_RUNTIME_DAILY_C1_MARKER"
  if postgres_runtime_daily_c1_readiness_state \
    "$SOURCE/$POSTGRES_RUNTIME_DAILY_C1_MARKER" >/dev/null 2>&1; then
    echo 'malformed daily C1 readiness marker was accepted' >&2
    exit 1
  fi
done
[[ ! -s $EVENTS ]]
write_marker READY "$SOURCE/$POSTGRES_RUNTIME_DAILY_C1_MARKER"
mv "$SOURCE/$POSTGRES_RUNTIME_DAILY_C1_MARKER" "$SOURCE/marker.missing"
if require_postgres_runtime_daily_c1_source "$SOURCE" >/dev/null 2>&1; then
  echo 'missing daily C1 source marker was accepted' >&2
  exit 1
fi
mv "$SOURCE/marker.missing" "$SOURCE/$POSTGRES_RUNTIME_DAILY_C1_MARKER"
chmod 0600 "$SOURCE/$POSTGRES_RUNTIME_DAILY_C1_MARKER"
if require_postgres_runtime_daily_c1_source "$SOURCE" >/dev/null 2>&1; then
  echo 'unsafe daily C1 source marker mode was accepted' >&2
  exit 1
fi
chmod 0644 "$SOURCE/$POSTGRES_RUNTIME_DAILY_C1_MARKER"

stage_postgres_runtime_daily_c1_readiness "$SOURCE" "$RELEASE"
install_postgres_runtime_daily_c1_bridge_assets "$RELEASE" "$SYSTEMD_UNIT_DIR"
verify_postgres_runtime_daily_c1_release "$SOURCE" "$RELEASE"
ln -s "$RELEASE" "$POSTGRES_RUNTIME_CURRENT"
verify_installed_postgres_runtime_daily_c1_readiness \
  "$SOURCE" "$RELEASE" "$POSTGRES_RUNTIME_CURRENT"
printf 'tampered\n' >> "$RELEASE/$POSTGRES_RUNTIME_DAILY_C1_MARKER"
if verify_postgres_runtime_daily_c1_release "$SOURCE" "$RELEASE" \
  >/dev/null 2>&1; then
  echo 'tampered daily C1 release marker was accepted' >&2
  exit 1
fi
stage_postgres_runtime_daily_c1_readiness "$SOURCE" "$RELEASE"

cp "$SOURCE/$POSTGRES_RUNTIME_DAILY_C1_MARKER" \
  "$POSTGRES_RUNTIME_CURRENT/$POSTGRES_RUNTIME_DAILY_C1_MARKER"
: > "$EVENTS"
if require_postgres_runtime_daily_c1_transition BLOCKED \
  "$POSTGRES_RUNTIME_CURRENT" >/dev/null 2>&1; then
  echo 'READY to BLOCKED daily C1 downgrade was accepted' >&2
  exit 1
fi
[[ ! -s $EVENTS ]]

cp "$SCRIPT_DIR/production-runtime/social-monitor-daily.service" \
  "$SOURCE/$POSTGRES_RUNTIME_DAILY_SERVICE"
cp "$SCRIPT_DIR/production-runtime/social-monitor-daily.timer" \
  "$SOURCE/$POSTGRES_RUNTIME_DAILY_TIMER"
cp "$SCRIPT_DIR/production-runtime/daily-run.sh" \
  "$SOURCE/$POSTGRES_RUNTIME_DAILY_RUNNER"
cp "$SOURCE/$POSTGRES_RUNTIME_DAILY_SERVICE" \
  "$RELEASE/$POSTGRES_RUNTIME_DAILY_SERVICE"
cp "$SOURCE/$POSTGRES_RUNTIME_DAILY_TIMER" \
  "$RELEASE/$POSTGRES_RUNTIME_DAILY_TIMER"
cp "$SOURCE/$POSTGRES_RUNTIME_DAILY_RUNNER" \
  "$RELEASE/$POSTGRES_RUNTIME_DAILY_RUNNER"
cp "$RELEASE/$POSTGRES_RUNTIME_DAILY_SERVICE" \
  "$SYSTEMD_UNIT_DIR/$POSTGRES_RUNTIME_DAILY_SERVICE"
cp "$RELEASE/$POSTGRES_RUNTIME_DAILY_TIMER" \
  "$SYSTEMD_UNIT_DIR/$POSTGRES_RUNTIME_DAILY_TIMER"
cp "$RELEASE/$POSTGRES_RUNTIME_DAILY_RUNNER" \
  "$CONTROL/$POSTGRES_RUNTIME_DAILY_RUNNER"
printf 'old-v6-service\n' > \
  "$SYSTEMD_UNIT_DIR/$POSTGRES_RUNTIME_DAILY_V6_SERVICE"
printf 'old-v6-timer\n' > "$SYSTEMD_UNIT_DIR/$POSTGRES_RUNTIME_DAILY_V6_TIMER"
install -d "$BACKUP"
snapshot_postgres_runtime_daily_handoff "$BACKUP" "$SYSTEMD_UNIT_DIR"
bridge_postgres_runtime_daily_c1_owner \
  "$RELEASE" "$SYSTEMD_UNIT_DIR" aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
POSTGRES_RUNTIME_DAILY_C1_TEST_BOOT_ID=11111111-2222-4333-8444-555555555555 \
  prepare_postgres_runtime_daily_c1_baseline \
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
OWNER_EVENTS=$FIXTURE/handoff-owner-events
: > "$OWNER_EVENTS"
activate_postgres_runtime_daily_c1_handoff "$RELEASE" "$SYSTEMD_UNIT_DIR" \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "$BACKUP"
diff -u <(printf '%s\n' \
  $'V6\tenable social-monitor-daily.timer' \
  $'V6\tstop social-monitor-reader-summary-production-day.timer' \
  $'LEGACY\tenable social-monitor-daily.timer' \
  $'LEGACY\tdisable social-monitor-reader-summary-production-day.timer' \
  $'LEGACY\tstop social-monitor-reader-summary-production-day.timer' \
  $'LEGACY\tstart social-monitor-daily.timer') "$OWNER_EVENTS"
OWNER_EVENTS=
[[ $LEGACY_UNIT_STATE == enabled && $LEGACY_ACTIVE_STATE == active ]]
[[ $V6_UNIT_STATE == disabled && $V6_ACTIVE_STATE == inactive ]]
[[ $(postgres_runtime_daily_c1_owner_state) == LEGACY ]]
[[ -f $BACKUP/daily-c1-forward-only ]]
verify_postgres_runtime_daily_c1_ready_topology \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

BACKUP_SECOND=$STATE/backup-second
install -d "$BACKUP_SECOND"
LEGACY_UNIT_STATE=enabled LEGACY_ACTIVE_STATE=active
V6_UNIT_STATE=disabled V6_ACTIVE_STATE=inactive
snapshot_postgres_runtime_daily_handoff "$BACKUP_SECOND" "$SYSTEMD_UNIT_DIR"
LEGACY_UNIT_STATE=disabled LEGACY_ACTIVE_STATE=inactive
V6_UNIT_STATE=enabled V6_ACTIVE_STATE=active
restore_postgres_runtime_daily_handoff_states "$BACKUP_SECOND"
[[ $LEGACY_UNIT_STATE == enabled && $LEGACY_ACTIVE_STATE == active ]]
[[ $V6_UNIT_STATE == disabled && $V6_ACTIVE_STATE == inactive ]]

BACKUP_V6_ONLY=$STATE/backup-v6-only
install -d "$BACKUP_V6_ONLY"
rm -f "$SYSTEMD_UNIT_DIR/$POSTGRES_RUNTIME_DAILY_TIMER"
LEGACY_UNIT_STATE=not-found LEGACY_ACTIVE_STATE=inactive
V6_UNIT_STATE=enabled V6_ACTIVE_STATE=active
snapshot_postgres_runtime_daily_handoff "$BACKUP_V6_ONLY" "$SYSTEMD_UNIT_DIR"
cp "$RELEASE/$POSTGRES_RUNTIME_DAILY_TIMER" \
  "$SYSTEMD_UNIT_DIR/$POSTGRES_RUNTIME_DAILY_TIMER"
LEGACY_UNIT_STATE=enabled LEGACY_ACTIVE_STATE=active
V6_UNIT_STATE=disabled V6_ACTIVE_STATE=inactive
# The generic runtime rollback restores the recorded absent legacy timer before
# the helper restores its exact systemd state proof.
rm -f "$SYSTEMD_UNIT_DIR/$POSTGRES_RUNTIME_DAILY_TIMER"
LEGACY_UNIT_STATE=not-found LEGACY_ACTIVE_STATE=inactive
restore_postgres_runtime_daily_handoff_states "$BACKUP_V6_ONLY"
[[ $LEGACY_UNIT_STATE == not-found && $LEGACY_ACTIVE_STATE == inactive ]]
[[ $V6_UNIT_STATE == enabled && $V6_ACTIVE_STATE == active ]]
cp "$RELEASE/$POSTGRES_RUNTIME_DAILY_TIMER" \
  "$SYSTEMD_UNIT_DIR/$POSTGRES_RUNTIME_DAILY_TIMER"

reset_v6_topology() {
  LEGACY_UNIT_STATE=disabled LEGACY_ACTIVE_STATE=inactive
  V6_UNIT_STATE=enabled V6_ACTIVE_STATE=active
  LEGACY_SERVICE_STATE=inactive V6_SERVICE_STATE=inactive
  NEXT_TRIGGER='Wed 2026-08-12 00:15:00 UTC'
  FAIL_COMMAND=''
  SINGLETON_CLEAR=true
}

prepare_v6_handoff_case() {
  local name=$1 marker backup
  backup=$STATE/$name
  reset_v6_topology
  marker=$(postgres_runtime_daily_c1_owner_marker)
  rm -f "$marker"
  persist_postgres_runtime_daily_c1_v6_owner \
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  rm -rf "$backup"
  install -d "$backup"
  HANDOFF_BACKUP=$backup
}

reset_v6_topology
SINGLETON_CLEAR=false
if prove_postgres_runtime_daily_c1_flip_idle >/dev/null 2>&1; then
  echo 'daily C1 handoff accepted a busy singleton' >&2
  exit 1
fi
reset_v6_topology
LEGACY_SERVICE_STATE=failed
prove_postgres_runtime_daily_c1_flip_idle
reset_v6_topology
V6_SERVICE_STATE=active
if prove_postgres_runtime_daily_c1_flip_idle >/dev/null 2>&1; then
  echo 'daily C1 handoff accepted an active v6 service' >&2
  exit 1
fi
for ambiguous_state in active activating deactivating reloading unknown; do
  reset_v6_topology
  LEGACY_SERVICE_STATE=$ambiguous_state
  if prove_postgres_runtime_daily_c1_flip_idle >/dev/null 2>&1; then
    echo "daily C1 handoff accepted ambiguous service state: $ambiguous_state" >&2
    exit 1
  fi
done

# A failure before the durable owner flip remains rollback-safe: legacy is only
# enabled, never started, and V6 remains the effective owner.
: > "$EVENTS"
prepare_v6_handoff_case fail-before-flip
BACKUP_PRE_FLIP=$HANDOFF_BACKUP
FAIL_COMMAND="stop $POSTGRES_RUNTIME_DAILY_V6_TIMER"
if activate_postgres_runtime_daily_c1_handoff \
  "$RELEASE" "$SYSTEMD_UNIT_DIR" \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "$BACKUP_PRE_FLIP" \
  >/dev/null 2>&1; then
  echo 'daily C1 handoff accepted a pre-flip v6 stop failure' >&2
  exit 1
fi
[[ $(postgres_runtime_daily_c1_owner_state) == V6 ]]
[[ $LEGACY_UNIT_STATE == enabled && $LEGACY_ACTIVE_STATE == inactive ]]
[[ $V6_UNIT_STATE == enabled && $V6_ACTIVE_STATE == active ]]
[[ ! -e $BACKUP_PRE_FLIP/daily-c1-forward-only ]]
if grep -Fx "start $POSTGRES_RUNTIME_DAILY_TIMER" "$EVENTS" >/dev/null; then
  echo 'daily C1 legacy timer started before durable owner flip' >&2
  exit 1
fi

# The stopped-v6 window cannot cross the owner boundary unless singleton and
# both services are idle. A failed proof leaves V6 as the durable owner.
: > "$EVENTS"
prepare_v6_handoff_case busy-before-flip
BACKUP_BUSY=$HANDOFF_BACKUP
SINGLETON_CLEAR=false
if activate_postgres_runtime_daily_c1_handoff \
  "$RELEASE" "$SYSTEMD_UNIT_DIR" \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "$BACKUP_BUSY" \
  >/dev/null 2>&1; then
  echo 'daily C1 handoff accepted a busy pre-flip singleton' >&2
  exit 1
fi
[[ $(postgres_runtime_daily_c1_owner_state) == V6 ]]
[[ ! -e $BACKUP_BUSY/daily-c1-forward-only ]]
[[ $LEGACY_UNIT_STATE == enabled && $LEGACY_ACTIVE_STATE == inactive ]]
if grep -Fx "start $POSTGRES_RUNTIME_DAILY_TIMER" "$EVENTS" >/dev/null; then
  echo 'daily C1 busy proof started legacy before owner flip' >&2
  exit 1
fi

# A failure after the owner flip is forward-only. Retrying from LEGACY skips
# the pre-flip stop/proof and completes v6 retirement before legacy starts.
: > "$EVENTS"
prepare_v6_handoff_case fail-after-flip
BACKUP_POST_FLIP=$HANDOFF_BACKUP
FAIL_COMMAND="disable $POSTGRES_RUNTIME_DAILY_V6_TIMER"
if activate_postgres_runtime_daily_c1_handoff \
  "$RELEASE" "$SYSTEMD_UNIT_DIR" \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "$BACKUP_POST_FLIP" \
  >/dev/null 2>&1; then
  echo 'daily C1 handoff accepted a post-flip v6 disable failure' >&2
  exit 1
fi
[[ $(postgres_runtime_daily_c1_owner_state) == LEGACY ]]
[[ -f $BACKUP_POST_FLIP/daily-c1-forward-only ]]
[[ $LEGACY_ACTIVE_STATE == inactive ]]
FAIL_COMMAND=
: > "$EVENTS"
activate_postgres_runtime_daily_c1_handoff \
  "$RELEASE" "$SYSTEMD_UNIT_DIR" \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "$BACKUP_POST_FLIP"
[[ $(grep -Fxc "stop $POSTGRES_RUNTIME_DAILY_V6_TIMER" "$EVENTS") == 1 ]]
[[ $(grep -Fxc "start $POSTGRES_RUNTIME_DAILY_TIMER" "$EVENTS") == 1 ]]
[[ $V6_UNIT_STATE == disabled && $V6_ACTIVE_STATE == inactive ]]
[[ $LEGACY_UNIT_STATE == enabled && $LEGACY_ACTIVE_STATE == active ]]

# If the final legacy start fails, V6 is already retired and a retry only
# completes the same forward reconciliation.
: > "$EVENTS"
prepare_v6_handoff_case fail-legacy-start
BACKUP_START=$HANDOFF_BACKUP
FAIL_COMMAND="start $POSTGRES_RUNTIME_DAILY_TIMER"
if activate_postgres_runtime_daily_c1_handoff \
  "$RELEASE" "$SYSTEMD_UNIT_DIR" \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "$BACKUP_START" \
  >/dev/null 2>&1; then
  echo 'daily C1 handoff accepted a post-flip legacy start failure' >&2
  exit 1
fi
[[ $(postgres_runtime_daily_c1_owner_state) == LEGACY ]]
[[ -f $BACKUP_START/daily-c1-forward-only ]]
[[ $V6_UNIT_STATE == disabled && $V6_ACTIVE_STATE == inactive ]]
[[ $LEGACY_UNIT_STATE == enabled && $LEGACY_ACTIVE_STATE == inactive ]]
FAIL_COMMAND=
activate_postgres_runtime_daily_c1_handoff \
  "$RELEASE" "$SYSTEMD_UNIT_DIR" \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "$BACKUP_START"
[[ $LEGACY_ACTIVE_STATE == active ]]

reset_v6_topology
FAIL_COMMAND="start $POSTGRES_RUNTIME_DAILY_V6_TIMER"
if restore_postgres_runtime_daily_handoff_states "$BACKUP" \
  >/dev/null 2>&1; then
  echo 'daily C1 rollback accepted timer restore failure' >&2
  exit 1
fi
[[ -d $BACKUP ]]

reset_v6_topology
verify_postgres_runtime_daily_c1_ready_static \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
persist_postgres_runtime_daily_c1_containment_requested \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
containment_marker=$(postgres_runtime_daily_c1_containment_marker)
[[ $(file_mode "$containment_marker") == 444 ]]
[[ $(postgres_runtime_daily_c1_containment_state) == requested ]]
verify_postgres_runtime_daily_c1_containment \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa REQUESTED
cmp -s "$containment_marker" <(printf '%s\n' \
  schemaVersion=reader_summary.daily_c1_containment.v1 \
  state=REQUESTED \
  readySha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)
containment_inode=$(file_inode "$containment_marker")
persist_postgres_runtime_daily_c1_containment_requested \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
[[ $(file_inode "$containment_marker") == "$containment_inode" ]]
verify_postgres_runtime_daily_c1_containment \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
if persist_postgres_runtime_daily_c1_containment_requested \
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb >/dev/null 2>&1; then
  echo 'conflicting daily C1 containment incident was accepted' >&2
  exit 1
fi

# A crash immediately after durable REQUESTED leaves cadence blocked by the
# runner and a later deploy completes the stop/proof/promotion sequence.
LEGACY_UNIT_STATE=enabled LEGACY_ACTIVE_STATE=active
V6_UNIT_STATE=disabled V6_ACTIVE_STATE=inactive
enforce_postgres_runtime_daily_c1_containment "$RELEASE" "$SYSTEMD_UNIT_DIR"
[[ $(postgres_runtime_daily_c1_containment_state) == contained ]]
verify_postgres_runtime_daily_c1_containment \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa CONTAINED
cmp -s "$containment_marker" <(printf '%s\n' \
  schemaVersion=reader_summary.daily_c1_containment.v1 \
  state=CONTAINED \
  readySha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)
promote_postgres_runtime_daily_c1_containment_contained \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

for intermediate_state in 'enabled active' 'enabled inactive' 'disabled inactive'; do
  read -r LEGACY_UNIT_STATE LEGACY_ACTIVE_STATE <<< "$intermediate_state"
  V6_UNIT_STATE=disabled V6_ACTIVE_STATE=inactive
  enforce_postgres_runtime_daily_c1_containment "$RELEASE" "$SYSTEMD_UNIT_DIR"
  [[ $LEGACY_UNIT_STATE == disabled && $LEGACY_ACTIVE_STATE == inactive ]]
  [[ $V6_UNIT_STATE == disabled && $V6_ACTIVE_STATE == inactive ]]
done
# A later READY code release remains contained by the original incident marker.
LEGACY_UNIT_STATE=enabled LEGACY_ACTIVE_STATE=active
activate_postgres_runtime_daily_c1_handoff "$RELEASE" "$SYSTEMD_UNIT_DIR" \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "$BACKUP"
[[ $LEGACY_UNIT_STATE == disabled && $LEGACY_ACTIVE_STATE == inactive ]]

# A crash after marker persistence but before timer stop is canonicalized
# before the deploy snapshot, so a later rollback cannot reactivate cadence.
LEGACY_UNIT_STATE=enabled LEGACY_ACTIVE_STATE=active
V6_UNIT_STATE=disabled V6_ACTIVE_STATE=inactive
enforce_postgres_runtime_daily_c1_containment "$RELEASE" "$SYSTEMD_UNIT_DIR"
BACKUP_CONTAINED=$STATE/backup-contained
install -d "$BACKUP_CONTAINED"
snapshot_postgres_runtime_daily_handoff "$BACKUP_CONTAINED" "$SYSTEMD_UNIT_DIR"
LEGACY_UNIT_STATE=enabled LEGACY_ACTIVE_STATE=active
restore_postgres_runtime_daily_handoff_states "$BACKUP_CONTAINED"
[[ $LEGACY_UNIT_STATE == disabled && $LEGACY_ACTIVE_STATE == inactive ]]
[[ $V6_UNIT_STATE == disabled && $V6_ACTIVE_STATE == inactive ]]

chmod 0644 "$containment_marker"
if postgres_runtime_daily_c1_containment_state >/dev/null 2>&1; then
  echo 'wrong-mode daily C1 containment marker was accepted' >&2
  exit 1
fi
chmod 0444 "$containment_marker"
rm -f "$containment_marker"
printf '%s\n' tampered > "$containment_marker"
chmod 0444 "$containment_marker"
if postgres_runtime_daily_c1_containment_state >/dev/null 2>&1; then
  echo 'tampered daily C1 containment marker was accepted' >&2
  exit 1
fi
rm -f "$containment_marker"
ln -s "$SOURCE/$POSTGRES_RUNTIME_DAILY_C1_MARKER" "$containment_marker"
if postgres_runtime_daily_c1_containment_state >/dev/null 2>&1; then
  echo 'symlink daily C1 containment marker was accepted' >&2
  exit 1
fi
rm -f "$containment_marker"

# Durability failpoints model process loss at the REQUESTED publication and
# CONTAINED promotion boundaries. A restart must recognize the published
# canonical marker and repeat the missing fsync without replacing its state.
ORIGINAL_CONTROL=$CONTROL
CONTROL=$FIXTURE/containment-durability-control
install -d "$CONTROL"
DURABILITY_MARKER=$(postgres_runtime_daily_c1_containment_marker)
FSYNC_EVENTS=$FIXTURE/containment-fsync-events
FSYNC_FAIL=
postgres_runtime_daily_c1_fsync_path_and_parent() {
  printf 'path-and-parent\t%s\n' "$1" >> "$FSYNC_EVENTS"
  if [[ $FSYNC_FAIL == staged && $1 != "$DURABILITY_MARKER" ]]; then
    return 1
  fi
  [[ $FSYNC_FAIL != published || $1 != "$DURABILITY_MARKER" ]]
}
postgres_runtime_daily_c1_fsync_parent() {
  printf 'parent\t%s\n' "$1" >> "$FSYNC_EVENTS"
  [[ $FSYNC_FAIL != parent ]]
}

: > "$FSYNC_EVENTS"
FSYNC_FAIL=staged
if persist_postgres_runtime_daily_c1_containment_requested \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa >/dev/null 2>&1; then
  echo 'daily C1 REQUESTED published before staged-file fsync' >&2
  exit 1
fi
[[ ! -e $DURABILITY_MARKER && ! -L $DURABILITY_MARKER ]]
[[ -z $(find "$CONTROL" -maxdepth 1 -name 'reader-summary-daily-c1-contained.v1.next.*' -print -quit) ]]

: > "$FSYNC_EVENTS"
FSYNC_FAIL=parent
if persist_postgres_runtime_daily_c1_containment_requested \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa >/dev/null 2>&1; then
  echo 'daily C1 REQUESTED accepted a failed post-link parent fsync' >&2
  exit 1
fi
[[ $(postgres_runtime_daily_c1_containment_state) == requested ]]
grep -F $'path-and-parent\t'"$DURABILITY_MARKER.next.$$" \
  "$FSYNC_EVENTS" >/dev/null
grep -Fx $'parent\t'"$DURABILITY_MARKER" "$FSYNC_EVENTS" >/dev/null

# Restart after link publication re-fsyncs the existing immutable marker.
: > "$FSYNC_EVENTS"
FSYNC_FAIL=
persist_postgres_runtime_daily_c1_containment_requested \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
diff -u <(printf 'path-and-parent\t%s\n' "$DURABILITY_MARKER") \
  "$FSYNC_EVENTS"

: > "$FSYNC_EVENTS"
FSYNC_FAIL=published
if promote_postgres_runtime_daily_c1_containment_contained \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa >/dev/null 2>&1; then
  echo 'daily C1 CONTAINED accepted a failed post-rename fsync' >&2
  exit 1
fi
[[ $(postgres_runtime_daily_c1_containment_state) == contained ]]
grep -F $'path-and-parent\t'"$DURABILITY_MARKER.contained.$$" \
  "$FSYNC_EVENTS" >/dev/null
grep -Fx $'path-and-parent\t'"$DURABILITY_MARKER" \
  "$FSYNC_EVENTS" >/dev/null

# Restart after atomic promotion re-fsyncs CONTAINED and remains idempotent.
: > "$FSYNC_EVENTS"
FSYNC_FAIL=
promote_postgres_runtime_daily_c1_containment_contained \
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
diff -u <(printf 'path-and-parent\t%s\n' "$DURABILITY_MARKER") \
  "$FSYNC_EVENTS"
CONTROL=$ORIGINAL_CONTROL

printf 'postgres runtime daily C1 readiness helper tests passed\n'
