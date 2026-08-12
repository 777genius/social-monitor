#!/usr/bin/env bash

# RabbitMQ 4.3.2 quorum health is deliberately broker-local.  It never asks an
# application to declare a queue, so Compose can reach a healthy broker before
# any application service is available.  The recovery library uses the distinct
# noproc result below only to decide whether a bounded snapshot/bootstrap path
# is safe; noproc is never a steady-state success.

RABBITMQ_QUORUM_HEALTH_SERVICE=${RABBITMQ_QUORUM_HEALTH_SERVICE:-rabbitmq}
RABBITMQ_QUORUM_HEALTH_VHOST=${RABBITMQ_QUORUM_HEALTH_VHOST:-/}
RABBITMQ_QUORUM_HEALTH_QUEUES=${RABBITMQ_QUORUM_HEALTH_QUEUES:-jobs.freshness.scan,jobs.summary.execute,jobs.reader-summary.execute,jobs.delivery.attempt.send,events.delivery.summary.ready}
RABBITMQ_QUORUM_PROBE_NOPROC=64

rabbitmq_quorum_health_error() {
  printf 'deploy-error: RabbitMQ quorum health: %s\n' "$*" >&2
}

rabbitmq_quorum_health_safe_project_name() {
  [[ $1 =~ ^[a-z0-9][a-z0-9_-]{0,62}$ ]]
}

rabbitmq_quorum_health_safe_hostname() {
  [[ $1 =~ ^[A-Za-z0-9][A-Za-z0-9.-]{0,62}$ ]]
}

rabbitmq_quorum_health_safe_queue_name() {
  [[ $1 =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$ ]]
}

rabbitmq_quorum_health_require_project() {
  rabbitmq_quorum_health_safe_project_name "${PROJECT:-}" || {
    rabbitmq_quorum_health_error 'Compose project identity is unavailable or invalid'
    return 1
  }
}

rabbitmq_quorum_health_queue_names() {
  local raw=${RABBITMQ_QUORUM_HEALTH_QUEUES:-} queue
  local -a queues=()
  local IFS=,

  read -r -a queues <<< "$raw"
  ((${#queues[@]} > 0)) || return 1
  for queue in "${queues[@]}"; do
    rabbitmq_quorum_health_safe_queue_name "$queue" || return 1
  done
  printf '%s\n' "${queues[@]}"
}

rabbitmq_quorum_health_resolve_running_container() {
  local service=${1:-$RABBITMQ_QUORUM_HEALTH_SERVICE}
  local candidates candidate count=0 container_id=''

  rabbitmq_quorum_health_require_project || return 1
  rabbitmq_quorum_health_safe_queue_name "$service" || {
    rabbitmq_quorum_health_error 'RabbitMQ service identity is invalid'
    return 1
  }
  candidates=$(docker ps --no-trunc \
    --filter "label=com.docker.compose.project=$PROJECT" \
    --filter "label=com.docker.compose.service=$service" \
    --format '{{.ID}}') || {
    rabbitmq_quorum_health_error 'cannot list the existing RabbitMQ container'
    return 1
  }
  while IFS= read -r candidate; do
    [[ -z $candidate ]] && continue
    [[ $candidate =~ ^[0-9a-f]{64}$ ]] || {
      rabbitmq_quorum_health_error 'Docker did not return a full RabbitMQ container ID'
      return 1
    }
    container_id=$candidate
    ((count += 1))
  done <<< "$candidates"
  ((count == 1)) || {
    rabbitmq_quorum_health_error 'exactly one running RabbitMQ container is required'
    return 1
  }
  printf '%s\n' "$container_id"
}

rabbitmq_quorum_health_validate_container_identity() {
  local container_id=$1 expected_volume=$2 inspected

  rabbitmq_quorum_health_require_project || return 1
  [[ $container_id =~ ^[0-9a-f]{64}$ ]] || return 1
  [[ $expected_volume == "${PROJECT}_rabbitmq-data" ]] || return 1
  inspected=$(docker inspect "$container_id") || {
    rabbitmq_quorum_health_error 'cannot inspect the RabbitMQ container identity'
    return 1
  }
  if ! printf '%s' "$inspected" | python3 -c '
import json
import re
import sys

container_id, project, expected_volume = sys.argv[1:]
try:
    rows = json.load(sys.stdin)
except Exception:
    raise SystemExit(1)
if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict):
    raise SystemExit(1)
row = rows[0]
if row.get("Id") != container_id:
    raise SystemExit(1)
state = row.get("State")
config = row.get("Config")
if not isinstance(state, dict) or state.get("Status") != "running":
    raise SystemExit(1)
if not isinstance(config, dict):
    raise SystemExit(1)
labels = config.get("Labels")
if not isinstance(labels, dict):
    raise SystemExit(1)
if labels.get("com.docker.compose.project") != project:
    raise SystemExit(1)
if labels.get("com.docker.compose.service") != "rabbitmq":
    raise SystemExit(1)
hostname = config.get("Hostname")
image_id = row.get("Image")
if not isinstance(hostname, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]{0,62}", hostname):
    raise SystemExit(1)
if not isinstance(image_id, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", image_id):
    raise SystemExit(1)
mounts = row.get("Mounts")
if not isinstance(mounts, list):
    raise SystemExit(1)
matches = [mount for mount in mounts if isinstance(mount, dict) and mount.get("Destination") == "/var/lib/rabbitmq"]
if len(matches) != 1:
    raise SystemExit(1)
mount = matches[0]
if mount.get("Type") != "volume" or mount.get("Name") != expected_volume or mount.get("RW") is not True:
    raise SystemExit(1)
print(f"{image_id}\t{hostname}")
' "$container_id" "$PROJECT" "$expected_volume"; then
    rabbitmq_quorum_health_error 'RabbitMQ container identity, writable data volume, or Compose labels are invalid'
    return 1
  fi
}

rabbitmq_quorum_health_validate_volume_identity() {
  local volume_name=$1 inspected

  rabbitmq_quorum_health_require_project || return 1
  [[ $volume_name == "${PROJECT}_rabbitmq-data" ]] || return 1
  inspected=$(docker volume inspect "$volume_name") || {
    rabbitmq_quorum_health_error 'cannot inspect the RabbitMQ data volume'
    return 1
  }
  if ! printf '%s' "$inspected" | python3 -c '
import json
import sys

volume_name, project = sys.argv[1:]
try:
    rows = json.load(sys.stdin)
except Exception:
    raise SystemExit(1)
if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict):
    raise SystemExit(1)
row = rows[0]
labels = row.get("Labels")
if row.get("Name") != volume_name or row.get("Driver") != "local" or not isinstance(labels, dict):
    raise SystemExit(1)
if labels.get("com.docker.compose.project") != project:
    raise SystemExit(1)
if labels.get("com.docker.compose.volume") != "rabbitmq-data":
    raise SystemExit(1)
' "$volume_name" "$PROJECT"; then
    rabbitmq_quorum_health_error 'RabbitMQ data volume type, name, or Compose labels are invalid'
    return 1
  fi
}

rabbitmq_quorum_health_identify_target() {
  local container_id expected_volume metadata image_id hostname

  container_id=$(rabbitmq_quorum_health_resolve_running_container) || return 1
  expected_volume="${PROJECT}_rabbitmq-data"
  metadata=$(rabbitmq_quorum_health_validate_container_identity "$container_id" "$expected_volume") || return 1
  IFS=$'\t' read -r image_id hostname <<< "$metadata"
  [[ -n $image_id && -n $hostname ]] || return 1
  rabbitmq_quorum_health_validate_volume_identity "$expected_volume" || return 1
  RABBITMQ_QUORUM_TARGET_CONTAINER_ID=$container_id
  RABBITMQ_QUORUM_TARGET_IMAGE_ID=$image_id
  RABBITMQ_QUORUM_TARGET_HOSTNAME=$hostname
  RABBITMQ_QUORUM_TARGET_VOLUME=$expected_volume
  export RABBITMQ_QUORUM_TARGET_CONTAINER_ID RABBITMQ_QUORUM_TARGET_IMAGE_ID \
    RABBITMQ_QUORUM_TARGET_HOSTNAME RABBITMQ_QUORUM_TARGET_VOLUME
}

rabbitmq_quorum_health_validate_cluster_status_json() {
  python3 -c '
import json
import re
import sys

try:
    payload = json.load(sys.stdin)
except Exception:
    raise SystemExit(1)
if not isinstance(payload, dict):
    raise SystemExit(1)
required = ("alarms", "running_nodes", "disk_nodes", "partitions", "maintenance_status", "versions")
if any(key not in payload for key in required):
    raise SystemExit(1)
if not isinstance(payload["alarms"], list) or payload["alarms"]:
    raise SystemExit(1)
if not isinstance(payload["partitions"], dict) or payload["partitions"]:
    raise SystemExit(1)
node_pattern = re.compile(r"rabbit@[A-Za-z0-9._-]+")
running = payload["running_nodes"]
disk = payload["disk_nodes"]
if not isinstance(running, list) or not isinstance(disk, list) or not running or not disk:
    raise SystemExit(1)
if any(not isinstance(node, str) or not node_pattern.fullmatch(node) for node in running + disk):
    raise SystemExit(1)
if len(set(running)) != len(running) or len(set(disk)) != len(disk) or set(running) != set(disk):
    raise SystemExit(1)
maintenance = payload["maintenance_status"]
versions = payload["versions"]
if not isinstance(maintenance, dict) or not isinstance(versions, dict):
    raise SystemExit(1)
for node in running:
    if maintenance.get(node) != "not under maintenance":
        raise SystemExit(1)
    version = versions.get(node)
    if not isinstance(version, dict) or version.get("rabbitmq_version") != "4.3.2":
        raise SystemExit(1)
'
}

rabbitmq_quorum_health_validate_quorum_status_json() {
  python3 -c '
import json
import re
import sys

try:
    rows = json.load(sys.stdin)
except Exception:
    raise SystemExit(1)
if not isinstance(rows, list) or not rows:
    raise SystemExit(1)
required = (
    "Node Name", "Raft State", "Membership", "Last Log Index", "Last Written",
    "Last Applied", "Commit Index", "Snapshot Index", "Term", "Machine Version",
)
node_pattern = re.compile(r"rabbit@[A-Za-z0-9._-]+")
seen = set()
leaders = 0
for row in rows:
    if not isinstance(row, dict) or any(key not in row for key in required):
        raise SystemExit(1)
    node = row["Node Name"]
    if not isinstance(node, str) or not node_pattern.fullmatch(node) or node in seen:
        raise SystemExit(1)
    seen.add(node)
    state = row["Raft State"]
    if state not in {"leader", "follower"}:
        raise SystemExit(1)
    leaders += state == "leader"
    if row["Membership"] != "voter":
        raise SystemExit(1)
    for key in required[3:]:
        value = row[key]
        if not isinstance(value, int) or isinstance(value, bool):
            raise SystemExit(1)
        if key == "Snapshot Index":
            if value < -1:
                raise SystemExit(1)
        elif value < 0:
            raise SystemExit(1)
if leaders != 1:
    raise SystemExit(1)
'
}

rabbitmq_quorum_health_validate_quorum_noproc_json() {
  python3 -c '
import json
import re
import sys

try:
    rows = json.load(sys.stdin)
except Exception:
    raise SystemExit(1)
if not isinstance(rows, list) or not rows:
    raise SystemExit(1)
required = (
    "Node Name", "Raft State", "Membership", "Last Log Index", "Last Written",
    "Last Applied", "Commit Index", "Snapshot Index", "Term", "Machine Version",
)
node_pattern = re.compile(r"rabbit@[A-Za-z0-9._-]+")
seen = set()
for row in rows:
    if not isinstance(row, dict) or any(key not in row for key in required):
        raise SystemExit(1)
    node = row["Node Name"]
    if not isinstance(node, str) or not node_pattern.fullmatch(node) or node in seen:
        raise SystemExit(1)
    seen.add(node)
    if row["Raft State"] != "noproc" or row["Membership"] != "unknown":
        raise SystemExit(1)
    for key in required[3:]:
        value = row[key]
        if not isinstance(value, int) or isinstance(value, bool):
            raise SystemExit(1)
        if key == "Snapshot Index":
            if value < -1:
                raise SystemExit(1)
        elif value < 0:
            raise SystemExit(1)
'
}

rabbitmq_quorum_health_cluster_status() {
  local container_id=$1 output

  if ! output=$(docker exec "$container_id" rabbitmq-diagnostics cluster_status --formatter json 2>&1); then
    rabbitmq_quorum_health_error 'RabbitMQ cluster_status command failed'
    return 1
  fi
  if ! printf '%s' "$output" | rabbitmq_quorum_health_validate_cluster_status_json; then
    rabbitmq_quorum_health_error 'RabbitMQ cluster_status JSON is not the supported 4.3.2 steady-state shape'
    return 1
  fi
}

rabbitmq_quorum_health_queue_status() {
  local container_id=$1 queue=$2 output

  if output=$(docker exec "$container_id" rabbitmq-queues quorum_status \
    --vhost "$RABBITMQ_QUORUM_HEALTH_VHOST" "$queue" --formatter json 2>&1); then
    if printf '%s' "$output" | rabbitmq_quorum_health_validate_quorum_status_json; then
      return 0
    fi
    if printf '%s' "$output" | rabbitmq_quorum_health_validate_quorum_noproc_json; then
      return "$RABBITMQ_QUORUM_PROBE_NOPROC"
    fi
    rabbitmq_quorum_health_error "RabbitMQ quorum_status JSON is invalid for queue $queue"
    return 1
  fi
  if printf '%s' "$output" | LC_ALL=C grep -Eqi '(^|[^[:alnum:]_])noproc([^[:alnum:]_]|$)'; then
    return "$RABBITMQ_QUORUM_PROBE_NOPROC"
  fi
  rabbitmq_quorum_health_error "RabbitMQ quorum_status command failed for queue $queue"
  return 1
}

rabbitmq_quorum_health_probe_target() {
  local queue status total=0 healthy=0 noproc=0

  rabbitmq_quorum_health_identify_target || return 1
  rabbitmq_quorum_health_cluster_status "$RABBITMQ_QUORUM_TARGET_CONTAINER_ID" || return 1
  while IFS= read -r queue; do
    [[ -n $queue ]] || continue
    ((total += 1))
    if rabbitmq_quorum_health_queue_status "$RABBITMQ_QUORUM_TARGET_CONTAINER_ID" "$queue"; then
      ((healthy += 1))
    else
      status=$?
      if ((status == RABBITMQ_QUORUM_PROBE_NOPROC)); then
        ((noproc += 1))
      else
        return 1
      fi
    fi
  done < <(rabbitmq_quorum_health_queue_names) || {
    rabbitmq_quorum_health_error 'RabbitMQ quorum queue inventory is invalid'
    return 1
  }
  ((total > 0)) || return 1
  if ((healthy == total)); then
    return 0
  fi
  if ((noproc == total)); then
    return "$RABBITMQ_QUORUM_PROBE_NOPROC"
  fi
  rabbitmq_quorum_health_error 'RabbitMQ quorum health is mixed; refusing an automatic recovery'
  return 1
}

rabbitmq_quorum_health_require_steady_state() {
  local status

  if rabbitmq_quorum_health_probe_target; then
    return 0
  fi
  status=$?
  if ((status == RABBITMQ_QUORUM_PROBE_NOPROC)); then
    rabbitmq_quorum_health_error 'RabbitMQ quorum queues report noproc and are not steady-state healthy'
  fi
  return 1
}

rabbitmq_quorum_health_verify_worker_container() {
  local service=$1 container_id=$2 inspected

  [[ -n $service && $container_id =~ ^[0-9a-f]{64}$ ]] || return 1
  inspected=$(docker inspect "$container_id") || return 1
  if ! printf '%s' "$inspected" | python3 -c '
import json
import sys

container_id = sys.argv[1]
try:
    rows = json.load(sys.stdin)
except Exception:
    raise SystemExit(1)
if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict):
    raise SystemExit(1)
if rows[0].get("Id") != container_id:
    raise SystemExit(1)
state = rows[0].get("State")
if not isinstance(state, dict):
    raise SystemExit(1)
if state.get("Status") != "running" or state.get("OOMKilled") is not False:
    raise SystemExit(1)
restart_count = rows[0].get("RestartCount")
if not isinstance(restart_count, int) or isinstance(restart_count, bool) or restart_count < 0:
    raise SystemExit(1)
' "$container_id"; then
    rabbitmq_quorum_health_error "worker runtime is not healthy for service $service"
    return 1
  fi
}
