#!/usr/bin/env bash
# Sourced by consumed-worktree-janitor.test.sh; its mktemp suite root has an EXIT trap.

add_volume2_worktree() {
  local root=$1 job=$2 kind=${3:-direct} target
  case $kind in
    direct) target=$root/worktrees/.volume2/$job ;;
    nested) target=$root/worktrees/.volume2/$job/worktree ;;
    *) fail "unknown volume2 fixture kind: $kind" ;;
  esac
  add_worktree "$root" "$job" "$target" >/dev/null
  printf '%s\n' "$target"
}

volume2_plan_sha() {
  local output=$1 line
  while IFS= read -r line; do
    if [[ $line == volume2-plan\ schemaVersion=1\ sha256=* ]]; then
      line=${line#*sha256=}; printf '%s\n' "${line%% *}"; return 0
    fi
  done <<<"$output"
  return 1
}

assert_volume2_rejected() {
  local root=$1 target=$2 plan=$3 label=${4:-${root##*/}}
  if run_janitor "$root" --apply-volume2 --expected-plan-sha256 "$plan" \
    >"$root/volume2-rejected.out" 2>"$root/volume2-rejected.err"; then
    fail "unsafe volume2 fixture unexpectedly applied: $label"
  fi
  [[ -d $target ]] || fail "rejected volume2 fixture removed its target: $label"
}

wait_volume2_checkpoint() {
  local checkpoint=$1
  for _ in {1..1000}; do [[ -f $checkpoint ]] && return 0; sleep 0.01; done
  fail "volume2 race did not reach checkpoint: $checkpoint"
}

root=$(new_fixture volume2-dedicated-dry-run)
direct_job=social-monitor-volume2-dedicated-direct
direct_target=$(add_volume2_worktree "$root" "$direct_job" direct)
write_ledger "$root" "$direct_job" attempt-1 "$direct_target" rejected
nested_job=social-monitor-volume2-dedicated-nested
nested_target=$(add_volume2_worktree "$root" "$nested_job" nested)
write_ledger "$root" "$nested_job" attempt-1 "$nested_target" rejected
ordinary_job=social-monitor-volume2-dedicated-ordinary
ordinary_target=$(add_worktree "$root" "$ordinary_job")
write_ledger "$root" "$ordinary_job" attempt-1 "$ordinary_target" rejected
output=$(run_janitor "$root" --dry-run-volume2)
plan=$(volume2_plan_sha "$output") || fail 'dedicated volume2 plan digest was not reported'
[[ $plan =~ ^[0-9a-f]{64}$ &&
  $output == *"would-remove ledger=$direct_job--attempt-1 worktree=$direct_target"* &&
  $output == *"would-remove ledger=$nested_job--attempt-1 worktree=$nested_target"* &&
  $output == *"reason=volume2-mode-only ledger=$ordinary_job--attempt-1"* &&
  $output == *'candidates=2'* && -d $direct_target && -d $nested_target && -d $ordinary_target ]] ||
  fail 'dedicated volume2 dry-run scope or plan was incorrect'
if run_janitor "$root" --apply-volume2 >"$root/missing-hash.out" 2>"$root/missing-hash.err"; then
  fail 'volume2 apply accepted a missing expected plan digest'
fi
[[ -d $direct_target && ! -e $root/control/consumed-worktree-janitor-volume2.audit.jsonl ]] ||
  fail 'missing plan digest changed volume2 state'

output=$(run_janitor "$root" --apply)
[[ $output == *"reason=volume2-dry-run-only ledger=$direct_job--attempt-1"* &&
  $output == *"reason=volume2-dry-run-only ledger=$nested_job--attempt-1"* &&
  -d $direct_target && -d $nested_target && ! -e $ordinary_target ]] ||
  fail 'ordinary apply did not preserve both volume2 layouts'

root=$(new_fixture volume2-apply-success)
for kind in direct nested; do
  job=social-monitor-volume2-success-$kind
  target=$(add_volume2_worktree "$root" "$job" "$kind")
  printf '%s\n' "$kind" >"$target/$kind.txt"
  write_ledger "$root" "$job" attempt-1 "$target" rejected
done
output=$(run_janitor "$root" --dry-run-volume2)
plan=$(volume2_plan_sha "$output")
output=$(run_janitor "$root" --apply-volume2 --expected-plan-sha256 "$plan")
[[ $output == *'removed-volume2 ledger=social-monitor-volume2-success-direct--attempt-1 kind=volume2-direct'* &&
  $output == *'removed-volume2 ledger=social-monitor-volume2-success-nested--attempt-1 kind=volume2-nested'* &&
  ! -e $root/worktrees/.volume2/social-monitor-volume2-success-direct &&
  ! -e $root/worktrees/.volume2/social-monitor-volume2-success-nested/worktree ]] ||
  fail 'volume2 apply did not remove both exact targets'
jq -e -s 'length == 4 and
  ([.[] | select(.status == "prepared")] | length) == 2 and
  ([.[] | select(.status == "removed")] | length) == 2 and
  all(.[]; (.targetIdentity | test("^[0-9]+:[0-9]+:[0-9]+:[0-9]+:[0-7]+$")) and
    (.volumeMountIdentity | test("^/[^|]*\\|[0-9]+:[0-9]+:[0-9]+:[0-9]+:[0-7]+\\|[0-9]+:[0-9]+:[0-9]+:[0-9]+:[0-7]+$")) and
    (.gitRegistrationSha256 | test("^[0-9a-f]{64}$")) and
    .beforeBytes > 0 and .targetInodes > 0)' \
  "$root/control/consumed-worktree-janitor-volume2.audit.jsonl" >/dev/null ||
  fail 'volume2 apply receipts did not bind identity and accounting evidence'
output=$(run_janitor "$root" --apply-volume2 --expected-plan-sha256 "$plan")
[[ $output == *'replayed=2'* ]] || fail 'completed volume2 receipts did not replay'
jq -e -s 'length == 4' "$root/control/consumed-worktree-janitor-volume2.audit.jsonl" >/dev/null ||
  fail 'completed volume2 replay duplicated receipts'

root=$(new_fixture volume2-foreign-sibling)
job=social-monitor-volume2-owned-candidate
target=$(add_volume2_worktree "$root" "$job" direct)
write_ledger "$root" "$job" attempt-1 "$target" rejected
foreign_job=social-monitor-volume2-foreign-sibling
foreign_target=$(add_volume2_worktree "$root" "$foreign_job" direct)
operation=$root/worker-jobs/controller/project-control-operations/foreign-op
mkdir -p "$operation"
jq -n --arg workspacePath "$foreign_target" '{status:"running",workspacePath:$workspacePath}' \
  >"$operation/operation.json"
output=$(run_janitor "$root" --dry-run-volume2)
plan=$(volume2_plan_sha "$output")
[[ $output == *"would-remove ledger=$job--attempt-1 worktree=$target"* ]] ||
  fail 'foreign volume2 sibling activity protected the shared parent'
run_janitor "$root" --apply-volume2 --expected-plan-sha256 "$plan" >/dev/null
[[ ! -e $target && -d $foreign_target ]] || fail 'volume2 apply traversed or removed a foreign sibling'

for active_case in activity job tmux process lock; do
  root=$(new_fixture volume2-active-$active_case)
  job=social-monitor-volume2-active-$active_case
  target=$(add_volume2_worktree "$root" "$job" nested)
  write_ledger "$root" "$job" attempt-1 "$target" rejected
  case $active_case in
    activity)
      operation=$root/worker-jobs/controller/project-control-operations/op-1
      mkdir -p "$operation"
      jq -n --arg workspacePath "${target%/*}" '{status:"running",workspacePath:$workspacePath}' \
        >"$operation/operation.json"
      ;;
    job) jq -n '{status:"running",resultStatus:null}' >"$root/worker-jobs/$job/$job.progress.json" ;;
    tmux) printf '%s\n' "$target" >"$root/.social-monitor-janitor-test-tmux-panes" ;;
    process) printf '%s\n' "$target/open-file" >"$root/.social-monitor-janitor-test-process-paths" ;;
    lock) git -C "$root/integration" worktree lock --reason fixture "$target" ;;
  esac
  output=$(run_janitor "$root" --dry-run-volume2)
  [[ $output != *"would-remove ledger=$job--attempt-1"* && -d $target ]] ||
    fail "active volume2 $active_case evidence was not fail-closed"
done

for unsafe_case in target-symlink parent-symlink; do
  root=$(new_fixture volume2-$unsafe_case)
  job=social-monitor-volume2-$unsafe_case
  kind=direct; [[ $unsafe_case != parent-symlink ]] || kind=nested
  target=$(add_volume2_worktree "$root" "$job" "$kind")
  write_ledger "$root" "$job" attempt-1 "$target" rejected
  plan=$(volume2_plan_sha "$(run_janitor "$root" --dry-run-volume2)")
  if [[ $unsafe_case == target-symlink ]]; then
    mv "$target" "$target.real"; ln -s "$target.real" "$target"; preserved=$target.real
  else
    parent=${target%/*}; mv "$parent" "$parent.real"; ln -s "$parent.real" "$parent"
    preserved=$parent.real/worktree
  fi
  assert_volume2_rejected "$root" "$preserved" "$plan" "$unsafe_case"
done

for race_case in mount stat nested-parent; do
  root=$(new_fixture volume2-race-$race_case)
  job=social-monitor-volume2-race-$race_case
  kind=direct; [[ $race_case != nested-parent ]] || kind=nested
  target=$(add_volume2_worktree "$root" "$job" "$kind")
  write_ledger "$root" "$job" attempt-1 "$target" rejected
  plan=$(volume2_plan_sha "$(run_janitor "$root" --dry-run-volume2)")
  SOCIAL_MONITOR_JANITOR_TEST_PAUSE_AT=volume2-before-git-remove \
    run_janitor "$root" --apply-volume2 --expected-plan-sha256 "$plan" \
      >"$root/race.out" 2>"$root/race.err" &
  race_pid=$!; checkpoint=$root/.social-monitor-janitor-checkpoint-volume2-before-git-remove
  wait_volume2_checkpoint "$checkpoint"
  case $race_case in
    mount) changed=$root/worktrees/.volume2 ;;
    stat) changed=$target ;;
    nested-parent) changed=${target%/*} ;;
  esac
  chmod 700 "$changed"; : >"$checkpoint.continue"
  if wait "$race_pid"; then fail "volume2 $race_case identity race unexpectedly applied"; fi
  chmod 755 "$changed"
  [[ -d $target ]] || fail "volume2 $race_case identity race removed its target"
done

root=$(new_fixture volume2-dirty-conflict)
job=social-monitor-volume2-dirty-conflict
target=$(add_volume2_worktree "$root" "$job" direct)
write_ledger "$root" "$job" attempt-1 "$target" rejected
printf 'late dirty state\n' >>"$target/fixture.txt"
output=$(run_janitor "$root" --dry-run-volume2)
[[ $output == *'reason=terminal-evidence-conflict'* && $output != *"would-remove ledger=$job--attempt-1"* ]] ||
  fail 'dirty volume2 target was eligible'

root=$(new_fixture volume2-terminal-evidence-race)
job=social-monitor-volume2-terminal-evidence-race
target=$(add_volume2_worktree "$root" "$job" direct)
write_ledger "$root" "$job" attempt-1 "$target" rejected
plan=$(volume2_plan_sha "$(run_janitor "$root" --dry-run-volume2)")
printf 'tampered evidence\n' >>"$root/worker-jobs/$job/archives/$job-rejected-attempt-1/git-status.txt"
assert_volume2_rejected "$root" "$target" "$plan" terminal-evidence-race
[[ ! -e $root/control/consumed-worktree-janitor-volume2.audit.jsonl ]] ||
  fail 'terminal evidence conflict wrote a prepared receipt'

root=$(new_fixture volume2-legacy-layout)
job=social-monitor-volume2-legacy-layout
target=$(add_worktree "$root" "$job" "$root/worktrees/.volume2/$job/legacy/worktree")
write_ledger "$root" "$job" attempt-1 "$target" rejected
output=$(run_janitor "$root" --dry-run-volume2)
[[ $output != *"would-remove ledger=$job--attempt-1"* && -d $target ]] ||
  fail 'legacy volume2 layout became eligible'

root=$(new_fixture volume2-stale-plan)
job=social-monitor-volume2-stale-plan
target=$(add_volume2_worktree "$root" "$job" direct)
write_ledger "$root" "$job" attempt-1 "$target" rejected
plan=$(volume2_plan_sha "$(run_janitor "$root" --dry-run-volume2)")
git -C "$root/integration" commit --allow-empty -qm 'advance canonical main'
assert_volume2_rejected "$root" "$target" "$plan" stale-plan
[[ ! -e $root/control/consumed-worktree-janitor-volume2.audit.jsonl ]] ||
  fail 'stale volume2 plan wrote a receipt'

root=$(new_fixture volume2-receipt-tamper)
job=social-monitor-volume2-receipt-tamper
target=$(add_volume2_worktree "$root" "$job" direct)
write_ledger "$root" "$job" attempt-1 "$target" rejected
plan=$(volume2_plan_sha "$(run_janitor "$root" --dry-run-volume2)")
run_janitor "$root" --apply-volume2 --expected-plan-sha256 "$plan" >/dev/null
jq -s '.[1].targetIdentity = "1:1:1:1:755" | .[]' \
  "$root/control/consumed-worktree-janitor-volume2.audit.jsonl" >"$root/tampered.jsonl"
mv "$root/tampered.jsonl" "$root/control/consumed-worktree-janitor-volume2.audit.jsonl"
if run_janitor "$root" --apply-volume2 --expected-plan-sha256 "$plan" \
  >"$root/tamper.out" 2>"$root/tamper.err"; then
  fail 'tampered volume2 removed receipt replayed'
fi

for crash_phase in volume2-after-prepared volume2-after-git-remove; do
  root=$(new_fixture volume2-crash-$crash_phase)
  job=social-monitor-volume2-crash-${crash_phase#volume2-}
  target=$(add_volume2_worktree "$root" "$job" nested)
  write_ledger "$root" "$job" attempt-1 "$target" rejected
  plan=$(volume2_plan_sha "$(run_janitor "$root" --dry-run-volume2)")
  if SOCIAL_MONITOR_JANITOR_TEST_CRASH_AT=$crash_phase \
    run_janitor "$root" --apply-volume2 --expected-plan-sha256 "$plan" \
      >"$root/crash.out" 2>"$root/crash.err"; then
    fail "injected volume2 crash unexpectedly completed: $crash_phase"
  fi
  jq -e -s 'length == 1 and .[0].status == "prepared"' \
    "$root/control/consumed-worktree-janitor-volume2.audit.jsonl" >/dev/null ||
    fail "$crash_phase did not durably publish a prepared receipt"
  output=$(run_janitor "$root" --apply-volume2 --expected-plan-sha256 "$plan")
  [[ ! -e $target && $output == *'removed-volume2'* ]] ||
    fail "$crash_phase did not recover its exact target"
  jq -e -s 'length == 2 and .[0].status == "prepared" and .[1].status == "removed" and
    .[0].planSha256 == .[1].planSha256' \
    "$root/control/consumed-worktree-janitor-volume2.audit.jsonl" >/dev/null ||
    fail "$crash_phase recovery receipt sequence was invalid"
done

volume2_runtime_source=$(<"$SCRIPT_DIR/consumed-worktree-janitor-volume2-apply.sh")
[[ $volume2_runtime_source != *'worktree prune'* &&
  $volume2_runtime_source != *'rm -'rf* && $volume2_runtime_source != *'rm -'fr* ]] ||
  fail 'volume2 runtime contains a forbidden rm/prune deletion path'
[[ $(grep -Fc '"$GIT" -C "$INTEGRATION" worktree remove --force -- "$target"' \
  "$SCRIPT_DIR/consumed-worktree-janitor-volume2-apply.sh") == 1 ]] ||
  fail 'volume2 runtime does not have exactly one exact deletion command'
