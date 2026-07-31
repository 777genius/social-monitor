#!/usr/bin/env bash
# Sourced by consumed-worktree-janitor.sh after its trusted runtime is initialized.
readonly VOLUME2_AUDIT_LOG=$CONTROL/consumed-worktree-janitor-volume2.audit.jsonl
declare -A volume2_workspace_by_parent=() volume2_receipt_kind=() volume2_receipt_target=() volume2_receipt_plan=() volume2_receipt_main=()
declare -A volume2_receipt_item_path=() volume2_receipt_item_sha=() volume2_receipt_status_path=() volume2_receipt_status_sha=() volume2_receipt_patch_path=() volume2_receipt_patch_sha=()
declare -A volume2_receipt_numstat_path=() volume2_receipt_numstat_sha=() volume2_receipt_registry_path=() volume2_receipt_registry_sha=() volume2_receipt_integrated=()
declare -A volume2_receipt_target_identity=() volume2_receipt_parent_identity=() volume2_receipt_mount_identity=() volume2_receipt_registration_sha=() volume2_receipt_bytes=() volume2_receipt_inodes=()
declare -A volume2_receipt_prepared_at=() volume2_receipt_removed=() volume2_receipt_replayed=()
VOLUME2_CANDIDATE_TARGET_IDENTITY=- VOLUME2_CANDIDATE_PARENT_IDENTITY=-
VOLUME2_CANDIDATE_MOUNT_IDENTITY=- VOLUME2_CANDIDATE_REGISTRATION_SHA=-
VOLUME2_RECEIPT_RECOVERY=0
is_terminal_ledger_status() { case $1 in integrated | rejected | archived | superseded) return 0 ;; *) return 1 ;; esac; }
is_terminal_activity_status() { case $1 in archived | blocked | canceled | cancelled | completed | done | failed | integrated | partial | pushed | rejected | rolled_back | stopped | superseded) return 0 ;; *) return 1 ;; esac; }
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
    def absolute: type == "string" and startswith("/") and length > 1;
    def ledger: type == "string" and test("^[A-Za-z0-9._-]+--[A-Za-z0-9._-]+$");
    def identity: type == "string" and test("^[0-9]+:[0-9]+:[0-9]+:[0-9]+:[0-7]{3,4}$");
    def whole: type == "number" and . >= 0 and floor == .;
    def common:
      type == "object" and .schemaVersion == 1 and .mode == "apply-volume2" and
      (.status == "prepared" or .status == "removed") and
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
      (.targetInodes | whole) and (.integratedCommitSha | sha1_or_dash) and
      (.preparedAt | type == "string" and length > 0) and
      (if .status == "removed" then
         (.removedAt | type == "string" and length > 0) and .afterBytes == 0
       else (has("removedAt") or has("afterBytes")) | not end);
    def binding: [.schemaVersion,.mode,.ledgerId,.planSha256,.mainCommit,
      .candidateKind,.targetWorktreePath,.targetIdentity,.volumeMountIdentity,.nestedParentIdentity,
      .ledgerItemPath,.ledgerItemSha256,.statusEvidencePath,.statusEvidenceSha256,
      .patchEvidencePath,.patchEvidenceSha256,.numstatEvidencePath,.numstatEvidenceSha256,
      .registryPath,.registrySha256,.gitRegistrationSha256,.beforeBytes,.targetInodes,.integratedCommitSha,.preparedAt];
    all(.[]; common) and (group_by(.ledgerId) | all(.[];
      (length == 1 or length == 2) and .[0].status == "prepared" and
      (if length == 2 then .[1].status == "removed" and
        (.[0] | binding) == (.[1] | binding) else true end)))
  ' "$VOLUME2_AUDIT_LOG" >/dev/null || fail 'volume2 audit log is malformed, conflicting, or tampered'
  local row id
  while IFS= read -r row; do
    [[ -n $row ]] || continue
    IFS=$'\x1f' read -r id kind target plan main item item_sha status_path status_sha \
      patch_path patch_sha numstat_path numstat_sha registry registry_sha target_identity \
      parent_identity mount_identity registration bytes inodes integrated prepared_at <<<"$row"
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
    volume2_receipt_integrated["$id"]=$integrated; volume2_receipt_prepared_at["$id"]=$prepared_at
  done < <("$JQ" -r -j 'select(.status == "prepared") |
    [.ledgerId,.candidateKind,.targetWorktreePath,.planSha256,.mainCommit,.ledgerItemPath,.ledgerItemSha256,
     .statusEvidencePath,.statusEvidenceSha256,.patchEvidencePath,.patchEvidenceSha256,
     .numstatEvidencePath,.numstatEvidenceSha256,.registryPath,.registrySha256,.targetIdentity,
     .nestedParentIdentity,.volumeMountIdentity,.gitRegistrationSha256,(.beforeBytes|tostring),
     (.targetInodes|tostring),.integratedCommitSha,.preparedAt] | join("\u001f") + "\n"' \
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
  if [[ -d $target && ! -L $target ]]; then validate_volume2_layout "$kind" "$target" "$job"
  else validate_volume2_absent_layout "$kind" "$target" "$job"; fi
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
    printf 'schemaVersion\t1\nmode\tapply-volume2\nmainCommit\t%s\n' "$MAIN_COMMIT"
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
    ${volume2_receipt_integrated[$id]} == "${plan_integrated_commits[$index]}" ]] ||
    fail "prepared volume2 receipt no longer matches its exact plan: $id"
}
revalidate_volume2_candidate() {
  local index=$1 state=$2 id=${plan_ledgers[$1]} target=${plan_targets[$1]}
  local job=${plan_jobs[$1]} current_main registration byte_record inode_record
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
  else
    validate_volume2_absent_layout "${plan_kinds[$index]}" "$target" "$job"
    is_registered_now "$target" && fail "removed volume2 target remains registered: $target"
  fi; return 0
}
build_volume2_receipt() {
  local index=$1 status=$2 prepared_at=$3 removed_at=${4:-}
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
    --arg integrated "${plan_integrated_commits[$index]}" --arg preparedAt "$prepared_at" \
    --arg removedAt "$removed_at" --argjson beforeBytes "${plan_bytes[$index]}" \
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
       targetInodes:$targetInodes,integratedCommitSha:$integrated,preparedAt:$preparedAt}
      + (if $status == "removed" then {removedAt:$removedAt,afterBytes:0} else {} end)'
}
apply_volume2_plan() {
  local index id target prepared_at removed_at receipt
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
    fi
    janitor_test_checkpoint volume2-after-prepared
    if [[ -d $target && ! -L $target ]]; then
      janitor_test_checkpoint volume2-before-git-remove
      revalidate_volume2_candidate "$index" present
      "$GIT" -C "$INTEGRATION" worktree remove --force -- "$target"
    else
      validate_volume2_absent_layout "${plan_kinds[$index]}" "$target" "${plan_jobs[$index]}"
    fi
    [[ ! -e $target && ! -L $target ]] || fail "Git did not remove volume2 target: $target"
    is_registered_now "$target" && fail "volume2 target remains registered: $target"
    janitor_test_checkpoint volume2-after-git-remove
    revalidate_volume2_candidate "$index" absent
    removed_at=$("$DATE" -u +'%Y-%m-%dT%H:%M:%S.%3NZ')
    receipt=$(build_volume2_receipt "$index" removed "$prepared_at" "$removed_at") ||
      fail "cannot construct removed volume2 receipt: $id"
    append_volume2_receipt "$receipt"
    printf 'removed-volume2 ledger=%s kind=%s target=%s beforeBytes=%s afterBytes=0\n' \
      "$id" "${plan_kinds[$index]}" "$target" "${plan_bytes[$index]}"
    removed=$((removed + 1))
  done
}
