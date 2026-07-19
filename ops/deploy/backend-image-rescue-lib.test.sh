#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
LIBRARY=$SCRIPT_DIR/backend-image-rescue-lib.sh
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/backend-image-rescue-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

PROJECT=fixture-project
FAKE_DOCKER_REFS=$FIXTURE/docker-refs.tsv
FAKE_DOCKER_CONTAINERS=$FIXTURE/docker-containers.tsv
FAKE_COMPOSE_CONTAINERS=$FIXTURE/compose-containers.tsv
EVENT_LOG=$FIXTURE/events.log
export FAKE_DOCKER_REFS FAKE_DOCKER_CONTAINERS EVENT_LOG

ID_A=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
ID_B=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
ID_C=sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
ID_D=sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
ID_E=sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
LEGACY_CONFIG='["docker-entrypoint.sh"]|["sh","-c","case \"$SERVICE\" in api) exec node dist/apps/api-gateway/src/main.js ;; agent-runtime) exec node dist/apps/agent-runtime/src/main.js ;; ingestion) exec node dist/apps/ingestion-worker/src/main.js ;; intelligence) exec node dist/apps/intelligence-worker/src/main.js ;; delivery) exec node dist/apps/delivery-service/src/main.js ;; event-relay) exec node dist/apps/event-relay/src/main.js ;; *) echo \"Unknown service: $SERVICE\" >&2; exit 64 ;; esac"]|"/app"|"node"|null'
CONFIG='["/entry"]|["node","dist/main.js"]|"/app"|"node"|null'
SAFE_API_CONFIG='["/usr/local/bin/docker-entrypoint.sh"]|["/usr/local/bin/node","dist/apps/api-gateway/src/main.js"]|"/app"|"node"|null'
SENTINEL_ENV='["RESCUE_SENTINEL_DO_NOT_PERSIST=fixture-only-value"]'
export SAFE_API_CONFIG
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
    IFS=$'\t' read -r _ image_id state config env <<< "$row"
    case ${*: -1} in
      *'.Image'*) printf '%s\n' "$image_id" ;;
      *'.State.Status'*) printf '%s\n' "$state" ;;
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
    set_ref "$rescue_tag" "$FAKE_DOCKER_IMPORT_ID" \
      "$SAFE_API_CONFIG" '[]'
    printf '%s\n' "$FAKE_DOCKER_IMPORT_ID"
    ;;
  *) exit 90 ;;
esac
SH
chmod 0755 "$FAKE_BIN/docker"
PATH=$FAKE_BIN:$PATH

compose_image_name() {
  printf '%s-%s:latest\n' "$PROJECT" "$1"
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
    local service=${*: -1}
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
  : > "$FAKE_COMPOSE_CONTAINERS"
  : > "$EVENT_LOG"
  FAKE_DOCKER_IMPORT_ID=$ID_E
  export FAKE_DOCKER_IMPORT_ID
  unset FAKE_DOCKER_SIGNAL_TAG FAKE_COMPOSE_UP_STATUS FAKE_STOP_STATUS \
    FAKE_VERIFY_STATUS FAKE_PROXY_STATUS FAKE_IMPORT_STATUS
}

add_ref() {
  printf '%s\t%s\t%s\t%s\n' "$1" "$2" "${3:-$CONFIG}" "${4:-null}" \
    >> "$FAKE_DOCKER_REFS"
}

add_container() {
  printf '%s\t%s\t%s\t%s\t%s\n' "$2" "$3" \
    "${4:-running|true|false|false|none}" "${5:-$CONFIG}" "${6:-[]}" \
    >> "$FAKE_DOCKER_CONTAINERS"
  printf '%s\t%s\n' "$1" "$2" >> "$FAKE_COMPOSE_CONTAINERS"
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

# The separate x-collector image has no reviewed reconstruction in this bridge.
# Its explicit missing-image edge fails closed without pausing or exporting it.
reset_case unsupported-missing-image
add_container x-collector missing-x "$ID_A" 'running|true|false|false|healthy' \
  '[]|[]|"/srv"|"collector"' "$SENTINEL_ENV"
unsupported_state=$(backend_image_rescue_state_file "$SHA")
set +e
backend_image_rescue_prepare "$SHA" "$unsupported_state" x-collector
unsupported_status=$?
set -e
((unsupported_status != 0))
[[ ! -e $unsupported_state && ! -e $unsupported_state.partial ]]
if grep -E $'docker\tcontainer\t(pause|export)\tmissing-x' "$EVENT_LOG" >/dev/null; then
  echo 'unsupported missing image was touched before fail-closed validation' >&2
  exit 1
fi
assert_no_rescue_refs

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
add_ref "$ID_A" "$ID_A"
add_container api reconciled-api "$ID_A"
reconciled_state=$(backend_image_rescue_state_file "$SHA")
backend_image_rescue_prepare "$SHA" "$reconciled_state" api
printf '%s\n' "$SHA" > "$STATE/backend.sha"
reconcile_completed_backend_image_rescues
[[ ! -e $reconciled_state ]]
assert_no_rescue_refs

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
