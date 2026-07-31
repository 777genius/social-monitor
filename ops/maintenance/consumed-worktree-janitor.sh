#!/usr/bin/env bash
set -euo pipefail
export GIT_OPTIONAL_LOCKS=0
readonly GIT=/usr/bin/git JQ=/usr/bin/jq REALPATH=/usr/bin/realpath FLOCK=/usr/bin/flock DU=/usr/bin/du READLINK=/usr/bin/readlink
readonly SHA256SUM=/usr/bin/sha256sum DATE=/usr/bin/date MKTEMP=/usr/bin/mktemp CP=/usr/bin/cp MV=/usr/bin/mv UNLINK=/usr/bin/unlink
readonly CMP=/usr/bin/cmp STAT=/usr/bin/stat SORT=/usr/bin/sort
readonly SYNC=/usr/bin/sync SLEEP=/usr/bin/sleep PROCESS_SNAPSHOT_LIMIT=65536
MODE=dry-run MODE_SEEN=0 TEST_ROOT= AUDIT_TMP= EXPECTED_PLAN_SHA256=
fail() { printf 'consumed-worktree-janitor: %s\n' "$*" >&2; exit 1; }
cleanup() { [[ -z $AUDIT_TMP || ! -f $AUDIT_TMP || -L $AUDIT_TMP ]] || "$UNLINK" -- "$AUDIT_TMP"; }
trap cleanup EXIT
usage() { printf '%s\n' 'usage: consumed-worktree-janitor.sh [--dry-run | --apply]' \
  '       consumed-worktree-janitor.sh --apply-relocated --expected-plan-sha256 SHA256' \
  '       consumed-worktree-janitor.sh [MODE] [--expected-plan-sha256 SHA256] --test-root PATH'; }
while (($# > 0)); do
  case $1 in
    --dry-run)
      ((MODE_SEEN == 0)) || fail 'choose exactly one execution mode'
      MODE=dry-run MODE_SEEN=1
      ;;
    --apply)
      ((MODE_SEEN == 0)) || fail 'choose exactly one execution mode'
      MODE=apply MODE_SEEN=1
      ;;
    --apply-relocated)
      ((MODE_SEEN == 0)) || fail 'choose exactly one execution mode'
      MODE=apply-relocated MODE_SEEN=1
      ;;
    --expected-plan-sha256)
      shift
      (($# > 0)) || fail '--expected-plan-sha256 requires a SHA-256 digest'
      [[ -z $EXPECTED_PLAN_SHA256 ]] || fail '--expected-plan-sha256 may be specified only once'
      EXPECTED_PLAN_SHA256=$1
      ;;
    --test-root)
      shift
      (($# > 0)) || fail '--test-root requires a path'
      [[ -z $TEST_ROOT ]] || fail '--test-root may be specified only once'
      TEST_ROOT=$1
      ;;
    --help)
      usage; exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
  shift
done
if [[ $MODE == apply-relocated ]]; then
  [[ $EXPECTED_PLAN_SHA256 =~ ^[0-9a-f]{64}$ ]] || fail '--apply-relocated requires --expected-plan-sha256 with a lowercase SHA-256 digest'
else
  [[ -z $EXPECTED_PLAN_SHA256 ]] || fail '--expected-plan-sha256 is valid only with --apply-relocated'
fi
for tool in "$GIT" "$JQ" "$REALPATH" "$FLOCK" "$DU" "$READLINK" "$SHA256SUM" "$DATE" "$MKTEMP" "$CP" "$MV" "$UNLINK" "$CMP" "$STAT" "$SORT" "$SYNC" "$SLEEP"; do
  [[ -x $tool ]] || fail "required tool is unavailable: $tool"
done
SCRIPT_PATH=$("$REALPATH" -e -- "${BASH_SOURCE[0]}") || fail 'cannot canonicalize script path'
readonly SCRIPT_PATH SCRIPT_DIRECTORY=${SCRIPT_PATH%/*}
if [[ -n $TEST_ROOT ]]; then
  [[ ${SOCIAL_MONITOR_JANITOR_ALLOW_TEST_ROOT:-} == 1 ]] || fail '--test-root is restricted to the hermetic test harness'
  [[ -n ${SOCIAL_MONITOR_JANITOR_TEST_PARENT:-} ]] || fail 'the hermetic test parent is required'
  [[ -d $TEST_ROOT && ! -L $TEST_ROOT ]] || fail 'test root must be a real directory'
  PROJECT_ROOT=$("$REALPATH" -e -- "$TEST_ROOT") || fail 'cannot canonicalize test root'
  TEST_PARENT=$("$REALPATH" -e -- "$SOCIAL_MONITOR_JANITOR_TEST_PARENT") || fail 'cannot canonicalize the hermetic test parent'
  [[ -d $TEST_PARENT && ! -L $TEST_PARENT && ${TEST_PARENT%/*} == "$SCRIPT_DIRECTORY" &&
    ${TEST_PARENT##*/} == .consumed-worktree-janitor-test.* ]] || fail 'test parent must be an isolated fixture beside the janitor'
  [[ ${PROJECT_ROOT%/*} == "$TEST_PARENT" && ${PROJECT_ROOT##*/} =~ ^[A-Za-z0-9._-]+$ ]] || fail 'test root must be a direct child of the isolated test parent'
  [[ -f $PROJECT_ROOT/.social-monitor-janitor-test-root && ! -L $PROJECT_ROOT/.social-monitor-janitor-test-root ]] || fail 'test root marker is missing or unsafe'
  TRUSTED_OWNER_ID=$EUID
else
  PROJECT_ROOT=/var/data/social-monitor
  ((EUID == 0)) || fail 'production runs require root so process-use checks are complete'
  TRUSTED_OWNER_ID=0
fi
readonly PROJECT_ROOT TRUSTED_OWNER_ID CONTROL=$PROJECT_ROOT/control INTEGRATION=$PROJECT_ROOT/integration
readonly WORKTREES=$PROJECT_ROOT/worktrees WORKER_JOBS=$PROJECT_ROOT/worker-jobs CONTROLLER=$PROJECT_ROOT/worker-jobs/controller
readonly CONTROLLER_V4=$WORKER_JOBS/controller-v4 RELOCATION_ARCHIVE_ROOT=$WORKTREES/.volume2/root-worktree-archive-20260727
if [[ -n $TEST_ROOT ]]; then
  LEGACY_V2_ARCHIVES=$PROJECT_ROOT/.subscription-runtime/social-monitor-project-controller-v2/archives
else
  LEGACY_V2_ARCHIVES=/root/.cache/subscription-runtime/social-monitor-project-controller-v2/archives
fi
readonly LEGACY_V2_ARCHIVES
readonly LEDGER_ITEMS=$CONTROL/consumed-output-ledger/items PROJECT_LOCK=$CONTROL/worktree-cleanup.lock AUDIT_LOG=$CONTROL/consumed-worktree-janitor.audit.jsonl
for directory in "$PROJECT_ROOT" "$CONTROL" "$INTEGRATION" "$WORKTREES" "$WORKER_JOBS" "$CONTROLLER" "$LEDGER_ITEMS"; do
  [[ -d $directory && ! -L $directory ]] || fail "unsafe or missing directory: $directory"
  canonical=$("$REALPATH" -e -- "$directory") || fail "cannot canonicalize: $directory"
  [[ $canonical == "$directory" ]] || fail "non-canonical project directory: $directory"
done
[[ -f $PROJECT_LOCK && ! -L $PROJECT_LOCK ]] || fail 'project lock is missing or unsafe'
exec {LOCK_FD}<"$PROJECT_LOCK"
"$FLOCK" -n "$LOCK_FD" || fail 'project worktree-cleanup lock is already held'
repo_root=$("$GIT" -C "$INTEGRATION" rev-parse --show-toplevel) || fail 'integration is not a readable Git worktree'
repo_root=$("$REALPATH" -e -- "$repo_root") || fail 'cannot canonicalize integration Git root'
[[ $repo_root == "$INTEGRATION" ]] || fail 'integration Git root conflicts with project layout'
MAIN_COMMIT=$("$GIT" -C "$INTEGRATION" rev-parse --verify refs/heads/main^{commit}) || fail 'integration main is not a readable commit'
readonly MAIN_COMMIT
canonical_declared_path() { local declared=$1 label=$2 result
  [[ $declared == /* && $declared != *$'\n'* && $declared != *$'\r'* && $declared != *$'\t'* ]] || fail "$label is not a safe absolute path"
  result=$("$REALPATH" -m -- "$declared") || fail "cannot canonicalize $label"
  [[ $result == "$declared" ]] || fail "$label is not canonical"
  printf '%s\n' "$result"
}
lexical_declared_path() { local declared=$1 label=$2 result
  [[ $declared == /* && $declared != *$'\n'* && $declared != *$'\r'* && $declared != *$'\t'* ]] || fail "$label is not a safe absolute path"
  result=$("$REALPATH" -ms -- "$declared") || fail "cannot normalize $label"
  [[ $result == "$declared" ]] || fail "$label is not canonical"
  printf '%s\n' "$result"
}
validate_reviewed_output() { local reviewed_id=$1 job_id=$2 workspace=$3 patch_hash=$4
  local reviewed_root=$WORKER_JOBS/reviewed-worker-outputs output_root
  output_root=$reviewed_root/$reviewed_id
  local manifest=$output_root/manifest.json output_patch=$output_root/output.patch path output_hash manifest_hash
  for path in "$reviewed_root" "$output_root"; do
    [[ -d $path && ! -L $path && $("$REALPATH" -e -- "$path") == "$path" ]] || fail "reviewed output directory is missing or unsafe: $path"
  done
  for path in "$manifest" "$output_patch"; do
    [[ -f $path && ! -L $path && -r $path && $("$REALPATH" -e -- "$path") == "$path" ]] || fail "reviewed output evidence is missing or unsafe: $path"
  done
  # shellcheck disable=SC2016 # The dollar-prefixed names are jq variables.
  "$JQ" -e --arg id "$reviewed_id" --arg job "$job_id" --arg workspace "$workspace" --arg patch "$output_patch" '
    type == "object" and .format == "reviewed-worker-output" and .formatRevision == 1 and
    .projectId == "social-monitor" and .reviewedOutputId == $id and .workerJobId == $job and
    .sourceWorkspacePath == $workspace and .patchPath == $patch and
    (.patchSha256 | type == "string" and test("^[0-9a-f]{64}$")) and
    .reviewDecision.decision == "rejected"
  ' "$manifest" >/dev/null || fail "reviewed output manifest is conflicting: $manifest"
  output_hash=$("$SHA256SUM" -- "$output_patch") || fail "cannot hash reviewed output patch: $output_patch"
  output_hash=${output_hash%%[[:space:]]*}
  manifest_hash=$("$JQ" -r '.patchSha256' "$manifest")
  [[ $manifest_hash == "$patch_hash" && $output_hash == "$patch_hash" ]] || fail "reviewed output patch hash conflicts with terminal archive: $reviewed_id"
}
validate_terminal_archive_name() { local job_id=$1 attempt_id=$2 status=$3 archive=$4 workspace=$5
  local patch_hash=$6 integrated_commit=$7 name bound_hash
  name=${archive##*/}
  if [[ $status == rejected && $attempt_id == uncaptured-rejection-* ]]; then
    bound_hash=${attempt_id#uncaptured-rejection-}
    [[ $bound_hash =~ ^[0-9a-f]{64}$ && $patch_hash == "$bound_hash" && $name == "$job_id-rejected-uncaptured-$bound_hash" ]] || fail "uncaptured rejection archive binding is conflicting: $archive"
    return
  fi
  if [[ $name == "$job_id-rejected-reviewed-"* ]]; then
    [[ $status == rejected && $attempt_id =~ ^[0-9a-f]{64}$ && $name == "$job_id-rejected-reviewed-$attempt_id" ]] || fail "reviewed rejection archive binding is conflicting: $archive"
    validate_reviewed_output "$attempt_id" "$job_id" "$workspace" "$patch_hash"
    return
  fi
  [[ $name == "$job_id-$status-$attempt_id" || ($status == integrated && $name == "$job_id-integrated-${integrated_commit:0:12}-$attempt_id") ]] || fail "ledger archive name conflicts with its terminal record: $archive"
}
validate_trusted_path() { local path=$1 kind=$2 label=$3 canonical metadata owner mode
  if [[ $kind == directory ]]; then [[ -d $path && ! -L $path ]] || fail "$label is missing or unsafe: $path"
  else [[ -f $path && ! -L $path && -r $path ]] || fail "$label is missing or unsafe: $path"; fi
  canonical=$("$REALPATH" -e -- "$path") || fail "cannot canonicalize $label: $path"
  [[ $canonical == "$path" ]] || fail "$label is not canonical: $path"
  metadata=$("$STAT" -c '%u %a' -- "$path") || fail "cannot stat $label: $path"
  owner=${metadata%% *}; mode=${metadata##* }
  [[ -z $TEST_ROOT || ${SOCIAL_MONITOR_JANITOR_TEST_WRONG_OWNER_PATH:-} != "$path" ]] || owner=$((TRUSTED_OWNER_ID == 0 ? 1 : 0))
  [[ $owner == "$TRUSTED_OWNER_ID" && $mode =~ ^[0-7]{3,4}$ ]] || fail "$label has the wrong owner: $path"
  (((8#$mode & 0022) == 0)) || fail "$label is group/world writable: $path"
}
validate_relocated_workspace() { local logical=$1 expected target metadata owner
  [[ ${logical%/*} == "$WORKTREES" && ${logical##*/} =~ ^[A-Za-z0-9._-]+$ && -L $logical ]] || fail "relocated workspace is not a direct logical symlink: $logical"
  metadata=$("$STAT" -c '%u %a' -- "$logical") || fail "cannot lstat relocated logical symlink: $logical"
  owner=${metadata%% *}
  [[ -z $TEST_ROOT || ${SOCIAL_MONITOR_JANITOR_TEST_WRONG_OWNER_PATH:-} != "$logical" ]] || owner=$((TRUSTED_OWNER_ID == 0 ? 1 : 0))
  [[ $owner == "$TRUSTED_OWNER_ID" ]] || fail "relocated logical symlink has the wrong owner: $logical"
  expected=$RELOCATION_ARCHIVE_ROOT/${logical##*/}
  target=$("$READLINK" -- "$logical") || fail "cannot read relocated logical symlink: $logical"
  [[ $target == "$expected" ]] || fail "relocated logical symlink has a foreign, chained, or mismatched target: $logical"
  validate_trusted_path "$WORKTREES" directory 'relocation logical parent'
  validate_trusted_path "$WORKTREES/.volume2" directory 'relocation volume parent'
  validate_trusted_path "$RELOCATION_ARCHIVE_ROOT" directory 'relocation archive root'
  validate_trusted_path "$target" directory 'relocation archive target'
  [[ ${target%/*} == "$RELOCATION_ARCHIVE_ROOT" && ${target##*/} == "${logical##*/}" ]] || fail "relocation target is not an exact basename-bound archive child: $target"
  printf '%s\n' "$target"
}
VALIDATED_REGISTRY_PATH=
validate_registry_binding() { local job_id=$1 workspace=$2 registry manifest manifest_parent registry_root
  local manifests=()
  for registry in registry registry-v2 registry-v3 registry-v4; do
    manifest=$WORKER_JOBS/$registry/$job_id/job.json
    [[ -e $manifest || -L $manifest ]] && manifests+=("$manifest")
  done
  ((${#manifests[@]} == 1)) || fail "terminal archive requires exactly one registry binding: $job_id"
  manifest=${manifests[0]}; manifest_parent=${manifest%/*}; registry_root=${manifest_parent%/*}
  validate_trusted_path "$registry_root" directory 'registry root'
  validate_trusted_path "$manifest_parent" directory 'registry job directory'
  validate_trusted_path "$manifest" file 'registry binding'
  "$JQ" -e --arg job_id "$job_id" --arg workspace "$workspace" 'type == "object" and .jobId == $job_id and .workspacePath == $workspace' "$manifest" >/dev/null || fail "registry binding is malformed or conflicting: $manifest"
  VALIDATED_REGISTRY_PATH=$manifest
}
validate_archive_location() { local job_id=$1 workspace=$2 archive=$3 archive_root archive_parent
  archive_root=${archive%/*}; archive_parent=${archive_root%/*}
  case $archive_root in
    "$LEGACY_V2_ARCHIVES" | "$CONTROLLER_V4/archives" | "$CONTROLLER/archives" | "$WORKER_JOBS/$job_id/archives") ;;
    *) fail "ledger archive conflicts with its Social Monitor job or root: $archive" ;;
  esac
  validate_trusted_path "$archive_parent" directory 'archive parent'
  validate_trusted_path "$archive_root" directory 'archive root'
  validate_trusted_path "$archive" directory 'terminal archive'
  validate_registry_binding "$job_id" "$workspace"
}
is_terminal_ledger_status() { case $1 in integrated | rejected | archived | superseded) return 0 ;; *) return 1 ;; esac; }
is_terminal_activity_status() {
  case $1 in archived | blocked | canceled | cancelled | completed | done | failed | integrated | partial | pushed | rejected | rolled_back | stopped | superseded) return 0 ;; *) return 1 ;; esac
}
integrated_commit_state() { local commit=$1 main=$2 result
  "$GIT" -C "$INTEGRATION" cat-file -e "$commit^{commit}" 2>/dev/null || return 2
  if "$GIT" -C "$INTEGRATION" merge-base --is-ancestor "$commit" "$main"; then return 0
  else result=$?; fi
  ((result == 1)) || fail 'cannot compare integrated ledger commit with main'
  return 1
}
readonly RELOCATED_APPLY_IMPLEMENTATION=$SCRIPT_DIRECTORY/consumed-worktree-janitor-relocated-apply.sh
validate_trusted_path "$RELOCATED_APPLY_IMPLEMENTATION" file 'relocated apply implementation'
# shellcheck source=consumed-worktree-janitor-relocated-apply.sh
source "$RELOCATED_APPLY_IMPLEMENTATION"
load_janitor_audit
select_relocated_receipt_recovery
declare -A ledger_workspace_by_id=() ledger_target_by_id=() ledger_numstat_hash_by_id=() ledger_job_by_id=() ledger_status_by_id=() ledger_integrated_commit_by_id=()
declare -A ledger_patch_hash_by_id=() ledger_status_hash_by_id=()
declare -A ledger_numstat_path_by_id=() ledger_patch_path_by_id=() ledger_status_path_by_id=()
declare -A ledger_item_hash_by_id=()
declare -A ledger_registry_path_by_id=() ledger_registry_hash_by_id=()
declare -A latest_item=() latest_item_hash=() latest_integrated_commit=() latest_job=() latest_ledger=()
declare -A latest_numstat=() latest_numstat_hash=() latest_patch=() latest_patch_hash=() latest_status=()
declare -A latest_status_file=() latest_status_hash=() latest_time=() latest_workspace_kind=()
declare -A latest_legacy_registry_bound=() latest_target=() relocated_logical_by_target=()
declare -A latest_registry_path=() latest_registry_hash=()
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
      type == "string" and test("^[A-Za-z0-9._:-]+$");
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
  IFS=$'\t' read -r job_id attempt_id status consumed_at archive workspace status_file patch_file numstat_file <<<"$record"
  integrated_commit=$("$JQ" -r '.integratedCommitSha // empty' "$item")
  ledger_id=${item##*/}
  ledger_id=${ledger_id%.json}
  attempt_filename=$attempt_id
  if [[ ! $attempt_id =~ ^[A-Za-z0-9._-]+$ ]]; then
    is_terminal_ledger_status "$status" && fail "terminal attempt ID is unsafe: $item"
    [[ $attempt_id =~ ^[A-Za-z0-9._-]+:[A-Za-z0-9._-]+$ ]] ||
      fail "nonterminal attempt ID is unsafe or unbound: $item"
    attempt_filename=${attempt_id/:/_}
  fi
  [[ ${item##*/} == "$job_id--$attempt_filename.json" ]] ||
    fail "ledger filename conflicts with its IDs: $item"
  workspace=$(lexical_declared_path "$workspace" 'ledger workspace')
  legacy_registry_bound=0
  if [[ -L $workspace && ${workspace%/*} == "$WORKTREES" ]]; then
    target=$(validate_relocated_workspace "$workspace")
    workspace_kind=relocated
    relocated_logical_by_target["$target"]=$workspace
  elif [[ -n ${v2_logical[$ledger_id]:-} ]]; then
    [[ ${v2_logical[$ledger_id]} == "$workspace" ]] ||
      fail "schema-v2 receipt logical path conflicts with ledger: $ledger_id"
    target=${v2_target[$ledger_id]}
    [[ ! -e $workspace && ! -L $workspace ]] ||
      fail "schema-v2 replay has an unsupported logical path state: $ledger_id"
    [[ $target == "$RELOCATION_ARCHIVE_ROOT/${workspace##*/}" ]] ||
      fail "schema-v2 receipt target conflicts with relocation layout: $ledger_id"
    workspace_kind=relocated
    relocated_logical_by_target["$target"]=$workspace
  else
    workspace=$(canonical_declared_path "$workspace" 'ledger workspace')
    target=$workspace
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
    [[ ${workspace##*/} == "$job_id" ]] || legacy_registry_bound=1
  fi
  if is_terminal_ledger_status "$status"; then
    archive=$(canonical_declared_path "$archive" 'ledger archive')
    status_file=$(canonical_declared_path "$status_file" 'status evidence')
    patch_file=$(canonical_declared_path "$patch_file" 'patch evidence')
    numstat_file=$(canonical_declared_path "$numstat_file" 'numstat evidence')
    [[ $status_file == "$archive/git-status.txt" && $patch_file == "$archive/tracked.diff" && $numstat_file == "$archive/tracked.numstat" ]] ||
      fail "ledger evidence paths conflict with the archive: $item"
    validate_archive_location "$job_id" "$workspace" "$archive"
    ledger_registry_path_by_id["$ledger_id"]=$VALIDATED_REGISTRY_PATH
    ledger_registry_hash_by_id["$ledger_id"]=$("$SHA256SUM" -- "$VALIDATED_REGISTRY_PATH")
    ledger_registry_hash_by_id["$ledger_id"]=${ledger_registry_hash_by_id[$ledger_id]%%[[:space:]]*}
    for evidence in "$status_file" "$patch_file" "$numstat_file"; do
      validate_trusted_path "$evidence" file 'terminal evidence'
    done
    ledger_numstat_hash_by_id["$ledger_id"]=$("$SHA256SUM" -- "$numstat_file")
    ledger_numstat_hash_by_id["$ledger_id"]=${ledger_numstat_hash_by_id[$ledger_id]%%[[:space:]]*}
    ledger_numstat_path_by_id["$ledger_id"]=$numstat_file
    ledger_patch_hash_by_id["$ledger_id"]=$("$SHA256SUM" -- "$patch_file")
    ledger_patch_hash_by_id["$ledger_id"]=${ledger_patch_hash_by_id[$ledger_id]%%[[:space:]]*}
    ledger_patch_path_by_id["$ledger_id"]=$patch_file
    ledger_status_hash_by_id["$ledger_id"]=$("$SHA256SUM" -- "$status_file")
    ledger_status_hash_by_id["$ledger_id"]=${ledger_status_hash_by_id[$ledger_id]%%[[:space:]]*}
    ledger_status_path_by_id["$ledger_id"]=$status_file
    validate_terminal_archive_name "$job_id" "$attempt_id" "$status" "$archive" "$workspace" "${ledger_patch_hash_by_id[$ledger_id]}" "$integrated_commit"
  fi
  ledger_workspace_by_id["$ledger_id"]=$workspace
  ledger_target_by_id["$ledger_id"]=$target
  ledger_job_by_id["$ledger_id"]=$job_id ledger_status_by_id["$ledger_id"]=$status ledger_integrated_commit_by_id["$ledger_id"]=${integrated_commit:--}
  item_hash=$({ "$SHA256SUM" -- "$item" || fail "cannot hash ledger item: $item"; })
  item_hash=${item_hash%%[[:space:]]*}
  ledger_item_hash_by_id["$ledger_id"]=$item_hash
  if [[ -n ${latest_time[$workspace]:-} ]]; then
    if [[ ${latest_time[$workspace]} == "$consumed_at" && ${latest_ledger[$workspace]} != "$ledger_id" ]]; then
      fail "conflicting ledger items have the same terminal ordering time: $workspace"
    fi
    [[ $consumed_at > ${latest_time[$workspace]} ]] || continue
  fi
  latest_item["$workspace"]=$item
  latest_item_hash["$workspace"]=$item_hash
  latest_integrated_commit["$workspace"]=$integrated_commit
  latest_job["$workspace"]=$job_id
  latest_ledger["$workspace"]=$ledger_id
  latest_numstat["$workspace"]=$numstat_file
  latest_patch["$workspace"]=$patch_file
  latest_status["$workspace"]=$status
  latest_status_file["$workspace"]=$status_file
  latest_time["$workspace"]=$consumed_at
  latest_target["$workspace"]=$target
  latest_workspace_kind["$workspace"]=$workspace_kind
  latest_legacy_registry_bound["$workspace"]=$legacy_registry_bound
  if is_terminal_ledger_status "$status"; then
    latest_numstat_hash["$workspace"]=${ledger_numstat_hash_by_id[$ledger_id]}
    latest_patch_hash["$workspace"]=${ledger_patch_hash_by_id[$ledger_id]}
    latest_status_hash["$workspace"]=${ledger_status_hash_by_id[$ledger_id]}
    latest_registry_path["$workspace"]=${ledger_registry_path_by_id[$ledger_id]}
    latest_registry_hash["$workspace"]=${ledger_registry_hash_by_id[$ledger_id]}
  fi
done
bind_prepared_receipts_as_recovery_candidates
validate_audit_bindings_after_ledger
worktree_porcelain=$("$GIT" -C "$INTEGRATION" worktree list --porcelain) ||
  fail 'cannot enumerate registered Git worktrees'
declare -A registered_count=() registered_locked=()
registered_path=
while IFS= read -r line; do
  if [[ $line == worktree\ * ]]; then
    registered_path=${line#worktree }
    registered_path=$("$REALPATH" -m -- "$registered_path") ||
      fail 'cannot canonicalize registered Git worktree'
    registered_count["$registered_path"]=$(( ${registered_count[$registered_path]:-0} + 1 ))
  elif [[ $line == locked || $line == locked\ * ]]; then
    [[ -n $registered_path ]] || fail 'Git reported an unbound worktree lock'
    registered_locked["$registered_path"]=1
  fi
done <<<"$worktree_porcelain"
declare -A activity_protected=()
protect_worktree_for_path() {
  local path=$1 reason=$2
  local relative worktree_root relocated_target
  case $path in
    "$RELOCATION_ARCHIVE_ROOT"/*)
      relative=${path#"$RELOCATION_ARCHIVE_ROOT"/}
      relocated_target=$RELOCATION_ARCHIVE_ROOT/${relative%%/*}
      if [[ -n ${relocated_logical_by_target[$relocated_target]:-} ]]; then
        activity_protected["${relocated_logical_by_target[$relocated_target]}"]=$reason
        return
      fi
      ;;
  esac
  case $path in
    "$WORKTREES"/*)
      relative=${path#"$WORKTREES"/}
      worktree_root=$WORKTREES/${relative%%/*}
      activity_protected["$worktree_root"]=$reason
      ;;
  esac
}
protect_manifest_paths() {
  local manifest=$1 reason=$2
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
    canonical_path=$(lexical_declared_path "$path" 'active workspace evidence')
    if [[ -L $canonical_path && ${canonical_path%/*} == "$WORKTREES" ]]; then
      canonical_path=$(validate_relocated_workspace "$canonical_path")
    else
      canonical_path=$(canonical_declared_path "$canonical_path" 'active workspace evidence')
    fi
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
  controller_workspace=$("$JQ" -er 'select(type == "object" and
      (.workspacePath | type == "string" and startswith("/"))) | .workspacePath' "$CONTROL/controller-job.json") ||
    fail 'controller job evidence is malformed or unbound'
  controller_workspace=$(lexical_declared_path "$controller_workspace" 'controller workspace')
  if [[ -L $controller_workspace && ${controller_workspace%/*} == "$WORKTREES" ]]; then
    controller_workspace=$(validate_relocated_workspace "$controller_workspace")
  else
    controller_workspace=$(canonical_declared_path "$controller_workspace" 'controller workspace')
  fi
  case $controller_workspace in
    "$WORKTREES"/*) protect_worktree_for_path "$controller_workspace" 'controller-workspace' ;;
    "$CONTROL" | "$INTEGRATION") ;;
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
  local job_root=$1 state_file status tmux_alive result_status
  local progress_files=("$job_root"/*.progress.json) result_files=("$job_root"/*.latest-result.json)
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
    tmux_alive=$("$JQ" -er '.status.tmuxAlive // false | booleans | tostring' "$state_file") ||
      fail "cannot read review tmux liveness: $state_file"
    [[ $tmux_alive == true ]] && return 0
    result_status=$("$JQ" -r '.status.resultStatus // .status.progressStatus // empty | strings' "$state_file") ||
      fail "cannot read review result liveness: $state_file"
    [[ -z $result_status ]] || is_terminal_activity_status "$result_status" || return 0
  done
  return 1
}
PROCESS_SCAN_INCOMPLETE=0
declare -a PLANNING_PROCESS_PATHS=()
inspect_process_path() {
  local raw_path=$1 scan_mode=$2 target=${3:-}
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
  local scan_mode=$1 target=${2:-}
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
read_process_identity() { local process_dir=$1 phase=$2 stat_file stat_line stat_tail pid; local -a stat_fields=()
  stat_file=$process_dir/stat
  pid=${process_dir##*/}
  [[ -z $TEST_ROOT || $phase != recheck || ! -f $process_dir/stat.recheck ||
    -L $process_dir/stat.recheck ]] || stat_file=$process_dir/stat.recheck
  [[ $pid =~ ^[0-9]+$ && -f $stat_file && ! -L $stat_file && -r $stat_file ]] || return 1
  stat_line=$(<"$stat_file") || return 1; [[ $stat_line == "$pid ("* ]] || return 1; stat_tail=${stat_line##*) }
  [[ $stat_tail != "$stat_line" ]] || return 1; read -r -a stat_fields <<<"$stat_tail"
  ((${#stat_fields[@]} >= 20)) && [[ ${stat_fields[19]} =~ ^[0-9]+$ ]] || return 1
  printf '%s:%s\n' "$pid" "${stat_fields[19]}"
}
recheck_process_identity() { local process_dir=$1 expected=$2 current
  [[ -d $process_dir ]] || return 1
  current=$(read_process_identity "$process_dir" recheck) || { [[ -d $process_dir ]] || return 1; return 2; }
  [[ $current == "$expected" ]] || return 1
}
status_has_no_process_resources() { local status=$1 line
  while IFS= read -r line; do
    [[ $line =~ ^Kthread:[[:space:]]*1[[:space:]]*$ ||
      $line =~ ^State:[[:space:]]*Z([[:space:]]|$) ]] && return 0
  done <<<"$status"; return 1
}
scan_proc_process_evidence() { local proc_root=$1 scan_mode=$2 target=${3:-}
  local process_dir link_path raw_link identity status recheck_result unreadable; local -a raw_paths=()
  for process_dir in "$proc_root"/[0-9]*; do
    [[ -d $process_dir ]] || continue
    if ! identity=$(read_process_identity "$process_dir" initial); then
      [[ -d $process_dir ]] && PROCESS_SCAN_INCOMPLETE=1; continue
    fi
    if [[ ! -f $process_dir/status || -L $process_dir/status ||
      ! -r $process_dir/status ]] || ! status=$(<"$process_dir/status"); then
      if recheck_process_identity "$process_dir" "$identity"; then PROCESS_SCAN_INCOMPLETE=1
      else recheck_result=$?; ((recheck_result == 1)) || PROCESS_SCAN_INCOMPLETE=1; fi
      continue
    fi
    if status_has_no_process_resources "$status"; then
      recheck_process_identity "$process_dir" "$identity" || {
        recheck_result=$?; ((recheck_result == 1)) || PROCESS_SCAN_INCOMPLETE=1; }; continue
    fi
    unreadable=0; raw_paths=()
    for link_path in "$process_dir/cwd" "$process_dir/root" "$process_dir/exe"; do
      if [[ -L $link_path ]] && raw_link=$("$READLINK" -- "$link_path" 2>/dev/null); then raw_paths+=("$raw_link"); else unreadable=1; fi
    done
    for link_path in "$process_dir"/fd/*; do
      [[ -L $link_path ]] || continue
      if raw_link=$("$READLINK" -- "$link_path" 2>/dev/null); then raw_paths+=("$raw_link"); else unreadable=1; fi
    done
    if recheck_process_identity "$process_dir" "$identity"; then :
    else
      recheck_result=$?; ((recheck_result == 1)) || PROCESS_SCAN_INCOMPLETE=1; continue
    fi
    ((unreadable == 0)) || { PROCESS_SCAN_INCOMPLETE=1; continue; }
    for raw_link in "${raw_paths[@]}"; do
      inspect_process_path "$raw_link" "$scan_mode" "$target" && return 0
    done
  done; return 1
}
scan_process_evidence() { local scan_mode=$1 target=${2:-} test_proc=$PROJECT_ROOT/.social-monitor-janitor-test-proc
  if [[ -n $TEST_ROOT ]]; then
    scan_synthetic_process_evidence "$scan_mode" "$target" && return 0
    [[ -d $test_proc && ! -L $test_proc ]] || return 1
    scan_proc_process_evidence "$test_proc" "$scan_mode" "$target"
  else scan_proc_process_evidence /proc "$scan_mode" "$target"; fi
}
snapshot_process_evidence() { PROCESS_SCAN_INCOMPLETE=0
  PLANNING_PROCESS_PATHS=()
  scan_process_evidence snapshot || true
  ((PROCESS_SCAN_INCOMPLETE == 0)) || fail 'process-use snapshot was incomplete; refusing to proceed'
}
planning_process_uses_worktree() { local target=$1 process_path
  for process_path in "${PLANNING_PROCESS_PATHS[@]}"; do
    case $process_path in
      "$target" | "$target"/*) return 0 ;;
    esac
  done
  return 1
}
live_process_uses_worktree() { local target=$1
  PROCESS_SCAN_INCOMPLETE=0
  scan_process_evidence live "$target" && return 0
  ((PROCESS_SCAN_INCOMPLETE == 0)) || fail 'process-use recheck was incomplete'
  return 1
}
is_registered_now() {
  local target=$1 listing line path
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
  local target=$1 listing line path current_path=
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
current_directory=$("$REALPATH" -m -- "$PWD") || fail 'cannot canonicalize current directory'
declare -a plan_items=() plan_jobs=() plan_ledgers=() plan_workspaces=() plan_targets=()
declare -a plan_bytes=() plan_target_inodes=() plan_link_inodes=()
declare -a plan_kinds=() plan_item_hashes=() plan_status_files=() plan_status_hashes=() plan_patch_files=() plan_patch_hashes=()
declare -a plan_numstat_files=() plan_numstat_hashes=() plan_logical_identities=() plan_target_identities=() plan_registry_paths=()
declare -a plan_registry_hashes=() plan_git_registration_hashes=() plan_integrated_commits=()
eligible=0 excluded=0 replayed=0 total_apparent_bytes=0 total_target_inodes=0
total_logical_symlink_inodes=0
classify_completed_v2_receipts
snapshot_process_evidence
mapfile -t sorted_workspaces < <(printf '%s\n' "${!latest_time[@]}" | LC_ALL=C "$SORT")
for workspace in "${sorted_workspaces[@]}"; do
  status=${latest_status[$workspace]}
  ledger_id=${latest_ledger[$workspace]}
  target=${latest_target[$workspace]}
  workspace_kind=${latest_workspace_kind[$workspace]}
  has_v2=0
  [[ -n ${v2_logical[$ledger_id]:-} ]] && has_v2=1
  [[ -z ${v2_replayed[$ledger_id]:-} ]] || continue
  is_terminal_ledger_status "$status" || {
    excluded=$((excluded + 1))
    continue
  }
  if [[ $status == integrated ]]; then
    integrated_commit=${latest_integrated_commit[$workspace]}
    if integrated_commit_state "$integrated_commit" "$MAIN_COMMIT"; then
      :
    else
      commit_state=$?
      ((commit_state == 1)) && reason=integrated-commit-not-retained ||
        reason=integrated-commit-unavailable
      printf 'excluded reason=%s ledger=%s worktree=%s\n' "$reason" "$ledger_id" "$workspace"
      excluded=$((excluded + 1))
      continue
    fi
  fi
  if [[ ${latest_legacy_registry_bound[$workspace]} == 1 ]]; then
    printf 'excluded reason=legacy-registry-bound ledger=%s worktree=%s\n' "$ledger_id" "$workspace"
    excluded=$((excluded + 1))
    continue
  fi
  if ((RELOCATED_RECEIPT_RECOVERY == 1)) && [[ $workspace_kind == relocated ]] &&
    { ((has_v2 == 0)) || [[ ${v2_plan_sha[$ledger_id]} != "$EXPECTED_PLAN_SHA256" ]]; }; then
    printf 'excluded reason=relocated-recovery-other-batch ledger=%s worktree=%s target=%s\n' "$ledger_id" "$workspace" "$target"
    excluded=$((excluded + 1))
    continue
  fi
  if [[ $workspace_kind == volume2-unsupported ]]; then
    printf 'excluded reason=unsupported-volume2-layout ledger=%s worktree=%s\n' "$ledger_id" "$workspace"
    excluded=$((excluded + 1))
    continue
  fi
  if [[ $MODE == apply && $workspace_kind == relocated ]]; then
    printf 'excluded reason=relocation-dry-run-only ledger=%s worktree=%s target=%s\n' "$ledger_id" "$workspace" "$target"
    excluded=$((excluded + 1))
    continue
  elif [[ $MODE == apply && $workspace_kind == volume2-* ]]; then
    printf 'excluded reason=volume2-dry-run-only ledger=%s worktree=%s\n' "$ledger_id" "$workspace"
    excluded=$((excluded + 1))
    continue
  elif [[ $MODE == apply-relocated && $workspace_kind != relocated ]]; then
    printf 'excluded reason=ordinary-apply-only ledger=%s worktree=%s target=%s\n' "$ledger_id" "$workspace" "$target"
    excluded=$((excluded + 1))
    continue
  fi
  if [[ -n ${audited_workspace[$ledger_id]:-} ]]; then
    if [[ -e $workspace || -L $workspace ||
      ${registered_count[${ledger_target_by_id[$ledger_id]}]:-0} != 0 ]]; then
      fail "audit receipt conflicts with an existing or registered worktree: $ledger_id"
    fi
    replayed=$((replayed + 1))
    continue
  fi
  if [[ $workspace_kind == relocated ]]; then
    if [[ -L $workspace ]]; then
      current_target=$(validate_relocated_workspace "$workspace")
      [[ $current_target == "$target" ]] ||
        fail "relocation target changed during preflight: $workspace"
      if ((has_v2 == 1)); then
        [[ $(path_identity "$workspace") == "${v2_logical_identity[$ledger_id]}" ]] ||
          fail "schema-v2 replay logical identity changed: $ledger_id"
      fi
    else
      ((has_v2 == 1)) || fail "relocated logical path disappeared without a prepared receipt: $ledger_id"
      [[ ! -e $workspace && ! -L $workspace ]] ||
        fail "schema-v2 replay logical path has an unsupported state: $ledger_id"
      if [[ -d $target && ! -L $target ]]; then
        validate_relocated_target_without_logical "$workspace" "$target"
      else
        [[ ! -e $target && ! -L $target ]] ||
          fail "schema-v2 replay target has an unsupported state: $ledger_id"
      fi
    fi
  else
    [[ -d $workspace && ! -L $workspace ]] || {
      excluded=$((excluded + 1))
      continue
    }
  fi
  expected_registration_count=1
  if ((has_v2 == 1)) && [[ ! -e $target && ! -L $target ]]; then
    expected_registration_count=0
  fi
  [[ ${registered_count[$target]:-0} == "$expected_registration_count" ]] || {
    printf 'excluded reason=git-registration-count ledger=%s worktree=%s target=%s count=%s\n' "$ledger_id" "$workspace" "$target" "${registered_count[$target]:-0}"
    excluded=$((excluded + 1))
    continue
  }
  if ((expected_registration_count == 1)) && [[ -n ${registered_locked[$target]:-} ]]; then
    printf 'excluded reason=git-worktree-locked ledger=%s worktree=%s\n' "$ledger_id" "$workspace"
    excluded=$((excluded + 1))
    continue
  fi
  if ((expected_registration_count == 1)); then
    target_root=$("$GIT" -C "$target" rev-parse --show-toplevel 2>/dev/null) ||
      fail "registered target is not a readable Git worktree: $target"
    target_root=$("$REALPATH" -e -- "$target_root") || fail 'cannot canonicalize target Git root'
    [[ $target_root == "$target" ]] || fail "target Git root conflicts with ledger: $workspace"
  fi
  case ${workspace##*/} in
    artifacts | auth | backups | controller | handoffs | integration | registries | registry | toolchain | toolchains)
      excluded=$((excluded + 1))
      continue
      ;;
  esac
  if [[ $current_directory == "$workspace" || $current_directory == "$workspace"/* ||
    $current_directory == "$target" || $current_directory == "$target"/* ||
    $SCRIPT_PATH == "$workspace"/* || $SCRIPT_PATH == "$target"/* ]]; then
    printf 'excluded reason=current-worktree ledger=%s worktree=%s\n' "$ledger_id" "$workspace"
    excluded=$((excluded + 1))
    continue
  fi
  if [[ -n ${activity_protected[$workspace]:-} ]]; then
    printf 'excluded reason=%s ledger=%s worktree=%s\n' "${activity_protected[$workspace]}" "$ledger_id" "$workspace"
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
  if planning_process_uses_worktree "$target"; then
    printf 'excluded reason=active-process ledger=%s worktree=%s\n' "$ledger_id" "$workspace"
    excluded=$((excluded + 1))
    continue
  fi
  if ((expected_registration_count == 1)); then
    worktree_matches_terminal_evidence "$target" "${latest_status_file[$workspace]}" "${latest_patch[$workspace]}" "${latest_numstat[$workspace]}" || { printf 'excluded reason=terminal-evidence-conflict ledger=%s worktree=%s target=%s\n' "$ledger_id" "$workspace" "$target"; excluded=$((excluded + 1)); continue; }
    byte_record=$("$DU" -sb --apparent-size -- "$target") ||
      fail "cannot measure worktree bytes: $target"
    before_bytes=${byte_record%%[[:space:]]*}
    inode_record=$("$DU" -s --inodes -- "$target") ||
      fail "cannot measure worktree inodes: $target"
    target_inodes=${inode_record%%[[:space:]]*}
  else
    before_bytes=${v2_before_bytes[$ledger_id]}
    target_inodes=${v2_target_inodes[$ledger_id]}
  fi
  [[ $before_bytes =~ ^[0-9]+$ && $target_inodes =~ ^[0-9]+$ ]] ||
    fail "invalid worktree accounting snapshot: $target"
  logical_symlink_inodes=0
  [[ $workspace_kind == relocated ]] && logical_symlink_inodes=1
  integrated_plan_commit=${latest_integrated_commit[$workspace]:--}
  [[ -n $integrated_plan_commit ]] || integrated_plan_commit=-
  if [[ $workspace_kind == relocated ]]; then
    if ((has_v2 == 1)); then
      logical_identity=${v2_logical_identity[$ledger_id]}
      target_identity=${v2_target_identity[$ledger_id]}
      git_registration_hash=${v2_git_registration_sha[$ledger_id]}
      [[ ${v2_integrated_commit[$ledger_id]} == "$integrated_plan_commit" ]] ||
        fail "schema-v2 receipt integrated commit conflicts: $ledger_id"
      if ((expected_registration_count == 1)); then
        [[ $(path_identity "$target") == "$target_identity" ]] ||
          fail "schema-v2 replay target identity changed: $ledger_id"
        capture_exact_unlocked_git_registration "$target"
        [[ $(sha256_text "$CAPTURED_GIT_REGISTRATION") == "$git_registration_hash" ]] ||
          fail "schema-v2 replay Git registration changed: $ledger_id"
      fi
    else
      logical_identity=$(path_identity "$workspace")
      target_identity=$(path_identity "$target")
      capture_exact_unlocked_git_registration "$target"
      git_registration_hash=$(sha256_text "$CAPTURED_GIT_REGISTRATION")
    fi
  else
    logical_identity=- target_identity=- git_registration_hash=-
  fi
  plan_items+=("${latest_item[$workspace]}")
  plan_jobs+=("${latest_job[$workspace]}")
  plan_ledgers+=("$ledger_id")
  plan_workspaces+=("$workspace")
  plan_targets+=("$target")
  plan_bytes+=("$before_bytes")
  plan_target_inodes+=("$target_inodes")
  plan_link_inodes+=("$logical_symlink_inodes")
  plan_kinds+=("$workspace_kind")
  plan_item_hashes+=("${latest_item_hash[$workspace]}")
  plan_status_files+=("${latest_status_file[$workspace]}")
  plan_status_hashes+=("${latest_status_hash[$workspace]}")
  plan_patch_files+=("${latest_patch[$workspace]}")
  plan_patch_hashes+=("${latest_patch_hash[$workspace]}")
  plan_numstat_files+=("${latest_numstat[$workspace]}")
  plan_numstat_hashes+=("${latest_numstat_hash[$workspace]}")
  plan_logical_identities+=("$logical_identity")
  plan_target_identities+=("$target_identity")
  plan_registry_paths+=("${latest_registry_path[$workspace]}")
  plan_registry_hashes+=("${latest_registry_hash[$workspace]}")
  plan_git_registration_hashes+=("$git_registration_hash")
  plan_integrated_commits+=("$integrated_plan_commit")
  total_apparent_bytes=$((total_apparent_bytes + before_bytes))
  total_target_inodes=$((total_target_inodes + target_inodes))
  total_logical_symlink_inodes=$((total_logical_symlink_inodes + logical_symlink_inodes))
  eligible=$((eligible + 1))
done
RELOCATED_PLAN_SHA256=$(compute_relocated_plan_sha256) || fail 'cannot compute deterministic relocated plan digest'
relocated_plan_candidates=0
for index in "${!plan_targets[@]}"; do
  [[ ${plan_kinds[$index]} == relocated ]] && relocated_plan_candidates=$((relocated_plan_candidates + 1))
done
if [[ $MODE == apply-relocated && $EXPECTED_PLAN_SHA256 != "$RELOCATED_PLAN_SHA256" &&
  $RELOCATED_RECEIPT_RECOVERY == 0 ]]; then
  fail "relocated plan mismatch expected=$EXPECTED_PLAN_SHA256 actual=$RELOCATED_PLAN_SHA256"
fi
printf 'relocated-plan schemaVersion=2 sha256=%s candidates=%s main=%s\n' "$RELOCATED_PLAN_SHA256" "$relocated_plan_candidates" "$MAIN_COMMIT"
removed=0
if [[ $MODE == dry-run ]]; then
  for index in "${!plan_targets[@]}"; do
    total_inodes=$((plan_target_inodes[index] + plan_link_inodes[index]))
    printf 'would-remove ledger=%s worktree=%s target=%s beforeBytes=%s apparentBytes=%s targetInodes=%s logicalSymlinkInodes=%s totalInodes=%s afterBytes=0\n' "${plan_ledgers[$index]}" "${plan_workspaces[$index]}" "${plan_targets[$index]}" "${plan_bytes[$index]}" "${plan_bytes[$index]}" "${plan_target_inodes[$index]}" "${plan_link_inodes[$index]}" "$total_inodes"
  done
elif [[ $MODE == apply ]]; then
  apply_ordinary_plan
else
  apply_relocated_plan
fi
printf 'consumed-worktree-janitor mode=%s eligible=%s removed=%s replayed=%s excluded=%s apparentBytes=%s targetInodes=%s logicalSymlinkInodes=%s totalInodes=%s\n' "$MODE" "$eligible" "$removed" "$replayed" "$excluded" "$total_apparent_bytes" "$total_target_inodes" "$total_logical_symlink_inodes" "$((total_target_inodes + total_logical_symlink_inodes))"
