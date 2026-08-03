#!/usr/bin/env bash

# This recovery path is intentionally narrow.  It snapshots a verified existing
# RabbitMQ data volume read-only, proves that snapshot in an isolated clone, and
# restarts only the same existing container.  It never resets Raft state,
# deletes/redeclares queues, recreates a target container/volume, or switches to
# older data.

RECOVERY_SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
if ! declare -F rabbitmq_quorum_health_probe_target >/dev/null; then
  # shellcheck source=ops/deploy/rabbitmq-quorum-health.sh
  source "$RECOVERY_SCRIPT_DIR/rabbitmq-quorum-health.sh"
fi

RABBITMQ_QUORUM_RECOVERY_STATE_ROOT=${RABBITMQ_QUORUM_RECOVERY_STATE_ROOT:-${CONTROL:-/var/lib/social-monitor/control}/rabbitmq-quorum-recovery}
RABBITMQ_QUORUM_SNAPSHOT_MAX_BYTES=${RABBITMQ_QUORUM_SNAPSHOT_MAX_BYTES:-1073741824}
RABBITMQ_QUORUM_SNAPSHOT_MAX_ENTRIES=${RABBITMQ_QUORUM_SNAPSHOT_MAX_ENTRIES:-250000}
RABBITMQ_QUORUM_SNAPSHOT_MIN_FREE_BYTES=${RABBITMQ_QUORUM_SNAPSHOT_MIN_FREE_BYTES:-2147483648}
RABBITMQ_QUORUM_SNAPSHOT_RETENTION=${RABBITMQ_QUORUM_SNAPSHOT_RETENTION:-3}
RABBITMQ_QUORUM_RECOVERY_TIMEOUT_SECONDS=${RABBITMQ_QUORUM_RECOVERY_TIMEOUT_SECONDS:-180}
RABBITMQ_QUORUM_RECOVERY_SLEEP_SECONDS=${RABBITMQ_QUORUM_RECOVERY_SLEEP_SECONDS:-3}

rabbitmq_quorum_recovery_error() {
  printf 'deploy-error: RabbitMQ quorum recovery: %s\n' "$*" >&2
}

rabbitmq_quorum_recovery_positive_integer() {
  [[ $1 =~ ^[1-9][0-9]*$ ]]
}

rabbitmq_quorum_recovery_nonnegative_integer() {
  [[ $1 =~ ^[0-9]+$ ]]
}

rabbitmq_quorum_recovery_file_size() {
  stat -c '%s' "$1" 2>/dev/null || stat -f '%z' "$1"
}

rabbitmq_quorum_recovery_mtime() {
  stat -c '%Y' "$1" 2>/dev/null || stat -f '%m' "$1"
}

rabbitmq_quorum_recovery_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

rabbitmq_quorum_recovery_sha256_value() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$1" | sha256sum | awk '{print $1}'
  else
    printf '%s' "$1" | shasum -a 256 | awk '{print $1}'
  fi
}

rabbitmq_quorum_recovery_container_start_fingerprint() {
  local container_id=$1 started_at fingerprint

  [[ $container_id =~ ^[0-9a-f]{64}$ ]] || return 1
  started_at=$(docker inspect "$container_id" --format '{{.State.StartedAt}}') || return 1
  [[ $started_at =~ ^[0-9TZ:+.-]{20,64}$ ]] || return 1
  fingerprint=$(rabbitmq_quorum_recovery_sha256_value "$started_at") || return 1
  [[ $fingerprint =~ ^[0-9a-f]{64}$ ]] || return 1
  printf '%s\n' "$fingerprint"
}

rabbitmq_quorum_recovery_archive_entry_count() (
  set -o pipefail
  tar -tf "$1" | awk 'END { print NR }'
)

rabbitmq_quorum_recovery_root() {
  local root=$RABBITMQ_QUORUM_RECOVERY_STATE_ROOT

  [[ -n $root && $root == /* ]] || return 1
  [[ ! -e $root || (-d $root && ! -L $root) ]] || return 1
  install -d -m 0700 "$root" || return 1
  [[ -d $root && ! -L $root ]] || return 1
  readlink -f -- "$root"
}

rabbitmq_quorum_recovery_require_budget() {
  rabbitmq_quorum_recovery_positive_integer "$RABBITMQ_QUORUM_SNAPSHOT_MAX_BYTES" || return 1
  rabbitmq_quorum_recovery_positive_integer "$RABBITMQ_QUORUM_SNAPSHOT_MAX_ENTRIES" || return 1
  rabbitmq_quorum_recovery_nonnegative_integer "$RABBITMQ_QUORUM_SNAPSHOT_MIN_FREE_BYTES" || return 1
  rabbitmq_quorum_recovery_positive_integer "$RABBITMQ_QUORUM_SNAPSHOT_RETENTION" || return 1
  rabbitmq_quorum_recovery_positive_integer "$RABBITMQ_QUORUM_RECOVERY_TIMEOUT_SECONDS" || return 1
  rabbitmq_quorum_recovery_positive_integer "$RABBITMQ_QUORUM_RECOVERY_SLEEP_SECONDS" || return 1
}

rabbitmq_quorum_recovery_free_bytes() {
  df -Pk "$1" | awk 'NR == 2 { printf "%.0f\n", $4 * 1024 }'
}

rabbitmq_quorum_recovery_safe_snapshot_path() {
  local root=$1 path=$2 resolved_root resolved

  [[ -d $root && ! -L $root && -d $path && ! -L $path ]] || return 1
  resolved_root=$(readlink -f -- "$root") || return 1
  resolved=$(readlink -f -- "$path") || return 1
  [[ $resolved == "$resolved_root"/snapshot-* ]] || return 1
  printf '%s\n' "$resolved"
}

rabbitmq_quorum_recovery_remove_snapshot() {
  local root=$1 path=$2 resolved

  resolved=$(rabbitmq_quorum_recovery_safe_snapshot_path "$root" "$path") || return 1
  chmod u+w "$resolved" || return 1
  rm -rf -- "$resolved"
}

rabbitmq_quorum_recovery_cleanup_partials() {
  local root=$1 partial resolved

  for partial in "$root"/.snapshot-*; do
    [[ -e $partial ]] || continue
    [[ -d $partial && ! -L $partial ]] || {
      rabbitmq_quorum_recovery_error 'unexpected snapshot partial path'
      return 1
    }
    resolved=$(readlink -f -- "$partial") || return 1
    [[ $resolved == "$root"/.snapshot-* ]] || return 1
    chmod u+w "$resolved" || return 1
    rm -rf -- "$resolved"
  done
}

rabbitmq_quorum_recovery_apply_retention() {
  local root=$1 retention=$2 path resolved mtime
  local -a snapshots=()
  local -a ordered=()
  local count index

  for path in "$root"/snapshot-*; do
    [[ -e $path ]] || continue
    resolved=$(rabbitmq_quorum_recovery_safe_snapshot_path "$root" "$path") || {
      rabbitmq_quorum_recovery_error 'snapshot retention found an unsafe path'
      return 1
    }
    mtime=$(rabbitmq_quorum_recovery_mtime "$resolved") || return 1
    rabbitmq_quorum_recovery_nonnegative_integer "$mtime" || return 1
    snapshots+=("$mtime"$'\t'"$resolved")
  done
  ((${#snapshots[@]} > 0)) || return 0
  while IFS=$'\t' read -r _ path; do
    [[ -n $path ]] && ordered+=("$path")
  done < <(printf '%s\n' "${snapshots[@]}" | LC_ALL=C sort -n)
  count=${#ordered[@]}
  ((count > retention)) || return 0
  for ((index = 0; index < count - retention; index += 1)); do
    rabbitmq_quorum_recovery_remove_snapshot "$root" "${ordered[$index]}" || return 1
  done
}

rabbitmq_quorum_recovery_write_state() {
  local root=$1 phase=$2 snapshot_dir=$3 snapshot_sha=$4 snapshot_bytes=$5 snapshot_entries=$6
  local state=$root/recovery.state temporary

  case $phase in
    proof_verified|restart_pending|restart_requested|complete) ;;
    *) return 1 ;;
  esac
  [[ ${RABBITMQ_QUORUM_RECOVERY_PRE_RESTART_FINGERPRINT:-} =~ ^[0-9a-f]{64}$ ]] || return 1
  temporary=$(mktemp "$root/.recovery-state.XXXXXX") || return 1
  umask 077
  {
    printf 'version=2\n'
    printf 'phase=%s\n' "$phase"
    printf 'container_id=%s\n' "$RABBITMQ_QUORUM_TARGET_CONTAINER_ID"
    printf 'image_id=%s\n' "$RABBITMQ_QUORUM_TARGET_IMAGE_ID"
    printf 'hostname=%s\n' "$RABBITMQ_QUORUM_TARGET_HOSTNAME"
    printf 'volume=%s\n' "$RABBITMQ_QUORUM_TARGET_VOLUME"
    printf 'snapshot_dir=%s\n' "$snapshot_dir"
    printf 'snapshot_sha256=%s\n' "$snapshot_sha"
    printf 'snapshot_bytes=%s\n' "$snapshot_bytes"
    printf 'snapshot_entries=%s\n' "$snapshot_entries"
    printf 'pre_restart_fingerprint=%s\n' "$RABBITMQ_QUORUM_RECOVERY_PRE_RESTART_FINGERPRINT"
  } > "$temporary"
  chmod 0600 "$temporary" || return 1
  mv -f -- "$temporary" "$state"
}

rabbitmq_quorum_recovery_load_state() {
  local root=$1 state=$root/recovery.state key value
  local version='' phase='' container_id='' image_id='' hostname='' volume=''
  local snapshot_dir='' snapshot_sha='' snapshot_bytes='' snapshot_entries='' pre_restart_fingerprint=''

  [[ -f $state && ! -L $state ]] || return 1
  while IFS='=' read -r key value; do
    case $key in
      version) [[ -z $version ]] && version=$value || return 1 ;;
      phase) [[ -z $phase ]] && phase=$value || return 1 ;;
      container_id) [[ -z $container_id ]] && container_id=$value || return 1 ;;
      image_id) [[ -z $image_id ]] && image_id=$value || return 1 ;;
      hostname) [[ -z $hostname ]] && hostname=$value || return 1 ;;
      volume) [[ -z $volume ]] && volume=$value || return 1 ;;
      snapshot_dir) [[ -z $snapshot_dir ]] && snapshot_dir=$value || return 1 ;;
      snapshot_sha256) [[ -z $snapshot_sha ]] && snapshot_sha=$value || return 1 ;;
      snapshot_bytes) [[ -z $snapshot_bytes ]] && snapshot_bytes=$value || return 1 ;;
      snapshot_entries) [[ -z $snapshot_entries ]] && snapshot_entries=$value || return 1 ;;
      pre_restart_fingerprint) [[ -z $pre_restart_fingerprint ]] && pre_restart_fingerprint=$value || return 1 ;;
      *) return 1 ;;
    esac
  done < "$state"
  [[ $version == 2 && $phase =~ ^(proof_verified|restart_pending|restart_requested|complete)$ ]] || return 1
  [[ $container_id =~ ^[0-9a-f]{64}$ && $image_id =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  rabbitmq_quorum_health_safe_hostname "$hostname" || return 1
  [[ $volume == "${PROJECT}_rabbitmq-data" ]] || return 1
  [[ $snapshot_sha =~ ^[0-9a-f]{64}$ ]] || return 1
  rabbitmq_quorum_recovery_positive_integer "$snapshot_bytes" || return 1
  rabbitmq_quorum_recovery_positive_integer "$snapshot_entries" || return 1
  [[ $pre_restart_fingerprint =~ ^[0-9a-f]{64}$ ]] || return 1
  RABBITMQ_QUORUM_RECOVERY_PHASE=$phase
  RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_DIR=$snapshot_dir
  RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_SHA256=$snapshot_sha
  RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_BYTES=$snapshot_bytes
  RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_ENTRIES=$snapshot_entries
  RABBITMQ_QUORUM_RECOVERY_STATE_CONTAINER_ID=$container_id
  RABBITMQ_QUORUM_RECOVERY_STATE_IMAGE_ID=$image_id
  RABBITMQ_QUORUM_RECOVERY_STATE_HOSTNAME=$hostname
  RABBITMQ_QUORUM_RECOVERY_STATE_VOLUME=$volume
  RABBITMQ_QUORUM_RECOVERY_PRE_RESTART_FINGERPRINT=$pre_restart_fingerprint
}

rabbitmq_quorum_recovery_verify_manifest() {
  local manifest=$1 expected_container_id=$2 expected_image_id=$3 expected_hostname=$4
  local expected_volume=$5 expected_sha=$6 expected_bytes=$7 expected_entries=$8
  local key value version='' container_id='' image_id='' hostname='' volume=''
  local sha='' bytes='' entries=''

  [[ -f $manifest && ! -L $manifest ]] || return 1
  while IFS='=' read -r key value; do
    case $key in
      version) [[ -z $version ]] && version=$value || return 1 ;;
      container_id) [[ -z $container_id ]] && container_id=$value || return 1 ;;
      image_id) [[ -z $image_id ]] && image_id=$value || return 1 ;;
      hostname) [[ -z $hostname ]] && hostname=$value || return 1 ;;
      volume) [[ -z $volume ]] && volume=$value || return 1 ;;
      sha256) [[ -z $sha ]] && sha=$value || return 1 ;;
      bytes) [[ -z $bytes ]] && bytes=$value || return 1 ;;
      entries) [[ -z $entries ]] && entries=$value || return 1 ;;
      *) return 1 ;;
    esac
  done < "$manifest"
  [[ $version == 1 && \
     $container_id == "$expected_container_id" && \
     $image_id == "$expected_image_id" && \
     $hostname == "$expected_hostname" && \
     $volume == "$expected_volume" && \
     $sha == "$expected_sha" && \
     $bytes == "$expected_bytes" && \
     $entries == "$expected_entries" ]]
}

rabbitmq_quorum_recovery_verify_state_binding() {
  local root=$1 snapshot_dir archive manifest sha bytes entries

  [[ $RABBITMQ_QUORUM_RECOVERY_STATE_CONTAINER_ID == "$RABBITMQ_QUORUM_TARGET_CONTAINER_ID" && \
     $RABBITMQ_QUORUM_RECOVERY_STATE_IMAGE_ID == "$RABBITMQ_QUORUM_TARGET_IMAGE_ID" && \
     $RABBITMQ_QUORUM_RECOVERY_STATE_HOSTNAME == "$RABBITMQ_QUORUM_TARGET_HOSTNAME" && \
     $RABBITMQ_QUORUM_RECOVERY_STATE_VOLUME == "$RABBITMQ_QUORUM_TARGET_VOLUME" ]] || return 1
  snapshot_dir=$(rabbitmq_quorum_recovery_safe_snapshot_path "$root" "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_DIR") || return 1
  archive=$snapshot_dir/rabbitmq-data.tar
  manifest=$snapshot_dir/manifest
  [[ -f $archive && ! -L $archive && -f $manifest && ! -L $manifest ]] || return 1
  sha=$(rabbitmq_quorum_recovery_sha256 "$archive") || return 1
  bytes=$(rabbitmq_quorum_recovery_file_size "$archive") || return 1
  entries=$(rabbitmq_quorum_recovery_archive_entry_count "$archive") || return 1
  [[ $sha == "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_SHA256" && \
     $bytes == "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_BYTES" && \
     $entries == "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_ENTRIES" ]] || return 1
  rabbitmq_quorum_recovery_verify_manifest "$manifest" \
    "$RABBITMQ_QUORUM_TARGET_CONTAINER_ID" "$RABBITMQ_QUORUM_TARGET_IMAGE_ID" \
    "$RABBITMQ_QUORUM_TARGET_HOSTNAME" "$RABBITMQ_QUORUM_TARGET_VOLUME" \
    "$sha" "$bytes" "$entries"
}

rabbitmq_quorum_recovery_create_snapshot() {
  local root=$1 partial archive_partial archive manifest_partial manifest final snapshot_sha snapshot_bytes snapshot_entries free_bytes needed_bytes

  rabbitmq_quorum_recovery_require_budget || {
    rabbitmq_quorum_recovery_error 'snapshot/recovery budget is invalid'
    return 1
  }
  rabbitmq_quorum_recovery_cleanup_partials "$root" || return 1
  free_bytes=$(rabbitmq_quorum_recovery_free_bytes "$root") || return 1
  rabbitmq_quorum_recovery_nonnegative_integer "$free_bytes" || return 1
  needed_bytes=$((RABBITMQ_QUORUM_SNAPSHOT_MIN_FREE_BYTES + RABBITMQ_QUORUM_SNAPSHOT_MAX_BYTES))
  ((free_bytes >= needed_bytes)) || {
    rabbitmq_quorum_recovery_error 'insufficient free space for bounded immutable RabbitMQ snapshot'
    return 1
  }
  partial=$(mktemp -d "$root/.snapshot.XXXXXX") || return 1
  archive_partial=$partial/rabbitmq-data.tar.partial
  manifest_partial=$partial/manifest.partial
  if ! docker run --rm --network none --read-only \
    --volumes-from "${RABBITMQ_QUORUM_TARGET_CONTAINER_ID}:ro" \
    --entrypoint tar "$RABBITMQ_QUORUM_TARGET_IMAGE_ID" \
    --numeric-owner -C /var/lib/rabbitmq -cf - . > "$archive_partial"; then
    rm -rf -- "$partial"
    rabbitmq_quorum_recovery_error 'read-only RabbitMQ snapshot command failed'
    return 1
  fi
  snapshot_bytes=$(rabbitmq_quorum_recovery_file_size "$archive_partial") || {
    rm -rf -- "$partial"
    return 1
  }
  rabbitmq_quorum_recovery_positive_integer "$snapshot_bytes" || {
    rm -rf -- "$partial"
    return 1
  }
  ((snapshot_bytes <= RABBITMQ_QUORUM_SNAPSHOT_MAX_BYTES)) || {
    rm -rf -- "$partial"
    rabbitmq_quorum_recovery_error 'RabbitMQ snapshot exceeds the byte budget'
    return 1
  }
  snapshot_entries=$(rabbitmq_quorum_recovery_archive_entry_count "$archive_partial") || {
    rm -rf -- "$partial"
    return 1
  }
  rabbitmq_quorum_recovery_positive_integer "$snapshot_entries" || {
    rm -rf -- "$partial"
    return 1
  }
  ((snapshot_entries <= RABBITMQ_QUORUM_SNAPSHOT_MAX_ENTRIES)) || {
    rm -rf -- "$partial"
    rabbitmq_quorum_recovery_error 'RabbitMQ snapshot exceeds the entry-count budget'
    return 1
  }
  snapshot_sha=$(rabbitmq_quorum_recovery_sha256 "$archive_partial") || {
    rm -rf -- "$partial"
    return 1
  }
  [[ $snapshot_sha =~ ^[0-9a-f]{64}$ ]] || {
    rm -rf -- "$partial"
    return 1
  }
  archive=$partial/rabbitmq-data.tar
  manifest=$partial/manifest
  mv -f -- "$archive_partial" "$archive"
  {
    printf 'version=1\n'
    printf 'container_id=%s\n' "$RABBITMQ_QUORUM_TARGET_CONTAINER_ID"
    printf 'image_id=%s\n' "$RABBITMQ_QUORUM_TARGET_IMAGE_ID"
    printf 'hostname=%s\n' "$RABBITMQ_QUORUM_TARGET_HOSTNAME"
    printf 'volume=%s\n' "$RABBITMQ_QUORUM_TARGET_VOLUME"
    printf 'sha256=%s\n' "$snapshot_sha"
    printf 'bytes=%s\n' "$snapshot_bytes"
    printf 'entries=%s\n' "$snapshot_entries"
  } > "$manifest_partial"
  chmod 0400 "$archive" "$manifest_partial" || {
    rm -rf -- "$partial"
    return 1
  }
  mv -f -- "$manifest_partial" "$manifest"
  final=$root/snapshot-$(date -u +%Y%m%dT%H%M%SZ)-${RABBITMQ_QUORUM_TARGET_CONTAINER_ID:0:12}
  [[ ! -e $final ]] || {
    rm -rf -- "$partial"
    return 1
  }
  mv -- "$partial" "$final"
  chmod 0500 "$final" || return 1
  RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_DIR=$final
  RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_SHA256=$snapshot_sha
  RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_BYTES=$snapshot_bytes
  RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_ENTRIES=$snapshot_entries
}

rabbitmq_quorum_recovery_probe_container() {
  local container_id=$1 queue status total=0 healthy=0 noproc=0

  rabbitmq_quorum_health_cluster_status "$container_id" || return 1
  while IFS= read -r queue; do
    [[ -n $queue ]] || continue
    ((total += 1))
    if rabbitmq_quorum_health_queue_status "$container_id" "$queue"; then
      ((healthy += 1))
    else
      status=$?
      if ((status == RABBITMQ_QUORUM_PROBE_NOPROC)); then
        ((noproc += 1))
      else
        return 1
      fi
    fi
  done < <(rabbitmq_quorum_health_queue_names)
  ((total > 0)) || return 1
  ((healthy == total)) && return 0
  ((noproc == total)) && return "$RABBITMQ_QUORUM_PROBE_NOPROC"
  return 1
}

rabbitmq_quorum_recovery_wait_for_steady_container() {
  local container_id=$1 attempts attempt status

  attempts=$(((RABBITMQ_QUORUM_RECOVERY_TIMEOUT_SECONDS + RABBITMQ_QUORUM_RECOVERY_SLEEP_SECONDS - 1) / RABBITMQ_QUORUM_RECOVERY_SLEEP_SECONDS))
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if rabbitmq_quorum_recovery_probe_container "$container_id"; then
      return 0
    fi
    status=$?
    ((attempt == attempts)) && break
    sleep "$RABBITMQ_QUORUM_RECOVERY_SLEEP_SECONDS"
  done
  rabbitmq_quorum_recovery_error 'RabbitMQ did not reach steady quorum health within the bounded timeout'
  return 1
}

rabbitmq_quorum_recovery_prove_snapshot_clone() (
  set -o pipefail
  local snapshot_dir=$1 archive=$1/rabbitmq-data.tar clone_dir clone_name clone_id=''

  clone_dir=$(mktemp -d "$(dirname "$snapshot_dir")/.clone.XXXXXX") || exit 1
  clone_name="social-monitor-rabbitmq-proof-${RABBITMQ_QUORUM_TARGET_CONTAINER_ID:0:12}-${RANDOM}"
  cleanup_clone() {
    [[ -n $clone_id ]] && docker stop "$clone_id" >/dev/null 2>&1 || true
    docker rm -f "$clone_name" >/dev/null 2>&1 || true
    rm -rf -- "$clone_dir"
  }
  trap cleanup_clone EXIT
  docker run --interactive --rm --network none --read-only --user 0:0 \
    --mount "type=bind,source=$clone_dir,destination=/restore" \
    --entrypoint tar "$RABBITMQ_QUORUM_TARGET_IMAGE_ID" \
    -C /restore -xf - < "$archive" >/dev/null || exit 1
  docker run --detach --rm --name "$clone_name" --network none --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,size=67108864 \
    --hostname "$RABBITMQ_QUORUM_TARGET_HOSTNAME" \
    --mount "type=bind,source=$clone_dir,destination=/var/lib/rabbitmq" \
    "$RABBITMQ_QUORUM_TARGET_IMAGE_ID" >/dev/null || exit 1
  clone_id=$(docker ps --no-trunc --filter "name=^/${clone_name}$" --format '{{.ID}}') || exit 1
  [[ $clone_id =~ ^[0-9a-f]{64}$ ]] || exit 1
  rabbitmq_quorum_recovery_wait_for_steady_container "$clone_id"
)

rabbitmq_quorum_recovery_reidentify_same_target() {
  local expected_id=$1 expected_image=$2 expected_hostname=$3 expected_volume=$4

  rabbitmq_quorum_health_identify_target || return 1
  [[ $RABBITMQ_QUORUM_TARGET_CONTAINER_ID == "$expected_id" && \
     $RABBITMQ_QUORUM_TARGET_IMAGE_ID == "$expected_image" && \
     $RABBITMQ_QUORUM_TARGET_HOSTNAME == "$expected_hostname" && \
     $RABBITMQ_QUORUM_TARGET_VOLUME == "$expected_volume" ]] || {
    rabbitmq_quorum_recovery_error 'RabbitMQ target identity changed; refusing container or volume recreation'
    return 1
  }
}

rabbitmq_quorum_recovery_restart_existing_target() {
  local root=$1
  local target_id=$RABBITMQ_QUORUM_TARGET_CONTAINER_ID target_image=$RABBITMQ_QUORUM_TARGET_IMAGE_ID
  local target_hostname=$RABBITMQ_QUORUM_TARGET_HOSTNAME target_volume=$RABBITMQ_QUORUM_TARGET_VOLUME

  local current_fingerprint

  current_fingerprint=$(rabbitmq_quorum_recovery_container_start_fingerprint "$target_id") || return 1
  [[ $current_fingerprint == "$RABBITMQ_QUORUM_RECOVERY_PRE_RESTART_FINGERPRINT" ]] || {
    rabbitmq_quorum_recovery_error 'RabbitMQ start identity changed before the requested restart'
    return 1
  }
  rabbitmq_quorum_recovery_write_state "$root" restart_pending \
    "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_DIR" "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_SHA256" \
    "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_BYTES" "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_ENTRIES" || return 1
  rabbitmq_quorum_recovery_resume_pending_restart "$root" "$target_id" \
    "$target_image" "$target_hostname" "$target_volume"
}

rabbitmq_quorum_recovery_resume_pending_restart() {
  local root=$1 target_id=$2 target_image=$3 target_hostname=$4 target_volume=$5
  local current_fingerprint

  current_fingerprint=$(rabbitmq_quorum_recovery_container_start_fingerprint "$target_id") || return 1
  if [[ $current_fingerprint == "$RABBITMQ_QUORUM_RECOVERY_PRE_RESTART_FINGERPRINT" ]]; then
    docker restart "$target_id" >/dev/null || {
      rabbitmq_quorum_recovery_error 'existing RabbitMQ container restart failed'
      return 1
    }
    rabbitmq_quorum_recovery_reidentify_same_target "$target_id" "$target_image" "$target_hostname" "$target_volume" || return 1
    current_fingerprint=$(rabbitmq_quorum_recovery_container_start_fingerprint "$target_id") || return 1
    [[ $current_fingerprint != "$RABBITMQ_QUORUM_RECOVERY_PRE_RESTART_FINGERPRINT" ]] || {
      rabbitmq_quorum_recovery_error 'RabbitMQ restart did not advance the exact container start identity'
      return 1
    }
  else
    rabbitmq_quorum_recovery_reidentify_same_target "$target_id" "$target_image" "$target_hostname" "$target_volume" || return 1
  fi
  rabbitmq_quorum_recovery_write_state "$root" restart_requested \
    "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_DIR" "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_SHA256" \
    "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_BYTES" "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_ENTRIES" || return 1
  rabbitmq_quorum_recovery_wait_for_steady_container "$target_id" || return 1
  rabbitmq_quorum_recovery_write_state "$root" complete \
    "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_DIR" "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_SHA256" \
    "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_BYTES" "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_ENTRIES" || return 1
  rabbitmq_quorum_recovery_apply_retention "$root" "$RABBITMQ_QUORUM_SNAPSHOT_RETENTION"
}

rabbitmq_quorum_recovery_ensure_steady() (
  set -o pipefail
  local root status

  rabbitmq_quorum_recovery_require_budget || {
    rabbitmq_quorum_recovery_error 'snapshot/recovery budget is invalid'
    exit 1
  }
  root=$(rabbitmq_quorum_recovery_root) || {
    rabbitmq_quorum_recovery_error 'recovery state root is invalid'
    exit 1
  }
  exec 7>"$root/recovery.lock"
  flock -n 7 || {
    rabbitmq_quorum_recovery_error 'another RabbitMQ quorum recovery holds the exclusive lock'
    exit 1
  }
  rabbitmq_quorum_recovery_cleanup_partials "$root" || exit 1
  rabbitmq_quorum_recovery_apply_retention "$root" "$RABBITMQ_QUORUM_SNAPSHOT_RETENTION" || exit 1
  rabbitmq_quorum_health_identify_target || exit 1

  if [[ -f $root/recovery.state ]]; then
    rabbitmq_quorum_recovery_load_state "$root" || {
      rabbitmq_quorum_recovery_error 'recovery state is malformed; refusing an unbound resume'
      exit 1
    }
    rabbitmq_quorum_recovery_verify_state_binding "$root" || {
      rabbitmq_quorum_recovery_error 'recovery state does not match the immutable snapshot and target identity'
      exit 1
    }
    case $RABBITMQ_QUORUM_RECOVERY_PHASE in
      complete)
        rabbitmq_quorum_health_require_steady_state || exit 1
        rabbitmq_quorum_recovery_reidentify_same_target \
          "$RABBITMQ_QUORUM_RECOVERY_STATE_CONTAINER_ID" \
          "$RABBITMQ_QUORUM_RECOVERY_STATE_IMAGE_ID" \
          "$RABBITMQ_QUORUM_RECOVERY_STATE_HOSTNAME" \
          "$RABBITMQ_QUORUM_RECOVERY_STATE_VOLUME" || exit 1
        exit 0
        ;;
      restart_pending)
        rabbitmq_quorum_recovery_resume_pending_restart "$root" \
          "$RABBITMQ_QUORUM_TARGET_CONTAINER_ID" "$RABBITMQ_QUORUM_TARGET_IMAGE_ID" \
          "$RABBITMQ_QUORUM_TARGET_HOSTNAME" "$RABBITMQ_QUORUM_TARGET_VOLUME" || exit 1
        exit 0
        ;;
      restart_requested)
        rabbitmq_quorum_recovery_wait_for_steady_container "$RABBITMQ_QUORUM_TARGET_CONTAINER_ID" || exit 1
        rabbitmq_quorum_recovery_write_state "$root" complete \
          "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_DIR" "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_SHA256" \
          "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_BYTES" "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_ENTRIES" || exit 1
        exit 0
        ;;
      proof_verified)
        rabbitmq_quorum_recovery_restart_existing_target "$root" || exit 1
        exit 0
        ;;
    esac
  fi

  if rabbitmq_quorum_health_probe_target; then
    exit 0
  else
    status=$?
  fi
  if ((status != RABBITMQ_QUORUM_PROBE_NOPROC)); then
    rabbitmq_quorum_recovery_error 'only an all-queue noproc incident may enter automatic snapshot/bootstrap recovery'
    exit 1
  fi
  rabbitmq_quorum_recovery_create_snapshot "$root" || exit 1
  rabbitmq_quorum_recovery_prove_snapshot_clone "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_DIR" || {
    rabbitmq_quorum_recovery_remove_snapshot "$root" "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_DIR" || exit 1
    rabbitmq_quorum_recovery_apply_retention "$root" "$RABBITMQ_QUORUM_SNAPSHOT_RETENTION" || exit 1
    rabbitmq_quorum_recovery_error 'isolated snapshot clone did not prove steady quorum health'
    exit 1
  }
  if ! RABBITMQ_QUORUM_RECOVERY_PRE_RESTART_FINGERPRINT=$(
    rabbitmq_quorum_recovery_container_start_fingerprint "$RABBITMQ_QUORUM_TARGET_CONTAINER_ID"
  ); then
    rabbitmq_quorum_recovery_remove_snapshot "$root" "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_DIR" || exit 1
    rabbitmq_quorum_recovery_apply_retention "$root" "$RABBITMQ_QUORUM_SNAPSHOT_RETENTION" || exit 1
    exit 1
  fi
  rabbitmq_quorum_recovery_write_state "$root" proof_verified \
    "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_DIR" "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_SHA256" \
    "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_BYTES" "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_ENTRIES" || {
      rabbitmq_quorum_recovery_remove_snapshot "$root" "$RABBITMQ_QUORUM_RECOVERY_SNAPSHOT_DIR" || exit 1
      exit 1
    }
  rabbitmq_quorum_recovery_restart_existing_target "$root"
)
