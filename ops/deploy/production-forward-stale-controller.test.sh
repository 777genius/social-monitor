#!/usr/bin/env bash
# Incident regression against real history and the initialized host controller.
# shellcheck disable=SC1091,SC2034,SC2329 # Dynamic host/client fixture callbacks.
# shellcheck disable=SC2030,SC2031 # Partial-recovery state is intentionally subshell-isolated.
set -Eeuo pipefail
export LC_ALL=C GIT_NO_LAZY_FETCH=1 GIT_NO_REPLACE_OBJECTS=1
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
TARGET=421a4898f4c4245ec8abdf0dafa6d18e31f8684d
MARKER=7e800e90d3295cc881e21a3e81b611fa57eb5b2a
BRIDGE=4f805e6b3fb19035e664971157b02f834284f324
mode=${1:---require-fixed}
[[ $mode == --require-fixed || $mode == --reproduce || $mode == --probe-recovery ]]
fixture=$(mktemp -d "${TMPDIR:-/tmp}/forward-stale-controller.XXXXXX")
RUNNER_TEMP=$fixture
trap 'find "$fixture" -depth -delete' EXIT
fail() { printf 'stale-controller-test: %s\n' "$*" >&2; exit 1; }

# No checkout, network, SSH, containers, or production state. Preserve the
# actual graph and create only fixture-owned integration/marker state.
git -c gc.autoDetach=false clone -q --shared --no-checkout "$PROJECT_ROOT" "$fixture/repo"
git -C "$fixture/repo" update-ref HEAD "$MARKER"
mkdir "$fixture/state"
for component in backend control frontend postgres-pool-bootstrap; do
  printf '%s\n' "$MARKER" > "$fixture/state/$component.sha"
done
GITHUB_WORKSPACE=$fixture/repo
# shellcheck source=ops/deploy/github-production-forward-bridge-client-lib.sh
source "$SCRIPT_DIR/github-production-forward-bridge-client-lib.sh"
verify_production_forward_target_identity "$TARGET"
[[ $PRODUCTION_FORWARD_DERIVED_BRIDGE == "$BRIDGE" ]]
production_forward_git merge-base --is-ancestor "$BRIDGE" "$MARKER"
production_forward_first_parent_interval_contains \
  "$PRODUCTION_FORWARD_ANCHOR" "$TARGET" "$MARKER"
[[ $(production_forward_git rev-parse HEAD) == "$MARKER" ]]

# Exercise the actual reviewed host predicate, not an ancestry-only stand-in.
policy_path=ops/deploy/deploy-control-bridge-lib.sh
[[ $(production_forward_git rev-parse "$MARKER:$policy_path") == \
   $(git -C "$PROJECT_ROOT" hash-object "$SCRIPT_DIR/deploy-control-bridge-lib.sh") ]]
# shellcheck source=ops/deploy/deploy-control-bridge-lib.sh
source "$SCRIPT_DIR/deploy-control-bridge-lib.sh"
if deploy_control_is_reviewed_forward_bridge_transition "$MARKER" "$TARGET"; then
  fail 'stale initialized controller unexpectedly has reviewed forward authority'
fi
deploy_control_is_reviewed_forward_bridge_transition "$BRIDGE" "$TARGET"
deploy_control_is_reviewed_forward_bridge_transition "$TARGET" "$TARGET"
incident_entrypoint_path=ops/deploy/social-monitor-production-deploy.sh
[[ $(production_forward_git rev-parse "$MARKER:$incident_entrypoint_path") != \
   $(production_forward_git rev-parse "$TARGET:$incident_entrypoint_path") ]]

# Recover the two-line historical upload change in the isolated object store.
# A partial clone may omit this blob. Its committed identity, not our textual
# reconstruction, is the authority: refuse to execute it unless hashes match.
production_forward_git show "$TARGET:$incident_entrypoint_path" > "$fixture/target-entrypoint"
python3 - "$fixture/target-entrypoint" "$fixture/marker-entrypoint" <<'PY'
import pathlib
import sys

source = pathlib.Path(sys.argv[1]).read_bytes()
for prefix in (b'timeout 180 ', b''):
    command = prefix + b'tar --no-same-owner --no-same-permissions -xzf "$temp" -C "$extracted"'
    wrapped = b'(umask 022; ' + command + b')'
    assert source.count(wrapped) == 1
    source = source.replace(wrapped, command)
pathlib.Path(sys.argv[2]).write_bytes(source)
PY
[[ $(production_forward_git hash-object "$fixture/marker-entrypoint") == \
   $(production_forward_git rev-parse "$MARKER:$incident_entrypoint_path") ]]
production_forward_git hash-object -w "$fixture/marker-entrypoint" >/dev/null
while IFS= read -r path; do
  mkdir -p "$fixture/repo/$(dirname "$path")"
  production_forward_git show "$MARKER:$path" > "$fixture/repo/$path"
done < <(deploy_control_bridge_sealed_paths)
STATE=$fixture/state
# shellcheck source=ops/deploy/deploy-control-lib.sh
source "$fixture/repo/ops/deploy/deploy-control-lib.sh"
initialize_deploy_control_bridge
[[ $DEPLOY_CONTROL_BRIDGE_INITIALIZED_HEAD == "$MARKER" ]]
if (verify_deploy_control_bridge_target_compatibility "$TARGET") \
    > "$fixture/host.log" 2>&1; then
  fail 'actual initialized controller admitted the incompatible backend target'
fi
grep -Fx 'stale-controller-test: deploy control changed with backend or runtime assets; deploy the bridge release first' \
  "$fixture/host.log" >/dev/null

if [[ $mode == --probe-recovery ]]; then
  backend_step=$(production_forward_git rev-parse '8dcfa0c2^{commit}')
  control_step=$(production_forward_git rev-parse '36815877^{commit}')
  production_forward_first_parent_interval_contains "$MARKER" "$TARGET" "$backend_step"
  production_forward_first_parent_interval_contains "$backend_step" "$TARGET" "$control_step"
  verify_deploy_control_bridge_target_compatibility "$backend_step"
  # Extract only the real historical classification declarations/functions.
  # shellcheck source=/dev/null
  source /dev/stdin < <(sed -n '/^FRONTEND_PATHS=(/,/^COMPOSE=(/p' \
    "$fixture/marker-entrypoint" | sed '$d')
  # shellcheck source=/dev/null
  source /dev/stdin < <(sed -n '/^marker_value() {/,/^print_plan() {/p' \
    "$fixture/marker-entrypoint" | sed '$d')
  # Include side-parent history: the first-parent-only investigation misses
  # already-reviewed control-only successors of the real incident marker.
  upload_bridge=b608c4e7e8bbf3b4e0366f8b2ad829571991b57c
  validate_main_commit() { production_forward_git merge-base --is-ancestor "$1" "$TARGET"; }
  incident_candidate_count=0
  while IFS= read -r candidate; do
    if [[ $(production_forward_git rev-parse "$candidate:$incident_entrypoint_path") != \
          $(production_forward_git rev-parse "$MARKER:$incident_entrypoint_path") ]]; then
      backend_delta=$(production_forward_git diff-tree --no-commit-id --name-only \
        -r "$MARKER" "$candidate" -- "${BACKEND_PATHS[@]}")
      if [[ -z $backend_delta ]]; then
        ((incident_candidate_count += 1))
        introducing_commit=$(find_postgres_pool_bootstrap_installed_control_commit \
          "$MARKER" "$candidate" "$fixture/target-entrypoint")
        [[ $introducing_commit == "$upload_bridge" ]] || \
          fail 'another reviewed controller introduction needs recovery assessment'
        printf 'Reviewed history without backend delta: %s\n' "$candidate"
      fi
    fi
  done < <(production_forward_git rev-list --ancestry-path "$MARKER..$TARGET")
  ((incident_candidate_count > 0))
  [[ $(production_forward_git rev-parse "$upload_bridge^1") == "$MARKER" ]]
  production_forward_git merge-base --is-ancestor "$upload_bridge" "$TARGET"
  component_changed control "$upload_bridge" "${CONTROL_PATHS[@]}"
  if component_changed backend "$upload_bridge" "${BACKEND_PATHS[@]}" || \
      component_changed frontend "$upload_bridge" "${FRONTEND_PATHS[@]}" || \
      component_changed control "$upload_bridge" "${RUNTIME_CONTROL_PATHS[@]}"; then
    fail 'reviewed upload bridge is not control-only from the incident markers'
  fi
  # Deployment classification is weaker than interrupted-install recovery:
  # the introducing commit also changes pull-request.yml, which the actual
  # recovery validator does not classify as deploy control. Later branch tips
  # retain that introducing commit and cannot repair this failure.
  if (validate_postgres_pool_bootstrap_control_only_candidate "$upload_bridge") \
      > "$fixture/upload-recovery.log" 2>&1; then
    fail 'upload bridge unexpectedly satisfies the stricter partial-install contract'
  fi
  grep -Fx 'stale-controller-test: installed deploy entrypoint introduction contains non-control paths' \
    "$fixture/upload-recovery.log" >/dev/null
  printf 'Historical upload bridge fails partial-install recovery: its introducing commit contains non-control paths.\n'
  # Crash after advancing integration but before committing backend markers:
  # replaying this historical step hits the exact-remote prelude guard, while
  # skipping to the control step still has incompatible backend work pending.
  production_forward_git update-ref HEAD "$backend_step"
  production_forward_git update-ref refs/remotes/origin/main "$TARGET"
  initialize_deploy_control_bridge
  component_changed backend "$control_step" "${BACKEND_PATHS[@]}"
  if (verify_deploy_control_bridge_target_compatibility "$control_step") \
      > "$fixture/interrupted-control.log" 2>&1; then
    fail 'interrupted backend step admitted the control step with backend work pending'
  fi
  grep -F 'deploy control changed with backend or runtime assets; deploy the bridge release first' \
    "$fixture/interrupted-control.log" >/dev/null
  if (
    SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
    source_reviewed_deploy_library "$MARKER" \
      ops/deploy/production-transition-b0-host-control.sh 'historical host prelude'
    # shellcheck disable=SC2329 # Invoked by the dynamically loaded host prelude.
    fetch_main() { [[ $(production_forward_git rev-parse origin/main) == "$TARGET" ]]; }
    # shellcheck disable=SC2329 # Invoked by the dynamically loaded host prelude.
    validate_main_commit() { production_forward_git merge-base --is-ancestor "$1" origin/main; }
    production_transition_host_try_forward_handoff plan "$backend_step"
  ) > "$fixture/interrupted-retry.log" 2>&1; then
    fail 'historical-step retry unexpectedly passed the exact-remote prelude'
  fi
  grep -Fx 'stale-controller-test: production prelude target is not exact origin main' \
    "$fixture/interrupted-retry.log" >/dev/null
  for component in backend control postgres-pool-bootstrap; do
    printf '%s\n' "$backend_step" > "$STATE/$component.sha"
  done
  production_forward_git update-ref HEAD "$backend_step"
  initialize_deploy_control_bridge
  component_changed control "$control_step" "${CONTROL_PATHS[@]}"
  if component_changed backend "$control_step" "${BACKEND_PATHS[@]}" || \
      component_changed frontend "$control_step" "${FRONTEND_PATHS[@]}" || \
      component_changed control "$control_step" "${RUNTIME_CONTROL_PATHS[@]}"; then
    fail 'historical controller step is not control-only after the backend step'
  fi
  while IFS= read -r path; do
    production_forward_git show "$control_step:$path" > "$fixture/repo/$path"
  done < <(deploy_control_bridge_sealed_paths)
  production_forward_git update-ref HEAD "$control_step"
  initialize_deploy_control_bridge
  verify_deploy_control_bridge_target_compatibility "$TARGET"
  printf 'Recovery admission proven: 7e800 -> 8dcfa0c2 (compatible backend) -> 36815877 (control-only) -> 421a4898 (compatible target).\n'
  printf 'Interrupted backend step rejected: same-step retry fails exact-origin guard; next control step fails backend/controller compatibility.\n'
  printf 'Historical ordering alone therefore does not satisfy interrupted-state recovery.\n'
  exit 0
fi

# Reproduction loads the protected-base client, never an approximation.
if [[ $mode == --reproduce ]]; then
  production_forward_git show "$TARGET:ops/deploy/github-production-forward-bridge-client-lib.sh" > "$fixture/old-client"
fi
DEPLOY_SSH_DIRECTORY=$fixture/ssh
source "$SCRIPT_DIR/github-production-deploy-client.sh"
if [[ $mode == --reproduce ]]; then source "$fixture/old-client"; fi
POSTGRES_POOL_BOOTSTRAP_VERSION=postgres-pool-v1
capture_plan() {
  printf '%s\n' "$1" >> "$fixture/plans"
  if declare -F fixture_host_preflight >/dev/null; then
    fixture_host_preflight plan "$1" || return $?
  fi
  PLAN_FRONTEND=false PLAN_BACKEND=true PLAN_CONTROL=true PLAN_X_COLLECTOR=false
  PLAN_BACKEND_BASE=$(cat "$STATE/backend.sha")
  PLAN_POSTGRES_POOL_BOOTSTRAP=$POSTGRES_POOL_BOOTSTRAP_VERSION
  PLAN_POSTGRES_POOL_BOOTSTRAP_SHA=$(cat "$STATE/postgres-pool-bootstrap.sha")
  PLAN_POSTGRES_POOL_REPAIR=false
  [[ $PLAN_BACKEND_BASE != "$1" ]] || PLAN_BACKEND=false
  if [[ $1 == "${PRODUCTION_FORWARD_RECOVERY_BRIDGE:-}" ]]; then
    PLAN_BACKEND=false
    [[ $PLAN_POSTGRES_POOL_BOOTSTRAP_SHA != "$1" ]] || PLAN_CONTROL=false
  fi
}
print_plan() { :; }
if [[ $mode == --reproduce ]]; then
  deploy_once() { fail 'old client unexpectedly deployed'; }
  prepare_production_forward_bridge "$TARGET"
  prepare_production_forward_bridge "$TARGET"
  [[ $(wc -l < "$fixture/plans") == 2 ]]
  printf 'Reproduced: exact stale plan skipped twice despite host rejection.\n'
  exit 0
fi
[[ $(production_forward_controller_paths) == "$(deploy_control_bridge_sealed_paths)" ]]
# Retain the pinned C through a fixture-only merge; production target must
# likewise retain C. No workspace checkout or remote reference is modified.
C=$PRODUCTION_FORWARD_RECOVERY_BRIDGE
export GIT_AUTHOR_NAME=stale-test GIT_AUTHOR_EMAIL=stale@example.invalid
export GIT_COMMITTER_NAME=$GIT_AUTHOR_NAME GIT_COMMITTER_EMAIL=$GIT_AUTHOR_EMAIL
# Carry both reviewed control fixes into the fixture target, retaining real C
# ancestry. All unrelated target files remain the protected main snapshot.
GIT_INDEX_FILE=$fixture/recovery-target.index production_forward_git read-tree "$TARGET"
for path in ops/deploy/deploy-control-lib.sh ops/deploy/social-monitor-production-deploy.sh; do
  blob=$(production_forward_git rev-parse "$C:$path")
  [[ $(git -C "$PROJECT_ROOT" hash-object "$PROJECT_ROOT/$path") == "$blob" ]]
  GIT_INDEX_FILE=$fixture/recovery-target.index production_forward_git \
    update-index --cacheinfo "100644,$blob,$path"
done
tree=$(GIT_INDEX_FILE=$fixture/recovery-target.index production_forward_git write-tree --missing-ok)
old_c=8df8f3ba4e028e7fa7f837484541e58caf44a3f9
legacy_target=$(production_forward_git commit-tree "$TARGET^{tree}" -p "$TARGET" -p "$old_c" -m 'test: preserve previous review ancestry')
TARGET=$(production_forward_git commit-tree "$tree" -p "$legacy_target" -p "$C" -m 'test: retain recovery controller')
production_forward_git merge-base --is-ancestor "$old_c" "$TARGET"
production_forward_validate_recovery "$TARGET"
production_forward_git update-ref refs/remotes/origin/main "$TARGET"
# Keep the real committed host preflight, terminal-state parser and ordinary
# deploy guard in the transport fixture. Only the network fetch is replaced.
fixture_host_preflight() (
  REPO=$fixture/repo
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
  source_reviewed_deploy_library "$MARKER" \
    ops/deploy/production-transition-b0-host-control.sh 'committed host prelude'
  fetch_main() { [[ $(production_forward_git rev-parse origin/main) == "$TARGET" ]]; }
  validate_main_commit() { production_forward_git merge-base --is-ancestor "$1" origin/main; }
  production_transition_host_preflight_prelude "$1" "$2"
  if [[ $1 == deploy ]]; then production_transition_host_require_ordinary_deploy "$2"; fi
  production_transition_host_release_lock
)
printf 'version=production-transition-b0-host-state-v1\nstatus=terminal\ntrusted-base=%s\ntarget=%s\ntarget-tree=%s\n' \
  "$MARKER" "$MARKER" "$(production_forward_git rev-parse "$MARKER^{tree}")" \
  > "$STATE/production-transition-b0-host.state"
chmod 0600 "$STATE/production-transition-b0-host.state"
# A crash after advancing HEAD to C is deliberately fail-closed in the client.
# Prove the bounded operator repair through the existing authenticated ancestor
# command, not a new host authority or a transport stub that rewrites markers.
verify_partial_controller_operator_recovery() (
  local phase=$1 partial=$fixture/partial-$1 path initial_pool installed_identity
  mkdir -p "$partial/state" "$partial/control"
  git -c gc.autoDetach=false clone -q --shared --no-checkout "$fixture/repo" "$partial/repo"
  REPO=$partial/repo GITHUB_WORKSPACE=$partial/repo STATE=$partial/state CONTROL=$partial/control
  git -C "$REPO" config core.hooksPath /dev/null
  git -C "$REPO" sparse-checkout set --no-cone --no-sparse-index \
    /ops/deploy/social-monitor-production-deploy.sh \
    /ops/deploy/postgres-runtime-deploy-lib.sh \
    /ops/deploy/verify-postgres-runtime-topology.py \
    /ops/deploy/production-runtime/compose.postgres-runtime.yml
  git -C "$REPO" checkout -q --detach "$C"
  git -C "$REPO" update-ref refs/remotes/origin/main "$TARGET"
  [[ -z $(git -C "$REPO" status --porcelain) ]]
  for path in backend control frontend postgres-pool-bootstrap; do
    printf '%s\n' "$MARKER" > "$STATE/$path.sha"
    chmod 0600 "$STATE/$path.sha"
  done
  cp "$fixture/state/production-transition-b0-host.state" "$STATE/production-transition-b0-host.state"
  production_forward_git show "$phase:ops/deploy/social-monitor-production-deploy.sh" > \
    "$CONTROL/github-production-deploy.sh"
  production_forward_git show "$MARKER:ops/deploy/social-monitor-production-ssh-wrapper.sh" > \
    "$CONTROL/github-production-deploy-wrapper.sh"
  chmod 0755 "$CONTROL/"*.sh
  source_reviewed_deploy_library "$C" ops/deploy/deploy-control-lib.sh 'partial-C recovery implementation'
  source_reviewed_deploy_library "$C" ops/deploy/production-transition-b0-host-control.sh 'partial-C host prelude'
  source_reviewed_deploy_library "$C" ops/deploy/production-transition-marker-lib.sh 'partial-C marker publication'
  source /dev/stdin < <(sed -n '/^FRONTEND_PATHS=(/,/^COMPOSE=(/p' "$fixture/target-entrypoint" | sed '$d')
  source /dev/stdin < <(sed -n '/^marker_value() {/,/^validate_frontend_archive() {/p' "$fixture/target-entrypoint" | sed '$d')
  source /dev/stdin < <(sed -n '/^sync_control_entrypoint() {/,/^sync_control_script() {/p' "$fixture/target-entrypoint" | sed '$d')
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
  DEPLOY_LOCK=$partial/deploy.lock POSTGRES_ADMISSION_LOCK=$partial/admission.lock
  DAILY_SINGLETON_LOCK=$partial/daily.lock STAGING=$partial/staging RELEASES=$partial/releases
  fetch_main() { [[ $(git -C "$REPO" rev-parse origin/main) == "$TARGET" ]]; }
  validate_main_commit() { git -C "$REPO" merge-base --is-ancestor "$1" origin/main; }
  # Normalize only OS ownership for unprivileged CI; real install/rename,
  # committed source validation, marker publication and host locks still run.
  install() {
    local -a args=()
    while (($#)); do
      case $1 in -o|-g) shift 2 ;; *) args+=("$1"); shift ;; esac
    done
    command install "${args[@]}"
    [[ ${args[${#args[@]}-1]} != "$CONTROL/github-production-deploy.sh.next" ]] || \
      printf 'entrypoint-sync\n' >> "$partial/effects"
  }
  advance_integration() { fail 'operator repair replayed integration advancement'; }
  deploy_release_runtime_transaction() { fail 'operator repair replayed application deployment'; }
  deploy_frontend() { fail 'operator repair replayed frontend deployment'; }
  sync_control_script() { fail 'operator repair replayed full control deployment'; }
  operator_repair() (
    production_transition_host_preflight_prelude deploy "$MARKER"
    production_transition_host_require_ordinary_deploy "$MARKER"
    deploy_release "$MARKER"
    production_transition_host_release_lock
  )
  initial_pool=$(stat -c '%d:%i:%s:%y:%z' "$STATE/postgres-pool-bootstrap.sha")
  operator_repair
  [[ $(cat "$STATE/postgres-pool-bootstrap.sha") == "$C" ]]
  [[ $(cat "$partial/effects") == entrypoint-sync ]]
  [[ $(stat -c '%d:%i:%s:%y:%z' "$STATE/postgres-pool-bootstrap.sha") != "$initial_pool" ]]
  initial_pool=$(stat -c '%d:%i:%s:%y:%z' "$STATE/postgres-pool-bootstrap.sha")
  installed_identity=$(stat -c '%d:%i:%s:%y:%z' "$CONTROL/github-production-deploy.sh")
  operator_repair
  [[ $(stat -c '%d:%i:%s:%y:%z' "$STATE/postgres-pool-bootstrap.sha") == "$initial_pool" ]]
  [[ $(stat -c '%d:%i:%s:%y:%z' "$CONTROL/github-production-deploy.sh") == "$installed_identity" ]]
  [[ $(cat "$partial/effects") == entrypoint-sync ]]
  # Ancestor repair seals the installed pool only. The next normal deployment
  # owns control.sha advancement; fabricating it here would hide pending work.
  for path in backend control frontend; do [[ $(cat "$STATE/$path.sha") == "$MARKER" ]]; done
  [[ $(git -C "$REPO" rev-parse HEAD) == "$C" ]]
  cmp "$CONTROL/github-production-deploy.sh" "$REPO/ops/deploy/social-monitor-production-deploy.sh"
  [[ $(find_postgres_pool_bootstrap_installed_control_commit \
    "$MARKER" "$C" "$CONTROL/github-production-deploy.sh") == "$C" ]]
  (
    production_transition_host_preflight_prelude plan "$TARGET"
    print_plan "$TARGET"
    production_transition_host_release_lock
  ) > "$partial/target.plan"
  grep -Fx "postgres_pool_bootstrap_sha=$C" "$partial/target.plan" >/dev/null
  grep -Fx "backend_base=$MARKER" "$partial/target.plan" >/dev/null
  grep -Fx 'backend=true' "$partial/target.plan" >/dev/null
  grep -Fx 'control=true' "$partial/target.plan" >/dev/null
)
verify_partial_controller_operator_recovery "$C"
verify_partial_controller_operator_recovery "$MARKER"
# The real host classifier and interrupted-entrypoint validator must accept C,
# not merely the client's read-only plan stub.
(
  source /dev/stdin < <(sed -n '/^FRONTEND_PATHS=(/,/^COMPOSE=(/p' \
    "$fixture/marker-entrypoint" | sed '$d')
  source /dev/stdin < <(sed -n '/^marker_value() {/,/^print_plan() {/p' \
    "$fixture/marker-entrypoint" | sed '$d')
  validate_main_commit() { production_forward_git merge-base --is-ancestor "$1" "$TARGET"; }
  component_changed control "$C" "${CONTROL_PATHS[@]}"
  if component_changed backend "$C" "${BACKEND_PATHS[@]}" || \
      component_changed frontend "$C" "${FRONTEND_PATHS[@]}" || \
      component_changed control "$C" "${RUNTIME_CONTROL_PATHS[@]}"; then
    fail 'C is not host-classified control-only'
  fi
  validate_postgres_pool_bootstrap_control_only_candidate "$C"
  [[ $(find_postgres_pool_bootstrap_installed_control_commit \
    "$MARKER" "$C" "$fixture/target-entrypoint") == "$C" ]]
)
# Use the real deploy_once/disconnect reconciliation with only transport faked.
RECONCILE_ATTEMPTS=2 RECONCILE_INTERVAL_SECONDS=0
run_remote() {
  [[ $1 == deploy && $2 == "$C" ]] || fail 'unexpected remote mutation'
  fixture_host_preflight deploy "$2" || return $?
  printf '%s\n' "$2" >> "$fixture/deploys"
  production_forward_git update-ref HEAD "$C"
  printf '%s\n' "$C" > "$STATE/control.sha"
  printf '%s\n' "$C" > "$STATE/postgres-pool-bootstrap.sha"
  return 255
}
prepare_production_forward_bridge "$TARGET"
prepare_production_forward_bridge "$TARGET"
# Once C is current, only the descendant target remains host-admitted for
# reconciliation; neither planning nor replaying deploy C is permitted.
for action in plan deploy; do
  if fixture_host_preflight "$action" "$C" > "$fixture/current-c.log" 2>&1; then
    fail "current C unexpectedly admitted $action C"
  fi
  grep -Fx 'deploy-client-error: production prelude target is not exact origin main' \
    "$fixture/current-c.log" >/dev/null
done
# A completed backend transaction can precede the final pool marker write.
# Resuming this exact target must keep C and avoid another bridge deployment.
printf '%s\n' "$TARGET" > "$STATE/backend.sha"
prepare_production_forward_bridge "$TARGET"
printf '%s\n' "$MARKER" > "$STATE/backend.sha"
[[ $(cat "$fixture/deploys") == "$C" && $(wc -l < "$fixture/deploys") == 1 ]]
# Reinitialize from the actual bridge bytes and prove host admission of target.
while IFS= read -r path; do
  production_forward_git show "$C:$path" > "$fixture/repo/$path"
done < <(deploy_control_bridge_sealed_paths)
production_forward_git update-ref HEAD "$C"
initialize_deploy_control_bridge
verify_deploy_control_bridge_target_compatibility "$TARGET"
# Every mixed/unrelated marker phase must fail without another deploy.
for component in backend postgres-pool-bootstrap; do
  for bad in "$BRIDGE" "$PRODUCTION_FORWARD_POOL_SHA" 1111111111111111111111111111111111111111; do
    printf '%s\n' "$MARKER" > "$STATE/backend.sha"
    printf '%s\n' "$C" > "$STATE/postgres-pool-bootstrap.sha"
    printf '%s\n' "$bad" > "$STATE/$component.sha"
    if (prepare_production_forward_bridge "$TARGET") > "$fixture/reject.log" 2>&1; then
      fail "mixed $component marker admitted"
    fi
  done
done
[[ $(wc -l < "$fixture/deploys") == 1 ]]
PLAN_FRONTEND=false PLAN_BACKEND=false PLAN_CONTROL=false PLAN_X_COLLECTOR=false
PLAN_POSTGRES_POOL_BOOTSTRAP_SHA=1111111111111111111111111111111111111111
PLAN_BACKEND_BASE=$PLAN_POSTGRES_POOL_BOOTSTRAP_SHA
if production_forward_plan_is_fully_reconciled "$C"; then fail 'arbitrary markers reconciled'; fi
# Wrong bridge inspection plans must not mutate even with a valid target tuple.
for field in PLAN_FRONTEND PLAN_BACKEND PLAN_X_COLLECTOR PLAN_POSTGRES_POOL_REPAIR; do
  if (
    capture_plan() {
      PLAN_FRONTEND=false PLAN_BACKEND=true PLAN_CONTROL=true PLAN_X_COLLECTOR=false
      PLAN_BACKEND_BASE=$MARKER PLAN_POSTGRES_POOL_BOOTSTRAP_SHA=$MARKER
      PLAN_POSTGRES_POOL_REPAIR=false
      if [[ $1 == "$C" ]]; then
        PLAN_BACKEND=false
        printf -v "$field" '%s' true
      fi
    }
    prepare_production_forward_bridge "$TARGET"
  ) > "$fixture/reject.log" 2>&1; then fail "invalid bridge plan admitted: $field"; fi
done
[[ $(wc -l < "$fixture/deploys") == 1 ]]
PLAN_FRONTEND=false PLAN_BACKEND=false PLAN_CONTROL=false PLAN_X_COLLECTOR=false
PLAN_POSTGRES_POOL_REPAIR=false
# Every controller path is sealed against byte substitution.
index=$fixture/negative.index
for path in $(production_forward_controller_paths); do
  GIT_INDEX_FILE=$index production_forward_git read-tree "$TARGET"
  blob=$(printf 'fixture substitution\n' | production_forward_git hash-object -w --stdin)
  GIT_INDEX_FILE=$index production_forward_git update-index --cacheinfo "100644,$blob,$path"
  tree=$(GIT_INDEX_FILE=$index production_forward_git write-tree --missing-ok)
  bad_target=$(production_forward_git commit-tree "$tree" -p "$TARGET" -m 'test: incompatible controller')
  if production_forward_validate_recovery "$bad_target"; then fail "unsealed path: $path"; fi
done
# A removed source, symlink and changed executable mode also fail closed.
for drift in absent symlink mode; do
  path=ops/deploy/social-monitor-production-deploy.sh
  GIT_INDEX_FILE=$index production_forward_git read-tree "$TARGET"
  if [[ $drift == absent ]]; then
    GIT_INDEX_FILE=$index production_forward_git update-index --force-remove "$path"
  else
    entry_mode=120000
    [[ $drift != mode ]] || entry_mode=100755
    blob=$(production_forward_git rev-parse "$TARGET:$path")
    GIT_INDEX_FILE=$index production_forward_git update-index --cacheinfo "$entry_mode,$blob,$path"
  fi
  tree=$(GIT_INDEX_FILE=$index production_forward_git write-tree --missing-ok)
  bad_target=$(production_forward_git commit-tree "$tree" -p "$TARGET" -m "test: $drift")
  if production_forward_validate_recovery "$bad_target"; then fail "controller drift admitted: $drift"; fi
done
# Parent count and exact two-path delta checks are independent of byte compatibility.
for drift in parent merge delta; do
  tree=$(production_forward_git rev-parse "$C^{tree}")
  parents=(-p "$MARKER")
  case $drift in
    parent) parents=(-p "$BRIDGE") ;;
    merge) parents+=(-p "$BRIDGE") ;;
    delta) tree=$(production_forward_git rev-parse "$TARGET^{tree}") ;;
  esac
  bad_bridge=$(production_forward_git commit-tree "$tree" "${parents[@]}" -m "test: $drift")
  bad_target=$(production_forward_git commit-tree "$TARGET^{tree}" -p "$TARGET" -p "$bad_bridge" -m 'test: retain invalid bridge')
  if (PRODUCTION_FORWARD_RECOVERY_BRIDGE=$bad_bridge; production_forward_validate_recovery "$bad_target"); then
    fail "invalid recovery structure admitted: $drift"
  fi
done
# A byte-compatible target without C ancestry is still unauthorized.
if production_forward_validate_recovery 421a4898f4c4245ec8abdf0dafa6d18e31f8684d; then
  fail 'recovery without retained ancestor admitted'
fi
# Exact original B, C and target no-op states remain legitimate; repair never does.
PLAN_BACKEND_BASE=$PRODUCTION_FORWARD_BACKEND_SHA PLAN_POSTGRES_POOL_BOOTSTRAP_SHA=$BRIDGE
production_forward_plan_is_fully_reconciled "$BRIDGE"
PLAN_BACKEND_BASE=$BRIDGE PLAN_POSTGRES_POOL_BOOTSTRAP_SHA=$C
if production_forward_plan_is_fully_reconciled "$C"; then fail 'mixed C backend reconciled'; fi
PLAN_BACKEND_BASE=$MARKER PLAN_POSTGRES_POOL_BOOTSTRAP_SHA=$C
production_forward_plan_is_fully_reconciled "$C"
PLAN_BACKEND_BASE=$TARGET PLAN_POSTGRES_POOL_BOOTSTRAP_SHA=$TARGET
production_forward_plan_is_fully_reconciled "$TARGET"
PLAN_POSTGRES_POOL_REPAIR=true
if production_forward_plan_is_fully_reconciled "$TARGET"; then fail 'repair reconciled'; fi
printf 'Fixed: exact control-only deploy once, disconnect reconciliation, durable retry and host compatibility.\n'
