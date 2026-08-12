#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/social-monitor-rabbitmq-quorum-health.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

PROJECT=rabbitmq-health-fixture
RABBITMQ_QUORUM_HEALTH_QUEUES='jobs.freshness.scan,jobs.summary.execute,jobs.reader-summary.execute,jobs.delivery.attempt.send,events.delivery.summary.ready'
TARGET_ID=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
TARGET_IMAGE=sha256:abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd
TARGET_VOLUME=${PROJECT}_rabbitmq-data
TARGET_HOSTNAME=rabbitmq-fixture
DOCKER_CALLS=$FIXTURE/docker-calls
QUEUE_MODE=healthy
CLUSTER_MODE=healthy
CLUSTER_VERSION=4.3.4
METADATA_INIT_STATUS=0
METADATA_INIT_OUTPUT="Metadata store on node rabbit@$TARGET_HOSTNAME has completed its initialization"
METADATA_DATA_STATUS=69
METADATA_DATA_OUTPUT=$'Error:\nnoproc'
METADATA_STATUS_STATUS=0
METADATA_STATUS_OUTPUT='[]'
VHOST_STATUS=0
VHOST_OUTPUT=''
LISTENERS_STATUS=0
LISTENERS_OUTPUT="Node rabbit@$TARGET_HOSTNAME reported no enabled listeners."
WORKER_MODE=healthy
WORKER_ID=abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd

# shellcheck source=ops/deploy/rabbitmq-quorum-health.sh
source "$SCRIPT_DIR/rabbitmq-quorum-health.sh"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

cluster_status_json() {
  cat <<JSON
{"alarms":[],"running_nodes":["rabbit@$TARGET_HOSTNAME"],"cluster_tags":[],"listeners":{"rabbit@$TARGET_HOSTNAME":[]},"cpu_cores":{"rabbit@$TARGET_HOSTNAME":6},"cluster_name":"rabbit@$TARGET_HOSTNAME","disk_nodes":["rabbit@$TARGET_HOSTNAME"],"versions":{"rabbit@$TARGET_HOSTNAME":{"erlang_version":"27.3.4.13","rabbitmq_name":"RabbitMQ","rabbitmq_version":"$CLUSTER_VERSION"}},"partitions":{},"maintenance_status":{"rabbit@$TARGET_HOSTNAME":"not under maintenance"}}
JSON
}

quorum_status_json() {
  cat <<JSON
[{"Node Name":"rabbit@$TARGET_HOSTNAME","Raft State":"leader","Membership":"voter","Last Log Index":2,"Last Written":2,"Last Applied":2,"Commit Index":2,"Snapshot Index":-1,"Term":1,"Machine Version":8}]
JSON
}

quorum_noproc_json() {
  cat <<JSON
[{"Node Name":"rabbit@$TARGET_HOSTNAME","Raft State":"noproc","Membership":"unknown","Last Log Index":2,"Last Written":2,"Last Applied":2,"Commit Index":2,"Snapshot Index":-1,"Term":1,"Machine Version":8}]
JSON
}

target_inspect_json() {
  cat <<JSON
[{"Id":"$TARGET_ID","Image":"$TARGET_IMAGE","RestartCount":0,"State":{"Status":"running","OOMKilled":false},"Config":{"Hostname":"$TARGET_HOSTNAME","Labels":{"com.docker.compose.project":"$PROJECT","com.docker.compose.service":"rabbitmq"}},"Mounts":[{"Type":"volume","Name":"$TARGET_VOLUME","Destination":"/var/lib/rabbitmq","RW":true}]}]
JSON
}

worker_inspect_json() {
  case $WORKER_MODE in
    healthy)
      printf '[{"Id":"%s","RestartCount":3,"State":{"Status":"running","OOMKilled":false}}]\n' "$WORKER_ID"
      ;;
    exited)
      printf '[{"Id":"%s","RestartCount":3,"State":{"Status":"exited","OOMKilled":false}}]\n' "$WORKER_ID"
      ;;
    oom)
      printf '[{"Id":"%s","RestartCount":3,"State":{"Status":"running","OOMKilled":true}}]\n' "$WORKER_ID"
      ;;
    malformed)
      printf '[{"Id":"%s","RestartCount":"3","State":{"Status":"running","OOMKilled":false}}]\n' "$WORKER_ID"
      ;;
    *) fail "unknown worker mode: $WORKER_MODE" ;;
  esac
}

docker() {
  printf '%s\n' "$*" >> "$DOCKER_CALLS"
  case $1 in
    ps)
      [[ " $* " == *' --no-trunc '* ]] || return 91
      [[ " $* " == *" label=com.docker.compose.project=$PROJECT "* ]] || return 92
      [[ " $* " == *' label=com.docker.compose.service=rabbitmq '* ]] || return 93
      printf '%s\n' "$TARGET_ID"
      ;;
    inspect)
      if [[ $2 == "$TARGET_ID" ]]; then
        target_inspect_json
      else
        worker_inspect_json
      fi
      ;;
    volume)
      [[ $2 == inspect && $3 == "$TARGET_VOLUME" ]] || return 94
      printf '%s\n' "[{\"Name\":\"$TARGET_VOLUME\",\"Driver\":\"local\",\"Labels\":{\"com.docker.compose.project\":\"$PROJECT\",\"com.docker.compose.volume\":\"rabbitmq-data\"}}]"
      ;;
    exec)
      [[ $2 == "$TARGET_ID" ]] || return 95
      case $3 in
        rabbitmq-diagnostics)
          case $4 in
            cluster_status)
              [[ $5 == --formatter && $6 == json ]] || return 96
              case $CLUSTER_MODE in
                healthy) cluster_status_json ;;
                alarm) cluster_status_json | sed 's/"alarms":\[\]/"alarms":["memory"]/' ;;
                partition) cluster_status_json | sed 's/"partitions":{}/"partitions":{"rabbit@other":["rabbit@fixture"]}/' ;;
                malformed) printf '%s\n' '{"running_nodes":[]}' ;;
                *) fail "unknown cluster mode: $CLUSTER_MODE" ;;
              esac
              ;;
            metadata_store_status)
              [[ $5 == --formatter && $6 == json ]] || return 96
              printf '%s\n' "$METADATA_STATUS_OUTPUT"
              return "$METADATA_STATUS_STATUS"
              ;;
            -q)
              (($# == 5)) || return 96
              case $5 in
                check_if_metadata_store_is_initialized)
                  printf '%s\n' "$METADATA_INIT_OUTPUT"
                  return "$METADATA_INIT_STATUS"
                  ;;
                check_if_metadata_store_is_initialized_with_data)
                  printf '%s\n' "$METADATA_DATA_OUTPUT"
                  return "$METADATA_DATA_STATUS"
                  ;;
                listeners)
                  printf '%s\n' "$LISTENERS_OUTPUT"
                  return "$LISTENERS_STATUS"
                  ;;
                *) return 96 ;;
              esac
              ;;
            *) return 96 ;;
          esac
          ;;
        rabbitmq-queues)
          [[ $4 == quorum_status && $5 == --vhost && $6 == "$RABBITMQ_QUORUM_HEALTH_VHOST" && $8 == --formatter && $9 == json ]] || return 97
          case $QUEUE_MODE in
            healthy) quorum_status_json ;;
            noproc) quorum_noproc_json ;;
            not-found)
              printf "queue '%s' was not found in virtual host '/'\n" "$7"
              return 65
              ;;
            not-found-malformed)
              printf "Queue '%s' was not found in virtual host '/'\n" "$7"
              return 65
              ;;
            not-found-wrong-exit)
              printf "queue '%s' was not found in virtual host '/'\n" "$7"
              return 64
              ;;
            not-found-mixed)
              if [[ $7 == events.delivery.summary.ready ]]; then
                return 65
              fi
              printf "queue '%s' was not found in virtual host '/'\n" "$7"
              return 65
              ;;
            malformed) printf '%s\n' '[{"node":"rabbit@fixture"}]' ;;
            no-leader) quorum_status_json | sed 's/"Raft State":"leader"/"Raft State":"follower"/' ;;
            non-voter) quorum_status_json | sed 's/"Membership":"voter"/"Membership":"promotable"/' ;;
            *) fail "unknown queue mode: $QUEUE_MODE" ;;
          esac
          ;;
        rabbitmqctl)
          [[ $4 == -q && $5 == list_vhosts && $6 == name ]] || return 98
          [[ -z $VHOST_OUTPUT ]] || printf '%s\n' "$VHOST_OUTPUT"
          return "$VHOST_STATUS"
          ;;
        *) return 98 ;;
      esac
      ;;
    *) return 99 ;;
  esac
}

assert_probe_status() {
  local expected=$1 actual=0
  if rabbitmq_quorum_health_probe_target; then
    actual=0
  else
    actual=$?
  fi
  [[ $actual == "$expected" ]] || fail "expected probe status $expected, got $actual"
}

assert_steady_rejected() {
  if rabbitmq_quorum_health_require_steady_state >/dev/null 2>&1; then
    fail 'steady-state health unexpectedly accepted a hostile state'
  fi
}

reset_metadata_fingerprint() {
  RABBITMQ_QUORUM_HEALTH_VHOST=/
  METADATA_INIT_STATUS=0
  METADATA_INIT_OUTPUT="Metadata store on node rabbit@$TARGET_HOSTNAME has completed its initialization"
  METADATA_DATA_STATUS=69
  METADATA_DATA_OUTPUT=$'Error:\nnoproc'
  METADATA_STATUS_STATUS=0
  METADATA_STATUS_OUTPUT='[]'
  VHOST_STATUS=0
  VHOST_OUTPUT=''
  LISTENERS_STATUS=0
  LISTENERS_OUTPUT="Node rabbit@$TARGET_HOSTNAME reported no enabled listeners."
  : > "$DOCKER_CALLS"
}

: > "$DOCKER_CALLS"
assert_probe_status 0
grep -Fx "ps --no-trunc --filter label=com.docker.compose.project=$PROJECT --filter label=com.docker.compose.service=rabbitmq --format {{.ID}}" "$DOCKER_CALLS" >/dev/null
grep -F "exec $TARGET_ID rabbitmq-diagnostics cluster_status --formatter json" "$DOCKER_CALLS" >/dev/null
grep -F "exec $TARGET_ID rabbitmq-queues quorum_status --vhost / jobs.freshness.scan --formatter json" "$DOCKER_CALLS" >/dev/null
grep -F "exec $TARGET_ID rabbitmq-queues quorum_status --vhost / events.delivery.summary.ready --formatter json" "$DOCKER_CALLS" >/dev/null

QUEUE_MODE=noproc
assert_probe_status "$RABBITMQ_QUORUM_PROBE_NOPROC"
assert_steady_rejected

QUEUE_MODE=not-found
reset_metadata_fingerprint
assert_probe_status "$RABBITMQ_QUORUM_PROBE_METADATA_NOPROC"
[[ $(grep -c 'check_if_metadata_store_is_initialized_with_data' "$DOCKER_CALLS") == 1 ]] || fail 'metadata fingerprint was not run exactly once'
grep -Fx "exec $TARGET_ID rabbitmq-diagnostics -q check_if_metadata_store_is_initialized" "$DOCKER_CALLS" >/dev/null || fail 'metadata initialization check did not use exact quiet argv'
grep -Fx "exec $TARGET_ID rabbitmq-diagnostics -q check_if_metadata_store_is_initialized_with_data" "$DOCKER_CALLS" >/dev/null || fail 'metadata-with-data check did not use exact quiet argv'
grep -Fx "exec $TARGET_ID rabbitmq-diagnostics -q listeners" "$DOCKER_CALLS" >/dev/null || fail 'listeners check did not use exact quiet argv'

for deviation in vhost init-exit init-hostname data-exit data-output status-exit status-output vhosts-exit vhosts-output listeners-exit listeners-hostname; do
  reset_metadata_fingerprint
  case $deviation in
    vhost) RABBITMQ_QUORUM_HEALTH_VHOST=/other ;;
    init-exit) METADATA_INIT_STATUS=1 ;;
    init-hostname) METADATA_INIT_OUTPUT='Metadata store on node rabbit@other has completed its initialization' ;;
    data-exit) METADATA_DATA_STATUS=68 ;;
    data-output) METADATA_DATA_OUTPUT='noproc' ;;
    status-exit) METADATA_STATUS_STATUS=1 ;;
    status-output) METADATA_STATUS_OUTPUT='{}' ;;
    vhosts-exit) VHOST_STATUS=1 ;;
    vhosts-output) VHOST_OUTPUT=/ ;;
    listeners-exit) LISTENERS_STATUS=1 ;;
    listeners-hostname) LISTENERS_OUTPUT='Node rabbit@other reported no enabled listeners.' ;;
  esac
  assert_probe_status 1
  if grep -E '^(run|restart) ' "$DOCKER_CALLS" >/dev/null; then
    fail "$deviation metadata deviation reached a recovery action"
  fi
done

reset_metadata_fingerprint
for QUEUE_MODE in not-found-malformed not-found-wrong-exit not-found-mixed; do
  assert_probe_status 1
  if grep -F 'check_if_metadata_store_is_initialized' "$DOCKER_CALLS" >/dev/null; then
    fail "$QUEUE_MODE queue result reached the metadata fingerprint"
  fi
  : > "$DOCKER_CALLS"
done

QUEUE_MODE=healthy
for CLUSTER_VERSION in 4.3.2 4.3.4; do
  assert_probe_status 0
done
for CLUSTER_VERSION in 4.3.1 4.4.0 4.3.4-rc.1 invalid; do
  assert_probe_status 1
done
CLUSTER_VERSION=4.3.4
for CLUSTER_MODE in alarm partition malformed; do
  assert_probe_status 1
done
CLUSTER_MODE=healthy

for QUEUE_MODE in malformed no-leader non-voter; do
  assert_probe_status 1
done
QUEUE_MODE=healthy

WORKER_MODE=healthy
rabbitmq_quorum_health_verify_worker_container api "$WORKER_ID"
for WORKER_MODE in exited oom malformed; do
  if rabbitmq_quorum_health_verify_worker_container api "$WORKER_ID" >/dev/null 2>&1; then
    fail "worker verifier accepted $WORKER_MODE worker state"
  fi
done
if rabbitmq_quorum_health_verify_worker_container api "${WORKER_ID:0:12}" >/dev/null 2>&1; then
  fail 'worker verifier accepted a truncated container ID'
fi
WORKER_MODE=healthy
WORKER_ID=ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
if rabbitmq_quorum_health_verify_worker_container api abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd >/dev/null 2>&1; then
  fail 'worker verifier accepted an inspect response bound to another container ID'
fi

if RABBITMQ_QUORUM_HEALTH_QUEUES='jobs.good,,jobs.bad' rabbitmq_quorum_health_queue_names >/dev/null 2>&1; then
  fail 'queue inventory accepted an empty queue name'
fi
if RABBITMQ_QUORUM_HEALTH_QUEUES='jobs.one,jobs.two,jobs.three,jobs.four,jobs/five' rabbitmq_quorum_health_queue_names >/dev/null 2>&1; then
  fail 'queue inventory accepted an unsafe queue name'
fi
if RABBITMQ_QUORUM_HEALTH_QUEUES='jobs.one,jobs.two,jobs.three,jobs.four,jobs.four' rabbitmq_quorum_health_queue_names >/dev/null 2>&1; then
  fail 'queue inventory accepted duplicate queue names'
fi

echo 'RabbitMQ quorum health contract tests passed'
