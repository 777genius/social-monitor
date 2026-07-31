#!/usr/bin/env bash
# Sourced by the hermetic janitor test after fixture helpers are defined.

assert_relocated_apply_rejected() {
  local root=$1 target=$2 plan=$3
  if run_janitor "$root" --apply-relocated --expected-plan-sha256 "$plan" \
    >"$root/relocated-rejected.out" 2>"$root/relocated-rejected.err"; then
    fail "unsafe relocated fixture unexpectedly applied: ${root##*/}"
  fi
  [[ -d $target ]] || fail "rejected relocated fixture removed its target: ${root##*/}"
  [[ ! -e $root/control/consumed-worktree-janitor.audit.jsonl ]] ||
    fail "rejected relocated fixture wrote an audit receipt: ${root##*/}"
}

root=$(new_fixture relocated-deterministic-accounting)
for suffix in zeta alpha; do
  job=social-monitor-relocated-$suffix
  IFS=$'\t' read -r logical target < <(add_relocated_worktree "$root" "$job")
  printf '%s payload\n' "$suffix" >"$target/$suffix.txt"
  write_ledger "$root" "$job" attempt-1 "$logical" rejected
done
alpha_logical=$root/worktrees/social-monitor-relocated-alpha
alpha_target=$root/worktrees/.volume2/root-worktree-archive-20260727/social-monitor-relocated-alpha
zeta_logical=$root/worktrees/social-monitor-relocated-zeta
zeta_target=$root/worktrees/.volume2/root-worktree-archive-20260727/social-monitor-relocated-zeta
alpha_bytes=$(du -sb --apparent-size -- "$alpha_target"); alpha_bytes=${alpha_bytes%%[[:space:]]*}
zeta_bytes=$(du -sb --apparent-size -- "$zeta_target"); zeta_bytes=${zeta_bytes%%[[:space:]]*}
alpha_inodes=$(du -s --inodes -- "$alpha_target"); alpha_inodes=${alpha_inodes%%[[:space:]]*}
zeta_inodes=$(du -s --inodes -- "$zeta_target"); zeta_inodes=${zeta_inodes%%[[:space:]]*}
output=$(run_janitor "$root")
plan=$(relocated_plan_sha "$output") || fail 'relocated plan digest was not reported'
[[ $plan =~ ^[0-9a-f]{64}$ ]] || fail 'relocated plan digest was malformed'
alpha_line=$(printf '%s\n' "$output" | grep -n "would-remove ledger=social-monitor-relocated-alpha--")
zeta_line=$(printf '%s\n' "$output" | grep -n "would-remove ledger=social-monitor-relocated-zeta--")
[[ ${alpha_line%%:*} -lt ${zeta_line%%:*} &&
  $alpha_line == *"worktree=$alpha_logical target=$alpha_target"* &&
  $alpha_line == *"apparentBytes=$alpha_bytes targetInodes=$alpha_inodes logicalSymlinkInodes=1"* &&
  $output == *"apparentBytes=$((alpha_bytes + zeta_bytes)) targetInodes=$((alpha_inodes + zeta_inodes)) logicalSymlinkInodes=2 totalInodes=$((alpha_inodes + zeta_inodes + 2))"* ]] ||
  fail 'relocated dry-run order or byte/inode accounting was not exact'
[[ $(run_janitor "$root") == "$output" ]] || fail 'relocated plan was not deterministic'
output=$(run_janitor "$root" --apply)
[[ $output == *'reason=relocation-dry-run-only'* && $output == *'eligible=0 removed=0'* &&
  -L $alpha_logical && -d $alpha_target && -L $zeta_logical && -d $zeta_target &&
  ! -e $root/control/consumed-worktree-janitor.audit.jsonl ]] ||
  fail 'ordinary apply did not preserve every relocated path'

root=$(new_fixture relocated-logical-alias)
job=social-monitor-relocated-alias-owner
alias_name=social-monitor-relocated-logical-alias
IFS=$'\t' read -r logical target < <(add_relocated_worktree "$root" "$alias_name")
write_ledger "$root" "$job" attempt-1 "$logical" rejected
output=$(run_janitor "$root")
[[ $output == *"would-remove ledger=$job--attempt-1 worktree=$logical target=$target"* &&
  $output == *'eligible=1'* ]] || fail 'valid relocated logical alias was not eligible'

for unsafe_case in logical-chain target-chain basename-mismatch foreign-root broken-target \
  writable-volume-parent writable-archive-root writable-target wrong-owner; do
  JANITOR_WRONG_OWNER_PATH=
  root=$(new_fixture relocated-unsafe-$unsafe_case)
  job=social-monitor-relocated-unsafe-$unsafe_case
  IFS=$'\t' read -r logical target < <(add_relocated_worktree "$root" "$job")
  write_ledger "$root" "$job" attempt-1 "$logical" rejected
  plan=$(relocated_plan_sha "$(run_janitor "$root")")
  preserved=$target
  case $unsafe_case in
    logical-chain) mv "$logical" "$logical.direct"; ln -s "$logical.direct" "$logical" ;;
    target-chain)
      mv "$target" "$target.real"; ln -s "$target.real" "$target"; preserved=$target.real
      ;;
    basename-mismatch)
      mv "$target" "$target-other"; ln -sfn "$target-other" "$logical"; preserved=$target-other
      ;;
    foreign-root)
      mkdir "$root/foreign-archive"; mv "$target" "$root/foreign-archive/$job"
      ln -sfn "$root/foreign-archive/$job" "$logical"; preserved=$root/foreign-archive/$job
      ;;
    broken-target) mv "$target" "$target.missing"; preserved=$target.missing ;;
    writable-volume-parent) chmod g+w "$root/worktrees/.volume2" ;;
    writable-archive-root) chmod g+w "${target%/*}" ;;
    writable-target) chmod g+w "$target" ;;
    wrong-owner) JANITOR_WRONG_OWNER_PATH=$logical ;;
  esac
  assert_relocated_apply_rejected "$root" "$preserved" "$plan"
done
unset JANITOR_WRONG_OWNER_PATH

root=$(new_fixture relocated-duplicate-registry)
job=social-monitor-relocated-duplicate-registry
IFS=$'\t' read -r logical target < <(add_relocated_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$logical" rejected
plan=$(relocated_plan_sha "$(run_janitor "$root")")
write_registry_binding "$root" "$job" "$logical" registry-v3
assert_relocated_apply_rejected "$root" "$target" "$plan"

root=$(new_fixture relocated-unbound)
job=social-monitor-relocated-unbound
IFS=$'\t' read -r logical target < <(add_relocated_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$logical" rejected
plan=$(relocated_plan_sha "$(run_janitor "$root")")
find "$root/worker-jobs/registry-v4/$job" -depth -delete
assert_relocated_apply_rejected "$root" "$target" "$plan"

root=$(new_fixture relocated-duplicate-git-registration)
job=social-monitor-relocated-duplicate-git-registration
IFS=$'\t' read -r logical target < <(add_relocated_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$logical" rejected
metadata=${target##*/}; metadata=$root/integration/.git/worktrees/$metadata
cp -a "$metadata" "$metadata-copy"
output=$(run_janitor "$root")
[[ $output == *'reason=git-registration-count'* && $output == *'count=2'* &&
  $output != *'would-remove'* ]] || fail 'duplicate relocated Git registration was not excluded'

root=$(new_fixture relocated-failed-no-output)
job=social-monitor-relocated-failed-no-output
IFS=$'\t' read -r logical target < <(add_relocated_worktree "$root" "$job")
attempt=workspace:synthetic-id
write_ledger "$root" "$job" "$attempt" "$logical" failed_no_output
mv "$root/control/consumed-output-ledger/items/$job--$attempt.json" \
  "$root/control/consumed-output-ledger/items/$job--${attempt/:/_}.json"
find "$root/worker-jobs/$job/archives" -depth -delete
output=$(run_janitor "$root")
[[ $output != *'would-remove'* && $output == *'eligible=0'* ]] ||
  fail 'relocated failed_no_output record was not excluded'

for active_case in process lock activity; do
  root=$(new_fixture relocated-active-$active_case)
  job=social-monitor-relocated-active-$active_case
  IFS=$'\t' read -r logical target < <(add_relocated_worktree "$root" "$job")
  write_ledger "$root" "$job" attempt-1 "$logical" rejected
  case $active_case in
    process) printf '%s\n' "$target/held-open" >"$root/.social-monitor-janitor-test-process-paths" ;;
    lock) git -C "$root/integration" worktree lock --reason fixture "$target" ;;
    activity)
      operation=$root/worker-jobs/controller/project-control-operations/op-1
      mkdir -p "$operation"
      jq -n --arg workspacePath "$logical" \
        '{status:"running",workspacePath:$workspacePath}' >"$operation/operation.json"
      ;;
  esac
  output=$(run_janitor "$root")
  [[ $output != *'would-remove'* && -L $logical && -d $target ]] ||
    fail "relocated $active_case activity was not excluded"
done

root=$(new_fixture relocated-state-mismatch)
job=social-monitor-relocated-state-mismatch
IFS=$'\t' read -r logical target < <(add_relocated_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$logical" rejected
printf 'later state\n' >>"$target/fixture.txt"
output=$(run_janitor "$root")
[[ $output == *'reason=terminal-evidence-conflict'* && $output == *'eligible=0'* ]] ||
  fail 'relocated terminal-state mismatch was not excluded'

root=$(new_fixture relocated-apply-success-replay)
job=social-monitor-relocated-apply-success
IFS=$'\t' read -r logical target < <(add_relocated_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$logical" rejected
plan=$(relocated_plan_sha "$(run_janitor "$root")")
output=$(run_janitor "$root" --apply-relocated --expected-plan-sha256 "$plan")
[[ $output == *"removed-relocated ledger=$job--attempt-1 logical=$logical target=$target"* &&
  ! -e $logical && ! -L $logical && ! -e $target ]] || fail 'relocated apply did not succeed'
git -C "$root/integration" worktree list --porcelain | grep -F "$target" >/dev/null &&
  fail 'relocated apply left its target registered'
jq -e -s 'length == 2 and .[0].schemaVersion == 2 and .[0].status == "prepared" and
  .[1].schemaVersion == 2 and .[1].status == "removed" and
  .[0].planSha256 == .[1].planSha256' \
  "$root/control/consumed-worktree-janitor.audit.jsonl" >/dev/null ||
  fail 'relocated apply did not publish its schema-v2 receipt sequence'
output=$(run_janitor "$root" --apply-relocated --expected-plan-sha256 "$plan")
[[ $output == *'replayed=1'* ]] || fail 'completed relocated apply did not replay idempotently'
jq -e -s 'length == 2' "$root/control/consumed-worktree-janitor.audit.jsonl" >/dev/null ||
  fail 'relocated replay duplicated its receipts'
git -C "$root/integration" commit --allow-empty -qm 'advance after completed receipt'
future_job=social-monitor-relocated-future-batch
IFS=$'\t' read -r future_logical future_target < <(add_relocated_worktree "$root" "$future_job")
write_ledger "$root" "$future_job" attempt-1 "$future_logical" rejected
ordinary_job=social-monitor-ordinary-after-relocated-receipt
ordinary_target=$(add_worktree "$root" "$ordinary_job")
write_ledger "$root" "$ordinary_job" attempt-1 "$ordinary_target" rejected
output=$(run_janitor "$root" --apply)
[[ $output == *"removed ledger=$ordinary_job--attempt-1"* && $output == *'replayed=1'* &&
  ! -e $ordinary_target && -L $future_logical && -d $future_target ]] ||
  fail 'historical relocated receipt blocked a later ordinary apply batch'
output=$(run_janitor "$root" --apply-relocated --expected-plan-sha256 "$plan")
[[ $output == *'replayed=1'* && $output == *'reason=relocated-recovery-other-batch'* &&
  -L $future_logical && -d $future_target ]] ||
  fail 'completed receipt did not remain replayable across main and ledger drift'
future_bytes=$(du -sb --apparent-size -- "$future_target"); future_bytes=${future_bytes%%[[:space:]]*}
future_inodes=$(du -s --inodes -- "$future_target"); future_inodes=${future_inodes%%[[:space:]]*}
output=$(run_janitor "$root")
[[ $output != *"would-remove ledger=$job--attempt-1"* &&
  $output == *"would-remove ledger=$future_job--attempt-1"* &&
  $output == *"eligible=1"* && $output == *"apparentBytes=$future_bytes targetInodes=$future_inodes logicalSymlinkInodes=1"* ]] ||
  fail 'completed receipt polluted dry-run candidates or accounting'
tail -n 1 "$root/control/consumed-worktree-janitor.audit.jsonl" >> \
  "$root/control/consumed-worktree-janitor.audit.jsonl"
if run_janitor "$root" --apply-relocated --expected-plan-sha256 "$plan" \
  >"$root/receipt-conflict.out" 2>"$root/receipt-conflict.err"; then
  fail 'duplicate schema-v2 removed receipt was replayed'
fi
[[ $(<"$root/receipt-conflict.err") == *'unsupported replay state'* ]] ||
  fail 'duplicate schema-v2 receipt reported the wrong conflict'

for crash_phase in after-prepared after-unlink after-git-remove; do
  root=$(new_fixture relocated-crash-$crash_phase)
  job=social-monitor-relocated-crash-$crash_phase
  IFS=$'\t' read -r logical target < <(add_relocated_worktree "$root" "$job")
  write_ledger "$root" "$job" attempt-1 "$logical" rejected
  plan=$(relocated_plan_sha "$(run_janitor "$root")")
  if SOCIAL_MONITOR_JANITOR_TEST_CRASH_AT=$crash_phase \
    run_janitor "$root" --apply-relocated --expected-plan-sha256 "$plan" \
      >"$root/crash.out" 2>"$root/crash.err"; then
    fail "injected $crash_phase crash unexpectedly completed"
  fi
  jq -e -s 'length == 1 and .[0].status == "prepared"' \
    "$root/control/consumed-worktree-janitor.audit.jsonl" >/dev/null ||
    fail "$crash_phase did not leave exactly one durable prepared receipt"
  if [[ $crash_phase == after-prepared || $crash_phase == after-unlink ]]; then
    git -C "$root/integration" commit --allow-empty -qm "advance after $crash_phase"
    drift_job=social-monitor-relocated-drift-$crash_phase
    IFS=$'\t' read -r drift_logical drift_target < <(add_relocated_worktree "$root" "$drift_job")
    write_ledger "$root" "$drift_job" attempt-1 "$drift_logical" rejected
  fi
  output=$(run_janitor "$root" --apply-relocated --expected-plan-sha256 "$plan")
  [[ ! -e $logical && ! -L $logical && ! -e $target && $output == *'removed-relocated'* ]] ||
    fail "$crash_phase did not resume from its exact supported state"
  if [[ $crash_phase == after-prepared || $crash_phase == after-unlink ]]; then
    [[ -L $drift_logical && -d $drift_target &&
      $output == *'reason=relocated-recovery-other-batch'* ]] ||
      fail "$crash_phase recovery consumed or rejected its future ledger batch"
  fi
done

root=$(new_fixture relocated-removed-binding-mismatch)
job=social-monitor-relocated-removed-binding-mismatch
IFS=$'\t' read -r logical target < <(add_relocated_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$logical" rejected
plan=$(relocated_plan_sha "$(run_janitor "$root")")
run_janitor "$root" --apply-relocated --expected-plan-sha256 "$plan" >/dev/null
jq -s '.[1].targetIdentity = "tampered-binding" | .[]' \
  "$root/control/consumed-worktree-janitor.audit.jsonl" >"$root/tampered-audit.jsonl"
mv "$root/tampered-audit.jsonl" "$root/control/consumed-worktree-janitor.audit.jsonl"
if run_janitor "$root" --apply-relocated --expected-plan-sha256 "$plan" \
  >"$root/mismatched-removed.out" 2>"$root/mismatched-removed.err"; then
  fail 'mismatched removed receipt binding was replayed'
fi
[[ $(<"$root/mismatched-removed.err") == *'unsupported replay state'* ]] ||
  fail 'mismatched removed receipt did not fail closed during binding projection validation'

root=$(new_fixture relocated-partial-failure)
job=social-monitor-relocated-partial-failure
IFS=$'\t' read -r logical target < <(add_relocated_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$logical" rejected
plan=$(relocated_plan_sha "$(run_janitor "$root")")
if SOCIAL_MONITOR_JANITOR_TEST_FAIL_AT=before-git-remove \
  run_janitor "$root" --apply-relocated --expected-plan-sha256 "$plan" \
    >"$root/partial.out" 2>"$root/partial.err"; then
  fail 'injected partial failure unexpectedly completed'
fi
[[ ! -e $logical && -d $target ]] || fail 'partial failure did not stop after logical unlink'
run_janitor "$root" --apply-relocated --expected-plan-sha256 "$plan" >/dev/null
[[ ! -e $target ]] || fail 'partial failure did not resume'

root=$(new_fixture relocated-plan-conflict-zero-write)
job=social-monitor-relocated-plan-conflict
IFS=$'\t' read -r logical target < <(add_relocated_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$logical" rejected
plan=$(relocated_plan_sha "$(run_janitor "$root")")
git -C "$root/integration" commit --allow-empty -qm 'advance plan main'
if run_janitor "$root" --apply-relocated --expected-plan-sha256 "$plan" \
  >"$root/conflict.out" 2>"$root/conflict.err"; then
  fail 'stale relocated plan unexpectedly applied'
fi
[[ -L $logical && -d $target && ! -e $root/control/consumed-worktree-janitor.audit.jsonl &&
  $(<"$root/conflict.err") == *'relocated plan mismatch'* ]] ||
  fail 'relocated plan conflict was not zero-write'

root=$(new_fixture relocated-identity-race)
job=social-monitor-relocated-identity-race
IFS=$'\t' read -r logical target < <(add_relocated_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$logical" rejected
plan=$(relocated_plan_sha "$(run_janitor "$root")")
SOCIAL_MONITOR_JANITOR_TEST_PAUSE_AT=before-prepared \
  run_janitor "$root" --apply-relocated --expected-plan-sha256 "$plan" \
    >"$root/race.out" 2>"$root/race.err" &
race_pid=$!
checkpoint=$root/.social-monitor-janitor-checkpoint-before-prepared
for _ in {1..1000}; do [[ -f $checkpoint ]] && break; sleep 0.01; done
[[ -f $checkpoint ]] || fail 'identity race did not reach its checkpoint'
unlink "$logical"; ln -s "$target" "$logical.inode-consumer"; ln -s "$target" "$logical"
: >"$checkpoint.continue"
if wait "$race_pid"; then fail 'logical identity race unexpectedly applied'; fi
[[ -L $logical && -d $target && ! -e $root/control/consumed-worktree-janitor.audit.jsonl &&
  $(<"$root/race.err") == *'logical identity changed'* ]] ||
  fail 'logical identity race was not rejected before the first mutation'

root=$(new_fixture relocated-activity-race)
job=social-monitor-relocated-activity-race
IFS=$'\t' read -r logical target < <(add_relocated_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$logical" rejected
plan=$(relocated_plan_sha "$(run_janitor "$root")")
SOCIAL_MONITOR_JANITOR_TEST_PAUSE_AT=after-unlink \
  run_janitor "$root" --apply-relocated --expected-plan-sha256 "$plan" \
    >"$root/activity-race.out" 2>"$root/activity-race.err" &
race_pid=$!
checkpoint=$root/.social-monitor-janitor-checkpoint-after-unlink
for _ in {1..1000}; do [[ -f $checkpoint ]] && break; sleep 0.01; done
[[ -f $checkpoint ]] || fail 'activity race did not reach its checkpoint'
printf '%s\n' "$target/late-open" >"$root/.social-monitor-janitor-test-process-paths"
: >"$checkpoint.continue"
if wait "$race_pid"; then fail 'late activity race unexpectedly removed its target'; fi
[[ ! -e $logical && -d $target && $(<"$root/activity-race.err") == *'process entered'* ]] ||
  fail 'late activity was not revalidated before Git removal'
unlink "$root/.social-monitor-janitor-test-process-paths"
run_janitor "$root" --apply-relocated --expected-plan-sha256 "$plan" >/dev/null
[[ ! -e $target ]] || fail 'activity-race prepared state did not replay after activity ended'

root=$(new_fixture relocated-mixed-mode)
relocated_job=social-monitor-relocated-mixed
IFS=$'\t' read -r logical target < <(add_relocated_worktree "$root" "$relocated_job")
write_ledger "$root" "$relocated_job" attempt-1 "$logical" rejected
ordinary_job=social-monitor-ordinary-mixed
ordinary_target=$(add_worktree "$root" "$ordinary_job")
write_ledger "$root" "$ordinary_job" attempt-1 "$ordinary_target" rejected
plan=$(relocated_plan_sha "$(run_janitor "$root")")
output=$(run_janitor "$root" --apply-relocated --expected-plan-sha256 "$plan")
[[ ! -e $logical && ! -e $target && -d $ordinary_target &&
  $output == *"excluded reason=ordinary-apply-only ledger=$ordinary_job--attempt-1"* ]] ||
  fail 'mixed relocated apply did not preserve its ordinary candidate'
output=$(run_janitor "$root" --apply)
[[ ! -e $ordinary_target && $output == *"removed ledger=$ordinary_job--attempt-1"* ]] ||
  fail 'ordinary apply regressed after mixed relocated apply'
