#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
LIBRARY=$SCRIPT_DIR/x-collector-image-deploy-lib.sh
SOURCE_REPOSITORY=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)
DOCKERFILE_PATH=ops/deploy/production-runtime/x-collector.Dockerfile
RELEASE_A_SOURCE_SHA=73b9ce4327bd8db060d7d1905fdc771796d5911c
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/x-image-provenance-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

REPO=$FIXTURE/repo
CONTROL=$FIXTURE/control
CALL_LOG=$FIXTURE/calls.log
CANDIDATE_IMAGE_ID=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
OTHER_IMAGE_ID=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
FAKE_RUNNING_IMAGE_ID=$CANDIDATE_IMAGE_ID
BUILT_RELEASE_SHA=

git -C "$SOURCE_REPOSITORY" cat-file -e \
  "$RELEASE_A_SOURCE_SHA^{commit}" 2>/dev/null || {
  echo 'Release A source revision is unavailable' >&2
  exit 1
}
if git -C "$SOURCE_REPOSITORY" cat-file -e \
  "$RELEASE_A_SOURCE_SHA:$DOCKERFILE_PATH" 2>/dev/null; then
  echo 'Release A contains the X collector production Dockerfile' >&2
  exit 1
fi

install -d "$REPO/ops/deploy/production-runtime" "$CONTROL"
git init -q -b main "$REPO"
git -C "$REPO" config user.name 'X image provenance fixture'
git -C "$REPO" config user.email x-image-provenance@example.invalid
printf 'FROM scratch\n' > \
  "$REPO/ops/deploy/production-runtime/x-collector.Dockerfile"
git -C "$REPO" add ops/deploy/production-runtime/x-collector.Dockerfile
git -C "$REPO" commit -qm 'test: tracked X Dockerfile'
REVIEWED_SHA=$(git -C "$REPO" rev-parse HEAD)
TARGET_SHA=$REVIEWED_SHA

export REPO CONTROL SOCIAL_MONITOR_DEPLOY_TEST_MODE=1

fail() {
  printf 'fixture-failure: %s\n' "$*" >&2
  exit 1
}

validate_sha() {
  [[ ${1:-} =~ ^[0-9a-f]{40}$ ]] || fail 'invalid fixture SHA'
}

compose_image_name() {
  [[ $1 == x-collector ]] || fail 'unexpected fixture service'
  printf 'fixture-x-collector:latest\n'
}

# shellcheck source=ops/deploy/x-collector-image-deploy-lib.sh
source "$LIBRARY"

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
    printf 'fixture failure did not contain %q: %q\n' \
      "$expected" "$output" >&2
    exit 1
  }
}

restore_reviewed_source() {
  git -C "$REPO" checkout -q -- \
    ops/deploy/production-runtime/x-collector.Dockerfile
}

sync_x_collector_dockerfile "$REVIEWED_SHA"
cmp -s "$REPO/ops/deploy/production-runtime/x-collector.Dockerfile" \
  "$CONTROL/x-collector.Dockerfile"
[[ $(stat -c '%a' "$CONTROL/x-collector.Dockerfile") == 644 ]]

rm -f "$REPO/ops/deploy/production-runtime/x-collector.Dockerfile"
assert_fails_with 'source is missing or a symlink' \
  sync_x_collector_dockerfile "$REVIEWED_SHA"
restore_reviewed_source

rm -f "$REPO/ops/deploy/production-runtime/x-collector.Dockerfile"
ln -s "$FIXTURE/not-the-reviewed-source" \
  "$REPO/ops/deploy/production-runtime/x-collector.Dockerfile"
assert_fails_with 'source is missing or a symlink' \
  sync_x_collector_dockerfile "$REVIEWED_SHA"
rm -f "$REPO/ops/deploy/production-runtime/x-collector.Dockerfile"
restore_reviewed_source

printf 'FROM fixture-digest-mismatch\n' > \
  "$REPO/ops/deploy/production-runtime/x-collector.Dockerfile"
assert_fails_with 'differs from the target Git blob' \
  sync_x_collector_dockerfile "$REVIEWED_SHA"
restore_reviewed_source

rm -f "$CONTROL/x-collector.Dockerfile"
ln -s "$FIXTURE/not-the-installed-dockerfile" \
  "$CONTROL/x-collector.Dockerfile"
assert_fails_with 'installed X collector Dockerfile is missing or a symlink' \
  x_collector_verify_installed_dockerfile "$REVIEWED_SHA"
rm -f "$CONTROL/x-collector.Dockerfile"
sync_x_collector_dockerfile "$REVIEWED_SHA"

printf 'FROM installed-digest-mismatch\n' > "$CONTROL/x-collector.Dockerfile"
assert_fails_with 'installed X collector Dockerfile differs from the target Git blob' \
  x_collector_verify_installed_dockerfile "$REVIEWED_SHA"
sync_x_collector_dockerfile "$REVIEWED_SHA"

printf 'FROM build-guard-digest-mismatch\n' > "$CONTROL/x-collector.Dockerfile"
: > "$CALL_LOG"
assert_fails_with 'installed X collector Dockerfile differs from the target Git blob' \
  x_collector_build_candidate "$TARGET_SHA" candidate_image_id
[[ ! -s $CALL_LOG ]]
sync_x_collector_dockerfile "$REVIEWED_SHA"

fake_compose() {
  printf 'compose:%s\n' "$*" >> "$CALL_LOG"
  if [[ " $* " == *' build '* ]]; then
    local argument
    BUILT_RELEASE_SHA=
    for argument in "$@"; do
      case $argument in
        SOCIAL_MONITOR_RELEASE_SHA=*)
          BUILT_RELEASE_SHA=${argument#SOCIAL_MONITOR_RELEASE_SHA=}
          ;;
      esac
    done
    [[ $BUILT_RELEASE_SHA =~ ^[0-9a-f]{40}$ ]] || return 91
  elif [[ $* == '--profile app ps -q x-collector' ]]; then
    printf 'fixture-x-container\n'
  fi
}

docker() {
  printf 'docker:%s\n' "$*" >> "$CALL_LOG"
  if [[ $1 == image && $2 == inspect && $3 == fixture-x-collector:latest ]]; then
    printf '%s\n' "$CANDIDATE_IMAGE_ID"
  elif [[ $1 == image && $2 == inspect && $3 == "$CANDIDATE_IMAGE_ID" ]]; then
    printf '%s\n' "${FAKE_LABEL_OVERRIDE-$BUILT_RELEASE_SHA}"
  elif [[ $1 == inspect && $2 == fixture-x-container ]]; then
    printf '%s\n' "$FAKE_RUNNING_IMAGE_ID"
  elif [[ $1 == image && $2 == inspect && $3 == "$OTHER_IMAGE_ID" ]]; then
    printf '%s\n' "${FAKE_LABEL_OVERRIDE-$BUILT_RELEASE_SHA}"
  else
    printf 'unexpected fixture Docker invocation: %s\n' "$*" >&2
    return 92
  fi
}

COMPOSE=(fake_compose)

assert_candidate_label_fails() {
  local label=$1 expected=$2
  FAKE_LABEL_OVERRIDE=$label
  : > "$CALL_LOG"
  assert_fails_with "$expected" x_collector_build_candidate \
    "$TARGET_SHA" candidate_image_id
  grep -Fx \
    "compose:--profile app build --build-arg SOCIAL_MONITOR_RELEASE_SHA=$TARGET_SHA x-collector" \
    "$CALL_LOG" >/dev/null
  if grep -F ' force-recreate ' "$CALL_LOG" >/dev/null; then
    echo 'candidate label failure reached recreate' >&2
    exit 1
  fi
}

assert_candidate_label_fails '' \
  'candidate revision is missing or mismatched'
assert_candidate_label_fails 0000000000000000000000000000000000000000 \
  'candidate revision is missing or mismatched'

unset FAKE_LABEL_OVERRIDE
: > "$CALL_LOG"
candidate_image_id=
x_collector_build_candidate "$TARGET_SHA" candidate_image_id
[[ $candidate_image_id == "$CANDIDATE_IMAGE_ID" ]]
[[ $BUILT_RELEASE_SHA == "$REVIEWED_SHA" ]]
grep -Fx \
  "compose:--profile app build --build-arg SOCIAL_MONITOR_RELEASE_SHA=$TARGET_SHA x-collector" \
  "$CALL_LOG" >/dev/null
[[ $(grep -c '^compose:.* build ' "$CALL_LOG") == 1 ]]

FAKE_RUNNING_IMAGE_ID=$OTHER_IMAGE_ID
assert_fails_with 'running X collector image ID does not match the built candidate' \
  x_collector_verify_running_candidate "$TARGET_SHA" "$CANDIDATE_IMAGE_ID"

FAKE_RUNNING_IMAGE_ID=$CANDIDATE_IMAGE_ID
x_collector_verify_running_candidate "$TARGET_SHA" "$CANDIDATE_IMAGE_ID"

# Build an executable old-controller -> Release A -> A-controller -> Release B
# chain. The old source is the nearest first-parent revision before this
# library existed; Release A uses the controller under test, and Release B adds
# exactly the future Dockerfile.
TRANSITION=$FIXTURE/transition
TRANSITION_REPO=$TRANSITION/repo
TRANSITION_ORIGIN=$TRANSITION/origin.git
TRANSITION_ROOT=$TRANSITION/root
TRANSITION_CONTROL=$TRANSITION_ROOT/control
TRANSITION_STATE=$TRANSITION_CONTROL/deploy-state
TRANSITION_STAGING=$TRANSITION_ROOT/runtime/deploy-staging
TRANSITION_LOG=$TRANSITION/transactions.log
OLD_CONTROLLER=$TRANSITION/old-controller.sh
OLD_SOURCE_SHA=
CURRENT_ENTRYPOINT_SOURCE_CLOSURE=(
  ops/deploy/social-monitor-production-deploy.sh
  ops/deploy/deploy-control-lib.sh
  ops/deploy/deploy-control-bridge-lib.sh
  ops/deploy/postgres-runtime-deploy-lib.sh
  ops/deploy/postgres-runtime-weekly-timer-state-lib.sh
  ops/deploy/postgres-runtime-daily-c1-readiness-lib.sh
  ops/deploy/postgres-runtime-activation-boundary-lib.sh
  ops/deploy/backend-runtime-health-lib.sh
  ops/deploy/backend-image-rescue-lib.sh
  ops/deploy/backend-image-rescue-pin-cleanup-lib.sh
  ops/deploy/docker-maintenance-lib.sh
  ops/deploy/daily-runner-image-bootstrap-lib.sh
  ops/deploy/x-collector-image-deploy-lib.sh
  ops/deploy/reader-summary-recovery-maintenance-lib.sh
)

while IFS= read -r candidate; do
  if ! git -C "$SOURCE_REPOSITORY" cat-file -e \
    "$candidate:ops/deploy/x-collector-image-deploy-lib.sh" 2>/dev/null; then
    OLD_SOURCE_SHA=$candidate
    break
  fi
done < <(git -C "$SOURCE_REPOSITORY" rev-list --first-parent HEAD)
[[ $OLD_SOURCE_SHA =~ ^[0-9a-f]{40}$ ]] || {
  echo 'pre-Release-A controller revision is unavailable' >&2
  exit 1
}
if git -C "$SOURCE_REPOSITORY" cat-file -e \
  "$OLD_SOURCE_SHA:$DOCKERFILE_PATH" 2>/dev/null; then
  echo 'pre-Release-A source unexpectedly contains the Release B Dockerfile' >&2
  exit 1
fi

git init --bare -q "$TRANSITION_ORIGIN"
git init -q -b main "$TRANSITION_REPO"
git -C "$TRANSITION_REPO" config user.name 'X provenance transition fixture'
git -C "$TRANSITION_REPO" config user.email x-transition@example.invalid
git -C "$TRANSITION_REPO" remote add origin "$TRANSITION_ORIGIN"
install -d "$TRANSITION_REPO/ops/deploy" "$TRANSITION_STATE" \
  "$TRANSITION_STAGING"
for path in \
  ops/deploy/social-monitor-production-deploy.sh \
  ops/deploy/deploy-control-lib.sh \
  ops/deploy/postgres-runtime-deploy-lib.sh \
  ops/deploy/backend-image-rescue-lib.sh; do
  git -C "$SOURCE_REPOSITORY" show "$OLD_SOURCE_SHA:$path" > \
    "$TRANSITION_REPO/$path"
done
printf 'old controller\n' > "$TRANSITION_REPO/README.md"
git -C "$TRANSITION_REPO" add README.md ops/deploy
git -C "$TRANSITION_REPO" commit -qm 'test: old controller'
OLD_RELEASE_SHA=$(git -C "$TRANSITION_REPO" rev-parse HEAD)
cp "$TRANSITION_REPO/ops/deploy/social-monitor-production-deploy.sh" \
  "$OLD_CONTROLLER"

for path in "${CURRENT_ENTRYPOINT_SOURCE_CLOSURE[@]}"; do
  cp "$SOURCE_REPOSITORY/$path" "$TRANSITION_REPO/$path"
done
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'rabbitmq_quorum_health_probe() { :; }' > \
  "$TRANSITION_REPO/ops/deploy/rabbitmq-quorum-health.sh"
chmod 0755 "$TRANSITION_REPO/ops/deploy/rabbitmq-quorum-health.sh"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'rabbitmq_quorum_recovery_probe() { :; }' > \
  "$TRANSITION_REPO/ops/deploy/rabbitmq-quorum-recovery.sh"
chmod 0755 "$TRANSITION_REPO/ops/deploy/rabbitmq-quorum-recovery.sh"
git -C "$TRANSITION_REPO" add ops/deploy
git -C "$TRANSITION_REPO" commit -qm 'test: Release A provenance controller'
RELEASE_A_SHA=$(git -C "$TRANSITION_REPO" rev-parse HEAD)
if git -C "$TRANSITION_REPO" cat-file -e \
  "$RELEASE_A_SHA:$DOCKERFILE_PATH" 2>/dev/null; then
  echo 'Release A transition fixture contains the Release B Dockerfile' >&2
  exit 1
fi
for path in "${CURRENT_ENTRYPOINT_SOURCE_CLOSURE[@]}"; do
  [[ -f $TRANSITION_REPO/$path && ! -L $TRANSITION_REPO/$path ]]
  cmp -s "$SOURCE_REPOSITORY/$path" "$TRANSITION_REPO/$path"
done

install -d "$TRANSITION_REPO/ops/deploy/production-runtime"
# shellcheck disable=SC2016 # Dockerfile label must retain literal expansion.
printf '%s\n' \
  'FROM python:3.13-slim' \
  '' \
  'WORKDIR /app' \
  'COPY apps/x-collector /app/apps/x-collector' \
  'RUN pip install --no-cache-dir /app/apps/x-collector' \
  '' \
  'ARG SOCIAL_MONITOR_RELEASE_SHA' \
  'LABEL org.opencontainers.image.revision="${SOCIAL_MONITOR_RELEASE_SHA}"' \
  '' \
  'WORKDIR /app/apps/x-collector' \
  'USER 1000:1000' \
  'CMD ["python", "-m", "x_collector"]' > \
  "$TRANSITION_REPO/$DOCKERFILE_PATH"
git -C "$TRANSITION_REPO" add "$DOCKERFILE_PATH"
git -C "$TRANSITION_REPO" commit -qm 'test: Release B X Dockerfile only'
RELEASE_B_SHA=$(git -C "$TRANSITION_REPO" rev-parse HEAD)
[[ $(git -C "$TRANSITION_REPO" diff --name-only \
  "$RELEASE_A_SHA" "$RELEASE_B_SHA") == "$DOCKERFILE_PATH" ]]
git -C "$TRANSITION_REPO" push -q -u origin main
git -C "$TRANSITION_REPO" checkout -q "$OLD_RELEASE_SHA"

for component in frontend backend control; do
  printf '%s\n' "$OLD_RELEASE_SHA" > "$TRANSITION_STATE/$component.sha"
done

SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
SOCIAL_MONITOR_DEPLOY_ROOT="$TRANSITION_ROOT" \
SOCIAL_MONITOR_DEPLOY_REPO="$TRANSITION_REPO" \
SOCIAL_MONITOR_DEPLOY_CONTROL="$TRANSITION_CONTROL" \
SOCIAL_MONITOR_DEPLOY_STATE="$TRANSITION_STATE" \
SOCIAL_MONITOR_DEPLOY_STAGING="$TRANSITION_STAGING" \
SOCIAL_MONITOR_DEPLOY_PROJECT=x-provenance-transition \
OLD_CONTROLLER="$OLD_CONTROLLER" RELEASE_A_SHA="$RELEASE_A_SHA" \
TRANSITION_LOG="$TRANSITION_LOG" bash -c '
  set -euo pipefail
  source "$OLD_CONTROLLER"
  reconcile_completed_backend_image_rescues() { :; }
  sync_control_script() {
    install -m 0755 "$REPO/ops/deploy/social-monitor-production-deploy.sh" \
      "$CONTROL/github-production-deploy.sh"
  }
  commit_postgres_pool_bootstrap() { :; }
  verify_compose_scope() { :; }
  deploy_release_runtime_transaction() {
    printf "%s %s %s old-controller\n" "$1" "$2" "$3" >> \
      "$TRANSITION_LOG"
  }
  deploy_release "$RELEASE_A_SHA"
'
[[ $(git -C "$TRANSITION_REPO" rev-parse HEAD) == "$RELEASE_A_SHA" ]]
[[ $(< "$TRANSITION_STATE/control.sha") == "$RELEASE_A_SHA" ]]
grep -Fx "$RELEASE_A_SHA false false old-controller" \
  "$TRANSITION_LOG" >/dev/null
cmp -s "$TRANSITION_CONTROL/github-production-deploy.sh" \
  "$TRANSITION_REPO/ops/deploy/social-monitor-production-deploy.sh"

transition_plan=$(
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$TRANSITION_ROOT" \
  SOCIAL_MONITOR_DEPLOY_REPO="$TRANSITION_REPO" \
  SOCIAL_MONITOR_DEPLOY_CONTROL="$TRANSITION_CONTROL" \
  SOCIAL_MONITOR_DEPLOY_STATE="$TRANSITION_STATE" \
  SOCIAL_MONITOR_DEPLOY_STAGING="$TRANSITION_STAGING" \
  SOCIAL_MONITOR_DEPLOY_PROJECT=x-provenance-transition \
    bash "$TRANSITION_CONTROL/github-production-deploy.sh" \
      plan "$RELEASE_B_SHA"
)
grep -Fx 'backend=true' <<< "$transition_plan" >/dev/null
grep -Fx 'control=true' <<< "$transition_plan" >/dev/null
grep -Fx 'x_collector=true' <<< "$transition_plan" >/dev/null

SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
SOCIAL_MONITOR_DEPLOY_ROOT="$TRANSITION_ROOT" \
SOCIAL_MONITOR_DEPLOY_REPO="$TRANSITION_REPO" \
SOCIAL_MONITOR_DEPLOY_CONTROL="$TRANSITION_CONTROL" \
SOCIAL_MONITOR_DEPLOY_STATE="$TRANSITION_STATE" \
SOCIAL_MONITOR_DEPLOY_STAGING="$TRANSITION_STAGING" \
SOCIAL_MONITOR_DEPLOY_PROJECT=x-provenance-transition \
RELEASE_B_SHA="$RELEASE_B_SHA" TRANSITION_LOG="$TRANSITION_LOG" \
A_CONTROLLER="$TRANSITION_CONTROL/github-production-deploy.sh" \
  bash -c '
    set -euo pipefail
    required_sources=(
      ops/deploy/social-monitor-production-deploy.sh
      ops/deploy/deploy-control-lib.sh
      ops/deploy/deploy-control-bridge-lib.sh
      ops/deploy/postgres-runtime-deploy-lib.sh
      ops/deploy/postgres-runtime-weekly-timer-state-lib.sh
      ops/deploy/postgres-runtime-daily-c1-readiness-lib.sh
      ops/deploy/postgres-runtime-activation-boundary-lib.sh
      ops/deploy/backend-runtime-health-lib.sh
      ops/deploy/backend-image-rescue-lib.sh
      ops/deploy/backend-image-rescue-pin-cleanup-lib.sh
      ops/deploy/docker-maintenance-lib.sh
      ops/deploy/daily-runner-image-bootstrap-lib.sh
      ops/deploy/x-collector-image-deploy-lib.sh
      ops/deploy/reader-summary-recovery-maintenance-lib.sh
    )
    deploy_repo=${SOCIAL_MONITOR_DEPLOY_REPO:?}
    for path in "${required_sources[@]}"; do
      [[ -f $deploy_repo/$path && ! -L $deploy_repo/$path ]]
    done
    source "$A_CONTROLLER"
    reconcile_completed_backend_image_rescues() { :; }
    load_target_reader_summary_publication_deploy_library() { :; }
    sync_control_script() {
      local sha=$1
      x_collector_target_has_tracked_dockerfile "$sha" || \
        fail "Release B target is missing the X Dockerfile"
      sync_x_collector_dockerfile "$sha"
      install -m 0755 "$REPO/ops/deploy/social-monitor-production-deploy.sh" \
        "$CONTROL/github-production-deploy.sh"
    }
    commit_postgres_pool_bootstrap() { :; }
    deploy_release_runtime_transaction() {
      verify_deploy_control_bridge_compatibility
      printf "%s %s %s A-controller\n" "$1" "$2" "$3" >> \
        "$TRANSITION_LOG"
    }
    deploy_release "$RELEASE_B_SHA"
  '
[[ $(git -C "$TRANSITION_REPO" rev-parse HEAD) == "$RELEASE_B_SHA" ]]
[[ $(< "$TRANSITION_STATE/control.sha") == "$RELEASE_B_SHA" ]]
grep -Fx "$RELEASE_B_SHA true false A-controller" \
  "$TRANSITION_LOG" >/dev/null
cmp -s "$TRANSITION_CONTROL/x-collector.Dockerfile" \
  "$TRANSITION_REPO/$DOCKERFILE_PATH"

# Execute the real backend transaction with the real installed-Dockerfile and
# running-candidate verifiers. A running image-ID mismatch must roll back and
# must not create or advance backend.sha.
printf '%s\n' "$RELEASE_A_SHA" > "$TRANSITION_STATE/backend.sha"
rm -f "$TRANSITION_STATE/backend.sha.next" \
  "$TRANSITION_STATE/backend-image-rescue-$RELEASE_B_SHA.tsv"
MISMATCH_LOG=$TRANSITION/running-mismatch.log
set +e
mismatch_output=$(
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$TRANSITION_ROOT" \
  SOCIAL_MONITOR_DEPLOY_REPO="$TRANSITION_REPO" \
  SOCIAL_MONITOR_DEPLOY_CONTROL="$TRANSITION_CONTROL" \
  SOCIAL_MONITOR_DEPLOY_STATE="$TRANSITION_STATE" \
  SOCIAL_MONITOR_DEPLOY_STAGING="$TRANSITION_STAGING" \
  SOCIAL_MONITOR_DEPLOY_PROJECT=x-provenance-transition \
  RELEASE_B_SHA="$RELEASE_B_SHA" CANDIDATE_IMAGE_ID="$CANDIDATE_IMAGE_ID" \
  OTHER_IMAGE_ID="$OTHER_IMAGE_ID" MISMATCH_LOG="$MISMATCH_LOG" \
  A_CONTROLLER="$TRANSITION_CONTROL/github-production-deploy.sh" \
    bash -c '
      set -euo pipefail
      source "$A_CONTROLLER"
      backend_services() { printf "x-collector\n"; }
      backend_image_rescue_prepare() { : > "$2"; }
      backend_image_rescue_mark_replacement_started() {
        printf "replacement-started\n" > "$1"
      }
      backup_database() { :; }
      verify_backend_with_retry() { :; }
      activate_postgres_runtime_control() { :; }
      verify_compose_scope() { :; }
      snapshot_postgres_runtime_control() {
        local backup=$STATE/mismatch-runtime-backup
        install -d "$backup"
        printf "%s\n" "$backup"
      }
      rollback_backend_and_runtime_control() {
        printf "rollback:%s\n" "$1" >> "$MISMATCH_LOG"
      }
      fake_compose() {
        if [[ $* == "--profile app ps -q x-collector" ]]; then
          printf "fixture-x-container\n"
        fi
      }
      docker() {
        if [[ $1 == image && $2 == inspect && \
              $3 == x-provenance-transition-x-collector:latest ]]; then
          printf "%s\n" "$CANDIDATE_IMAGE_ID"
        elif [[ $1 == image && $2 == inspect && \
                $3 == "$CANDIDATE_IMAGE_ID" ]]; then
          printf "%s\n" "$RELEASE_B_SHA"
        elif [[ $1 == inspect && $2 == fixture-x-container ]]; then
          printf "%s\n" "$OTHER_IMAGE_ID"
        else
          return 92
        fi
      }
      COMPOSE=(fake_compose)
      deploy_release_runtime_transaction "$RELEASE_B_SHA" true false
    ' 2>&1
)
mismatch_status=$?
set -e
((mismatch_status != 0))
grep -F 'running X collector image ID does not match the built candidate' \
  <<< "$mismatch_output" >/dev/null
grep -F 'backend images and PostgreSQL runtime control were restored' \
  <<< "$mismatch_output" >/dev/null
[[ $(< "$TRANSITION_STATE/backend.sha") == "$RELEASE_A_SHA" ]]
[[ ! -e $TRANSITION_STATE/backend.sha.next ]]
[[ $(grep -c '^rollback:true$' "$MISMATCH_LOG") == 1 ]]

echo 'X collector image provenance deploy contract tests passed'
