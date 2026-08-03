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
{"alarms":[],"running_nodes":["rabbit@$TARGET_HOSTNAME"],"cluster_tags":[],"listeners":{"rabbit@$TARGET_HOSTNAME":[]},"cpu_cores":{"rabbit@$TARGET_HOSTNAME":6},"cluster_name":"rabbit@$TARGET_HOSTNAME","disk_nodes":["rabbit@$TARGET_HOSTNAME"],"versions":{"rabbit@$TARGET_HOSTNAME":{"erlang_version":"27.3.4.13","rabbitmq_name":"RabbitMQ","rabbitmq_version":"4.3.2"}},"partitions":{},"maintenance_status":{"rabbit@$TARGET_HOSTNAME":"not under maintenance"}}
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
[{"Id":"$TARGET_ID","Image":"$TARGET_IMAGE","State":{"Status":"running","OOMKilled":false,"RestartCount":0},"Config":{"Hostname":"$TARGET_HOSTNAME","Labels":{"com.docker.compose.project":"$PROJECT","com.docker.compose.service":"rabbitmq"}},"Mounts":[{"Type":"volume","Name":"$TARGET_VOLUME","Destination":"/var/lib/rabbitmq","RW":true}]}]
JSON
}

worker_inspect_json() {
  case $WORKER_MODE in
    healthy)
      printf '[{"Id":"%s","State":{"Status":"running","OOMKilled":false,"RestartCount":3}}]\n' "$WORKER_ID"
      ;;
    exited)
      printf '[{"Id":"%s","State":{"Status":"exited","OOMKilled":false,"RestartCount":3}}]\n' "$WORKER_ID"
      ;;
    oom)
      printf '[{"Id":"%s","State":{"Status":"running","OOMKilled":true,"RestartCount":3}}]\n' "$WORKER_ID"
      ;;
    malformed)
      printf '[{"Id":"%s","State":{"Status":"running","OOMKilled":false,"RestartCount":"3"}}]\n' "$WORKER_ID"
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
          [[ $4 == cluster_status && $5 == --formatter && $6 == json ]] || return 96
          case $CLUSTER_MODE in
            healthy) cluster_status_json ;;
            alarm) cluster_status_json | sed 's/"alarms":\[\]/"alarms":["memory"]/' ;;
            partition) cluster_status_json | sed 's/"partitions":{}/"partitions":{"rabbit@other":["rabbit@fixture"]}/' ;;
            version) cluster_status_json | sed 's/"rabbitmq_version":"4.3.2"/"rabbitmq_version":"4.3.1"/' ;;
            malformed) printf '%s\n' '{"running_nodes":[]}' ;;
            *) fail "unknown cluster mode: $CLUSTER_MODE" ;;
          esac
          ;;
        rabbitmq-queues)
          [[ $4 == quorum_status && $5 == --vhost && $6 == / && $8 == --formatter && $9 == json ]] || return 97
          case $QUEUE_MODE in
            healthy) quorum_status_json ;;
            noproc) quorum_noproc_json ;;
            malformed) printf '%s\n' '[{"node":"rabbit@fixture"}]' ;;
            no-leader) quorum_status_json | sed 's/"Raft State":"leader"/"Raft State":"follower"/' ;;
            non-voter) quorum_status_json | sed 's/"Membership":"voter"/"Membership":"promotable"/' ;;
            *) fail "unknown queue mode: $QUEUE_MODE" ;;
          esac
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

: > "$DOCKER_CALLS"
assert_probe_status 0
grep -Fx "ps --no-trunc --filter label=com.docker.compose.project=$PROJECT --filter label=com.docker.compose.service=rabbitmq --format {{.ID}}" "$DOCKER_CALLS" >/dev/null
grep -F "exec $TARGET_ID rabbitmq-diagnostics cluster_status --formatter json" "$DOCKER_CALLS" >/dev/null
grep -F "exec $TARGET_ID rabbitmq-queues quorum_status --vhost / jobs.freshness.scan --formatter json" "$DOCKER_CALLS" >/dev/null
grep -F "exec $TARGET_ID rabbitmq-queues quorum_status --vhost / events.delivery.summary.ready --formatter json" "$DOCKER_CALLS" >/dev/null

QUEUE_MODE=noproc
assert_probe_status "$RABBITMQ_QUORUM_PROBE_NOPROC"
assert_steady_rejected

QUEUE_MODE=healthy
for CLUSTER_MODE in alarm partition version malformed; do
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

echo 'RabbitMQ quorum health contract tests passed'
