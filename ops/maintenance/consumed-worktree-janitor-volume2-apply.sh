#!/usr/bin/env bash
# Sourced by consumed-worktree-janitor.sh after its trusted runtime is initialized.
readonly VOLUME2_AUDIT_LOG=$CONTROL/consumed-worktree-janitor-volume2.audit.jsonl
declare -A volume2_workspace_by_parent=() volume2_receipt_kind=() volume2_receipt_target=() volume2_receipt_plan=() volume2_receipt_main=()
declare -A volume2_receipt_item_path=() volume2_receipt_item_sha=() volume2_receipt_status_path=() volume2_receipt_status_sha=() volume2_receipt_patch_path=() volume2_receipt_patch_sha=()
declare -A volume2_receipt_numstat_path=() volume2_receipt_numstat_sha=() volume2_receipt_registry_path=() volume2_receipt_registry_sha=() volume2_receipt_integrated=()
declare -A volume2_receipt_target_identity=() volume2_receipt_parent_identity=() volume2_receipt_mount_identity=() volume2_receipt_registration_sha=() volume2_receipt_bytes=() volume2_receipt_inodes=()
declare -A volume2_receipt_lock_identity=() volume2_receipt_prepared_at=() volume2_receipt_purged_at=() volume2_receipt_removed=() volume2_receipt_purged=() volume2_receipt_replayed=()
VOLUME2_CANDIDATE_TARGET_IDENTITY=- VOLUME2_CANDIDATE_PARENT_IDENTITY=-
VOLUME2_CANDIDATE_MOUNT_IDENTITY=- VOLUME2_CANDIDATE_REGISTRATION_SHA=-
VOLUME2_RECEIPT_RECOVERY=0

# Volume2 worktrees are removed only after the directory has been opened without
# following a symlink and its inode/device identity has been checked.  Git still
# owns registry bookkeeping, but it must never be the recursive pathname purge.
readonly VOLUME2_PURGE=/usr/bin/python3
validate_trusted_path "$PROJECT_LOCK" file 'volume2 lifecycle lock'
VOLUME2_LIFECYCLE_LOCK_IDENTITY=$(path_identity "$PROJECT_LOCK")
readonly VOLUME2_LIFECYCLE_LOCK_IDENTITY

assert_volume2_lifecycle_lock() {
  local path_identity_now fd_identity_now
  validate_trusted_path "$PROJECT_LOCK" file 'volume2 lifecycle lock'
  path_identity_now=$(path_identity "$PROJECT_LOCK")
  fd_identity_now=$("$STAT" -Lc '%d:%i:%u:%g:%a' -- "/proc/$$/fd/$LOCK_FD") ||
    fail 'cannot inspect held volume2 lifecycle lock'
  [[ $path_identity_now == "$VOLUME2_LIFECYCLE_LOCK_IDENTITY" &&
    $fd_identity_now == "$VOLUME2_LIFECYCLE_LOCK_IDENTITY" ]] ||
    fail 'volume2 lifecycle lock identity changed or detached'
}

volume2_validate_identity() {
  local value=$1 label=$2
  [[ $value =~ ^[0-9]+:[0-9]+:[0-9]+:[0-9]+:[0-7]{3,4}$ ]] ||
    fail "invalid $label identity"
}

purge_volume2_from_bound_fds() {
  local kind=$1 target=$2 target_identity=$3 mount_identity=$4 parent_identity=$5
  volume2_validate_identity "$target_identity" 'volume2 target'
  [[ $mount_identity =~ ^/[^|]*\|([^|]+)\|([^|]+)$ ]] || fail 'invalid volume2 mount identity'
  local mount_path=${mount_identity%%|*} root_identity=${BASH_REMATCH[1]} node_identity=${BASH_REMATCH[2]}
  volume2_validate_identity "$root_identity" 'volume2 mount root'
  volume2_validate_identity "$node_identity" 'volume2 mount node'
  [[ $kind == volume2-direct ]] || volume2_validate_identity "$parent_identity" 'volume2 parent'
  [[ -x $VOLUME2_PURGE ]] || fail 'descriptor-relative volume2 purge is unavailable'
  "$VOLUME2_PURGE" - "$kind" "$mount_path" "$WORKTREES/.volume2" "$target" \
    "$target_identity" "$root_identity" "$node_identity" "${parent_identity:--}" <<'PY'
import os
import stat
import sys

kind, mount_path, root_path, target_path, target_id, root_id, node_id, parent_id = sys.argv[1:]

def identity(st):
    return f"{st.st_dev}:{st.st_ino}:{st.st_uid}:{st.st_gid}:{stat.S_IMODE(st.st_mode):03o}"

def open_dir_at(parent_fd, name):
    return os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)

def decode_mountinfo_path(value):
    # mountinfo uses octal escapes for whitespace, backslashes, and tabs.
    out = []
    i = 0
    while i < len(value):
        if value[i] == "\\" and i + 3 < len(value) and value[i + 1:i + 4].isdigit():
            try:
                out.append(chr(int(value[i + 1:i + 4], 8)))
                i += 4
                continue
            except ValueError:
                pass
        out.append(value[i])
        i += 1
    return "".join(out)

def mountpoints():
    result = set()
    try:
        with open("/proc/self/mountinfo", "r", encoding="ascii") as stream:
            for line in stream:
                left = line.split(" - ", 1)[0].split()
                if len(left) > 4:
                    result.add(os.path.normpath(decode_mountinfo_path(left[4])))
    except (OSError, UnicodeError):
        # An unreadable mount table is not evidence of safety.
        raise RuntimeError("cannot inspect the process mount table")
    return result

def is_mountpoint(path, known_mountpoints):
    normalized = os.path.normpath(path)
    return normalized in known_mountpoints

def purge(fd, expected_device, directory_path, known_mountpoints):
    for name in os.listdir(fd):
        st = os.stat(name, dir_fd=fd, follow_symlinks=False)
        child_path = os.path.join(directory_path, name)
        if is_mountpoint(child_path, known_mountpoints):
            raise RuntimeError("volume2 purge encountered a nested mount")
        if st.st_dev != expected_device:
            raise RuntimeError("volume2 purge encountered a foreign filesystem")
        if stat.S_ISDIR(st.st_mode):
            child = open_dir_at(fd, name)
            try:
                # Re-read mountinfo after opening the descriptor.  A bind
                # mount can be attached between the directory listing and
                # open; never recurse into a path that became a mountpoint.
                if is_mountpoint(child_path, mountpoints()):
                    raise RuntimeError("volume2 purge encountered a raced nested mount")
                child_st = os.fstat(child)
                if (child_st.st_dev, child_st.st_ino) != (st.st_dev, st.st_ino):
                    raise RuntimeError("volume2 child identity changed")
                if child_st.st_dev != expected_device:
                    raise RuntimeError("volume2 purge encountered a foreign mount")
                purge(child, expected_device, child_path, known_mountpoints)
            finally:
                os.close(child)
            os.rmdir(name, dir_fd=fd)
        else:
            os.unlink(name, dir_fd=fd)

mount_fd = os.open(mount_path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
try:
    root_st = os.fstat(mount_fd)
    if identity(root_st) != root_id:
        raise RuntimeError("volume2 mount root identity changed")
finally:
    os.close(mount_fd)

root_fd = os.open(root_path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
try:
    if identity(os.fstat(root_fd)) != node_id:
        raise RuntimeError("volume2 mount node identity changed")
    relative = os.path.relpath(target_path, root_path)
    parts = relative.split(os.sep)
    if kind == "volume2-direct":
        if len(parts) != 1:
            raise RuntimeError("direct target escaped volume2 root")
        parent_fd = root_fd
        close_parent = False
        target_name = parts[0]
    elif kind == "volume2-nested":
        if len(parts) != 2:
            raise RuntimeError("nested target escaped volume2 root")
        parent_fd = open_dir_at(root_fd, parts[0])
        close_parent = True
        try:
            if identity(os.fstat(parent_fd)) != parent_id:
                raise RuntimeError("volume2 parent identity changed")
            target_name = parts[1]
        except Exception:
            os.close(parent_fd)
            raise
    else:
        raise RuntimeError("unsupported volume2 layout")
    try:
        target_fd = open_dir_at(parent_fd, target_name)
        try:
            if identity(os.fstat(target_fd)) != target_id:
                raise RuntimeError("volume2 target identity changed")
            known_mountpoints = mountpoints()
            if is_mountpoint(target_path, known_mountpoints) or is_mountpoint(target_path, mountpoints()):
                raise RuntimeError("volume2 target is a mountpoint")
            purge(target_fd, os.fstat(target_fd).st_dev, target_path, known_mountpoints)
        finally:
            os.close(target_fd)
        os.rmdir(target_name, dir_fd=parent_fd)
    finally:
        if close_parent:
            os.close(parent_fd)
finally:
    os.close(root_fd)
PY
}

# v3/v4 controllers use the same operation manifest contract as the current
# controller, but live under versioned roots.  Keep these paths fail-closed and
# bind every active manifest to the candidate before planning or replay.
scan_volume2_versioned_controller_liveness() {
  local controller_root descriptor relative_root manifest_root manifest_parent manifest status path canonical_path
  local -a descriptors=(
    'project-control-operations|operation.json'
    'project-integration/integration-attempts|attempt.json'
    'dependency-bootstrap-operations|operation.json'
    'project-bootstrap/bootstrap-attempts|attempt.json'
  )
  for controller_root in "$WORKER_JOBS/controller-v3" "$CONTROLLER_V4"; do
    [[ -e $controller_root || -L $controller_root ]] || continue
    [[ -d $controller_root && ! -L $controller_root ]] || fail "versioned controller root is unsafe: $controller_root"
    [[ $($REALPATH -e -- "$controller_root") == "$controller_root" ]] || fail "versioned controller root escaped: $controller_root"
    for descriptor in "${descriptors[@]}"; do
      relative_root=${descriptor%%|*}; manifest=${descriptor#*|}
      manifest_root=$controller_root/$relative_root
      [[ -e $manifest_root || -L $manifest_root ]] || continue
      [[ -d $manifest_root && ! -L $manifest_root ]] || fail "versioned activity root is unsafe: $manifest_root"
      [[ $($REALPATH -e -- "$manifest_root") == "$manifest_root" ]] || fail "versioned activity root escaped: $manifest_root"
      local manifests=("$manifest_root"/*/"$manifest")
      for path in "${manifests[@]}"; do
        [[ -e $path || -L $path ]] || continue
        manifest_parent=${path%/*}
        [[ -d $manifest_parent && ! -L $manifest_parent && $($REALPATH -e -- "$manifest_parent") == "$manifest_parent" ]] ||
          fail "versioned activity manifest parent is unsafe: $manifest_parent"
        [[ -f $path && ! -L $path && -r $path && $($REALPATH -e -- "$path") == "$path" ]] ||
          fail "versioned activity manifest is unsafe: $path"
        "$JQ" -e 'type == "object" and (.status | type == "string")' "$path" >/dev/null ||
          fail "versioned activity manifest is malformed: $path"
        status=$($JQ -r '.status' "$path")
        is_terminal_activity_status_for_schema "$relative_root" "$status" && continue
        protect_manifest_paths "$path" "active-$status"
      done
    done
  done
}

# The base janitor validates only the unversioned worker-job root.  Add the
# versioned controller liveness scan at the same lifecycle boundary so it is
# present during dry-run planning and every apply revalidation.
validate_job_root() {
  local job_root=$1 canonical_job_root job candidate
  [[ -d $job_root && ! -L $job_root ]] || fail "job root is unsafe: $job_root"
  canonical_job_root=$($REALPATH -e -- "$job_root") || fail "cannot canonicalize job root: $job_root"
  [[ $canonical_job_root == "$job_root" ]] || fail "job root escaped: $job_root"
  scan_volume2_versioned_controller_liveness
  job=${job_root##*/}
  for candidate in "$WORKTREES/.volume2/$job" "$WORKTREES/.volume2/$job/worktree"; do
    [[ -z ${activity_protected[$candidate]:-} ]] ||
      fail "versioned controller activity appeared during volume2 planning: $candidate"
  done
}
is_terminal_ledger_status() { case $1 in integrated | rejected | archived | superseded) return 0 ;; *) return 1 ;; esac; }
is_terminal_activity_status() {
  # The legacy controller records a plain status string.  Unknown values stay
  # live so a new state cannot accidentally authorize cleanup.
  case $1 in archived | canceled | cancelled | completed | done | failed | integrated | rejected | rolled_back | stopped | superseded) return 0 ;; *) return 1 ;; esac
}
is_terminal_activity_status_for_schema() {
  local schema=$1 status=$2
  # Versioned controller manifests have different state vocabularies. Keep
  # their terminal allowlists explicit and conservative; an unrecognised state
  # is active (and therefore protects the candidate).
  case $schema in
    project-control-operations)
      case $status in archived | canceled | cancelled | completed | done | failed | rejected | stopped | superseded) return 0 ;; esac ;;
    project-integration/integration-attempts)
      case $status in archived | canceled | cancelled | completed | failed | integrated | rejected | stopped | superseded) return 0 ;; esac ;;
    dependency-bootstrap-operations|project-bootstrap/bootstrap-attempts)
      case $status in archived | canceled | cancelled | completed | done | failed | rejected | stopped | superseded) return 0 ;; esac ;;
    *) is_terminal_activity_status "$status"; return $? ;;
  esac
  return 1
}
integrated_commit_state() { local commit=$1 main=$2 result
  "$GIT" -C "$INTEGRATION" cat-file -e "$commit^{commit}" 2>/dev/null || return 2
  if "$GIT" -C "$INTEGRATION" merge-base --is-ancestor "$commit" "$main"; then return 0; else result=$?; fi
  ((result == 1)) || fail 'cannot compare integrated ledger commit with main'
  return 1
}
declared_path() { local declared=$1 label=$2 realpath_flag=$3 action=$4 result
  [[ $declared == /* && $declared != *$'\n'* && $declared != *$'\r'* && $declared != *$'\t'* ]] || fail "$label is not a safe absolute path"
  result=$("$REALPATH" "$realpath_flag" -- "$declared") || fail "cannot $action $label"
  [[ $result == "$declared" ]] || fail "$label is not canonical"
  printf '%s\n' "$result"
}
canonical_declared_path() { declared_path "$1" "$2" -m canonicalize; }
lexical_declared_path() { declared_path "$1" "$2" -ms normalize; }
is_registered_now() {
  local target=$1 listing line path
  listing=$("$GIT" -C "$INTEGRATION" worktree list --porcelain) || fail 'cannot re-enumerate registered Git worktrees'
  while IFS= read -r line; do
    [[ $line == worktree\ * ]] || continue
    path=$("$REALPATH" -m -- "${line#worktree }") || fail 'cannot canonicalize registered Git worktree'
    [[ $path == "$target" ]] && return 0
  done <<<"$listing"
  return 1
}
is_locked_now() {
  local target=$1 listing line path current_path=
  listing=$("$GIT" -C "$INTEGRATION" worktree list --porcelain) || fail 'cannot re-enumerate Git worktree locks'
  while IFS= read -r line; do
    if [[ $line == worktree\ * ]]; then
      path=$("$REALPATH" -m -- "${line#worktree }") || fail 'cannot canonicalize locked Git worktree'
      current_path=$path
    elif [[ $line == locked || $line == locked\ * ]]; then
      [[ $current_path == "$target" ]] && return 0
    fi
  done <<<"$listing"
  return 1
}
load_volume2_receipts() {
  [[ -e $VOLUME2_AUDIT_LOG || -L $VOLUME2_AUDIT_LOG ]] || return 0
  [[ -f $VOLUME2_AUDIT_LOG && ! -L $VOLUME2_AUDIT_LOG && -r $VOLUME2_AUDIT_LOG ]] || fail 'volume2 audit log is unsafe'
  [[ $($REALPATH -e -- "$VOLUME2_AUDIT_LOG") == "$VOLUME2_AUDIT_LOG" ]] || fail 'volume2 audit log is not canonical'
  # shellcheck disable=SC2016
  "$JQ" -e -s '
    def sha256: type == "string" and test("^[0-9a-f]{64}$");
    def sha1_or_dash: type == "string" and (. == "-" or test("^[0-9a-f]{40}$"));
    def absolute: type == "string" and startswith("/") and length > 1 and (explode | all(. >= 32));
    def ledger: type == "string" and test("^[A-Za-z0-9._-]+--[A-Za-z0-9._-]+$");
    def identity: type == "string" and test("^[0-9]+:[0-9]+:[0-9]+:[0-9]+:[0-7]{3,4}$");
    def whole: type == "number" and . >= 0 and floor == .;
    def timestamp: type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$");
    def commonKeys: ["afterBytes","beforeBytes","candidateKind","gitRegistrationSha256","integratedCommitSha","lifecycleLockIdentity",
      "ledgerId","ledgerItemPath","ledgerItemSha256","mainCommit","mode","nestedParentIdentity",
      "numstatEvidencePath","numstatEvidenceSha256","patchEvidencePath","patchEvidenceSha256","planSha256",
      "preparedAt","purgedAt","registryPath","registrySha256","removedAt","schemaVersion","status","statusEvidencePath",
      "statusEvidenceSha256","targetIdentity","targetInodes","targetWorktreePath","volumeMountIdentity"];
    def preparedKeys: (commonKeys - ["afterBytes","purgedAt","removedAt"]) | sort;
    def purgedKeys: (commonKeys - ["afterBytes","removedAt"]) | sort;
    def removedKeys: commonKeys | sort;
    def common:
      type == "object" and .schemaVersion == 1 and .mode == "apply-volume2" and
      (.status == "prepared" or .status == "purged" or .status == "removed") and
      (.ledgerId | ledger) and (.planSha256 | sha256) and (.mainCommit | test("^[0-9a-f]{40}$")) and
      (.candidateKind == "volume2-direct" or .candidateKind == "volume2-nested") and
      (.targetWorktreePath | absolute) and (.targetIdentity | identity) and
      (.volumeMountIdentity | type == "string" and
        test("^/[^|]*\\|[0-9]+:[0-9]+:[0-9]+:[0-9]+:[0-7]{3,4}\\|[0-9]+:[0-9]+:[0-9]+:[0-9]+:[0-7]{3,4}$")) and
      (.nestedParentIdentity == "-" or (.nestedParentIdentity | identity)) and
      (.ledgerItemPath | absolute) and (.ledgerItemSha256 | sha256) and
      (.statusEvidencePath | absolute) and (.statusEvidenceSha256 | sha256) and
      (.patchEvidencePath | absolute) and (.patchEvidenceSha256 | sha256) and
      (.numstatEvidencePath | absolute) and (.numstatEvidenceSha256 | sha256) and
      (.registryPath | absolute) and (.registrySha256 | sha256) and
      (.gitRegistrationSha256 | sha256) and (.beforeBytes | whole) and
      (.targetInodes | whole) and (.integratedCommitSha | sha1_or_dash) and (.lifecycleLockIdentity | identity) and
      (.preparedAt | timestamp) and
      (if .status == "removed" then
         (.removedAt | timestamp) and .afterBytes == 0 and (keys_unsorted | sort) == removedKeys
       elif .status == "purged" then
         (.purgedAt | timestamp) and (keys_unsorted | sort) == purgedKeys
       else (keys_unsorted | sort) == preparedKeys end);
    def binding: [.schemaVersion,.mode,.ledgerId,.planSha256,.mainCommit,
      .candidateKind,.targetWorktreePath,.targetIdentity,.volumeMountIdentity,.nestedParentIdentity,
      .ledgerItemPath,.ledgerItemSha256,.statusEvidencePath,.statusEvidenceSha256,
      .patchEvidencePath,.patchEvidenceSha256,.numstatEvidencePath,.numstatEvidenceSha256,
      .registryPath,.registrySha256,.gitRegistrationSha256,.beforeBytes,.targetInodes,.integratedCommitSha,
      .lifecycleLockIdentity,.preparedAt];
    all(.[]; common) and (group_by(.ledgerId) | all(.[];
      (length >= 1 and length <= 3) and .[0].status == "prepared" and
      (if length == 1 then true
       elif length == 2 then
         ((.[1].status == "purged" or .[1].status == "removed") and
          (.[0] | binding) == (.[1] | binding))
       else .[1].status == "purged" and .[2].status == "removed" and
         (.[0] | binding) == (.[1] | binding) and
         (.[1] | binding) == (.[2] | binding) and .[1].purgedAt == .[2].purgedAt
       end)))
  ' "$VOLUME2_AUDIT_LOG" >/dev/null || fail 'volume2 audit log is malformed, conflicting, or tampered'
  local row id lock_identity
  while IFS= read -r row; do
    [[ -n $row ]] || continue
    IFS=$'\x1f' read -r id kind target plan main item item_sha status_path status_sha \
      patch_path patch_sha numstat_path numstat_sha registry registry_sha target_identity \
      parent_identity mount_identity registration bytes inodes integrated lock_identity status purged_at prepared_at <<<"$row"
    volume2_receipt_kind["$id"]=$kind; volume2_receipt_target["$id"]=$target
    volume2_receipt_plan["$id"]=$plan; volume2_receipt_main["$id"]=$main
    volume2_receipt_item_path["$id"]=$item; volume2_receipt_item_sha["$id"]=$item_sha
    volume2_receipt_status_path["$id"]=$status_path; volume2_receipt_status_sha["$id"]=$status_sha
    volume2_receipt_patch_path["$id"]=$patch_path; volume2_receipt_patch_sha["$id"]=$patch_sha
    volume2_receipt_numstat_path["$id"]=$numstat_path; volume2_receipt_numstat_sha["$id"]=$numstat_sha
    volume2_receipt_registry_path["$id"]=$registry; volume2_receipt_registry_sha["$id"]=$registry_sha
    volume2_receipt_target_identity["$id"]=$target_identity; volume2_receipt_parent_identity["$id"]=$parent_identity
    volume2_receipt_mount_identity["$id"]=$mount_identity; volume2_receipt_registration_sha["$id"]=$registration
    volume2_receipt_bytes["$id"]=$bytes; volume2_receipt_inodes["$id"]=$inodes
    volume2_receipt_lock_identity["$id"]=$lock_identity
    volume2_receipt_integrated["$id"]=$integrated; volume2_receipt_prepared_at["$id"]=$prepared_at
    if [[ $status == purged ]]; then volume2_receipt_purged["$id"]=1; fi
    volume2_receipt_purged_at["$id"]=$purged_at
  done < <("$JQ" -r -j 'select(.status == "prepared" or .status == "purged") |
    [.ledgerId,.candidateKind,.targetWorktreePath,.planSha256,.mainCommit,.ledgerItemPath,.ledgerItemSha256,
     .statusEvidencePath,.statusEvidenceSha256,.patchEvidencePath,.patchEvidenceSha256,
     .numstatEvidencePath,.numstatEvidenceSha256,.registryPath,.registrySha256,.targetIdentity,
     .nestedParentIdentity,.volumeMountIdentity,.gitRegistrationSha256,(.beforeBytes|tostring),
     (.targetInodes|tostring),.integratedCommitSha,.lifecycleLockIdentity,.status,(.purgedAt // ""),.preparedAt] | join("\u001f") + "\n"' \
    "$VOLUME2_AUDIT_LOG")
  while IFS= read -r id; do [[ -z $id ]] || volume2_receipt_removed["$id"]=1; done \
    < <("$JQ" -r 'select(.status == "removed") | .ledgerId' "$VOLUME2_AUDIT_LOG")
}
select_volume2_receipt_recovery() {
  local id
  [[ $MODE == apply-volume2 ]] || return 0
  for id in "${!volume2_receipt_plan[@]}"; do
    [[ ${volume2_receipt_plan[$id]} != "$EXPECTED_PLAN_SHA256" ]] || { VOLUME2_RECEIPT_RECOVERY=1; return 0; }
  done
}
volume2_mode_allows_candidate() {
  local id=$1 kind=$2 workspace=$3 target=$4
  if [[ $MODE == apply-volume2 && $VOLUME2_RECEIPT_RECOVERY == 1 && $kind == volume2-* &&
    ${volume2_receipt_plan[$id]:-} != "$EXPECTED_PLAN_SHA256" ]]; then
    printf 'excluded reason=volume2-recovery-other-batch ledger=%s worktree=%s\n' "$id" "$workspace"; return 1
  fi
  if [[ $MODE == dry-run-volume2 || $MODE == apply-volume2 ]] &&
    [[ $kind != volume2-direct && $kind != volume2-nested ]]; then
    printf 'excluded reason=volume2-mode-only ledger=%s worktree=%s target=%s\n' "$id" "$workspace" "$target"; return 1
  fi
}
restore_volume2_receipt_layout() {
  local id=$1 job=$2 workspace=$3 kind=${volume2_receipt_kind[$1]}
  [[ ${volume2_receipt_target[$id]} == "$workspace" ]] || fail "volume2 receipt target conflicts with ledger: $id"
  case $kind in
    volume2-direct) [[ $workspace == "$WORKTREES/.volume2/$job" ]] ;;
    volume2-nested) [[ $workspace == "$WORKTREES/.volume2/$job/worktree" ]] ;;
    *) return 1 ;;
  esac || fail "volume2 receipt layout conflicts with job: $id"
}
register_volume2_workspace() {
  local kind=$1 workspace=$2 job=$3 parent
  case $kind in
    volume2-direct) parent=$workspace ;;
    volume2-nested) parent=${workspace%/*} ;;
    volume2-unsupported) return 0 ;;
    *) fail "unknown volume2 workspace kind: $kind" ;;
  esac
  [[ $parent == "$WORKTREES/.volume2/$job" ]] || fail "volume2 workspace is not exactly job-bound: $workspace"
  [[ -z ${volume2_workspace_by_parent[$parent]:-} ||
    ${volume2_workspace_by_parent[$parent]} == "$workspace" ]] || fail "conflicting volume2 workspace layouts share a job parent: $parent"
  volume2_workspace_by_parent["$parent"]=$workspace
}
classify_volume2_workspace_layout() {
  local workspace=$1 job=$2
  VOLUME2_CLASSIFIED_LEGACY=0
  case $workspace in
    "$WORKTREES/.volume2/$job") VOLUME2_CLASSIFIED_KIND=volume2-direct ;;
    "$WORKTREES/.volume2/$job/worktree") VOLUME2_CLASSIFIED_KIND=volume2-nested ;;
    "$WORKTREES/.volume2" | "$WORKTREES/.volume2/"*) VOLUME2_CLASSIFIED_KIND=volume2-unsupported ;;
    *) return 1 ;;
  esac
  if [[ $VOLUME2_CLASSIFIED_KIND == volume2-nested ]]; then
    [[ ${workspace%/*} == "$WORKTREES/.volume2/$job" ]] || VOLUME2_CLASSIFIED_LEGACY=1
  else [[ ${workspace##*/} == "$job" ]] || VOLUME2_CLASSIFIED_LEGACY=1; fi
}
protect_volume2_activity_path() {
  local path=$1 reason=$2 relative parent protected
  case $path in
    "$RELOCATION_ARCHIVE_ROOT" | "$RELOCATION_ARCHIVE_ROOT/"*) return 1 ;;
    "$WORKTREES/.volume2") fail 'active evidence names the shared volume2 parent' ;;
    "$WORKTREES/.volume2/"*)
      relative=${path#"$WORKTREES/.volume2/"}; parent=$WORKTREES/.volume2/${relative%%/*}
      protected=${volume2_workspace_by_parent[$parent]:-$parent}
      activity_protected["$protected"]=$reason
      return 0
      ;;
    *) return 1 ;;
  esac
}
validate_volume2_receipt_bindings() {
  local id
  for id in "${!volume2_receipt_target[@]}"; do
    [[ ${ledger_workspace_by_id[$id]:-} == "${volume2_receipt_target[$id]}" &&
      ${volume2_receipt_item_path[$id]} == "$LEDGER_ITEMS/$id.json" &&
      ${ledger_item_hash_by_id[$id]:-} == "${volume2_receipt_item_sha[$id]}" &&
      ${ledger_status_path_by_id[$id]:-} == "${volume2_receipt_status_path[$id]}" &&
      ${ledger_status_hash_by_id[$id]:-} == "${volume2_receipt_status_sha[$id]}" &&
      ${ledger_patch_path_by_id[$id]:-} == "${volume2_receipt_patch_path[$id]}" &&
      ${ledger_patch_hash_by_id[$id]:-} == "${volume2_receipt_patch_sha[$id]}" &&
      ${ledger_numstat_path_by_id[$id]:-} == "${volume2_receipt_numstat_path[$id]}" &&
      ${ledger_numstat_hash_by_id[$id]:-} == "${volume2_receipt_numstat_sha[$id]}" &&
      ${ledger_registry_path_by_id[$id]:-} == "${volume2_receipt_registry_path[$id]}" &&
      ${ledger_registry_hash_by_id[$id]:-} == "${volume2_receipt_registry_sha[$id]}" &&
      ${volume2_receipt_lock_identity[$id]} == "$VOLUME2_LIFECYCLE_LOCK_IDENTITY" &&
      ${ledger_integrated_commit_by_id[$id]:--} == "${volume2_receipt_integrated[$id]}" ]] || fail "volume2 receipt conflicts with ledger, evidence, registry, or commit: $id"
  done
}
volume2_mount_identity() {
  local mount_root
  validate_trusted_path "$WORKTREES/.volume2" directory 'volume2 mount root'
  mount_root=$("$STAT" -c '%m' -- "$WORKTREES/.volume2") || fail 'cannot resolve volume2 mount point'
  mount_root=$("$REALPATH" -e -- "$mount_root") || fail 'cannot canonicalize volume2 mount point'
  printf '%s|%s|%s\n' "$mount_root" "$(path_identity "$mount_root")" \
    "$(path_identity "$WORKTREES/.volume2")"
}
validate_volume2_layout() {
  local kind=$1 target=$2 job=$3 parent mount_identity mount_tail target_identity target_mount volume_mount
  case $kind in
    volume2-direct) [[ $target == "$WORKTREES/.volume2/$job" && ${target%/*} == "$WORKTREES/.volume2" ]]; parent=- ;;
    volume2-nested)
      parent=${target%/*}
      [[ $target == "$WORKTREES/.volume2/$job/worktree" && $parent == "$WORKTREES/.volume2/$job" ]]
      validate_trusted_path "$parent" directory 'volume2 nested parent'
      ;;
    *) return 1 ;;
  esac || fail "volume2 target is not an exact supported layout: $target"
  validate_trusted_path "$target" directory 'volume2 target'
  mount_identity=$(volume2_mount_identity); target_identity=$(path_identity "$target")
  target_mount=$("$STAT" -c '%m' -- "$target"); volume_mount=$("$STAT" -c '%m' -- "$WORKTREES/.volume2")
  [[ $target_mount == "$volume_mount" ]] || fail "volume2 target is a foreign mount: $target"
  mount_tail=${mount_identity#*|}
  [[ ${target_identity%%:*} == "${mount_tail%%:*}" ]] || fail "volume2 target crossed its bound device: $target"
}
validate_volume2_absent_layout() {
  local kind=$1 target=$2 job=$3 parent
  [[ ! -e $target && ! -L $target ]] || fail "volume2 target unexpectedly exists: $target"
  volume2_mount_identity >/dev/null
  case $kind in
    volume2-direct) [[ $target == "$WORKTREES/.volume2/$job" ]] ;;
    volume2-nested)
      parent=${target%/*}; [[ $target == "$WORKTREES/.volume2/$job/worktree" ]]
      validate_trusted_path "$parent" directory 'volume2 nested parent'
      ;;
    *) return 1 ;;
  esac || fail "absent volume2 target has an unsupported layout: $target"
}
validate_volume2_candidate_state() {
  local id=$1 kind=$2 target=$3 job=${ledger_job_by_id[$1]}
  if [[ -d $target && ! -L $target ]]; then
    validate_volume2_layout "$kind" "$target" "$job"
  else
    validate_volume2_absent_layout "$kind" "$target" "$job"
    if is_registered_now "$target"; then
      capture_exact_purged_git_registration "$target"
      [[ $(sha256_text "$CAPTURED_PURGED_GIT_REGISTRATION") == "${volume2_receipt_registration_sha[$id]}" ]] ||
        fail "volume2 crash recovery registration changed: $id"
      registered_count["$target"]=0
    fi
  fi
  [[ ${volume2_receipt_target[$id]} == "$target" ]] || fail "volume2 replay target changed: $id"
}
classify_completed_volume2_receipts() {
  local id target kind job
  for id in "${!volume2_receipt_removed[@]}"; do
    target=${volume2_receipt_target[$id]}; kind=${volume2_receipt_kind[$id]}
    job=${ledger_job_by_id[$id]}
    validate_volume2_absent_layout "$kind" "$target" "$job"
    [[ ${registered_count[$target]:-0} == 0 ]] || fail "removed volume2 receipt conflicts with Git registration: $id"
    [[ $(volume2_mount_identity) == "${volume2_receipt_mount_identity[$id]}" ]] || fail "removed volume2 receipt mount identity changed: $id"
    if [[ $kind == volume2-nested ]]; then
      [[ $(path_identity "${target%/*}") == "${volume2_receipt_parent_identity[$id]}" ]] ||
        fail "removed volume2 receipt nested parent changed: $id"
    fi
    volume2_receipt_replayed["$id"]=1; replayed=$((replayed + 1))
  done
}
prepare_volume2_candidate() {
  local id=$1 kind=$2 target=$3 job=$4 registration_count=$5 byte_record inode_record
  assert_volume2_lifecycle_lock
  VOLUME2_CANDIDATE_TARGET_IDENTITY=- VOLUME2_CANDIDATE_PARENT_IDENTITY=- VOLUME2_CANDIDATE_MOUNT_IDENTITY=- VOLUME2_CANDIDATE_REGISTRATION_SHA=-
  if ((registration_count == 1)); then
    validate_volume2_layout "$kind" "$target" "$job"
    VOLUME2_CANDIDATE_TARGET_IDENTITY=$(path_identity "$target")
    VOLUME2_CANDIDATE_MOUNT_IDENTITY=$(volume2_mount_identity)
    [[ $kind != volume2-nested ]] ||
      VOLUME2_CANDIDATE_PARENT_IDENTITY=$(path_identity "${target%/*}")
    capture_exact_unlocked_git_registration "$target"
    VOLUME2_CANDIDATE_REGISTRATION_SHA=$(sha256_text "$CAPTURED_GIT_REGISTRATION")
  else
    [[ -n ${volume2_receipt_target[$id]:-} ]] || fail "absent volume2 target lacks a prepared receipt: $id"
    validate_volume2_absent_layout "$kind" "$target" "$job"
    VOLUME2_CANDIDATE_TARGET_IDENTITY=${volume2_receipt_target_identity[$id]}
    VOLUME2_CANDIDATE_PARENT_IDENTITY=${volume2_receipt_parent_identity[$id]}
    VOLUME2_CANDIDATE_MOUNT_IDENTITY=${volume2_receipt_mount_identity[$id]}
    VOLUME2_CANDIDATE_REGISTRATION_SHA=${volume2_receipt_registration_sha[$id]}
  fi
  byte_record=${volume2_receipt_bytes[$id]:-}; inode_record=${volume2_receipt_inodes[$id]:-}
  [[ -z $byte_record || $byte_record =~ ^[0-9]+$ ]] || fail "invalid receipt bytes: $id"
  [[ -z $inode_record || $inode_record =~ ^[0-9]+$ ]] || fail "invalid receipt inodes: $id"
}
reset_volume2_plan_fields() { VOLUME2_CANDIDATE_TARGET_IDENTITY=- VOLUME2_CANDIDATE_PARENT_IDENTITY=- VOLUME2_CANDIDATE_MOUNT_IDENTITY=- VOLUME2_CANDIDATE_REGISTRATION_SHA=-; }
prepare_volume2_plan_fields() {
  reset_volume2_plan_fields
  prepare_volume2_candidate "$1" "$2" "$3" "$4" "$5"
  logical_identity=- target_identity=$VOLUME2_CANDIDATE_TARGET_IDENTITY
  git_registration_hash=$VOLUME2_CANDIDATE_REGISTRATION_SHA
}
compute_volume2_plan_sha256() {
  local ledger_id index record digest
  local -a ids=()
  mapfile -t ids < <(printf '%s\n' "${!ledger_item_hash_by_id[@]}" | LC_ALL=C "$SORT")
  {
    printf 'schemaVersion\t1\nmode\tapply-volume2\nmainCommit\t%s\nlifecycleLockIdentity\t%s\n' \
      "$MAIN_COMMIT" "$VOLUME2_LIFECYCLE_LOCK_IDENTITY"
    for ledger_id in "${ids[@]}"; do
      printf 'ledger\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$ledger_id" \
        "$LEDGER_ITEMS/$ledger_id.json" "${ledger_item_hash_by_id[$ledger_id]}" \
        "${ledger_status_path_by_id[$ledger_id]:--}" "${ledger_status_hash_by_id[$ledger_id]:--}" \
        "${ledger_patch_hash_by_id[$ledger_id]:--}" "${ledger_numstat_hash_by_id[$ledger_id]:--}" \
        "${ledger_workspace_by_id[$ledger_id]}"
    done
    for index in "${!plan_targets[@]}"; do
      [[ ${plan_kinds[$index]} == volume2-direct || ${plan_kinds[$index]} == volume2-nested ]] || continue
      record=$(printf '%s\t' "${plan_ledgers[$index]}" "${plan_kinds[$index]}" \
        "${plan_targets[$index]}" "${plan_target_identities[$index]}" \
        "${plan_volume2_mount_identities[$index]}" "${plan_volume2_parent_identities[$index]}" \
        "${plan_items[$index]}" "${plan_item_hashes[$index]}" \
        "${plan_status_files[$index]}" "${plan_status_hashes[$index]}" \
        "${plan_patch_files[$index]}" "${plan_patch_hashes[$index]}" \
        "${plan_numstat_files[$index]}" "${plan_numstat_hashes[$index]}" \
        "${plan_registry_paths[$index]}" "${plan_registry_hashes[$index]}" \
        "${plan_git_registration_hashes[$index]}" "${plan_bytes[$index]}" \
        "${plan_target_inodes[$index]}" "${plan_integrated_commits[$index]}")
      printf 'candidate\t%s\n' "${record%$'\t'}"
    done
  } | "$SHA256SUM" | { read -r digest _; printf '%s\n' "$digest"; }
}
count_volume2_plan_candidates() {
  local index count=0
  for index in "${!plan_targets[@]}"; do
    [[ ${plan_kinds[$index]} != volume2-direct && ${plan_kinds[$index]} != volume2-nested ]] ||
      count=$((count + 1))
  done
  printf '%s\n' "$count"
}
compute_volume2_plan() { VOLUME2_PLAN_SHA256=$(compute_volume2_plan_sha256) || fail 'cannot compute deterministic volume2 plan digest'; }
validate_volume2_plan() {
  if [[ $MODE == apply-volume2 && $EXPECTED_PLAN_SHA256 != "$VOLUME2_PLAN_SHA256" &&
    $VOLUME2_RECEIPT_RECOVERY == 0 ]]; then
    fail "volume2 plan mismatch expected=$EXPECTED_PLAN_SHA256 actual=$VOLUME2_PLAN_SHA256"
  fi
}
print_volume2_plan() {
  printf 'volume2-plan schemaVersion=1 sha256=%s candidates=%s main=%s\n' "$VOLUME2_PLAN_SHA256" \
    "$(count_volume2_plan_candidates)" "$MAIN_COMMIT"
}
append_volume2_receipt() {
  local receipt=$1
  AUDIT_TMP=$("$MKTEMP" "$CONTROL/.consumed-worktree-janitor-volume2.audit.XXXXXX") ||
    fail 'cannot create volume2 receipt staging file'
  [[ -f $AUDIT_TMP && ! -L $AUDIT_TMP && ${AUDIT_TMP%/*} == "$CONTROL" ]] ||
    fail 'volume2 receipt staging file is unsafe'
  [[ ! -f $VOLUME2_AUDIT_LOG ]] || "$CP" -- "$VOLUME2_AUDIT_LOG" "$AUDIT_TMP"
  printf '%s\n' "$receipt" >>"$AUDIT_TMP" || fail 'cannot stage volume2 receipt'
  "$JQ" -e -s 'all(.[]; type == "object")' "$AUDIT_TMP" >/dev/null ||
    fail 'staged volume2 receipts are invalid'
  "$SYNC" -f -- "$AUDIT_TMP" || fail 'cannot fsync staged volume2 receipt'
  "$MV" -f -- "$AUDIT_TMP" "$VOLUME2_AUDIT_LOG" || fail 'cannot publish volume2 receipt'
  AUDIT_TMP=
  "$SYNC" -f -- "$VOLUME2_AUDIT_LOG" || fail 'cannot fsync published volume2 receipt'
  "$SYNC" -f -- "$CONTROL" || fail 'cannot fsync volume2 receipt directory'
}
assert_volume2_receipt_binding() {
  local index=$1 id=${plan_ledgers[$1]}
  [[ ${volume2_receipt_plan[$id]} == "$EXPECTED_PLAN_SHA256" &&
    ${volume2_receipt_main[$id]} == "$MAIN_COMMIT" &&
    ${volume2_receipt_kind[$id]} == "${plan_kinds[$index]}" &&
    ${volume2_receipt_target[$id]} == "${plan_targets[$index]}" &&
    ${volume2_receipt_target_identity[$id]} == "${plan_target_identities[$index]}" &&
    ${volume2_receipt_parent_identity[$id]} == "${plan_volume2_parent_identities[$index]}" &&
    ${volume2_receipt_mount_identity[$id]} == "${plan_volume2_mount_identities[$index]}" &&
    ${volume2_receipt_registration_sha[$id]} == "${plan_git_registration_hashes[$index]}" &&
    ${volume2_receipt_bytes[$id]} == "${plan_bytes[$index]}" &&
    ${volume2_receipt_inodes[$id]} == "${plan_target_inodes[$index]}" &&
    ${volume2_receipt_lock_identity[$id]} == "$VOLUME2_LIFECYCLE_LOCK_IDENTITY" &&
    ${volume2_receipt_integrated[$id]} == "${plan_integrated_commits[$index]}" ]] ||
    fail "prepared volume2 receipt no longer matches its exact plan: $id"
}
CAPTURED_PURGED_GIT_REGISTRATION=
capture_exact_purged_git_registration() {
  local target=$1 listing line block= path= count=0 match= normalized=
  listing=$("$GIT" -C "$INTEGRATION" worktree list --porcelain) ||
    fail 'cannot enumerate purged Git worktree registrations'
  while IFS= read -r line; do
    if [[ $line == worktree\ * ]]; then
      if [[ -n $block && $path == "$target" ]]; then match=$block; count=$((count + 1)); fi
      block=$line$'\n'
      path=$("$REALPATH" -m -- "${line#worktree }") ||
        fail 'cannot canonicalize purged Git worktree registration'
    elif [[ -n $block && -n $line ]]; then
      block+=$line$'\n'
    fi
  done <<<"$listing"
  if [[ -n $block && $path == "$target" ]]; then match=$block; count=$((count + 1)); fi
  ((count == 1)) || fail "purged target requires one exact Git registration: $target"
  [[ $match != *$'\nlocked'* ]] || fail "purged target registration became locked: $target"
  while IFS= read -r line; do
    [[ $line == prunable || $line == prunable\ * ]] && continue
    normalized+=$line$'\n'
  done <<<"${match%$'\n'}"
  CAPTURED_PURGED_GIT_REGISTRATION=${normalized%$'\n'}
}
revalidate_volume2_candidate() {
  local index=$1 state=$2 id=${plan_ledgers[$1]} target=${plan_targets[$1]}
  local job=${plan_jobs[$1]} current_main registration byte_record inode_record
  assert_volume2_lifecycle_lock
  current_main=$("$GIT" -C "$INTEGRATION" rev-parse --verify refs/heads/main^{commit}) ||
    fail 'integration main disappeared during volume2 apply'
  [[ $current_main == "$MAIN_COMMIT" ]] || fail 'integration main changed after volume2 plan'
  rehash_matches "${plan_items[$index]}" "${plan_item_hashes[$index]}" 'ledger item'
  validate_archive_location "$job" "$target" "${plan_status_files[$index]%/git-status.txt}"
  [[ $VALIDATED_REGISTRY_PATH == "${plan_registry_paths[$index]}" ]] ||
    fail "volume2 registry path changed after plan: $id"
  rehash_matches "$VALIDATED_REGISTRY_PATH" "${plan_registry_hashes[$index]}" 'registry binding'
  validate_terminal_evidence_paths "${plan_status_files[$index]}" \
    "${plan_patch_files[$index]}" "${plan_numstat_files[$index]}"
  rehash_matches "${plan_status_files[$index]}" "${plan_status_hashes[$index]}" 'status evidence'
  rehash_matches "${plan_patch_files[$index]}" "${plan_patch_hashes[$index]}" 'patch evidence'
  rehash_matches "${plan_numstat_files[$index]}" "${plan_numstat_hashes[$index]}" 'numstat evidence'
  if [[ ${plan_integrated_commits[$index]} != - ]]; then
    integrated_commit_state "${plan_integrated_commits[$index]}" "$MAIN_COMMIT" ||
      fail "integrated commit is no longer retained: $id"
  fi
  validate_job_root "$WORKER_JOBS/$job"
  job_has_active_state "$WORKER_JOBS/$job" && fail "job became active during volume2 apply: $job"
  activity_protected=(); scan_activity_manifests; scan_controller_job; scan_tmux_panes
  [[ -z ${activity_protected[$target]:-} ]] ||
    fail "controller or tmux activity appeared during volume2 apply: $target"
  live_process_uses_worktree "$target" && fail "process entered volume2 worktree: $target"
  [[ $(volume2_mount_identity) == "${plan_volume2_mount_identities[$index]}" ]] ||
    fail "volume2 mount identity changed after plan: $target"
  if [[ ${plan_kinds[$index]} == volume2-nested ]]; then
    [[ $(path_identity "${target%/*}") == "${plan_volume2_parent_identities[$index]}" ]] ||
      fail "volume2 nested parent identity changed after plan: $target"
  fi
  if [[ $state == present ]]; then
    validate_volume2_layout "${plan_kinds[$index]}" "$target" "$job"
    [[ $(path_identity "$target") == "${plan_target_identities[$index]}" ]] ||
      fail "volume2 target stat identity changed after plan: $target"
    capture_exact_unlocked_git_registration "$target"
    registration=$(sha256_text "$CAPTURED_GIT_REGISTRATION")
    [[ $registration == "${plan_git_registration_hashes[$index]}" ]] ||
      fail "volume2 Git registration changed after plan: $target"
    worktree_matches_terminal_evidence "$target" "${plan_status_files[$index]}" \
      "${plan_patch_files[$index]}" "${plan_numstat_files[$index]}" ||
      fail "volume2 worktree became dirty or conflicted: $id"
    byte_record=$("$DU" -sb --apparent-size -- "$target") || fail "cannot remeasure volume2 bytes: $target"
    inode_record=$("$DU" -s --inodes -- "$target") || fail "cannot remeasure volume2 inodes: $target"
    [[ ${byte_record%%[[:space:]]*} == "${plan_bytes[$index]}" &&
      ${inode_record%%[[:space:]]*} == "${plan_target_inodes[$index]}" ]] ||
      fail "volume2 accounting changed after plan: $target"
  elif [[ $state == purged ]]; then
    validate_volume2_absent_layout "${plan_kinds[$index]}" "$target" "$job"
    if is_registered_now "$target"; then
      capture_exact_purged_git_registration "$target"
      [[ $(sha256_text "$CAPTURED_PURGED_GIT_REGISTRATION") == "${plan_git_registration_hashes[$index]}" ]] ||
        fail "volume2 Git registration changed after purge: $target"
    fi
  else
    validate_volume2_absent_layout "${plan_kinds[$index]}" "$target" "$job"
    is_registered_now "$target" && fail "removed volume2 target remains registered: $target"
  fi; return 0
}
unregister_volume2_metadata_only() {
  local index=$1 target=${plan_targets[$1]}
  assert_volume2_lifecycle_lock
  [[ ! -e $target && ! -L $target ]] || fail "volume2 metadata-only unregister target reappeared: $target"
  if is_registered_now "$target"; then
    capture_exact_purged_git_registration "$target"
    [[ $(sha256_text "$CAPTURED_PURGED_GIT_REGISTRATION") == "${plan_git_registration_hashes[$index]}" ]] ||
      fail "volume2 metadata-only unregister registration changed: $target"
    "$GIT" -C "$INTEGRATION" worktree remove --force -- "$target"
  fi
  [[ ! -e $target && ! -L $target ]] || fail "volume2 metadata-only unregister recreated target: $target"
  is_registered_now "$target" && fail "volume2 target remains registered after metadata-only unregister: $target"
  return 0
}
build_volume2_receipt() {
  local index=$1 status=$2 prepared_at=$3 purged_at=${4:-} removed_at=${5:-}
  local id=${plan_ledgers[$index]} receipt_plan=$VOLUME2_PLAN_SHA256 receipt_main=$MAIN_COMMIT
  if [[ -n ${volume2_receipt_target[$id]:-} ]]; then
    receipt_plan=${volume2_receipt_plan[$id]}; receipt_main=${volume2_receipt_main[$id]}
  fi
  # shellcheck disable=SC2016
  "$JQ" -cn --arg status "$status" --arg plan "$receipt_plan" --arg main "$receipt_main" \
    --arg ledger "${plan_ledgers[$index]}" --arg kind "${plan_kinds[$index]}" \
    --arg target "${plan_targets[$index]}" --arg targetIdentity "${plan_target_identities[$index]}" \
    --arg mountIdentity "${plan_volume2_mount_identities[$index]}" \
    --arg parentIdentity "${plan_volume2_parent_identities[$index]}" \
    --arg item "${plan_items[$index]}" --arg itemSha "${plan_item_hashes[$index]}" \
    --arg statusPath "${plan_status_files[$index]}" --arg statusSha "${plan_status_hashes[$index]}" \
    --arg patchPath "${plan_patch_files[$index]}" --arg patchSha "${plan_patch_hashes[$index]}" \
    --arg numstatPath "${plan_numstat_files[$index]}" --arg numstatSha "${plan_numstat_hashes[$index]}" \
    --arg registry "${plan_registry_paths[$index]}" --arg registrySha "${plan_registry_hashes[$index]}" \
    --arg registrationSha "${plan_git_registration_hashes[$index]}" \
    --arg lockIdentity "$VOLUME2_LIFECYCLE_LOCK_IDENTITY" \
    --arg integrated "${plan_integrated_commits[$index]}" --arg preparedAt "$prepared_at" \
    --arg purgedAt "$purged_at" --arg removedAt "$removed_at" --argjson beforeBytes "${plan_bytes[$index]}" \
    --argjson targetInodes "${plan_target_inodes[$index]}" '
      {schemaVersion:1,mode:"apply-volume2",status:$status,planSha256:$plan,
       mainCommit:$main,ledgerId:$ledger,candidateKind:$kind,targetWorktreePath:$target,
       targetIdentity:$targetIdentity,volumeMountIdentity:$mountIdentity,
       nestedParentIdentity:$parentIdentity,ledgerItemPath:$item,ledgerItemSha256:$itemSha,
       statusEvidencePath:$statusPath,statusEvidenceSha256:$statusSha,
       patchEvidencePath:$patchPath,patchEvidenceSha256:$patchSha,
       numstatEvidencePath:$numstatPath,numstatEvidenceSha256:$numstatSha,
       registryPath:$registry,registrySha256:$registrySha,
       gitRegistrationSha256:$registrationSha,beforeBytes:$beforeBytes,
       targetInodes:$targetInodes,integratedCommitSha:$integrated,
       lifecycleLockIdentity:$lockIdentity,preparedAt:$preparedAt}
      + (if $status == "purged" then {purgedAt:$purgedAt}
         elif $status == "removed" then {purgedAt:$purgedAt,removedAt:$removedAt,afterBytes:0} else {} end)'
}
apply_volume2_plan() {
  local index id target prepared_at purged_at removed_at receipt
  for index in "${!plan_targets[@]}"; do
    [[ ${plan_kinds[$index]} == volume2-direct || ${plan_kinds[$index]} == volume2-nested ]] || continue
    id=${plan_ledgers[$index]}; target=${plan_targets[$index]}
    if [[ -n ${volume2_receipt_removed[$id]:-} ]]; then
      assert_volume2_receipt_binding "$index"; revalidate_volume2_candidate "$index" absent
      replayed=$((replayed + 1)); continue
    fi
    if [[ -z ${volume2_receipt_target[$id]:-} ]]; then
      janitor_test_checkpoint volume2-before-prepared
      revalidate_volume2_candidate "$index" present
      prepared_at=$("$DATE" -u +'%Y-%m-%dT%H:%M:%S.%3NZ')
      receipt=$(build_volume2_receipt "$index" prepared "$prepared_at") ||
        fail "cannot construct prepared volume2 receipt: $id"
      append_volume2_receipt "$receipt"
    else
      assert_volume2_receipt_binding "$index"
      prepared_at=${volume2_receipt_prepared_at[$id]}
      purged_at=${volume2_receipt_purged_at[$id]:-}
    fi
    janitor_test_checkpoint volume2-after-prepared
    if [[ -d $target && ! -L $target ]]; then
      janitor_test_checkpoint volume2-before-git-remove
      revalidate_volume2_candidate "$index" present
      purge_volume2_from_bound_fds "${plan_kinds[$index]}" "$target" \
        "${plan_target_identities[$index]}" "${plan_volume2_mount_identities[$index]}" \
        "${plan_volume2_parent_identities[$index]}"
      janitor_test_checkpoint volume2-after-purge-before-purged-receipt
      purged_at=$("$DATE" -u +'%Y-%m-%dT%H:%M:%S.%3NZ')
      receipt=$(build_volume2_receipt "$index" purged "$prepared_at" "$purged_at") ||
        fail "cannot construct purged volume2 receipt: $id"
      append_volume2_receipt "$receipt"
      volume2_receipt_purged["$id"]=1; volume2_receipt_purged_at["$id"]=$purged_at
    else
      revalidate_volume2_candidate "$index" purged
      purged_at=${volume2_receipt_purged_at[$id]:-}
      if [[ -z $purged_at ]]; then
        purged_at=$prepared_at
        receipt=$(build_volume2_receipt "$index" purged "$prepared_at" "$purged_at") ||
          fail "cannot recover purged volume2 receipt: $id"
        append_volume2_receipt "$receipt"
        volume2_receipt_purged["$id"]=1; volume2_receipt_purged_at["$id"]=$purged_at
      fi
    fi
    janitor_test_checkpoint volume2-after-purged-receipt-before-unregister
    unregister_volume2_metadata_only "$index"
    janitor_test_checkpoint volume2-after-git-remove
    revalidate_volume2_candidate "$index" absent
    removed_at=$("$DATE" -u +'%Y-%m-%dT%H:%M:%S.%3NZ')
    receipt=$(build_volume2_receipt "$index" removed "$prepared_at" "$purged_at" "$removed_at") ||
      fail "cannot construct removed volume2 receipt: $id"
    append_volume2_receipt "$receipt"
    printf 'removed-volume2 ledger=%s kind=%s target=%s beforeBytes=%s afterBytes=0\n' \
      "$id" "${plan_kinds[$index]}" "$target" "${plan_bytes[$index]}"
    removed=$((removed + 1))
  done
}
