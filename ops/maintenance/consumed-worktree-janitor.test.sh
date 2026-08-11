#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ENTRYPOINT=$SCRIPT_DIR/consumed-worktree-janitor.sh
SERVICE=$SCRIPT_DIR/social-monitor-consumed-worktree-janitor.service
TIMER=$SCRIPT_DIR/social-monitor-consumed-worktree-janitor.timer
SUITE_ROOT=$(mktemp -d "$SCRIPT_DIR/.consumed-worktree-janitor-test.XXXXXX")

cleanup() {
  if [[ -d $SUITE_ROOT && ! -L $SUITE_ROOT ]]; then
    find "$SUITE_ROOT" -depth -delete
  fi
}
trap cleanup EXIT

fail() {
  printf 'janitor-test: %s\n' "$*" >&2
  exit 1
}

new_fixture() {
  local name=$1
  local root=$SUITE_ROOT/$name
  mkdir -p "$root/control/consumed-output-ledger/items" "$root/worker-jobs/controller" \
    "$root/worktrees"
  : >"$root/.social-monitor-janitor-test-root"
  : >"$root/control/worktree-cleanup.lock"
  git init -q "$root/integration"
  git -C "$root/integration" config user.name 'Janitor Test'
  git -C "$root/integration" config user.email 'janitor-test@example.invalid'
  printf 'fixture\n' >"$root/integration/fixture.txt"
  git -C "$root/integration" add fixture.txt
  git -C "$root/integration" commit -qm 'fixture base'
  printf '%s\n' "$root"
}

add_worktree() {
  local root=$1
  local name=$2
  local target=${3:-$root/worktrees/$name}
  git -C "$root/integration" worktree add -q -b "$name" "$target"
  printf '%s\n' "$target"
}

write_ledger() {
  local root=$1
  local job_id=$2
  local attempt_id=$3
  local workspace=$4
  local status=${5:-integrated}
  local archive=${6:-$root/worker-jobs/$job_id/archives/$job_id-$status-$attempt_id}
  local integrated_commit
  mkdir -p "$archive"
  git -c status.showUntrackedFiles=all -C "$workspace" status --short > \
    "$archive/git-status.txt"
  git -C "$workspace" diff --no-ext-diff --binary HEAD -- >"$archive/tracked.diff"
  git -C "$workspace" diff --no-ext-diff --numstat HEAD -- >"$archive/tracked.numstat"
  integrated_commit=$(git -C "$root/integration" rev-parse HEAD)
  mkdir -p "$root/worker-jobs/$job_id"
  # shellcheck disable=SC2016 # The dollar-prefixed names are jq variables.
  jq -n \
    --arg jobId "$job_id" --arg attemptId "$attempt_id" --arg status "$status" \
    --arg archivePath "$archive" --arg workspace "$workspace" \
    --arg statusPath "$archive/git-status.txt" --arg patchPath "$archive/tracked.diff" \
    --arg numstatPath "$archive/tracked.numstat" \
    --arg integratedCommit "$integrated_commit" \
    '{schemaVersion:1,jobId:$jobId,attemptId:$attemptId,status:$status,
      closedAt:"2026-07-22T00:00:00.000Z",archivePath:$archivePath,
      backup:{workspace:$workspace,statusPath:$statusPath,patchPath:$patchPath,
        numstatPath:$numstatPath},consumedAt:"2026-07-22T00:00:00.000Z",
      notes:[{status:$status,text:"hermetic fixture"}]}
      + (if $status == "integrated" then
          {commitSha:$integratedCommit,
           integratedCommitSha:$integratedCommit,
           commit:$integratedCommit}
        else {} end)' > \
    "$root/control/consumed-output-ledger/items/$job_id--$attempt_id.json"
}

run_janitor() {
  local root=$1
  shift
  SOCIAL_MONITOR_JANITOR_ALLOW_TEST_ROOT=1 \
    SOCIAL_MONITOR_JANITOR_TEST_PARENT="$SUITE_ROOT" \
    bash "$ENTRYPOINT" --test-root "$root" "$@"
}

assert_apply_rejected() {
  local root=$1
  local target=$2
  if run_janitor "$root" --apply >"$root/rejected.out" 2>"$root/rejected.err"; then
    fail "unsafe fixture unexpectedly applied: ${root##*/}"
  fi
  [[ -d $target ]] || fail "rejected fixture removed its target: ${root##*/}"
}

root=$(new_fixture dry-run-default)
job=social-monitor-dry-run-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
output=$(run_janitor "$root")
[[ -d $target ]] || fail 'default dry-run removed a worktree'
[[ $output == *'mode=dry-run'* && $output == *'would-remove'* ]] ||
  fail 'default dry-run did not report its plan'
[[ ! -e $root/control/consumed-worktree-janitor.audit.jsonl ]] ||
  fail 'default dry-run wrote an audit log'

root=$(new_fixture terminal-statuses)
for status in archived superseded; do
  job=social-monitor-$status-worker
  target=$(add_worktree "$root" "$job")
  write_ledger "$root" "$job" attempt-1 "$target" "$status"
done
output=$(run_janitor "$root")
[[ $output == *'eligible=2'* ]] || fail 'archived and superseded ledgers were not eligible'

root=$(new_fixture unregistered)
job=social-monitor-unregistered-worker
target=$root/worktrees/$job
mkdir "$target"
write_ledger "$root" "$job" attempt-1 "$target" archived
output=$(run_janitor "$root" --apply)
[[ -d $target && $output == *'removed=0'* ]] ||
  fail 'unregistered directory was not excluded'

root=$(new_fixture apply-and-replay)
job=social-monitor-replay-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target" rejected
run_janitor "$root" --apply >"$root/first-apply.out"
[[ ! -e $target ]] || fail 'apply did not remove the eligible synthetic worktree'
jq -e -s 'length == 1 and .[0].ledgerId == "social-monitor-replay-worker--attempt-1" and
  .[0].beforeBytes > 0 and .[0].afterBytes == 0 and
  (.[0].statusEvidenceSha256 | test("^[0-9a-f]{64}$")) and
  (.[0].patchEvidenceSha256 | test("^[0-9a-f]{64}$")) and
  (.[0].numstatEvidenceSha256 | test("^[0-9a-f]{64}$"))' \
  "$root/control/consumed-worktree-janitor.audit.jsonl" >/dev/null ||
  fail 'apply did not write the expected atomic receipt'
run_janitor "$root" --apply >"$root/replay.out"
jq -e -s 'length == 1' "$root/control/consumed-worktree-janitor.audit.jsonl" >/dev/null ||
  fail 'idempotent replay duplicated its audit receipt'
[[ $(<"$root/replay.out") == *'replayed=1'* ]] || fail 'idempotent replay was not reported'
printf 'tampered after receipt\n' >> \
  "$root/worker-jobs/$job/archives/$job-rejected-attempt-1/git-status.txt"
if run_janitor "$root" --apply >"$root/tampered-replay.out" 2>"$root/tampered-replay.err"; then
  fail 'replay accepted terminal evidence that changed after its receipt'
fi
jq -e -s 'length == 1' "$root/control/consumed-worktree-janitor.audit.jsonl" >/dev/null ||
  fail 'rejected evidence replay changed the audit ledger'

root=$(new_fixture traversal)
job=social-monitor-traversal-worker
target=$(add_worktree "$root" "$job" "$root/foreign-worktree")
write_ledger "$root" "$job" attempt-1 "$root/worktrees/../foreign-worktree"
assert_apply_rejected "$root" "$target"

root=$(new_fixture mismatched-workspace-job)
job=social-monitor-ledger-owner-worker
target=$(add_worktree "$root" social-monitor-different-worker)
write_ledger "$root" "$job" attempt-1 "$target"
assert_apply_rejected "$root" "$target"

root=$(new_fixture mismatched-archive-name)
job=social-monitor-archive-binding-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target" rejected \
  "$root/worker-jobs/$job/archives/borrowed-terminal-evidence"
assert_apply_rejected "$root" "$target"

root=$(new_fixture unavailable-integrated-commit)
job=social-monitor-unavailable-commit-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
item=$root/control/consumed-output-ledger/items/$job--attempt-1.json
jq '.commitSha = "0123456789abcdef0123456789abcdef01234567" |
  .integratedCommitSha = .commitSha | .commit = .commitSha' "$item" >"$root/invalid.json"
mv "$root/invalid.json" "$item"
assert_apply_rejected "$root" "$target"

root=$(new_fixture changed-after-terminal-evidence)
job=social-monitor-changed-after-terminal-worker
target=$(add_worktree "$root" "$job")
printf 'first terminal state\n' >>"$target/fixture.txt"
write_ledger "$root" "$job" attempt-1 "$target" rejected
printf 'unconsumed later state\n' >>"$target/fixture.txt"
assert_apply_rejected "$root" "$target"

root=$(new_fixture symlink)
job=social-monitor-symlink-worker
target=$(add_worktree "$root" "$job")
ln -s "$target" "$root/worktrees/social-monitor-symlink-alias"
write_ledger "$root" "$job" attempt-1 "$root/worktrees/social-monitor-symlink-alias"
assert_apply_rejected "$root" "$target"

root=$(new_fixture active-job)
job=social-monitor-active-job-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
printf '{"schemaVersion":1,"status":"running"}\n' > \
  "$root/worker-jobs/$job/$job.progress.json"
output=$(run_janitor "$root" --apply)
[[ -d $target && $output == *'reason=active-job'* ]] || fail 'active job was not excluded'

root=$(new_fixture active-process)
job=social-monitor-active-process-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
# shellcheck disable=SC2016 # The positional parameter belongs to the child shell.
bash -c 'cd "$1" && exec sleep 30' _ "$target" &
active_pid=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do
  [[ $(readlink -e "/proc/$active_pid/cwd" 2>/dev/null || true) == "$target" ]] && break
  sleep 0.05
done
output=$(run_janitor "$root" --apply)
kill "$active_pid"
wait "$active_pid" 2>/dev/null || true
[[ -d $target && $output == *'reason=active-process'* ]] ||
  fail 'active process was not excluded'

root=$(new_fixture active-tmux)
job=social-monitor-active-tmux-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
printf '%s\n' "$target" >"$root/.social-monitor-janitor-test-tmux-panes"
output=$(run_janitor "$root" --apply)
[[ -d $target && $output == *'reason=active-tmux-pane'* ]] ||
  fail 'active tmux pane was not excluded'

root=$(new_fixture active-operation)
job=social-monitor-active-operation-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
operation=$root/worker-jobs/controller/project-control-operations/op-1
mkdir -p "$operation"
# shellcheck disable=SC2016 # workspacePath is a jq variable.
jq -n --arg workspacePath "$target" \
  '{status:"running",args:{workspacePath:$workspacePath}}' >"$operation/operation.json"
output=$(run_janitor "$root" --apply)
[[ -d $target && $output == *'reason=active-running'* ]] ||
  fail 'active controller operation was not excluded'

root=$(new_fixture active-controller-job)
job=social-monitor-active-controller-job-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
jq -n --arg workspacePath "$target" '{workspacePath:$workspacePath}' > \
  "$root/control/controller-job.json"
output=$(run_janitor "$root" --apply)
[[ -d $target && $output == *'reason=controller-workspace'* ]] ||
  fail 'active controller job was not excluded'

root=$(new_fixture active-integration)
job=social-monitor-active-integration-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
attempt=$root/worker-jobs/controller/project-integration/integration-attempts/attempt-1
mkdir -p "$attempt"
# shellcheck disable=SC2016 # sourceWorkspacePath is a jq variable.
jq -n --arg sourceWorkspacePath "$target" \
  '{status:"checks_running",sourceWorkspacePath:$sourceWorkspacePath}' >"$attempt/attempt.json"
output=$(run_janitor "$root" --apply)
[[ -d $target && $output == *'reason=active-checks_running'* ]] ||
  fail 'active integration was not excluded'

root=$(new_fixture malformed-active-binding)
job=social-monitor-malformed-active-binding-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
attempt=$root/worker-jobs/controller/project-integration/integration-attempts/attempt-1
mkdir -p "$attempt"
printf '{"status":"checks_running","sourceWorkspacePath":"../relative"}\n' > \
  "$attempt/attempt.json"
assert_apply_rejected "$root" "$target"

root=$(new_fixture active-bootstrap)
job=social-monitor-active-bootstrap-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
operation=$root/worker-jobs/controller/dependency-bootstrap-operations/bootstrap-1
mkdir -p "$operation"
# shellcheck disable=SC2016 # workspacePath is a jq variable.
jq -n --arg workspacePath "$target" \
  '{status:"running",workspacePath:$workspacePath}' >"$operation/operation.json"
output=$(run_janitor "$root" --apply)
[[ -d $target && $output == *'reason=active-running'* ]] ||
  fail 'active bootstrap was not excluded'

root=$(new_fixture unsafe-activity-root)
job=social-monitor-unsafe-activity-root-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
mkdir -p "$root/synthetic-activity/op-1"
ln -s "$root/synthetic-activity" \
  "$root/worker-jobs/controller/project-control-operations"
printf '{"status":"running","workspacePath":"%s"}\n' "$target" > \
  "$root/synthetic-activity/op-1/operation.json"
assert_apply_rejected "$root" "$target"

root=$(new_fixture unsafe-controller-root)
job=social-monitor-unsafe-controller-root-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
mkdir "$root/synthetic-controller"
rmdir "$root/worker-jobs/controller"
ln -s "$root/synthetic-controller" "$root/worker-jobs/controller"
assert_apply_rejected "$root" "$target"

root=$(new_fixture malformed-controller-job)
job=social-monitor-malformed-controller-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
printf '{not-json\n' >"$root/control/controller-job.json"
assert_apply_rejected "$root" "$target"

root=$(new_fixture malformed-review-liveness)
job=social-monitor-malformed-review-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
printf '{"status":"unbound"}\n' >"$root/worker-jobs/$job/$job.review.json"
assert_apply_rejected "$root" "$target"

root=$(new_fixture locked-worktree)
job=social-monitor-locked-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
git -C "$root/integration" worktree lock --reason 'synthetic active ownership' "$target"
output=$(run_janitor "$root" --apply)
[[ -d $target && $output == *'reason=git-worktree-locked'* ]] ||
  fail 'locked Git worktree was not excluded'

root=$(new_fixture missing-archive)
job=social-monitor-missing-archive-worker
target=$(add_worktree "$root" "$job")
archive=$root/worker-jobs/$job/archives/missing
mkdir -p "$root/worker-jobs/$job"
# shellcheck disable=SC2016 # The dollar-prefixed names are jq variables.
jq -n --arg jobId "$job" --arg workspace "$target" --arg archive "$archive" \
  '{schemaVersion:1,jobId:$jobId,attemptId:"attempt-1",status:"rejected",
    closedAt:"2026-07-22T00:00:00.000Z",archivePath:$archive,
    backup:{workspace:$workspace,statusPath:($archive+"/git-status.txt"),
      patchPath:($archive+"/tracked.diff"),numstatPath:($archive+"/tracked.numstat")},
    consumedAt:"2026-07-22T00:00:00.000Z",
    notes:[{status:"rejected",text:"missing archive"}]}' > \
  "$root/control/consumed-output-ledger/items/$job--attempt-1.json"
assert_apply_rejected "$root" "$target"

root=$(new_fixture wrong-project)
job=social-monitor-wrong-project-worker
target=$(add_worktree "$root" "$job" "$root/other-project-worktree")
write_ledger "$root" "$job" attempt-1 "$target"
assert_apply_rejected "$root" "$target"

root=$(new_fixture conflicting-evidence)
job=social-monitor-conflicting-evidence-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
item=$root/control/consumed-output-ledger/items/$job--attempt-1.json
jq '.backup.patchPath = .backup.statusPath' "$item" >"$root/conflict.json"
mv "$root/conflict.json" "$item"
assert_apply_rejected "$root" "$target"

root=$(new_fixture malformed-json)
job=social-monitor-malformed-json-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
printf '{not-json\n' >"$root/control/consumed-output-ledger/items/bad.json"
assert_apply_rejected "$root" "$target"

root=$(new_fixture lock)
job=social-monitor-lock-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
(
  flock -n 9 || exit 1
  if run_janitor "$root" --apply >"$root/locked.out" 2>"$root/locked.err"; then
    exit 2
  fi
) 9>>"$root/control/worktree-cleanup.lock"
[[ -d $target ]] || fail 'project flock did not block concurrent apply'

service_source=$(<"$SERVICE")
timer_source=$(<"$TIMER")
entrypoint_source=$(<"$ENTRYPOINT")
[[ $service_source == *'ExecStart='* && $service_source != *'--apply'* ]] ||
  fail 'service is not safe dry-run by default'
[[ $service_source == *'ReadOnlyPaths=/var/data/social-monitor'* &&
  $service_source != *'ReadWritePaths='* ]] ||
  fail 'service does not enforce a read-only project root'
[[ $service_source != *'PrivateTmp=true'* ]] ||
  fail 'service private tmp would hide host tmux liveness sockets'
[[ $timer_source == *'OnCalendar='* ]] || fail 'timer contract is missing'
[[ $entrypoint_source == *'PROJECT_ROOT=/var/data/social-monitor'* ]] ||
  fail 'production project scope changed'
[[ $SUITE_ROOT == "$SCRIPT_DIR"/.consumed-worktree-janitor-test.* ]] ||
  fail 'destructive fixtures escaped the current worktree'
[[ $entrypoint_source == *'"$GIT" -C "$INTEGRATION" worktree remove --force -- "$target"'* ]] ||
  fail 'exact Git worktree removal command changed'
[[ $entrypoint_source == *'"$GIT" -C "$INTEGRATION" worktree prune --expire now'* ]] ||
  fail 'scoped Git worktree prune command changed'
recursive_remove='rm -'rf
recursive_remove_alt='rm -'fr
[[ $entrypoint_source != *"$recursive_remove"* && \
  $entrypoint_source != *"$recursive_remove_alt"* ]] ||
  fail 'recursive rm is forbidden in the janitor'

printf 'Consumed worktree janitor hermetic tests passed\n'
