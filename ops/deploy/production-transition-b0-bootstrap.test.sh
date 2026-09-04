#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/bin:/usr/bin:/bin
LC_ALL=C
export PATH LC_ALL

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
python3 -B "$SCRIPT_DIR/b0-controller-repair.test.py"
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/production-transition-b0-bootstrap.XXXXXX")
trap '/usr/bin/find "$FIXTURE" -depth -delete' EXIT
REPO=$FIXTURE/repo
ORIGIN=$FIXTURE/origin.git
CONTROL=$FIXTURE/control
export REPO CONTROL SOCIAL_MONITOR_DEPLOY_TEST_MODE=1

fail() { printf 'b0-bootstrap-test-error: %s\n' "$*" >&2; exit 1; }

git init --bare -q "$ORIGIN"
git init -q -b main "$REPO"
git -C "$REPO" config user.name 'B0 Bootstrap Test'
git -C "$REPO" config user.email b0-bootstrap@example.invalid
git -C "$REPO" remote add origin "$ORIGIN"
install -d "$REPO/ops/deploy" "$CONTROL"
printf 'historical control without transition bootstrap\n' > "$REPO/README"
git -C "$REPO" add README
git -C "$REPO" commit -qm 'test: historical deploy target'
HISTORICAL=$(git -C "$REPO" rev-parse HEAD)
printf '#!/usr/bin/env bash\nexit 70\n' \
  > "$REPO/ops/deploy/production-transition-admission.sh"
printf '# frozen source-only B0 host control\n' \
  > "$REPO/ops/deploy/production-transition-b0-host-control.sh"
printf '# frozen canonical verifier\n' \
  > "$REPO/ops/deploy/production-transition-canonical-lib.sh"
chmod 0755 "$REPO/ops/deploy/production-transition-admission.sh"
chmod 0644 "$REPO/ops/deploy"/{production-transition-b0-host-control.sh,production-transition-canonical-lib.sh}
git -C "$REPO" add ops/deploy
git -C "$REPO" commit -qm 'test: frozen B0 controls'
B0=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" push -q -u origin main

# shellcheck source=ops/deploy/deploy-control-bridge-lib.sh
source "$SCRIPT_DIR/deploy-control-bridge-lib.sh"
action=deploy

# Historical repair targets pre-dating the transition controls retain the
# exact current-main deployment behavior.
deploy_control_bootstrap_production_transition_b0 "$HISTORICAL"
[[ -z $(find "$CONTROL" -mindepth 1 -maxdepth 1 -print -quit) ]]

# A crash after staging one source-only library is resumed without trusting
# or rewriting any unrelated installed path.
install -m 0644 "$REPO/ops/deploy/production-transition-canonical-lib.sh" \
  "$CONTROL/production-transition-canonical-lib.sh.next"
deploy_control_bootstrap_production_transition_b0 "$B0"
[[ $(stat -c '%a' "$CONTROL/production-transition-admission.sh") == 755 ]]
[[ $(stat -c '%a' "$CONTROL/production-transition-b0-host-control.sh") == 644 ]]
[[ $(stat -c '%a' "$CONTROL/production-transition-canonical-lib.sh") == 644 ]]
for relative in production-transition-admission.sh \
  production-transition-b0-host-control.sh \
  production-transition-canonical-lib.sh; do
  [[ $(git -C "$REPO" hash-object --no-filters "$CONTROL/$relative") == \
     $(git -C "$REPO" rev-parse "$B0:ops/deploy/$relative") ]]
done

# An exact retry is a no-op, while a conflicting installed blob fails closed.
before=$(stat -c '%d:%i:%f:%s:%Y:%Z' "$CONTROL/production-transition-canonical-lib.sh")
deploy_control_bootstrap_production_transition_b0 "$B0"
[[ $(stat -c '%d:%i:%f:%s:%Y:%Z' "$CONTROL/production-transition-canonical-lib.sh") == "$before" ]]
printf 'tampered\n' > "$CONTROL/production-transition-canonical-lib.sh"
if (deploy_control_bootstrap_production_transition_b0 "$B0") 2>/dev/null; then
  fail 'conflicting installed canonical library was accepted'
fi
install -m 0644 "$REPO/ops/deploy/production-transition-canonical-lib.sh" \
  "$CONTROL/production-transition-canonical-lib.sh"

# Missing controls can only bootstrap the exact observed protected-main SHA.
rm -f "$CONTROL/production-transition-b0-host-control.sh"
printf 'later main\n' > "$REPO/later.txt"
git -C "$REPO" add later.txt
git -C "$REPO" commit -qm 'test: later protected main'
git -C "$REPO" push -q origin main
if (deploy_control_bootstrap_production_transition_b0 "$B0") 2>/dev/null; then
  fail 'stale protected-main B0 bootstrap was accepted'
fi
action=deploy-transition
deploy_control_bootstrap_production_transition_b0 "$B0"
[[ ! -e $CONTROL/production-transition-b0-host-control.sh ]]

# The current-main deploy state machine invokes bootstrap only after the exact
# target checkout, only when B0 is not already loaded, and before its legacy
# sync function can install the entrypoint.
control_library=$SCRIPT_DIR/deploy-control-lib.sh
advance_line=$(grep -nF 'advance_integration "$sha"' "$control_library" | tail -1 | cut -d: -f1)
loaded_guard_line=$(grep -nF \
  'if ! declare -F production_transition_host_failpoint >/dev/null; then' \
  "$control_library" | tail -1 | cut -d: -f1)
bootstrap_line=$(grep -nF 'deploy_control_bootstrap_production_transition_b0 "$sha"' \
  "$control_library" | tail -1 | cut -d: -f1)
sync_line=$(grep -nF 'sync_control_script "$sha"' "$control_library" | tail -1 | cut -d: -f1)
((advance_line < loaded_guard_line && loaded_guard_line < bootstrap_line && \
  bootstrap_line < sync_line))

# Exercise the actual release function, not an extracted copy of its guard.
# All external effects stay inside this disposable Git repository. The fake
# installer reproduces the frozen function collision seen on the live host.
exercise_release_bootstrap() (
  local authority_loaded=$1 predecessor=${2:-false} target current_root fixed_release
  target=$(git -C "$REPO" rev-parse HEAD)
  current_root=$(cd "$SCRIPT_DIR/../.." && pwd)
  STATE=$FIXTURE/release-$authority_loaded-$predecessor
  STAGING=$STATE/staging RELEASES=$STATE/releases
  DEPLOY_LOCK=$STATE/deploy.lock POSTGRES_ADMISSION_LOCK=$STATE/postgres.lock
  install -d "$STATE"
  local events=$STATE/events authority=$STATE/authority.sh
  local -a FRONTEND_PATHS=() BACKEND_PATHS=() CONTROL_PATHS=() RUNTIME_CONTROL_PATHS=()
  printf 'production_transition_host_failpoint() { :; }\n' > "$authority"
  : > "$events"
  action=deploy
  # shellcheck source=ops/deploy/deploy-control-lib.sh
  source "$control_library"
  fixed_release=$(declare -f deploy_release)
  if [[ $predecessor == true ]]; then
    # Exact controller loaded by the installed prelude before this fix.
    # shellcheck source=/dev/null
    source <(git -C "$current_root" show \
      8c402ecadff1db34a9d5991b777a5eb8032282de:ops/deploy/deploy-control-lib.sh)
  fi
  postgres_pool_atomic_legacy_state() { return 1; }
  load_deploy_control_bridge_library() { :; }
  acquire_postgres_admission_with_daily_priority() { :; }
  fetch_main() { :; }
  validate_main_commit() { [[ $1 == "$target" ]]; }
  postgres_pool_bootstrap_installed() { return 0; }
  reconcile_completed_backend_image_rescues() { :; }
  component_changed() { return 1; }
  reconcile_github_premidnight_capture_runtime_control() { printf 'false\n'; }
  advance_integration() {
    git -C "$REPO" merge --ff-only -q "$1"
    printf 'advanced\n' >> "$events"
  }
  production_forward_install_b0_before_entrypoint() {
    printf 'bootstrap\n' >> "$events"
    # shellcheck source=/dev/null
    source "$authority"
  }
  sync_control_script() { printf 'sync\n' >> "$events"; }
  deploy_release_runtime_transaction() { printf 'runtime\n' >> "$events"; }
  commit_postgres_pool_bootstrap() { printf 'committed\n' >> "$events"; }
  if [[ $authority_loaded == true ]]; then
    # shellcheck source=/dev/null
    source "$authority"
    readonly -f production_transition_host_failpoint
  fi
  git -C "$REPO" checkout -q --detach "$B0"
  if [[ $predecessor == true ]]; then
    local status=0
    # Keep errexit enabled within the child, so failure cannot reach runtime.
    bash -euo pipefail -c "$(declare -f); $(declare -p REPO STATE STAGING RELEASES \
      DEPLOY_LOCK POSTGRES_ADMISSION_LOCK FRONTEND_PATHS BACKEND_PATHS \
      CONTROL_PATHS RUNTIME_CONTROL_PATHS target events authority action); \
      readonly -f production_transition_host_failpoint; deploy_release \"\$target\"" \
      > "$STATE/predecessor.log" 2>&1 || status=$?
    ((status != 0)) || fail 'predecessor did not reproduce the readonly failure'
    grep -F 'readonly function' "$STATE/predecessor.log" >/dev/null
    [[ $(<"$events") == $'advanced\nbootstrap' ]] || \
      fail 'predecessor mutated runtime after its bootstrap failure'
    [[ $(git -C "$REPO" rev-parse HEAD) == "$target" ]] || \
      fail 'predecessor did not durably advance to the fixed controller'
    : > "$events"
    eval "$fixed_release"
  fi
  deploy_release "$target" > "$STATE/release.log"
  local expected=$'advanced\nsync\nruntime\ncommitted'
  if [[ $authority_loaded == false ]]; then
    expected=$'advanced\nbootstrap\nsync\nruntime\ncommitted'
  fi
  [[ $(<"$events") == "$expected" ]] || fail 'release bootstrap ordering differs'
  declare -F production_transition_host_failpoint >/dev/null || \
    fail 'release lost its B0 authority'
)
exercise_release_bootstrap false
exercise_release_bootstrap true
exercise_release_bootstrap true true

printf 'production transition current-main B0 bootstrap test passed\n'
