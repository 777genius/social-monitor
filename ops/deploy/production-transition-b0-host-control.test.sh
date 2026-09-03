#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
grep -Fx 'LC_ALL=C' "$SCRIPT_DIR/production-transition-b0-host-control.sh" >/dev/null
grep -Fx 'export LC_ALL' "$SCRIPT_DIR/production-transition-b0-host-control.sh" >/dev/null
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/production-transition-b0-host.XXXXXX")
trap '/usr/bin/find "$FIXTURE" -depth -delete' EXIT
REPO=$FIXTURE/repo
ORIGIN=$FIXTURE/origin.git
ROOT=$FIXTURE/root
CONTROL=$ROOT/control
STATE=$CONTROL/deploy-state
EVENT_LOG=$FIXTURE/events.log
ADMISSION_LOG=$FIXTURE/admission.log
SENTINEL=$FIXTURE/candidate-code-ran
export REPO CONTROL STATE EVENT_LOG ADMISSION_LOG SENTINEL
export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 PRODUCTION_FORWARD_TEST_ALLOW_LOCAL_ORIGIN=1

git init --bare -q "$ORIGIN"
git init -q -b main "$REPO"
git -C "$REPO" config core.hooksPath /dev/null
git -C "$REPO" config user.name 'B0 Host Control Test'
git -C "$REPO" config user.email b0-host-control@example.invalid
git -C "$REPO" remote add origin "$ORIGIN"
install -d "$REPO/ops/deploy" "$CONTROL" "$STATE"
install -d "$REPO/.github/workflows"
printf 'test A0\n' > "$REPO/README.md"
git -C "$REPO" add README.md
git -C "$REPO" commit -qm 'test: anchor-only A0'
A0=$(git -C "$REPO" rev-parse HEAD)
export SOCIAL_MONITOR_DEPLOY_TEST_A0=$A0
cp "$SCRIPT_DIR/social-monitor-production-deploy.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/social-monitor-production-ssh-wrapper.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/production-transition-b0-host-control.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/social-monitor-production-deploy.test.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/social-monitor-production-ssh-wrapper.test.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/production-transition-b0-host-control.test.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/production-transition-protected.manifest" "$REPO/ops/deploy/"
chmod 0644 "$REPO/ops/deploy/production-transition-b0-host-control.sh"
chmod 0755 "$REPO/ops/deploy"/{production-transition-b0-host-control.test.sh,social-monitor-production-deploy.test.sh,social-monitor-production-ssh-wrapper.test.sh}
while IFS= read -r protected_spec; do
  protected_mode=${protected_spec%%:*}
  protected=${protected_spec#*:}
  [[ $protected == ops/deploy/production-transition-protected.manifest ]] && continue
  if [[ ! -e $REPO/$protected ]]; then
    mkdir -p "$(dirname "$REPO/$protected")"
    printf 'sealed B0 trust path: %s\n' "$protected" > "$REPO/$protected"
  fi
  chmod "${protected_mode#10}" "$REPO/$protected"
done < <(tail -n +2 "$REPO/ops/deploy/production-transition-protected.manifest")

cat > "$REPO/ops/deploy/production-transition-admission.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ $# == 3 && $1 == verify && $2 == --target ]]
target=$3
base=$(git -C "$REPO" rev-parse "$target^1")
printf '%s\n' "$*" >> "$ADMISSION_LOG"
kind=$(git -C "$REPO" show "$target:transition-kind")
critical=(
  ops/deploy/social-monitor-production-deploy.sh
  ops/deploy/social-monitor-production-ssh-wrapper.sh
  ops/deploy/production-transition-admission.sh
  ops/deploy/production-transition-b0-host-control.sh
)
git -C "$REPO" diff --quiet "$base" "$target" -- "${critical[@]}" || {
  printf 'production-transition-admission-error: B0 critical path changed\n' >&2
  exit 71
}
[[ $kind != s2 ]] || {
  printf 'production-transition-admission-error: direct S2 rejected\n' >&2
  exit 72
}
if [[ $kind == mutate ]]; then
  git -C "$REPO" update-ref refs/remotes/origin/main "$base"
fi
[[ $kind == signed || $kind == mutate ]] || exit 73
printf 'production-transition-admission-ok trusted-base=%s target=%s repository=777genius/social-monitor s2=%s p6=%s review-id=%064d\n' \
  "$base" "$target" "$base" "$target" 0
SH
chmod 0755 "$REPO/ops/deploy/production-transition-admission.sh"
git -C "$REPO" add .github/workflows ops/deploy
git -C "$REPO" commit -qm 'test: trusted executable B0'
B0=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" push -q -u origin main

install_b0_controls() {
  git -C "$REPO" show "$B0:ops/deploy/social-monitor-production-deploy.sh" \
    > "$CONTROL/github-production-deploy.sh"
  git -C "$REPO" show "$B0:ops/deploy/social-monitor-production-ssh-wrapper.sh" \
    > "$CONTROL/github-production-deploy-wrapper.sh"
  git -C "$REPO" show "$B0:ops/deploy/production-transition-admission.sh" \
    > "$CONTROL/production-transition-admission.sh"
  git -C "$REPO" show "$B0:ops/deploy/production-transition-b0-host-control.sh" \
    > "$CONTROL/production-transition-b0-host-control.sh"
  git -C "$REPO" show "$B0:ops/deploy/production-transition-canonical-lib.sh" \
    > "$CONTROL/production-transition-canonical-lib.sh"
  chmod 0755 "$CONTROL"/{github-production-deploy.sh,github-production-deploy-wrapper.sh,production-transition-admission.sh}
  chmod 0644 "$CONTROL"/{production-transition-b0-host-control.sh,production-transition-canonical-lib.sh}
}
install_b0_controls
printf '%s\n' "$B0" > "$STATE/control.sha"
chmod 0600 "$STATE/control.sha"

create_candidate() {
  local kind=$1 mode=${2:-preserved}
  git -C "$REPO" checkout -q --detach "$B0"
  printf '%s\n' "$kind" > "$REPO/transition-kind"
  printf 'product-%s\n' "$kind" > "$REPO/product-change.txt"
  if [[ $mode == malicious ]]; then
    cat > "$REPO/ops/deploy/social-monitor-production-deploy.sh" <<'SH'
#!/usr/bin/env bash
touch "$SENTINEL"
exit 0
SH
    cat > "$REPO/ops/deploy/production-transition-admission.sh" <<'SH'
#!/usr/bin/env bash
touch "$SENTINEL"
exit 0
SH
    chmod 0755 "$REPO/ops/deploy/production-transition-admission.sh"
  elif [[ $mode == protected-change ]]; then
    printf 'candidate trust replacement\n' \
      > "$REPO/ops/deploy/github-production-transition-client-lib.sh"
  fi
  git -C "$REPO" add transition-kind product-change.txt ops/deploy
  git -C "$REPO" commit -qm "test: $kind candidate"
  git -C "$REPO" push -q origin HEAD:"refs/heads/candidate-$kind-${mode}"
  git -C "$REPO" rev-parse HEAD
}

SIGNED=$(create_candidate signed)
S2=$(create_candidate s2)
MALICIOUS=$(create_candidate malicious malicious)
MUTATING=$(create_candidate mutate)
PROTECTED_CHANGE=$(create_candidate protected protected-change)

fail() {
  printf 'deploy-error: %s\n' "$*" >&2
  exit 1
}
validate_sha() {
  [[ ${1:-} =~ ^[0-9a-f]{40}$ ]] || fail 'commit must be a full lowercase SHA'
}
fetch_main() {
  git -C "$REPO" fetch -q origin main
}
validate_main_commit() {
  validate_sha "$1"
  git -C "$REPO" cat-file -e "$1^{commit}" 2>/dev/null || fail 'commit unavailable'
  git -C "$REPO" merge-base --is-ancestor "$1" origin/main || fail 'commit not on main'
}
verify_deploy_control_bridge_target_compatibility() {
  printf 'legacy-target-compatibility:%s\n' "$1" >> "$EVENT_LOG"
  return 88
}
verify_deploy_control_bridge_compatibility() {
  printf 'legacy-runtime-compatibility\n' >> "$EVENT_LOG"
  return 89
}
run_reader_summary_daily_scan_terminal_repair_c1_from_stdin() { :; }
run_reader_summary_production_history_from_stdin() { :; }
run_reader_summary_daily_delivery_c1() { :; }
run_reader_summary_daily_delivery_c1_containment() { :; }
DEPLOY_MODE=success
deploy_release() {
  local target=$1
  printf 'deploy-release:%s:%s\n' "$DEPLOY_MODE" "$target" >> "$EVENT_LOG"
  verify_deploy_control_bridge_target_compatibility "$target"
  if [[ $DEPLOY_MODE == disconnect ]]; then
    return 143
  fi
  git -C "$REPO" checkout -q --detach "$target"
  verify_deploy_control_bridge_compatibility
  printf '%s\n' "$target" > "$STATE/control.sha.next"
  mv -T "$STATE/control.sha.next" "$STATE/control.sha"
}
SCHEDULER_HOLD=$STATE/production-transition-scheduler-hold.v2
production_transition_deploy_embedded_target() {
  printf 'held=%s\n' "$1" > "$SCHEDULER_HOLD"
  deploy_release "$1"
}
FINALIZED_MARKER=$STATE/finalized-target
production_transition_finalize_embedded_scheduler_hold() {
  production_transition_require_host_terminal_receipt "$1"
  if [[ ! -e $FINALIZED_MARKER ]]; then
    [[ -f $SCHEDULER_HOLD && ! -L $SCHEDULER_HOLD ]] || \
      fail 'scheduler hold fixture is missing before finalization'
    rm -f "$SCHEDULER_HOLD"
    printf '%s\n' "$1" > "$FINALIZED_MARKER"
    printf 'scheduler-finalized:%s\n' "$1" >> "$EVENT_LOG"
  fi
}

# shellcheck source=ops/deploy/production-transition-b0-host-control.sh
source "$SCRIPT_DIR/production-transition-b0-host-control.sh"
production_transition_install_compatibility_overrides
HOST_CRASH_PHASE=
production_transition_host_failpoint() {
  [[ -z $HOST_CRASH_PHASE || $1 != "$HOST_CRASH_PHASE" ]] || exit 96
}

clear_host_state() {
  if [[ -n ${PRODUCTION_TRANSITION_HOST_LOCK_FD:-} ]]; then
    eval "exec ${PRODUCTION_TRANSITION_HOST_LOCK_FD}>&-"
    unset PRODUCTION_TRANSITION_HOST_LOCK_FD
    unset PRODUCTION_TRANSITION_HOST_LOCK_OWNER
    unset PRODUCTION_TRANSITION_HOST_LOCK_CUSTODY
  fi
  /usr/bin/find "$STATE" -maxdepth 1 -type f \
    \( -name "$PRODUCTION_TRANSITION_HOST_STATE_FILE" -o \
       -name "$PRODUCTION_TRANSITION_HOST_STATE_FILE.next" -o \
       -name finalized-target -o \
       -name "$PRODUCTION_TRANSITION_HOST_SCHEDULER_HOLD_FILE" -o \
       -name "$PRODUCTION_TRANSITION_HOST_SCHEDULER_HOLD_FILE.next" \) -delete
  git -C "$REPO" checkout -q --detach "$B0"
  printf '%s\n' "$B0" > "$STATE/control.sha"
  chmod 0600 "$STATE/control.sha"
  install_b0_controls
  unset PRODUCTION_TRANSITION_AUTHENTICATED_BASE PRODUCTION_TRANSITION_AUTHENTICATED_TARGET
  DEPLOY_MODE=success
  : > "$EVENT_LOG"
  : > "$ADMISSION_LOG"
}
ensure_test_host_lock() {
  [[ -n ${PRODUCTION_TRANSITION_HOST_LOCK_FD:-} ]] || \
    production_transition_host_acquire_lock
}
test_deploy_authenticated_target() {
  ensure_test_host_lock
  production_transition_deploy_authenticated_target "$@"
}
test_require_action_allowed() {
  ensure_test_host_lock
  production_transition_host_require_action_allowed "$@"
}
test_require_ordinary_deploy() {
  ensure_test_host_lock
  production_transition_host_require_ordinary_deploy "$@"
}
publish_candidate() {
  git --git-dir="$ORIGIN" update-ref refs/heads/main "$1"
  git -C "$REPO" update-ref refs/remotes/origin/main "$1"
}
expect_transition_failure() {
  local target=$1 pattern=$2
  if (test_deploy_authenticated_target "$target") \
      > "$FIXTURE/failure.out" 2> "$FIXTURE/failure.err"; then
    echo "transition unexpectedly accepted $target" >&2
    exit 1
  fi
  [[ -z $pattern ]] && return 0
  grep -F "$pattern" "$FIXTURE/failure.err" >/dev/null || {
    cat "$FIXTURE/failure.err" >&2
    exit 1
  }
}

expect_guard_failure() {
  local pattern=$1 output
  shift
  if output=$("$@" 2>&1); then
    fail 'incomplete terminal scheduler hold unexpectedly admitted another mutation'
  fi
  [[ -z $pattern ]] || grep -F "$pattern" <<< "$output" >/dev/null
}

# Direct ordinary S2/T paths are rejected before any candidate code is reached.
clear_host_state
publish_candidate "$S2"
expect_transition_failure "$S2" 'trusted transition admission rejected target'
[[ ! -e $SENTINEL && ! -s $EVENT_LOG ]]
for direct_target in "$S2" "$SIGNED"; do
  if (test_require_ordinary_deploy "$direct_target") \
      2> "$FIXTURE/ordinary.err"; then
    echo "ordinary direct deploy was accepted: $direct_target" >&2
    exit 1
  fi
  grep -F 'first post-B0 release requires deploy-transition' \
    "$FIXTURE/ordinary.err" >/dev/null
done

# Candidate replacements of deploy/admission with exit 0 remain inert Git data.
clear_host_state
publish_candidate "$MALICIOUS"
expect_transition_failure "$MALICIOUS" 'protected B0 trust blob changed or is missing'
[[ ! -e $SENTINEL && ! -s $EVENT_LOG ]]
[[ ! -s $ADMISSION_LOG ]]

# The sealed, explicit protected trust manifest is immutable across B0 -> T.
clear_host_state
publish_candidate "$PROTECTED_CHANGE"
expect_transition_failure "$PROTECTED_CHANGE" \
  'protected B0 trust blob changed or is missing: ops/deploy/github-production-transition-client-lib.sh'
[[ ! -s $ADMISSION_LOG && ! -s $EVENT_LOG ]]

# B0 is marker-derived, A0-descended, and every installed control blob is sealed.
clear_host_state
publish_candidate "$SIGNED"
printf '%s\n' "$A0" > "$STATE/control.sha"
expect_transition_failure "$SIGNED" 'current integration is neither trusted B0 nor resumable T'
[[ ! -s $ADMISSION_LOG && ! -s $EVENT_LOG ]]
clear_host_state
publish_candidate "$SIGNED"
git -C "$REPO" checkout -q --orphan unrelated-base
printf 'unrelated\n' > "$REPO/unrelated"
git -C "$REPO" add unrelated
git -C "$REPO" commit -qm 'test: unrelated base'
UNRELATED=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" checkout -q --detach "$B0"
printf '%s\n' "$UNRELATED" > "$STATE/control.sha"
expect_transition_failure "$SIGNED" 'trusted B0 does not descend from pinned A0'
[[ ! -s $ADMISSION_LOG && ! -s $EVENT_LOG ]]
clear_host_state
publish_candidate "$SIGNED"
for installed_seal in \
  'github-production-deploy.sh:installed deploy entrypoint differs from trusted B0' \
  'github-production-deploy-wrapper.sh:installed SSH wrapper differs from trusted B0' \
  'production-transition-admission.sh:installed transition admission differs from trusted B0' \
  'production-transition-b0-host-control.sh:installed B0 host control differs from trusted B0' \
  'production-transition-canonical-lib.sh:installed canonical library differs from trusted B0'; do
  clear_host_state
  publish_candidate "$SIGNED"
  installed_path=${installed_seal%%:*}
  installed_failure=${installed_seal#*:}
  printf '# tampered\n' >> "$CONTROL/$installed_path"
  expect_transition_failure "$SIGNED" "$installed_failure"
  [[ ! -s $ADMISSION_LOG && ! -s $EVENT_LOG ]]
done

# A ref mutation after admission is detected before durable admission or deploy.
clear_host_state
publish_candidate "$MUTATING"
expect_transition_failure "$MUTATING" 'production prelude target is not exact live origin main'
[[ ! -s $EVENT_LOG && ! -e $(production_transition_host_state_path) ]]

# Disconnect after durable admission leaves an active hold. The exact target
# resumes, while all other production mutations remain held.
clear_host_state
publish_candidate "$SIGNED"
DEPLOY_MODE=disconnect
expect_transition_failure "$SIGNED" ''
record=$(production_transition_host_read_state)
[[ $(production_transition_host_parse_state "$record") == \
   "admitted $B0 $SIGNED $(git -C "$REPO" rev-parse "$SIGNED^{tree}")" ]]
[[ $(wc -l < "$ADMISSION_LOG") == 1 ]]
expect_transition_failure "$S2" 'transition host resume target conflicts with admitted target'
if (test_require_action_allowed reader-summary-weekly-run) \
    2> "$FIXTURE/hold.err"; then
  echo 'active transition hold allowed another mutation' >&2
  exit 1
fi
grep -F 'held by an incomplete authenticated transition' "$FIXTURE/hold.err" >/dev/null
DEPLOY_MODE=success
test_deploy_authenticated_target "$SIGNED" >/dev/null
[[ $(wc -l < "$ADMISSION_LOG") == 2 ]]
[[ $(grep -c '^deploy-release:success:' "$EVENT_LOG") == 1 ]]

# Both host state promotions reconcile after process loss. Admission staging
# resumes the same target; terminal staging reports the already-completed
# target once without replaying deployment.
clear_host_state
publish_candidate "$SIGNED"
HOST_CRASH_PHASE=admitted-staged
expect_transition_failure "$SIGNED" ''
HOST_CRASH_PHASE=
test_deploy_authenticated_target "$SIGNED" >/dev/null
[[ $(grep -c '^deploy-release:success:' "$EVENT_LOG") == 1 ]]
clear_host_state
publish_candidate "$SIGNED"
HOST_CRASH_PHASE=terminal-staged
expect_transition_failure "$SIGNED" ''
HOST_CRASH_PHASE=
test_deploy_authenticated_target "$SIGNED" >/dev/null
[[ $(grep -c '^deploy-release:success:' "$EVENT_LOG") == 1 ]]
test_deploy_authenticated_target "$SIGNED" >/dev/null
[[ $(grep -c '^deploy-release:success:' "$EVENT_LOG") == 1 ]]

# A crash after the durable terminal receipt but before scheduler finalization
# resumes the same target without replaying admission or deployment.
clear_host_state
publish_candidate "$SIGNED"
HOST_CRASH_PHASE=terminal-after-marker
expect_transition_failure "$SIGNED" ''
HOST_CRASH_PHASE=
expect_guard_failure 'exact deploy-transition replay finalizes the scheduler hold' \
  test_require_action_allowed reader-summary-production-history
expect_guard_failure 'exact deploy-transition replay finalizes the scheduler hold' \
  test_require_ordinary_deploy "$SIGNED"
test_deploy_authenticated_target "$SIGNED" >/dev/null
[[ $(grep -c '^deploy-release:success:' "$EVENT_LOG") == 1 ]]
[[ $(grep -c '^scheduler-finalized:' "$EVENT_LOG") == 1 ]]
test_require_action_allowed reader-summary-production-history
test_require_ordinary_deploy "$SIGNED"

# Exact signed target is admitted once, deploys once, commits terminal state,
# and a replay never reaches admission or deployment again.
clear_host_state
publish_candidate "$SIGNED"
output=$(test_deploy_authenticated_target "$SIGNED")
grep -Fx "production-transition-deployed trusted-base=$B0 target=$SIGNED repository=777genius/social-monitor" \
  <<< "$output" >/dev/null
[[ $(cat "$STATE/control.sha") == "$SIGNED" ]]
[[ $(production_transition_host_parse_state "$(production_transition_host_read_state)") == \
   "terminal $B0 $SIGNED $(git -C "$REPO" rev-parse "$SIGNED^{tree}")" ]]
[[ $(grep -c '^deploy-release:success:' "$EVENT_LOG") == 1 ]]
[[ ! -e $SENTINEL ]]
grep -Fx "verify --target $SIGNED" \
  "$ADMISSION_LOG" >/dev/null
test_deploy_authenticated_target "$SIGNED" >/dev/null
[[ $(grep -c '^deploy-release:success:' "$EVENT_LOG") == 1 ]]
[[ $(wc -l < "$ADMISSION_LOG") == 1 ]]

# Terminal host state does not bypass an orphan scheduler staging record.
printf 'orphan scheduler hold\n' > "$SCHEDULER_HOLD.next"
chmod 0600 "$SCHEDULER_HOLD.next"
production_transition_host_release_lock
expect_guard_failure 'exact deploy-transition replay finalizes the scheduler hold' \
  test_require_action_allowed reader-summary-production-history
expect_guard_failure 'exact deploy-transition replay finalizes the scheduler hold' \
  test_require_ordinary_deploy "$SIGNED"
rm -f "$SCHEDULER_HOLD.next"
test_require_action_allowed reader-summary-production-history
test_require_ordinary_deploy "$SIGNED"

# Concurrent duplicates serialize on the same host lock. Exactly one request
# admits and activates; the other observes terminal state and cannot replay.
clear_host_state
publish_candidate "$SIGNED"
set +e
(test_deploy_authenticated_target "$SIGNED") \
  > "$FIXTURE/duplicate-a.out" 2> "$FIXTURE/duplicate-a.err" &
duplicate_a_pid=$!
(test_deploy_authenticated_target "$SIGNED") \
  > "$FIXTURE/duplicate-b.out" 2> "$FIXTURE/duplicate-b.err" &
duplicate_b_pid=$!
wait "$duplicate_a_pid"; duplicate_a_status=$?
wait "$duplicate_b_pid"; duplicate_b_status=$?
set -e
[[ "$duplicate_a_status $duplicate_b_status" == '0 0' ]]
[[ $(wc -l < "$ADMISSION_LOG") == 1 ]]
[[ $(grep -c '^deploy-release:success:' "$EVENT_LOG") == 1 ]]
[[ $(production_transition_host_parse_state \
  "$(production_transition_host_read_state)") == \
  "terminal $B0 $SIGNED $(git -C "$REPO" rev-parse "$SIGNED^{tree}")" ]]

echo 'Production B0 direct signed-transition host tests passed'
