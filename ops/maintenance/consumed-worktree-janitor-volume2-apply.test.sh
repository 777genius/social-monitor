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

volume2_manifest_sha() {
  local manifest=$1 digest
  jq -r -j '
    "schemaVersion\t1\nmode\tapply-volume2\nmainCommit\t" + .mainCommit +
    "\nlifecycleLockIdentity\t" + .lifecycleLockIdentity + "\n",
    (.ledgers[] | ["ledger",.ledgerId,.ledgerItemPath,.ledgerItemSha256,
      .statusEvidencePath,.statusEvidenceSha256,.patchEvidenceSha256,
      .numstatEvidenceSha256,.workspacePath] | join("\t") + "\n"),
    (.candidates[] | ["candidate",.ledgerId,.candidateKind,.targetWorktreePath,
      .targetIdentity,.volumeMountIdentity,.nestedParentIdentity,.ledgerItemPath,
      .ledgerItemSha256,.statusEvidencePath,.statusEvidenceSha256,.patchEvidencePath,
      .patchEvidenceSha256,.numstatEvidencePath,.numstatEvidenceSha256,.registryPath,
      .registrySha256,.gitRegistrationSha256,(.beforeBytes|tostring),
      (.targetInodes|tostring),.integratedCommitSha] | join("\t") + "\n")
  ' "$manifest" | sha256sum | { read -r digest _; printf '%s\n' "$digest"; }
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

root=$(new_fixture volume2-nonterminal-history)
job=social-monitor-volume2-nonterminal-history
target=$(add_volume2_worktree "$root" "$job" direct)
mkdir -p "$root/worker-jobs/$job"
jq -n --arg job "$job" --arg workspace "$target" \
  '{schemaVersion:1,jobId:$job,attemptId:"controller:run",status:"completed",
    closedAt:"2026-07-22T00:00:00.000Z",consumedAt:"2026-07-22T00:00:00.000Z",
    archivePath:"/historical/terminal.json",backup:{workspace:$workspace,
    statusPath:"/historical/status",patchPath:"/historical/patch",numstatPath:"/historical/numstat"},
    notes:[{status:"completed",text:"historical terminal state"}]}' \
  >"$root/control/consumed-output-ledger/items/$job--controller_run.json"
output=$(run_janitor "$root" --dry-run-volume2)
[[ $output != *"would-remove ledger=$job--controller_run"* && -d $target ]] ||
  fail 'historical nonterminal JSON became a volume2 deletion candidate'

for controller_version in controller-v3 controller-v4; do
  root=$(new_fixture volume2-$controller_version-liveness)
  job=social-monitor-volume2-$controller_version-liveness
  target=$(add_volume2_worktree "$root" "$job" direct)
  write_ledger "$root" "$job" attempt-1 "$target" rejected
  operation=$root/worker-jobs/$controller_version/project-control-operations/op-1
  mkdir -p "$operation"
  jq -n --arg workspace "$target" '{status:"running",workspacePath:$workspace}' \
    >"$operation/operation.json"
  if run_janitor "$root" --dry-run-volume2 >"$root/liveness.out" 2>"$root/liveness.err"; then
    fail "$controller_version liveness was not fail-closed"
  fi
  [[ -d $target ]] || fail "$controller_version liveness removed its target"
done

root=$(new_fixture volume2-link-safety)
job=social-monitor-volume2-link-safety
target=$(add_volume2_worktree "$root" "$job" direct)
outside=$root/outside-sentinel
printf 'outside\n' >"$outside"
ln -s "$outside" "$target/symlink-entry"
ln "$outside" "$target/hardlink-entry"
write_ledger "$root" "$job" attempt-1 "$target" rejected
output=$(run_janitor "$root" --dry-run-volume2)
plan=$(volume2_plan_sha "$output")
run_janitor "$root" --apply-volume2 --expected-plan-sha256 "$plan" >/dev/null
[[ ! -e $target && -f $outside && $(<"$outside") == 'outside' ]] ||
  fail 'descriptor-relative purge followed a symlink or hardlink'

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
[[ $plan =~ ^[0-9a-f]{64}$ && $(wc -l <<<"$output") == 2 &&
  $output != *'would-remove'* && $output != *'excluded reason='* &&
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

root=$(new_fixture volume2-bounded-durable-plan)
for number in {001..200}; do
  job=social-monitor-volume2-bounded-$number
  target=$(add_volume2_worktree "$root" "$job" direct)
  write_ledger "$root" "$job" attempt-1 "$target" rejected
done
output=$(run_janitor "$root" --dry-run-volume2)
plan=$(volume2_plan_sha "$output") || fail 'bounded volume2 plan digest was not reported'
manifest_dir=$root/control/consumed-worktree-janitor-volume2-plans
manifest=$manifest_dir/$plan.json
[[ $(wc -l <<<"$output") == 2 && $output != *'would-remove'* &&
  $output != *'excluded reason='* && $output == *'candidates=200'* &&
  -d $manifest_dir && ! -L $manifest_dir && -f $manifest && ! -L $manifest &&
  $(stat -c '%u:%a' "$manifest_dir") == "$EUID:700" &&
  $(stat -c '%u:%a' "$manifest") == "$EUID:600" ]] ||
  fail 'hundreds of volume2 candidates did not produce bounded durable output'
jq -e --arg plan "$plan" '
  .schemaVersion == 1 and .mode == "apply-volume2" and .planSha256 == $plan and
  (.generatedAt | test("Z$")) and (.ledgers | length) == 200 and
  (.candidates | length) == 200 and .accounting.candidateCount == 200 and
  .accounting.apparentBytes == ([.candidates[].beforeBytes] | add) and
  .accounting.targetInodes == ([.candidates[].targetInodes] | add) and
  .accounting.totalInodes == .accounting.targetInodes and
  ([.candidates[].targetWorktreePath] == ([.candidates[].targetWorktreePath] | sort))
' "$manifest" >/dev/null || fail 'durable volume2 manifest bindings or accounting were incomplete'
[[ $(volume2_manifest_sha "$manifest") == "$plan" ]] ||
  fail 'printed volume2 digest did not match persisted content'
manifest_hash=$(sha256sum "$manifest"); manifest_hash=${manifest_hash%%[[:space:]]*}
generated_at=$(jq -r '.generatedAt' "$manifest")
replay_output=$(run_janitor "$root" --dry-run-volume2)
replay_hash=$(sha256sum "$manifest"); replay_hash=${replay_hash%%[[:space:]]*}
[[ $replay_output == "$output" && $replay_hash == "$manifest_hash" &&
  $(jq -r '.generatedAt' "$manifest") == "$generated_at" &&
  $(find "$manifest_dir" -maxdepth 1 -type f -name '*.json' | wc -l) == 1 &&
  $(find "$manifest_dir" -maxdepth 1 -type f -name '.volume2-plan.*' | wc -l) == 0 ]] ||
  fail 'identical volume2 planning replay was not deterministic and idempotent'

for crash_phase in volume2-plan-before-rename volume2-plan-after-rename volume2-plan-after-final-fsync; do
  root=$(new_fixture volume2-$crash_phase)
  job=social-monitor-$crash_phase
  target=$(add_volume2_worktree "$root" "$job" direct)
  write_ledger "$root" "$job" attempt-1 "$target" rejected
  if SOCIAL_MONITOR_JANITOR_TEST_CRASH_AT=$crash_phase \
    run_janitor "$root" --dry-run-volume2 >"$root/plan-crash.out" 2>"$root/plan-crash.err"; then
    fail "injected durable plan crash unexpectedly completed: $crash_phase"
  fi
  manifest_dir=$root/control/consumed-worktree-janitor-volume2-plans
  if [[ $crash_phase == volume2-plan-before-rename ]]; then
    [[ $(find "$manifest_dir" -maxdepth 1 -type f -name '*.json' | wc -l) == 0 &&
      $(find "$manifest_dir" -maxdepth 1 -type f -name '.volume2-plan.*' | wc -l) == 1 ]] ||
      fail 'pre-rename crash exposed a final or lost its recoverable same-directory stage'
  else
    [[ $(find "$manifest_dir" -maxdepth 1 -type f -name '*.json' | wc -l) == 1 ]] ||
      fail "$crash_phase did not leave one complete atomically renamed manifest"
  fi
  output=$(run_janitor "$root" --dry-run-volume2)
  plan=$(volume2_plan_sha "$output")
  manifest=$manifest_dir/$plan.json
  [[ -f $manifest && $(volume2_manifest_sha "$manifest") == "$plan" &&
    $(find "$manifest_dir" -maxdepth 1 -type f -name '.volume2-plan.*' | wc -l) == 0 ]] ||
    fail "$crash_phase did not recover to one verified durable plan"
done

for unsafe_case in partial manifest-symlink directory-symlink wrong-owner wrong-directory-owner wrong-mode wrong-directory-mode tamper; do
  JANITOR_WRONG_OWNER_PATH=
  root=$(new_fixture volume2-plan-$unsafe_case)
  job=social-monitor-volume2-plan-$unsafe_case
  target=$(add_volume2_worktree "$root" "$job" direct)
  write_ledger "$root" "$job" attempt-1 "$target" rejected
  output=$(run_janitor "$root" --dry-run-volume2); plan=$(volume2_plan_sha "$output")
  manifest_dir=$root/control/consumed-worktree-janitor-volume2-plans
  manifest=$manifest_dir/$plan.json
  case $unsafe_case in
    partial) printf '{"schemaVersion":1' >"$manifest" ;;
    manifest-symlink) mv "$manifest" "$manifest.real"; ln -s "$manifest.real" "$manifest" ;;
    directory-symlink) mv "$manifest_dir" "$manifest_dir.real"; ln -s "$manifest_dir.real" "$manifest_dir" ;;
    wrong-owner) JANITOR_WRONG_OWNER_PATH=$manifest ;;
    wrong-directory-owner) JANITOR_WRONG_OWNER_PATH=$manifest_dir ;;
    wrong-mode) chmod 755 "$manifest" ;;
    wrong-directory-mode) chmod 755 "$manifest_dir" ;;
    tamper)
      jq '.accounting.candidateCount += 1' "$manifest" >"$root/tampered-plan.json"
      mv "$root/tampered-plan.json" "$manifest"; chmod 600 "$manifest"
      ;;
  esac
  assert_volume2_rejected "$root" "$target" "$plan" "plan-$unsafe_case"
done
unset JANITOR_WRONG_OWNER_PATH

root=$(new_fixture volume2-conflicting-same-sha)
job=social-monitor-volume2-conflict-first
target=$(add_volume2_worktree "$root" "$job" direct)
write_ledger "$root" "$job" attempt-1 "$target" rejected
first_output=$(run_janitor "$root" --dry-run-volume2); first_plan=$(volume2_plan_sha "$first_output")
first_manifest=$root/control/consumed-worktree-janitor-volume2-plans/$first_plan.json
second_job=social-monitor-volume2-conflict-second
second_target=$(add_volume2_worktree "$root" "$second_job" direct)
write_ledger "$root" "$second_job" attempt-1 "$second_target" rejected
second_output=$(run_janitor "$root" --dry-run-volume2); second_plan=$(volume2_plan_sha "$second_output")
cp "$root/control/consumed-worktree-janitor-volume2-plans/$second_plan.json" "$first_manifest"
chmod 600 "$first_manifest"
assert_volume2_rejected "$root" "$target" "$first_plan" conflicting-same-sha
[[ -d $second_target ]] || fail 'conflicting same-SHA plan removed an unbound candidate'

root=$(new_fixture volume2-apply-expanded-after-plan)
job=social-monitor-volume2-apply-bound-first
target=$(add_volume2_worktree "$root" "$job" direct)
write_ledger "$root" "$job" attempt-1 "$target" rejected
plan=$(volume2_plan_sha "$(run_janitor "$root" --dry-run-volume2)")
extra_job=social-monitor-volume2-apply-unbound-extra
extra_target=$(add_volume2_worktree "$root" "$extra_job" direct)
write_ledger "$root" "$extra_job" attempt-1 "$extra_target" rejected
assert_volume2_rejected "$root" "$target" "$plan" expanded-after-plan
[[ -d $extra_target ]] || fail 'apply removed a candidate absent from its persisted manifest'

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
  $output == *'volume2-batch processed=1 remaining=1 replayed=0 removed=1 planned=2 maxCandidates=1'* &&
  ! -e $root/worktrees/.volume2/social-monitor-volume2-success-direct &&
  -d $root/worktrees/.volume2/social-monitor-volume2-success-nested/worktree ]] ||
  fail 'default volume2 batch did not remove exactly one candidate'
output=$(run_janitor "$root" --apply-volume2 --expected-plan-sha256 "$plan")
[[ $output == *'removed-volume2 ledger=social-monitor-volume2-success-nested--attempt-1 kind=volume2-nested'* &&
  $output == *'volume2-batch processed=1 remaining=0 replayed=1 removed=1 planned=2 maxCandidates=1'* &&
  ! -e $root/worktrees/.volume2/social-monitor-volume2-success-nested/worktree ]] ||
  fail 'volume2 plan did not resume its remaining candidate'
jq -e -s 'length == 6 and
  ([.[] | select(.status == "prepared")] | length) == 2 and
  ([.[] | select(.status == "purged")] | length) == 2 and
  ([.[] | select(.status == "removed")] | length) == 2 and
  all(.[]; (.targetIdentity | test("^[0-9]+:[0-9]+:[0-9]+:[0-9]+:[0-7]+$")) and
    (.volumeMountIdentity | test("^/[^|]*\\|[0-9]+:[0-9]+:[0-9]+:[0-9]+:[0-7]+\\|[0-9]+:[0-9]+:[0-9]+:[0-9]+:[0-7]+$")) and
    (.gitRegistrationSha256 | test("^[0-9a-f]{64}$")) and
    .beforeBytes > 0 and .targetInodes > 0 and .filesystemFreeInodesBefore > 0) and
  all(.[] | select(.status == "removed"); .filesystemFreeInodesAfter > 0 and
    .reclaimedInodes == ([.filesystemFreeInodesAfter - .filesystemFreeInodesBefore, 0] | max))' \
  "$root/control/consumed-worktree-janitor-volume2.audit.jsonl" >/dev/null ||
  fail 'volume2 apply receipts did not bind identity and accounting evidence'
output=$(run_janitor "$root" --apply-volume2 --expected-plan-sha256 "$plan")
[[ $output == *'replayed=2'* ]] || fail 'completed volume2 receipts did not replay'
jq -e -s 'length == 6' "$root/control/consumed-worktree-janitor-volume2.audit.jsonl" >/dev/null ||
  fail 'completed volume2 replay duplicated receipts'

root=$(new_fixture volume2-explicit-batch-eight)
for number in {1..9}; do
  job=social-monitor-volume2-batch-$number
  target=$(add_volume2_worktree "$root" "$job" direct)
  write_ledger "$root" "$job" attempt-1 "$target" rejected
done
plan=$(volume2_plan_sha "$(run_janitor "$root" --dry-run-volume2)")
output=$(run_janitor "$root" --apply-volume2 --expected-plan-sha256 "$plan" --max-candidates 8)
[[ $output == *'volume2-batch processed=8 remaining=1 replayed=0 removed=8 planned=9 maxCandidates=8'* &&
  $(wc -l <<<"$output") -le 11 &&
  $(find "$root/worktrees/.volume2" -mindepth 1 -maxdepth 1 -type d | wc -l) == 1 ]] ||
  fail 'explicit volume2 batch did not honor the hard maximum of eight'
output=$(run_janitor "$root" --apply-volume2 --expected-plan-sha256 "$plan")
[[ $output == *'volume2-batch processed=1 remaining=0 replayed=8 removed=1 planned=9 maxCandidates=1'* ]] ||
  fail 'bounded volume2 batch did not resume the same plan'
for invalid_max in 0 9 01 unlimited; do
  if run_janitor "$root" --apply-volume2 --expected-plan-sha256 "$plan" --max-candidates "$invalid_max" \
    >"$root/max-$invalid_max.out" 2>"$root/max-$invalid_max.err"; then
    fail "volume2 apply accepted invalid maximum: $invalid_max"
  fi
done

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
[[ $output == *'candidates=1'* && $output != *'would-remove'* ]] ||
  fail 'foreign volume2 sibling activity protected the shared parent'
if run_janitor "$root" --apply-volume2 --expected-plan-sha256 "$plan" \
  >"$root/foreign.out" 2>"$root/foreign.err"; then
  fail 'volume2 apply accepted a foreign sibling registration'
fi
[[ -d $target && -d $foreign_target && $(<"$root/foreign.err") == *'outside the exact plan'* ]] ||
  fail 'volume2 foreign sibling failure changed a root or reported the wrong blocker'

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
  [[ $output == *'candidates=0'* && $output != *'would-remove'* && -d $target ]] ||
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

for race_case in mount stat nested-parent root-swap; do
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
    root-swap)
      mv "$root/worktrees/.volume2" "$root/worktrees/.volume2.original"
      mkdir "$root/worktrees/.volume2"
      chmod 755 "$root/worktrees/.volume2"
      changed=$root/worktrees/.volume2
      ;;
  esac
  [[ $race_case == root-swap ]] || chmod 700 "$changed"
  : >"$checkpoint.continue"
  if wait "$race_pid"; then fail "volume2 $race_case identity race unexpectedly applied"; fi
  if [[ $race_case == root-swap ]]; then
    rmdir "$root/worktrees/.volume2"
    mv "$root/worktrees/.volume2.original" "$root/worktrees/.volume2"
  else
    chmod 755 "$changed"
  fi
  [[ -d $target ]] || fail "volume2 $race_case identity race removed its target"
done

root=$(new_fixture volume2-dirty-conflict)
job=social-monitor-volume2-dirty-conflict
target=$(add_volume2_worktree "$root" "$job" direct)
write_ledger "$root" "$job" attempt-1 "$target" rejected
printf 'late dirty state\n' >>"$target/fixture.txt"
output=$(run_janitor "$root" --dry-run-volume2)
[[ $output == *'candidates=0'* && $output != *'would-remove'* ]] ||
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
[[ $output == *'candidates=0'* && $output != *'would-remove'* && -d $target ]] ||
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

root=$(new_fixture volume2-lifecycle-lock-swap)
job=social-monitor-volume2-lifecycle-lock-swap
target=$(add_volume2_worktree "$root" "$job" direct)
write_ledger "$root" "$job" attempt-1 "$target" rejected
plan=$(volume2_plan_sha "$(run_janitor "$root" --dry-run-volume2)")
mv "$root/control/worktree-cleanup.lock" "$root/control/worktree-cleanup.lock.old"
: >"$root/control/worktree-cleanup.lock"
assert_volume2_rejected "$root" "$target" "$plan" lifecycle-lock-swap
[[ ! -e $root/control/consumed-worktree-janitor-volume2.audit.jsonl ]] ||
  fail 'lifecycle lock swap wrote a receipt'

root=$(new_fixture volume2-receipt-tamper)
job=social-monitor-volume2-receipt-tamper
target=$(add_volume2_worktree "$root" "$job" direct)
write_ledger "$root" "$job" attempt-1 "$target" rejected
plan=$(volume2_plan_sha "$(run_janitor "$root" --dry-run-volume2)")
run_janitor "$root" --apply-volume2 --expected-plan-sha256 "$plan" >/dev/null
jq -s '.[0].unexpected = true | .[1].targetIdentity = "1:1:1:1:755" | .[]' \
  "$root/control/consumed-worktree-janitor-volume2.audit.jsonl" >"$root/tampered.jsonl"
mv "$root/tampered.jsonl" "$root/control/consumed-worktree-janitor-volume2.audit.jsonl"
if run_janitor "$root" --apply-volume2 --expected-plan-sha256 "$plan" \
  >"$root/tamper.out" 2>"$root/tamper.err"; then
  fail 'tampered volume2 removed receipt replayed'
fi

for crash_phase in volume2-after-prepared volume2-after-purge-before-purged-receipt volume2-after-purged-receipt-before-unregister volume2-after-git-remove; do
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
  if [[ $crash_phase == volume2-after-purged-receipt-before-unregister ||
    $crash_phase == volume2-after-git-remove ]]; then
    jq -e -s 'length == 2 and .[0].status == "prepared" and .[1].status == "purged"' \
      "$root/control/consumed-worktree-janitor-volume2.audit.jsonl" >/dev/null ||
      fail "$crash_phase did not durably publish the post-purge receipt"
  else
    jq -e -s 'length == 1 and .[0].status == "prepared"' \
      "$root/control/consumed-worktree-janitor-volume2.audit.jsonl" >/dev/null ||
      fail "$crash_phase did not leave the expected prepared receipt"
  fi
  output=$(run_janitor "$root" --apply-volume2 --expected-plan-sha256 "$plan")
  [[ ! -e $target && $output == *'removed-volume2'* ]] ||
    fail "$crash_phase did not recover its exact target"
  jq -e -s '
    .[0].planSha256 as $plan |
    length == 3 and .[0].status == "prepared" and .[1].status == "purged" and
    .[2].status == "removed" and .[1].purgedAt == .[2].purgedAt and
    all(.[]; .planSha256 == $plan)' \
    "$root/control/consumed-worktree-janitor-volume2.audit.jsonl" >/dev/null ||
    fail "$crash_phase recovery receipt sequence was invalid"
done

volume2_runtime_source=$(<"$SCRIPT_DIR/consumed-worktree-janitor-volume2-apply.sh")
[[ $volume2_runtime_source != *'worktree prune'* &&
  $volume2_runtime_source != *'rm -'rf* && $volume2_runtime_source != *'rm -'fr* ]] ||
  fail 'volume2 runtime contains a forbidden rm/prune deletion path'
[[ $volume2_runtime_source != *'worktree_matches_terminal_evidence'* &&
  $volume2_runtime_source != *'"$DU"'* && $volume2_runtime_source != *' status --short'* &&
  $volume2_runtime_source != *' diff --no-ext-diff'* ]] ||
  fail 'volume2 apply regained a recursive DU or Git candidate-content scan'
[[ $(grep -Fc '"$GIT" -C "$INTEGRATION" worktree remove --force -- "$target"' \
  "$SCRIPT_DIR/consumed-worktree-janitor-volume2-apply.sh") == 1 ]] ||
  fail 'volume2 runtime does not have exactly one exact unregister command'
