#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
LIBRARY=$SCRIPT_DIR/backend-image-rescue-lib.sh
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/backend-image-rescue-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

PROJECT=fixture-project
FAKE_DOCKER_REFS=$FIXTURE/docker-refs.tsv
FAKE_DOCKER_CONTAINERS=$FIXTURE/docker-containers.tsv
FAKE_DOCKER_CONTAINER_STATES=$FIXTURE/docker-container-states.tsv
FAKE_COMPOSE_CONTAINERS=$FIXTURE/compose-containers.tsv
FAKE_COMPOSE_CONTAINER_STATES=$FIXTURE/compose-container-states.tsv
EVENT_LOG=$FIXTURE/events.log
export FAKE_DOCKER_REFS FAKE_DOCKER_CONTAINERS \
  FAKE_DOCKER_CONTAINER_STATES FAKE_COMPOSE_CONTAINERS \
  FAKE_COMPOSE_CONTAINER_STATES EVENT_LOG

ID_A=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
ID_B=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
ID_C=sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
ID_D=sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
ID_E=sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
# The dollar expressions are fixture data for the inspected legacy command.
# shellcheck disable=SC2016
LEGACY_CONFIG='["docker-entrypoint.sh"]|["sh","-c","case \"$SERVICE\" in api) exec node dist/apps/api-gateway/src/main.js ;; agent-runtime) exec node dist/apps/agent-runtime/src/main.js ;; ingestion) exec node dist/apps/ingestion-worker/src/main.js ;; intelligence) exec node dist/apps/intelligence-worker/src/main.js ;; delivery) exec node dist/apps/delivery-service/src/main.js ;; event-relay) exec node dist/apps/event-relay/src/main.js ;; *) echo \"Unknown service: $SERVICE\" >&2; exit 64 ;; esac"]|"/app"|"node"|null'
# The literal quotes are opaque Docker inspect fixture JSON, not shell syntax.
# shellcheck disable=SC2089
CONFIG='["/entry"]|["node","dist/main.js"]|"/app"|"node"|null'
# The literal quotes are opaque reconstructed-image fixture JSON.
# shellcheck disable=SC2089
export SAFE_API_CONFIG='["/usr/local/bin/docker-entrypoint.sh"]|["/usr/local/bin/node","dist/apps/api-gateway/src/main.js"]|"/app"|"node"|null'
X_COMMAND='["python","-m","x_collector"]'
X_WORKDIR='"/app/apps/x-collector"'
X_USER='"1000:1000"'
X_HEALTHCHECK="{\"Test\":[\"CMD\",\"python\",\"-c\",\"import socket; s=socket.create_connection(('127.0.0.1',50051),2); s.close()\"],\"Interval\":15000000000,\"Timeout\":5000000000,\"StartPeriod\":30000000000,\"Retries\":20}"
SAFE_X_CONFIG="null|$X_COMMAND|$X_WORKDIR|$X_USER|null"
LEGACY_X_CONFIG="null|$X_COMMAND|$X_WORKDIR|$X_USER|$X_HEALTHCHECK"
# The literal quotes are opaque Docker image Env fixture JSON.
# shellcheck disable=SC2089
SENTINEL_ENV='["RESCUE_SENTINEL_DO_NOT_PERSIST=fixture-only-value"]'
SHA=1111111111111111111111111111111111111111

FAKE_BIN=$FIXTURE/bin
install -d "$FAKE_BIN"
cat > "$FAKE_BIN/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

lookup_ref() {
  awk -F '\t' -v ref="$1" '$1 == ref {print $2; exit}' "$FAKE_DOCKER_REFS"
}

lookup_ref_config() {
  awk -F '\t' -v ref="$1" '$1 == ref {print $3; exit}' "$FAKE_DOCKER_REFS"
}

lookup_ref_env() {
  awk -F '\t' -v ref="$1" '$1 == ref {print $4; exit}' "$FAKE_DOCKER_REFS"
}

set_ref() {
  local ref=$1 image_id=$2 config=$3 env=${4:-null}
  local next=$FAKE_DOCKER_REFS.next.$$
  awk -F '\t' -v ref="$ref" '$1 != ref' "$FAKE_DOCKER_REFS" > "$next"
  printf '%s\t%s\t%s\t%s\n' "$ref" "$image_id" "$config" "$env" >> "$next"
  mv -f "$next" "$FAKE_DOCKER_REFS"
}

remove_ref() {
  local ref=$1 next=$FAKE_DOCKER_REFS.next.$$
  awk -F '\t' -v ref="$ref" '$1 != ref' "$FAKE_DOCKER_REFS" > "$next"
  mv -f "$next" "$FAKE_DOCKER_REFS"
}

append_docker_event() {
  local row=docker argument
  for argument in "$@"; do
    printf -v row '%s\t%s' "$row" "$argument"
  done
  {
    flock 9
    printf '%s\n' "$row" >&9
  } 9>> "$EVENT_LOG"
}

take_container_state() {
  local container=$1 row next=$FAKE_DOCKER_CONTAINER_STATES.next.$$
  row=$(awk -F '\t' -v container="$container" \
    '$1 == container {print; exit}' "$FAKE_DOCKER_CONTAINER_STATES")
  [[ -n $row ]] || return 1
  awk -F '\t' -v container="$container" \
    '$1 == container && !removed {removed=1; next} {print}' \
    "$FAKE_DOCKER_CONTAINER_STATES" > "$next"
  mv -f "$next" "$FAKE_DOCKER_CONTAINER_STATES"
  printf '%s\n' "${row#*$'\t'}"
}

append_docker_event "$@"

case ${1:-}:${2:-} in
  image:inspect)
    image_id=$(lookup_ref "$3")
    [[ -n $image_id ]] || exit 1
    if [[ ${*: -1} == *'.Id'* ]]; then
      printf '%s\n' "$image_id"
    elif [[ ${*: -1} == *'.Config.Env'* ]]; then
      lookup_ref_env "$3"
    else
      lookup_ref_config "$3"
    fi
    ;;
  image:tag)
    image_id=$(lookup_ref "$3")
    [[ -n $image_id ]] || exit 1
    config=$(lookup_ref_config "$3")
    env=$(lookup_ref_env "$3")
    set_ref "$4" "$image_id" "$config" "$env"
    if [[ ${FAKE_DOCKER_SIGNAL_TAG:-} == "$4" ]]; then
      kill -TERM "$PPID"
    fi
    ;;
  image:rm)
    [[ -n $(lookup_ref "$3") ]] || exit 1
    remove_ref "$3"
    ;;
  inspect:*)
    container=$2
    row=$(awk -F '\t' -v container="$container" \
      '$1 == container {print; exit}' "$FAKE_DOCKER_CONTAINERS")
    [[ -n $row ]] || exit 1
    IFS=$'\t' read -r _ image_id state config env restart_count <<< "$row"
    restart_count=${restart_count:-0}
    case ${*: -1} in
      *'.State.Status'*)
        state=$(take_container_state "$container" || printf '%s\n' "$state")
        [[ $state != missing ]] || exit 1
        IFS='|' read -r status running restarting oom_killed health \
          sampled_image sampled_restart_count <<< "$state"
        sampled_image=${sampled_image:-$image_id}
        sampled_restart_count=${sampled_restart_count:-$restart_count}
        if [[ ${*: -1} == *'.RestartCount'* ]]; then
          printf '%s|%s|%s|%s|%s|%s|%s\n' \
            "$status" "$running" "$restarting" "$oom_killed" "$health" \
            "$sampled_image" "$sampled_restart_count"
        else
          printf '%s|%s|%s|%s|%s\n' \
            "$status" "$running" "$restarting" "$oom_killed" "$health"
        fi
        ;;
      *'.Image'*'.RestartCount'*)
        printf '%s|%s\n' "$image_id" "$restart_count"
        ;;
      *'.Image'*) printf '%s\n' "$image_id" ;;
      *'.RestartCount'*) printf '%s\n' "$restart_count" ;;
      *) printf '%s\n' "$config" ;;
    esac
    ;;
  container:pause|container:unpause)
    [[ -n ${3:-} ]]
    ;;
  container:export)
    [[ -n ${3:-} ]]
    printf 'fixture-root-filesystem:%s\n' "$3"
    ;;
  image:import)
    cat >/dev/null
    [[ ${FAKE_IMPORT_STATUS:-0} == 0 ]] || exit "$FAKE_IMPORT_STATUS"
    rescue_tag=${*: -1}
    set_ref "$rescue_tag" "$FAKE_DOCKER_IMPORT_STORED_ID" \
      "$FAKE_DOCKER_IMPORT_CONFIG" "$FAKE_DOCKER_IMPORT_ENV"
    printf '%s\n' "$FAKE_DOCKER_IMPORT_ID"
    ;;
  *) exit 90 ;;
esac
SH
chmod 0755 "$FAKE_BIN/docker"
cat > "$FAKE_BIN/sleep" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf 'sleep\t%s\n' "$1" >> "$EVENT_LOG"
SH
chmod 0755 "$FAKE_BIN/sleep"
PATH=$FAKE_BIN:$PATH

compose_image_name() {
  printf '%s-%s:latest\n' "$PROJECT" "$1"
}

take_compose_container() {
  local service=$1 row next=$FAKE_COMPOSE_CONTAINER_STATES.next.$$
  row=$(awk -F '\t' -v service="$service" \
    '$1 == service {print; exit}' "$FAKE_COMPOSE_CONTAINER_STATES")
  [[ -n $row ]] || return 1
  awk -F '\t' -v service="$service" \
    '$1 == service && !removed {removed=1; next} {print}' \
    "$FAKE_COMPOSE_CONTAINER_STATES" > "$next"
  mv -f "$next" "$FAKE_COMPOSE_CONTAINER_STATES"
  printf '%s\n' "${row#*$'\t'}"
}

append_compose_event() {
  local row=compose argument
  for argument in "$@"; do
    printf -v row '%s\t%s' "$row" "$argument"
  done
  {
    flock 9
    printf '%s\n' "$row" >&9
  } 9>> "$EVENT_LOG"
}

fake_compose() {
  append_compose_event "$@"
  if [[ $* == *' ps -q '* ]]; then
    local service=${*: -1} queued_container
    if queued_container=$(take_compose_container "$service"); then
      [[ $queued_container == missing ]] || printf '%s\n' "$queued_container"
      return 0
    fi
    awk -F '\t' -v service="$service" '$1 == service {print $2}' \
      "$FAKE_COMPOSE_CONTAINERS"
    return 0
  fi
  [[ $* == *' up -d --no-deps --force-recreate '* ]] || return 91
  [[ ${FAKE_COMPOSE_UP_STATUS:-0} == 0 ]]
}

COMPOSE=(fake_compose)

stop_and_remove_database_services() {
  printf 'stop-database\t%s\n' "$*" >> "$EVENT_LOG"
  [[ ${FAKE_STOP_STATUS:-0} == 0 ]]
}

verify_backend_with_retry() {
  printf 'verify-backend\t%s\n' "$*" >> "$EVENT_LOG"
  [[ ${FAKE_VERIFY_STATUS:-0} == 0 ]]
}

refresh_frontend_api_proxy() {
  printf 'refresh-proxy\n' >> "$EVENT_LOG"
  [[ ${FAKE_PROXY_STATUS:-0} == 0 ]]
}

marker_value() {
  [[ -s $STATE/backend.sha ]] && tr -d '\n' < "$STATE/backend.sha"
}

# shellcheck source=ops/deploy/backend-image-rescue-lib.sh
source "$LIBRARY"

reset_case() {
  local name=$1
  STATE=$FIXTURE/$name/state
  install -d "$STATE"
  : > "$FAKE_DOCKER_REFS"
  : > "$FAKE_DOCKER_CONTAINERS"
  : > "$FAKE_DOCKER_CONTAINER_STATES"
  : > "$FAKE_COMPOSE_CONTAINERS"
  : > "$FAKE_COMPOSE_CONTAINER_STATES"
  : > "$EVENT_LOG"
  FAKE_DOCKER_IMPORT_ID=$ID_E
  FAKE_DOCKER_IMPORT_STORED_ID=$ID_E
  # The literal quotes are opaque Docker inspect fixture JSON, not shell syntax.
  # shellcheck disable=SC2089
  FAKE_DOCKER_IMPORT_CONFIG=$SAFE_API_CONFIG
  FAKE_DOCKER_IMPORT_ENV='[]'
  # Export preserves that opaque JSON for the fake docker child process.
  # shellcheck disable=SC2090
  export FAKE_DOCKER_IMPORT_ID FAKE_DOCKER_IMPORT_STORED_ID \
    FAKE_DOCKER_IMPORT_CONFIG FAKE_DOCKER_IMPORT_ENV
  unset FAKE_DOCKER_SIGNAL_TAG FAKE_COMPOSE_UP_STATUS FAKE_STOP_STATUS \
    FAKE_VERIFY_STATUS FAKE_PROXY_STATUS FAKE_IMPORT_STATUS
}

add_ref() {
  printf '%s\t%s\t%s\t%s\n' "$1" "$2" "${3:-$CONFIG}" "${4:-null}" \
    >> "$FAKE_DOCKER_REFS"
}

add_container() {
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$2" "$3" \
    "${4:-running|true|false|false|none}" "${5:-$CONFIG}" "${6:-[]}" \
    "${7:-0}" \
    >> "$FAKE_DOCKER_CONTAINERS"
  printf '%s\t%s\n' "$1" "$2" >> "$FAKE_COMPOSE_CONTAINERS"
}

queue_compose_containers() {
  local service=$1 container
  shift
  for container in "$@"; do
    printf '%s\t%s\n' "$service" "$container" \
      >> "$FAKE_COMPOSE_CONTAINER_STATES"
  done
}

queue_container_states() {
  local container=$1 state
  shift
  for state in "$@"; do
    printf '%s\t%s\n' "$container" "$state" \
      >> "$FAKE_DOCKER_CONTAINER_STATES"
  done
}

set_import_service_config() {
  FAKE_DOCKER_IMPORT_CONFIG=$(
    backend_image_rescue_reconstructed_image_config "$1"
  )
  export FAKE_DOCKER_IMPORT_CONFIG
}

set_ref_direct() {
  local ref=$1 image_id=$2 config=${3:-$CONFIG} env=${4:-null}
  local next=$FAKE_DOCKER_REFS.next
  awk -F '\t' -v ref="$ref" '$1 != ref' "$FAKE_DOCKER_REFS" > "$next"
  printf '%s\t%s\t%s\t%s\n' "$ref" "$image_id" "$config" "$env" >> "$next"
  mv -f "$next" "$FAKE_DOCKER_REFS"
}

ref_id() {
  awk -F '\t' -v ref="$1" '$1 == ref {print $2; exit}' "$FAKE_DOCKER_REFS"
}

assert_no_rescue_refs() {
  if awk -F '\t' -v prefix="$PROJECT-rollback-rescue:" \
    'index($1, prefix) == 1 {found=1} END {exit !found}' "$FAKE_DOCKER_REFS"; then
    echo 'unexpected rescue tag remained' >&2
    exit 1
  fi
}

assert_failed_rescue_cleaned() {
  local state_file=$1
  [[ ! -e $state_file && ! -e $state_file.partial ]]
  assert_no_rescue_refs
}

assert_fails() {
  set +e
  "$@"
  local status=$?
  set -e
  ((status != 0))
}

prepare_reconcile_state() {
  local sha=$1 phase=$2 container=$3 state
  add_ref "$ID_A" "$ID_A"
  add_container api "$container" "$ID_A"
  state=$(backend_image_rescue_state_file "$sha")
  backend_image_rescue_prepare "$sha" "$state" api
  case $phase in
    prepared) ;;
    replacement-started) backend_image_rescue_mark_replacement_started "$state" ;;
    rollback-complete) backend_image_rescue_write_phase "$state" rollback-complete ;;
    *) return 1 ;;
  esac
  printf '%s\n' "$state"
}

((BACKEND_IMAGE_RESCUE_POST_UNPAUSE_TIMEOUT_SECONDS == 60))
((BACKEND_IMAGE_RESCUE_POST_UNPAUSE_POLL_SECONDS == 3))
BACKEND_IMAGE_RESCUE_POST_UNPAUSE_TIMEOUT_SECONDS=2
BACKEND_IMAGE_RESCUE_POST_UNPAUSE_POLL_SECONDS=1

# Running services are pinned from their recorded image IDs. The migrate and
# daily-runner one-shot policies pin their existing Compose tags, but rollback
# never attempts to recreate those containers.
reset_case normal
add_ref "$ID_A" "$ID_A"
add_ref "$(compose_image_name migrate)" "$ID_B"
add_ref "$(compose_image_name daily-runner)" "$ID_C"
add_ref other-project-rollback-rescue:keep "$ID_D"
add_container api api-container "$ID_A"
normal_state=$(backend_image_rescue_state_file "$SHA")
backend_image_rescue_prepare "$SHA" "$normal_state" api migrate daily-runner
backend_image_rescue_validate "$normal_state" api migrate daily-runner
[[ $(stat -c '%a' "$normal_state") == 600 ]]
[[ $(backend_image_rescue_read_phase "$normal_state") == prepared ]]
[[ $(stat -c '%a' "$(backend_image_rescue_phase_file "$normal_state")") == 600 ]]
grep -F $'image\tapi\trecreate\trunning-image\tapi-container' "$normal_state" >/dev/null
grep -F $'image\tmigrate\ttag-only-migrate\tcompose-tag' "$normal_state" >/dev/null
grep -F $'image\tdaily-runner\ttag-only-daily-runner\tcompose-tag' "$normal_state" >/dev/null
if grep -F $'docker\tcommit' "$EVENT_LOG" >/dev/null; then
  echo 'ordinary image pin unexpectedly used docker commit' >&2
  exit 1
fi
backend_image_rescue_cleanup "$normal_state"
[[ ! -e $normal_state ]]
[[ $(ref_id other-project-rollback-rescue:keep) == "$ID_D" ]]
assert_no_rescue_refs

# If and only if the running container's recorded image object is missing, a
# reviewed Node-service config can reconstruct a paused filesystem export. The
# production container Env, including a sentinel secret, is never copied.
reset_case adoption
add_container api adopted-api "$ID_A" 'running|true|false|false|healthy' \
  "$LEGACY_CONFIG" "$SENTINEL_ENV"
adoption_state=$(backend_image_rescue_state_file "$SHA")
backend_image_rescue_prepare "$SHA" "$adoption_state" api
grep -F $'image\tapi\trecreate\tcontainer-export-import\tadopted-api' \
  "$adoption_state" >/dev/null
grep -F $'docker\tcontainer\tpause\tadopted-api' "$EVENT_LOG" >/dev/null
grep -F $'docker\tcontainer\texport\tadopted-api' "$EVENT_LOG" >/dev/null
grep -F $'docker\timage\timport' "$EVENT_LOG" >/dev/null
grep -F $'docker\tcontainer\tunpause\tadopted-api' "$EVENT_LOG" >/dev/null
[[ $(ref_id "$(backend_image_rescue_tag "$SHA" api)") == "$ID_E" ]]
adopted_config=$(
  backend_image_rescue_image_config "$(backend_image_rescue_tag "$SHA" api)"
)
adopted_env=$(
  backend_image_rescue_image_env "$(backend_image_rescue_tag "$SHA" api)"
)
[[ $adopted_config == "$SAFE_API_CONFIG" ]]
[[ $adopted_config != *RESCUE_SENTINEL_DO_NOT_PERSIST* ]]
[[ $adopted_env == '[]' ]]
[[ $adopted_env != *RESCUE_SENTINEL_DO_NOT_PERSIST* ]]
[[ $(grep -c $'^sleep\t1$' "$EVENT_LOG") == 2 ]]
baseline_line=$(grep -nF \
  $'docker\tinspect\tadopted-api\t--format\t{{.RestartCount}}' \
  "$EVENT_LOG" | cut -d: -f1)
pause_line=$(grep -nF $'docker\tcontainer\tpause\tadopted-api' \
  "$EVENT_LOG" | cut -d: -f1)
[[ -n $baseline_line && -n $pause_line ]]
((baseline_line < pause_line))
if grep -F $'docker\tcommit' "$EVENT_LOG" >/dev/null; then
  echo 'safe missing-image reconstruction unexpectedly used docker commit' >&2
  exit 1
fi

# A completed snapshot is immutable across an interrupted deploy retry. It is
# validated and reused instead of being overwritten from current/latest tags.
tag_count_before=$(grep -c $'docker\timage\ttag' "$EVENT_LOG" || true)
import_count_before=$(grep -c $'docker\timage\timport' "$EVENT_LOG" || true)
set_ref_direct "$(compose_image_name api)" "$ID_B"
backend_image_rescue_prepare "$SHA" "$adoption_state" api
tag_count_after=$(grep -c $'docker\timage\ttag' "$EVENT_LOG" || true)
import_count_after=$(grep -c $'docker\timage\timport' "$EVENT_LOG" || true)
((tag_count_before == tag_count_after && import_count_before == import_count_after))
backend_image_rescue_cleanup "$adoption_state"

# Imported rescue identity, reviewed config, and non-empty Env are each validated
# after unpause and before runtime stability polling.
for validation_case in id config env x-sentinel-env; do
  reset_case "strict-rescue-$validation_case"
  validation_service=api validation_container_config=$LEGACY_CONFIG
  case $validation_case in
    id) FAKE_DOCKER_IMPORT_STORED_ID=$ID_D ;;
    config) FAKE_DOCKER_IMPORT_CONFIG=$CONFIG ;;
    env) FAKE_DOCKER_IMPORT_ENV=$SENTINEL_ENV ;;
    x-sentinel-env) validation_service=x-collector; validation_container_config=$LEGACY_X_CONFIG; set_import_service_config x-collector; FAKE_DOCKER_IMPORT_ENV=$SENTINEL_ENV ;;
  esac
  # Export preserves the selected opaque JSON fixtures for fake docker.
  # shellcheck disable=SC2090
  export FAKE_DOCKER_IMPORT_STORED_ID FAKE_DOCKER_IMPORT_CONFIG \
    FAKE_DOCKER_IMPORT_ENV
  add_container "$validation_service" "strict-rescue-$validation_case-api" "$ID_A" \
    'running|true|false|false|healthy' "$validation_container_config" "$SENTINEL_ENV"
  strict_state=$(backend_image_rescue_state_file "$SHA")
  set +e
  backend_image_rescue_prepare "$SHA" "$strict_state" "$validation_service"
  strict_status=$?
  set -e
  ((strict_status != 0))
  grep -F $'docker\tcontainer\tunpause' "$EVENT_LOG" >/dev/null
  [[ $(grep -c $'^sleep\t1$' "$EVENT_LOG" || true) == 0 ]]
  assert_failed_rescue_cleaned "$strict_state"
done

# One bounded restart is accepted only after transient restarting, exited, and
# health-starting samples are followed by three stable samples at baseline+1.
reset_case one-post-unpause-restart
BACKEND_IMAGE_RESCUE_POST_UNPAUSE_TIMEOUT_SECONDS=5
set_import_service_config intelligence-worker
add_container intelligence-worker restarting-intelligence "$ID_A" \
  'running|true|false|false|healthy' "$LEGACY_CONFIG" "$SENTINEL_ENV"
queue_container_states restarting-intelligence \
  "running|true|false|false|healthy|$ID_A|0" \
  "restarting|false|true|false|none|$ID_A|1" \
  "exited|false|false|false|none|$ID_A|1" \
  "running|true|false|false|starting|$ID_A|1" \
  "running|true|false|false|healthy|$ID_A|1" \
  "running|true|false|false|healthy|$ID_A|1" \
  "running|true|false|false|healthy|$ID_A|1"
transient_state=$(backend_image_rescue_state_file "$SHA")
backend_image_rescue_prepare "$SHA" "$transient_state" intelligence-worker
grep -F $'image\tintelligence-worker\trecreate\tcontainer-export-import\trestarting-intelligence' \
  "$transient_state" >/dev/null
[[ $(grep -c $'^sleep\t1$' "$EVENT_LOG") == 5 ]]
[[ $(ref_id "$(backend_image_rescue_tag "$SHA" intelligence-worker)") == \
   "$ID_E" ]]
backend_image_rescue_cleanup "$transient_state"
assert_no_rescue_refs
BACKEND_IMAGE_RESCUE_POST_UNPAUSE_TIMEOUT_SECONDS=2

# Losing the original container during the wait is an immediate failure; the
# rescue never follows a replacement container with the same Compose service.
reset_case missing-post-unpause
add_container intelligence-worker missing-intelligence "$ID_A" \
  'running|true|false|false|healthy' "$LEGACY_CONFIG" "$SENTINEL_ENV"
set_import_service_config intelligence-worker
queue_container_states missing-intelligence \
  'running|true|false|false|healthy' missing
missing_post_unpause_state=$(backend_image_rescue_state_file "$SHA")
set +e
backend_image_rescue_prepare \
  "$SHA" "$missing_post_unpause_state" intelligence-worker
missing_post_unpause_status=$?
set -e
((missing_post_unpause_status != 0))
[[ $(grep -c $'^sleep\t1$' "$EVENT_LOG" || true) == 0 ]]
assert_failed_rescue_cleaned "$missing_post_unpause_state"

# A malformed baseline is rejected before pause. A malformed or decreased
# post-unpause count also fails on its first sample.
reset_case malformed-restart-baseline
set_import_service_config api
add_container api malformed-baseline-api "$ID_A" \
  'running|true|false|false|healthy' "$LEGACY_CONFIG" "$SENTINEL_ENV" bad
malformed_baseline_state=$(backend_image_rescue_state_file "$SHA")
set +e
backend_image_rescue_prepare "$SHA" "$malformed_baseline_state" api
malformed_baseline_status=$?
set -e
((malformed_baseline_status != 0))
if grep -F $'docker\tcontainer\tpause\tmalformed-baseline-api' \
  "$EVENT_LOG" >/dev/null; then
  echo 'container was paused before a valid restart baseline was captured' >&2
  exit 1
fi
assert_failed_rescue_cleaned "$malformed_baseline_state"

reset_case malformed-post-unpause-restart
set_import_service_config api
add_container api malformed-restart-api "$ID_A" \
  'running|true|false|false|healthy' "$LEGACY_CONFIG" "$SENTINEL_ENV"
queue_container_states malformed-restart-api \
  "running|true|false|false|healthy|$ID_A|0" \
  "running|true|false|false|healthy|$ID_A|bad"
malformed_restart_state=$(backend_image_rescue_state_file "$SHA")
set +e
backend_image_rescue_prepare "$SHA" "$malformed_restart_state" api
malformed_restart_status=$?
set -e
((malformed_restart_status != 0))
[[ $(grep -c $'^sleep\t1$' "$EVENT_LOG" || true) == 0 ]]
assert_failed_rescue_cleaned "$malformed_restart_state"

reset_case decreased-post-unpause-restart
set_import_service_config api
add_container api decreased-restart-api "$ID_A" \
  'running|true|false|false|healthy' "$LEGACY_CONFIG" "$SENTINEL_ENV" 2
queue_container_states decreased-restart-api \
  "running|true|false|false|healthy|$ID_A|2" \
  "restarting|false|true|false|none|$ID_A|3" \
  "running|true|false|false|healthy|$ID_A|2"
decreased_restart_state=$(backend_image_rescue_state_file "$SHA")
set +e
backend_image_rescue_prepare "$SHA" "$decreased_restart_state" api
decreased_restart_status=$?
set -e
((decreased_restart_status != 0))
[[ $(grep -c $'^sleep\t1$' "$EVENT_LOG") == 1 ]]
assert_failed_rescue_cleaned "$decreased_restart_state"

# Baseline+2 is never accepted, including if the container looks healthy.
reset_case excessive-post-unpause-restart
set_import_service_config api
add_container api excessive-restart-api "$ID_A" \
  'running|true|false|false|healthy' "$LEGACY_CONFIG" "$SENTINEL_ENV" 3
queue_container_states excessive-restart-api \
  "running|true|false|false|healthy|$ID_A|3" \
  "running|true|false|false|healthy|$ID_A|5"
excessive_restart_state=$(backend_image_rescue_state_file "$SHA")
set +e
backend_image_rescue_prepare "$SHA" "$excessive_restart_state" api
excessive_restart_status=$?
set -e
((excessive_restart_status != 0))
[[ $(grep -c $'^sleep\t1$' "$EVENT_LOG" || true) == 0 ]]
assert_failed_rescue_cleaned "$excessive_restart_state"

# A container that never returns to the strict running state times out. The
# imported tag and partial manifest are removed, so no build can consume them.
reset_case permanent-post-unpause-stop
set_import_service_config ingestion-worker
add_container ingestion-worker stopped-ingestion "$ID_A" \
  'running|true|false|false|healthy' "$LEGACY_CONFIG" "$SENTINEL_ENV"
queue_container_states stopped-ingestion \
  'running|true|false|false|healthy' \
  'exited|false|false|false|none' \
  'exited|false|false|false|none' \
  'exited|false|false|false|none'
stopped_state=$(backend_image_rescue_state_file "$SHA")
set +e
backend_image_rescue_prepare "$SHA" "$stopped_state" ingestion-worker
stopped_status=$?
set -e
((stopped_status != 0))
[[ $(grep -c $'^sleep\t1$' "$EVENT_LOG") == 2 ]]
assert_failed_rescue_cleaned "$stopped_state"

# OOM and unhealthy states remain fail-closed even if Docker still reports the
# same container as running for every bounded poll.
reset_case permanent-post-unpause-oom
set_import_service_config ingestion-worker
add_container ingestion-worker oom-ingestion "$ID_A" \
  'running|true|false|false|healthy' "$LEGACY_CONFIG" "$SENTINEL_ENV"
queue_container_states oom-ingestion \
  "running|true|false|false|healthy|$ID_A|0" \
  "running|true|false|true|none|$ID_A|0"
oom_state=$(backend_image_rescue_state_file "$SHA")
set +e
backend_image_rescue_prepare "$SHA" "$oom_state" ingestion-worker
oom_status=$?
set -e
((oom_status != 0))
[[ $(grep -c $'^sleep\t1$' "$EVENT_LOG" || true) == 0 ]]
assert_failed_rescue_cleaned "$oom_state"

reset_case permanent-post-unpause-unhealthy
set_import_service_config intelligence-worker
add_container intelligence-worker unhealthy-intelligence "$ID_A" \
  'running|true|false|false|healthy' "$LEGACY_CONFIG" "$SENTINEL_ENV"
queue_container_states unhealthy-intelligence \
  "running|true|false|false|healthy|$ID_A|0" \
  "running|true|false|false|unhealthy|$ID_A|0"
post_unpause_unhealthy_state=$(backend_image_rescue_state_file "$SHA")
set +e
backend_image_rescue_prepare \
  "$SHA" "$post_unpause_unhealthy_state" intelligence-worker
post_unpause_unhealthy_status=$?
set -e
((post_unpause_unhealthy_status != 0))
[[ $(grep -c $'^sleep\t1$' "$EVENT_LOG" || true) == 0 ]]
assert_failed_rescue_cleaned "$post_unpause_unhealthy_state"

# A changed container image fails before any stability wait can continue.
reset_case post-unpause-image-mismatch
set_import_service_config api
add_container api image-mismatch-api "$ID_A" \
  'running|true|false|false|healthy' "$LEGACY_CONFIG" "$SENTINEL_ENV"
queue_container_states image-mismatch-api \
  "running|true|false|false|healthy|$ID_A|0" \
  "running|true|false|false|healthy|$ID_B|0"
image_mismatch_state=$(backend_image_rescue_state_file "$SHA")
set +e
backend_image_rescue_prepare "$SHA" "$image_mismatch_state" api
image_mismatch_status=$?
set -e
((image_mismatch_status != 0))
[[ $(grep -c $'^sleep\t1$' "$EVENT_LOG" || true) == 0 ]]
assert_failed_rescue_cleaned "$image_mismatch_state"

# Even after three good samples, the final Compose mapping must still name the
# exact container captured before pause.
reset_case post-unpause-compose-replacement
set_import_service_config api
add_container api original-api "$ID_A" \
  'running|true|false|false|healthy' "$LEGACY_CONFIG" "$SENTINEL_ENV"
queue_compose_containers api \
  original-api original-api original-api original-api original-api replacement-api
replacement_state=$(backend_image_rescue_state_file "$SHA")
set +e
backend_image_rescue_prepare "$SHA" "$replacement_state" api
replacement_status=$?
set -e
((replacement_status != 0))
[[ $(grep -c $'^sleep\t1$' "$EVENT_LOG") == 2 ]]
if grep -F $'docker\tinspect\treplacement-api' "$EVENT_LOG" >/dev/null; then
  echo 'rescue followed the replacement instead of the original container' >&2
  exit 1
fi
assert_failed_rescue_cleaned "$replacement_state"

# Missing or unhealthy required persistent containers fail closed and leave no
# tag or state that could let a build begin with a partial snapshot.
reset_case missing-running
missing_state=$(backend_image_rescue_state_file "$SHA")
set +e
backend_image_rescue_prepare "$SHA" "$missing_state" api
missing_status=$?
set -e
((missing_status != 0))
[[ ! -e $missing_state && ! -e $missing_state.partial ]]
assert_no_rescue_refs

reset_case unhealthy-running
add_ref "$ID_A" "$ID_A"
add_container api unhealthy-api "$ID_A" 'running|true|false|false|unhealthy'
unhealthy_state=$(backend_image_rescue_state_file "$SHA")
set +e
backend_image_rescue_prepare "$SHA" "$unhealthy_state" api
unhealthy_status=$?
set -e
((unhealthy_status != 0))
[[ ! -e $unhealthy_state && ! -e $unhealthy_state.partial ]]
assert_no_rescue_refs

reset_case config-mismatch
add_container api mismatch-api "$ID_A" 'running|true|false|false|healthy' \
  '[]|[]|"/wrong"|"root"' "$SENTINEL_ENV"
mismatch_state=$(backend_image_rescue_state_file "$SHA")
set +e
backend_image_rescue_prepare "$SHA" "$mismatch_state" api
mismatch_status=$?
set -e
((mismatch_status != 0))
[[ ! -e $mismatch_state && ! -e $mismatch_state.partial ]]
assert_no_rescue_refs

# The legacy x-collector is reconstructed without copying container metadata.
for x_env_case in array null; do
  case $x_env_case in
    array) x_empty_env='[]' ;;
    null) x_empty_env=null ;;
  esac
  reset_case "x-collector-adoption-$x_env_case"
  set_import_service_config x-collector
  FAKE_DOCKER_IMPORT_ENV=$x_empty_env
  export FAKE_DOCKER_IMPORT_ENV
  add_container x-collector rescued-x "$ID_A" \
    'running|true|false|false|healthy' "$LEGACY_X_CONFIG" "$SENTINEL_ENV"
  x_state=$(backend_image_rescue_state_file "$SHA")
  backend_image_rescue_prepare "$SHA" "$x_state" x-collector
  grep -F \
    $'image\tx-collector\trecreate\tcontainer-export-import\trescued-x' \
    "$x_state" >/dev/null
  x_tag=$(backend_image_rescue_tag "$SHA" x-collector)
  [[ $(backend_image_rescue_image_config "$x_tag") == "$SAFE_X_CONFIG" ]]
  [[ $(backend_image_rescue_image_env "$x_tag") == "$x_empty_env" ]]
  printf -v expected_x_import '%s%s%s%s%s' \
    $'docker\timage\timport\t--change\t' \
    'CMD ["python","-m","x_collector"]' \
    $'\t--change\tWORKDIR /app/apps/x-collector' \
    $'\t--change\tUSER 1000:1000\t-\t' \
    "$x_tag"
  grep -Fx "$expected_x_import" "$EVENT_LOG" >/dev/null
  grep -F $'docker\tcontainer\tpause\trescued-x' \
    "$EVENT_LOG" >/dev/null
  grep -F $'docker\tcontainer\texport\trescued-x' \
    "$EVENT_LOG" >/dev/null
  grep -F $'docker\tcontainer\tunpause\trescued-x' \
    "$EVENT_LOG" >/dev/null
  backend_image_rescue_mark_replacement_started "$x_state"
  set_ref_direct "$(compose_image_name x-collector)" "$ID_D"
  : > "$EVENT_LOG"
  rollback_backend_images "$x_state"
  grep -F \
    $'compose\t--profile\tapp\tup\t-d\t--no-deps\t--force-recreate\tx-collector' \
    "$EVENT_LOG" >/dev/null
  [[ $(ref_id "$(compose_image_name x-collector)") == "$ID_E" ]]
  backend_image_rescue_cleanup "$x_state"
done

# Every reviewed x-collector metadata field is validated before pause/export.
for x_drift in entrypoint command workdir user healthcheck; do
  reset_case "x-drift-$x_drift"
  drift_entrypoint=null drift_command=$X_COMMAND drift_workdir=$X_WORKDIR
  drift_user=$X_USER drift_healthcheck=$X_HEALTHCHECK
  case $x_drift in
    entrypoint) drift_entrypoint='["drift"]' ;;
    command) drift_command='["drift"]' ;;
    workdir) drift_workdir='"/drift"' ;;
    user) drift_user='"0:0"' ;;
    healthcheck) drift_healthcheck=null ;;
  esac
  drift_config="$drift_entrypoint|$drift_command|$drift_workdir|$drift_user|$drift_healthcheck"
  add_container x-collector "drift-$x_drift" "$ID_A" \
    'running|true|false|false|healthy' "$drift_config" "$SENTINEL_ENV"
  drift_state=$(backend_image_rescue_state_file "$SHA")
  set +e
  backend_image_rescue_prepare "$SHA" "$drift_state" x-collector
  drift_status=$?
  set -e
  ((drift_status != 0))
  if grep -E $'docker\tcontainer\t(pause|export)\t' "$EVENT_LOG" >/dev/null; then
    echo "x-collector $x_drift drift was touched before validation" >&2
    exit 1
  fi
  assert_failed_rescue_cleaned "$drift_state"
done

# A failed import always unpauses the healthy container and removes the exact
# partial rescue tag/state; it never falls back to copying container metadata.
reset_case import-failure
add_container api import-failure-api "$ID_A" \
  'running|true|false|false|healthy' "$LEGACY_CONFIG" "$SENTINEL_ENV"
export FAKE_IMPORT_STATUS=73
import_failure_state=$(backend_image_rescue_state_file "$SHA")
set +e
backend_image_rescue_prepare "$SHA" "$import_failure_state" api
import_failure_status=$?
set -e
((import_failure_status != 0))
grep -F $'docker\tcontainer\tunpause\timport-failure-api' "$EVENT_LOG" >/dev/null
[[ ! -e $import_failure_state && ! -e $import_failure_state.partial ]]
assert_no_rescue_refs
unset FAKE_IMPORT_STATUS

# HUP/INT/TERM use the same partial-snapshot cleanup path. A simulated TERM
# after the first tag proves the exact tag and partial ledger are removed.
reset_case signal-cleanup
add_ref "$ID_A" "$ID_A"
add_container api signal-api "$ID_A"
signal_state=$(backend_image_rescue_state_file "$SHA")
export FAKE_DOCKER_SIGNAL_TAG
FAKE_DOCKER_SIGNAL_TAG=$(backend_image_rescue_tag "$SHA" api)
set +e
backend_image_rescue_prepare "$SHA" "$signal_state" api
signal_status=$?
set -e
((signal_status != 0))
[[ ! -e $signal_state && ! -e $signal_state.partial ]]
assert_no_rescue_refs
unset FAKE_DOCKER_SIGNAL_TAG

# A SIGKILL-style abandoned partial cannot have reached build. The following
# deploy removes only deterministic project rescue names and preserves another
# project's similarly named tag.
reset_case abandoned-partial
abandoned_sha=2222222222222222222222222222222222222222
abandoned_partial=$STATE/backend-image-rescue-$abandoned_sha.tsv.partial
: > "$abandoned_partial"
add_ref "$(backend_image_rescue_tag "$abandoned_sha" api)" "$ID_A"
add_ref other-project-rollback-rescue:keep "$ID_D"
add_ref "$ID_B" "$ID_B"
add_container api next-api "$ID_B"
next_state=$(backend_image_rescue_state_file "$SHA")
backend_image_rescue_prepare "$SHA" "$next_state" api
[[ ! -e $abandoned_partial ]]
[[ -z $(ref_id "$(backend_image_rescue_tag "$abandoned_sha" api)") ]]
[[ $(ref_id other-project-rollback-rescue:keep) == "$ID_D" ]]
backend_image_rescue_cleanup "$next_state"

# Before replacement, rollback restores every Compose tag but leaves all
# healthy containers untouched. This covers failures in preflight, backup,
# build, and migration, which all occur while the durable phase is prepared.
reset_case rollback-before-replacement
add_ref "$ID_A" "$ID_A"
add_ref "$(compose_image_name migrate)" "$ID_B"
add_ref "$(compose_image_name daily-runner)" "$ID_C"
add_ref other-project-rollback-rescue:keep "$ID_D"
add_container api rollback-api "$ID_A"
rollback_state=$(backend_image_rescue_state_file "$SHA")
backend_image_rescue_prepare "$SHA" "$rollback_state" api migrate daily-runner
set_ref_direct "$(compose_image_name api)" "$ID_E"
set_ref_direct "$(compose_image_name migrate)" "$ID_E"
set_ref_direct "$(compose_image_name daily-runner)" "$ID_E"
: > "$EVENT_LOG"
rollback_backend_images "$rollback_state"
[[ $(ref_id "$(compose_image_name api)") == "$ID_A" ]]
[[ $(ref_id "$(compose_image_name migrate)") == "$ID_B" ]]
[[ $(ref_id "$(compose_image_name daily-runner)") == "$ID_C" ]]
[[ $(backend_image_rescue_read_phase "$rollback_state") == rollback-complete ]]
if grep -E $'^(stop-database|compose\t.*force-recreate|verify-backend)' \
  "$EVENT_LOG" >/dev/null; then
  echo 'pre-replacement rollback touched healthy containers' >&2
  exit 1
fi

# A rescue that has entered rollback cannot be reused as a fresh snapshot by a
# same-release process retry. The outer rollback remains the only recovery path.
set +e
backend_image_rescue_prepare "$SHA" "$rollback_state" api migrate daily-runner
completed_retry_status=$?
set -e
((completed_retry_status != 0))
[[ $(backend_image_rescue_read_phase "$rollback_state") == rollback-complete ]]
backend_image_rescue_cleanup "$rollback_state"
assert_no_rescue_refs

# Once replacement is durably marked, rollback restores the same tags and
# recreates/verifies persistent services exactly once. One-shot services stay
# tag-only, and success records a terminal phase so an outer retry cannot
# double-run it or reuse the rescue as a fresh deployment snapshot.
reset_case rollback-after-replacement
add_ref "$ID_A" "$ID_A"
add_ref "$(compose_image_name migrate)" "$ID_B"
add_ref "$(compose_image_name daily-runner)" "$ID_C"
add_ref other-project-rollback-rescue:keep "$ID_D"
add_container api rollback-api "$ID_A"
rollback_state=$(backend_image_rescue_state_file "$SHA")
backend_image_rescue_prepare "$SHA" "$rollback_state" api migrate daily-runner
set_ref_direct "$(compose_image_name api)" "$ID_E"
set_ref_direct "$(compose_image_name migrate)" "$ID_E"
set_ref_direct "$(compose_image_name daily-runner)" "$ID_E"
backend_image_rescue_mark_replacement_started "$rollback_state"
set +e
backend_image_rescue_prepare "$SHA" "$rollback_state" api migrate daily-runner
started_retry_status=$?
set -e
((started_retry_status != 0))
[[ $(backend_image_rescue_read_phase "$rollback_state") == replacement-started ]]
: > "$EVENT_LOG"
rollback_backend_images "$rollback_state"
[[ $(backend_image_rescue_read_phase "$rollback_state") == rollback-complete ]]
grep -F $'compose\t--profile\tapp\tup\t-d\t--no-deps\t--force-recreate\tapi' \
  "$EVENT_LOG" >/dev/null
if grep -E $'force-recreate.*(migrate|daily-runner)' "$EVENT_LOG" >/dev/null; then
  echo 'tag-only service was recreated during rollback' >&2
  exit 1
fi
grep -F 'refresh-proxy' "$EVENT_LOG" >/dev/null
[[ $(grep -c '^stop-database' "$EVENT_LOG") == 1 ]]
[[ $(grep -c $'^compose\t.*force-recreate' "$EVENT_LOG") == 1 ]]
[[ $(grep -c '^verify-backend' "$EVENT_LOG") == 1 ]]
[[ $(grep -c '^refresh-proxy' "$EVENT_LOG") == 1 ]]

restore_postgres_runtime_control() {
  printf 'restore-runtime\t%s\n' "$1" >> "$EVENT_LOG"
}
: > "$EVENT_LOG"
rollback_backend_and_runtime_control true "$rollback_state" runtime-backup
[[ ! -e $rollback_state ]]
assert_no_rescue_refs
[[ $(ref_id other-project-rollback-rescue:keep) == "$ID_D" ]]
if grep -E $'^(stop-database|compose\t.*force-recreate|verify-backend)' \
  "$EVENT_LOG" >/dev/null; then
  echo 'outer rollback repeated a completed backend recreation' >&2
  exit 1
fi

# Backend and runtime rollback statuses aggregate. If backend rollback succeeds
# but runtime restoration fails, the terminal phase prevents a second outer
# attempt from recreating healthy containers again.
reset_case aggregation-retry
add_ref "$ID_A" "$ID_A"
add_container api aggregation-api "$ID_A"
aggregation_state=$(backend_image_rescue_state_file "$SHA")
backend_image_rescue_prepare "$SHA" "$aggregation_state" api
backend_image_rescue_mark_replacement_started "$aggregation_state"
restore_postgres_runtime_control() {
  printf 'restore-runtime\t%s\n' "$1" >> "$EVENT_LOG"
  [[ ${FAKE_RUNTIME_STATUS:-0} == 0 ]]
}
: > "$EVENT_LOG"
export FAKE_RUNTIME_STATUS=42
set +e
rollback_backend_and_runtime_control true "$aggregation_state" runtime-backup
first_aggregation_status=$?
set -e
((first_aggregation_status != 0))
[[ -e $aggregation_state ]]
[[ $(backend_image_rescue_read_phase "$aggregation_state") == rollback-complete ]]
[[ $(grep -c $'^compose\t.*force-recreate' "$EVENT_LOG") == 1 ]]
export FAKE_RUNTIME_STATUS=0
rollback_backend_and_runtime_control true "$aggregation_state" runtime-backup
[[ $(grep -c $'^compose\t.*force-recreate' "$EVENT_LOG") == 1 ]]
[[ ! -e $aggregation_state ]]
assert_no_rescue_refs
unset FAKE_RUNTIME_STATUS

# The same aggregation rule applies before replacement: a runtime-control
# restore failure retains a terminal tag-only rollback without ever touching
# the healthy container, and the later retry performs only runtime restoration.
reset_case prepared-aggregation-retry
add_ref "$ID_A" "$ID_A"
add_container api prepared-aggregation-api "$ID_A"
prepared_aggregation_state=$(backend_image_rescue_state_file "$SHA")
backend_image_rescue_prepare "$SHA" "$prepared_aggregation_state" api
set_ref_direct "$(compose_image_name api)" "$ID_E"
restore_postgres_runtime_control() {
  printf 'restore-runtime\t%s\n' "$1" >> "$EVENT_LOG"
  [[ ${FAKE_RUNTIME_STATUS:-0} == 0 ]]
}
: > "$EVENT_LOG"
export FAKE_RUNTIME_STATUS=42
set +e
rollback_backend_and_runtime_control \
  true "$prepared_aggregation_state" runtime-backup
prepared_aggregation_status=$?
set -e
((prepared_aggregation_status != 0))
[[ $(ref_id "$(compose_image_name api)") == "$ID_A" ]]
[[ $(backend_image_rescue_read_phase "$prepared_aggregation_state") == \
   rollback-complete ]]
if grep -E $'^(stop-database|compose\t.*force-recreate|verify-backend)' \
  "$EVENT_LOG" >/dev/null; then
  echo 'pre-replacement aggregation touched a healthy container' >&2
  exit 1
fi
export FAKE_RUNTIME_STATUS=0
rollback_backend_and_runtime_control \
  true "$prepared_aggregation_state" runtime-backup
[[ ! -e $prepared_aggregation_state ]]
assert_no_rescue_refs
unset FAKE_RUNTIME_STATUS

# Backend rollback failure never short-circuits runtime-control restoration;
# both failures are reported and rescue cleanup is deliberately skipped.
set +e
aggregation_output=$(
  rollback_backend_images() {
    printf 'forced-backend-rollback\n' >> "$EVENT_LOG"
    return 41
  }
  restore_postgres_runtime_control() {
    printf 'forced-runtime-rollback\n' >> "$EVENT_LOG"
    return 42
  }
  rollback_backend_and_runtime_control true unavailable-state runtime-backup 2>&1
)
aggregation_status=$?
set -e
((aggregation_status != 0))
grep -F 'backend image/container rollback failed (status=41)' \
  <<< "$aggregation_output" >/dev/null
grep -F 'PostgreSQL runtime-control rollback failed (status=42)' \
  <<< "$aggregation_output" >/dev/null
grep -F 'forced-backend-rollback' "$EVENT_LOG" >/dev/null
grep -F 'forced-runtime-rollback' "$EVENT_LOG" >/dev/null

# If a process died after committing backend.sha but before exact cleanup, the
# next deploy under the singleton lock reconciles that completed release.
reset_case reconcile-success
reconciled_state=$(prepare_reconcile_state "$SHA" prepared reconciled-api)
printf '%s\n' "$SHA" > "$STATE/backend.sha"
reconcile_completed_backend_image_rescues
[[ ! -e $reconciled_state ]]
assert_no_rescue_refs

# A completed different-release rescue whose replacement started is reconciled
# through the normal backend rollback path before its exact tags are removed.
reset_case reconcile-stale-replacement-started
stale_sha=2222222222222222222222222222222222222222
stale_state=$(prepare_reconcile_state \
  "$stale_sha" replacement-started stale-api)
set_ref_direct "$(compose_image_name api)" "$ID_E"
printf '%s\n' "$SHA" > "$STATE/backend.sha"
: > "$EVENT_LOG"
reconcile_completed_backend_image_rescues
[[ ! -e $stale_state ]]
[[ $(ref_id "$(compose_image_name api)") == "$ID_A" ]]
[[ $(grep -c '^stop-database' "$EVENT_LOG") == 1 ]]
[[ $(grep -c $'^compose\t.*force-recreate' "$EVENT_LOG") == 1 ]]
[[ $(grep -c '^verify-backend' "$EVENT_LOG") == 1 ]]
assert_no_rescue_refs

# Preparing a new release reconciles a stale different-release replacement
# through rollback plus cleanup before capturing the next snapshot.
reset_case prepare-reconciles-stale-replacement-started
next_sha=4444444444444444444444444444444444444444
stale_state=$(prepare_reconcile_state \
  "$stale_sha" replacement-started stale-prepare-api)
stale_tag=$(backend_image_rescue_tag "$stale_sha" api)
set_ref_direct "$(compose_image_name api)" "$ID_E"
printf '%s\n' "$SHA" > "$STATE/backend.sha"
: > "$EVENT_LOG"
next_state=$(backend_image_rescue_state_file "$next_sha")
backend_image_rescue_prepare "$next_sha" "$next_state" api
[[ ! -e $stale_state ]]
[[ -e $next_state ]]
[[ -z $(ref_id "$stale_tag") ]]
[[ $(ref_id "$(compose_image_name api)") == "$ID_A" ]]
[[ $(ref_id "$(backend_image_rescue_tag "$next_sha" api)") == "$ID_A" ]]
[[ $(grep -c '^stop-database' "$EVENT_LOG") == 1 ]]
[[ $(grep -c $'^compose\t.*force-recreate' "$EVENT_LOG") == 1 ]]
backend_image_rescue_cleanup "$next_state"
assert_no_rescue_refs

# A different-release rescue already marked rollback-complete is cleaned only
# after manifest and exact rescue-tag validation; no container rollback repeats.
reset_case reconcile-stale-rollback-complete
rollback_complete_state=$(prepare_reconcile_state \
  "$stale_sha" rollback-complete rollback-complete-api)
printf '%s\n' "$SHA" > "$STATE/backend.sha"
: > "$EVENT_LOG"
reconcile_completed_backend_image_rescues
[[ ! -e $rollback_complete_state ]]
if grep -E $'^(stop-database|compose\t.*force-recreate|verify-backend)' \
  "$EVENT_LOG" >/dev/null; then
  echo 'rollback-complete reconciliation repeated container rollback' >&2
  exit 1
fi
assert_no_rescue_refs

# Prepared different-release evidence fails closed and keeps blocking a new
# release because no replacement or rollback has durably completed.
reset_case reconcile-preserves-prepared
prepared_state=$(prepare_reconcile_state "$stale_sha" prepared prepared-api)
printf '%s\n' "$SHA" > "$STATE/backend.sha"
assert_fails reconcile_completed_backend_image_rescues
[[ -e $prepared_state ]]
[[ $(ref_id "$(backend_image_rescue_tag "$stale_sha" api)") == "$ID_A" ]]
assert_fails backend_image_rescue_prepare \
  "$SHA" "$(backend_image_rescue_state_file "$SHA")" api
[[ -e $prepared_state ]]

# Incomplete manifests and wrong rescue-tag identities fail closed and keep the
# on-disk evidence plus Docker tag available for operator inspection.
reset_case reconcile-rejects-incomplete
bad_sha=3333333333333333333333333333333333333333
bad_state=$(backend_image_rescue_state_file "$bad_sha")
bad_tag=$(backend_image_rescue_tag "$bad_sha" api)
add_ref "$bad_tag" "$ID_A"
umask 077
{
  printf '%s\n' "$BACKEND_IMAGE_RESCUE_VERSION"
  printf 'target\t%s\nproject\t%s\n' "$bad_sha" "$PROJECT"
  printf 'image\tapi\trecreate\trunning-image\tbad-api\t%s\t%s\n' \
    "$ID_A" "$bad_tag"
} > "$bad_state"
chmod 0600 "$bad_state"
assert_fails reconcile_completed_backend_image_rescues
[[ -e $bad_state ]]
[[ $(ref_id "$bad_tag") == "$ID_A" ]]
assert_fails backend_image_rescue_prepare \
  "$SHA" "$(backend_image_rescue_state_file "$SHA")" api
[[ -e $bad_state ]]

reset_case reconcile-rejects-wrong-tag
wrong_state=$(prepare_reconcile_state "$stale_sha" rollback-complete wrong-api)
wrong_tag=$(backend_image_rescue_tag "$stale_sha" api)
set_ref_direct "$wrong_tag" "$ID_B"
assert_fails reconcile_completed_backend_image_rescues
[[ -e $wrong_state ]]
[[ $(ref_id "$wrong_tag") == "$ID_B" ]]
assert_fails backend_image_rescue_prepare \
  "$SHA" "$(backend_image_rescue_state_file "$SHA")" api
[[ -e $wrong_state ]]
[[ $(ref_id "$wrong_tag") == "$ID_B" ]]

if grep -E $'docker\t(image\t)?(system\t)?prune' "$EVENT_LOG" >/dev/null; then
  echo 'backend rescue contract invoked a broad Docker prune' >&2
  exit 1
fi
if grep -E 'docker([[:space:]]+container)?[[:space:]]+commit' \
  "$LIBRARY" >/dev/null; then
  echo 'backend rescue library retained unsafe docker commit adoption' >&2
  exit 1
fi

echo 'Backend image rescue contract tests passed'
