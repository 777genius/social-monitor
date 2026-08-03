#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/social-monitor-rabbitmq-quorum-recovery.XXXXXX")
cleanup_fixture() {
  find "$FIXTURE" -type d -exec chmod u+rwx {} + 2>/dev/null || true
  find "$FIXTURE" -type f -exec chmod u+rw {} + 2>/dev/null || true
  rm -rf "$FIXTURE"
}
trap cleanup_fixture EXIT

PROJECT=rabbitmq-recovery-fixture
CONTROL=$FIXTURE/control
RABBITMQ_QUORUM_RECOVERY_STATE_ROOT=$FIXTURE/state
RABBITMQ_QUORUM_SNAPSHOT_MAX_BYTES=1048576
RABBITMQ_QUORUM_SNAPSHOT_MAX_ENTRIES=100
RABBITMQ_QUORUM_SNAPSHOT_MIN_FREE_BYTES=0
RABBITMQ_QUORUM_SNAPSHOT_RETENTION=2
RABBITMQ_QUORUM_RECOVERY_TIMEOUT_SECONDS=3
RABBITMQ_QUORUM_RECOVERY_SLEEP_SECONDS=1
RABBITMQ_QUORUM_PROBE_NOPROC=64
TARGET_ID=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
TARGET_IMAGE=sha256:abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd
TARGET_HOSTNAME=rabbitmq-recovery-fixture
TARGET_VOLUME=${PROJECT}_rabbitmq-data
CLONE_ID=fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210
SOURCE_DATA=$FIXTURE/source-data
DOCKER_CALLS=$FIXTURE/docker-calls
SOURCE_PROBE_STATUS=64
CLONE_PROBE_STATUS=0
TARGET_PROBE_STATUS=0
TARGET_RESTARTS=0
RESTART_LOG=$FIXTURE/restarts.log
STARTED_AT_FILE=$FIXTURE/started-at
CLONE_NAME=''
FLOCK_MODE=ok
START_FINGERPRINT_STATUS=0
mkdir -p "$SOURCE_DATA/mnesia/rabbit@${TARGET_HOSTNAME}/quorum"
printf 'immutable queue data\n' > "$SOURCE_DATA/mnesia/rabbit@${TARGET_HOSTNAME}/quorum/data"

# shellcheck source=ops/deploy/rabbitmq-quorum-recovery.sh
source "$SCRIPT_DIR/rabbitmq-quorum-recovery.sh"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

sleep() { :; }

flock() {
  [[ $FLOCK_MODE == ok ]]
}

rabbitmq_quorum_health_identify_target() {
  RABBITMQ_QUORUM_TARGET_CONTAINER_ID=$TARGET_ID
  RABBITMQ_QUORUM_TARGET_IMAGE_ID=$TARGET_IMAGE
  RABBITMQ_QUORUM_TARGET_HOSTNAME=$TARGET_HOSTNAME
  RABBITMQ_QUORUM_TARGET_VOLUME=$TARGET_VOLUME
  export RABBITMQ_QUORUM_TARGET_CONTAINER_ID RABBITMQ_QUORUM_TARGET_IMAGE_ID \
    RABBITMQ_QUORUM_TARGET_HOSTNAME RABBITMQ_QUORUM_TARGET_VOLUME
}

rabbitmq_quorum_health_probe_target() {
  return "$SOURCE_PROBE_STATUS"
}

rabbitmq_quorum_health_require_steady_state() {
  [[ $TARGET_PROBE_STATUS == 0 ]]
}

rabbitmq_quorum_recovery_probe_container() {
  local container_id=$1

  if [[ $container_id == "$CLONE_ID" ]]; then
    return "$CLONE_PROBE_STATUS"
  fi
  [[ $container_id == "$TARGET_ID" ]] || return 1
  return "$TARGET_PROBE_STATUS"
}

docker() {
  local argument mount_source
  printf '%s\n' "$*" >> "$DOCKER_CALLS"
  case $1 in
    inspect)
      [[ $2 == "$TARGET_ID" && $3 == --format && $4 == '{{.State.StartedAt}}' ]] || return 79
      ((START_FINGERPRINT_STATUS == 0)) || return "$START_FINGERPRINT_STATUS"
      cat "$STARTED_AT_FILE"
      ;;
    run)
      if [[ " $* " == *" --volumes-from ${TARGET_ID}:ro "* ]]; then
        tar -C "$SOURCE_DATA" -cf - .
        return 0
      fi
      if [[ " $* " == *' --entrypoint tar '* && " $* " == *' -C /restore -xf - '* ]]; then
        for argument in "$@"; do
          case $argument in
            type=bind,source=*,destination=/restore)
              mount_source=${argument#type=bind,source=}
              mount_source=${mount_source%,destination=/restore}
              ;;
          esac
        done
        [[ -n ${mount_source:-} ]] || return 71
        tar -C "$mount_source" -xf -
        return 0
      fi
      if [[ " $* " == *' --detach '* && " $* " == *' --network none '* ]]; then
        for ((index = 1; index <= $#; index += 1)); do
          if [[ ${!index} == --name ]]; then
            next=$((index + 1))
            CLONE_NAME=${!next}
          fi
        done
        [[ -n $CLONE_NAME ]] || return 72
        printf '%s\n' "$CLONE_ID"
        return 0
      fi
      return 73
      ;;
    ps)
      [[ " $* " == *' --no-trunc '* && " $* " == *" name=^/${CLONE_NAME}$ "* ]] || return 74
      printf '%s\n' "$CLONE_ID"
      ;;
    restart)
      [[ $2 == "$TARGET_ID" ]] || return 75
      TARGET_RESTARTS=$((TARGET_RESTARTS + 1))
      printf 'restart\n' >> "$RESTART_LOG"
      printf '2026-08-03T01:00:%02d.000000000Z\n' \
        "$(wc -l < "$RESTART_LOG" | tr -d '[:space:]')" > "$STARTED_AT_FILE"
      printf '%s\n' "$TARGET_ID"
      ;;
    stop)
      [[ $2 == "$CLONE_ID" ]] || return 76
      ;;
    rm)
      [[ $2 == -f && $3 == "$CLONE_NAME" ]] || return 77
      ;;
    *) return 78 ;;
  esac
}

assert_file_contains() {
  local needle=$1 path=$2
  grep -F "$needle" "$path" >/dev/null || fail "missing $needle in $path"
}

reset_state() {
  RABBITMQ_QUORUM_RECOVERY_STATE_ROOT=$FIXTURE/state
  SOURCE_PROBE_STATUS=64
  CLONE_PROBE_STATUS=0
  TARGET_PROBE_STATUS=0
  TARGET_RESTARTS=0
  CLONE_NAME=''
  START_FINGERPRINT_STATUS=0
  : > "$DOCKER_CALLS"
  : > "$RESTART_LOG"
  printf '%s\n' '2026-08-03T01:00:00.000000000Z' > "$STARTED_AT_FILE"
  if [[ -d $RABBITMQ_QUORUM_RECOVERY_STATE_ROOT ]]; then
    find "$RABBITMQ_QUORUM_RECOVERY_STATE_ROOT" -type d -exec chmod u+rwx {} + 2>/dev/null || true
    find "$RABBITMQ_QUORUM_RECOVERY_STATE_ROOT" -type f -exec chmod u+rw {} + 2>/dev/null || true
  fi
  rm -rf "$RABBITMQ_QUORUM_RECOVERY_STATE_ROOT"
}

reset_state
mkdir -p "$RABBITMQ_QUORUM_RECOVERY_STATE_ROOT/.snapshot-interrupted"
if ! rabbitmq_quorum_recovery_ensure_steady; then
  fail 'all-queue noproc did not complete bounded snapshot/bootstrap recovery'
fi
[[ $(wc -l < "$RESTART_LOG" | tr -d '[:space:]') == 1 ]] || fail 'recovery did not restart exactly the existing target once'
[[ ! -e $RABBITMQ_QUORUM_RECOVERY_STATE_ROOT/.snapshot-interrupted ]] || fail 'partial snapshot was not cleaned'
assert_file_contains "run --rm --network none --read-only --volumes-from ${TARGET_ID}:ro" "$DOCKER_CALLS"
assert_file_contains 'run --interactive --rm --network none --read-only --user 0:0' "$DOCKER_CALLS"
assert_file_contains "run --detach --rm --name social-monitor-rabbitmq-proof-${TARGET_ID:0:12}-" "$DOCKER_CALLS"
assert_file_contains "restart $TARGET_ID" "$DOCKER_CALLS"
assert_file_contains 'ps --no-trunc --filter name=^/social-monitor-rabbitmq-proof-' "$DOCKER_CALLS"
state_file=$RABBITMQ_QUORUM_RECOVERY_STATE_ROOT/recovery.state
assert_file_contains 'phase=complete' "$state_file"
snapshot_dir=$(awk -F= '$1 == "snapshot_dir" { print $2 }' "$state_file")
[[ -d $snapshot_dir && -f $snapshot_dir/rabbitmq-data.tar && -f $snapshot_dir/manifest ]] || fail 'immutable snapshot files are missing'
[[ ! -e $snapshot_dir/.clone-* ]] || fail 'isolated clone was not cleaned'

if ! rabbitmq_quorum_recovery_ensure_steady; then
  fail 'completed recovery state did not resume idempotently'
fi
[[ $(wc -l < "$RESTART_LOG" | tr -d '[:space:]') == 1 ]] || fail 'completed recovery state restarted the target again'

RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_DIR=$snapshot_dir
RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_SHA256=$(awk -F= '$1 == "snapshot_sha256" { print $2 }' "$state_file")
RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_BYTES=$(awk -F= '$1 == "snapshot_bytes" { print $2 }' "$state_file")
RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_ENTRIES=$(awk -F= '$1 == "snapshot_entries" { print $2 }' "$state_file")
RABBITMQ_QUORUM_RECOVERY_PRE_RESTART_FINGERPRINT=$(
  rabbitmq_quorum_recovery_container_start_fingerprint "$TARGET_ID"
)
rabbitmq_quorum_health_identify_target
rabbitmq_quorum_recovery_write_state "$RABBITMQ_QUORUM_RECOVERY_STATE_ROOT" restart_pending \
  "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_DIR" "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_SHA256" \
  "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_BYTES" "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_ENTRIES"
if ! rabbitmq_quorum_recovery_ensure_steady; then
  fail 'restart-pending state did not resume the exact same-container restart'
fi
[[ $(wc -l < "$RESTART_LOG" | tr -d '[:space:]') == 2 ]] || fail 'restart-pending state did not execute the missing restart exactly once'

RABBITMQ_QUORUM_RECOVERY_PRE_RESTART_FINGERPRINT=$(
  printf '%064d' 0
)
rabbitmq_quorum_recovery_write_state "$RABBITMQ_QUORUM_RECOVERY_STATE_ROOT" restart_pending \
  "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_DIR" "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_SHA256" \
  "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_BYTES" "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_ENTRIES"
if ! rabbitmq_quorum_recovery_ensure_steady; then
  fail 'restart-pending state did not reconcile an already-issued exact-container restart'
fi
[[ $(wc -l < "$RESTART_LOG" | tr -d '[:space:]') == 2 ]] || fail 'restart reconciliation duplicated an already-issued restart'

chmod u+w "$snapshot_dir" "$snapshot_dir/manifest"
printf 'version=corrupt\n' > "$snapshot_dir/manifest"
if rabbitmq_quorum_recovery_ensure_steady >/dev/null 2>&1; then
  fail 'tampered immutable snapshot manifest was accepted'
fi
[[ $(wc -l < "$RESTART_LOG" | tr -d '[:space:]') == 2 ]] || fail 'tampered snapshot restarted the target'

reset_state
SOURCE_PROBE_STATUS=1
if rabbitmq_quorum_recovery_ensure_steady >/dev/null 2>&1; then
  fail 'non-noproc incident entered automatic recovery'
fi

reset_state
FLOCK_MODE=busy
if rabbitmq_quorum_recovery_ensure_steady >/dev/null 2>&1; then
  fail 'concurrent recovery lock was accepted'
fi
FLOCK_MODE=ok
[[ ! -s $DOCKER_CALLS ]] || fail 'locked recovery reached Docker actions'
[[ $(wc -l < "$RESTART_LOG" | tr -d '[:space:]') == 0 ]] || fail 'non-noproc incident restarted RabbitMQ'
if grep -F 'run ' "$DOCKER_CALLS" >/dev/null; then
  fail 'non-noproc incident created a snapshot or clone'
fi

reset_state
CLONE_PROBE_STATUS=1
if rabbitmq_quorum_recovery_ensure_steady >/dev/null 2>&1; then
  fail 'failed isolated clone was accepted'
fi
[[ $(wc -l < "$RESTART_LOG" | tr -d '[:space:]') == 0 ]] || fail 'failed clone allowed target restart'
if find "$RABBITMQ_QUORUM_RECOVERY_STATE_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'snapshot-*' | grep -q .; then
  fail 'failed isolated clone left an unbounded candidate snapshot behind'
fi

reset_state
START_FINGERPRINT_STATUS=1
if rabbitmq_quorum_recovery_ensure_steady >/dev/null 2>&1; then
  fail 'missing target start fingerprint was accepted'
fi
if find "$RABBITMQ_QUORUM_RECOVERY_STATE_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'snapshot-*' | grep -q .; then
  fail 'failed target fingerprint left an unbound candidate snapshot behind'
fi

reset_state
mkdir -p "$RABBITMQ_QUORUM_RECOVERY_STATE_ROOT"
for index in 1 2 3; do
  directory=$RABBITMQ_QUORUM_RECOVERY_STATE_ROOT/snapshot-retention-$index
  mkdir -p "$directory"
  touch -t "20260803010$index" "$directory"
done
rabbitmq_quorum_recovery_apply_retention "$RABBITMQ_QUORUM_RECOVERY_STATE_ROOT" 2
[[ ! -d $RABBITMQ_QUORUM_RECOVERY_STATE_ROOT/snapshot-retention-1 ]] || fail 'retention did not remove oldest snapshot'
[[ -d $RABBITMQ_QUORUM_RECOVERY_STATE_ROOT/snapshot-retention-2 && -d $RABBITMQ_QUORUM_RECOVERY_STATE_ROOT/snapshot-retention-3 ]] || fail 'retention removed the wrong snapshots'

for forbidden in \
  'rabbitmqctl reset' \
  'rabbitmqctl force_reset' \
  'rabbitmqadmin' \
  'docker compose' \
  'docker volume create' \
  'docker volume rm'; do
  if grep -F "$forbidden" "$SCRIPT_DIR/rabbitmq-quorum-recovery.sh" >/dev/null; then
    fail "recovery script contains forbidden operation: $forbidden"
  fi
done

echo 'RabbitMQ quorum recovery contract tests passed'
