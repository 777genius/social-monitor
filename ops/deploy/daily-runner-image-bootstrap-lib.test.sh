#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
LIBRARY=$SCRIPT_DIR/daily-runner-image-bootstrap-lib.sh
FIXTURE=$(mktemp -d "/tmp/daily-runner-bootstrap-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

REPO=$FIXTURE/repo
CONTROL=$FIXTURE/control
STATE=$CONTROL/deploy-state
POSTGRES_RUNTIME_RELEASES=$CONTROL/postgres-runtime-releases
POSTGRES_RUNTIME_CURRENT=$CONTROL/postgres-runtime-current
POSTGRES_ADMISSION_LOCK=$CONTROL/daily-run.lock
DAILY_SINGLETON_LOCK=$CONTROL/daily-run-singleton.lock
PROJECT=social-monitor-prod
TMP_ROOT=$FIXTURE/tmp
REFS=$FIXTURE/docker-refs.tsv
CONTAINERS=$FIXTURE/docker-containers.tsv
EVENTS=$FIXTURE/events.log
BASE_ID=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
MUTATED_ID=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
CANDIDATE_ID=sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
EXISTING_ID=sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
CONTAINER_ID_A=1111111111111111111111111111111111111111111111111111111111111111
CONTAINER_ID_B=2222222222222222222222222222222222222222222222222222222222222222

export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
export SOCIAL_MONITOR_DAILY_RUNNER_BOOTSTRAP_TMP_ROOT=$TMP_ROOT
install -d "$REPO" "$CONTROL" "$STATE" "$POSTGRES_RUNTIME_RELEASES" "$TMP_ROOT"
: > "$REFS"
: > "$CONTAINERS"
: > "$EVENTS"

write_reviewed_dockerfile() {
  cat > "$CONTROL/daily-runner.Dockerfile" <<'DOCKERFILE'
FROM social-monitor-prod-intelligence-worker:latest

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends sqlite3 \
  && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node scripts /app/scripts
COPY --chown=node:node ops /app/ops
COPY --chown=node:node test /app/test
COPY --chown=node:node docs /app/docs
USER node
DOCKERFILE
  chmod 0644 "$CONTROL/daily-runner.Dockerfile"
}
write_reviewed_dockerfile

git -C "$REPO" init -q -b main
git -C "$REPO" config user.name 'Daily runner bootstrap fixture'
git -C "$REPO" config user.email daily-runner-bootstrap@example.invalid
printf 'historical\n' > "$REPO/release-content.txt"
printf '.git\n' > "$REPO/.dockerignore"
git -C "$REPO" add .
git -C "$REPO" commit -qm 'test: historical backend'
PREVIOUS_SHA=$(git -C "$REPO" rev-parse HEAD)
printf 'target\n' > "$REPO/release-content.txt"
printf 'must-not-enter-context\n' > "$REPO/target-only.txt"
git -C "$REPO" add .
git -C "$REPO" commit -qm 'test: target backend'
TARGET_SHA=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" update-ref refs/remotes/origin/main "$TARGET_SHA"

fail() {
  printf 'fixture-failure: %s\n' "$*" >&2
  exit 1
}

compose_image_name() {
  printf '%s-%s:latest\n' "$PROJECT" "$1"
}

backend_image_rescue_state_file() {
  printf '%s/backend-image-rescue-%s.tsv\n' "$STATE" "$1"
}

backend_image_rescue_manifest_target() {
  return 1
}

backend_image_rescue_read_phase() {
  return 1
}

lookup_id() {
  awk -F '\t' -v ref="$1" '$1 == ref {print $2; exit}' "$REFS"
}

lookup_revision() {
  awk -F '\t' -v ref="$1" '$1 == ref {print $3; exit}' "$REFS"
}

set_ref() {
  local ref=$1
  local image_id=$2
  local revision=$3
  local next=$REFS.next
  awk -F '\t' -v ref="$ref" '$1 != ref' "$REFS" > "$next"
  printf '%s\t%s\t%s\n' "$ref" "$image_id" "$revision" >> "$next"
  mv -f "$next" "$REFS"
}

remove_ref() {
  local ref=$1
  local next=$REFS.next
  awk -F '\t' -v ref="$ref" '$1 != ref' "$REFS" > "$next"
  mv -f "$next" "$REFS"
}

add_container() {
  printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >> "$CONTAINERS"
}

backend_image_rescue_image_id() {
  local image_id
  printf 'inspect-id\t%s\n' "$1" >> "$EVENTS"
  image_id=$(lookup_id "$1")
  [[ -n $image_id ]] || return 1
  printf '%s\n' "$image_id"
}

backend_image_rescue_image_config() {
  local image=$1

  printf 'config-id\t%s\n' "$image" >> "$EVENTS"
  case $image in
    "$BASE_ID")
      printf '%s\n' "$BASE_CONFIG"
      ;;
    "$MUTATED_ID")
      printf '%s\n' "$MUTATED_BASE_CONFIG"
      ;;
    "$BASE_TAG")
      printf '%s\n' "$BASE_TAG_CONFIG"
      ;;
    *)
      [[ -n $(lookup_id "$image") ]] || return 1
      printf '%s\n' "$BUILT_CONFIG"
      ;;
  esac
}

fake_compose() {
  printf 'compose\t%s\n' "$*" >> "$EVENTS"
  return 97
}
COMPOSE=(fake_compose)

assert_compose_sentinel_fails_fast() {
  local status

  set +e
  "${COMPOSE[@]}" sentinel-check
  status=$?
  set -e
  ((status == 97)) || fail 'fake Compose sentinel did not fail fast'
  [[ $(<"$EVENTS") == $'compose\tsentinel-check' ]] || \
    fail 'fake Compose sentinel did not record the expected event'
  : > "$EVENTS"
}

docker() {
  local source destination image_id revision
  local tag='' label='' context='' argument=''
  printf 'docker\t%s\n' "$*" >> "$EVENTS"
  case ${1:-}:${2:-} in
    container:ls)
      local daily_format=$'{{.ID}}\t{{.State}}\t{{.Label "com.docker.compose.project"}}\t{{.Label "com.docker.compose.service"}}'
      local format='' project_filter='' service_filter='' no_trunc=false
      shift 2
      while (($# > 0)); do
        argument=$1
        shift
        case $argument in
          --no-trunc)
            no_trunc=true
            ;;
          --filter)
            case ${1:-} in
              label=com.docker.compose.project=*)
                project_filter=${1#label=com.docker.compose.project=}
                ;;
              label=com.docker.compose.service=*)
                service_filter=${1#label=com.docker.compose.service=}
                ;;
              *) return 91 ;;
            esac
            shift
            ;;
          --format)
            format=${1:-}
            shift
            ;;
          *) return 92 ;;
        esac
      done
      [[ $no_trunc == true && $project_filter == "$PROJECT" ]] || \
        return 93
      case $service_filter in
        daily-runner)
          [[ $format == "$daily_format" ]] || return 94
          [[ $CONTAINER_LS_STATUS == 0 ]] || return "$CONTAINER_LS_STATUS"
          if [[ $CONTAINER_FORCE_LABEL_MISMATCH == true ]]; then
            printf '%s\t%s\t%s\t%s\n' \
              "$CONTAINER_ID_A" running wrong-project daily-runner
            return 0
          fi
          awk -F '\t' -v project="$project_filter" -v service="$service_filter" \
            '$3 == project && $4 == service {printf "%s\t%s\t%s\t%s\n", $1, $2, $3, $4}' \
            "$CONTAINERS"
          ;;
        intelligence-worker|api)
          [[ $format == '{{.ID}}' ]] || return 95
          [[ $LEGACY_RUNTIME_LS_STATUS == 0 ]] || \
            return "$LEGACY_RUNTIME_LS_STATUS"
          printf '%s\n' "$LEGACY_RUNTIME_IDS"
          ;;
        *) return 96 ;;
      esac
      ;;
    inspect:*)
      local legacy_format='{{.Id}}|{{.Image}}|{{.State.Status}}|{{.State.Running}}|{{.State.Paused}}|{{.State.Restarting}}|{{.State.Dead}}|{{.State.OOMKilled}}|{{.State.Error}}|{{.RestartCount}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{index .Config.Labels "com.docker.compose.image"}}|{{index .Config.Labels "com.docker.compose.oneoff"}}|{{index .Config.Labels "com.docker.compose.container-number"}}'
      [[ ${3:-} == --format && ${4:-} == "$legacy_format" ]] || return 97
      [[ $LEGACY_RUNTIME_INSPECT_STATUS == 0 ]] || \
        return "$LEGACY_RUNTIME_INSPECT_STATUS"
      if [[ -n $LEGACY_RUNTIME_RECORD_OVERRIDE ]]; then
        printf '%s\n' "$LEGACY_RUNTIME_RECORD_OVERRIDE"
        return 0
      fi
      printf '%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s\n' \
        "$LEGACY_RUNTIME_INSPECT_ID" "$LEGACY_RUNTIME_IMAGE_ID" \
        "$LEGACY_RUNTIME_STATE_STATUS" "$LEGACY_RUNTIME_RUNNING" \
        "$LEGACY_RUNTIME_PAUSED" "$LEGACY_RUNTIME_RESTARTING" \
        "$LEGACY_RUNTIME_DEAD" "$LEGACY_RUNTIME_OOM_KILLED" \
        "$LEGACY_RUNTIME_ERROR" "$LEGACY_RUNTIME_RESTART_COUNT" \
        "$LEGACY_RUNTIME_PROJECT" "$LEGACY_RUNTIME_SERVICE" \
        "$LEGACY_RUNTIME_COMPOSE_IMAGE" "$LEGACY_RUNTIME_ONEOFF" \
        "$LEGACY_RUNTIME_CONTAINER_NUMBER"
      ;;
    build:*)
      [[ -n $(lookup_id "$BASE_TAG") ]] || return 72
      shift
      while (($# > 0)); do
        argument=$1
        shift
        case $argument in
          --pull=false) ;;
          --file)
            [[ ${1:-} == "$CONTROL/daily-runner.Dockerfile" ]]
            shift
            ;;
          --label)
            label=${1:-}
            shift
            ;;
          --tag)
            tag=${1:-}
            shift
            ;;
          *) context=$argument ;;
        esac
      done
      [[ $label == "org.opencontainers.image.revision=$PREVIOUS_SHA" ]]
      [[ -f $context/release-content.txt ]]
      [[ $(<"$context/release-content.txt") == historical ]]
      [[ ! -e $context/target-only.txt && ! -L $context/target-only.txt ]]
      [[ $context != "$REPO" && $context == "$TMP_ROOT/"* ]]
      [[ $BUILD_FAILURE == false ]] || return 71
      revision=${BUILT_REVISION_OVERRIDE:-$PREVIOUS_SHA}
      set_ref "$tag" "$BUILT_IMAGE_ID" "$revision"
      if [[ $MUTATE_BASE_ID_AFTER_BUILD == true ]]; then
        set_ref "$BASE_TAG" "$MUTATED_ID" "$PREVIOUS_SHA"
      fi
      if [[ $MUTATE_BASE_REVISION_AFTER_BUILD == true ]]; then
        set_ref "$BASE_TAG" "$BASE_ID" "$TARGET_SHA"
      fi
      if [[ $MUTATE_DOCKERFILE_AFTER_BUILD == true ]]; then
        printf '# raced\n' >> "$CONTROL/daily-runner.Dockerfile"
      fi
      ;;
    image:inspect)
      image_id=$(lookup_id "$3")
      revision=$(lookup_revision "$3")
      [[ -n $image_id ]] || return 1
      case ${5:-} in
        '{{.Id}}')
          printf '%s\n' "$image_id"
          ;;
        '{{.Id}}|{{with index .Config.Labels "org.opencontainers.image.revision"}}{{.}}{{end}}')
          [[ $3 == "$BASE_TAG" || $3 == "$FALLBACK_BASE_TAG" ]] || return 98
          printf '%s|%s\n' "$image_id" "$revision"
          ;;
        '{{.Id}}|{{index .Config.Labels "org.opencontainers.image.revision"}}')
          printf '%s|%s\n' "$image_id" "$revision"
          ;;
        *) return 99 ;;
      esac
      ;;
    image:tag)
      source=$3
      destination=$4
      image_id=$(lookup_id "$source")
      revision=$(lookup_revision "$source")
      if [[ -z $image_id && $source == "$BASE_ID" ]]; then
        image_id=$BASE_ID
        revision=$(awk -F '\t' -v image_id="$BASE_ID" \
          '$2 == image_id { print $3; exit }' "$REFS")
      fi
      [[ -n $image_id ]] || return 1
      set_ref "$destination" "$image_id" "$revision"
      if [[ $SIGNAL_AFTER_INSTALL == true ]]; then
        kill -TERM "$BASHPID"
      fi
      ;;
    image:rm)
      [[ -n $(lookup_id "$3") ]] || return 1
      remove_ref "$3"
      ;;
    *) return 90 ;;
  esac
}

# shellcheck source=ops/deploy/daily-runner-image-bootstrap-lib.sh
source "$LIBRARY"
assert_compose_sentinel_fails_fast
EXPECTED_CONFIG=$DAILY_RUNNER_BOOTSTRAP_IMAGE_CONFIG
BASE_TAG=$(compose_image_name intelligence-worker)
FALLBACK_BASE_TAG=$(compose_image_name api)
COMPOSE_TAG=$(compose_image_name daily-runner)

reset_runtime() {
  local release=$POSTGRES_RUNTIME_RELEASES/release

  rm -rf "$release"
  install -d "$release"
  printf '%s\n' "$PREVIOUS_SHA" > "$release/READY"
  rm -f "$POSTGRES_RUNTIME_CURRENT"
  ln -s "$release" "$POSTGRES_RUNTIME_CURRENT"
  printf '%s\n' "$PREVIOUS_SHA" > "$STATE/backend.sha"
  rm -f "$STATE"/backend-image-rescue-*
}

reset_case() {
  git -C "$REPO" reset --hard -q "$TARGET_SHA"
  git -C "$REPO" clean -fdq
  git -C "$REPO" update-ref refs/remotes/origin/main "$TARGET_SHA"
  reset_runtime "$PREVIOUS_SHA"
  write_reviewed_dockerfile
  : > "$REFS"
  : > "$EVENTS"
  set_ref "$BASE_TAG" "$BASE_ID" "$PREVIOUS_SHA"
  BASE_CONFIG=$EXPECTED_CONFIG
  BASE_TAG_CONFIG='["must-not-use"]|["config"]|"/app"|"node"|null'
  MUTATED_BASE_CONFIG=$EXPECTED_CONFIG
  BUILT_CONFIG=$EXPECTED_CONFIG
  BUILT_IMAGE_ID=$CANDIDATE_ID
  BUILT_REVISION_OVERRIDE=
  : > "$CONTAINERS"
  CONTAINER_LS_STATUS=0
  CONTAINER_FORCE_LABEL_MISMATCH=false
  BUILD_FAILURE=false
  MUTATE_BASE_ID_AFTER_BUILD=false
  MUTATE_BASE_REVISION_AFTER_BUILD=false
  MUTATE_DOCKERFILE_AFTER_BUILD=false
  SIGNAL_AFTER_INSTALL=false
  LEGACY_RUNTIME_LS_STATUS=0
  LEGACY_RUNTIME_IDS=
  LEGACY_RUNTIME_INSPECT_STATUS=0
  LEGACY_RUNTIME_RECORD_OVERRIDE=
  LEGACY_RUNTIME_INSPECT_ID=$CONTAINER_ID_A
  LEGACY_RUNTIME_IMAGE_ID=$BASE_ID
  LEGACY_RUNTIME_STATE_STATUS=running
  LEGACY_RUNTIME_RUNNING=true
  LEGACY_RUNTIME_PAUSED=false
  LEGACY_RUNTIME_RESTARTING=false
  LEGACY_RUNTIME_DEAD=false
  LEGACY_RUNTIME_OOM_KILLED=false
  LEGACY_RUNTIME_ERROR=
  LEGACY_RUNTIME_RESTART_COUNT=0
  LEGACY_RUNTIME_PROJECT=$PROJECT
  LEGACY_RUNTIME_SERVICE=intelligence-worker
  LEGACY_RUNTIME_COMPOSE_IMAGE=$BASE_ID
  LEGACY_RUNTIME_ONEOFF=False
  LEGACY_RUNTIME_CONTAINER_NUMBER=1
}

configure_legacy_runtime_stable() {
  LEGACY_RUNTIME_IDS=$CONTAINER_ID_A
  LEGACY_RUNTIME_INSPECT_ID=$CONTAINER_ID_A
  LEGACY_RUNTIME_IMAGE_ID=$BASE_ID
  LEGACY_RUNTIME_STATE_STATUS=running
  LEGACY_RUNTIME_RUNNING=true
  LEGACY_RUNTIME_PAUSED=false
  LEGACY_RUNTIME_RESTARTING=false
  LEGACY_RUNTIME_DEAD=false
  LEGACY_RUNTIME_OOM_KILLED=false
  LEGACY_RUNTIME_ERROR=
  LEGACY_RUNTIME_RESTART_COUNT=0
  LEGACY_RUNTIME_PROJECT=$PROJECT
  LEGACY_RUNTIME_SERVICE=intelligence-worker
  LEGACY_RUNTIME_COMPOSE_IMAGE=$BASE_ID
  LEGACY_RUNTIME_ONEOFF=False
  LEGACY_RUNTIME_CONTAINER_NUMBER=1
}

configure_unlabelled_base() {
  set_ref "$BASE_TAG" "$BASE_ID" ''
  configure_legacy_runtime_stable
}

assert_fails_with() {
  local expected=$1
  shift
  local output status

  set +e
  output=$("$@" 2>&1)
  status=$?
  set -e
  ((status != 0)) || {
    printf 'fixture unexpectedly succeeded: %s\n' "$expected" >&2
    exit 1
  }
  grep -F "$expected" <<< "$output" >/dev/null || {
    printf 'fixture failure missing %q: %q\n' "$expected" "$output" >&2
    exit 1
  }
}

assert_no_temporary_state() {
  if find "$TMP_ROOT" -mindepth 1 -print -quit | grep -q .; then
    echo 'daily-runner bootstrap context was not cleaned' >&2
    exit 1
  fi
  if awk -F '\t' \
    '$1 ~ /daily-runner-bootstrap:/ {found=1} END {exit !found}' "$REFS"; then
    echo 'daily-runner bootstrap tag was not cleaned' >&2
    exit 1
  fi
}

assert_events_exclude() {
  local unexpected=$1
  local status=0

  grep -F -- "$unexpected" "$EVENTS" >/dev/null || status=$?
  if ((status == 0)); then
    printf 'unexpected event was recorded: %q\n' "$unexpected" >&2
    exit 1
  fi
  if ((status != 1)); then
    printf 'fixture events could not be inspected for: %q\n' "$unexpected" >&2
    exit 1
  fi
}

exec 8>"$POSTGRES_ADMISSION_LOCK"
flock 8

# Existing images take one inspect and consult no mutable release input.
reset_case
set_ref "$COMPOSE_TAG" "$EXISTING_ID" "$PREVIOUS_SHA"
printf 'dirty\n' > "$REPO/untracked"
flock -u 8
daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
[[ $(lookup_id "$COMPOSE_TAG") == "$EXISTING_ID" ]]
[[ $(<"$EVENTS") == $'inspect-id\tsocial-monitor-prod-daily-runner:latest' ]]
git -C "$REPO" clean -fdq
flock 8

# Durable runtime identity and trusted ancestry bind the historical source.
reset_case
printf '%s\n' "$TARGET_SHA" > \
  "$(readlink -f "$POSTGRES_RUNTIME_CURRENT")/READY"
assert_fails_with 'backend marker and PostgreSQL runtime READY do not match' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
assert_events_exclude $'docker\tbuild'

reset_case
printf 'dirty\n' > "$REPO/untracked"
assert_fails_with 'integration worktree is dirty' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
git -C "$REPO" clean -fdq

reset_case
git -C "$REPO" checkout -q --detach "$PREVIOUS_SHA"
printf 'side\n' > "$REPO/side.txt"
git -C "$REPO" add side.txt
git -C "$REPO" commit -qm 'test: untrusted side'
SIDE_SHA=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" checkout -q --detach "$TARGET_SHA"
printf '%s\n' "$SIDE_SHA" > "$STATE/backend.sha"
printf '%s\n' "$SIDE_SHA" > \
  "$(readlink -f "$POSTGRES_RUNTIME_CURRENT")/READY"
assert_fails_with 'not an ancestor of the deployment target' \
  daily_runner_image_bootstrap_before_rescue "$SIDE_SHA" "$TARGET_SHA"

reset_case
git -C "$REPO" checkout -q --detach "$TARGET_SHA"
printf 'untrusted target\n' > "$REPO/untrusted-target.txt"
git -C "$REPO" add untrusted-target.txt
git -C "$REPO" commit -qm 'test: untrusted target'
UNTRUSTED_TARGET_SHA=$(git -C "$REPO" rev-parse HEAD)
assert_fails_with 'deployment target is not trusted by origin/main' \
  daily_runner_image_bootstrap_before_rescue \
    "$PREVIOUS_SHA" "$UNTRUSTED_TARGET_SHA"

# Admission ownership, daily activity, and partial rescue state fail closed.
reset_case
flock -u 8
assert_fails_with 'requires the held PostgreSQL admission lock' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
flock 8

reset_case
exec 9>"$DAILY_SINGLETON_LOCK"
flock 9
assert_fails_with 'active daily execution blocks' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
flock -u 9
exec 9>&-

reset_case
add_container "$CONTAINER_ID_A" running other-project daily-runner
add_container "$CONTAINER_ID_B" running "$PROJECT" api
daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
[[ $(lookup_id "$COMPOSE_TAG") == "$CANDIDATE_ID" ]]
assert_events_exclude $'compose\t'

reset_case
add_container "$CONTAINER_ID_A" running "$PROJECT" daily-runner
assert_fails_with 'active daily-runner container blocks' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
assert_events_exclude $'docker\tbuild'
assert_events_exclude $'compose\t'

reset_case
add_container "$CONTAINER_ID_A" running "$PROJECT" daily-runner
add_container "$CONTAINER_ID_B" running "$PROJECT" daily-runner
assert_fails_with 'daily-runner container inventory is ambiguous' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
assert_events_exclude $'docker\tbuild'
assert_events_exclude $'compose\t'

reset_case
add_container "$CONTAINER_ID_A" exited "$PROJECT" daily-runner
assert_fails_with 'daily-runner container state is unexpected' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
assert_events_exclude $'docker\tbuild'
assert_events_exclude $'compose\t'

reset_case
CONTAINER_FORCE_LABEL_MISMATCH=true
assert_fails_with 'daily-runner container inventory label mismatch' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
assert_events_exclude $'docker\tbuild'
assert_events_exclude $'compose\t'

reset_case
CONTAINER_LS_STATUS=72
assert_fails_with 'daily-runner container state cannot be inventoried' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
assert_events_exclude $'docker\tbuild'
assert_events_exclude $'compose\t'

reset_case
partial=$(backend_image_rescue_state_file "$TARGET_SHA").partial
: > "$partial"
assert_fails_with 'partial backend rescue state blocks' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
assert_events_exclude $'docker\tbuild'

# The root control Dockerfile is bound to one reviewed byte digest.
reset_case
printf '# mutation\n' >> "$CONTROL/daily-runner.Dockerfile"
assert_fails_with 'Dockerfile differs from reviewed immutable bytes' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
assert_no_temporary_state

reset_case
mv "$CONTROL/daily-runner.Dockerfile" "$FIXTURE/reviewed.Dockerfile"
ln -s "$FIXTURE/reviewed.Dockerfile" "$CONTROL/daily-runner.Dockerfile"
assert_fails_with 'Dockerfile is not a regular non-symlink file' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
rm -f "$CONTROL/daily-runner.Dockerfile"
mv "$FIXTURE/reviewed.Dockerfile" "$CONTROL/daily-runner.Dockerfile"

# The mutable base must resolve to the previous release and reviewed config.
reset_case
set_ref "$BASE_TAG" "$BASE_ID" "$TARGET_SHA"
assert_fails_with 'base image identity or revision is unexpected' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
assert_events_exclude $'docker\tbuild'

reset_case
BASE_CONFIG='["wrong"]|["config"]|"/app"|"node"|null'
assert_fails_with 'base image config is unexpected' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
assert_events_exclude $'docker\tbuild'

# A labelled base accepts only the prior release and never consults legacy
# runtime state. The exact `with` template renders an absent label as empty;
# a literal Docker `<no value>` and any other non-empty revision cannot fall
# back to the runtime-stability exception.
reset_case
[[ $(daily_runner_bootstrap_base_image_id "$PREVIOUS_SHA") == "$BASE_ID" ]]
assert_events_exclude $'docker\tcontainer ls'
assert_events_exclude $'docker\tinspect'
assert_events_exclude $'config-id\tsocial-monitor-prod-intelligence-worker:latest'

# A missing intelligence-worker tag falls back to the same reviewed runtime
# image contract under the always-on API service. This is the production
# recovery path when an interrupted backend replacement removed only the
# preferred mutable tag.
reset_case
remove_ref "$BASE_TAG"
set_ref "$FALLBACK_BASE_TAG" "$BASE_ID" "$PREVIOUS_SHA"
[[ $(daily_runner_bootstrap_base_image_id "$PREVIOUS_SHA") == "$BASE_ID" ]]
grep -F $'docker\timage inspect social-monitor-prod-intelligence-worker:latest' \
  "$EVENTS" >/dev/null
grep -F $'docker\timage inspect social-monitor-prod-api:latest' \
  "$EVENTS" >/dev/null
assert_events_exclude $'config-id\tsocial-monitor-prod-api:latest'

reset_case
remove_ref "$BASE_TAG"
set_ref "$FALLBACK_BASE_TAG" "$BASE_ID" ''
configure_legacy_runtime_stable
LEGACY_RUNTIME_SERVICE=api
daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
[[ $(lookup_id "$COMPOSE_TAG") == "$CANDIDATE_ID" ]]
[[ -z $(lookup_id "$BASE_TAG") ]]
[[ $(lookup_id "$FALLBACK_BASE_TAG") == "$BASE_ID" ]]
[[ $(grep -c $'^docker\timage tag' "$EVENTS") == 2 ]]
assert_no_temporary_state

reset_case
remove_ref "$BASE_TAG"
set_ref "$FALLBACK_BASE_TAG" "$BASE_ID" "$PREVIOUS_SHA"
BUILD_FAILURE=true
assert_fails_with 'historical daily-runner image build failed' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
[[ -z $(lookup_id "$BASE_TAG") ]]
[[ $(lookup_id "$FALLBACK_BASE_TAG") == "$BASE_ID" ]]
assert_no_temporary_state

reset_case
set_ref "$BASE_TAG" "$BASE_ID" '<no value>'
configure_legacy_runtime_stable
assert_fails_with 'base image identity or revision is unexpected' \
  daily_runner_bootstrap_base_image_id "$PREVIOUS_SHA"
assert_events_exclude $'docker\tcontainer ls'

reset_case
set_ref "$BASE_TAG" "$BASE_ID" "$TARGET_SHA"
configure_legacy_runtime_stable
assert_fails_with 'base image identity or revision is unexpected' \
  daily_runner_bootstrap_base_image_id "$PREVIOUS_SHA"
assert_events_exclude $'docker\tcontainer ls'

# A truly unlabelled base has one narrow compatibility proof. It must resolve
# through one full container ID and an exact, healthy-enough Compose runtime;
# Docker health status is deliberately not part of the legacy contract.
reset_case
configure_unlabelled_base
[[ $(daily_runner_bootstrap_base_image_id "$PREVIOUS_SHA") == "$BASE_ID" ]]
[[ $(grep -cF -- $'config-id\t'"$BASE_ID" "$EVENTS") == 1 ]]
assert_events_exclude $'config-id\tsocial-monitor-prod-intelligence-worker:latest'
assert_events_exclude 'State.Health'

for legacy_failure in list zero multiple malformed-id inspect malformed-record \
  image-mismatch inspected-id-mismatch; do
  reset_case
  configure_unlabelled_base
  case $legacy_failure in
    list)
      LEGACY_RUNTIME_LS_STATUS=72
      ;;
    zero)
      LEGACY_RUNTIME_IDS=
      ;;
    multiple)
      LEGACY_RUNTIME_IDS=$CONTAINER_ID_A$'\n'$CONTAINER_ID_B
      ;;
    malformed-id)
      LEGACY_RUNTIME_IDS=not-a-full-container-id
      ;;
    inspect)
      LEGACY_RUNTIME_INSPECT_STATUS=71
      ;;
    malformed-record)
      LEGACY_RUNTIME_RECORD_OVERRIDE=not-a-runtime-record
      ;;
    image-mismatch)
      LEGACY_RUNTIME_IMAGE_ID=$MUTATED_ID
      ;;
    inspected-id-mismatch)
      LEGACY_RUNTIME_INSPECT_ID=$CONTAINER_ID_B
      ;;
  esac
  assert_fails_with 'unlabelled base image is not runtime-stable' \
    daily_runner_bootstrap_base_image_id "$PREVIOUS_SHA"
  assert_events_exclude $'config-id\t'
done

for legacy_label in project service compose-image oneoff container-number; do
  for legacy_label_value in mismatch missing; do
    reset_case
    configure_unlabelled_base
    case $legacy_label:$legacy_label_value in
      project:mismatch) LEGACY_RUNTIME_PROJECT=wrong-project ;;
      project:missing) LEGACY_RUNTIME_PROJECT='<no value>' ;;
      service:mismatch) LEGACY_RUNTIME_SERVICE=wrong-service ;;
      service:missing) LEGACY_RUNTIME_SERVICE='<no value>' ;;
      compose-image:mismatch) LEGACY_RUNTIME_COMPOSE_IMAGE=$MUTATED_ID ;;
      compose-image:missing) LEGACY_RUNTIME_COMPOSE_IMAGE='<no value>' ;;
      oneoff:mismatch) LEGACY_RUNTIME_ONEOFF=True ;;
      oneoff:missing) LEGACY_RUNTIME_ONEOFF='<no value>' ;;
      container-number:mismatch) LEGACY_RUNTIME_CONTAINER_NUMBER=2 ;;
      container-number:missing) LEGACY_RUNTIME_CONTAINER_NUMBER='<no value>' ;;
    esac
    assert_fails_with 'unlabelled base image is not runtime-stable' \
      daily_runner_bootstrap_base_image_id "$PREVIOUS_SHA"
    assert_events_exclude $'config-id\t'
  done
done

for legacy_state in status running paused restarting dead oom-killed error \
  restart-count; do
  reset_case
  configure_unlabelled_base
  case $legacy_state in
    status) LEGACY_RUNTIME_STATE_STATUS=exited ;;
    running) LEGACY_RUNTIME_RUNNING=false ;;
    paused) LEGACY_RUNTIME_PAUSED=true ;;
    restarting) LEGACY_RUNTIME_RESTARTING=true ;;
    dead) LEGACY_RUNTIME_DEAD=true ;;
    oom-killed) LEGACY_RUNTIME_OOM_KILLED=true ;;
    error) LEGACY_RUNTIME_ERROR=daemon-error ;;
    restart-count) LEGACY_RUNTIME_RESTART_COUNT=1 ;;
  esac
  assert_fails_with 'unlabelled base image is not runtime-stable' \
    daily_runner_bootstrap_base_image_id "$PREVIOUS_SHA"
  assert_events_exclude $'config-id\t'
done

# Configuration must be inspected by the immutable ID before and after the
# historical build, never through the mutable Compose tag.
reset_case
configure_unlabelled_base
daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
[[ $(lookup_id "$COMPOSE_TAG") == "$CANDIDATE_ID" ]]
[[ $(grep -cF -- $'config-id\t'"$BASE_ID" "$EVENTS") == 2 ]]
assert_events_exclude $'config-id\tsocial-monitor-prod-intelligence-worker:latest'

# Archive traversal and symlink entries never reach Docker.
# Invoked through the daily_runner_bootstrap_create_archive override below.
# shellcheck disable=SC2317
create_malicious_archive() {
  local kind=$1
  local archive=$2
  MALICIOUS_ARCHIVE_KIND=$kind python3 - "$archive" <<'PY'
import io
import os
import sys
import tarfile

with tarfile.open(sys.argv[1], "w:") as archive:
    if os.environ["MALICIOUS_ARCHIVE_KIND"] == "path":
        entry = tarfile.TarInfo("../escape")
        payload = b"escape\n"
        entry.size = len(payload)
        archive.addfile(entry, io.BytesIO(payload))
    else:
        entry = tarfile.TarInfo("escape-link")
        entry.type = tarfile.SYMTYPE
        entry.linkname = "/tmp"
        archive.addfile(entry)
PY
}

for malicious_kind in path symlink; do
  reset_case
  # Called indirectly through the production bootstrap function.
  # shellcheck disable=SC2329
  daily_runner_bootstrap_create_archive() {
    # shellcheck disable=SC2317
    create_malicious_archive "$malicious_kind" "$2"
  }
  assert_fails_with 'historical archive contains an unsafe entry' \
    daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
  [[ ! -e $FIXTURE/escape && ! -L $FIXTURE/escape ]]
  assert_events_exclude $'docker\tbuild'
  assert_no_temporary_state
done
daily_runner_bootstrap_create_archive() {
  git -C "$REPO" archive --format=tar --output="$2" "$1"
}

# Build, image identity, config, and every post-build mutation clean exactly
# this task's temporary tag and private context.
reset_case
BUILD_FAILURE=true
assert_fails_with 'historical daily-runner image build failed' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
[[ -z $(lookup_id "$COMPOSE_TAG") ]]
assert_no_temporary_state

reset_case
BUILT_CONFIG='["unexpected"]|["config"]|"/app"|"node"|null'
assert_fails_with 'historical daily-runner image config is unexpected' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
[[ -z $(lookup_id "$COMPOSE_TAG") ]]
assert_no_temporary_state

reset_case
BUILT_REVISION_OVERRIDE=$TARGET_SHA
assert_fails_with 'historical daily-runner image identity is unexpected' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
[[ -z $(lookup_id "$COMPOSE_TAG") ]]
assert_no_temporary_state

reset_case
BUILT_IMAGE_ID=sha256:short
assert_fails_with 'historical daily-runner image identity is unexpected' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
[[ -z $(lookup_id "$COMPOSE_TAG") ]]
assert_no_temporary_state

reset_case
MUTATE_BASE_ID_AFTER_BUILD=true
assert_fails_with 'base image identity changed during historical build' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
[[ -z $(lookup_id "$COMPOSE_TAG") ]]
grep -F -- $'config-id\t'"$BASE_ID" "$EVENTS" >/dev/null
grep -F -- $'config-id\t'"$MUTATED_ID" "$EVENTS" >/dev/null
assert_events_exclude $'config-id\tsocial-monitor-prod-intelligence-worker:latest'
assert_no_temporary_state

reset_case
MUTATE_BASE_REVISION_AFTER_BUILD=true
assert_fails_with 'base image could not be revalidated' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
[[ -z $(lookup_id "$COMPOSE_TAG") ]]
assert_no_temporary_state

reset_case
MUTATE_DOCKERFILE_AFTER_BUILD=true
assert_fails_with 'Dockerfile differs from reviewed immutable bytes' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
[[ -z $(lookup_id "$COMPOSE_TAG") ]]
assert_no_temporary_state

# A signal after installation removes the recovered tag as well as temporary
# build ownership; success retains only the recovered Compose tag for rescue.
reset_case
SIGNAL_AFTER_INSTALL=true
set +e
daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
signal_status=$?
set -e
((signal_status == 143))
[[ -z $(lookup_id "$COMPOSE_TAG") ]]
assert_no_temporary_state

reset_case
daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
[[ $(lookup_id "$COMPOSE_TAG") == "$CANDIDATE_ID" ]]
assert_no_temporary_state
build_count=$(grep -c $'^docker\tbuild' "$EVENTS")
tag_count=$(grep -c $'^docker\timage tag' "$EVENTS")
daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"
[[ $(grep -c $'^docker\tbuild' "$EVENTS") == "$build_count" ]]
[[ $(grep -c $'^docker\timage tag' "$EVENTS") == "$tag_count" ]]
[[ $(lookup_id "$COMPOSE_TAG") == "$CANDIDATE_ID" ]]
assert_events_exclude $'compose\t'
assert_events_exclude 'image prune'
assert_events_exclude 'system prune'

flock -u 8
exec 8>&-
printf 'Daily-runner historical image bootstrap tests passed\n'
