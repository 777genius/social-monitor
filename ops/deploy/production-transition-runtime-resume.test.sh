#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
LC_ALL=C
export PATH LC_ALL

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/transition-runtime-resume.XXXXXX")
trap '/usr/bin/rm -rf -- "$FIXTURE"' EXIT
REPO=$FIXTURE/repo
REMOTE=$FIXTURE/origin.git
OUTPUT=$FIXTURE/review
REVIEW_KEY=$FIXTURE/review-key
TARGET_KEY=$FIXTURE/target-key

fail() { printf 'transition-runtime-resume-error: %s\n' "$*" >&2; exit 1; }
validate_sha() { [[ ${1:-} =~ ^[0-9a-f]{40}$ ]] || fail 'invalid test SHA'; }

/usr/bin/ssh-keygen -q -t ed25519 -N '' -C runtime-review -f "$REVIEW_KEY"
/usr/bin/ssh-keygen -q -t ed25519 -N '' -C runtime-target -f "$TARGET_KEY"
REVIEW_FP=$(/usr/bin/ssh-keygen -lf "$REVIEW_KEY.pub" -E sha256 | /usr/bin/awk '{print $2}')
TARGET_FP=$(/usr/bin/ssh-keygen -lf "$TARGET_KEY.pub" -E sha256 | /usr/bin/awk '{print $2}')
read -r REVIEW_TYPE REVIEW_DATA _ < "$REVIEW_KEY.pub"
read -r TARGET_TYPE TARGET_DATA _ < "$TARGET_KEY.pub"

/usr/bin/git init -q -b main "$REPO"
/usr/bin/git -C "$REPO" config user.name 'Transition Runtime Resume'
/usr/bin/git -C "$REPO" config user.email transition-runtime@example.invalid
/usr/bin/mkdir -p "$REPO/ops/deploy"
printf '%s\n' \
  version=social-monitor-production-transition-review-anchor-v1 \
  anchor-path=ops/deploy/production-transition-review.anchor \
  allowed-signers-path=ops/deploy/production-transition-review.allowed_signers \
  principal=production-transition-review namespace=git key-type=ssh-ed25519 \
  "fingerprint=$REVIEW_FP" > "$REPO/ops/deploy/production-transition-review.anchor"
printf 'production-transition-review namespaces="git" %s %s runtime-review\n' \
  "$REVIEW_TYPE" "$REVIEW_DATA" > \
  "$REPO/ops/deploy/production-transition-review.allowed_signers"
/usr/bin/git -C "$REPO" add .
/usr/bin/git -C "$REPO" commit -qm 'test: runtime A0'
A0=$(/usr/bin/git -C "$REPO" rev-parse HEAD)

/bin/cp -a "$PROJECT_ROOT/ops/." "$REPO/ops/"
/usr/bin/mkdir -p "$REPO/.github/workflows"
for workflow in production-deploy.yml production-transition-review.yml \
  production-transition-publish.yml; do
  /bin/cp "$PROJECT_ROOT/.github/workflows/$workflow" "$REPO/.github/workflows/"
done
printf '%s\n' \
  version=social-monitor-production-transition-review-anchor-v1 \
  anchor-path=ops/deploy/production-transition-review.anchor \
  allowed-signers-path=ops/deploy/production-transition-review.allowed_signers \
  principal=production-transition-review namespace=git key-type=ssh-ed25519 \
  "fingerprint=$REVIEW_FP" > "$REPO/ops/deploy/production-transition-review.anchor"
printf 'production-transition-review namespaces="git" %s %s runtime-review\n' \
  "$REVIEW_TYPE" "$REVIEW_DATA" > \
  "$REPO/ops/deploy/production-transition-review.allowed_signers"
printf '%s\n' \
  version=social-monitor-production-transition-target-anchor-v1 \
  anchor-path=ops/deploy/production-transition-target.anchor \
  allowed-signers-path=ops/deploy/production-transition-target.allowed_signers \
  principal=production-transition-target namespace=git key-type=ssh-ed25519 \
  "fingerprint=$TARGET_FP" > "$REPO/ops/deploy/production-transition-target.anchor"
printf 'production-transition-target namespaces="git" %s %s runtime-target\n' \
  "$TARGET_TYPE" "$TARGET_DATA" > \
  "$REPO/ops/deploy/production-transition-target.allowed_signers"
printf 'unchanged backend fixture\n' > "$REPO/backend.txt"
/usr/bin/git -C "$REPO" add -A
/usr/bin/git -C "$REPO" commit -qm 'test: frozen runtime B0'
B0=$(/usr/bin/git -C "$REPO" rev-parse HEAD)

printf 'reviewed product transition\n' > "$FIXTURE/product.txt"
PRODUCT_BLOB=$(/usr/bin/git -C "$REPO" hash-object -w "$FIXTURE/product.txt")
INDEX=$FIXTURE/s2.index
GIT_INDEX_FILE=$INDEX /usr/bin/git -C "$REPO" read-tree "$B0"
GIT_INDEX_FILE=$INDEX /usr/bin/git -C "$REPO" update-index --add --cacheinfo \
  "100644,$PRODUCT_BLOB,product-transition.txt"
TREE=$(GIT_INDEX_FILE=$INDEX /usr/bin/git -C "$REPO" write-tree)
S2=$(printf 'test: external S2\n' | /usr/bin/git -C "$REPO" commit-tree "$TREE" -p "$B0")
/usr/bin/git clone -q --bare "$REPO" "$REMOTE"
/usr/bin/git -C "$REPO" remote add origin "$REMOTE"
/usr/bin/mkdir "$OUTPUT"

export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
export PRODUCTION_TRANSITION_TEST_REPOSITORY=$REPO
export PRODUCTION_TRANSITION_TEST_REMOTE=origin
export PRODUCTION_TRANSITION_TEST_ANCHOR_BASE=$A0
export PRODUCTION_TRANSITION_TEST_TRUSTED_BASE=$B0
export PRODUCTION_TRANSITION_TEST_REVIEW_FINGERPRINT=$REVIEW_FP
export PRODUCTION_TRANSITION_TEST_TARGET_FINGERPRINT=$TARGET_FP
export PRODUCTION_TRANSITION_TEST_NOW_EPOCH=2000000000
export PRODUCTION_TRANSITION_TEST_RUN_ID=runtime:1
export PRODUCTION_TRANSITION_TEST_TRANSITION_ID=runtime:transition
export PRODUCTION_TRANSITION_TEST_REPLAY_ID=runtime:replay:00000001
export GIT_AUTHOR_NAME='Transition Runtime Resume'
export GIT_AUTHOR_EMAIL=transition-runtime@example.invalid
export GIT_COMMITTER_NAME=$GIT_AUTHOR_NAME
export GIT_COMMITTER_EMAIL=$GIT_AUTHOR_EMAIL

REVIEW=$(PRODUCTION_TRANSITION_REVIEW_SIGNING_KEY=$REVIEW_KEY \
  "$REPO/ops/deploy/production-transition-reviewer.sh" review \
  "$S2" 1999999900 2000000100 "$OUTPUT")
P6=$(/usr/bin/sed -n 's/^p6=//p' <<< "$REVIEW")
STATEMENT=$(/usr/bin/sed -n 's/^statement=//p' <<< "$REVIEW")
SIGNATURE=$(/usr/bin/sed -n 's/^signature=//p' <<< "$REVIEW")
PREPARED=$(PRODUCTION_TRANSITION_TARGET_SIGNING_KEY=$TARGET_KEY \
  "$REPO/ops/deploy/production-transition-publisher.sh" prepare \
  "$S2" "$P6" "$STATEMENT" "$SIGNATURE")
T=$(/usr/bin/sed -n 's/^t=//p' <<< "$PREPARED")
PRODUCTION_TRANSITION_TARGET_SIGNING_KEY=$TARGET_KEY \
  "$REPO/ops/deploy/production-transition-publisher.sh" publish "$T" >/dev/null

STATE=$FIXTURE/state
CONTROL=$FIXTURE/control
# Consumed dynamically by the sourced production deploy-history contract.
# shellcheck disable=SC2034
BACKEND_PATHS=(backend.txt)
# shellcheck disable=SC2034
CONTROL_PATHS=(ops/deploy)
/usr/bin/install -d -m 0700 "$STATE" "$CONTROL"
PRODUCTION_TRANSITION_TRUSTED_BASE=$B0
PRODUCTION_TRANSITION_ANCHOR_BASE=$A0
PRODUCTION_TRANSITION_EFFECTIVE_REVIEW_FINGERPRINT=$REVIEW_FP
PRODUCTION_TRANSITION_EFFECTIVE_TARGET_FINGERPRINT=$TARGET_FP
PRODUCTION_TRANSITION_EFFECTIVE_NOW_EPOCH=2000000000
export REPO STATE CONTROL PRODUCTION_TRANSITION_TRUSTED_BASE
export PRODUCTION_TRANSITION_ANCHOR_BASE PRODUCTION_TRANSITION_EFFECTIVE_REVIEW_FINGERPRINT
export PRODUCTION_TRANSITION_EFFECTIVE_TARGET_FINGERPRINT PRODUCTION_TRANSITION_EFFECTIVE_NOW_EPOCH
# shellcheck source=ops/deploy/production-deploy-history-lib.sh
source "$REPO/ops/deploy/production-deploy-history-lib.sh"
# The production helpers fsync every staged receipt. The fixture still exercises
# their atomic stage/promote/reconcile paths; elide redundant filesystem-wide
# flush latency while iterating the crash matrix.
sync() { :; }
CACHED_AUTHORIZATION=$(production_transition_verify_embedded_review \
  "$T" "$STATEMENT" "$SIGNATURE" allow-expired)
# Durable-phase coverage below keeps one real cryptographic verification above,
# then caches its exact canonical authorization so 21 crash matrices stay fast.
production_transition_verify_target_contract() {
  [[ $1 == "$T" ]] || fail 'cached target verifier received another target'
  printf '%s\n' "$CACHED_AUTHORIZATION"
}

CURRENT_FAILPOINT=
FAILPOINT_USED=false
production_transition_marker_failpoint() {
  if [[ $FAILPOINT_USED == false && -n $CURRENT_FAILPOINT && $1 == "$CURRENT_FAILPOINT" ]]; then
    FAILPOINT_USED=true
    # Model process loss, not a recoverable callback error. An explicit exit is
    # also immune to Bash's errexit suppression when the outer call is tested.
    exit 97
  fi
}

effect_path() { printf '%s/effect-%s.sha\n' "$STATE" "$1"; }
perform_effect() {
  local component=$1 target=$2 path existing
  path=$(effect_path "$component")
  if [[ -e $path || -L $path ]]; then
    [[ -f $path && ! -L $path ]] || fail "$component effect receipt is unsafe"
    IFS= read -r existing < "$path"
    [[ $existing == "$target" ]] || fail "$component effect conflicts with target"
    return 0
  fi
  printf '%s\n' "$target" > "$path.next"
  chmod 0600 "$path.next"
  sync -f "$path.next"
  mv -T "$path.next" "$path"
  sync -f "$STATE"
  printf '%s\n' "$component" >> "$STATE/effects.log"
}
effect_installed() {
  local component=$1 target=$2 value
  [[ -f $(effect_path "$component") && ! -L $(effect_path "$component") ]] || return 1
  IFS= read -r value < "$(effect_path "$component")"
  [[ $value == "$target" ]]
}
postgres_pool_bootstrap_installed() { effect_installed bootstrap "$1"; }
postgres_pool_bootstrap_effect_installed() { postgres_pool_bootstrap_installed "$1"; }
backend_effect_installed() { effect_installed health "$1"; }
commit_postgres_pool_bootstrap() {
  perform_effect bootstrap "$1"
  production_transition_commit_effect_sha_marker \
    "$STATE/postgres-pool-bootstrap.sha" "$1" 'PostgreSQL bootstrap' \
    postgres_pool_bootstrap_installed
}
production_transition_require_runtime_terminal_receipts() {
  effect_installed migrations "$1" && effect_installed health "$1" && \
    postgres_pool_bootstrap_installed "$1"
}
production_transition_resume_runtime_schedulers() {
  perform_effect scheduler "$1"
}
HOST_TERMINAL=$STATE/host-terminal
production_transition_require_host_terminal_receipt() {
  [[ -f $HOST_TERMINAL && ! -L $HOST_TERMINAL && \
     $(<"$HOST_TERMINAL") == "$1" ]]
}
deploy_and_finalize_transition() {
  local target=$1 authorization
  production_transition_deploy_embedded_target "$target"
  authorization=$(production_transition_verify_embedded_review \
    "$target" '' '' allow-expired)
  [[ $(production_transition_scheduler_hold_phase "$authorization") == \
     release-authorized ]] || fail 'runtime resume removed the hold before host terminal'
  if (production_transition_finalize_scheduler_hold \
      "$target" "$authorization") >/dev/null 2>&1; then
    fail 'scheduler hold finalized without the host terminal receipt'
  fi
  printf '%s\n' "$target" > "$HOST_TERMINAL"
  production_transition_finalize_scheduler_hold "$target" "$authorization"
  if production_transition_scheduler_hold_exists; then
    fail 'scheduler hold remained after host terminal finalization'
  fi
}

# Exercise the production target state machine against the real deploy_release
# implementation before the exhaustive marker matrix installs its focused
# effect double below. The two cases prove a fresh transition and an actual
# integration-at-T/markers-at-B0 crash retry without bypassing either library.
exercise_real_deploy_release_paths() (
  STAGING=$FIXTURE/real-deploy-staging
  RELEASES=$FIXTURE/real-frontend-releases
  DEPLOY_LOCK=$CONTROL/real-production-deploy.lock
  POSTGRES_ADMISSION_LOCK=$CONTROL/real-daily-run.lock
  DAILY_SINGLETON_LOCK=$CONTROL/real-daily-singleton.lock
  POSTGRES_ADMISSION_MAX_ATTEMPTS=1
  POSTGRES_ADMISSION_RETRY_SLICE_SECONDS=0.01
  FRONTEND_PATHS=(frontend-unmodified.txt)
  BACKEND_PATHS=(product-transition.txt)
  CONTROL_PATHS=(product-transition.txt)
  RUNTIME_CONTROL_PATHS=(product-transition.txt)
  # shellcheck source=ops/deploy/deploy-control-lib.sh
  source "$REPO/ops/deploy/deploy-control-lib.sh"

  postgres_pool_atomic_legacy_state() { return 1; }
  load_deploy_control_bridge_library() { :; }
  fetch_main() { :; }
  validate_main_commit() {
    [[ $1 == "$T" ]] || fail 'real deploy fixture received another target'
  }
  reconcile_current_postgres_pool_bootstrap() {
    printf '%s\n' "$1" >> "$STATE/ordinary-bootstrap-reconcile.log"
  }
  reconcile_github_premidnight_capture_runtime_control() {
    [[ $1 == true || $1 == false ]] || fail 'runtime-control fixture input is invalid'
    printf '%s\n' "$1"
  }
  verify_deploy_control_bridge_target_compatibility() {
    [[ $1 == "$T" ]] || fail 'bridge compatibility checked another target'
  }
  deploy_control_bootstrap_production_transition_b0() { :; }
  load_target_rabbitmq_quorum_backend_health() {
    [[ $1 == "$T" ]] || fail 'backend health loaded from another target'
  }
  load_target_reader_summary_publication_deploy_library() {
    [[ $1 == "$T" ]] || fail 'publication deploy library loaded from another target'
  }
  REAL_SYNC_CRASH=false
  sync_control_script() {
    [[ $1 == "$T" ]] || fail 'control sync received another target'
    [[ $REAL_SYNC_CRASH == false ]] || exit 97
  }
  deploy_release_runtime_transaction() {
    local target=$1 backend=$2 runtime_control=$3
    [[ $target == "$T" && $backend == true && $runtime_control == true ]] || \
      fail 'real runtime transaction classification is incomplete'
    perform_effect migrations "$target"
    perform_effect health "$target"
    printf '%s\n' "$target" > "$STATE/backend.sha.next"
    chmod 0600 "$STATE/backend.sha.next"
    mv -T "$STATE/backend.sha.next" "$STATE/backend.sha"
  }
  deploy_frontend() { fail 'real transition unexpectedly selected frontend'; }

  real_reset_runtime() {
    /usr/bin/find "$STATE" -mindepth 1 -maxdepth 1 -delete
    /usr/bin/git -C "$REPO" checkout -q --detach "$B0"
    /bin/cp "$REPO/ops/deploy/social-monitor-production-deploy.sh" \
      "$CONTROL/github-production-deploy.sh"
    chmod 0755 "$CONTROL/github-production-deploy.sh"
    for component in control backend frontend postgres-pool-bootstrap; do
      printf '%s\n' "$B0" > "$STATE/$component.sha"
      chmod 0600 "$STATE/$component.sha"
    done
    REAL_SYNC_CRASH=false
  }
  require_exact_real_effects() {
    local effect
    for effect in migrations health bootstrap scheduler; do
      [[ $(/usr/bin/grep -c "^$effect$" "$STATE/effects.log") == 1 ]] || \
        fail "real deploy replayed or omitted $effect"
    done
    [[ $(<"$STATE/effects.log") == $'migrations\nhealth\nbootstrap\nscheduler' ]] || \
      fail 'real deploy reordered terminal runtime effects'
    [[ $(production_transition_read_activation_marker) == "$T" ]] || \
      fail 'real deploy did not activate the exact target'
    [[ $(production_transition_read_consumption_record) == \
       "$(production_transition_consumption_record complete "$CACHED_AUTHORIZATION")" ]] || \
      fail 'real deploy did not complete the exact review consumption'
  }

  real_reset_runtime
  if (deploy_release "$T" invalid-resume-mode) >/dev/null 2>&1; then
    fail 'real deploy accepted an invalid resume mode'
  fi
  [[ $(/usr/bin/git -C "$REPO" rev-parse HEAD) == "$B0" ]] || \
    fail 'invalid resume mode changed integration'
  if (deploy_release "$T" resume-target-prepared) >/dev/null 2>&1; then
    fail 'real deploy accepted target-prepared mode before integration reached target'
  fi

  production_transition_deploy_embedded_target "$T"
  [[ ! -e $STATE/ordinary-bootstrap-reconcile.log ]] || \
    fail 'fresh transition took the current-target bootstrap repair path'
  require_exact_real_effects

  real_reset_runtime
  REAL_SYNC_CRASH=true
  set +e
  (production_transition_deploy_embedded_target "$T") >/dev/null 2>&1
  crash_status=$?
  set -e
  [[ $crash_status == 97 ]] || fail 'real deploy did not crash at target preparation'
  [[ $(production_transition_require_target_deploy_state \
      "$T" allow-expired classify) == target-prepared ]] || \
    fail 'real deploy crash did not leave the authenticated target-prepared state'
  [[ $(production_transition_read_consumption_record) == \
     "$(production_transition_consumption_record pending "$CACHED_AUTHORIZATION")" ]] || \
    fail 'real deploy crash did not retain exact pending review authority'
  REAL_SYNC_CRASH=false
  production_transition_deploy_embedded_target "$T"
  [[ ! -e $STATE/ordinary-bootstrap-reconcile.log ]] || \
    fail 'target-prepared retry took the ordinary bootstrap repair path'
  require_exact_real_effects
  real_reset_runtime
)
exercise_real_deploy_release_paths

deploy_release() {
  local target=$1
  if ! effect_installed integration "$target"; then
    /usr/bin/git -C "$REPO" checkout -q --detach "$target"
    perform_effect integration "$target"
  fi
  production_transition_marker_failpoint integration-after-effect
  perform_effect migrations "$target"
  production_transition_marker_failpoint migrations-after-effect
  perform_effect health "$target"
  production_transition_marker_failpoint backend-health-after-effect
  commit_postgres_pool_bootstrap "$target"
  production_transition_commit_effect_sha_marker \
    "$STATE/control.sha" "$target" control production_transition_control_effect_installed
  production_transition_commit_runtime_completion "$target"
}

reset_runtime() {
  /usr/bin/find "$STATE" -mindepth 1 -maxdepth 1 -delete
  /usr/bin/git -C "$REPO" checkout -q --detach "$B0"
  /bin/cp "$REPO/ops/deploy/social-monitor-production-deploy.sh" \
    "$CONTROL/github-production-deploy.sh"
  chmod 0755 "$CONTROL/github-production-deploy.sh"
  for component in control backend postgres-pool-bootstrap; do
    printf '%s\n' "$B0" > "$STATE/$component.sha"
    chmod 0600 "$STATE/$component.sha"
  done
  CURRENT_FAILPOINT=
  FAILPOINT_USED=false
}

# A scheduler implementation can fail by returning nonzero rather than calling
# fail(). The transition contract must propagate that status even when its
# caller is itself tested in an if-condition, where Bash suppresses errexit.
runtime_resume_definition=$(declare -f production_transition_resume_runtime_schedulers)
production_transition_resume_runtime_schedulers() { return 1; }
reset_runtime
if (production_transition_deploy_embedded_target "$T") >/dev/null 2>&1; then
  fail 'runtime scheduler resume failure was suppressed by a conditional caller'
fi
production_transition_scheduler_hold_exists || \
  fail 'runtime scheduler resume failure removed the durable transition hold'
eval "$runtime_resume_definition"

FAILPOINTS=(
  consumption-pending-before-marker consumption-pending-after-marker
  scheduler-hold-held-before-marker scheduler-hold-held-after-marker
  scheduler-hold-held-before-deploy integration-after-effect
  migrations-after-effect backend-health-after-effect
  postgres-pool-bootstrap-before-marker postgres-pool-bootstrap-after-marker
  control-before-marker control-after-marker
  consumption-runtime-complete-before-marker consumption-runtime-complete-after-marker
  activation-before-marker activation-after-marker
  consumption-complete-before-marker consumption-complete-after-marker
  scheduler-hold-release-authorized-before-marker
  scheduler-hold-release-authorized-after-marker scheduler-hold-after-runtime-resume
)
for point in "${FAILPOINTS[@]}"; do
  [[ -z ${PRODUCTION_TRANSITION_TEST_FAILPOINT:-} || \
     $point == "$PRODUCTION_TRANSITION_TEST_FAILPOINT" ]] || continue
  printf 'resume-phase=%s\n' "$point"
  reset_runtime
  CURRENT_FAILPOINT=$point
  if (production_transition_deploy_embedded_target "$T") >/dev/null 2>&1; then
    fail "failpoint did not interrupt transition: $point"
  fi
  if [[ $point == scheduler-hold-after-runtime-resume ]]; then
    crash_record=$(production_transition_read_consumption_record)
    [[ $crash_record == \
       "$(production_transition_consumption_record complete "$CACHED_AUTHORIZATION")" ]] || \
      fail "scheduler post-resume crash left status $(/usr/bin/sed -n '2s/^status=//p' <<< "$crash_record")"
  fi
  CURRENT_FAILPOINT=
  deploy_and_finalize_transition "$T"
  [[ $(production_transition_read_activation_marker) == "$T" ]] || \
    fail "$point resume did not activate exact target"
  for effect in integration migrations health bootstrap scheduler; do
    [[ $(/usr/bin/grep -c "^$effect$" "$STATE/effects.log") == 1 ]] || \
      fail "$point replayed or omitted $effect"
  done
  [[ $(<"$STATE/effects.log") == $'integration\nmigrations\nhealth\nbootstrap\nscheduler' ]] || \
    fail "$point reordered terminal runtime effects"
done

reset_runtime
deploy_and_finalize_transition "$T"
if (production_transition_deploy_embedded_target "$T") >/dev/null 2>&1; then
  fail 'terminal target replay was accepted after scheduler release'
fi
REVIEW_ID=$(/usr/bin/sed -n 's/^review-id=//p' "$STATEMENT")
STATEMENT_SHA=$(/usr/bin/sha256sum "$STATEMENT" | /usr/bin/awk '{print $1}')
SIGNATURE_SHA=$(/usr/bin/sha256sum "$SIGNATURE" | /usr/bin/awk '{print $1}')
WIRE=$FIXTURE/obsolete-bootstrap.wire
{
  printf '%s\n' \
    version=social-monitor-production-transition-wire-canonical-v2 \
    "repository=$PRODUCTION_TRANSITION_REPOSITORY_ID" "t=$T" \
    "review-id=$REVIEW_ID" "statement-sha256=$STATEMENT_SHA" \
    "signature-sha256=$SIGNATURE_SHA"
  printf 'statement-base64='
  /usr/bin/base64 -w0 "$STATEMENT"
  printf '\nsignature-base64='
  /usr/bin/base64 -w0 "$SIGNATURE"
  printf '\n'
} > "$WIRE"
if (production_transition_read_wire_evidence "$T" bootstrap \
    < "$WIRE") >/dev/null 2>&1; then
  fail 'obsolete bootstrap wire purpose was accepted'
fi
printf 'production transition durable phase resume tests passed\n'
