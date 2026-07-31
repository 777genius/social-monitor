#!/usr/bin/env bash
# Sourced by consumed-worktree-janitor.sh after its trusted runtime is initialized.

declare -A v2_logical=() v2_target=() v2_plan_sha=() v2_main=()
declare -A v2_item_path=() v2_item_sha=() v2_status_path=() v2_status_sha=()
declare -A v2_patch_path=() v2_patch_sha=() v2_numstat_path=() v2_numstat_sha=()
declare -A v2_logical_identity=() v2_target_identity=() v2_registry_path=()
declare -A v2_registry_sha=() v2_git_registration_sha=() v2_before_bytes=()
declare -A v2_target_inodes=() v2_integrated_commit=() v2_prepared_at=()
declare -A v2_removed=() v2_replayed=() audited_workspace=()
RELOCATED_RECEIPT_RECOVERY=0

validate_job_root() {
  local job_root=$1 canonical_job_root
  [[ -d $job_root && ! -L $job_root ]] || fail "job root is unsafe: $job_root"
  canonical_job_root=$("$REALPATH" -e -- "$job_root") || fail "cannot canonicalize job root: $job_root"
  [[ $canonical_job_root == "$job_root" ]] || fail "job root escaped: $job_root"
}
validate_terminal_evidence_paths() {
  local evidence
  for evidence in "$@"; do validate_trusted_path "$evidence" file 'terminal evidence'; done
}
worktree_matches_terminal_evidence() {
  local target=$1 status_file=$2 patch_file=$3 numstat_file=$4
  "$GIT" -c status.showUntrackedFiles=all -C "$target" status --short | "$CMP" -s -- "$status_file" - || return 1
  "$GIT" -C "$target" diff --no-ext-diff --binary HEAD -- | "$CMP" -s -- "$patch_file" - || return 1
  "$GIT" -C "$target" diff --no-ext-diff --numstat HEAD -- | "$CMP" -s -- "$numstat_file" - || return 1
}

load_janitor_audit() {
  [[ -e $AUDIT_LOG || -L $AUDIT_LOG ]] || return 0
  [[ -f $AUDIT_LOG && ! -L $AUDIT_LOG && -r $AUDIT_LOG ]] ||
    fail 'audit log is unsafe'
  local canonical_audit
  canonical_audit=$("$REALPATH" -e -- "$AUDIT_LOG") ||
    fail 'cannot canonicalize audit log'
  [[ $canonical_audit == "$AUDIT_LOG" ]] || fail 'audit log is not canonical'
  # shellcheck disable=SC2016 # This is a jq program, not shell interpolation.
  "$JQ" -e -s '
    def sha256: type == "string" and test("^[0-9a-f]{64}$");
    def sha1: type == "string" and test("^[0-9a-f]{40}$");
    def absolute: type == "string" and startswith("/") and length > 1;
    def ledger: type == "string" and test("^[A-Za-z0-9._-]+--[A-Za-z0-9._-]+$");
    def whole: type == "number" and . >= 0 and floor == .;
    def v1:
      type == "object" and .schemaVersion == 1 and .status == "removed" and
      (.ledgerId | ledger) and (.ledgerItemPath | absolute) and
      (.ledgerItemSha256 | sha256) and (.statusEvidenceSha256 | sha256) and
      (.patchEvidenceSha256 | sha256) and (.numstatEvidenceSha256 | sha256) and
      (.worktreePath | absolute) and (.beforeBytes | whole) and
      .afterBytes == 0 and (.removedAt | type == "string");
    def v2_common:
      type == "object" and .schemaVersion == 2 and .mode == "apply-relocated" and
      (.ledgerId | ledger) and (.planSha256 | sha256) and (.mainCommit | sha1) and
      (.ledgerItemPath | absolute) and (.ledgerItemSha256 | sha256) and
      (.statusEvidencePath | absolute) and (.statusEvidenceSha256 | sha256) and
      (.patchEvidencePath | absolute) and (.patchEvidenceSha256 | sha256) and
      (.numstatEvidencePath | absolute) and (.numstatEvidenceSha256 | sha256) and
      (.logicalWorktreePath | absolute) and (.targetWorktreePath | absolute) and
      (.logicalIdentity | type == "string" and length > 0) and
      (.targetIdentity | type == "string" and length > 0) and
      (.registryPath | absolute) and (.registrySha256 | sha256) and
      (.gitRegistrationSha256 | sha256) and (.beforeBytes | whole) and
      (.targetInodes | whole) and .logicalSymlinkInodes == 1 and
      (.integratedCommitSha | type == "string" and
        (. == "-" or test("^[0-9a-f]{40}$")));
    def binding: [
      .schemaVersion,.mode,.ledgerId,.planSha256,.mainCommit,
      .ledgerItemPath,.ledgerItemSha256,
      .statusEvidencePath,.statusEvidenceSha256,
      .patchEvidencePath,.patchEvidenceSha256,
      .numstatEvidencePath,.numstatEvidenceSha256,
      .logicalWorktreePath,.targetWorktreePath,.logicalIdentity,.targetIdentity,
      .registryPath,.registrySha256,.gitRegistrationSha256,
      .beforeBytes,.targetInodes,.logicalSymlinkInodes,.integratedCommitSha
    ];
    all(.[]; v1 or
      (v2_common and
        ((.status == "prepared" and (.preparedAt | type == "string")) or
         (.status == "removed" and (.preparedAt | type == "string") and
          (.removedAt | type == "string") and .afterBytes == 0)))) and
    (group_by(.ledgerId) | all(.[];
      if .[0].schemaVersion == 1 then length == 1 and all(.[]; v1)
      else
        (length == 1 or length == 2) and
        all(.[]; .schemaVersion == 2) and .[0].status == "prepared" and
        (if length == 2 then
           .[1].status == "removed" and
           (.[0] | binding) == (.[1] | binding)
         else true end)
      end))
  ' "$AUDIT_LOG" >/dev/null ||
    fail 'audit log is malformed, conflicting, or has an unsupported replay state'

  local row id logical target plan main item_path item_sha status_path status_sha
  local patch_path patch_sha numstat_path numstat_sha logical_identity target_identity
  local registry_path registry_sha git_sha before_bytes target_inodes integrated_commit prepared_at
  while IFS= read -r row; do
    [[ -n $row ]] || continue
    IFS=$'\x1f' read -r id logical target plan main item_path item_sha \
      status_path status_sha patch_path patch_sha numstat_path numstat_sha \
      logical_identity target_identity registry_path registry_sha git_sha \
      before_bytes target_inodes integrated_commit prepared_at <<<"$row"
    v2_logical["$id"]=$logical; v2_target["$id"]=$target
    v2_plan_sha["$id"]=$plan; v2_main["$id"]=$main
    v2_item_path["$id"]=$item_path; v2_item_sha["$id"]=$item_sha
    v2_status_path["$id"]=$status_path; v2_status_sha["$id"]=$status_sha
    v2_patch_path["$id"]=$patch_path; v2_patch_sha["$id"]=$patch_sha
    v2_numstat_path["$id"]=$numstat_path; v2_numstat_sha["$id"]=$numstat_sha
    v2_logical_identity["$id"]=$logical_identity
    v2_target_identity["$id"]=$target_identity
    v2_registry_path["$id"]=$registry_path; v2_registry_sha["$id"]=$registry_sha
    v2_git_registration_sha["$id"]=$git_sha
    v2_before_bytes["$id"]=$before_bytes; v2_target_inodes["$id"]=$target_inodes
    v2_integrated_commit["$id"]=$integrated_commit
    v2_prepared_at["$id"]=$prepared_at
  done < <("$JQ" -r -j '
    select(.schemaVersion == 2 and .status == "prepared") |
    [.ledgerId,.logicalWorktreePath,.targetWorktreePath,.planSha256,.mainCommit,
     .ledgerItemPath,.ledgerItemSha256,.statusEvidencePath,.statusEvidenceSha256,
     .patchEvidencePath,.patchEvidenceSha256,.numstatEvidencePath,
     .numstatEvidenceSha256,.logicalIdentity,.targetIdentity,.registryPath,
     .registrySha256,.gitRegistrationSha256,(.beforeBytes|tostring),
     (.targetInodes|tostring),.integratedCommitSha,.preparedAt] | join("\u001f") + "\n"
  ' "$AUDIT_LOG")
  while IFS= read -r id; do
    [[ -n $id ]] && v2_removed["$id"]=1
  done < <("$JQ" -r 'select(.schemaVersion == 2 and .status == "removed") | .ledgerId' "$AUDIT_LOG")
}

validate_audit_bindings_after_ledger() {
  [[ -f $AUDIT_LOG ]] || return 0
  local row id workspace item receipt_hash status_hash patch_hash numstat_hash current_hash
  while IFS= read -r row; do
    [[ -n $row ]] || continue
    IFS=$'\x1f' read -r id workspace item receipt_hash status_hash patch_hash numstat_hash \
      <<<"$row"
    workspace=$(canonical_declared_path "$workspace" 'audit worktree')
    item=$(canonical_declared_path "$item" 'audit ledger item')
    [[ -n ${ledger_workspace_by_id[$id]:-} &&
      ${ledger_workspace_by_id[$id]} == "$workspace" ]] ||
      fail "audit receipt conflicts with consumed ledger: $id"
    [[ $item == "$LEDGER_ITEMS/$id.json" && -f $item && ! -L $item ]] ||
      fail "audit receipt ledger item is missing or unsafe: $id"
    current_hash=$("$SHA256SUM" -- "$item") || fail "cannot hash audit ledger item: $id"
    [[ ${current_hash%%[[:space:]]*} == "$receipt_hash" ]] ||
      fail "audit receipt hash conflicts with consumed ledger: $id"
    [[ -n ${ledger_status_hash_by_id[$id]:-} &&
      ${ledger_status_hash_by_id[$id]} == "$status_hash" &&
      ${ledger_patch_hash_by_id[$id]} == "$patch_hash" &&
      ${ledger_numstat_hash_by_id[$id]} == "$numstat_hash" ]] ||
      fail "audit receipt evidence hashes conflict with consumed ledger: $id"
    audited_workspace["$id"]=$workspace
  done < <("$JQ" -r -j '
    select(.schemaVersion == 1) |
    [.ledgerId,.worktreePath,.ledgerItemPath,.ledgerItemSha256,
     .statusEvidenceSha256,.patchEvidenceSha256,.numstatEvidenceSha256] |
    join("\u001f") + "\n"
  ' "$AUDIT_LOG")

  for id in "${!v2_logical[@]}"; do
    [[ -n ${ledger_workspace_by_id[$id]:-} &&
      ${ledger_workspace_by_id[$id]} == "${v2_logical[$id]}" &&
      ${ledger_target_by_id[$id]} == "${v2_target[$id]}" ]] ||
      fail "schema-v2 receipt paths conflict with consumed ledger: $id"
    [[ ${v2_item_path[$id]} == "$LEDGER_ITEMS/$id.json" &&
      ${ledger_item_hash_by_id[$id]:-} == "${v2_item_sha[$id]}" ]] ||
      fail "schema-v2 receipt ledger binding conflicts: $id"
    [[ ${ledger_status_path_by_id[$id]:-} == "${v2_status_path[$id]}" &&
      ${ledger_status_hash_by_id[$id]:-} == "${v2_status_sha[$id]}" &&
      ${ledger_patch_path_by_id[$id]:-} == "${v2_patch_path[$id]}" &&
      ${ledger_patch_hash_by_id[$id]:-} == "${v2_patch_sha[$id]}" &&
      ${ledger_numstat_path_by_id[$id]:-} == "${v2_numstat_path[$id]}" &&
      ${ledger_numstat_hash_by_id[$id]:-} == "${v2_numstat_sha[$id]}" ]] ||
      fail "schema-v2 receipt evidence binding conflicts: $id"
    [[ ${ledger_registry_path_by_id[$id]:-} == "${v2_registry_path[$id]}" &&
      ${ledger_registry_hash_by_id[$id]:-} == "${v2_registry_sha[$id]}" ]] ||
      fail "schema-v2 receipt registry binding conflicts: $id"
  done
}

select_relocated_receipt_recovery() {
  local id
  [[ $MODE == apply-relocated ]] || return 0
  for id in "${!v2_plan_sha[@]}"; do
    if [[ ${v2_plan_sha[$id]} == "$EXPECTED_PLAN_SHA256" ]]; then
      RELOCATED_RECEIPT_RECOVERY=1
      return 0
    fi
  done
}

bind_prepared_receipts_as_recovery_candidates() {
  local id logical
  declare -A prepared_owner=()
  for id in "${!v2_logical[@]}"; do
    [[ -z ${v2_removed[$id]:-} ]] || continue
    logical=${v2_logical[$id]}
    [[ -z ${prepared_owner[$logical]:-} ]] ||
      fail "multiple prepared schema-v2 receipts claim one logical path: $logical"
    prepared_owner["$logical"]=$id
    latest_item["$logical"]=${v2_item_path[$id]}
    latest_item_hash["$logical"]=${v2_item_sha[$id]}
    latest_integrated_commit["$logical"]=${ledger_integrated_commit_by_id[$id]}
    latest_job["$logical"]=${ledger_job_by_id[$id]}
    latest_ledger["$logical"]=$id
    latest_numstat["$logical"]=${v2_numstat_path[$id]}
    latest_numstat_hash["$logical"]=${v2_numstat_sha[$id]}
    latest_patch["$logical"]=${v2_patch_path[$id]}
    latest_patch_hash["$logical"]=${v2_patch_sha[$id]}
    latest_status["$logical"]=${ledger_status_by_id[$id]}
    latest_status_file["$logical"]=${v2_status_path[$id]}
    latest_status_hash["$logical"]=${v2_status_sha[$id]}
    latest_target["$logical"]=${v2_target[$id]}
    latest_workspace_kind["$logical"]=relocated
    latest_legacy_registry_bound["$logical"]=0
    latest_registry_path["$logical"]=${v2_registry_path[$id]}
    latest_registry_hash["$logical"]=${v2_registry_sha[$id]}
  done
}

classify_completed_v2_receipts() {
  local id logical target
  for id in "${!v2_removed[@]}"; do
    logical=${v2_logical[$id]}; target=${v2_target[$id]}
    [[ ! -e $logical && ! -L $logical && ! -e $target && ! -L $target &&
      ${registered_count[$target]:-0} == 0 ]] ||
      fail "removed schema-v2 receipt conflicts with existing relocated state: $id"
    [[ ${logical%/*} == "$WORKTREES" &&
      $target == "$RELOCATION_ARCHIVE_ROOT/${logical##*/}" ]] ||
      fail "removed schema-v2 receipt has unsafe tombstone paths: $id"
    validate_trusted_path "$WORKTREES" directory 'relocation logical parent'
    validate_trusted_path "$WORKTREES/.volume2" directory 'relocation volume parent'
    validate_trusted_path "$RELOCATION_ARCHIVE_ROOT" directory 'relocation archive root'
    v2_replayed["$id"]=1
    replayed=$((replayed + 1))
  done
}

append_fsynced_audit_receipt() {
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
  "$SYNC" -f -- "$AUDIT_TMP" || fail 'cannot fsync staged audit receipt'
  "$MV" -f -- "$AUDIT_TMP" "$AUDIT_LOG" || fail 'cannot atomically publish audit receipt'
  AUDIT_TMP=
  "$SYNC" -f -- "$AUDIT_LOG" || fail 'cannot fsync published audit receipt'
  "$SYNC" -f -- "$CONTROL" || fail 'cannot fsync audit directory'
}

path_identity() {
  local path=$1 identity
  identity=$("$STAT" -c '%d:%i:%u:%g:%a' -- "$path") ||
    fail "cannot capture path identity: $path"
  [[ $identity =~ ^[0-9]+:[0-9]+:[0-9]+:[0-9]+:[0-7]{3,4}$ ]] ||
    fail "invalid path identity: $path"
  printf '%s\n' "$identity"
}

CAPTURED_GIT_REGISTRATION=
capture_exact_unlocked_git_registration() {
  local target=$1 listing line block= path= count=0 match=
  listing=$("$GIT" -C "$INTEGRATION" worktree list --porcelain) ||
    fail 'cannot enumerate exact Git worktree registrations'
  while IFS= read -r line; do
    if [[ $line == worktree\ * ]]; then
      if [[ -n $block && $path == "$target" ]]; then
        match=$block count=$((count + 1))
      fi
      block=$line$'\n'
      path=$("$REALPATH" -m -- "${line#worktree }") ||
        fail 'cannot canonicalize exact Git worktree registration'
    elif [[ -n $block && -n $line ]]; then
      block+=$line$'\n'
    fi
  done <<<"$listing"
  if [[ -n $block && $path == "$target" ]]; then
    match=$block count=$((count + 1))
  fi
  ((count == 1)) || fail "relocated target requires one exact Git registration: $target"
  [[ $match != *$'\nlocked'* && $match != *$'\nprunable'* ]] ||
    fail "relocated target registration is locked or prunable: $target"
  CAPTURED_GIT_REGISTRATION=${match%$'\n'}
}

sha256_text() {
  local value=$1 digest
  digest=$(printf '%s' "$value" | "$SHA256SUM") || fail 'cannot hash canonical text'
  printf '%s\n' "${digest%%[[:space:]]*}"
}

snapshot_git_registrations() {
  local worktree_porcelain=$1 line digest
  local registered_path= registered_block=
  declare -gA registered_count=() registered_locked=() registered_registration_sha=()
  finalize_registered_block() {
    [[ -n $registered_path ]] || return 0
    digest=$(sha256_text "${registered_block%$'\n'}")
    registered_registration_sha["$registered_path"]=$digest
  }
  while IFS= read -r line; do
    if [[ $line == worktree\ * ]]; then
      finalize_registered_block
      registered_path=${line#worktree }
      registered_path=$("$REALPATH" -m -- "$registered_path") ||
        fail 'cannot canonicalize registered Git worktree'
      registered_count["$registered_path"]=$(( ${registered_count[$registered_path]:-0} + 1 ))
      registered_block=$line$'\n'
    elif [[ $line == locked || $line == locked\ * ]]; then
      [[ -n $registered_path ]] || fail 'Git reported an unbound worktree lock'
      registered_locked["$registered_path"]=1
      registered_block+=$line$'\n'
    elif [[ -n $registered_path && -n $line ]]; then
      registered_block+=$line$'\n'
    fi
  done <<<"$worktree_porcelain"
  finalize_registered_block
}

janitor_test_checkpoint() {
  local phase=$1 marker count=0
  [[ -n $TEST_ROOT ]] || return 0
  if [[ ${SOCIAL_MONITOR_JANITOR_TEST_FAIL_AT:-} == "$phase" ]]; then
    fail "injected hermetic failure at $phase"
  fi
  if [[ ${SOCIAL_MONITOR_JANITOR_TEST_CRASH_AT:-} == "$phase" ]]; then
    kill -KILL "$$"
  fi
  [[ ${SOCIAL_MONITOR_JANITOR_TEST_PAUSE_AT:-} == "$phase" ]] || return 0
  marker=$PROJECT_ROOT/.social-monitor-janitor-checkpoint-$phase
  : >"$marker"
  while [[ ! -f $marker.continue ]]; do
    "$SLEEP" 0.01
    count=$((count + 1))
    ((count < 3000)) || fail "timed out at hermetic checkpoint: $phase"
  done
}

validate_relocated_target_without_logical() {
  local logical=$1 target=$2 expected
  expected=$RELOCATION_ARCHIVE_ROOT/${logical##*/}
  [[ ! -e $logical && ! -L $logical && ${logical%/*} == "$WORKTREES" ]] ||
    fail "relocated logical path is not absent: $logical"
  [[ $target == "$expected" && ${target%/*} == "$RELOCATION_ARCHIVE_ROOT" ]] ||
    fail "relocated replay target is not exactly bound: $target"
  validate_trusted_path "$WORKTREES" directory 'relocation logical parent'
  validate_trusted_path "$WORKTREES/.volume2" directory 'relocation volume parent'
  validate_trusted_path "$RELOCATION_ARCHIVE_ROOT" directory 'relocation archive root'
  validate_trusted_path "$target" directory 'relocation archive target'
}

compute_relocated_plan_sha256() {
  local index record digest ledger_id
  local -a sorted_ledger_ids=()
  mapfile -t sorted_ledger_ids < <(printf '%s\n' "${!ledger_item_hash_by_id[@]}" | LC_ALL=C "$SORT")
  {
    printf 'schemaVersion\t2\nmode\tapply-relocated\nmainCommit\t%s\n' "$MAIN_COMMIT"
    for ledger_id in "${sorted_ledger_ids[@]}"; do
      printf 'ledger\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$ledger_id" \
        "$LEDGER_ITEMS/$ledger_id.json" "${ledger_item_hash_by_id[$ledger_id]}" \
        "${ledger_status_hash_by_id[$ledger_id]:--}" "${ledger_patch_hash_by_id[$ledger_id]:--}" \
        "${ledger_numstat_hash_by_id[$ledger_id]:--}" "${ledger_workspace_by_id[$ledger_id]}"
    done
    for index in "${!plan_targets[@]}"; do
      [[ ${plan_kinds[$index]} == relocated ]] || continue
      record=$(printf '%s\t' \
        "${plan_ledgers[$index]}" "${plan_items[$index]}" "${plan_item_hashes[$index]}" \
        "${plan_status_files[$index]}" "${plan_status_hashes[$index]}" \
        "${plan_patch_files[$index]}" "${plan_patch_hashes[$index]}" \
        "${plan_numstat_files[$index]}" "${plan_numstat_hashes[$index]}" \
        "${plan_workspaces[$index]}" "${plan_targets[$index]}" \
        "${plan_logical_identities[$index]}" "${plan_target_identities[$index]}" \
        "${plan_registry_paths[$index]}" "${plan_registry_hashes[$index]}" \
        "${plan_git_registration_hashes[$index]}" "${plan_integrated_commits[$index]}" \
        "${plan_bytes[$index]}" "${plan_target_inodes[$index]}" "${plan_link_inodes[$index]}")
      printf 'candidate\t%s\n' "${record%$'\t'}"
    done
  } | "$SHA256SUM" | {
    read -r digest _
    printf '%s\n' "$digest"
  }
}

rehash_matches() {
  local path=$1 expected=$2 label=$3 digest
  digest=$("$SHA256SUM" -- "$path") || fail "cannot rehash $label: $path"
  [[ ${digest%%[[:space:]]*} == "$expected" ]] ||
    fail "$label content changed after plan: $path"
}

revalidate_common_binding() {
  local index=$1 logical target ledger_id job_id current_main
  logical=${plan_workspaces[$index]}; target=${plan_targets[$index]}
  ledger_id=${plan_ledgers[$index]}; job_id=${plan_jobs[$index]}
  current_main=$("$GIT" -C "$INTEGRATION" rev-parse --verify refs/heads/main^{commit}) ||
    fail 'integration main disappeared during relocated apply'
  [[ $current_main == "$MAIN_COMMIT" ]] || fail 'integration main changed after relocated plan'
  [[ -f ${plan_items[$index]} && ! -L ${plan_items[$index]} ]] ||
    fail "ledger item became unsafe: $ledger_id"
  rehash_matches "${plan_items[$index]}" "${plan_item_hashes[$index]}" 'ledger item'
  validate_archive_location "$job_id" "$logical" "${plan_status_files[$index]%/git-status.txt}"
  [[ $VALIDATED_REGISTRY_PATH == "${plan_registry_paths[$index]}" ]] ||
    fail "registry path changed after plan: $ledger_id"
  rehash_matches "$VALIDATED_REGISTRY_PATH" "${plan_registry_hashes[$index]}" 'registry binding'
  validate_terminal_evidence_paths "${plan_status_files[$index]}" \
    "${plan_patch_files[$index]}" "${plan_numstat_files[$index]}"
  rehash_matches "${plan_status_files[$index]}" "${plan_status_hashes[$index]}" 'status evidence'
  rehash_matches "${plan_patch_files[$index]}" "${plan_patch_hashes[$index]}" 'patch evidence'
  rehash_matches "${plan_numstat_files[$index]}" "${plan_numstat_hashes[$index]}" 'numstat evidence'
  if [[ ${plan_integrated_commits[$index]} != - ]]; then
    integrated_commit_state "${plan_integrated_commits[$index]}" "$MAIN_COMMIT" ||
      fail "integrated commit is no longer retained: $ledger_id"
  fi
  validate_job_root "$WORKER_JOBS/$job_id"
  job_has_active_state "$WORKER_JOBS/$job_id" &&
    fail "job became active during relocated apply: $job_id"
  activity_protected=()
  scan_activity_manifests
  scan_controller_job
  scan_tmux_panes
  [[ -z ${activity_protected[$logical]:-} && -z ${activity_protected[$target]:-} ]] ||
    fail "controller or tmux activity appeared during relocated apply: $logical"
  live_process_uses_worktree "$target" &&
    fail "process entered relocated worktree during apply: $target"
  return 0
}

revalidate_relocated_candidate() {
  local index=$1 logical_state=$2 target_state=$3
  local logical target
  logical=${plan_workspaces[$index]}; target=${plan_targets[$index]}
  local byte_record inode_record current_identity registration_sha
  revalidate_common_binding "$index"
  if [[ $logical_state == present ]]; then
    [[ $(validate_relocated_workspace "$logical") == "$target" ]] ||
      fail "relocation target changed during apply: $logical"
    current_identity=$(path_identity "$logical")
    [[ $current_identity == "${plan_logical_identities[$index]}" ]] ||
      fail "relocated logical identity changed during apply: $logical"
  else
    [[ ! -e $logical && ! -L $logical ]] ||
      fail "relocated logical path reappeared during apply: $logical"
  fi
  if [[ $target_state == present ]]; then
    if [[ $logical_state == absent ]]; then
      validate_relocated_target_without_logical "$logical" "$target"
    fi
    current_identity=$(path_identity "$target")
    [[ $current_identity == "${plan_target_identities[$index]}" ]] ||
      fail "relocated target identity changed during apply: $target"
    if [[ $FAST_RELOCATED != 1 ]]; then
      capture_exact_unlocked_git_registration "$target"
      registration_sha=$(sha256_text "$CAPTURED_GIT_REGISTRATION")
      [[ $registration_sha == "${plan_git_registration_hashes[$index]}" ]] ||
        fail "Git registration changed during relocated apply: $target"
    fi
    worktree_matches_terminal_evidence "$target" "${plan_status_files[$index]}" \
      "${plan_patch_files[$index]}" "${plan_numstat_files[$index]}" ||
      fail "worktree state changed during relocated apply: ${plan_ledgers[$index]}"
    byte_record=$("$DU" -sb --apparent-size -- "$target") ||
      fail "cannot remeasure relocated bytes: $target"
    inode_record=$("$DU" -s --inodes -- "$target") ||
      fail "cannot remeasure relocated inodes: $target"
    [[ ${byte_record%%[[:space:]]*} == "${plan_bytes[$index]}" &&
      ${inode_record%%[[:space:]]*} == "${plan_target_inodes[$index]}" ]] ||
      fail "relocated accounting identity changed during apply: $target"
  else
    validate_trusted_path "$WORKTREES" directory 'relocation logical parent'
    validate_trusted_path "$WORKTREES/.volume2" directory 'relocation volume parent'
    validate_trusted_path "$RELOCATION_ARCHIVE_ROOT" directory 'relocation archive root'
    [[ ! -e $target && ! -L $target ]] ||
      fail "relocated target reappeared during replay: $target"
    if [[ $FAST_RELOCATED != 1 ]] && is_registered_now "$target"; then
      fail "removed relocated target is still registered: $target"
    fi
  fi
  return 0
}

assert_v2_plan_binding() {
  local index=$1 id
  id=${plan_ledgers[$index]}
  [[ ${v2_logical[$id]} == "${plan_workspaces[$index]}" &&
    ${v2_target[$id]} == "${plan_targets[$index]}" &&
    ${v2_item_path[$id]} == "${plan_items[$index]}" &&
    ${v2_item_sha[$id]} == "${plan_item_hashes[$index]}" &&
    ${v2_status_path[$id]} == "${plan_status_files[$index]}" &&
    ${v2_status_sha[$id]} == "${plan_status_hashes[$index]}" &&
    ${v2_patch_path[$id]} == "${plan_patch_files[$index]}" &&
    ${v2_patch_sha[$id]} == "${plan_patch_hashes[$index]}" &&
    ${v2_numstat_path[$id]} == "${plan_numstat_files[$index]}" &&
    ${v2_numstat_sha[$id]} == "${plan_numstat_hashes[$index]}" &&
    ${v2_logical_identity[$id]} == "${plan_logical_identities[$index]}" &&
    ${v2_target_identity[$id]} == "${plan_target_identities[$index]}" &&
    ${v2_registry_path[$id]} == "${plan_registry_paths[$index]}" &&
    ${v2_registry_sha[$id]} == "${plan_registry_hashes[$index]}" &&
    ${v2_git_registration_sha[$id]} == "${plan_git_registration_hashes[$index]}" &&
    ${v2_before_bytes[$id]} == "${plan_bytes[$index]}" &&
    ${v2_target_inodes[$id]} == "${plan_target_inodes[$index]}" &&
    ${v2_integrated_commit[$id]} == "${plan_integrated_commits[$index]}" ]] ||
    fail "schema-v2 receipt does not exactly match its relocated plan: $id"
}

build_v2_receipt() {
  local index=$1 status=$2 prepared_at=$3 removed_at=${4:-}
  local id=${plan_ledgers[$index]} receipt_plan=$RELOCATED_PLAN_SHA256 receipt_main=$MAIN_COMMIT
  if [[ -n ${v2_logical[$id]:-} ]]; then
    receipt_plan=${v2_plan_sha[$id]}; receipt_main=${v2_main[$id]}
  fi
  # shellcheck disable=SC2016 # The dollar-prefixed names are jq variables.
  "$JQ" -cn \
    --arg status "$status" --arg plan "$receipt_plan" --arg main "$receipt_main" \
    --arg ledger "${plan_ledgers[$index]}" --arg item "${plan_items[$index]}" \
    --arg itemSha "${plan_item_hashes[$index]}" \
    --arg statusPath "${plan_status_files[$index]}" --arg statusSha "${plan_status_hashes[$index]}" \
    --arg patchPath "${plan_patch_files[$index]}" --arg patchSha "${plan_patch_hashes[$index]}" \
    --arg numstatPath "${plan_numstat_files[$index]}" --arg numstatSha "${plan_numstat_hashes[$index]}" \
    --arg logical "${plan_workspaces[$index]}" --arg target "${plan_targets[$index]}" \
    --arg logicalIdentity "${plan_logical_identities[$index]}" \
    --arg targetIdentity "${plan_target_identities[$index]}" \
    --arg registry "${plan_registry_paths[$index]}" --arg registrySha "${plan_registry_hashes[$index]}" \
    --arg registrationSha "${plan_git_registration_hashes[$index]}" \
    --arg integrated "${plan_integrated_commits[$index]}" --arg preparedAt "$prepared_at" \
    --argjson beforeBytes "${plan_bytes[$index]}" \
    --argjson targetInodes "${plan_target_inodes[$index]}" \
    --arg removedAt "$removed_at" --argjson afterBytes 0 '
      {schemaVersion:2,mode:"apply-relocated",status:$status,planSha256:$plan,
       mainCommit:$main,ledgerId:$ledger,ledgerItemPath:$item,ledgerItemSha256:$itemSha,
       statusEvidencePath:$statusPath,statusEvidenceSha256:$statusSha,
       patchEvidencePath:$patchPath,patchEvidenceSha256:$patchSha,
       numstatEvidencePath:$numstatPath,numstatEvidenceSha256:$numstatSha,
       logicalWorktreePath:$logical,targetWorktreePath:$target,
       logicalIdentity:$logicalIdentity,targetIdentity:$targetIdentity,
       registryPath:$registry,registrySha256:$registrySha,
       gitRegistrationSha256:$registrationSha,beforeBytes:$beforeBytes,
       targetInodes:$targetInodes,logicalSymlinkInodes:1,
       integratedCommitSha:$integrated,preparedAt:$preparedAt}
      + (if $status == "removed" then {removedAt:$removedAt,afterBytes:$afterBytes}
         else {} end)'
}

apply_relocated_plan() {
  local index id logical target prepared_at removed_at receipt
  for index in "${!plan_targets[@]}"; do
    [[ ${plan_kinds[$index]} == relocated ]] || continue
    id=${plan_ledgers[$index]}; logical=${plan_workspaces[$index]}; target=${plan_targets[$index]}
    if ((RELOCATED_RECEIPT_RECOVERY == 1)) &&
      [[ ${v2_plan_sha[$id]:-} != "$EXPECTED_PLAN_SHA256" ]]; then
      continue
    fi
    if [[ -n ${v2_removed[$id]:-} ]]; then
      assert_v2_plan_binding "$index"
      revalidate_relocated_candidate "$index" absent absent
      replayed=$((replayed + 1))
      continue
    fi
    if [[ -z ${v2_logical[$id]:-} ]]; then
      janitor_test_checkpoint before-prepared
      revalidate_relocated_candidate "$index" present present
      prepared_at=$("$DATE" -u +'%Y-%m-%dT%H:%M:%S.%3NZ')
      receipt=$(build_v2_receipt "$index" prepared "$prepared_at") ||
        fail "cannot construct prepared schema-v2 receipt: $id"
      append_fsynced_audit_receipt "$receipt"
    else
      assert_v2_plan_binding "$index"
      prepared_at=${v2_prepared_at[$id]}
    fi
    janitor_test_checkpoint after-prepared
    if [[ -L $logical ]]; then
      janitor_test_checkpoint before-unlink
      revalidate_relocated_candidate "$index" present present
      "$UNLINK" -- "$logical" || fail "cannot unlink exact relocated logical path: $logical"
    else
      [[ ! -e $logical ]] || fail "relocated logical path entered an unsupported state: $logical"
    fi
    janitor_test_checkpoint after-unlink
    if [[ -d $target && ! -L $target ]]; then
      janitor_test_checkpoint before-git-remove
      revalidate_relocated_candidate "$index" absent present
      "$GIT" -C "$INTEGRATION" worktree remove --force -- "$target"
    else
      [[ ! -e $target && ! -L $target ]] ||
        fail "relocated target entered an unsupported replay state: $target"
    fi
    [[ ! -e $target && ! -L $target ]] || fail "Git did not remove relocated target: $target"
    if [[ $FAST_RELOCATED != 1 ]] && is_registered_now "$target"; then
      fail "relocated target remains registered: $target"
    fi
    janitor_test_checkpoint after-git-remove
    janitor_test_checkpoint before-removed
    revalidate_relocated_candidate "$index" absent absent
    removed_at=$("$DATE" -u +'%Y-%m-%dT%H:%M:%S.%3NZ')
    receipt=$(build_v2_receipt "$index" removed "$prepared_at" "$removed_at") ||
      fail "cannot construct removed schema-v2 receipt: $id"
    append_fsynced_audit_receipt "$receipt"
    printf 'removed-relocated ledger=%s logical=%s target=%s beforeBytes=%s afterBytes=0\n' \
      "$id" "$logical" "$target" "${plan_bytes[$index]}"
    removed=$((removed + 1))
  done
  if [[ $FAST_RELOCATED == 1 ]]; then
    local listing line path
    declare -A removed_targets=()
    for index in "${!plan_targets[@]}"; do
      [[ ${plan_kinds[$index]} == relocated ]] || continue
      removed_targets["${plan_targets[$index]}"]=1
    done
    listing=$("$GIT" -C "$INTEGRATION" worktree list --porcelain) ||
      fail 'cannot enumerate Git worktrees for final relocated absence check'
    while IFS= read -r line; do
      [[ $line == worktree\ * ]] || continue
      path=$("$REALPATH" -m -- "${line#worktree }") ||
        fail 'cannot canonicalize final relocated registration'
      [[ -z ${removed_targets[$path]:-} ]] ||
        fail "relocated target remains registered after batch apply: $path"
    done <<<"$listing"
  fi
}

apply_ordinary_plan() {
  local index target item ledger_id job_id status_sha patch_sha numstat_sha
  local integrated_commit current_main commit_state reason byte_record before_bytes
  local ledger_sha removed_at receipt
  for index in "${!plan_targets[@]}"; do
    target=${plan_targets[$index]}; item=${plan_items[$index]}
    ledger_id=${plan_ledgers[$index]}; job_id=${plan_jobs[$index]}
    [[ -d $target && ! -L $target ]] || fail "worktree changed before apply: $target"
    is_registered_now "$target" || fail "worktree registration changed before apply: $target"
    is_locked_now "$target" && fail "Git worktree became locked before apply: $target"
    activity_protected=(); scan_activity_manifests; scan_controller_job; scan_tmux_panes
    [[ -z ${activity_protected[$target]:-} ]] ||
      fail "controller or tmux activity appeared before apply: $target"
    validate_archive_location "$job_id" "$target" "${latest_status_file[$target]%/git-status.txt}"
    validate_terminal_evidence_paths "${latest_status_file[$target]}" \
      "${latest_patch[$target]}" "${latest_numstat[$target]}"
    status_sha=$("$SHA256SUM" -- "${latest_status_file[$target]}")
    patch_sha=$("$SHA256SUM" -- "${latest_patch[$target]}")
    numstat_sha=$("$SHA256SUM" -- "${latest_numstat[$target]}")
    [[ ${status_sha%%[[:space:]]*} == "${latest_status_hash[$target]}" &&
      ${patch_sha%%[[:space:]]*} == "${latest_patch_hash[$target]}" &&
      ${numstat_sha%%[[:space:]]*} == "${latest_numstat_hash[$target]}" ]] ||
      fail "archive evidence content changed before apply: $ledger_id"
    worktree_matches_terminal_evidence "$target" "${latest_status_file[$target]}" \
      "${latest_patch[$target]}" "${latest_numstat[$target]}" ||
      fail "worktree state changed after terminal evidence preflight: $ledger_id"
    if [[ ${latest_status[$target]} == integrated ]]; then
      integrated_commit=${latest_integrated_commit[$target]}
      current_main=$("$GIT" -C "$INTEGRATION" rev-parse --verify refs/heads/main^{commit}) ||
        fail 'integration main disappeared before apply'
      if integrated_commit_state "$integrated_commit" "$current_main"; then :
      else
        commit_state=$?; ((commit_state == 1)) && reason=integrated-commit-not-retained ||
          reason=integrated-commit-unavailable
        printf 'excluded reason=%s ledger=%s worktree=%s\n' "$reason" "$ledger_id" "$target"
        eligible=$((eligible - 1)); excluded=$((excluded + 1)); continue
      fi
    fi
    validate_job_root "$WORKER_JOBS/$job_id"
    job_has_active_state "$WORKER_JOBS/$job_id" && fail "job became active before apply: $job_id"
    live_process_uses_worktree "$target" && fail "process entered worktree before apply: $target"
    byte_record=$("$DU" -sb --apparent-size -- "$target") || fail "cannot remeasure bytes: $target"
    before_bytes=${byte_record%%[[:space:]]*}
    ledger_sha=$("$SHA256SUM" -- "$item") || fail "cannot hash ledger item: $item"
    ledger_sha=${ledger_sha%%[[:space:]]*}
    [[ $ledger_sha == "${latest_item_hash[$target]}" ]] ||
      fail "ledger item changed after preflight: $ledger_id"
    removed_at=$("$DATE" -u +'%Y-%m-%dT%H:%M:%S.%3NZ')
    "$GIT" -C "$INTEGRATION" worktree remove --force -- "$target"
    [[ ! -e $target && ! -L $target ]] || fail "Git did not remove worktree: $target"
    is_registered_now "$target" && fail "Git worktree remains registered: $target"
    # shellcheck disable=SC2016 # The dollar-prefixed names are jq variables.
    receipt=$("$JQ" -cn --arg ledgerId "$ledger_id" --arg ledgerItemPath "$item" \
      --arg ledgerItemSha256 "$ledger_sha" --arg statusEvidenceSha256 "${latest_status_hash[$target]}" \
      --arg patchEvidenceSha256 "${latest_patch_hash[$target]}" \
      --arg numstatEvidenceSha256 "${latest_numstat_hash[$target]}" \
      --arg worktreePath "$target" --arg removedAt "$removed_at" \
      --argjson beforeBytes "$before_bytes" '{schemaVersion:1,status:"removed",ledgerId:$ledgerId,
       ledgerItemPath:$ledgerItemPath,ledgerItemSha256:$ledgerItemSha256,
       statusEvidenceSha256:$statusEvidenceSha256,patchEvidenceSha256:$patchEvidenceSha256,
       numstatEvidenceSha256:$numstatEvidenceSha256,worktreePath:$worktreePath,
       beforeBytes:$beforeBytes,afterBytes:0,removedAt:$removedAt}') ||
      fail 'cannot construct audit receipt'
    append_fsynced_audit_receipt "$receipt"
    printf 'removed ledger=%s worktree=%s beforeBytes=%s afterBytes=0\n' \
      "$ledger_id" "$target" "$before_bytes"
    removed=$((removed + 1))
  done
}
