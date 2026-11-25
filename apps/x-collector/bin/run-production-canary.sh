#!/usr/bin/bash
set -euo pipefail

readonly SCHEMA_VERSION=x-production-account-canary.v1
readonly REQUIRED_ACCOUNT_COUNT=4
readonly EX_USAGE=64
readonly EX_DATAERR=65
readonly EX_IOERR=74
readonly EX_TEMPFAIL=75
readonly EX_CONFIG=78
readonly ACCOUNT_SET_REASON=x_canary.account_set_not_exactly_four
readonly INVENTORY_UNAVAILABLE_REASON=x_canary.account_inventory_unavailable
readonly PRODUCTION_CONTROL_DIR=/var/data/social-monitor/control
readonly PRODUCTION_SCWEET_LOCK=/var/data/social-monitor/runtime/x-collector/scweet_state.db.social-monitor-run.lock
readonly SAFE_PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
readonly DOCKER_RUN_TIMEOUT_SECONDS=120
readonly CONTAINER_UID=65532
readonly CONTAINER_GID=65532

ACTION=
EXPECTED_SHA=
IMAGE_REF=
COOKIES_FILE=
CONTROL_DIR=
HEALTH_CONTAINER=
OUTPUT_FILE=
CANARY_TMP=
ACTIVE_CONTAINER=
FIXTURE_MODE=false
FIXTURE_ROOT=
STAGED_COOKIES_FILE=
HOST_FILE_UID=$CONTAINER_UID
HOST_FILE_GID=$CONTAINER_GID
DOCKER_BIN=
ENV_BIN=
RM_BIN=
TIMEOUT_BIN=

blocked_payload() {
  local reason_code=$1 observed_count=${2:-0}
  printf '{"schemaVersion":"%s","status":"blocked","reasonCode":"%s","requiredAccountCount":4,"observedAccountCount":%s,"collectionAttempted":false}' \
    "$SCHEMA_VERSION" "$reason_code" "$observed_count"
}

ready_payload() {
  printf '{"schemaVersion":"%s","status":"ready","reasonCode":"x_canary.account_set_ready","requiredAccountCount":4,"observedAccountCount":4,"collectionAttempted":false}' \
    "$SCHEMA_VERSION"
}

emit_payload() {
  local payload=$1
  printf '%s\n' "$payload"
  if [[ -n $OUTPUT_FILE ]]; then
    umask 077
    if ! printf '%s\n' "$payload" >"$OUTPUT_FILE"; then
      return "$EX_IOERR"
    fi
  fi
}

fail_blocked() {
  local reason_code=$1 exit_code=${2:-$EX_CONFIG} observed_count=${3:-0}
  emit_payload "$(blocked_payload "$reason_code" "$observed_count")" || \
    exit "$EX_IOERR"
  exit "$exit_code"
}

safe_exec() {
  "$ENV_BIN" -i PATH="$SAFE_PATH" "$@"
}

cleanup_active_container() {
  [[ -n $ACTIVE_CONTAINER && -n $DOCKER_BIN && -n $ENV_BIN ]] || return 0
  if [[ -n $TIMEOUT_BIN ]]; then
    safe_exec "$TIMEOUT_BIN" --signal=KILL 10 \
      "$DOCKER_BIN" rm -f -- "$ACTIVE_CONTAINER" >/dev/null 2>&1 || true
  fi
  ACTIVE_CONTAINER=
}

cleanup() {
  cleanup_active_container
  if [[ -n $CANARY_TMP && \
        $CANARY_TMP == /dev/shm/x-production-canary.* && \
        -d $CANARY_TMP && -n $RM_BIN && -n $ENV_BIN ]]; then
    safe_exec "$RM_BIN" -rf -- "$CANARY_TMP" >/dev/null 2>&1 || true
  fi
}

on_signal() {
  exit "$EX_TEMPFAIL"
}

trap cleanup EXIT
trap on_signal HUP INT TERM

(($# > 0)) || fail_blocked invalid_arguments "$EX_USAGE"
ACTION=$1
shift
[[ $ACTION == plan || $ACTION == run ]] || \
  fail_blocked invalid_arguments "$EX_USAGE"

expected_sha_set=false
image_set=false
cookies_file_set=false
control_dir_set=false
health_container_set=false
output_file_set=false
while (($# > 0)); do
  (($# >= 2)) || fail_blocked invalid_arguments "$EX_USAGE"
  case "$1" in
    --expected-sha)
      [[ $expected_sha_set == false ]] || fail_blocked invalid_arguments "$EX_USAGE"
      expected_sha_set=true
      EXPECTED_SHA=$2
      ;;
    --image)
      [[ $image_set == false ]] || fail_blocked invalid_arguments "$EX_USAGE"
      image_set=true
      IMAGE_REF=$2
      ;;
    --cookies-file)
      [[ $cookies_file_set == false ]] || fail_blocked invalid_arguments "$EX_USAGE"
      cookies_file_set=true
      COOKIES_FILE=$2
      ;;
    --control-dir)
      [[ $control_dir_set == false ]] || fail_blocked invalid_arguments "$EX_USAGE"
      control_dir_set=true
      CONTROL_DIR=$2
      ;;
    --health-container)
      [[ $health_container_set == false ]] || fail_blocked invalid_arguments "$EX_USAGE"
      health_container_set=true
      HEALTH_CONTAINER=$2
      ;;
    --output)
      [[ $ACTION == run ]] || fail_blocked invalid_arguments "$EX_USAGE"
      [[ $output_file_set == false ]] || fail_blocked invalid_arguments "$EX_USAGE"
      output_file_set=true
      OUTPUT_FILE=$2
      ;;
    *)
      fail_blocked invalid_arguments "$EX_USAGE"
      ;;
  esac
  shift 2
done

[[ $EXPECTED_SHA =~ ^[0-9a-f]{40}([0-9a-f]{24})?$ ]] || \
  fail_blocked invalid_arguments "$EX_USAGE"
[[ -n $IMAGE_REF && $IMAGE_REF != -* && \
   -n $COOKIES_FILE && $COOKIES_FILE != -* && \
   -n $CONTROL_DIR && $CONTROL_DIR != -* && \
   -n $HEALTH_CONTAINER && $HEALTH_CONTAINER != -* ]] || \
  fail_blocked invalid_arguments "$EX_USAGE"
[[ $ACTION == run || -z $OUTPUT_FILE ]] || \
  fail_blocked invalid_arguments "$EX_USAGE"
[[ -f $COOKIES_FILE && ! -L $COOKIES_FILE && -r $COOKIES_FILE && \
   -d $CONTROL_DIR ]] || \
  fail_blocked invalid_arguments "$EX_USAGE"

resolve_fixed_tool() {
  local output_name=$1 tool_name=$2 directory candidate
  local -a fixed_directories=(/usr/local/bin /usr/bin /bin /usr/sbin /sbin)
  for directory in "${fixed_directories[@]}"; do
    candidate=$directory/$tool_name
    if [[ -x $candidate ]]; then
      printf -v "$output_name" '%s' "$candidate"
      return 0
    fi
  done
  return 1
}

fixture_fd=${X_CANARY_TEST_FIXTURE_FD:-}
if [[ -n $fixture_fd ]]; then
  [[ $fixture_fd =~ ^[0-9]+$ && -d /proc/self/fd/$fixture_fd ]] || \
    fail_blocked invalid_fixture_capability "$EX_USAGE"
  FIXTURE_ROOT=$(cd -P -- "/proc/self/fd/$fixture_fd" 2>/dev/null && pwd) || \
    fail_blocked invalid_fixture_capability "$EX_USAGE"
  [[ $CONTROL_DIR == "$FIXTURE_ROOT/control" && \
     $COOKIES_FILE == "$FIXTURE_ROOT/production-cookies.json" && \
     $IMAGE_REF == fixture/x-collector:canary && \
     $HEALTH_CONTAINER == fixture-x-collector ]] || \
    fail_blocked invalid_fixture_capability "$EX_USAGE"
  DOCKER_BIN=$FIXTURE_ROOT/bin/docker
  FLOCK_BIN=$FIXTURE_ROOT/bin/flock
  [[ -f $DOCKER_BIN && ! -L $DOCKER_BIN && -x $DOCKER_BIN && \
     -f $FLOCK_BIN && ! -L $FLOCK_BIN && -x $FLOCK_BIN ]] || \
    fail_blocked runtime_dependency_unavailable "$EX_CONFIG"
  FIXTURE_MODE=true
else
  [[ $CONTROL_DIR == "$PRODUCTION_CONTROL_DIR" ]] || \
    fail_blocked production_control_dir_required "$EX_CONFIG"
  resolve_fixed_tool DOCKER_BIN docker || true
  resolve_fixed_tool FLOCK_BIN flock || true
fi
resolve_fixed_tool ENV_BIN env || true
resolve_fixed_tool MKTEMP_BIN mktemp || true
resolve_fixed_tool RM_BIN rm || true
resolve_fixed_tool TIMEOUT_BIN timeout || true
resolve_fixed_tool MKDIR_BIN mkdir || true
resolve_fixed_tool CHMOD_BIN chmod || true
resolve_fixed_tool CHOWN_BIN chown || true
resolve_fixed_tool INSTALL_BIN install || true
resolve_fixed_tool STAT_BIN stat || true
[[ -n $DOCKER_BIN && -n $ENV_BIN && -n $FLOCK_BIN && \
   -n $MKTEMP_BIN && -n $RM_BIN && -n $TIMEOUT_BIN && \
   -n $MKDIR_BIN && -n $CHMOD_BIN && -n $CHOWN_BIN && \
   -n $INSTALL_BIN && -n $STAT_BIN ]] || \
  fail_blocked runtime_dependency_unavailable "$EX_CONFIG"
if [[ $FIXTURE_MODE == true ]]; then
  HOST_FILE_UID=$(safe_exec "$STAT_BIN" -c %u "$FIXTURE_ROOT")
  HOST_FILE_GID=$(safe_exec "$STAT_BIN" -c %g "$FIXTURE_ROOT")
fi

capture_external() {
  local output_name=$1
  shift
  local captured status
  if captured=$(safe_exec "$TIMEOUT_BIN" --signal=TERM --kill-after=5s 30 "$@" 2>/dev/null); then
    status=0
  else
    status=$?
  fi
  printf -v "$output_name" '%s' "$captured"
  return "$status"
}

run_container_capture() {
  local output_name=$1 container_name=$2
  shift 2
  local captured status
  ACTIVE_CONTAINER=$container_name
  if captured=$(safe_exec "$TIMEOUT_BIN" --signal=TERM --kill-after=5s \
      "$DOCKER_RUN_TIMEOUT_SECONDS" "$DOCKER_BIN" run --rm \
      --pull=never --name "$container_name" "$@" 2>/dev/null); then
    status=0
  else
    status=$?
  fi
  if ((status != 0)); then
    cleanup_active_container
  else
    ACTIVE_CONTAINER=
  fi
  printf -v "$output_name" '%s' "$captured"
  return "$status"
}

verify_runtime_identity() {
  local phase=$1 marker_file=$CONTROL_DIR/deploy-state/backend.sha
  local -a marker_lines=()
  local candidate_image_id image_sha current_image_id deployed_service
  local running_status health_status
  if [[ -r $marker_file ]]; then
    mapfile -t marker_lines <"$marker_file" || true
  fi
  [[ ${#marker_lines[@]} -eq 1 && ${marker_lines[0]} == "$EXPECTED_SHA" ]] || \
    fail_blocked deployed_sha_marker_mismatch "$EX_CONFIG"
  capture_external candidate_image_id "$DOCKER_BIN" image inspect \
    --format '{{.Id}}' -- "$IMAGE_REF" || \
    fail_blocked image_unavailable "$EX_CONFIG"
  [[ $candidate_image_id =~ ^sha256:[0-9a-f]{64}$ ]] || \
    fail_blocked image_unavailable "$EX_CONFIG"
  if [[ $phase == locked && $candidate_image_id != "$IMAGE_ID" ]]; then
    fail_blocked image_identity_changed "$EX_CONFIG" "$REQUIRED_ACCOUNT_COUNT"
  fi
  capture_external image_sha "$DOCKER_BIN" image inspect \
    --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
    -- "$candidate_image_id" || fail_blocked image_unavailable "$EX_CONFIG"
  [[ $image_sha == "$EXPECTED_SHA" ]] || \
    fail_blocked image_sha_mismatch "$EX_CONFIG"
  capture_external current_image_id "$DOCKER_BIN" inspect \
    --format '{{.Image}}' -- "$HEALTH_CONTAINER" || \
    fail_blocked health_unavailable "$EX_CONFIG"
  [[ $current_image_id == "$candidate_image_id" ]] || \
    fail_blocked deployed_image_mismatch "$EX_CONFIG"
  capture_external deployed_service "$DOCKER_BIN" inspect \
    --format '{{index .Config.Labels "com.docker.compose.service"}}' \
    -- "$HEALTH_CONTAINER" || fail_blocked health_unavailable "$EX_CONFIG"
  [[ $deployed_service == x-collector ]] || \
    fail_blocked deployed_container_mismatch "$EX_CONFIG"
  capture_external running_status "$DOCKER_BIN" inspect \
    --format '{{.State.Running}}' -- "$HEALTH_CONTAINER" || \
    fail_blocked health_unavailable "$EX_CONFIG"
  capture_external health_status "$DOCKER_BIN" inspect \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' \
    -- "$HEALTH_CONTAINER" || fail_blocked health_unavailable "$EX_CONFIG"
  [[ $running_status == true && $health_status == healthy ]] || \
    fail_blocked health_unavailable "$EX_CONFIG"
  IMAGE_ID=$candidate_image_id
}

prepare_tmpfs() {
  CANARY_TMP=$(safe_exec "$MKTEMP_BIN" -d /dev/shm/x-production-canary.XXXXXX \
    2>/dev/null) || fail_blocked tmpfs_unavailable "$EX_CONFIG"
  safe_exec "$CHOWN_BIN" "$HOST_FILE_UID:$HOST_FILE_GID" "$CANARY_TMP" || \
    fail_blocked tmpfs_unavailable "$EX_CONFIG"
  safe_exec "$CHMOD_BIN" 0700 "$CANARY_TMP" || \
    fail_blocked tmpfs_unavailable "$EX_CONFIG"
}

stage_cookies() {
  local destination=$1
  safe_exec "$INSTALL_BIN" -o "$HOST_FILE_UID" -g "$HOST_FILE_GID" \
    -m 0600 -- "$COOKIES_FILE" "$destination" 2>/dev/null || \
    fail_blocked "$INVENTORY_UNAVAILABLE_REASON" "$EX_CONFIG"
  [[ $(safe_exec "$STAT_BIN" -c %u:%g:%a "$destination") == \
      "$HOST_FILE_UID:$HOST_FILE_GID:600" ]] || \
    fail_blocked "$INVENTORY_UNAVAILABLE_REASON" "$EX_CONFIG"
  STAGED_COOKIES_FILE=$destination
}

prepare_tmpfs
stage_cookies "$CANARY_TMP/preflight-cookies.json"
verify_runtime_identity preflight

readonly INVENTORY_READY_WIRE='{"collectionAttempted":false,"observedAccountCount":4,"reasonCode":"x_canary.account_set_ready","requiredAccountCount":4,"schemaVersion":"x-production-account-canary.v1","status":"ready"}'
INVENTORY_REASON=
INVENTORY_OBSERVED=0

parse_blocked_inventory() {
  local payload=$1
  local prefix='{"collectionAttempted":false,"observedAccountCount": '
  prefix=${prefix% }
  [[ $payload == "$prefix"* ]] || return 1
  local remainder=${payload#"$prefix"}
  local observed=${remainder%%,*}
  [[ $observed =~ ^[0-9]+$ ]] || return 1
  local reason
  for reason in "$ACCOUNT_SET_REASON" "$INVENTORY_UNAVAILABLE_REASON"; do
    local expected
    expected="${prefix}${observed},\"reasonCode\":\"${reason}\",\"requiredAccountCount\":4,\"schemaVersion\":\"${SCHEMA_VERSION}\",\"status\":\"blocked\"}"
    if [[ $payload == "$expected" ]]; then
      INVENTORY_REASON=$reason
      INVENTORY_OBSERVED=$observed
      return 0
    fi
  done
  return 1
}

inventory_container() {
  local output_name=$1 phase=$2 output_dir=${3:-}
  local name="x-production-canary-${ACTION}-${phase}-$$"
  local -a arguments=(
    --init --read-only --cap-drop=ALL --security-opt=no-new-privileges
    --pids-limit=64 --memory=128m --cpus=0.5 --ulimit=nofile=128:128
    --network=none --user="$CONTAINER_UID:$CONTAINER_GID"
    --tmpfs "/tmp:rw,noexec,nosuid,nodev,uid=$CONTAINER_UID,gid=$CONTAINER_GID,mode=0700,size=16m"
    --mount "type=bind,src=$STAGED_COOKIES_FILE,dst=/run/x-canary/cookies.json,readonly"
  )
  local action=check
  if [[ $phase == locked-inventory ]]; then
    action=prepare
    arguments+=(
      --mount "type=bind,src=$CANARY_TMP,dst=/canary-host"
    )
  fi
  arguments+=(
    --entrypoint /usr/bin/env "$IMAGE_ID"
    -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/tmp PYTHONDONTWRITEBYTECODE=1
    python3 -B -m x_collector.canary_account_inventory "$action"
    --cookies-file /run/x-canary/cookies.json
  )
  if [[ $action == prepare ]]; then
    arguments+=(--output-dir "$output_dir")
  fi
  run_container_capture "$output_name" "$name" "${arguments[@]}"
}

inventory_payload=
if inventory_container inventory_payload preflight-inventory; then
  inventory_status=0
else
  inventory_status=$?
fi
if ((inventory_status != 0)) || [[ $inventory_payload != "$INVENTORY_READY_WIRE" ]]; then
  if parse_blocked_inventory "$inventory_payload"; then
    fail_blocked "$INVENTORY_REASON" "$EX_CONFIG" "$INVENTORY_OBSERVED"
  fi
  fail_blocked "$INVENTORY_UNAVAILABLE_REASON" "$EX_CONFIG"
fi

if [[ $ACTION == plan ]]; then
  emit_payload "$(ready_payload)" || exit "$EX_IOERR"
  exit 0
fi

safe_flock() {
  safe_exec "$FLOCK_BIN" -n "$1"
}

probe_daily_priority() {
  exec 7>"$CONTROL_DIR/daily-run-singleton.lock" || return 1
  if ! safe_flock 7; then
    exec 7>&-
    return 1
  fi
  exec 7>&-
}

exec 9>"$CONTROL_DIR/production-deploy.lock" || \
  fail_blocked deploy_lock_unavailable "$EX_CONFIG" "$REQUIRED_ACCOUNT_COUNT"
safe_flock 9 || \
  fail_blocked deploy_lock_unavailable "$EX_CONFIG" "$REQUIRED_ACCOUNT_COUNT"
probe_daily_priority || \
  fail_blocked daily_priority_active "$EX_CONFIG" "$REQUIRED_ACCOUNT_COUNT"
exec 8>"$CONTROL_DIR/daily-run.lock" || \
  fail_blocked daily_lock_unavailable "$EX_CONFIG" "$REQUIRED_ACCOUNT_COUNT"
safe_flock 8 || \
  fail_blocked daily_lock_unavailable "$EX_CONFIG" "$REQUIRED_ACCOUNT_COUNT"
probe_daily_priority || \
  fail_blocked daily_priority_active "$EX_CONFIG" "$REQUIRED_ACCOUNT_COUNT"
exec 6>"$CONTROL_DIR/x-production-account-canary.lock" || \
  fail_blocked canary_lock_unavailable "$EX_CONFIG" "$REQUIRED_ACCOUNT_COUNT"
safe_flock 6 || \
  fail_blocked canary_lock_unavailable "$EX_CONFIG" "$REQUIRED_ACCOUNT_COUNT"

LIVE_SCWEET_LOCK=$PRODUCTION_SCWEET_LOCK
if [[ $FIXTURE_MODE == true ]]; then
  LIVE_SCWEET_LOCK=$CONTROL_DIR/scweet_state.db.social-monitor-run.lock
fi
exec 5>"$LIVE_SCWEET_LOCK" || \
  fail_blocked live_scweet_lock_unavailable "$EX_CONFIG" "$REQUIRED_ACCOUNT_COUNT"
safe_flock 5 || \
  fail_blocked live_scweet_lock_unavailable "$EX_CONFIG" "$REQUIRED_ACCOUNT_COUNT"
probe_daily_priority || \
  fail_blocked daily_priority_active "$EX_CONFIG" "$REQUIRED_ACCOUNT_COUNT"

verify_runtime_identity locked
stage_cookies "$CANARY_TMP/locked-cookies.json"
ACCOUNT_DIR=$CANARY_TMP/accounts
locked_inventory=
if inventory_container locked_inventory locked-inventory /canary-host/accounts; then
  locked_inventory_status=0
else
  locked_inventory_status=$?
fi
if ((locked_inventory_status != 0)) || [[ $locked_inventory != "$INVENTORY_READY_WIRE" ]]; then
  if parse_blocked_inventory "$locked_inventory"; then
    fail_blocked "$INVENTORY_REASON" "$EX_CONFIG" "$INVENTORY_OBSERVED"
  fi
  fail_blocked "$INVENTORY_UNAVAILABLE_REASON" "$EX_CONFIG"
fi
[[ -d $ACCOUNT_DIR && $(safe_exec "$STAT_BIN" -c %u:%g:%a "$ACCOUNT_DIR") == \
   "$HOST_FILE_UID:$HOST_FILE_GID:700" ]] || \
  fail_blocked inventory_prepare_failed "$EX_CONFIG" "$REQUIRED_ACCOUNT_COUNT"
for ordinal in 1 2 3 4; do
  account_file=$ACCOUNT_DIR/account-$ordinal.json
  [[ -f $account_file && $(safe_exec "$STAT_BIN" -c %u:%g:%a "$account_file") == \
     "$HOST_FILE_UID:$HOST_FILE_GID:600" ]] || \
    fail_blocked inventory_prepare_failed "$EX_CONFIG" "$REQUIRED_ACCOUNT_COUNT"
done
account_files=("$ACCOUNT_DIR"/*)
[[ ${#account_files[@]} -eq $REQUIRED_ACCOUNT_COUNT ]] || \
  fail_blocked inventory_prepare_failed "$EX_CONFIG" "$REQUIRED_ACCOUNT_COUNT"

RESULTS_DIR=$CANARY_TMP/results
safe_exec "$MKDIR_BIN" -m 0700 -- "$RESULTS_DIR" || \
  fail_blocked tmpfs_unavailable "$EX_CONFIG" "$REQUIRED_ACCOUNT_COUNT"
safe_exec "$CHOWN_BIN" "$HOST_FILE_UID:$HOST_FILE_GID" "$RESULTS_DIR" || \
  fail_blocked tmpfs_unavailable "$EX_CONFIG" "$REQUIRED_ACCOUNT_COUNT"
for ordinal in 1 2 3 4; do
  account_file=$ACCOUNT_DIR/account-$ordinal.json
  result_file=$RESULTS_DIR/account-$ordinal.json
  collection_name="x-production-canary-account-${ordinal}-$$"
  account_result=
  if run_container_capture account_result "$collection_name" \
      --init --read-only --cap-drop=ALL --security-opt=no-new-privileges \
      --pids-limit=64 --memory=256m --cpus=0.5 --ulimit=nofile=128:128 \
      --network=bridge --user="$CONTAINER_UID:$CONTAINER_GID" \
      --tmpfs "/canary:rw,noexec,nosuid,nodev,uid=$CONTAINER_UID,gid=$CONTAINER_GID,mode=0700,size=32m" \
      --tmpfs "/tmp:rw,noexec,nosuid,nodev,uid=$CONTAINER_UID,gid=$CONTAINER_GID,mode=0700,size=16m" \
      --mount "type=bind,src=$account_file,dst=/run/x-canary/cookies.json,readonly" \
      --entrypoint /usr/bin/env "$IMAGE_ID" \
      -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/canary PYTHONDONTWRITEBYTECODE=1 \
      python3 -B -m x_collector.production_canary run \
      --cookies-file /run/x-canary/cookies.json \
      --db-path /canary/scweet-state.db \
      --account-ordinal "$ordinal"; then
    collection_status=0
  else
    collection_status=$?
  fi
  umask 077
  printf '%s\n' "$account_result" >"$result_file"
  safe_exec "$CHOWN_BIN" "$HOST_FILE_UID:$HOST_FILE_GID" "$result_file" || \
    fail_blocked result_persist_failed "$EX_CONFIG" "$REQUIRED_ACCOUNT_COUNT"
  [[ $(safe_exec "$STAT_BIN" -c %u:%g:%a "$result_file") == \
     "$HOST_FILE_UID:$HOST_FILE_GID:600" ]] || \
    fail_blocked result_persist_failed "$EX_CONFIG" "$REQUIRED_ACCOUNT_COUNT"
  if ((collection_status != 0)); then
    break
  fi
  validation_result=
  if ! run_container_capture validation_result \
      "x-production-canary-validate-${ordinal}-$$" \
      --init --read-only --cap-drop=ALL --security-opt=no-new-privileges \
      --pids-limit=32 --memory=128m --cpus=0.25 --ulimit=nofile=64:64 \
      --network=none --user="$CONTAINER_UID:$CONTAINER_GID" \
      --tmpfs "/tmp:rw,noexec,nosuid,nodev,uid=$CONTAINER_UID,gid=$CONTAINER_GID,mode=0700,size=8m" \
      --mount "type=bind,src=$result_file,dst=/run/x-canary/result.json,readonly" \
      --entrypoint /usr/bin/env "$IMAGE_ID" \
      -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/tmp PYTHONDONTWRITEBYTECODE=1 \
      python3 -B -m x_collector.production_canary validate-result \
      --result-file /run/x-canary/result.json; then
    break
  fi
done

final_payload=
if run_container_capture final_payload "x-production-canary-aggregate-$$" \
    --init --read-only --cap-drop=ALL --security-opt=no-new-privileges \
    --pids-limit=32 --memory=128m --cpus=0.25 --ulimit=nofile=64:64 \
    --network=none --user="$CONTAINER_UID:$CONTAINER_GID" \
    --tmpfs "/tmp:rw,noexec,nosuid,nodev,uid=$CONTAINER_UID,gid=$CONTAINER_GID,mode=0700,size=8m" \
    --mount "type=bind,src=$RESULTS_DIR,dst=/run/x-canary/results,readonly" \
    --entrypoint /usr/bin/env "$IMAGE_ID" \
    -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/tmp PYTHONDONTWRITEBYTECODE=1 \
    python3 -B -m x_collector.production_canary aggregate \
    --results-dir /run/x-canary/results \
    --expected-sha "$EXPECTED_SHA" --image-id "$IMAGE_ID"; then
  final_status=0
else
  final_status=$?
fi
if [[ $final_status != 0 && $final_status != "$EX_DATAERR" && \
      $final_status != "$EX_TEMPFAIL" ]] || \
   [[ -z $final_payload || \
      $final_payload != *"\"schemaVersion\":\"$SCHEMA_VERSION\""* ]]; then
  final_payload="{\"schemaVersion\":\"$SCHEMA_VERSION\",\"status\":\"failed\",\"reasonCode\":\"account_evidence_unavailable\",\"requiredAccountCount\":4,\"observedAccountCount\":0,\"collectionAttempted\":true,\"expectedSha\":\"$EXPECTED_SHA\",\"imageId\":\"$IMAGE_ID\",\"fixedQueryId\":\"x-production-canary-fixed-v1\",\"accounts\":[],\"totalFetchedCount\":0,\"warningCodes\":[]}"
  final_status=$EX_DATAERR
fi
emit_payload "$final_payload" || exit "$EX_IOERR"
exit "$final_status"
