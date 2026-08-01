#!/usr/bin/env bash
# Sourced by consumed-worktree-janitor.sh after the volume2 runtime is initialized.

readonly VOLUME2_PLAN_DIRECTORY=$CONTROL/consumed-worktree-janitor-volume2-plans
readonly VOLUME2_PLAN_MKDIR=/usr/bin/mkdir VOLUME2_PLAN_CHMOD=/usr/bin/chmod
declare -A bound_volume2_ledgers=() bound_volume2_candidates=() bound_volume2_measurements=()
VOLUME2_SAVED_STDOUT= VOLUME2_BOUND_PLAN_PATH= VOLUME2_BOUND_PLAN_SHA256=
VOLUME2_BOUND_CANDIDATES=0 VOLUME2_BOUND_BYTES=0 VOLUME2_BOUND_TARGET_INODES=0
VOLUME2_BOUND_LOGICAL_INODES=0 VOLUME2_BOUND_TOTAL_INODES=0

validate_volume2_plan_directory() {
  validate_trusted_path "$VOLUME2_PLAN_DIRECTORY" directory 'volume2 plan directory'
  local metadata owner mode
  metadata=$("$STAT" -c '%u %a' -- "$VOLUME2_PLAN_DIRECTORY") ||
    fail 'cannot stat volume2 plan directory'
  owner=${metadata%% *}; mode=${metadata##* }
  [[ $owner == "$TRUSTED_OWNER_ID" && $mode == 700 ]] ||
    fail 'volume2 plan directory must have its trusted owner and mode 0700'
}

ensure_volume2_plan_directory() {
  if [[ ! -e $VOLUME2_PLAN_DIRECTORY && ! -L $VOLUME2_PLAN_DIRECTORY ]]; then
    [[ -x $VOLUME2_PLAN_MKDIR && -x $VOLUME2_PLAN_CHMOD ]] ||
      fail 'volume2 plan directory tools are unavailable'
    "$VOLUME2_PLAN_MKDIR" -m 0700 -- "$VOLUME2_PLAN_DIRECTORY" ||
      fail 'cannot create volume2 plan directory'
    "$VOLUME2_PLAN_CHMOD" 0700 -- "$VOLUME2_PLAN_DIRECTORY" ||
      fail 'cannot set volume2 plan directory mode'
    "$SYNC" -f -- "$CONTROL" || fail 'cannot fsync control directory after plan directory creation'
  fi
  validate_volume2_plan_directory
}

validate_volume2_plan_file_mode() {
  local path=$1 metadata owner mode
  validate_trusted_path "$path" file 'volume2 plan manifest'
  metadata=$("$STAT" -c '%u %a' -- "$path") || fail "cannot stat volume2 plan manifest: $path"
  owner=${metadata%% *}; mode=${metadata##* }
  [[ $owner == "$TRUSTED_OWNER_ID" && $mode == 600 ]] ||
    fail "volume2 plan manifest must have its trusted owner and mode 0600: $path"
}

validate_volume2_plan_schema() {
  local path=$1
  # shellcheck disable=SC2016 # The dollar-prefixed names are jq locals.
  "$JQ" -e '
    def sha256: type == "string" and test("^[0-9a-f]{64}$");
    def sha1: type == "string" and test("^[0-9a-f]{40}$");
    def sha_or_dash: type == "string" and (. == "-" or test("^[0-9a-f]{64}$"));
    def sha1_or_dash: type == "string" and (. == "-" or test("^[0-9a-f]{40}$"));
    def absolute: type == "string" and startswith("/") and length > 1 and (explode | all(. >= 32));
    def absolute_or_dash: . == "-" or absolute;
    def ledger_id: type == "string" and test("^[A-Za-z0-9._-]+--[A-Za-z0-9._-]+$");
    def identity: type == "string" and test("^[0-9]+:[0-9]+:[0-9]+:[0-9]+:[0-7]{3,4}$");
    def whole: type == "number" and . >= 0 and floor == .;
    def timestamp: type == "string" and
      test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$");
    def ledger_keys: ["ledgerId","ledgerItemPath","ledgerItemSha256","numstatEvidenceSha256",
      "patchEvidenceSha256","statusEvidencePath","statusEvidenceSha256","workspacePath"];
    def candidate_keys: ["beforeBytes","candidateKind","gitRegistrationSha256","integratedCommitSha",
      "ledgerId","ledgerItemPath","ledgerItemSha256","nestedParentIdentity","numstatEvidencePath",
      "numstatEvidenceSha256","patchEvidencePath","patchEvidenceSha256","registryPath","registrySha256",
      "statusEvidencePath","statusEvidenceSha256","targetIdentity","targetInodes","targetWorktreePath",
      "volumeMountIdentity"];
    def valid_ledger:
      type == "object" and (keys_unsorted | sort) == ledger_keys and
      (.ledgerId | ledger_id) and (.ledgerItemPath | absolute) and (.ledgerItemSha256 | sha256) and
      (.statusEvidencePath | absolute_or_dash) and (.statusEvidenceSha256 | sha_or_dash) and
      (.patchEvidenceSha256 | sha_or_dash) and (.numstatEvidenceSha256 | sha_or_dash) and
      (.workspacePath | absolute);
    def valid_candidate:
      type == "object" and (keys_unsorted | sort) == candidate_keys and
      (.ledgerId | ledger_id) and
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
      (.targetInodes | whole) and (.integratedCommitSha | sha1_or_dash);
    type == "object" and
    (keys_unsorted | sort) == ["accounting","candidates","generatedAt","ledgers",
      "lifecycleLockIdentity","mainCommit","mode","planSha256","schemaVersion"] and
    .schemaVersion == 1 and .mode == "apply-volume2" and (.mainCommit | sha1) and
    (.lifecycleLockIdentity | identity) and (.generatedAt | timestamp) and (.planSha256 | sha256) and
    (.accounting | type == "object" and
      (keys_unsorted | sort) == ["apparentBytes","candidateCount","logicalSymlinkInodes","targetInodes","totalInodes"] and
      all(.[]; whole)) and
    (.ledgers | type == "array" and all(.[]; valid_ledger) and
      (map(.ledgerId) == (map(.ledgerId) | sort)) and (map(.ledgerId) | unique | length) == length) and
    (.candidates | type == "array" and all(.[]; valid_candidate) and
      (. == (sort_by(.targetWorktreePath,.ledgerId))) and (map(.ledgerId) | unique | length) == length) and
    .accounting.candidateCount == (.candidates | length) and
    .accounting.apparentBytes == ((.candidates | map(.beforeBytes) | add) // 0) and
    .accounting.targetInodes == ((.candidates | map(.targetInodes) | add) // 0) and
    .accounting.logicalSymlinkInodes == 0 and
    .accounting.totalInodes == .accounting.targetInodes
  ' "$path" >/dev/null || fail "volume2 plan manifest is partial, malformed, or conflicting: $path"
}

volume2_manifest_sha256() {
  local path=$1 digest
  # This reproduces compute_volume2_plan_sha256 exactly. generatedAt, the
  # embedded digest, and derived accounting are deliberately excluded.
  "$JQ" -r -j '
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
  ' "$path" | "$SHA256SUM" | { read -r digest _; printf '%s\n' "$digest"; }
}

load_volume2_plan_manifest() {
  local path=$1 expected=$2 embedded actual row id
  validate_volume2_plan_file_mode "$path"
  validate_volume2_plan_schema "$path"
  embedded=$("$JQ" -r '.planSha256' "$path")
  actual=$(volume2_manifest_sha256 "$path") || fail "cannot hash volume2 plan manifest: $path"
  [[ $embedded == "$actual" && $actual == "$expected" ]] ||
    fail "volume2 plan manifest is tampered or mismatched expected=$expected embedded=$embedded actual=$actual"
  [[ ${path%/*} == "$VOLUME2_PLAN_DIRECTORY" && ${path##*/} == "$expected.json" ]] ||
    fail 'volume2 plan manifest path is not bound to its digest'
  [[ $("$JQ" -r '.mainCommit' "$path") == "$MAIN_COMMIT" ]] ||
    fail 'persisted volume2 plan main commit changed'
  [[ $("$JQ" -r '.lifecycleLockIdentity' "$path") == "$VOLUME2_LIFECYCLE_LOCK_IDENTITY" ]] ||
    fail 'persisted volume2 plan lifecycle lock identity changed'
  bound_volume2_ledgers=(); bound_volume2_candidates=(); bound_volume2_measurements=()
  while IFS= read -r row; do
    [[ -n $row ]] || continue; id=${row%%$'\t'*}; bound_volume2_ledgers["$id"]=$row
  done < <("$JQ" -r '.ledgers[] | [.ledgerId,.ledgerItemPath,.ledgerItemSha256,
    .statusEvidencePath,.statusEvidenceSha256,.patchEvidenceSha256,
    .numstatEvidenceSha256,.workspacePath] | join("\t")' "$path")
  while IFS= read -r row; do
    [[ -n $row ]] || continue; id=${row%%$'\t'*}; bound_volume2_candidates["$id"]=$row
  done < <("$JQ" -r '.candidates[] | [.ledgerId,.candidateKind,.targetWorktreePath,
    .targetIdentity,.volumeMountIdentity,.nestedParentIdentity,.ledgerItemPath,
    .ledgerItemSha256,.statusEvidencePath,.statusEvidenceSha256,.patchEvidencePath,
    .patchEvidenceSha256,.numstatEvidencePath,.numstatEvidenceSha256,.registryPath,
    .registrySha256,.gitRegistrationSha256,(.beforeBytes|tostring),
    (.targetInodes|tostring),.integratedCommitSha] | join("\t")' "$path")
  while IFS=$'\t' read -r id row; do
    [[ -n $id ]] || continue; bound_volume2_measurements["$id"]=$row
  done < <("$JQ" -r '.candidates[] | [.ledgerId,.beforeBytes,.targetInodes] | @tsv' "$path")
  VOLUME2_BOUND_PLAN_PATH=$path VOLUME2_BOUND_PLAN_SHA256=$actual
  read -r VOLUME2_BOUND_CANDIDATES VOLUME2_BOUND_BYTES VOLUME2_BOUND_TARGET_INODES \
    VOLUME2_BOUND_LOGICAL_INODES VOLUME2_BOUND_TOTAL_INODES < <("$JQ" -r '
      [.accounting.candidateCount,.accounting.apparentBytes,.accounting.targetInodes,
       .accounting.logicalSymlinkInodes,.accounting.totalInodes] | @tsv' "$path")
}

reuse_bound_volume2_measurement() {
  local id=$1 kind=$2 measurement
  [[ $MODE == apply-volume2 && ($kind == volume2-direct || $kind == volume2-nested) ]] || return 1
  measurement=${bound_volume2_measurements[$id]:-}; [[ -n $measurement ]] || return 1
  IFS=$'\t' read -r VOLUME2_REUSED_BYTES VOLUME2_REUSED_INODES <<<"$measurement"
  [[ $VOLUME2_REUSED_BYTES =~ ^[0-9]+$ && $VOLUME2_REUSED_INODES =~ ^[0-9]+$ ]] ||
    fail "persisted volume2 accounting is invalid: $id"
}

initialize_volume2_plan_contract() {
  if [[ $MODE == dry-run-volume2 ]]; then
    ensure_volume2_plan_directory
    exec {VOLUME2_SAVED_STDOUT}>&1
    exec 1>/dev/null
  elif [[ $MODE == apply-volume2 ]]; then
    [[ -d $VOLUME2_PLAN_DIRECTORY && ! -L $VOLUME2_PLAN_DIRECTORY ]] ||
      fail 'persisted volume2 plan directory is missing or unsafe'
    validate_volume2_plan_directory
    load_volume2_plan_manifest "$VOLUME2_PLAN_DIRECTORY/$EXPECTED_PLAN_SHA256.json" \
      "$EXPECTED_PLAN_SHA256"
  fi
}

volume2_candidate_record() {
  local index=$1
  printf '%s\t' "${plan_ledgers[$index]}" "${plan_kinds[$index]}" \
    "${plan_targets[$index]}" "${plan_target_identities[$index]}" \
    "${plan_volume2_mount_identities[$index]}" "${plan_volume2_parent_identities[$index]}" \
    "${plan_items[$index]}" "${plan_item_hashes[$index]}" \
    "${plan_status_files[$index]}" "${plan_status_hashes[$index]}" \
    "${plan_patch_files[$index]}" "${plan_patch_hashes[$index]}" \
    "${plan_numstat_files[$index]}" "${plan_numstat_hashes[$index]}" \
    "${plan_registry_paths[$index]}" "${plan_registry_hashes[$index]}" \
    "${plan_git_registration_hashes[$index]}" "${plan_bytes[$index]}" \
    "${plan_target_inodes[$index]}" "${plan_integrated_commits[$index]}"
}

compute_volume2_plan_sha256() {
  local ledger_id index record digest; local -a ids=()
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
      record=$(volume2_candidate_record "$index"); printf 'candidate\t%s\n' "${record%$'\t'}"
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

write_volume2_plan_manifest() {
  local path=$1 plan_sha=$2 generated_at=$3 ledger_id index comma= record
  local candidates=0 bytes=0 inodes=0; local -a ids=()
  mapfile -t ids < <(printf '%s\n' "${!ledger_item_hash_by_id[@]}" | LC_ALL=C "$SORT")
  for index in "${!plan_targets[@]}"; do
    [[ ${plan_kinds[$index]} == volume2-direct || ${plan_kinds[$index]} == volume2-nested ]] || continue
    candidates=$((candidates + 1)); bytes=$((bytes + plan_bytes[index])); inodes=$((inodes + plan_target_inodes[index]))
  done
  printf '{"schemaVersion":1,"mode":"apply-volume2","mainCommit":"%s","lifecycleLockIdentity":"%s","generatedAt":"%s","planSha256":"%s","accounting":{"candidateCount":%s,"apparentBytes":%s,"targetInodes":%s,"logicalSymlinkInodes":0,"totalInodes":%s},"ledgers":[' \
    "$MAIN_COMMIT" "$VOLUME2_LIFECYCLE_LOCK_IDENTITY" "$generated_at" "$plan_sha" \
    "$candidates" "$bytes" "$inodes" "$inodes" >"$path" || fail 'cannot write volume2 plan header'
  for ledger_id in "${ids[@]}"; do
    printf '%s' "$comma" >>"$path"
    "$JQ" -cn --arg id "$ledger_id" --arg item "$LEDGER_ITEMS/$ledger_id.json" \
      --arg itemSha "${ledger_item_hash_by_id[$ledger_id]}" \
      --arg statusPath "${ledger_status_path_by_id[$ledger_id]:--}" \
      --arg statusSha "${ledger_status_hash_by_id[$ledger_id]:--}" \
      --arg patchSha "${ledger_patch_hash_by_id[$ledger_id]:--}" \
      --arg numstatSha "${ledger_numstat_hash_by_id[$ledger_id]:--}" \
      --arg workspace "${ledger_workspace_by_id[$ledger_id]}" \
      '{ledgerId:$id,ledgerItemPath:$item,ledgerItemSha256:$itemSha,statusEvidencePath:$statusPath,
        statusEvidenceSha256:$statusSha,patchEvidenceSha256:$patchSha,
        numstatEvidenceSha256:$numstatSha,workspacePath:$workspace}' >>"$path" ||
      fail 'cannot write volume2 plan ledger binding'
    comma=,
  done
  printf '],"candidates":[' >>"$path"; comma=
  for index in "${!plan_targets[@]}"; do
    [[ ${plan_kinds[$index]} == volume2-direct || ${plan_kinds[$index]} == volume2-nested ]] || continue
    printf '%s' "$comma" >>"$path"
    "$JQ" -cn --arg ledger "${plan_ledgers[$index]}" --arg kind "${plan_kinds[$index]}" \
      --arg target "${plan_targets[$index]}" --arg targetIdentity "${plan_target_identities[$index]}" \
      --arg mountIdentity "${plan_volume2_mount_identities[$index]}" \
      --arg parentIdentity "${plan_volume2_parent_identities[$index]}" \
      --arg item "${plan_items[$index]}" --arg itemSha "${plan_item_hashes[$index]}" \
      --arg statusPath "${plan_status_files[$index]}" --arg statusSha "${plan_status_hashes[$index]}" \
      --arg patchPath "${plan_patch_files[$index]}" --arg patchSha "${plan_patch_hashes[$index]}" \
      --arg numstatPath "${plan_numstat_files[$index]}" --arg numstatSha "${plan_numstat_hashes[$index]}" \
      --arg registry "${plan_registry_paths[$index]}" --arg registrySha "${plan_registry_hashes[$index]}" \
      --arg registrationSha "${plan_git_registration_hashes[$index]}" \
      --arg integrated "${plan_integrated_commits[$index]}" \
      --argjson bytes "${plan_bytes[$index]}" --argjson inodes "${plan_target_inodes[$index]}" \
      '{ledgerId:$ledger,candidateKind:$kind,targetWorktreePath:$target,targetIdentity:$targetIdentity,
        volumeMountIdentity:$mountIdentity,nestedParentIdentity:$parentIdentity,ledgerItemPath:$item,
        ledgerItemSha256:$itemSha,statusEvidencePath:$statusPath,statusEvidenceSha256:$statusSha,
        patchEvidencePath:$patchPath,patchEvidenceSha256:$patchSha,numstatEvidencePath:$numstatPath,
        numstatEvidenceSha256:$numstatSha,registryPath:$registry,registrySha256:$registrySha,
        gitRegistrationSha256:$registrationSha,beforeBytes:$bytes,targetInodes:$inodes,
        integratedCommitSha:$integrated}' >>"$path" || fail 'cannot write volume2 plan candidate binding'
    comma=,
  done
  printf ']}\n' >>"$path" || fail 'cannot finish volume2 plan manifest'
}

publish_volume2_plan_manifest() {
  local plan_sha=$1 final=$VOLUME2_PLAN_DIRECTORY/$1.json generated_at stage actual
  local -a stages=()
  if [[ -e $final || -L $final ]]; then
    load_volume2_plan_manifest "$final" "$plan_sha"
    "$SYNC" -f -- "$final" || fail 'cannot fsync replayed volume2 plan'
    "$SYNC" -f -- "$VOLUME2_PLAN_DIRECTORY" || fail 'cannot fsync replayed volume2 plan directory'
    return 0
  fi
  stages=("$VOLUME2_PLAN_DIRECTORY/.volume2-plan.$plan_sha."*)
  ((${#stages[@]} <= 1)) || fail 'multiple same-SHA volume2 plan stages are conflicting'
  if ((${#stages[@]} == 1)); then
    stage=${stages[0]}; validate_volume2_plan_file_mode "$stage"; validate_volume2_plan_schema "$stage"
    actual=$(volume2_manifest_sha256 "$stage") || fail 'cannot hash recovered volume2 plan stage'
    [[ $actual == "$plan_sha" ]] || fail 'partial or conflicting volume2 plan stage was rejected'
    AUDIT_TMP=$stage
  else
    generated_at=$("$DATE" -u +'%Y-%m-%dT%H:%M:%S.%3NZ')
    AUDIT_TMP=$("$MKTEMP" "$VOLUME2_PLAN_DIRECTORY/.volume2-plan.$plan_sha.XXXXXX") ||
      fail 'cannot create volume2 plan staging file'
    [[ -f $AUDIT_TMP && ! -L $AUDIT_TMP && ${AUDIT_TMP%/*} == "$VOLUME2_PLAN_DIRECTORY" ]] ||
      fail 'volume2 plan staging file is unsafe'
    "$VOLUME2_PLAN_CHMOD" 0600 -- "$AUDIT_TMP" || fail 'cannot set volume2 plan staging mode'
    write_volume2_plan_manifest "$AUDIT_TMP" "$plan_sha" "$generated_at"
    validate_volume2_plan_file_mode "$AUDIT_TMP"; validate_volume2_plan_schema "$AUDIT_TMP"
    [[ $(volume2_manifest_sha256 "$AUDIT_TMP") == "$plan_sha" ]] ||
      fail 'staged volume2 plan digest conflicts with its content'
    "$SYNC" -f -- "$AUDIT_TMP" || fail 'cannot fsync staged volume2 plan'
  fi
  janitor_test_checkpoint volume2-plan-before-rename
  [[ ! -e $final && ! -L $final ]] || fail 'conflicting same-SHA volume2 plan appeared before publication'
  "$MV" -n -- "$AUDIT_TMP" "$final" || fail 'cannot atomically publish volume2 plan'
  [[ ! -e $AUDIT_TMP && ! -L $AUDIT_TMP ]] ||
    fail 'conflicting same-SHA volume2 plan won the publication race'
  AUDIT_TMP=
  janitor_test_checkpoint volume2-plan-after-rename
  "$SYNC" -f -- "$final" || fail 'cannot fsync published volume2 plan'
  janitor_test_checkpoint volume2-plan-after-final-fsync
  "$SYNC" -f -- "$VOLUME2_PLAN_DIRECTORY" || fail 'cannot fsync volume2 plan directory'
  load_volume2_plan_manifest "$final" "$plan_sha"
}

bind_loaded_volume2_plan() {
  local ledger_id index id record current_count=0; declare -A current=()
  for ledger_id in "${!bound_volume2_ledgers[@]}"; do
    record=$(printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s' "$ledger_id" \
      "$LEDGER_ITEMS/$ledger_id.json" "${ledger_item_hash_by_id[$ledger_id]:-}" \
      "${ledger_status_path_by_id[$ledger_id]:--}" "${ledger_status_hash_by_id[$ledger_id]:--}" \
      "${ledger_patch_hash_by_id[$ledger_id]:--}" "${ledger_numstat_hash_by_id[$ledger_id]:--}" \
      "${ledger_workspace_by_id[$ledger_id]:-}")
    [[ $record == "${bound_volume2_ledgers[$ledger_id]}" ]] ||
      fail "persisted volume2 plan ledger binding changed: $ledger_id"
  done
  for index in "${!plan_targets[@]}"; do
    [[ ${plan_kinds[$index]} == volume2-direct || ${plan_kinds[$index]} == volume2-nested ]] || continue
    id=${plan_ledgers[$index]}; record=$(volume2_candidate_record "$index"); record=${record%$'\t'}
    [[ ${bound_volume2_candidates[$id]:-} == "$record" ]] ||
      fail "persisted volume2 plan candidate binding changed or is absent: $id"
    current["$id"]=1; current_count=$((current_count + 1))
  done
  for id in "${!bound_volume2_candidates[@]}"; do
    [[ -n ${current[$id]:-} ]] && continue
    [[ $VOLUME2_RECEIPT_RECOVERY == 1 && ${volume2_receipt_plan[$id]:-} == "$EXPECTED_PLAN_SHA256" &&
      -n ${volume2_receipt_removed[$id]:-} ]] ||
      fail "persisted volume2 plan candidate disappeared without a completed receipt: $id"
  done
  ((current_count <= VOLUME2_BOUND_CANDIDATES)) || fail 'persisted volume2 plan candidate count expanded'
}

load_bound_volume2_apply_plan() {
  local row id kind target target_identity mount_identity parent_identity item item_sha
  local status_path status_sha patch_path patch_sha numstat_path numstat_sha registry registry_sha
  local registration_sha bytes inodes integrated job receipt_id; declare -A seen_targets=() seen_ids=()
  while IFS= read -r row; do
    [[ -n $row ]] || continue
    IFS=$'\x1f' read -r id kind target target_identity mount_identity parent_identity item item_sha \
      status_path status_sha patch_path patch_sha numstat_path numstat_sha registry registry_sha \
      registration_sha bytes inodes integrated <<<"$row"
    [[ -z ${seen_ids[$id]:-} && -z ${seen_targets[$target]:-} ]] ||
      fail "persisted volume2 plan has duplicate candidate identity: $id"
    job=$("$JQ" -er '.jobId | select(type == "string")' "$item") ||
      fail "cannot read manifest-bound volume2 job: $id"
    [[ $job == social-monitor-* && $id == "$job--"* &&
      ( $target == "$WORKTREES/.volume2/$job" || $target == "$WORKTREES/.volume2/$job/worktree" ) ]] ||
      fail "persisted volume2 candidate is not exactly job-bound: $id"
    register_volume2_workspace "$kind" "$target" "$job"
    seen_ids["$id"]=1; seen_targets["$target"]=1
    plan_items+=("$item"); plan_jobs+=("$job"); plan_ledgers+=("$id")
    plan_workspaces+=("$target"); plan_targets+=("$target"); plan_bytes+=("$bytes")
    plan_target_inodes+=("$inodes"); plan_link_inodes+=(0); plan_kinds+=("$kind")
    plan_item_hashes+=("$item_sha"); plan_status_files+=("$status_path"); plan_status_hashes+=("$status_sha")
    plan_patch_files+=("$patch_path"); plan_patch_hashes+=("$patch_sha")
    plan_numstat_files+=("$numstat_path"); plan_numstat_hashes+=("$numstat_sha")
    plan_logical_identities+=(-); plan_target_identities+=("$target_identity")
    plan_registry_paths+=("$registry"); plan_registry_hashes+=("$registry_sha")
    plan_git_registration_hashes+=("$registration_sha"); plan_integrated_commits+=("$integrated")
    plan_volume2_parent_identities+=("$parent_identity"); plan_volume2_mount_identities+=("$mount_identity")
  done < <("$JQ" -r -j '.candidates[] | [.ledgerId,.candidateKind,.targetWorktreePath,
    .targetIdentity,.volumeMountIdentity,.nestedParentIdentity,.ledgerItemPath,.ledgerItemSha256,
    .statusEvidencePath,.statusEvidenceSha256,.patchEvidencePath,.patchEvidenceSha256,
    .numstatEvidencePath,.numstatEvidenceSha256,.registryPath,.registrySha256,
    .gitRegistrationSha256,(.beforeBytes|tostring),(.targetInodes|tostring),.integratedCommitSha] |
    join("\u001f") + "\n"' "$VOLUME2_BOUND_PLAN_PATH")
  ((${#plan_targets[@]} == VOLUME2_BOUND_CANDIDATES)) ||
    fail 'persisted volume2 candidate count changed while loading'
  for receipt_id in "${!volume2_receipt_plan[@]}"; do
    [[ ${volume2_receipt_plan[$receipt_id]} != "$EXPECTED_PLAN_SHA256" ||
      -n ${seen_ids[$receipt_id]:-} ]] ||
      fail "volume2 receipt names a candidate absent from its exact plan: $receipt_id"
  done
  VOLUME2_PLAN_SHA256=$VOLUME2_BOUND_PLAN_SHA256
  eligible=$VOLUME2_BOUND_CANDIDATES total_apparent_bytes=$VOLUME2_BOUND_BYTES
  total_target_inodes=$VOLUME2_BOUND_TARGET_INODES total_logical_symlink_inodes=$VOLUME2_BOUND_LOGICAL_INODES
}

complete_consumed_worktree_janitor() {
  local index total_inodes relocated_plan_candidates=0 summary_fd=1
  if [[ $MODE != apply-volume2 ]]; then
    RELOCATED_PLAN_SHA256=$(compute_relocated_plan_sha256) || fail 'cannot compute deterministic relocated plan digest'
    VOLUME2_PLAN_SHA256=$(compute_volume2_plan_sha256) || fail 'cannot compute deterministic volume2 plan digest'
  fi
  for index in "${!plan_targets[@]}"; do
    [[ ${plan_kinds[$index]} == relocated ]] && relocated_plan_candidates=$((relocated_plan_candidates + 1))
  done
  if [[ $MODE == apply-relocated && $EXPECTED_PLAN_SHA256 != "$RELOCATED_PLAN_SHA256" &&
    $RELOCATED_RECEIPT_RECOVERY == 0 ]]; then
    fail "relocated plan mismatch expected=$EXPECTED_PLAN_SHA256 actual=$RELOCATED_PLAN_SHA256"
  fi
  if [[ $MODE == dry-run-volume2 ]]; then
    publish_volume2_plan_manifest "$VOLUME2_PLAN_SHA256"
    summary_fd=$VOLUME2_SAVED_STDOUT
  fi
  if [[ $MODE != dry-run-volume2 && $MODE != apply-volume2 ]]; then
    printf 'relocated-plan schemaVersion=2 sha256=%s candidates=%s main=%s\n' \
      "$RELOCATED_PLAN_SHA256" "$relocated_plan_candidates" "$MAIN_COMMIT"
  fi
  if [[ $MODE == dry-run-volume2 || $MODE == apply-volume2 ]]; then
    printf 'volume2-plan schemaVersion=1 sha256=%s candidates=%s main=%s apparentBytes=%s targetInodes=%s totalInodes=%s manifest=%s\n' \
      "$VOLUME2_BOUND_PLAN_SHA256" "$VOLUME2_BOUND_CANDIDATES" "$MAIN_COMMIT" \
      "$VOLUME2_BOUND_BYTES" "$VOLUME2_BOUND_TARGET_INODES" "$VOLUME2_BOUND_TOTAL_INODES" \
      "$VOLUME2_BOUND_PLAN_PATH" >&"$summary_fd"
  else
    printf 'volume2-plan schemaVersion=1 sha256=%s candidates=%s main=%s\n' \
      "$VOLUME2_PLAN_SHA256" "$(count_volume2_plan_candidates)" "$MAIN_COMMIT"
  fi
  removed=0
  if [[ $MODE == dry-run ]]; then
    for index in "${!plan_targets[@]}"; do
      total_inodes=$((plan_target_inodes[index] + plan_link_inodes[index]))
      printf 'would-remove ledger=%s worktree=%s target=%s beforeBytes=%s apparentBytes=%s targetInodes=%s logicalSymlinkInodes=%s totalInodes=%s afterBytes=0\n' \
        "${plan_ledgers[$index]}" "${plan_workspaces[$index]}" "${plan_targets[$index]}" \
        "${plan_bytes[$index]}" "${plan_bytes[$index]}" "${plan_target_inodes[$index]}" \
        "${plan_link_inodes[$index]}" "$total_inodes"
    done
  elif [[ $MODE == apply ]]; then apply_ordinary_plan
  elif [[ $MODE == apply-volume2 ]]; then apply_volume2_plan
  elif [[ $MODE == apply-relocated ]]; then apply_relocated_plan
  fi
  printf 'consumed-worktree-janitor mode=%s eligible=%s removed=%s replayed=%s excluded=%s apparentBytes=%s targetInodes=%s logicalSymlinkInodes=%s totalInodes=%s\n' \
    "$MODE" "$eligible" "$removed" "$replayed" "$excluded" "$total_apparent_bytes" \
    "$total_target_inodes" "$total_logical_symlink_inodes" \
    "$((total_target_inodes + total_logical_symlink_inodes))" >&"$summary_fd"
}
