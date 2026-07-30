#!/usr/bin/env bash
set -euo pipefail

readonly GIT=/usr/bin/git
readonly JQ=/usr/bin/jq
readonly REALPATH=/usr/bin/realpath
readonly FLOCK=/usr/bin/flock
readonly DU=/usr/bin/du
readonly READLINK=/usr/bin/readlink
readonly SHA256SUM=/usr/bin/sha256sum
readonly DATE=/usr/bin/date
readonly MKTEMP=/usr/bin/mktemp
readonly CP=/usr/bin/cp
readonly MV=/usr/bin/mv
readonly UNLINK=/usr/bin/unlink
readonly CMP=/usr/bin/cmp
readonly PROCESS_SNAPSHOT_LIMIT=65536

MODE=dry-run
MODE_SEEN=0
TEST_ROOT=
AUDIT_TMP=

fail() {
  printf 'consumed-worktree-janitor: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [[ -n $AUDIT_TMP && -f $AUDIT_TMP && ! -L $AUDIT_TMP ]]; then
    "$UNLINK" -- "$AUDIT_TMP"
  fi
}
trap cleanup EXIT

usage() {
  printf '%s\n' \
    'usage: consumed-worktree-janitor.sh [--dry-run | --apply]' \
    '       consumed-worktree-janitor.sh [--dry-run | --apply] --test-root PATH'
}

while (($# > 0)); do
  case $1 in
    --dry-run)
      ((MODE_SEEN == 0)) || fail 'choose exactly one execution mode'
      MODE=dry-run
      MODE_SEEN=1
      ;;
    --apply)
      ((MODE_SEEN == 0)) || fail 'choose exactly one execution mode'
      MODE=apply
      MODE_SEEN=1
      ;;
    --test-root)
      shift
      (($# > 0)) || fail '--test-root requires a path'
      [[ -z $TEST_ROOT ]] || fail '--test-root may be specified only once'
      TEST_ROOT=$1
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
  shift
done

for tool in "$GIT" "$JQ" "$REALPATH" "$FLOCK" "$DU" "$READLINK" \
  "$SHA256SUM" "$DATE" "$MKTEMP" "$CP" "$MV" "$UNLINK" "$CMP"; do
  [[ -x $tool ]] || fail "required tool is unavailable: $tool"
done

SCRIPT_PATH=$("$REALPATH" -e -- "${BASH_SOURCE[0]}") || fail 'cannot canonicalize script path'
readonly SCRIPT_PATH
readonly SCRIPT_DIRECTORY=${SCRIPT_PATH%/*}

if [[ -n $TEST_ROOT ]]; then
  [[ ${SOCIAL_MONITOR_JANITOR_ALLOW_TEST_ROOT:-} == 1 ]] ||
    fail '--test-root is restricted to the hermetic test harness'
  [[ -n ${SOCIAL_MONITOR_JANITOR_TEST_PARENT:-} ]] ||
    fail 'the hermetic test parent is required'
  [[ -d $TEST_ROOT && ! -L $TEST_ROOT ]] || fail 'test root must be a real directory'
  PROJECT_ROOT=$("$REALPATH" -e -- "$TEST_ROOT") || fail 'cannot canonicalize test root'
  TEST_PARENT=$("$REALPATH" -e -- "$SOCIAL_MONITOR_JANITOR_TEST_PARENT") ||
    fail 'cannot canonicalize the hermetic test parent'
  [[ -d $TEST_PARENT && ! -L $TEST_PARENT && ${TEST_PARENT%/*} == "$SCRIPT_DIRECTORY" &&
    ${TEST_PARENT##*/} == .consumed-worktree-janitor-test.* ]] ||
    fail 'test parent must be an isolated fixture beside the janitor'
  [[ ${PROJECT_ROOT%/*} == "$TEST_PARENT" &&
    ${PROJECT_ROOT##*/} =~ ^[A-Za-z0-9._-]+$ ]] ||
    fail 'test root must be a direct child of the isolated test parent'
  [[ -f $PROJECT_ROOT/.social-monitor-janitor-test-root && \
    ! -L $PROJECT_ROOT/.social-monitor-janitor-test-root ]] ||
    fail 'test root marker is missing or unsafe'
else
  PROJECT_ROOT=/var/data/social-monitor
  ((EUID == 0)) || fail 'production runs require root so process-use checks are complete'
fi

readonly PROJECT_ROOT
readonly CONTROL=$PROJECT_ROOT/control
readonly INTEGRATION=$PROJECT_ROOT/integration
readonly WORKTREES=$PROJECT_ROOT/worktrees
readonly WORKER_JOBS=$PROJECT_ROOT/worker-jobs
readonly CONTROLLER=$WORKER_JOBS/controller
readonly LEDGER_ITEMS=$CONTROL/consumed-output-ledger/items
readonly PROJECT_LOCK=$CONTROL/worktree-cleanup.lock
readonly AUDIT_LOG=$CONTROL/consumed-worktree-janitor.audit.jsonl

for directory in "$PROJECT_ROOT" "$CONTROL" "$INTEGRATION" "$WORKTREES" \
  "$WORKER_JOBS" "$CONTROLLER" "$LEDGER_ITEMS"; do
  [[ -d $directory && ! -L $directory ]] || fail "unsafe or missing directory: $directory"
  canonical=$("$REALPATH" -e -- "$directory") || fail "cannot canonicalize: $directory"
  [[ $canonical == "$directory" ]] || fail "non-canonical project directory: $directory"
done
[[ -f $PROJECT_LOCK && ! -L $PROJECT_LOCK ]] || fail 'project lock is missing or unsafe'

exec {LOCK_FD}<"$PROJECT_LOCK"
"$FLOCK" -n "$LOCK_FD" || fail 'project worktree-cleanup lock is already held'

repo_root=$("$GIT" -C "$INTEGRATION" rev-parse --show-toplevel) ||
  fail 'integration is not a readable Git worktree'
repo_root=$("$REALPATH" -e -- "$repo_root") || fail 'cannot canonicalize integration Git root'
[[ $repo_root == "$INTEGRATION" ]] || fail 'integration Git root conflicts with project layout'

canonical_declared_path() {
  local declared=$1
  local label=$2
  local result
  [[ $declared == /* && $declared != *$'\n'* && $declared != *$'\r'* && \
    $declared != *$'\t'* ]] || fail "$label is not a safe absolute path"
  result=$("$REALPATH" -m -- "$declared") || fail "cannot canonicalize $label"
  [[ $result == "$declared" ]] || fail "$label is not canonical"
  printf '%s\n' "$result"
}

validate_legacy_registry_binding() {
  local job_id=$1 workspace=$2 manifest manifest_parent registry_root canonical
  local manifests=("$WORKER_JOBS"/registry*/"$job_id"/job.json)
  ((${#manifests[@]} == 1)) ||
    fail "legacy workspace requires exactly one registry binding: $job_id"
  manifest=${manifests[0]}
  manifest_parent=${manifest%/*}
  registry_root=${manifest_parent%/*}
  for canonical in "$registry_root" "$manifest_parent"; do
    [[ -d $canonical && ! -L $canonical ]] ||
      fail "legacy registry binding directory is unsafe: $canonical"
    [[ $("$REALPATH" -e -- "$canonical") == "$canonical" ]] ||
      fail "legacy registry binding directory is not canonical: $canonical"
  done
  [[ -f $manifest && ! -L $manifest && -r $manifest ]] ||
    fail "legacy registry binding is unsafe: $manifest"
  [[ $("$REALPATH" -e -- "$manifest") == "$manifest" ]] ||
    fail "legacy registry binding is not canonical: $manifest"
  "$JQ" -e --arg job_id "$job_id" --arg workspace "$workspace" \
    'type == "object" and .jobId == $job_id and .workspacePath == $workspace' \
    "$manifest" >/dev/null ||
    fail "legacy registry binding is malformed or conflicting: $manifest"
}
is_terminal_ledger_status() {
  case $1 in
    integrated | rejected | archived | superseded) return 0 ;;
    *) return 1 ;;
  esac
}

is_terminal_activity_status() {
  case $1 in
    archived | blocked | canceled | cancelled | completed | done | failed | integrated | \
      partial | pushed | rejected | rolled_back | stopped | superseded)
      return 0
      ;;
    *) return 1 ;;
  esac
}

declare -A ledger_workspace_by_id=()
declare -A ledger_numstat_hash_by_id=()
declare -A ledger_patch_hash_by_id=()
declare -A ledger_status_hash_by_id=()
declare -A latest_item=()
declare -A latest_item_hash=()
declare -A latest_integrated_commit=()
declare -A latest_numstat_hash=()
declare -A latest_job=()
declare -A latest_ledger=()
declare -A latest_numstat=()
declare -A latest_patch_hash=()
declare -A latest_patch=()
declare -A latest_status=()
declare -A latest_status_hash=()
declare -A latest_status_file=()
declare -A latest_time=()
declare -A latest_workspace_kind=()
declare -A latest_legacy_registry_bound=()

shopt -s nullglob
ledger_files=("$LEDGER_ITEMS"/*.json)
((${#ledger_files[@]} > 0)) || fail 'consumed-output ledger contains no item JSON files'

for item in "${ledger_files[@]}"; do
  [[ -f $item && ! -L $item && -r $item ]] || fail "ledger item is unreadable or unsafe: $item"
  canonical_item=$("$REALPATH" -e -- "$item") || fail "cannot canonicalize ledger item: $item"
  [[ $canonical_item == "$item" && ${item%/*} == "$LEDGER_ITEMS" ]] ||
    fail "ledger item escaped the item directory: $item"

  # shellcheck disable=SC2016 # The dollar-prefixed names are jq variables.
  "$JQ" -e '
    def safe_path:
      type == "string" and startswith("/") and length > 1 and
      (explode | all(. >= 32));
    def safe_social_job:
      type == "string" and test("^social-monitor-[A-Za-z0-9._-]+$");
    def safe_attempt:
      type == "string" and test("^[A-Za-z0-9._-]+$");
    def timestamp:
      type == "string" and
      test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$");
    type == "object" and
    .schemaVersion == 1 and
    (.jobId | safe_social_job) and
    (.attemptId | safe_attempt) and
    (.status | type == "string" and test("^[a-z][a-z0-9_-]+$")) and
    (.closedAt | timestamp) and (.consumedAt | timestamp) and
    .closedAt == .consumedAt and
    (.archivePath | safe_path) and
    (.backup | type == "object") and
    (.backup.workspace | safe_path) and
    (.backup.statusPath | safe_path) and
    (.backup.patchPath | safe_path) and
    (.backup.numstatPath | safe_path) and
    (.notes | type == "array" and length > 0) and
    (all(.notes[]; type == "object" and .status == $status)) and
    (if .status == "integrated" then
       (.commitSha | type == "string" and test("^[0-9a-f]{40}$")) and
       .integratedCommitSha == .commitSha and .commit == .commitSha
     else true end)
  ' --arg status "$("$JQ" -r '.status // ""' "$item" 2>/dev/null)" "$item" >/dev/null ||
    fail "malformed or conflicting ledger JSON: $item"

  record=$("$JQ" -er '[.jobId,.attemptId,.status,.consumedAt,.archivePath,
    .backup.workspace,.backup.statusPath,.backup.patchPath,.backup.numstatPath] | @tsv' "$item") ||
    fail "cannot read ledger fields: $item"
  IFS=$'\t' read -r job_id attempt_id status consumed_at archive workspace \
    status_file patch_file numstat_file <<<"$record"
  ledger_id=${item##*/}
  ledger_id=${ledger_id%.json}
  [[ ${item##*/} == "$job_id--$attempt_id.json" ]] ||
    fail "ledger filename conflicts with its IDs: $item"

  workspace=$(canonical_declared_path "$workspace" 'ledger workspace')
  legacy_registry_bound=0
  archive=$(canonical_declared_path "$archive" 'ledger archive')
  status_file=$(canonical_declared_path "$status_file" 'status evidence')
  patch_file=$(canonical_declared_path "$patch_file" 'patch evidence')
  numstat_file=$(canonical_declared_path "$numstat_file" 'numstat evidence')

  case $workspace in
    "$WORKTREES/$job_id")
      workspace_kind=canonical
      ;;
    "$WORKTREES/.volume2/$job_id")
      workspace_kind=volume2-direct
      ;;
    "$WORKTREES/.volume2/$job_id/worktree")
      workspace_kind=volume2-nested
      ;;
    "$WORKTREES/.volume2" | "$WORKTREES/.volume2/"*)
      workspace_kind=volume2-unsupported
      ;;
    *)
      [[ ${workspace%/*} == "$WORKTREES" &&
        ${workspace##*/} =~ ^[A-Za-z0-9._-]+$ ]] ||
        fail "ledger workspace is not a direct Social Monitor worktree: $workspace"
      workspace_kind=canonical
      ;;
  esac
  if [[ ${workspace##*/} != "$job_id" ]]; then
    validate_legacy_registry_binding "$job_id" "$workspace"
    legacy_registry_bound=1
  fi
  case ${archive%/*} in
    "$WORKER_JOBS/$job_id/archives" | "$CONTROLLER/archives") ;;
    *) fail "ledger archive conflicts with its Social Monitor job: $archive" ;;
  esac
  [[ ${archive##*/} == "$job_id-$status-$attempt_id" ]] ||
    fail "ledger archive name conflicts with its terminal record: $archive"
  [[ $status_file == "$archive/git-status.txt" && \
    $patch_file == "$archive/tracked.diff" && \
    $numstat_file == "$archive/tracked.numstat" ]] ||
    fail "ledger evidence paths conflict with the archive: $item"

  if is_terminal_ledger_status "$status"; then
    [[ -d $archive && ! -L $archive ]] || fail "terminal ledger archive is missing: $archive"
    for evidence in "$status_file" "$patch_file" "$numstat_file"; do
      [[ -f $evidence && ! -L $evidence && -r $evidence ]] ||
        fail "terminal ledger evidence is missing or unsafe: $evidence"
    done
  fi

  ledger_workspace_by_id["$ledger_id"]=$workspace
  item_hash=$({ "$SHA256SUM" -- "$item" || fail "cannot hash ledger item: $item"; })
  item_hash=${item_hash%%[[:space:]]*}
  if is_terminal_ledger_status "$status"; then
    ledger_numstat_hash_by_id["$ledger_id"]=$("$SHA256SUM" -- "$numstat_file")
    ledger_numstat_hash_by_id["$ledger_id"]=${ledger_numstat_hash_by_id[$ledger_id]%%[[:space:]]*}
    ledger_patch_hash_by_id["$ledger_id"]=$("$SHA256SUM" -- "$patch_file")
    ledger_patch_hash_by_id["$ledger_id"]=${ledger_patch_hash_by_id[$ledger_id]%%[[:space:]]*}
    ledger_status_hash_by_id["$ledger_id"]=$("$SHA256SUM" -- "$status_file")
    ledger_status_hash_by_id["$ledger_id"]=${ledger_status_hash_by_id[$ledger_id]%%[[:space:]]*}
  fi
  if [[ -n ${latest_time[$workspace]:-} ]]; then
    if [[ ${latest_time[$workspace]} == "$consumed_at" && \
      ${latest_ledger[$workspace]} != "$ledger_id" ]]; then
      fail "conflicting ledger items have the same terminal ordering time: $workspace"
    fi
    [[ $consumed_at > ${latest_time[$workspace]} ]] || continue
  fi
  latest_item["$workspace"]=$item
  latest_item_hash["$workspace"]=$item_hash
  latest_integrated_commit["$workspace"]=$("$JQ" -r '.integratedCommitSha // empty' "$item")
  latest_job["$workspace"]=$job_id
  latest_ledger["$workspace"]=$ledger_id
  latest_numstat["$workspace"]=$numstat_file
  latest_patch["$workspace"]=$patch_file
  latest_status["$workspace"]=$status
  latest_status_file["$workspace"]=$status_file
  latest_time["$workspace"]=$consumed_at
  latest_workspace_kind["$workspace"]=$workspace_kind
  latest_legacy_registry_bound["$workspace"]=$legacy_registry_bound
  if is_terminal_ledger_status "$status"; then
    latest_numstat_hash["$workspace"]=${ledger_numstat_hash_by_id[$ledger_id]}
    latest_patch_hash["$workspace"]=${ledger_patch_hash_by_id[$ledger_id]}
    latest_status_hash["$workspace"]=${ledger_status_hash_by_id[$ledger_id]}
  fi
done

declare -A audited_workspace=()
if [[ -e $AUDIT_LOG || -L $AUDIT_LOG ]]; then
  [[ -f $AUDIT_LOG && ! -L $AUDIT_LOG && -r $AUDIT_LOG ]] || fail 'audit log is unsafe'
  canonical_audit=$("$REALPATH" -e -- "$AUDIT_LOG") || fail 'cannot canonicalize audit log'
  [[ $canonical_audit == "$AUDIT_LOG" ]] || fail 'audit log is not canonical'
  "$JQ" -e -s '
    all(.[];
      type == "object" and .schemaVersion == 1 and .status == "removed" and
      (.ledgerId | type == "string" and test("^[A-Za-z0-9._-]+--[A-Za-z0-9._-]+$")) and
      (.ledgerItemPath | type == "string" and startswith("/")) and
      (.ledgerItemSha256 | type == "string" and test("^[0-9a-f]{64}$")) and
      (.statusEvidenceSha256 | type == "string" and test("^[0-9a-f]{64}$")) and
      (.patchEvidenceSha256 | type == "string" and test("^[0-9a-f]{64}$")) and
      (.numstatEvidenceSha256 | type == "string" and test("^[0-9a-f]{64}$")) and
      (.worktreePath | type == "string" and startswith("/")) and
      (.beforeBytes | type == "number" and . >= 0 and floor == .) and
      (.afterBytes | type == "number" and . == 0) and
      (.removedAt | type == "string")) and
    (group_by(.ledgerId) | all(.[]; length == 1))
  ' "$AUDIT_LOG" >/dev/null || fail 'audit log is malformed or contains duplicate receipts'
  while IFS=$'\t' read -r receipt_id receipt_workspace receipt_item receipt_hash \
    receipt_status_hash receipt_patch_hash receipt_numstat_hash; do
    receipt_workspace=$(canonical_declared_path "$receipt_workspace" 'audit worktree')
    receipt_item=$(canonical_declared_path "$receipt_item" 'audit ledger item')
    [[ -n ${ledger_workspace_by_id[$receipt_id]:-} && \
      ${ledger_workspace_by_id[$receipt_id]} == "$receipt_workspace" ]] ||
      fail "audit receipt conflicts with consumed ledger: $receipt_id"
    [[ $receipt_item == "$LEDGER_ITEMS/$receipt_id.json" && -f $receipt_item && \
      ! -L $receipt_item ]] ||
      fail "audit receipt ledger item is missing or unsafe: $receipt_id"
    current_hash=$({ "$SHA256SUM" -- "$receipt_item" ||
      fail "cannot hash audit ledger item: $receipt_id"; })
    current_hash=${current_hash%%[[:space:]]*}
    [[ $current_hash == "$receipt_hash" ]] ||
      fail "audit receipt hash conflicts with consumed ledger: $receipt_id"
    [[ -n ${ledger_status_hash_by_id[$receipt_id]:-} &&
      ${ledger_status_hash_by_id[$receipt_id]} == "$receipt_status_hash" &&
      ${ledger_patch_hash_by_id[$receipt_id]} == "$receipt_patch_hash" &&
      ${ledger_numstat_hash_by_id[$receipt_id]} == "$receipt_numstat_hash" ]] ||
      fail "audit receipt evidence hashes conflict with consumed ledger: $receipt_id"
    audited_workspace["$receipt_id"]=$receipt_workspace
  done < <("$JQ" -r \
    '[.ledgerId,.worktreePath,.ledgerItemPath,.ledgerItemSha256,
      .statusEvidenceSha256,.patchEvidenceSha256,.numstatEvidenceSha256] | @tsv' "$AUDIT_LOG")
fi

worktree_porcelain=$("$GIT" -C "$INTEGRATION" worktree list --porcelain) ||
  fail 'cannot enumerate registered Git worktrees'
declare -A registered=()
declare -A registered_locked=()
registered_path=
while IFS= read -r line; do
  if [[ $line == worktree\ * ]]; then
    registered_path=${line#worktree }
    registered_path=$("$REALPATH" -m -- "$registered_path") ||
      fail 'cannot canonicalize registered Git worktree'
    registered["$registered_path"]=1
  elif [[ $line == locked || $line == locked\ * ]]; then
    [[ -n $registered_path ]] || fail 'Git reported an unbound worktree lock'
    registered_locked["$registered_path"]=1
  fi
done <<<"$worktree_porcelain"

declare -A activity_protected=()
protect_worktree_for_path() {
  local path=$1
  local reason=$2
  local relative worktree_root
  case $path in
    "$WORKTREES"/*)
      relative=${path#"$WORKTREES"/}
      worktree_root=$WORKTREES/${relative%%/*}
      activity_protected["$worktree_root"]=$reason
      ;;
  esac
}

protect_manifest_paths() {
  local manifest=$1
  local reason=$2
  local paths path canonical_path
  local saw_path=0
  paths=$("$JQ" -er '
    [.. | objects | to_entries[] |
      select(.key | test("^(workspace|workspacePath|workspaceRoot|worktreePath|sourceWorkspacePath|targetWorkspacePath)$"))] as $bindings |
    if (($bindings | length) > 0 and all($bindings[]; .value | type == "string"))
    then [$bindings[].value] | unique[]
    else error("active workspace bindings are missing or malformed")
    end
  ' "$manifest") ||
    fail "cannot read active path evidence: $manifest"
  while IFS= read -r path; do
    [[ -n $path ]] || continue
    saw_path=1
    canonical_path=$(canonical_declared_path "$path" 'active workspace evidence')
    case $canonical_path in
      "$WORKTREES"/*) protect_worktree_for_path "$canonical_path" "$reason" ;;
      "$INTEGRATION" | "$INTEGRATION"/*) ;;
      *) fail "active workspace evidence escaped the project allowlist: $path" ;;
    esac
  done <<<"$paths"
  ((saw_path == 1)) || fail "active manifest has no workspace binding: $manifest"
}

scan_activity_manifests() {
  local activity_root manifest manifest_parent status canonical_path
  local activity_roots=(
    "$CONTROLLER/project-control-operations|operation.json"
    "$CONTROLLER/project-integration/integration-attempts|attempt.json"
    "$CONTROLLER/dependency-bootstrap-operations|operation.json"
    "$CONTROLLER/project-bootstrap/bootstrap-attempts|attempt.json"
  )
  for activity_root in "${activity_roots[@]}"; do
    manifest=${activity_root#*|}
    activity_root=${activity_root%%|*}
    [[ -e $activity_root || -L $activity_root ]] || continue
    [[ -d $activity_root && ! -L $activity_root ]] ||
      fail "activity root is unsafe: $activity_root"
    canonical_path=$("$REALPATH" -e -- "$activity_root") ||
      fail "cannot canonicalize activity root: $activity_root"
    [[ $canonical_path == "$activity_root" ]] || fail "activity root escaped: $activity_root"
    local manifests=("$activity_root"/*/"$manifest")
    for manifest in "${manifests[@]}"; do
      [[ -e $manifest || -L $manifest ]] || continue
      manifest_parent=${manifest%/*}
      [[ -d $manifest_parent && ! -L $manifest_parent ]] ||
        fail "activity manifest parent is unsafe: $manifest_parent"
      canonical_path=$("$REALPATH" -e -- "$manifest_parent") ||
        fail "cannot canonicalize activity manifest parent: $manifest_parent"
      [[ ${canonical_path%/*} == "$activity_root" && $canonical_path == "$manifest_parent" ]] ||
        fail "activity manifest parent escaped: $manifest_parent"
      [[ -f $manifest && ! -L $manifest && -r $manifest ]] ||
        fail "activity manifest is unreadable or unsafe: $manifest"
      canonical_path=$("$REALPATH" -e -- "$manifest") ||
        fail "cannot canonicalize activity manifest: $manifest"
      [[ $canonical_path == "$manifest" ]] || fail "activity manifest escaped: $manifest"
      "$JQ" -e 'type == "object" and (.status | type == "string")' "$manifest" >/dev/null ||
        fail "activity manifest is malformed: $manifest"
      status=$("$JQ" -r '.status' "$manifest")
      is_terminal_activity_status "$status" ||
        protect_manifest_paths "$manifest" "active-$status"
    done
  done
}
scan_activity_manifests

scan_controller_job() {
  local controller_job_path controller_workspace
  [[ -e $CONTROL/controller-job.json || -L $CONTROL/controller-job.json ]] || return 0
  [[ -f $CONTROL/controller-job.json && ! -L $CONTROL/controller-job.json &&
    -r $CONTROL/controller-job.json ]] || fail 'controller job evidence is unsafe'
  controller_job_path=$("$REALPATH" -e -- "$CONTROL/controller-job.json") ||
    fail 'cannot canonicalize controller job evidence'
  [[ $controller_job_path == "$CONTROL/controller-job.json" ]] ||
    fail 'controller job evidence escaped the control root'
  controller_workspace=$("$JQ" -er \
    'select(type == "object" and
      (.workspacePath | type == "string" and startswith("/"))) | .workspacePath' \
    "$CONTROL/controller-job.json") ||
    fail 'controller job evidence is malformed or unbound'
  controller_workspace=$(canonical_declared_path "$controller_workspace" 'controller workspace')
  case $controller_workspace in
    "$WORKTREES"/*) protect_worktree_for_path "$controller_workspace" 'controller-workspace' ;;
    "$INTEGRATION") ;;
    *) fail 'controller workspace escaped the Social Monitor worktree root' ;;
  esac
}
scan_controller_job

scan_tmux_panes() {
  local tmux_bin= tmux_panes= pane_path test_tmux_evidence canonical_path
  if [[ -n $TEST_ROOT ]]; then
    test_tmux_evidence=$PROJECT_ROOT/.social-monitor-janitor-test-tmux-panes
    if [[ -e $test_tmux_evidence || -L $test_tmux_evidence ]]; then
      [[ -f $test_tmux_evidence && ! -L $test_tmux_evidence && -r $test_tmux_evidence ]] ||
        fail 'synthetic tmux evidence is unsafe'
      canonical_path=$("$REALPATH" -e -- "$test_tmux_evidence") ||
        fail 'cannot canonicalize synthetic tmux evidence'
      [[ $canonical_path == "$test_tmux_evidence" ]] ||
        fail 'synthetic tmux evidence escaped its fixture'
      tmux_panes=$(<"$test_tmux_evidence")
    fi
  else
    if [[ -x /usr/bin/tmux ]]; then
      tmux_bin=/usr/bin/tmux
    elif [[ -x /usr/local/bin/tmux ]]; then
      tmux_bin=/usr/local/bin/tmux
    else
      return 0
    fi
    if ! tmux_panes=$(LC_ALL=C "$tmux_bin" list-panes -a -F '#{pane_current_path}' 2>&1); then
      case $tmux_panes in
        'no server running on '*) return 0 ;;
        *) fail 'cannot determine tmux pane liveness' ;;
      esac
    fi
  fi
  while IFS= read -r pane_path; do
    [[ -n $pane_path ]] || continue
    pane_path=${pane_path% (deleted)}
    pane_path=$("$REALPATH" -m -- "$pane_path") || fail 'cannot canonicalize tmux pane path'
    protect_worktree_for_path "$pane_path" 'active-tmux-pane'
  done <<<"$tmux_panes"
}
scan_tmux_panes

job_has_active_state() {
  local job_root=$1
  local state_file status tmux_alive result_status
  local progress_files=("$job_root"/*.progress.json)
  local result_files=("$job_root"/*.latest-result.json)
  local review_files=("$job_root"/*.review.json)
  for state_file in "${progress_files[@]}"; do
    [[ -f $state_file && ! -L $state_file && -r $state_file ]] ||
      fail "progress evidence is unreadable or unsafe: $state_file"
    "$JQ" -e '
      type == "object" and (.status | type == "string") and
      (.resultStatus == null or (.resultStatus | type == "string"))
    ' "$state_file" >/dev/null || fail "progress evidence is malformed: $state_file"
    status=$("$JQ" -er '.status | strings' "$state_file") ||
      fail "progress evidence is malformed: $state_file"
    is_terminal_activity_status "$status" || return 0
    result_status=$("$JQ" -r '.resultStatus // empty | strings' "$state_file") ||
      fail "cannot read progress result liveness: $state_file"
    [[ -z $result_status ]] || is_terminal_activity_status "$result_status" || return 0
  done
  for state_file in "${result_files[@]}"; do
    [[ -f $state_file && ! -L $state_file && -r $state_file ]] ||
      fail "result evidence is unreadable or unsafe: $state_file"
    status=$("$JQ" -er '.status | strings' "$state_file") ||
      fail "result evidence is malformed: $state_file"
    is_terminal_activity_status "$status" || return 0
  done
  for state_file in "${review_files[@]}"; do
    [[ -f $state_file && ! -L $state_file && -r $state_file ]] ||
      fail "review evidence is unreadable or unsafe: $state_file"
    "$JQ" -e '
      type == "object" and (.status | type == "object") and
      (.status.tmuxAlive == null or (.status.tmuxAlive | type == "boolean")) and
      (.status.resultStatus == null or (.status.resultStatus | type == "string")) and
      (.status.progressStatus == null or (.status.progressStatus | type == "string"))
    ' "$state_file" >/dev/null ||
      fail "review evidence is malformed: $state_file"
    tmux_alive=$("$JQ" -er '.status.tmuxAlive // false | booleans' "$state_file") ||
      fail "cannot read review tmux liveness: $state_file"
    [[ $tmux_alive == true ]] && return 0
    result_status=$("$JQ" -r \
      '.status.resultStatus // .status.progressStatus // empty | strings' "$state_file") ||
      fail "cannot read review result liveness: $state_file"
    [[ -z $result_status ]] || is_terminal_activity_status "$result_status" || return 0
  done
  return 1
}

PROCESS_SCAN_INCOMPLETE=0
declare -a PLANNING_PROCESS_PATHS=()

inspect_process_path() {
  local raw_path=$1
  local scan_mode=$2
  local target=${3:-}
  local resolved
  [[ $raw_path == /* ]] || return 1
  raw_path=${raw_path% (deleted)}
  resolved=$("$REALPATH" -m -- "$raw_path") || {
    PROCESS_SCAN_INCOMPLETE=1
    return 1
  }
  if [[ $scan_mode == snapshot ]]; then
    ((${#PLANNING_PROCESS_PATHS[@]} < PROCESS_SNAPSHOT_LIMIT)) ||
      fail "process-use snapshot exceeded $PROCESS_SNAPSHOT_LIMIT paths"
    PLANNING_PROCESS_PATHS+=("$resolved")
    return 1
  fi
  case $resolved in
    "$target" | "$target"/*) return 0 ;;
    *) return 1 ;;
  esac
}

scan_synthetic_process_evidence() {
  local scan_mode=$1
  local target=${2:-}
  local evidence=$PROJECT_ROOT/.social-monitor-janitor-test-process-paths
  local canonical_evidence raw_path resolved
  [[ -e $evidence || -L $evidence ]] || return 1
  [[ -f $evidence && ! -L $evidence && -r $evidence ]] ||
    fail 'synthetic process evidence is unsafe'
  canonical_evidence=$("$REALPATH" -e -- "$evidence") ||
    fail 'cannot canonicalize synthetic process evidence'
  [[ $canonical_evidence == "$evidence" ]] ||
    fail 'synthetic process evidence escaped its fixture'
  while IFS= read -r raw_path || [[ -n $raw_path ]]; do
    [[ -n $raw_path ]] || continue
    resolved=$(canonical_declared_path "$raw_path" 'synthetic process path')
    case $resolved in
      "$PROJECT_ROOT" | "$PROJECT_ROOT"/*) ;;
      *) fail 'synthetic process path escaped its fixture' ;;
    esac
    inspect_process_path "$resolved" "$scan_mode" "$target" && return 0
  done <"$evidence"
  return 1
}

scan_proc_process_evidence() {
  local scan_mode=$1
  local target=${2:-}
  local process_dir link_path raw_link
  for process_dir in /proc/[0-9]*; do
    [[ -d $process_dir ]] || continue
    for link_path in "$process_dir/cwd" "$process_dir/root" "$process_dir/exe"; do
      [[ -L $link_path ]] || continue
      if ! raw_link=$("$READLINK" -- "$link_path" 2>/dev/null); then
        [[ -e $process_dir/status ]] && PROCESS_SCAN_INCOMPLETE=1
        continue
      fi
      inspect_process_path "$raw_link" "$scan_mode" "$target" && return 0
    done
    for link_path in "$process_dir"/fd/*; do
      [[ -L $link_path ]] || continue
      raw_link=$("$READLINK" -- "$link_path" 2>/dev/null) || continue
      inspect_process_path "$raw_link" "$scan_mode" "$target" && return 0
    done
  done
  return 1
}

scan_process_evidence() {
  local scan_mode=$1
  local target=${2:-}
  if [[ -n $TEST_ROOT ]]; then
    scan_synthetic_process_evidence "$scan_mode" "$target"
  else
    scan_proc_process_evidence "$scan_mode" "$target"
  fi
}

snapshot_process_evidence() {
  PROCESS_SCAN_INCOMPLETE=0
  PLANNING_PROCESS_PATHS=()
  scan_process_evidence snapshot || true
  ((PROCESS_SCAN_INCOMPLETE == 0)) ||
    fail 'process-use snapshot was incomplete; refusing to proceed'
}

planning_process_uses_worktree() {
  local target=$1
  local process_path
  for process_path in "${PLANNING_PROCESS_PATHS[@]}"; do
    case $process_path in
      "$target" | "$target"/*) return 0 ;;
    esac
  done
  return 1
}

live_process_uses_worktree() {
  local target=$1
  PROCESS_SCAN_INCOMPLETE=0
  scan_process_evidence live "$target" && return 0
  ((PROCESS_SCAN_INCOMPLETE == 0)) || fail 'process-use recheck was incomplete'
  return 1
}

is_registered_now() {
  local target=$1
  local listing line path
  listing=$("$GIT" -C "$INTEGRATION" worktree list --porcelain) ||
    fail 'cannot re-enumerate registered Git worktrees'
  while IFS= read -r line; do
    [[ $line == worktree\ * ]] || continue
    path=$("$REALPATH" -m -- "${line#worktree }") ||
      fail 'cannot canonicalize registered Git worktree'
    [[ $path == "$target" ]] && return 0
  done <<<"$listing"
  return 1
}

is_locked_now() {
  local target=$1
  local listing line path current_path=
  listing=$("$GIT" -C "$INTEGRATION" worktree list --porcelain) ||
    fail 'cannot re-enumerate Git worktree locks'
  while IFS= read -r line; do
    if [[ $line == worktree\ * ]]; then
      path=$("$REALPATH" -m -- "${line#worktree }") ||
        fail 'cannot canonicalize locked Git worktree'
      current_path=$path
    elif [[ $line == locked || $line == locked\ * ]]; then
      [[ $current_path == "$target" ]] && return 0
    fi
  done <<<"$listing"
  return 1
}

validate_job_root() {
  local job_root=$1
  local canonical_job_root
  [[ -d $job_root && ! -L $job_root ]] || fail "job root is unsafe: $job_root"
  canonical_job_root=$("$REALPATH" -e -- "$job_root") ||
    fail "cannot canonicalize job root: $job_root"
  [[ $canonical_job_root == "$job_root" ]] || fail "job root escaped: $job_root"
}

validate_terminal_evidence_paths() {
  local evidence canonical_evidence
  for evidence in "$@"; do
    [[ -f $evidence && ! -L $evidence && -r $evidence ]] ||
      fail "terminal evidence is missing or unsafe: $evidence"
    canonical_evidence=$("$REALPATH" -e -- "$evidence") ||
      fail "cannot canonicalize terminal evidence: $evidence"
    [[ $canonical_evidence == "$evidence" ]] || fail "terminal evidence escaped: $evidence"
  done
}

worktree_matches_terminal_evidence() {
  local target=$1
  local status_file=$2
  local patch_file=$3
  local numstat_file=$4
  "$GIT" -c status.showUntrackedFiles=all -C "$target" status --short |
    "$CMP" -s -- "$status_file" - || return 1
  "$GIT" -C "$target" diff --no-ext-diff --binary HEAD -- |
    "$CMP" -s -- "$patch_file" - || return 1
  "$GIT" -C "$target" diff --no-ext-diff --numstat HEAD -- |
    "$CMP" -s -- "$numstat_file" - || return 1
}

current_directory=$("$REALPATH" -m -- "$PWD") || fail 'cannot canonicalize current directory'
declare -a plan_items=()
declare -a plan_jobs=()
declare -a plan_ledgers=()
declare -a plan_targets=()
declare -a plan_bytes=()
eligible=0
excluded=0
replayed=0

snapshot_process_evidence

for workspace in "${!latest_time[@]}"; do
  status=${latest_status[$workspace]}
  ledger_id=${latest_ledger[$workspace]}
  if [[ ${latest_legacy_registry_bound[$workspace]} == 1 ]]; then
    printf 'excluded reason=legacy-registry-bound ledger=%s worktree=%s\n' \
      "$ledger_id" "$workspace"
    excluded=$((excluded + 1))
    continue
  fi
  is_terminal_ledger_status "$status" || {
    excluded=$((excluded + 1))
    continue
  }
  workspace_kind=${latest_workspace_kind[$workspace]}
  if [[ $workspace_kind == volume2-unsupported ]]; then
    printf 'excluded reason=unsupported-volume2-layout ledger=%s worktree=%s\n' \
      "$ledger_id" "$workspace"
    excluded=$((excluded + 1))
    continue
  fi
  if [[ $MODE == apply && $workspace_kind == volume2-* ]]; then
    printf 'excluded reason=volume2-dry-run-only ledger=%s worktree=%s\n' \
      "$ledger_id" "$workspace"
    excluded=$((excluded + 1))
    continue
  fi
  if [[ -n ${audited_workspace[$ledger_id]:-} ]]; then
    if [[ -e $workspace || -L $workspace || -n ${registered[$workspace]:-} ]]; then
      fail "audit receipt conflicts with an existing or registered worktree: $ledger_id"
    fi
    replayed=$((replayed + 1))
    continue
  fi
  [[ -d $workspace && ! -L $workspace ]] || {
    excluded=$((excluded + 1))
    continue
  }
  [[ -n ${registered[$workspace]:-} ]] || {
    excluded=$((excluded + 1))
    continue
  }
  if [[ -n ${registered_locked[$workspace]:-} ]]; then
    printf 'excluded reason=git-worktree-locked ledger=%s worktree=%s\n' \
      "$ledger_id" "$workspace"
    excluded=$((excluded + 1))
    continue
  fi
  target_root=$("$GIT" -C "$workspace" rev-parse --show-toplevel 2>/dev/null) ||
    fail "registered target is not a readable Git worktree: $workspace"
  target_root=$("$REALPATH" -e -- "$target_root") || fail 'cannot canonicalize target Git root'
  [[ $target_root == "$workspace" ]] || fail "target Git root conflicts with ledger: $workspace"
  if [[ $status == integrated ]]; then
    integrated_commit=${latest_integrated_commit[$workspace]}
    "$GIT" -C "$INTEGRATION" cat-file -e "$integrated_commit^{commit}" 2>/dev/null ||
      fail "integrated ledger commit is unavailable: $ledger_id"
    "$GIT" -C "$INTEGRATION" merge-base --is-ancestor "$integrated_commit" HEAD ||
      fail "integrated ledger commit is not retained by integration HEAD: $ledger_id"
  fi

  case ${workspace##*/} in
    artifacts | auth | backups | controller | handoffs | integration | registries | registry | \
      toolchain | toolchains)
      excluded=$((excluded + 1))
      continue
      ;;
  esac
  if [[ $current_directory == "$workspace" || $current_directory == "$workspace"/* ||
    $SCRIPT_PATH == "$workspace"/* ]]; then
    printf 'excluded reason=current-worktree ledger=%s worktree=%s\n' "$ledger_id" "$workspace"
    excluded=$((excluded + 1))
    continue
  fi
  if [[ -n ${activity_protected[$workspace]:-} ]]; then
    printf 'excluded reason=%s ledger=%s worktree=%s\n' \
      "${activity_protected[$workspace]}" "$ledger_id" "$workspace"
    excluded=$((excluded + 1))
    continue
  fi
  job_root=$WORKER_JOBS/${latest_job[$workspace]}
  if [[ -e $job_root || -L $job_root ]]; then
    validate_job_root "$job_root"
  else
    printf 'excluded reason=missing-job-liveness ledger=%s worktree=%s\n' "$ledger_id" "$workspace"
    excluded=$((excluded + 1))
    continue
  fi
  if job_has_active_state "$job_root"; then
    printf 'excluded reason=active-job ledger=%s worktree=%s\n' "$ledger_id" "$workspace"
    excluded=$((excluded + 1))
    continue
  fi
  if planning_process_uses_worktree "$workspace"; then
    printf 'excluded reason=active-process ledger=%s worktree=%s\n' "$ledger_id" "$workspace"
    excluded=$((excluded + 1))
    continue
  fi
  worktree_matches_terminal_evidence "$workspace" "${latest_status_file[$workspace]}" \
    "${latest_patch[$workspace]}" "${latest_numstat[$workspace]}" ||
    fail "worktree state conflicts with terminal archive evidence: $ledger_id"
  byte_record=$("$DU" -sb --apparent-size -- "$workspace") ||
    fail "cannot measure worktree bytes: $workspace"
  before_bytes=${byte_record%%[[:space:]]*}
  [[ $before_bytes =~ ^[0-9]+$ ]] || fail "invalid worktree byte count: $workspace"
  plan_items+=("${latest_item[$workspace]}")
  plan_jobs+=("${latest_job[$workspace]}")
  plan_ledgers+=("$ledger_id")
  plan_targets+=("$workspace")
  plan_bytes+=("$before_bytes")
  eligible=$((eligible + 1))
done

append_audit_receipt() {
  local receipt=$1
  AUDIT_TMP=$("$MKTEMP" "$CONTROL/.consumed-worktree-janitor.audit.XXXXXX") ||
    fail 'cannot create atomic audit staging file'
  [[ -f $AUDIT_TMP && ! -L $AUDIT_TMP && ${AUDIT_TMP%/*} == "$CONTROL" ]] ||
    fail 'audit staging file is unsafe'
  if [[ -f $AUDIT_LOG ]]; then
    "$CP" -- "$AUDIT_LOG" "$AUDIT_TMP" || fail 'cannot stage existing audit log'
  fi
  printf '%s\n' "$receipt" >>"$AUDIT_TMP" || fail 'cannot append staged audit receipt'
  "$JQ" -e -s 'all(.[]; type == "object")' "$AUDIT_TMP" >/dev/null ||
    fail 'staged audit log is invalid'
  "$MV" -f -- "$AUDIT_TMP" "$AUDIT_LOG" || fail 'cannot atomically publish audit receipt'
  AUDIT_TMP=
}

removed=0
if [[ $MODE == dry-run ]]; then
  for index in "${!plan_targets[@]}"; do
    printf 'would-remove ledger=%s worktree=%s beforeBytes=%s afterBytes=0\n' \
      "${plan_ledgers[$index]}" "${plan_targets[$index]}" "${plan_bytes[$index]}"
  done
else
  for index in "${!plan_targets[@]}"; do
    target=${plan_targets[$index]}
    item=${plan_items[$index]}
    ledger_id=${plan_ledgers[$index]}
    job_id=${plan_jobs[$index]}
    [[ -d $target && ! -L $target ]] || fail "worktree changed before apply: $target"
    is_registered_now "$target" || fail "worktree registration changed before apply: $target"
    is_locked_now "$target" && fail "Git worktree became locked before apply: $target"
    scan_activity_manifests
    scan_controller_job
    scan_tmux_panes
    [[ -z ${activity_protected[$target]:-} ]] ||
      fail "controller or tmux activity appeared before apply: $target"
    validate_terminal_evidence_paths "${latest_status_file[$target]}" \
      "${latest_patch[$target]}" "${latest_numstat[$target]}"
    status_sha=$("$SHA256SUM" -- "${latest_status_file[$target]}") ||
      fail "cannot rehash status evidence: $ledger_id"
    patch_sha=$("$SHA256SUM" -- "${latest_patch[$target]}") ||
      fail "cannot rehash patch evidence: $ledger_id"
    numstat_sha=$("$SHA256SUM" -- "${latest_numstat[$target]}") ||
      fail "cannot rehash numstat evidence: $ledger_id"
    [[ ${status_sha%%[[:space:]]*} == "${latest_status_hash[$target]}" &&
      ${patch_sha%%[[:space:]]*} == "${latest_patch_hash[$target]}" &&
      ${numstat_sha%%[[:space:]]*} == "${latest_numstat_hash[$target]}" ]] ||
      fail "archive evidence content changed before apply: $ledger_id"
    worktree_matches_terminal_evidence "$target" "${latest_status_file[$target]}" \
      "${latest_patch[$target]}" "${latest_numstat[$target]}" ||
      fail "worktree state changed after terminal evidence preflight: $ledger_id"
    if [[ ${latest_status[$target]} == integrated ]]; then
      integrated_commit=${latest_integrated_commit[$target]}
      "$GIT" -C "$INTEGRATION" cat-file -e "$integrated_commit^{commit}" 2>/dev/null ||
        fail "integrated ledger commit disappeared before apply: $ledger_id"
      "$GIT" -C "$INTEGRATION" merge-base --is-ancestor "$integrated_commit" HEAD ||
        fail "integration HEAD stopped retaining the ledger commit: $ledger_id"
    fi
    validate_job_root "$WORKER_JOBS/$job_id"
    if job_has_active_state "$WORKER_JOBS/$job_id"; then
      fail "job became active before apply: $job_id"
    fi
    live_process_uses_worktree "$target" &&
      fail "process entered worktree before apply: $target"

    byte_record=$("$DU" -sb --apparent-size -- "$target") ||
      fail "cannot remeasure worktree bytes: $target"
    before_bytes=${byte_record%%[[:space:]]*}
    [[ $before_bytes =~ ^[0-9]+$ ]] || fail "invalid worktree byte count: $target"
    ledger_sha=$({ "$SHA256SUM" -- "$item" || fail "cannot hash ledger item: $item"; })
    ledger_sha=${ledger_sha%%[[:space:]]*}
    [[ $ledger_sha == "${latest_item_hash[$target]}" ]] ||
      fail "ledger item changed after preflight: $ledger_id"
    removed_at=$("$DATE" -u +'%Y-%m-%dT%H:%M:%S.%3NZ')

    "$GIT" -C "$INTEGRATION" worktree remove --force -- "$target"
    [[ ! -e $target && ! -L $target ]] || fail "Git did not remove worktree: $target"
    is_registered_now "$target" && fail "Git worktree remains registered: $target"

    # shellcheck disable=SC2016 # The dollar-prefixed names are jq variables.
    receipt=$("$JQ" -cn \
      --arg ledgerId "$ledger_id" \
      --arg ledgerItemPath "$item" \
      --arg ledgerItemSha256 "$ledger_sha" \
      --arg statusEvidenceSha256 "${latest_status_hash[$target]}" \
      --arg patchEvidenceSha256 "${latest_patch_hash[$target]}" \
      --arg numstatEvidenceSha256 "${latest_numstat_hash[$target]}" \
      --arg worktreePath "$target" \
      --arg removedAt "$removed_at" \
      --argjson beforeBytes "$before_bytes" \
      '{schemaVersion:1,status:"removed",ledgerId:$ledgerId,
       ledgerItemPath:$ledgerItemPath,ledgerItemSha256:$ledgerItemSha256,
       statusEvidenceSha256:$statusEvidenceSha256,
       patchEvidenceSha256:$patchEvidenceSha256,
       numstatEvidenceSha256:$numstatEvidenceSha256,
       worktreePath:$worktreePath,beforeBytes:$beforeBytes,afterBytes:0,
       removedAt:$removedAt}') || fail 'cannot construct audit receipt'
    append_audit_receipt "$receipt"
    printf 'removed ledger=%s worktree=%s beforeBytes=%s afterBytes=0\n' \
      "$ledger_id" "$target" "$before_bytes"
    removed=$((removed + 1))
  done
  if ((removed > 0)); then
    "$GIT" -C "$INTEGRATION" worktree prune --expire now
  fi
fi

printf 'consumed-worktree-janitor mode=%s eligible=%s removed=%s replayed=%s excluded=%s\n' \
  "$MODE" "$eligible" "$removed" "$replayed" "$excluded"
