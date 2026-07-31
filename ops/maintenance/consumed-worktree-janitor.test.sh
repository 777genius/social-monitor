#!/usr/bin/env bash
set -euo pipefail
umask 022

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
  git init -q -b main "$root/integration"
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

add_relocated_worktree() {
  local root=$1 name=$2
  local logical=$root/worktrees/$name
  local target=$root/worktrees/.volume2/root-worktree-archive-20260727/$name
  add_worktree "$root" "$name" "$target" >/dev/null
  ln -s "$target" "$logical"
  printf '%s\t%s\n' "$logical" "$target"
}

write_ledger() {
  local root=$1
  local job_id=$2
  local attempt_id=$3
  local workspace=$4
  local status=${5:-integrated}
  local archive=${6:-$root/worker-jobs/$job_id/archives/$job_id-$status-$attempt_id}
  local integrated_commit=${7:-}
  local registry=${8:-registry-v4}
  mkdir -p "$archive"
  git -c status.showUntrackedFiles=all -C "$workspace" status --short > \
    "$archive/git-status.txt"
  git -C "$workspace" diff --no-ext-diff --binary HEAD -- >"$archive/tracked.diff"
  git -C "$workspace" diff --no-ext-diff --numstat HEAD -- >"$archive/tracked.numstat"
  [[ -n $integrated_commit ]] ||
    integrated_commit=$(git -C "$root/integration" rev-parse refs/heads/main)
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
  [[ $registry == none ]] || write_registry_binding "$root" "$job_id" "$workspace" "$registry"
}

write_reviewed_output() {
  local root=$1 reviewed_id=$2 job_id=$3 workspace=$4 archived_patch=$5
  local output_root=$root/worker-jobs/reviewed-worker-outputs/$reviewed_id
  local output_patch=$output_root/output.patch patch_hash
  mkdir -p "$output_root"
  cp "$archived_patch" "$output_patch"
  patch_hash=$(sha256sum "$output_patch")
  patch_hash=${patch_hash%%[[:space:]]*}
  # shellcheck disable=SC2016 # The dollar-prefixed names are jq variables.
  jq -n --arg id "$reviewed_id" --arg job "$job_id" \
    --arg workspace "$workspace" --arg patch "$output_patch" --arg hash "$patch_hash" \
    '{format:"reviewed-worker-output",formatRevision:1,projectId:"social-monitor",
      reviewedOutputId:$id,workerJobId:$job,sourceWorkspacePath:$workspace,
      patchPath:$patch,patchSha256:$hash,reviewDecision:{decision:"rejected"}}' \
    >"$output_root/manifest.json"
}

write_registry_binding() {
  local root=$1 job_id=$2 workspace=$3 registry=${4:-registry-v2}
  local binding_root=$root/worker-jobs/$registry/$job_id
  mkdir -p "$binding_root"
  jq -n --arg jobId "$job_id" --arg workspacePath "$workspace" \
    '{jobId:$jobId,workspacePath:$workspacePath}' >"$binding_root/job.json"
}
write_fake_process() {
  local root=$1 pid=$2 state=$3 kthread=$4 starttime=$5 resources=$6
  local recheck_starttime=${7:-} scan_sequence=${8:-} held_path=${9:-$root/control}
  local process_root=$root/.social-monitor-janitor-test-proc process_dir
  local stat_tail=S field
  [[ -z $scan_sequence ]] || process_root=$process_root/.scan-$scan_sequence
  process_dir=$process_root/$pid
  mkdir -p "$process_dir/fd"
  for ((field = 4; field <= 21; field++)); do stat_tail+=' 0'; done
  printf '%s (fixture) %s %s\n' "$pid" "$stat_tail" "$starttime" >"$process_dir/stat"
  if [[ -n $recheck_starttime ]]; then
    printf '%s (fixture) %s %s\n' "$pid" "$stat_tail" "$recheck_starttime" \
      >"$process_dir/stat.recheck"
  fi
  printf 'Name:\tfixture\nState:\t%s\nKthread:\t%s\n' "$state" "$kthread" \
    >"$process_dir/status"
  if [[ $resources == yes ]]; then
    ln -s "$held_path" "$process_dir/cwd"
    ln -s / "$process_dir/root"
    ln -s /usr/bin/bash "$process_dir/exe"
  fi
}

run_janitor() {
  local root=$1
  shift
  SOCIAL_MONITOR_JANITOR_ALLOW_TEST_ROOT=1 \
    SOCIAL_MONITOR_JANITOR_TEST_PARENT="$SUITE_ROOT" \
    SOCIAL_MONITOR_JANITOR_TEST_WRONG_OWNER_PATH="${JANITOR_WRONG_OWNER_PATH:-}" \
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

relocated_plan_sha() {
  local output=$1 line
  while IFS= read -r line; do
    if [[ $line == relocated-plan\ schemaVersion=2\ sha256=* ]]; then
      line=${line#*sha256=}
      printf '%s\n' "${line%% *}"
      return 0
    fi
  done <<<"$output"
  return 1
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

root=$(new_fixture exact-roots-and-terminal-archive-forms)
job=social-monitor-standard-archive-worker
target=$(add_worktree "$root" "$job")
archive=$root/.subscription-runtime/social-monitor-project-controller-v2/archives/$job-rejected-attempt-1
write_ledger "$root" "$job" attempt-1 "$target" rejected "$archive" "" registry
job=social-monitor-uncaptured-archive-worker
target=$(add_worktree "$root" "$job")
printf 'uncaptured patch\n' >>"$target/fixture.txt"
hash=$(git -C "$target" diff --no-ext-diff --binary HEAD -- | sha256sum)
hash=${hash%%[[:space:]]*}
attempt=uncaptured-rejection-$hash
archive=$root/worker-jobs/controller-v4/archives/$job-rejected-uncaptured-$hash
write_ledger "$root" "$job" "$attempt" "$target" rejected "$archive" "" registry-v2
job=social-monitor-reviewed-archive-worker
target=$(add_worktree "$root" "$job")
printf 'reviewed patch\n' >>"$target/fixture.txt"
reviewed_id=$(printf 'reviewed fixture\n' | sha256sum)
reviewed_id=${reviewed_id%%[[:space:]]*}
archive=$root/worker-jobs/controller/archives/$job-rejected-reviewed-$reviewed_id
write_ledger "$root" "$job" "$reviewed_id" "$target" rejected "$archive" "" registry-v3
write_reviewed_output "$root" "$reviewed_id" "$job" "$target" "$archive/tracked.diff"
job=social-monitor-integrated-archive-worker
target=$(add_worktree "$root" "$job")
commit=$(git -C "$root/integration" rev-parse refs/heads/main)
archive=$root/worker-jobs/$job/archives/$job-integrated-${commit:0:12}-attempt-1
write_ledger "$root" "$job" attempt-1 "$target" integrated "$archive" "$commit" registry-v4
output=$(run_janitor "$root")
[[ $output == *'eligible=4'* ]] ||
  fail 'four exact archive root/name forms were not eligible'

root=$(new_fixture legacy-registry-bound)
alias_job=social-monitor-legacy-alias-worker
alias_target=$(add_worktree "$root" "$alias_job" \
  "$root/worktrees/social-monitor-consumed-alias")
write_ledger "$root" "$alias_job" attempt-1 "$alias_target" rejected
normal_job=social-monitor-normal-candidate-worker
normal_target=$(add_worktree "$root" "$normal_job")
write_ledger "$root" "$normal_job" attempt-1 "$normal_target" rejected
output=$(run_janitor "$root")
[[ $output == *"excluded reason=legacy-registry-bound ledger=$alias_job--attempt-1 worktree=$alias_target"* &&
  $output == *"would-remove ledger=$normal_job--attempt-1 worktree=$normal_target"* &&
  $output == *'eligible=1'* ]] ||
  fail 'trusted legacy alias was not excluded beside a normal candidate'
output=$(run_janitor "$root" --apply)
[[ -d $alias_target && ! -e $normal_target &&
  $output == *"excluded reason=legacy-registry-bound ledger=$alias_job--attempt-1"* ]] ||
  fail 'apply did not preserve the trusted legacy alias'
jq -e -s --arg ledger "$normal_job--attempt-1" \
  'length == 1 and .[0].ledgerId == $ledger' \
  "$root/control/consumed-worktree-janitor.audit.jsonl" >/dev/null ||
  fail 'apply wrote a receipt for the preserved legacy alias'

root=$(new_fixture legacy-binding-absent)
job=social-monitor-legacy-binding-absent-worker
target=$(add_worktree "$root" "$job" "$root/worktrees/social-monitor-absent-alias")
write_ledger "$root" "$job" attempt-1 "$target" rejected "" "" none
assert_apply_rejected "$root" "$target"

root=$(new_fixture legacy-binding-mismatch)
job=social-monitor-legacy-binding-mismatch-worker
target=$(add_worktree "$root" "$job" "$root/worktrees/social-monitor-mismatch-alias")
write_ledger "$root" "$job" attempt-1 "$target" rejected "" "" none
write_registry_binding "$root" "$job" "$root/worktrees/social-monitor-other-alias"
assert_apply_rejected "$root" "$target"

root=$(new_fixture legacy-binding-malformed)
job=social-monitor-legacy-binding-malformed-worker
target=$(add_worktree "$root" "$job" "$root/worktrees/social-monitor-malformed-alias")
write_ledger "$root" "$job" attempt-1 "$target" rejected "" "" none
write_registry_binding "$root" "$job" "$target"
printf '{not-json\n' >"$root/worker-jobs/registry-v2/$job/job.json"
assert_apply_rejected "$root" "$target"

root=$(new_fixture legacy-binding-duplicate)
job=social-monitor-legacy-binding-duplicate-worker
target=$(add_worktree "$root" "$job" "$root/worktrees/social-monitor-duplicate-alias")
write_ledger "$root" "$job" attempt-1 "$target" rejected "" "" none
write_registry_binding "$root" "$job" "$target" registry-v3
write_registry_binding "$root" "$job" "$target" registry-v4
assert_apply_rejected "$root" "$target"

root=$(new_fixture sibling-registry-not-globbed)
job=social-monitor-sibling-registry-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target" rejected "" "" none
write_registry_binding "$root" "$job" "$target" registry-v5
assert_apply_rejected "$root" "$target"

for binding_case in symlink writable wrong-owner; do
  JANITOR_WRONG_OWNER_PATH=
  root=$(new_fixture unsafe-registry-binding-$binding_case)
  job=social-monitor-unsafe-registry-binding-$binding_case-worker
  target=$(add_worktree "$root" "$job")
  write_ledger "$root" "$job" attempt-1 "$target" rejected
  binding=$root/worker-jobs/registry-v4/$job/job.json
  case $binding_case in
    symlink)
      mv "$binding" "$binding.real"
      ln -s "$binding.real" "$binding"
      ;;
    writable) chmod g+w "${binding%/*}" ;;
    wrong-owner) JANITOR_WRONG_OWNER_PATH=$binding ;;
  esac
  assert_apply_rejected "$root" "$target"
done
unset JANITOR_WRONG_OWNER_PATH

root=$(new_fixture terminal-statuses)
for status in archived superseded; do
  job=social-monitor-$status-worker
  target=$(add_worktree "$root" "$job")
  write_ledger "$root" "$job" attempt-1 "$target" "$status"
done
output=$(run_janitor "$root")
[[ $output == *'eligible=2'* ]] || fail 'archived and superseded ledgers were not eligible'

root=$(new_fixture volume2-dry-run-only)
direct_job=social-monitor-volume2-direct-worker
direct_target=$(add_worktree "$root" "$direct_job" \
  "$root/worktrees/.volume2/$direct_job")
write_ledger "$root" "$direct_job" attempt-1 "$direct_target" rejected
nested_job=social-monitor-volume2-nested-worker
nested_target=$(add_worktree "$root" "$nested_job" \
  "$root/worktrees/.volume2/$nested_job/worktree")
write_ledger "$root" "$nested_job" attempt-1 "$nested_target" rejected
legacy_job=social-monitor-volume2-legacy-worker
legacy_target=$(add_worktree "$root" "$legacy_job" \
  "$root/worktrees/.volume2/$legacy_job/legacy/worktree")
write_ledger "$root" "$legacy_job" attempt-1 "$legacy_target" rejected
output=$(run_janitor "$root")
[[ $output == *"would-remove ledger=$direct_job--attempt-1 worktree=$direct_target"* &&
  $output == *"would-remove ledger=$nested_job--attempt-1 worktree=$nested_target"* &&
  $output == *"excluded reason=legacy-registry-bound ledger=$legacy_job--attempt-1"* &&
  $output == *'eligible=2'* ]] ||
  fail 'volume2 dry-run discovery was not strict and complete'
[[ -d $direct_target && -d $nested_target && -d $legacy_target ]] ||
  fail 'volume2 dry run changed a fixture target'
[[ ! -e $root/control/consumed-worktree-janitor.audit.jsonl ]] ||
  fail 'volume2 dry run wrote an audit receipt'
output=$(run_janitor "$root" --apply)
[[ $output == *"excluded reason=volume2-dry-run-only ledger=$direct_job--attempt-1"* &&
  $output == *"excluded reason=volume2-dry-run-only ledger=$nested_job--attempt-1"* &&
  $output == *"excluded reason=legacy-registry-bound ledger=$legacy_job--attempt-1"* &&
  $output != *'would-remove'* && $output == *'eligible=0'* &&
  $output == *'removed=0'* ]] ||
  fail 'volume2 apply did not explicitly exclude every fixture target'
[[ -d $direct_target && -d $nested_target && -d $legacy_target ]] ||
  fail 'volume2 apply removed a fixture target'
[[ ! -e $root/control/consumed-worktree-janitor.audit.jsonl ]] ||
  fail 'volume2 apply wrote an audit receipt'

readonly RELOCATED_CASES=$SCRIPT_DIR/consumed-worktree-janitor-relocated.test-cases.sh
# shellcheck source=consumed-worktree-janitor-relocated.test-cases.sh
source "$RELOCATED_CASES"

readonly VOLUME2_APPLY_CASES=$SCRIPT_DIR/consumed-worktree-janitor-volume2-apply.test.sh
# shellcheck source=consumed-worktree-janitor-volume2-apply.test.sh
source "$VOLUME2_APPLY_CASES"

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
write_ledger "$root" "$job" attempt-1 "$target" integrated "" "" none
write_registry_binding "$root" "$job" "$target" registry-v4
binding=$root/worker-jobs/registry-v4/$job/job.json
jq '.jobId = "social-monitor-different-worker"' "$binding" >"$root/wrong-job.json"
mv "$root/wrong-job.json" "$binding"
assert_apply_rejected "$root" "$target"

root=$(new_fixture mismatched-archive-name)
job=social-monitor-archive-binding-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target" rejected \
  "$root/worker-jobs/$job/archives/$job-rejected-unknown-attempt-1"
assert_apply_rejected "$root" "$target"

for root_case in unknown external-sibling controller-sibling wrong-job noncanonical; do
  root=$(new_fixture archive-root-$root_case)
  job=social-monitor-archive-root-$root_case-worker
  target=$(add_worktree "$root" "$job")
  name=$job-rejected-attempt-1
  case $root_case in
    unknown) archive=$root/unlisted/archives/$name ;;
    external-sibling)
      archive=$root/.subscription-runtime/social-monitor-project-controller-v3/archives/$name
      ;;
    controller-sibling) archive=$root/worker-jobs/controller-v5/archives/$name ;;
    wrong-job)
      archive=$root/worker-jobs/social-monitor-different-job/archives/$name
      ;;
    noncanonical)
      archive=$root/worker-jobs/$job/archives/../archives/$name
      ;;
  esac
  write_ledger "$root" "$job" attempt-1 "$target" rejected "$archive"
  assert_apply_rejected "$root" "$target"
done

for unsafe_case in symlink-parent symlink-root symlink-archive \
  writable-parent writable-root writable-archive wrong-owner; do
  JANITOR_WRONG_OWNER_PATH=
  root=$(new_fixture unsafe-archive-$unsafe_case)
  job=social-monitor-unsafe-archive-$unsafe_case-worker
  target=$(add_worktree "$root" "$job")
  archive_parent=$root/worker-jobs/controller-v4
  archive_root=$archive_parent/archives
  archive=$archive_root/$job-rejected-attempt-1
  write_ledger "$root" "$job" attempt-1 "$target" rejected "$archive"
  case $unsafe_case in
    symlink-parent)
      mv "$archive_parent" "$archive_parent.real"
      ln -s "$archive_parent.real" "$archive_parent"
      ;;
    symlink-root)
      mv "$archive_root" "$archive_root.real"
      ln -s "$archive_root.real" "$archive_root"
      ;;
    symlink-archive)
      mv "$archive" "$archive.real"
      ln -s "$archive.real" "$archive"
      ;;
    writable-parent) chmod g+w "$archive_parent" ;;
    writable-root) chmod g+w "$archive_root" ;;
    writable-archive) chmod g+w "$archive" ;;
    wrong-owner) JANITOR_WRONG_OWNER_PATH=$archive ;;
  esac
  assert_apply_rejected "$root" "$target"
done
unset JANITOR_WRONG_OWNER_PATH

for evidence_name in git-status.txt tracked.diff tracked.numstat; do
  for evidence_case in symlink wrong-owner writable; do
    JANITOR_WRONG_OWNER_PATH=
    root=$(new_fixture unsafe-terminal-evidence-${evidence_name//./-}-$evidence_case)
    job=social-monitor-unsafe-terminal-evidence-${evidence_name//./-}-$evidence_case-worker
    target=$(add_worktree "$root" "$job")
    write_ledger "$root" "$job" attempt-1 "$target" rejected
    evidence=$root/worker-jobs/$job/archives/$job-rejected-attempt-1/$evidence_name
    case $evidence_case in
      symlink)
        mv "$evidence" "$evidence.real"
        ln -s "$evidence.real" "$evidence"
        ;;
      wrong-owner) JANITOR_WRONG_OWNER_PATH=$evidence ;;
      writable) chmod g+w "$evidence" ;;
    esac
    assert_apply_rejected "$root" "$target"
  done
done
unset JANITOR_WRONG_OWNER_PATH

root=$(new_fixture uncaptured-hash-mismatch)
job=social-monitor-uncaptured-hash-mismatch-worker
target=$(add_worktree "$root" "$job")
hash=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
attempt=uncaptured-rejection-$hash
archive=$root/worker-jobs/$job/archives/$job-rejected-uncaptured-$hash
write_ledger "$root" "$job" "$attempt" "$target" rejected "$archive"
assert_apply_rejected "$root" "$target"

root=$(new_fixture reviewed-output-absent)
job=social-monitor-reviewed-output-absent-worker
target=$(add_worktree "$root" "$job")
reviewed_id=1123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
archive=$root/worker-jobs/$job/archives/$job-rejected-reviewed-$reviewed_id
write_ledger "$root" "$job" "$reviewed_id" "$target" rejected "$archive"
assert_apply_rejected "$root" "$target"

for conflict in job workspace; do
  root=$(new_fixture reviewed-output-wrong-$conflict)
  job=social-monitor-reviewed-output-wrong-$conflict-worker
  target=$(add_worktree "$root" "$job")
  reviewed_id=$(printf 'wrong %s\n' "$conflict" | sha256sum)
  reviewed_id=${reviewed_id%%[[:space:]]*}
  archive=$root/worker-jobs/$job/archives/$job-rejected-reviewed-$reviewed_id
  write_ledger "$root" "$job" "$reviewed_id" "$target" rejected "$archive"
  write_reviewed_output "$root" "$reviewed_id" "$job" "$target" "$archive/tracked.diff"
  manifest=$root/worker-jobs/reviewed-worker-outputs/$reviewed_id/manifest.json
  jq ".$conflict = \"borrowed\"" "$manifest" >"$root/conflict.json"
  if [[ $conflict == job ]]; then
    jq '.workerJobId = .job | del(.job)' "$root/conflict.json" >"$manifest"
  else
    jq '.sourceWorkspacePath = .workspace | del(.workspace)' "$root/conflict.json" >"$manifest"
  fi
  assert_apply_rejected "$root" "$target"
done

root=$(new_fixture reviewed-output-borrowed)
job=social-monitor-reviewed-output-borrowed-worker
target=$(add_worktree "$root" "$job")
reviewed_id=2123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
archive=$root/worker-jobs/$job/archives/$job-rejected-reviewed-$reviewed_id
write_ledger "$root" "$job" "$reviewed_id" "$target" rejected "$archive"
write_reviewed_output "$root" "$reviewed_id" "$job" "$target" "$archive/tracked.diff"
manifest=$root/worker-jobs/reviewed-worker-outputs/$reviewed_id/manifest.json
jq '.patchPath = (.patchPath + ".borrowed")' "$manifest" >"$root/borrowed.json"
mv "$root/borrowed.json" "$manifest"
assert_apply_rejected "$root" "$target"

root=$(new_fixture reviewed-output-mutated-patch)
job=social-monitor-reviewed-output-mutated-patch-worker
target=$(add_worktree "$root" "$job")
reviewed_id=3123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
archive=$root/worker-jobs/$job/archives/$job-rejected-reviewed-$reviewed_id
write_ledger "$root" "$job" "$reviewed_id" "$target" rejected "$archive"
write_reviewed_output "$root" "$reviewed_id" "$job" "$target" "$archive/tracked.diff"
printf 'mutated\n' >>"$root/worker-jobs/reviewed-worker-outputs/$reviewed_id/output.patch"
assert_apply_rejected "$root" "$target"

root=$(new_fixture integrated-wrong-commit-prefix)
job=social-monitor-integrated-wrong-prefix-worker
target=$(add_worktree "$root" "$job")
archive=$root/worker-jobs/$job/archives/$job-integrated-deadbeefdead-attempt-1
write_ledger "$root" "$job" attempt-1 "$target" integrated "$archive"
assert_apply_rejected "$root" "$target"

root=$(new_fixture unavailable-integrated-commit)
job=social-monitor-unavailable-commit-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
item=$root/control/consumed-output-ledger/items/$job--attempt-1.json
jq '.commitSha = "0123456789abcdef0123456789abcdef01234567" |
  .integratedCommitSha = .commitSha | .commit = .commitSha' "$item" >"$root/invalid.json"
mv "$root/invalid.json" "$item"
output=$(run_janitor "$root" --apply)
[[ -d $target && $output == *'reason=integrated-commit-unavailable'* &&
  $output == *'eligible=0'* && $output == *'removed=0'* ]] ||
  fail 'unavailable integrated commit was not excluded'

root=$(new_fixture historical-integrated-commits-not-retained)
for number in {01..26}; do
  job=social-monitor-historical-not-retained-$number
  target=$(add_worktree "$root" "$job")
  printf '%s\n' "$number" >"$target/historical-$number.txt"
  git -C "$target" add "historical-$number.txt"
  git -C "$target" commit -qm "historical unretained $number"
  commit=$(git -C "$target" rev-parse HEAD)
  archive=$root/worker-jobs/$job/archives/$job-integrated-${commit:0:12}-attempt-1
  write_ledger "$root" "$job" attempt-1 "$target" integrated "$archive" "$commit"
done
output=$(run_janitor "$root" --apply)
[[ $output != *'would-remove'* && $output == *'eligible=0'* &&
  $output == *'removed=0'* && $output == *'excluded=26'* ]] ||
  fail 'the 26 historical non-retained commits were not all excluded'
for number in {01..26}; do
  job=social-monitor-historical-not-retained-$number
  [[ -d $root/worktrees/$job &&
    $output == *"reason=integrated-commit-not-retained ledger=$job--attempt-1"* ]] ||
    fail "historical non-retained commit was not preserved: $number"
done
[[ ! -e $root/control/consumed-worktree-janitor.audit.jsonl ]] ||
  fail 'non-retained integrated commits wrote an audit receipt'

root=$(new_fixture nonterminal-archive-name-mismatch)
job=social-monitor-nonterminal-name-mismatch-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target" running \
  "$root/worker-jobs/$job/archives/$job-running-unknown-attempt-1"
find "$root/worker-jobs/$job/archives" -depth -delete
terminal_job=social-monitor-nonterminal-neighbor-worker
terminal_target=$(add_worktree "$root" "$terminal_job")
write_ledger "$root" "$terminal_job" attempt-1 "$terminal_target" rejected
output=$(run_janitor "$root")
[[ $output == *"would-remove ledger=$terminal_job--attempt-1"* &&
  $output == *'eligible=1'* && $output == *'excluded=1'* ]] ||
  fail 'nonterminal missing/bad archive aborted or became eligible'

root=$(new_fixture changed-after-terminal-evidence)
conflict_job=social-monitor-changed-after-terminal-worker safe_job=social-monitor-independent-unchanged-worker
conflict_target=$(add_worktree "$root" "$conflict_job")
printf 'first terminal state\n' >>"$conflict_target/fixture.txt"
write_ledger "$root" "$conflict_job" attempt-1 "$conflict_target" rejected
printf 'unconsumed later state\n' >>"$conflict_target/fixture.txt"
safe_target=$(add_worktree "$root" "$safe_job")
write_ledger "$root" "$safe_job" attempt-1 "$safe_target" rejected
output=$(run_janitor "$root" --apply)
[[ $output == *"excluded reason=terminal-evidence-conflict ledger=$conflict_job--attempt-1 worktree=$conflict_target target=$conflict_target"* &&
  $output == *"removed ledger=$safe_job--attempt-1 worktree=$safe_target"* &&
  $output == *'eligible=1 removed=1 replayed=0 excluded=1'* && -d $conflict_target && ! -e $safe_target ]] || fail 'mixed terminal evidence conflict did not exclude only the changed target'

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

root=$(new_fixture terminal-review-tmux-false)
job=social-monitor-terminal-review-tmux-false-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target" rejected
printf '{"status":{"tmuxAlive":false,"resultStatus":"rejected"}}\n' > \
  "$root/worker-jobs/$job/$job.review.json"
output=$(run_janitor "$root")
[[ $output == *"would-remove ledger=$job--attempt-1"* && $output == *'eligible=1'* ]] ||
  fail 'terminal review evidence with tmuxAlive=false was not admitted'

root=$(new_fixture active-process)
job=social-monitor-active-process-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
printf '%s\n' "$target/held-open.txt" > \
  "$root/.social-monitor-janitor-test-process-paths"
output=$(run_janitor "$root" --apply)
[[ -d $target && $output == *'reason=active-process'* ]] ||
  fail 'synthetic active process was not excluded'

root=$(new_fixture resource-less-processes)
job=social-monitor-resource-less-processes-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
write_fake_process "$root" 101 'S (sleeping)' 1 100 no
write_fake_process "$root" 102 'Z (zombie)' 0 200 no
output=$(run_janitor "$root")
[[ $output == *"would-remove ledger=$job--attempt-1"* ]] ||
  fail 'explicit kernel thread and zombie statuses did not skip resource checks'

root=$(new_fixture live-process-unreadable)
job=social-monitor-live-process-unreadable-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
write_fake_process "$root" 201 'S (sleeping)' 0 300 no
if run_janitor "$root" >"$root/live-unreadable.out" 2>"$root/live-unreadable.err"; then
  fail 'stable live process with unreadable resources did not fail closed'
fi
[[ $(<"$root/live-unreadable.err") == *'process-use snapshot was incomplete'* ]] ||
  fail 'stable live unreadable process reported the wrong blocker'

root=$(new_fixture transient-process-snapshot-reset)
job=social-monitor-transient-process-snapshot-reset-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target" rejected
write_fake_process "$root" 202 'S (sleeping)' 0 302 yes "" 1 "$target"
write_fake_process "$root" 203 'S (sleeping)' 0 303 no "" 1
mkdir -p "$root/.social-monitor-janitor-test-proc/.scan-2"
output=$(run_janitor "$root")
[[ -d $target && $output == *"would-remove ledger=$job--attempt-1 worktree=$target"* ]] ||
  fail 'transient process snapshot retained incomplete-attempt evidence'

root=$(new_fixture persistent-incomplete-process-snapshot)
job=social-monitor-persistent-incomplete-process-snapshot-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target" rejected
for scan_sequence in 1 2 3; do
  write_fake_process "$root" $((203 + scan_sequence)) 'S (sleeping)' 0 \
    $((303 + scan_sequence)) no "" "$scan_sequence"
done
if run_janitor "$root" --apply >"$root/persistent-snapshot.out" \
  2>"$root/persistent-snapshot.err"; then
  fail 'persistent incomplete process snapshot did not fail closed'
fi
[[ -d $target && $(<"$root/persistent-snapshot.err") == \
  *'process-use snapshot was incomplete; refusing to proceed'* ]] ||
  fail 'persistent incomplete process snapshot changed the target or blocker'

root=$(new_fixture active-process-on-snapshot-retry)
job=social-monitor-active-process-on-snapshot-retry-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target" rejected
write_fake_process "$root" 207 'S (sleeping)' 0 307 no "" 1
write_fake_process "$root" 208 'S (sleeping)' 0 308 yes "" 2 "$target"
output=$(run_janitor "$root" --apply)
[[ -d $target && $output == *"excluded reason=active-process ledger=$job--attempt-1"* ]] ||
  fail 'active process discovered during snapshot retry was not excluded'

root=$(new_fixture transient-live-process-recheck)
job=social-monitor-transient-live-process-recheck-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target" rejected
mkdir -p "$root/.social-monitor-janitor-test-proc/.scan-1" \
  "$root/.social-monitor-janitor-test-proc/.scan-3"
write_fake_process "$root" 211 'S (sleeping)' 0 310 no "" 2
output=$(run_janitor "$root" --apply)
[[ ! -e $target && $output == *"removed ledger=$job--attempt-1 worktree=$target"* ]] ||
  fail 'transient incomplete live process recheck did not retry and apply'

root=$(new_fixture persistent-live-process-recheck)
job=social-monitor-persistent-live-process-recheck-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target" rejected
mkdir -p "$root/.social-monitor-janitor-test-proc/.scan-1"
for scan_sequence in 2 3 4; do
  write_fake_process "$root" $((220 + scan_sequence)) 'S (sleeping)' 0 \
    $((320 + scan_sequence)) no "" "$scan_sequence"
done
if run_janitor "$root" --apply >"$root/persistent-recheck.out" \
  2>"$root/persistent-recheck.err"; then
  fail 'persistent incomplete live process recheck did not fail closed'
fi
[[ -d $target && $(<"$root/persistent-recheck.err") == *'process-use recheck was incomplete'* ]] ||
  fail 'persistent incomplete live process recheck changed the target or blocker'

root=$(new_fixture active-during-live-process-retry)
job=social-monitor-active-during-live-process-retry-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target" rejected
mkdir -p "$root/.social-monitor-janitor-test-proc/.scan-1" \
  "$root/.social-monitor-janitor-test-proc/.scan-4"
write_fake_process "$root" 231 'S (sleeping)' 0 331 no "" 2
write_fake_process "$root" 232 'S (sleeping)' 0 332 yes "" 3 "$target"
if run_janitor "$root" --apply >"$root/active-retry.out" 2>"$root/active-retry.err"; then
  fail 'active process discovered during retry did not block immediately'
fi
[[ -d $target && $(<"$root/active-retry.err") == *"process entered worktree before apply: $target"* ]] ||
  fail 'active process discovered during retry changed the target or blocker'

root=$(new_fixture reused-process-id)
job=social-monitor-reused-process-id-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
write_fake_process "$root" 301 'S (sleeping)' 0 400 no 401
output=$(run_janitor "$root")
[[ $output == *"would-remove ledger=$job--attempt-1"* ]] ||
  fail 'changed process starttime was not treated as a PID reuse race'

root=$(new_fixture nonexplicit-resource-less-status)
job=social-monitor-nonexplicit-resource-less-status-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
write_fake_process "$root" 401 'X (unknown)' 0 500 no
if run_janitor "$root" >"$root/nonexplicit.out" 2>"$root/nonexplicit.err"; then
  fail 'non-explicit process status bypassed fail-closed resource checks'
fi

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

root=$(new_fixture controller-control-context)
job=social-monitor-controller-control-context-worker
target=$(add_worktree "$root" "$job")
write_ledger "$root" "$job" attempt-1 "$target"
jq -n --arg workspacePath "$root/control" '{workspacePath:$workspacePath}' > \
  "$root/control/controller-job.json"
output=$(run_janitor "$root")
[[ $output == *"would-remove ledger=$job--attempt-1"* ]] ||
  fail 'exact controller control-root context blocked an unrelated candidate'

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
write_registry_binding "$root" "$job" "$target" registry-v4
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
implementation_source=$(<"$SCRIPT_DIR/consumed-worktree-janitor-relocated-apply.sh")
volume2_source=$(<"$SCRIPT_DIR/consumed-worktree-janitor-volume2-apply.sh")
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
[[ $implementation_source == *'"$GIT" -C "$INTEGRATION" worktree remove --force -- "$target"'* ]] ||
  fail 'exact Git worktree removal command changed'
[[ $volume2_source == *'"$GIT" -C "$INTEGRATION" worktree remove --force -- "$target"'* ]] ||
  fail 'exact volume2 Git worktree removal command changed'
[[ $entrypoint_source != *'worktree prune'* && $implementation_source != *'worktree prune'* &&
  $volume2_source != *'worktree prune'* ]] ||
  fail 'Git worktree prune is forbidden in the janitor'
recursive_remove='rm -'rf
recursive_remove_alt='rm -'fr
runtime_source=$entrypoint_source$implementation_source$volume2_source
[[ $runtime_source != *"$recursive_remove"* && $runtime_source != *"$recursive_remove_alt"* ]] ||
  fail 'recursive rm is forbidden in the janitor'

printf 'Consumed worktree janitor hermetic tests passed\n'
