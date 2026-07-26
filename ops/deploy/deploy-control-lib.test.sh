#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/deploy-control-lib-test.XXXXXX")
trap 'touch "$FIXTURE/release"; rm -rf "$FIXTURE"' EXIT

REPO=$FIXTURE/repo
ROOT=$FIXTURE/root
CONTROL=$FIXTURE/control
STATE=$CONTROL/deploy-state
STAGING=$ROOT/runtime/deploy-staging
RELEASES=$ROOT/runtime/frontend-releases
DEPLOY_LOCK=$CONTROL/production-deploy.lock
DAILY_SINGLETON_LOCK=$CONTROL/daily-run-singleton.lock
POSTGRES_ADMISSION_LOCK=$CONTROL/daily-run.lock
# The sourced deploy-control library consumes this fixture-scoped path.
# shellcheck disable=SC2034
POSTGRES_RUNTIME_CURRENT=$CONTROL/postgres-runtime-current
POSTGRES_RUNTIME_RELEASES=$CONTROL/postgres-runtime-releases
SYSTEMD_UNIT_DIR=$ROOT/runtime/systemd
COMPOSE=(docker compose)
FRONTEND_PATHS=(frontend)
BACKEND_PATHS=(backend)
CONTROL_PATHS=(control)
RUNTIME_CONTROL_PATHS=(runtime-control)
install -d "$REPO/ops/deploy" "$CONTROL" "$STATE" "$SYSTEMD_UNIT_DIR"
cp "$SCRIPT_DIR/social-monitor-production-deploy.sh" \
  "$SCRIPT_DIR/social-monitor-production-ssh-wrapper.sh" \
  "$SCRIPT_DIR/deploy-control-lib.sh" \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" \
  "$SCRIPT_DIR/backend-image-rescue-lib.sh" \
  "$SCRIPT_DIR/x-collector-image-deploy-lib.sh" \
  "$SCRIPT_DIR/verify-postgres-runtime-topology.py" \
  "$REPO/ops/deploy/"
cp -a "$SCRIPT_DIR/production-runtime" "$REPO/ops/deploy/"
fail() {
  printf 'test deploy failure: %s\n' "$*" >&2
  exit 1
}

# shellcheck source=ops/deploy/deploy-control-lib.sh
source "$SCRIPT_DIR/deploy-control-lib.sh"
# shellcheck source=ops/deploy/postgres-runtime-deploy-lib.sh
source "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh"
initialize_deploy_control_bridge

# Successful acquisition retains only PostgreSQL admission. A separate process
# can still acquire the singleton while this shell owns admission.
exec 8>"$POSTGRES_ADMISSION_LOCK"
POSTGRES_ADMISSION_MAX_ATTEMPTS=2
POSTGRES_ADMISSION_RETRY_SLICE_SECONDS=0.01
acquire_postgres_admission_with_daily_priority 8
flock -n "$DAILY_SINGLETON_LOCK" true
flock -u 8

# The bounded nonblocking loop times out without calling a blocking long-wait
# flock operation.
(
  exec 7>"$POSTGRES_ADMISSION_LOCK"
  flock 7
  : > "$FIXTURE/admission-held"
  while [[ ! -e $FIXTURE/release ]]; do sleep 0.01; done
) &
holder_pid=$!
while [[ ! -e $FIXTURE/admission-held ]]; do sleep 0.01; done
set +e
timeout_error=$(
  (
    exec 8>"$POSTGRES_ADMISSION_LOCK"
    acquire_postgres_admission_with_daily_priority 8
  ) 2>&1
)
timeout_status=$?
set -e
((timeout_status != 0))
grep -F 'timed out waiting for PostgreSQL admission lock' \
  <<< "$timeout_error" >/dev/null
: > "$FIXTURE/release"
wait "$holder_pid"
rm -f "$FIXTURE/release" "$FIXTURE/admission-held"

# Deterministically place a daily singleton holder after the clear probe but
# before admission acquisition. The post-acquire probe must release admission
# and fail.
postgres_admission_after_singleton_probe() {
  [[ ! -e $FIXTURE/gap-started ]] || return 0
  : > "$FIXTURE/gap-started"
  (
    exec 7>"$DAILY_SINGLETON_LOCK"
    flock 7
    : > "$FIXTURE/singleton-held"
    while [[ ! -e $FIXTURE/release ]]; do sleep 0.01; done
  ) </dev/null >/dev/null 2>&1 &
  while [[ ! -e $FIXTURE/singleton-held ]]; do sleep 0.01; done
}

set +e
gap_error=$(
  (
    exec 8>"$POSTGRES_ADMISSION_LOCK"
    acquire_postgres_admission_with_daily_priority 8
  ) 2>&1
)
gap_status=$?
set -e
((gap_status != 0))
grep -F 'daily run claimed priority while deploy acquired PostgreSQL admission' \
  <<< "$gap_error" >/dev/null
flock -n "$POSTGRES_ADMISSION_LOCK" true
: > "$FIXTURE/release"
until flock -n "$DAILY_SINGLETON_LOCK" true; do sleep 0.01; done
rm -f "$FIXTURE/release"

# Runtime assets cannot advance in the same release as the already-sourced
# bridge controller or PostgreSQL activation library.
printf '# target mutation\n' >> \
  "$REPO/ops/deploy/postgres-runtime-deploy-lib.sh"
set +e
bridge_error=$(verify_deploy_control_bridge_compatibility 2>&1)
bridge_status=$?
set -e
((bridge_status != 0))
grep -F 'deploy the bridge release first' <<< "$bridge_error" >/dev/null
cp "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" \
  "$REPO/ops/deploy/postgres-runtime-deploy-lib.sh"
verify_deploy_control_bridge_compatibility

# The image-rescue controller is part of the same control-only bridge digest;
# a publication/runtime target cannot replace it under the running controller.
printf '# target rescue mutation\n' >> \
  "$REPO/ops/deploy/backend-image-rescue-lib.sh"
set +e
rescue_bridge_error=$(verify_deploy_control_bridge_compatibility 2>&1)
rescue_bridge_status=$?
set -e
((rescue_bridge_status != 0))
grep -F 'deploy the bridge release first' <<< "$rescue_bridge_error" >/dev/null
cp "$SCRIPT_DIR/backend-image-rescue-lib.sh" \
  "$REPO/ops/deploy/backend-image-rescue-lib.sh"
verify_deploy_control_bridge_compatibility

# X image provenance is also immutable across the Release A -> Release B
# bridge so the controller that validates the candidate is already running.
printf '# target X provenance mutation\n' >> \
  "$REPO/ops/deploy/x-collector-image-deploy-lib.sh"
set +e
x_bridge_error=$(verify_deploy_control_bridge_compatibility 2>&1)
x_bridge_status=$?
set -e
((x_bridge_status != 0))
grep -F 'deploy the bridge release first' <<< "$x_bridge_error" >/dev/null
cp "$SCRIPT_DIR/x-collector-image-deploy-lib.sh" \
  "$REPO/ops/deploy/x-collector-image-deploy-lib.sh"
verify_deploy_control_bridge_compatibility

source_runtime=$REPO/ops/deploy/production-runtime
source_activation=$source_runtime/github-premidnight-capture-v1.activation
legacy_runtime=$CONTROL/legacy-postgres-runtime
current_activation=$legacy_runtime/github-premidnight-capture-v1.activation
valid_activation=$FIXTURE/github-premidnight-capture-v1.activation
install -d "$legacy_runtime"
ln -s "$legacy_runtime" "$POSTGRES_RUNTIME_CURRENT"
printf 'install-disabled-v1\n' > "$valid_activation"

assert_reconciliation_failure() {
  local expected=$1
  local error status

  set +e
  error=$(reconcile_github_premidnight_capture_runtime_control false 2>&1)
  status=$?
  set -e
  ((status != 0))
  grep -F "$expected" <<< "$error" >/dev/null
}

# Historical controller bridges predate the capture mutation classifier. They
# remain unchanged only while both activation markers are absent; any marker
# appearing without the reviewed classifier fails closed.
rm -f "$source_activation" "$current_activation"
unset -f postgres_runtime_control_mutation_scope
[[ $(reconcile_github_premidnight_capture_runtime_control false) == false ]]
[[ $(reconcile_github_premidnight_capture_runtime_control true) == true ]]
install -m 0644 "$valid_activation" "$source_activation"
assert_reconciliation_failure 'mutation classifier is unavailable'
# shellcheck source=ops/deploy/postgres-runtime-deploy-lib.sh
source "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh"

# Equal activation states do not turn a marker-diff-free classification into a
# runtime-control deployment. An existing positive classification is retained.
rm -f "$source_activation" "$current_activation"
[[ $(reconcile_github_premidnight_capture_runtime_control false) == false ]]
[[ $(reconcile_github_premidnight_capture_runtime_control true) == true ]]
install -m 0644 "$valid_activation" "$source_activation"
install -m 0644 "$valid_activation" "$current_activation"
[[ $(reconcile_github_premidnight_capture_runtime_control false) == false ]]
[[ $(reconcile_github_premidnight_capture_runtime_control true) == true ]]

# A source-only activation marker is the recoverable bootstrap drift. Marker
# validation remains fail closed for malformed files and symlinks on either
# side of the comparison.
rm -f "$current_activation"
[[ $(reconcile_github_premidnight_capture_runtime_control false) == true ]]
printf 'enable-now\n' > "$source_activation"
assert_reconciliation_failure 'activation marker is invalid'
rm -f "$source_activation"
ln -s "$valid_activation" "$source_activation"
assert_reconciliation_failure 'activation marker is not a regular file'
rm -f "$source_activation"
install -m 0644 "$valid_activation" "$source_activation"
printf 'enable-now\n' > "$current_activation"
assert_reconciliation_failure 'activation marker is invalid'
rm -f "$current_activation"
ln -s "$valid_activation" "$current_activation"
assert_reconciliation_failure 'activation marker is not a regular file'

# The reconciliation seam reuses the mutation classifier's removal
# prohibition instead of treating source removal as an activation request.
rm -f "$source_activation" "$current_activation"
install -m 0644 "$valid_activation" "$current_activation"
assert_reconciliation_failure 'activation marker cannot be removed'
rm -f "$current_activation"
install -m 0644 "$valid_activation" "$source_activation"

# Exercise the later bootstrap call with the control marker already at the
# target and no component diff. The source is active while the installed legacy
# runtime has no activation marker, so reconciliation alone must select runtime
# control without changing the compatible backend release identity.
for unit in social-monitor-daily.service social-monitor-prod.service; do
  install -m 0644 "$source_runtime/$unit" "$SYSTEMD_UNIT_DIR/$unit"
done
install -m 0755 "$source_runtime/daily-run.sh" "$CONTROL/daily-run.sh"
git -C "$REPO" init -q -b main
git -C "$REPO" config user.email deploy-control-test@example.invalid
git -C "$REPO" config user.name deploy-control-test
git -C "$REPO" add .
git -C "$REPO" commit -qm 'test: reconciled runtime target'
target_sha=$(git -C "$REPO" rev-parse HEAD)
backend_marker_sha=617e284607f3dde74c27164af2b981770b9a62ed

# The exact legacy marker state is target-independent. Once detected, every
# invalid repair must stop in the atomic loader without entering ordinary
# deployment or changing any integration/backend/runtime host surface.
atomic_route_root=$FIXTURE/atomic-route-host
atomic_route_log=$FIXTURE/atomic-route.log
atomic_route_surfaces=(
  "$REPO/atomic-route-integration.state"
  "$atomic_route_root/backend.state"
  "$atomic_route_root/runtime.state"
  "$atomic_route_root/service.state"
  "$atomic_route_root/container.state"
  "$atomic_route_root/image.state"
  "$atomic_route_root/process.state"
)
install -d "$atomic_route_root"

atomic_route_surface_state() {
  local surface
  for surface in "${atomic_route_surfaces[@]}" "$STATE/backend.sha"; do
    stat -c '%n|%d:%i:%f:%s:%y:%z' "$surface"
    sha256sum "$surface"
  done
  if [[ -e $STATE/postgres-pool-bootstrap.sha || \
        -L $STATE/postgres-pool-bootstrap.sha ]]; then
    stat -c '%n|%d:%i:%f:%s:%y:%z' "$STATE/postgres-pool-bootstrap.sha"
    sha256sum "$STATE/postgres-pool-bootstrap.sha"
  fi
}

prepare_atomic_route_case() {
  local mode=$1 surface
  rm -f "$STATE/postgres-pool-bootstrap.sha"
  printf '%s\n' "$POSTGRES_POOL_ATOMIC_REPAIR_BACKEND_SHA" \
    > "$STATE/backend.sha"
  for surface in "${atomic_route_surfaces[@]}"; do
    printf 'preserved:%s\n' "$(basename "$surface")" > "$surface"
  done
  case $mode in
    malformed-backend) printf 'malformed\n' > "$STATE/backend.sha" ;;
    malformed-bootstrap)
      printf 'malformed\n' > "$STATE/postgres-pool-bootstrap.sha"
      ;;
  esac
  : > "$atomic_route_log"
}

invoke_invalid_atomic_route() (
  set -Eeuo pipefail
  local mode=$1 surface

  ordinary_deploy_started() {
    printf 'ordinary\n' >> "$atomic_route_log"
    for surface in "${atomic_route_surfaces[@]}" "$STATE/backend.sha"; do
      printf 'mutated-by-ordinary-deploy\n' > "$surface"
    done
    fail 'ordinary deploy was reached for invalid atomic repair'
  }
  fetch_main() { ordinary_deploy_started; }
  verify_postgres_pool_atomic_repair_target() {
    case $mode in
      invalid-target) fail 'atomic repair target is invalid' ;;
      invalid-contract) fail 'atomic repair contract is invalid' ;;
      verifier-failure) return 70 ;;
      missing-blob) return 0 ;;
      *) fail 'atomic repair verifier must not run for malformed markers' ;;
    esac
  }
  postgres_pool_bootstrap_recovery_commit_blob() {
    [[ $mode == missing-blob ]] || \
      fail 'atomic repair blob loader reached an unexpected case'
    fail 'atomic PostgreSQL bootstrap library is missing at reviewed commit'
  }
  deploy_release "$target_sha"
)

assert_invalid_atomic_route() {
  local mode=$1 expected=$2 before output status
  prepare_atomic_route_case "$mode"
  before=$(atomic_route_surface_state)
  set +e
  output=$(invoke_invalid_atomic_route "$mode" 2>&1)
  status=$?
  set -e
  ((status != 0))
  grep -F "$expected" <<< "$output" >/dev/null
  [[ ! -s $atomic_route_log ]]
  [[ $(atomic_route_surface_state) == "$before" ]]
  [[ ! -e $STATE/.postgres-pool-atomic-bootstrap-loader-$target_sha && \
     ! -L $STATE/.postgres-pool-atomic-bootstrap-loader-$target_sha ]]
}

assert_invalid_atomic_route malformed-backend 'backend marker is malformed'
assert_invalid_atomic_route malformed-bootstrap \
  'PostgreSQL bootstrap marker is malformed'
assert_invalid_atomic_route invalid-target 'atomic repair target is invalid'
assert_invalid_atomic_route invalid-contract 'atomic repair contract is invalid'
assert_invalid_atomic_route missing-blob \
  'atomic PostgreSQL bootstrap library is missing at reviewed commit'
assert_invalid_atomic_route verifier-failure \
  'atomic PostgreSQL bootstrap target validation failed'

rm -f "$STATE/postgres-pool-bootstrap.sha" "$STATE/backend.sha"
if postgres_pool_atomic_legacy_state; then
  fail 'marker-free non-legacy state entered atomic repair'
fi
printf '%s\n' "$target_sha" > "$STATE/backend.sha"
if postgres_pool_atomic_legacy_state; then
  fail 'non-adoption backend entered atomic repair'
fi
printf '%s\n' "$target_sha" > "$STATE/postgres-pool-bootstrap.sha"
printf '%s\n' "$POSTGRES_POOL_ATOMIC_REPAIR_BACKEND_SHA" > "$STATE/backend.sha"
if postgres_pool_atomic_legacy_state; then
  fail 'installed bootstrap state entered atomic repair'
fi
rm -f "$STATE/postgres-pool-bootstrap.sha" "$STATE/backend.sha"
rm -f "${atomic_route_surfaces[@]}"
rmdir "$atomic_route_root"

# The stale-control exception proves only the unique first-parent commit that
# introduced the installed blob. A legitimate backend commit before that
# control-only introduction is the cumulative-delta trap from the incident.
git -C "$REPO" switch -q -c partial-control-recovery
durable_backend_sha=$target_sha
install -d "$REPO/backend" "$REPO/control"
printf 'legitimate backend gap\n' > "$REPO/backend/gap.txt"
git -C "$REPO" add backend/gap.txt
git -C "$REPO" commit -qm 'test: legitimate backend gap'
printf '\n# unique safe partial control\n' >> \
  "$REPO/ops/deploy/social-monitor-production-deploy.sh"
git -C "$REPO" add ops/deploy/social-monitor-production-deploy.sh
git -C "$REPO" commit -qm 'test: unique safe partial control'
safe_control_candidate_sha=$(git -C "$REPO" rev-parse HEAD)
printf 'inherits safe blob\n' > "$REPO/control/inherited.txt"
git -C "$REPO" add control/inherited.txt
git -C "$REPO" commit -qm 'test: inherited safe control blob'
inherited_safe_sha=$(git -C "$REPO" rev-parse HEAD)

printf '\n# ambiguous reusable control\n' >> \
  "$REPO/ops/deploy/social-monitor-production-deploy.sh"
git -C "$REPO" add ops/deploy/social-monitor-production-deploy.sh
git -C "$REPO" commit -qm 'test: first ambiguous control introduction'
ambiguous_first_sha=$(git -C "$REPO" rev-parse HEAD)
printf '\n# move away from ambiguous control\n' >> \
  "$REPO/ops/deploy/social-monitor-production-deploy.sh"
git -C "$REPO" add ops/deploy/social-monitor-production-deploy.sh
git -C "$REPO" commit -qm 'test: different control blob'
git -C "$REPO" show \
  "$ambiguous_first_sha:ops/deploy/social-monitor-production-deploy.sh" \
  > "$REPO/ops/deploy/social-monitor-production-deploy.sh"
git -C "$REPO" add ops/deploy/social-monitor-production-deploy.sh
git -C "$REPO" commit -qm 'test: second ambiguous control introduction'

printf '\n# backend-bearing control introduction\n' >> \
  "$REPO/ops/deploy/social-monitor-production-deploy.sh"
printf 'unsafe backend introduction\n' > "$REPO/backend/candidate.txt"
git -C "$REPO" add ops/deploy/social-monitor-production-deploy.sh \
  backend/candidate.txt
git -C "$REPO" commit -qm 'test: backend-bearing control introduction'
backend_candidate_sha=$(git -C "$REPO" rev-parse HEAD)
printf '\n# non-control introduction\n' >> \
  "$REPO/ops/deploy/social-monitor-production-deploy.sh"
printf 'outside control\n' > "$REPO/non-control.txt"
git -C "$REPO" add ops/deploy/social-monitor-production-deploy.sh \
  non-control.txt
git -C "$REPO" commit -qm 'test: non-control introduction'
non_control_candidate_sha=$(git -C "$REPO" rev-parse HEAD)

git -C "$REPO" switch -q -c merge-control-side
printf '\n# merge-introduced control\n' >> \
  "$REPO/ops/deploy/social-monitor-production-deploy.sh"
git -C "$REPO" add ops/deploy/social-monitor-production-deploy.sh
git -C "$REPO" commit -qm 'test: side control candidate'
non_first_parent_sha=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" switch -q partial-control-recovery
printf 'first-parent control\n' > "$REPO/control/mainline.txt"
git -C "$REPO" add control/mainline.txt
git -C "$REPO" commit -qm 'test: first-parent control before merge'
git -C "$REPO" merge -q --no-ff merge-control-side \
  -m 'test: merge-introduced control candidate'
merge_candidate_sha=$(git -C "$REPO" rev-parse HEAD)
printf '\n# exact current canonical control\n' >> \
  "$REPO/ops/deploy/social-monitor-production-deploy.sh"
git -C "$REPO" add ops/deploy/social-monitor-production-deploy.sh
git -C "$REPO" commit -qm 'test: exact current canonical control'
partial_current_sha=$(git -C "$REPO" rev-parse HEAD)

git -C "$REPO" switch -q -c canonical-race-descendant
printf 'canonical race descendant\n' > "$REPO/control/canonical-race.txt"
git -C "$REPO" add control/canonical-race.txt
git -C "$REPO" commit -qm 'test: canonical race descendant'
canonical_race_sha=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" switch -q partial-control-recovery
git -C "$REPO" update-ref refs/remotes/origin/main "$partial_current_sha"
git -C "$REPO" switch -q -c divergent-control "$durable_backend_sha"
printf '\n# divergent noncanonical control\n' >> \
  "$REPO/ops/deploy/social-monitor-production-deploy.sh"
git -C "$REPO" add ops/deploy/social-monitor-production-deploy.sh
git -C "$REPO" commit -qm 'test: divergent partial control candidate'
divergent_control_sha=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" switch -q partial-control-recovery

BACKEND_PATHS=(backend)
CONTROL_PATHS=(control ops/deploy)
partial_recovery_events=$FIXTURE/partial-recovery-events
partial_runtime_sentinel=$CONTROL/partial-runtime.sentinel
printf 'runtime-must-not-change\n' > "$partial_runtime_sentinel"
partial_runtime_identity=$(stat -c '%d:%i:%f:%s:%y:%z' \
  "$partial_runtime_sentinel")
RECOVERY_STATE_RACE=none

validate_main_commit() {
  [[ $1 =~ ^[0-9a-f]{40}$ ]] || fail 'commit is malformed'
  git -C "$REPO" cat-file -e "$1^{commit}" 2>/dev/null || \
    fail 'commit is unavailable'
  git -C "$REPO" merge-base --is-ancestor "$1" origin/main || \
    fail 'commit is not on origin/main'
}

postgres_pool_bootstrap_installed() {
  local candidate=$1
  local marker=$STATE/postgres-pool-bootstrap.sha
  [[ -s $marker && ! -L $marker ]] || return 1
  [[ $(<"$marker") == "$candidate" ]] || return 1
  cmp -s "$CONTROL/github-production-deploy.sh" \
    "$REPO/ops/deploy/social-monitor-production-deploy.sh"
}

sync_control_entrypoint() {
  local source=$REPO/ops/deploy/social-monitor-production-deploy.sh
  local destination=$CONTROL/github-production-deploy.sh
  install -m 0755 "$source" "$destination.next"
  mv -f "$destination.next" "$destination"
  printf 'entrypoint-sync\n' >> "$partial_recovery_events"
  case $RECOVERY_STATE_RACE in
    backend|control)
      local raced_marker=$STATE/$RECOVERY_STATE_RACE.sha
      cp "$raced_marker" "$raced_marker.next"
      mv -f "$raced_marker.next" "$raced_marker"
      ;;
    bootstrap)
      printf '%s\n' "$safe_control_candidate_sha" \
        > "$STATE/postgres-pool-bootstrap.sha.next"
      mv -f "$STATE/postgres-pool-bootstrap.sha.next" \
        "$STATE/postgres-pool-bootstrap.sha"
      ;;
    canonical)
      git -C "$REPO" update-ref \
        refs/remotes/origin/main "$canonical_race_sha"
      ;;
    none) ;;
    *) fail 'unexpected recovery state race fixture' ;;
  esac
}

commit_postgres_pool_bootstrap() {
  local candidate=$1
  local mode=${2:-normal}
  [[ $candidate == "$partial_current_sha" && $mode == force-advance ]] || \
    fail 'partial recovery did not force-advance the current marker'
  [[ ${RECOVERY_COMMIT_INTERRUPTED:-false} == false ]] || \
    fail 'injected interrupted target-current reconciliation'
  printf '%s\n' "$candidate" > "$STATE/postgres-pool-bootstrap.sha.next"
  mv -f "$STATE/postgres-pool-bootstrap.sha.next" \
    "$STATE/postgres-pool-bootstrap.sha"
  postgres_pool_bootstrap_installed "$candidate" || \
    fail 'partial recovery marker did not bind current installed control'
  printf 'bootstrap-force-advance\n' >> "$partial_recovery_events"
}

prepare_partial_recovery() {
  local installed_sha=$1
  local backend_sha=${2:-$durable_backend_sha}
  local control_sha=${3:-$durable_backend_sha}
  rm -f "$STATE/postgres-pool-bootstrap.sha" \
    "$STATE/postgres-pool-bootstrap.sha.next" "$partial_recovery_events"
  printf '%s\n' "$backend_sha" > "$STATE/backend.sha"
  printf '%s\n' "$control_sha" > "$STATE/control.sha"
  git -C "$REPO" show \
    "$installed_sha:ops/deploy/social-monitor-production-deploy.sh" \
    > "$CONTROL/github-production-deploy.sh"
  chmod 0755 "$CONTROL/github-production-deploy.sh"
  RECOVERY_STATE_RACE=none
}

assert_partial_recovery_failure() {
  local expected=$1
  local output status
  set +e
  output=$(
    (reconcile_current_postgres_pool_bootstrap "$partial_current_sha") 2>&1
  )
  status=$?
  set -e
  ((status != 0))
  grep -F "$expected" <<< "$output" >/dev/null
  if [[ $RECOVERY_STATE_RACE != bootstrap ]]; then
    [[ ! -e $STATE/postgres-pool-bootstrap.sha && \
       ! -L $STATE/postgres-pool-bootstrap.sha ]]
  fi
}

# Exact incident: the cumulative backend-marker delta includes a legitimate
# backend path, while the safe introduction's own delta is entrypoint-only.
git -C "$REPO" diff --name-only \
  "$durable_backend_sha" "$safe_control_candidate_sha" -- \
  | grep -Fx 'backend/gap.txt' >/dev/null
[[ $(git -C "$REPO" diff --name-only \
  "$safe_control_candidate_sha^" "$safe_control_candidate_sha" --) == \
  ops/deploy/social-monitor-production-deploy.sh ]]
original_atomic_backend=$POSTGRES_POOL_ATOMIC_REPAIR_BACKEND_SHA
POSTGRES_POOL_ATOMIC_REPAIR_BACKEND_SHA=$durable_backend_sha
target_current_runtime_event=$FIXTURE/target-current-runtime-event
install -m 0755 "$REPO/ops/deploy/social-monitor-production-ssh-wrapper.sh" "$CONTROL/github-production-deploy-wrapper.sh"
fetch_main() { :; }
reconcile_completed_backend_image_rescues() {
  printf 'ordinary-runtime-gate\n' > "$target_current_runtime_event"
  return 71
}
prepare_partial_recovery "$safe_control_candidate_sha"
printf '%s\n' "$safe_control_candidate_sha" \
  > "$STATE/postgres-pool-bootstrap.sha"
backend_identity=$(stat -c '%d:%i:%f:%s:%y:%z' "$STATE/backend.sha")
control_identity=$(stat -c '%d:%i:%f:%s:%y:%z' "$STATE/control.sha")
RECOVERY_COMMIT_INTERRUPTED=true
set +e
interrupted_output=$(deploy_release "$partial_current_sha" 2>&1)
interrupted_status=$?
set -e
((interrupted_status != 0))
grep -F 'injected interrupted target-current reconciliation' \
  <<< "$interrupted_output" >/dev/null
[[ $(<"$STATE/postgres-pool-bootstrap.sha") == "$safe_control_candidate_sha" ]]
[[ ! -e $target_current_runtime_event ]]
RECOVERY_COMMIT_INTERRUPTED=false
reconcile_output=$(deploy_release "$partial_current_sha")
[[ -z $reconcile_output && ! -e $target_current_runtime_event ]]
cmp -s "$CONTROL/github-production-deploy.sh" \
  "$REPO/ops/deploy/social-monitor-production-deploy.sh"
[[ $(<"$STATE/postgres-pool-bootstrap.sha") == "$partial_current_sha" ]]
[[ $(<"$partial_recovery_events") == $'entrypoint-sync\nentrypoint-sync\nbootstrap-force-advance' ]]
[[ $(stat -c '%d:%i:%f:%s:%y:%z' "$STATE/backend.sha") == \
  "$backend_identity" ]]
[[ $(stat -c '%d:%i:%f:%s:%y:%z' "$STATE/control.sha") == \
  "$control_identity" ]]
[[ $(<"$partial_runtime_sentinel") == runtime-must-not-change ]]
[[ $(stat -c '%d:%i:%f:%s:%y:%z' "$partial_runtime_sentinel") == \
  "$partial_runtime_identity" ]]
# A fresh replay does not reuse the repair-only return; it reaches the ordinary
# rescue/check/runtime path that the fully gated workflow invokes.
set +e
replay_output=$(deploy_release "$partial_current_sha" 2>&1)
replay_status=$?
set -e
((replay_status != 0))
grep -F 'completed backend image rescue cleanup could not be reconciled' \
  <<< "$replay_output" >/dev/null
grep -Fx 'ordinary-runtime-gate' "$target_current_runtime_event" >/dev/null

# A valid but forged backend marker is rejected before the same runtime gate.
prepare_partial_recovery "$safe_control_candidate_sha" "$inherited_safe_sha"
printf '%s\n' "$safe_control_candidate_sha" \
  > "$STATE/postgres-pool-bootstrap.sha"
rm -f "$target_current_runtime_event"
set +e
forged_output=$(deploy_release "$partial_current_sha" 2>&1)
forged_status=$?
set -e
((forged_status != 0))
grep -F 'target-current PostgreSQL reconciliation is not at the adoption backend' \
  <<< "$forged_output" >/dev/null
[[ $(<"$STATE/postgres-pool-bootstrap.sha") == "$safe_control_candidate_sha" ]]
[[ ! -e $target_current_runtime_event ]]
POSTGRES_POOL_ATOMIC_REPAIR_BACKEND_SHA=$original_atomic_backend
unset -f fetch_main reconcile_completed_backend_image_rescues
unset RECOVERY_COMMIT_INTERRUPTED

# Unknown, inherited, ambiguous, unsafe, divergent, merge, and non-first-parent
# provenance all fail before the current entrypoint can be synced.
prepare_partial_recovery "$safe_control_candidate_sha"
printf 'unknown installed bytes\n' > "$CONTROL/github-production-deploy.sh"
chmod 0755 "$CONTROL/github-production-deploy.sh"
assert_partial_recovery_failure \
  'installed deploy entrypoint blob has no introducing commit'
[[ ! -e $partial_recovery_events ]]

prepare_partial_recovery "$durable_backend_sha"
assert_partial_recovery_failure \
  'installed deploy entrypoint blob has no introducing commit'

prepare_partial_recovery "$safe_control_candidate_sha" \
  "$durable_backend_sha" "$inherited_safe_sha"
assert_partial_recovery_failure \
  'installed deploy entrypoint candidate is not after the control marker'

prepare_partial_recovery "$ambiguous_first_sha"
assert_partial_recovery_failure \
  'installed deploy entrypoint blob has ambiguous introducing commits'

prepare_partial_recovery "$backend_candidate_sha"
assert_partial_recovery_failure \
  'installed deploy entrypoint introduction contains backend-classified paths'

prepare_partial_recovery "$non_control_candidate_sha"
assert_partial_recovery_failure \
  'installed deploy entrypoint introduction contains non-control paths'

prepare_partial_recovery "$divergent_control_sha"
assert_partial_recovery_failure \
  'installed deploy entrypoint blob has no introducing commit'

prepare_partial_recovery "$merge_candidate_sha"
assert_partial_recovery_failure \
  'installed deploy entrypoint introduction commit is a merge'

prepare_partial_recovery "$safe_control_candidate_sha" "$non_first_parent_sha"
assert_partial_recovery_failure \
  'backend marker is not on current canonical first-parent ancestry'
[[ ! -e $partial_recovery_events ]]

# Same-content atomic replacement of any durable marker is an identity race.
# The current entrypoint may already have been synced, but bootstrap commit and
# all runtime surfaces remain fenced.
for race_mode in backend control bootstrap; do
  prepare_partial_recovery "$safe_control_candidate_sha"
  RECOVERY_STATE_RACE=$race_mode
  race_label=$race_mode
  [[ $race_mode != bootstrap ]] || race_label='PostgreSQL bootstrap'
  assert_partial_recovery_failure \
    "$race_label marker changed during partial control reconciliation"
  [[ $(<"$partial_recovery_events") == entrypoint-sync ]]
  [[ $(<"$partial_runtime_sentinel") == runtime-must-not-change ]]
  [[ $(stat -c '%d:%i:%f:%s:%y:%z' "$partial_runtime_sentinel") == \
    "$partial_runtime_identity" ]]
done

prepare_partial_recovery "$safe_control_candidate_sha"
RECOVERY_STATE_RACE=canonical
assert_partial_recovery_failure \
  'canonical main changed during partial control reconciliation'
[[ $(<"$partial_recovery_events") == entrypoint-sync ]]
git -C "$REPO" update-ref refs/remotes/origin/main "$partial_current_sha"

unset -f validate_main_commit postgres_pool_bootstrap_installed \
  sync_control_entrypoint commit_postgres_pool_bootstrap
git -C "$REPO" switch -q main
git -C "$REPO" update-ref refs/remotes/origin/main "$target_sha"
BACKEND_PATHS=(backend)
CONTROL_PATHS=(control)
rm -f "$STATE/backend.sha" "$STATE/control.sha" \
  "$STATE/postgres-pool-bootstrap.sha" "$partial_recovery_events"
install -m 0755 "$REPO/ops/deploy/social-monitor-production-deploy.sh" \
  "$CONTROL/github-production-deploy.sh"

# Entry-point-only reconciliation has a distinct primitive. Its function body
# cannot acquire the wrapper, auth-refresh, or X-image side effects retained by
# the ordinary full control sync.
entrypoint_sync_body=$(sed -n \
  '/^sync_control_entrypoint() {$/,/^}$/p' \
  "$SCRIPT_DIR/social-monitor-production-deploy.sh")
grep -F 'social-monitor-production-deploy.sh' \
  <<< "$entrypoint_sync_body" >/dev/null
grep -F 'github-production-deploy.sh' \
  <<< "$entrypoint_sync_body" >/dev/null
if grep -E 'wrapper|auth_refresh|x_collector' \
  <<< "$entrypoint_sync_body" >/dev/null; then
  echo 'entrypoint-only sync contains a broad control side effect' >&2
  exit 1
fi
grep -F 'sync_control_entrypoint' \
  <<< "$(sed -n '/^sync_control_script() {$/,/^}$/p' \
    "$SCRIPT_DIR/social-monitor-production-deploy.sh")" >/dev/null

# The recovery dispatcher prefers the entrypoint helper. Its library fallback
# retains the root-owned 0755 policy, same-directory atomic replacement, and
# reviewed-byte checks without acquiring broader control-sync side effects.
fallback_sync_body=$(sed -n \
  '/^sync_postgres_pool_bootstrap_recovery_control_entrypoint_fallback() {$/,/^}$/p' \
  "$SCRIPT_DIR/deploy-control-lib.sh")
# The assertion matches literal shell source; expansion here would weaken it.
# shellcheck disable=SC2016
grep -F 'install -m 0755 -o root -g root "$source" "$temporary"' \
  <<< "$fallback_sync_body" >/dev/null
[[ $(grep -cF '== 0:0:755' <<< "$fallback_sync_body") == 3 ]]
# The assertion matches literal shell source; expansion here would weaken it.
# shellcheck disable=SC2016
grep -F '[[ $(stat -c '\''%d'\'' "$temporary") == "$control_device" ]]' \
  <<< "$fallback_sync_body" >/dev/null
# The assertion matches literal shell source; expansion here would weaken it.
# shellcheck disable=SC2016
grep -F 'temporary_digest == "$expected_digest"' \
  <<< "$fallback_sync_body" >/dev/null
if grep -E 'wrapper|auth_refresh|x_collector|deploy_(backend|frontend)' \
  <<< "$fallback_sync_body" >/dev/null; then
  echo 'bootstrap fallback contains a broad control or runtime side effect' >&2
  exit 1
fi

preferred_sync_log=$FIXTURE/preferred-sync.log
sync_control_entrypoint() {
  printf 'preferred\n' > "$preferred_sync_log"
}
sync_postgres_pool_bootstrap_recovery_control_entrypoint "$target_sha"
unset -f sync_control_entrypoint
grep -Fx 'preferred' "$preferred_sync_log" >/dev/null

# Invalid canonical source and destination identities fail before a temporary
# install can replace the historical entrypoint.
entrypoint_source=$REPO/ops/deploy/social-monitor-production-deploy.sh
mv "$entrypoint_source" "$entrypoint_source.valid"
ln -s "$entrypoint_source.valid" "$entrypoint_source"
set +e
invalid_source_error=$(
  (sync_postgres_pool_bootstrap_recovery_control_entrypoint "$target_sha") 2>&1
)
invalid_source_status=$?
set -e
((invalid_source_status != 0))
grep -F 'source is not a regular non-symlink file' \
  <<< "$invalid_source_error" >/dev/null
rm -f "$entrypoint_source"
mv "$entrypoint_source.valid" "$entrypoint_source"

# Normal callers retain the ancestor-accepting fast path. The explicit
# force-advance mode is separate, rejects misspellings, and is used by exactly
# one reconciliation call after marker identity race checks.
install -m 0755 "$REPO/ops/deploy/social-monitor-production-deploy.sh" \
  "$CONTROL/github-production-deploy.sh"
mv "$CONTROL/github-production-deploy.sh" \
  "$CONTROL/github-production-deploy.sh.valid"
ln -s "$CONTROL/github-production-deploy.sh.valid" \
  "$CONTROL/github-production-deploy.sh"
set +e
invalid_destination_error=$(
  (sync_postgres_pool_bootstrap_recovery_control_entrypoint "$target_sha") 2>&1
)
invalid_destination_status=$?
set -e
((invalid_destination_status != 0))
grep -F 'destination is not a regular non-symlink file' \
  <<< "$invalid_destination_error" >/dev/null
[[ ! -e $CONTROL/github-production-deploy.sh.next && \
   ! -L $CONTROL/github-production-deploy.sh.next ]]
rm -f "$CONTROL/github-production-deploy.sh"
mv "$CONTROL/github-production-deploy.sh.valid" \
  "$CONTROL/github-production-deploy.sh"
printf '%s\n' "$target_sha" > "$STATE/postgres-pool-bootstrap.sha"
commit_mode_output=$(
  COMMIT_FUNCTION="$(sed -n \
    '/^commit_postgres_pool_bootstrap() {$/,/^}$/p' \
    "$SCRIPT_DIR/social-monitor-production-deploy.sh")" \
  TARGET_SHA="$target_sha" \
  STATE="$STATE" \
    bash -c '
      set -euo pipefail
      eval "$COMMIT_FUNCTION"
      fail() {
        printf "test deploy failure: %s\n" "$*" >&2
        exit 1
      }
      postgres_pool_bootstrap_installed() {
        return 0
      }
      marker=$STATE/postgres-pool-bootstrap.sha
      default_identity=$(stat -c "%d:%i:%s:%y:%z" "$marker")
      commit_postgres_pool_bootstrap "$TARGET_SHA"
      [[ $(stat -c "%d:%i:%s:%y:%z" "$marker") == "$default_identity" ]]
      set +e
      invalid_output=$(
        (commit_postgres_pool_bootstrap "$TARGET_SHA" force) 2>&1
      )
      invalid_status=$?
      set -e
      ((invalid_status != 0))
      grep -F "marker advance mode is invalid" <<< "$invalid_output" >/dev/null
      forced_identity=$(stat -c "%d:%i:%s:%y:%z" "$marker")
      commit_postgres_pool_bootstrap "$TARGET_SHA" force-advance
      [[ $(<"$marker") == "$TARGET_SHA" ]]
      [[ $(stat -c "%d:%i:%s:%y:%z" "$marker") != "$forced_identity" ]]
      committed_identity=$(stat -c "%d:%i:%s:%y:%z" "$marker")
      ln -s "$marker" "$marker.next"
      set +e
      temporary_output=$(
        (commit_postgres_pool_bootstrap "$TARGET_SHA" force-advance) 2>&1
      )
      temporary_status=$?
      set -e
      ((temporary_status != 0))
      grep -F "marker temporary path is invalid" \
        <<< "$temporary_output" >/dev/null
      [[ -L $marker.next ]]
      [[ $(stat -c "%d:%i:%s:%y:%z" "$marker") == "$committed_identity" ]]
      rm -f "$marker.next"
      [[ -f $marker && ! -L $marker ]]
      printf "commit-modes-ok\n"
    '
)
[[ $commit_mode_output == commit-modes-ok ]]
[[ $(grep -cF 'commit_mode=force-advance' \
  "$SCRIPT_DIR/deploy-control-lib.sh") == 1 ]]
# The assertion matches literal shell source; expansion here would weaken it.
# shellcheck disable=SC2016
force_call_line=$(grep -nF \
  'commit_postgres_pool_bootstrap "$current" "$commit_mode"' \
  "$SCRIPT_DIR/deploy-control-lib.sh" | cut -d: -f1)
pool_race_line=$(grep -nF \
  'PostgreSQL bootstrap marker changed during control reconciliation' \
  "$SCRIPT_DIR/deploy-control-lib.sh" | cut -d: -f1)
control_race_line=$(grep -nF \
  'control marker changed during PostgreSQL bootstrap reconciliation' \
  "$SCRIPT_DIR/deploy-control-lib.sh" | cut -d: -f1)
((pool_race_line < force_call_line && control_race_line < force_call_line))

printf '%s\n' "$target_sha" > "$STATE/frontend.sha"
printf '%s\n' "$backend_marker_sha" > "$STATE/backend.sha"
printf '%s\n' "$target_sha" > "$STATE/control.sha"
[[ $(<"$STATE/control.sha") == "$target_sha" ]]

deploy_events=$FIXTURE/deploy-events
systemctl_events=$FIXTURE/systemctl-events
timer_unit_file_state=$FIXTURE/timer-unit-file-state
timer_active_state=$FIXTURE/timer-active-state
service_active_state=$FIXTURE/service-active-state
: > "$systemctl_events"
printf 'disabled\n' > "$timer_unit_file_state"
printf 'inactive\n' > "$timer_active_state"
printf 'inactive\n' > "$service_active_state"
fetch_main() {
  :
}

validate_main_commit() {
  [[ $1 == "$target_sha" ]]
  git -C "$REPO" cat-file -e "$1^{commit}"
}
marker_value() {
  local component=$1
  local marker=$STATE/$component.sha
  [[ -s $marker ]] && tr -d '\n' < "$marker"
}
postgres_pool_bootstrap_installed() {
  [[ -s $STATE/postgres-pool-bootstrap.sha && \
     $(<"$STATE/postgres-pool-bootstrap.sha") == "$1" ]] &&
    cmp -s "$CONTROL/github-production-deploy.sh" \
      "$REPO/ops/deploy/social-monitor-production-deploy.sh"
}
component_changed() {
  local component=$1
  local target=$2

  [[ $target == "$target_sha" ]]
  if [[ $component == control ]]; then
    [[ $(marker_value "$component") == "$target" ]] || \
      fail 'control marker did not already equal the target'
  elif [[ $component == backend ]]; then
    [[ $(marker_value "$component") == "$backend_marker_sha" ]] || \
      fail 'backend compatibility marker changed unexpectedly'
  fi
  return 1
}
advance_integration() {
  [[ $1 == "$target_sha" ]]
  [[ $(git -C "$REPO" rev-parse HEAD) == "$target_sha" ]]
  printf 'integration\n' >> "$deploy_events"
}
sync_control_script() {
  [[ $1 == "$target_sha" ]]
  printf 'control\n' >> "$deploy_events"
}
verify_effective_postgres_daily_topology() {
  :
}

systemctl() {
  printf '%s\n' "$*" >> "$systemctl_events"
  case $* in
    daemon-reload) ;;
    'show --property=FragmentPath --value '*)
      printf '%s/%s\n' "$SYSTEMD_UNIT_DIR" "${*: -1}"
      ;;
    'show --property=DropInPaths --value '*) ;;
    'show --property=UnitFileState --value social-monitor-github-premidnight-capture-v1.timer')
      cat "$timer_unit_file_state"
      ;;
    'show --property=ActiveState --value social-monitor-github-premidnight-capture-v1.timer')
      cat "$timer_active_state"
      ;;
    'show --property=ActiveState --value social-monitor-github-premidnight-capture-v1.service')
      cat "$service_active_state"
      ;;
    *)
      fail "unexpected systemctl command: $*"
      ;;
  esac
}

deploy_release_runtime_transaction() {
  local sha=$1
  local backend=$2
  local runtime_control=$3
  local compatible_backend_sha

  [[ $sha == "$target_sha" && $backend == false && \
     $runtime_control == true ]] || \
    fail 'reconciled runtime transaction classification is invalid'
  compatible_backend_sha=$(marker_value backend)
  [[ $compatible_backend_sha == "$backend_marker_sha" ]] || \
    fail 'reconciled runtime release lost backend compatibility identity'
  printf 'runtime=%s backend=%s sha=%s\n' \
    "$runtime_control" "$backend" "$sha" >> "$deploy_events"
  verify_deploy_control_bridge_compatibility
  activate_postgres_runtime_control "$sha" "$compatible_backend_sha"
}

commit_postgres_pool_bootstrap() {
  [[ $1 == "$target_sha" ]]
  printf 'bootstrap\n' >> "$deploy_events"
}

deploy_output=$(deploy_release "$target_sha")
grep -Fx \
  "deployed=$target_sha frontend=false backend=false control=false" \
  <<< "$deploy_output" >/dev/null
grep -Fx "runtime=true backend=false sha=$target_sha" \
  "$deploy_events" >/dev/null
[[ $(<"$STATE/control.sha") == "$target_sha" ]]
release=$POSTGRES_RUNTIME_RELEASES/$target_sha
[[ $(readlink -f "$POSTGRES_RUNTIME_CURRENT") == "$release" ]]
[[ $(<"$release/SOURCE_SHA") == "$target_sha" ]]
[[ $(<"$release/READY") == "$backend_marker_sha" ]]
cmp -s "$release/github-premidnight-capture-v1.activation" \
  "$source_activation"
cmp -s "$release/social-monitor-github-premidnight-capture-v1.service" \
  "$SYSTEMD_UNIT_DIR/social-monitor-github-premidnight-capture-v1.service"
cmp -s "$release/social-monitor-github-premidnight-capture-v1.timer" \
  "$SYSTEMD_UNIT_DIR/social-monitor-github-premidnight-capture-v1.timer"
grep -Fx 'Persistent=false' \
  "$SYSTEMD_UNIT_DIR/social-monitor-github-premidnight-capture-v1.timer" \
  >/dev/null
[[ $(<"$timer_unit_file_state") == disabled ]]
[[ $(<"$timer_active_state") == inactive ]]
[[ $(<"$service_active_state") == inactive ]]
if grep -Eq '(^| )(enable|disable|start|stop|restart)( |$)' \
  "$systemctl_events"; then
  echo 'reconciled runtime deployment mutated a systemd unit state' >&2
  exit 1
fi
if ((EUID == 0)); then
  grep -Fx \
    'show --property=UnitFileState --value social-monitor-github-premidnight-capture-v1.timer' \
    "$systemctl_events" >/dev/null
  grep -Fx \
    'show --property=ActiveState --value social-monitor-github-premidnight-capture-v1.timer' \
    "$systemctl_events" >/dev/null
  grep -Fx \
    'show --property=ActiveState --value social-monitor-github-premidnight-capture-v1.service' \
    "$systemctl_events" >/dev/null
fi

echo 'Deploy control library tests passed'
