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
EVENTS=$FIXTURE/events.log
BASE_ID=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
MUTATED_ID=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
CANDIDATE_ID=sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
EXISTING_ID=sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd

export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
export SOCIAL_MONITOR_DAILY_RUNNER_BOOTSTRAP_TMP_ROOT=$TMP_ROOT
install -d "$REPO" "$CONTROL" "$STATE" "$POSTGRES_RUNTIME_RELEASES" "$TMP_ROOT"
: > "$REFS"
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

backend_image_rescue_image_id() {
  local image_id
  printf 'inspect-id\t%s\n' "$1" >> "$EVENTS"
  image_id=$(lookup_id "$1")
  [[ -n $image_id ]] || return 1
  printf '%s\n' "$image_id"
}

backend_image_rescue_image_config() {
  [[ -n $(lookup_id "$1") ]] || return 1
  if [[ $1 == "$(compose_image_name intelligence-worker)" ]]; then
    printf '%s\n' "$BASE_CONFIG"
  else
    printf '%s\n' "$BUILT_CONFIG"
  fi
}

fake_compose() {
  printf 'compose\t%s\n' "$*" >> "$EVENTS"
  [[ $* == '--profile app --profile daily ps -q daily-runner' ]]
  [[ $ACTIVE_DAILY_CONTAINER == false ]] || printf 'daily-container\n'
}
COMPOSE=(fake_compose)

docker() {
  local source destination image_id revision
  local tag='' label='' context='' argument=''
  printf 'docker\t%s\n' "$*" >> "$EVENTS"
  case ${1:-}:${2:-} in
    build:*)
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
      if [[ ${*: -1} == *org.opencontainers.image.revision* ]]; then
        printf '%s|%s\n' "$image_id" "$revision"
      else
        printf '%s\n' "$image_id"
      fi
      ;;
    image:tag)
      source=$3
      destination=$4
      image_id=$(lookup_id "$source")
      revision=$(lookup_revision "$source")
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
EXPECTED_CONFIG=$DAILY_RUNNER_BOOTSTRAP_IMAGE_CONFIG
BASE_TAG=$(compose_image_name intelligence-worker)
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
  BUILT_CONFIG=$EXPECTED_CONFIG
  BUILT_IMAGE_ID=$CANDIDATE_ID
  BUILT_REVISION_OVERRIDE=
  BUILD_FAILURE=false
  MUTATE_BASE_ID_AFTER_BUILD=false
  MUTATE_BASE_REVISION_AFTER_BUILD=false
  MUTATE_DOCKERFILE_AFTER_BUILD=false
  SIGNAL_AFTER_INSTALL=false
  ACTIVE_DAILY_CONTAINER=false
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
ACTIVE_DAILY_CONTAINER=true
assert_fails_with 'active daily-runner container blocks' \
  daily_runner_image_bootstrap_before_rescue "$PREVIOUS_SHA" "$TARGET_SHA"

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
assert_events_exclude 'image prune'
assert_events_exclude 'system prune'

flock -u 8
exec 8>&-
printf 'Daily-runner historical image bootstrap tests passed\n'
