#!/usr/bin/env bash

# Canonical transition authorization and inert Git-object construction.
# Callers provide REPO, fail(), and the context constants initialized by their
# trusted entrypoint. Candidate commits are inspected only as Git objects.

PRODUCTION_TRANSITION_CANONICAL_VERSION=\
social-monitor-production-transition-canonical-review-v2
PRODUCTION_TRANSITION_PAYLOAD_VERSION=\
social-monitor-production-transition-inert-p6-v2
PRODUCTION_TRANSITION_TARGET_VERSION=\
social-monitor-production-transition-target-v2
PRODUCTION_TRANSITION_REPOSITORY_ID=777genius/social-monitor
PRODUCTION_TRANSITION_AUDIENCE=production-deploy
PRODUCTION_TRANSITION_SIGNATURE_NAMESPACE=git
PRODUCTION_TRANSITION_LEASE_REF=refs/heads/main
PRODUCTION_TRANSITION_WORKFLOW_REF=\
777genius/social-monitor/.github/workflows/production-transition-review.yml@refs/heads/main
PRODUCTION_TRANSITION_PUBLISH_WORKFLOW_REF=\
777genius/social-monitor/.github/workflows/production-transition-publish.yml@refs/heads/main
PRODUCTION_TRANSITION_REVIEW_PRODUCER=production-transition-reviewer
PRODUCTION_TRANSITION_MANIFEST_SERIALIZATION=git-changed-destination-tombstone-v2
PRODUCTION_TRANSITION_CONTRACT_PATH=ops/deploy/production-transition-bridge.manifest
PRODUCTION_TRANSITION_PROTECTED_MANIFEST_PATH=\
ops/deploy/production-transition-protected.manifest
PRODUCTION_TRANSITION_PROTECTED_MANIFEST_VERSION=\
social-monitor-production-transition-protected-paths-v1
PRODUCTION_TRANSITION_REVIEW_STATEMENT_PATH=\
ops/deploy/production-transition-review.statement
PRODUCTION_TRANSITION_REVIEW_SIGNATURE_PATH=\
ops/deploy/production-transition-review.statement.sig
PRODUCTION_TRANSITION_REVIEW_ANCHOR_PATH=\
ops/deploy/production-transition-review.anchor
PRODUCTION_TRANSITION_REVIEW_SIGNERS_PATH=\
ops/deploy/production-transition-review.allowed_signers
PRODUCTION_TRANSITION_TARGET_ANCHOR_PATH=\
ops/deploy/production-transition-target.anchor
PRODUCTION_TRANSITION_TARGET_SIGNERS_PATH=\
ops/deploy/production-transition-target.allowed_signers
PRODUCTION_TRANSITION_REVIEW_PRINCIPAL=production-transition-review
PRODUCTION_TRANSITION_TARGET_PRINCIPAL=production-transition-target
PRODUCTION_TRANSITION_REVIEW_FINGERPRINT=\
SHA256:RQ/JZlrtmTgY4lNHhyzQnxI4IjQZ47Xt/Pu00ppuUaA
PRODUCTION_TRANSITION_TARGET_FINGERPRINT=\
SHA256:qVOLECole+i4fHxRbDvz5kw+f0J5l2jVHi795GeCAT0

production_transition_git() {
  GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 \
    /usr/bin/git -c protocol.version=2 "$@"
}

production_transition_sha256_file() {
  /usr/bin/sha256sum "$1" | /usr/bin/awk '{print $1}'
}

production_transition_private_key_fingerprint() (
  local key=$1 public=''
  cleanup() { [[ -z $public ]] || /usr/bin/rm -f -- "$public"; }
  trap cleanup EXIT
  public=$(/usr/bin/mktemp "${TMPDIR:-/tmp}/transition-public-key.XXXXXX")
  /usr/bin/ssh-keygen -y -f "$key" > "$public" 2>/dev/null || \
    fail 'transition signing key is invalid'
  /usr/bin/ssh-keygen -lf "$public" -E sha256 2>/dev/null | \
    /usr/bin/awk 'NR == 1 {print $2}'
)

production_transition_validate_sha() {
  [[ ${1:-} =~ ^[0-9a-f]{40}$ ]] || fail "$2 must be a full lowercase SHA"
}

production_transition_validate_id() {
  [[ ${1:-} =~ ^[A-Za-z0-9._:-]{1,128}$ ]] || fail "$2 is malformed"
}

production_transition_exact_entry() {
  local commit=$1 path=$2 label=$3 entry mode type object actual extra
  entry=$(production_transition_git -C "$REPO" ls-tree "$commit" -- "$path" \
    2>/dev/null) || fail "$label cannot be inspected"
  read -r mode type object actual extra <<< "$entry"
  [[ -z ${extra:-} && ($mode == 100644 || $mode == 100755) && \
     $type == blob && $object =~ ^[0-9a-f]{40}$ && $actual == "$path" ]] || \
    fail "$label is missing or is not an exact regular blob"
  printf '%s\n' "$entry"
}

production_transition_copy_blob() {
  local commit=$1 path=$2 destination=$3 label=$4 entry object
  entry=$(production_transition_exact_entry "$commit" "$path" "$label")
  object=$(printf '%s\n' "$entry" | /usr/bin/awk '{print $3}')
  production_transition_git -C "$REPO" cat-file blob "$object" > "$destination" || \
    fail "$label cannot be materialized"
  [[ $(production_transition_git -C "$REPO" hash-object --no-filters \
      "$destination") == "$object" ]] || fail "$label changed while materialized"
}

production_transition_protected_manifest() {
  local b0=$1 manifest first previous= spec mode path
  manifest=$(production_transition_git -C "$REPO" show \
    "$b0:$PRODUCTION_TRANSITION_PROTECTED_MANIFEST_PATH" 2>/dev/null) || \
    fail 'protected path manifest is unavailable at B0'
  IFS= read -r first <<< "$manifest"
  [[ $first == "version=$PRODUCTION_TRANSITION_PROTECTED_MANIFEST_VERSION" ]] || \
    fail 'protected path manifest version differs'
  while IFS= read -r spec; do
    [[ -n $spec ]] || fail 'protected path manifest contains an empty row'
    mode=${spec%%:*}; path=${spec#*:}
    [[ $mode =~ ^100(644|755)$ && $path != "$spec" && \
       $path =~ ^[A-Za-z0-9._/-]+$ && $path != /* && $path != ../* && \
       $path != *'/../'* ]] || fail 'protected path manifest row is malformed'
    [[ -z $previous || $previous < "$path" ]] || \
      fail 'protected path manifest is not unique and path-sorted'
    previous=$path
    printf '%s\n' "$spec"
  done < <(/usr/bin/tail -n +2 <<< "$manifest")
}

production_transition_protected_paths() {
  local b0=$1 spec
  while IFS= read -r spec; do
    printf '%s\n' "${spec#*:}"
  done < <(production_transition_protected_manifest "$b0")
}

production_transition_verify_trust_and_protected_blobs() {
  local b0=$1 s2=${2:-} path spec mode exact candidate review_anchor target_anchor
  production_transition_validate_sha "$PRODUCTION_TRANSITION_ANCHOR_BASE" A0
  production_transition_validate_sha "$b0" B0
  production_transition_git -C "$REPO" merge-base --is-ancestor \
    "$PRODUCTION_TRANSITION_ANCHOR_BASE" "$b0" || fail 'B0 does not descend from A0'
  for path in "$PRODUCTION_TRANSITION_REVIEW_ANCHOR_PATH" \
      "$PRODUCTION_TRANSITION_REVIEW_SIGNERS_PATH"; do
    exact=$(production_transition_exact_entry "$PRODUCTION_TRANSITION_ANCHOR_BASE" \
      "$path" "A0 review trust blob $path")
    [[ $(production_transition_exact_entry "$b0" "$path" \
      "B0 review trust blob $path") == "$exact" ]] || \
      fail "B0 changed A0 review trust blob $path"
  done
  for path in "$PRODUCTION_TRANSITION_TARGET_ANCHOR_PATH" \
      "$PRODUCTION_TRANSITION_TARGET_SIGNERS_PATH"; do
    production_transition_exact_entry "$b0" "$path" \
      "B0 target trust blob $path" >/dev/null
  done
  review_anchor=$(production_transition_git -C "$REPO" show \
    "$PRODUCTION_TRANSITION_ANCHOR_BASE:$PRODUCTION_TRANSITION_REVIEW_ANCHOR_PATH")
  [[ $review_anchor == "$(printf '%s\n' \
      'version=social-monitor-production-transition-review-anchor-v1' \
      "anchor-path=$PRODUCTION_TRANSITION_REVIEW_ANCHOR_PATH" \
      "allowed-signers-path=$PRODUCTION_TRANSITION_REVIEW_SIGNERS_PATH" \
      "principal=$PRODUCTION_TRANSITION_REVIEW_PRINCIPAL" 'namespace=git' \
      'key-type=ssh-ed25519' \
      "fingerprint=$PRODUCTION_TRANSITION_EFFECTIVE_REVIEW_FINGERPRINT")" ]] || \
    fail 'review public anchor differs from compiled authority'
  target_anchor=$(production_transition_git -C "$REPO" show \
    "$b0:$PRODUCTION_TRANSITION_TARGET_ANCHOR_PATH")
  [[ $target_anchor == "$(printf '%s\n' \
      'version=social-monitor-production-transition-target-anchor-v1' \
      "anchor-path=$PRODUCTION_TRANSITION_TARGET_ANCHOR_PATH" \
      "allowed-signers-path=$PRODUCTION_TRANSITION_TARGET_SIGNERS_PATH" \
      "principal=$PRODUCTION_TRANSITION_TARGET_PRINCIPAL" 'namespace=git' \
      'key-type=ssh-ed25519' \
      "fingerprint=$PRODUCTION_TRANSITION_EFFECTIVE_TARGET_FINGERPRINT")" ]] || \
    fail 'target public anchor differs from compiled authority'
  [[ $PRODUCTION_TRANSITION_EFFECTIVE_REVIEW_FINGERPRINT != \
     "$PRODUCTION_TRANSITION_EFFECTIVE_TARGET_FINGERPRINT" ]] || \
    fail 'review and target signing authorities must be distinct'
  [[ -z $s2 ]] && return 0
  for path in "$PRODUCTION_TRANSITION_REVIEW_ANCHOR_PATH" \
      "$PRODUCTION_TRANSITION_REVIEW_SIGNERS_PATH" \
      "$PRODUCTION_TRANSITION_TARGET_ANCHOR_PATH" \
      "$PRODUCTION_TRANSITION_TARGET_SIGNERS_PATH"; do
    exact=$(production_transition_exact_entry "$b0" "$path" "B0 trust blob $path")
    candidate=$(production_transition_exact_entry "$s2" "$path" "S2 trust blob $path")
    [[ $candidate == "$exact" ]] || fail "S2 changed protected trust blob $path"
  done
  while IFS= read -r spec; do
    mode=${spec%%:*}; path=${spec#*:}
    exact=$(production_transition_exact_entry "$b0" "$path" "protected B0 blob $path")
    [[ ${exact%% *} == "$mode" ]] || fail "protected B0 mode differs: $path"
    candidate=$(production_transition_exact_entry "$s2" "$path" "protected S2 blob $path")
    [[ $candidate == "$exact" ]] || fail "S2 changed protected B0 blob $path"
  done < <(production_transition_protected_manifest "$b0")
}

production_transition_s2_manifest() {
  local b0=$1 s2=$2 path entry b0_entry
  local -a parents=() paths=() rows=()
  production_transition_validate_sha "$s2" S2
  read -r -a parents <<< "$(production_transition_git -C "$REPO" \
    rev-list --parents -n 1 "$s2" 2>/dev/null)"
  [[ ${#parents[@]} == 2 && ${parents[0]} == "$s2" && \
     ${parents[1]} == "$b0" ]] || fail 'S2 is not the sole child of exact B0'
  production_transition_verify_trust_and_protected_blobs "$b0" "$s2"
  mapfile -d '' -t paths < <(production_transition_git -C "$REPO" diff \
    --name-only --no-renames -z "$b0" "$s2" -- | LC_ALL=C /usr/bin/sort -zu)
  ((${#paths[@]} > 0)) || fail 'S2 canonical manifest is empty'
  for path in "${paths[@]}"; do
    [[ $path =~ ^[A-Za-z0-9._/-]+$ && $path != /* && $path != ../* && \
       $path != *'/../'* && $path != "$PRODUCTION_TRANSITION_CONTRACT_PATH" && \
       $path != "$PRODUCTION_TRANSITION_REVIEW_STATEMENT_PATH" && \
       $path != "$PRODUCTION_TRANSITION_REVIEW_SIGNATURE_PATH" ]] || \
      fail 'S2 canonical manifest contains an unsafe or reserved path'
    entry=$(production_transition_git -C "$REPO" ls-tree "$s2" -- "$path") || \
      fail 'S2 manifest destination cannot be inspected'
    if [[ -n $entry ]]; then
      entry=$(production_transition_exact_entry "$s2" "$path" \
        'S2 manifest destination')
      rows+=("destination $entry")
    else
      b0_entry=$(production_transition_exact_entry "$b0" "$path" \
        'S2 tombstone source')
      rows+=("tombstone $b0_entry")
    fi
  done
  printf '%s\n' "${rows[@]}"
}

production_transition_payload_contract() {
  local b0=$1 s2=$2 tree=$3 run_id=$4 transition_id=$5 replay_id=$6
  local manifest=$7 count digest
  count=$(printf '%s\n' "$manifest" | /usr/bin/wc -l)
  digest=$(printf '%s\n' "$manifest" | /usr/bin/sha256sum | /usr/bin/awk '{print $1}')
  printf '%s\n' \
    "version=$PRODUCTION_TRANSITION_PAYLOAD_VERSION" \
    "repository=$PRODUCTION_TRANSITION_REPOSITORY_ID" "b0=$b0" "s2=$s2" \
    "s2-tree=$tree" "run-id=$run_id" \
    "workflow-ref=$PRODUCTION_TRANSITION_WORKFLOW_REF" \
    "workflow-head=$b0" "producer=$PRODUCTION_TRANSITION_REVIEW_PRODUCER" \
    "transition-id=$transition_id" "audience=$PRODUCTION_TRANSITION_AUDIENCE" \
    "signature-namespace=$PRODUCTION_TRANSITION_SIGNATURE_NAMESPACE" \
    "replay-id=$replay_id" "lease-ref=$PRODUCTION_TRANSITION_LEASE_REF" \
    "lease-main=$b0" \
    "manifest-serialization=$PRODUCTION_TRANSITION_MANIFEST_SERIALIZATION" \
    "manifest-count=$count" "manifest-sha256=$digest" "$manifest"
}

production_transition_build_p6() (
  local b0=$1 s2=$2 run_id=$3 transition_id=$4 replay_id=$5
  local tree manifest contract='' index='' blob payload_tree message p6
  cleanup() { [[ -z $contract ]] || /usr/bin/rm -f -- "$contract"; \
    [[ -z $index ]] || /usr/bin/rm -f -- "$index"; }
  trap cleanup EXIT
  tree=$(production_transition_git -C "$REPO" rev-parse "$s2^{tree}") || \
    fail 'S2 tree cannot be read'
  manifest=$(production_transition_s2_manifest "$b0" "$s2")
  contract=$(/usr/bin/mktemp "${TMPDIR:-/tmp}/transition-contract.XXXXXX")
  index=$(/usr/bin/mktemp "${TMPDIR:-/tmp}/transition-index.XXXXXX")
  /usr/bin/rm -f -- "$index"
  production_transition_payload_contract "$b0" "$s2" "$tree" "$run_id" \
    "$transition_id" "$replay_id" "$manifest" > "$contract"
  blob=$(production_transition_git -C "$REPO" hash-object -w "$contract")
  GIT_INDEX_FILE=$index production_transition_git -C "$REPO" read-tree "$tree"
  GIT_INDEX_FILE=$index production_transition_git -C "$REPO" update-index \
    --add --cacheinfo "100644,$blob,$PRODUCTION_TRANSITION_CONTRACT_PATH"
  payload_tree=$(GIT_INDEX_FILE=$index production_transition_git -C "$REPO" write-tree)
  message=$(printf '%s\n' 'Social Monitor inert production transition P6' '' \
    "$(/usr/bin/head -n 15 "$contract")")
  p6=$(printf '%s\n' "$message" | production_transition_git -C "$REPO" \
    commit-tree "$payload_tree" -p "$b0") || fail 'inert P6 could not be constructed'
  printf '%s\n' "$p6"
)

production_transition_review_prefix() {
  local b0=$1 s2=$2 p6=$3 run_id=$4 transition_id=$5 replay_id=$6
  local issued=$7 expires=$8 s2_tree p6_tree manifest count digest contract_digest
  s2_tree=$(production_transition_git -C "$REPO" rev-parse "$s2^{tree}")
  p6_tree=$(production_transition_git -C "$REPO" rev-parse "$p6^{tree}")
  manifest=$(production_transition_s2_manifest "$b0" "$s2")
  count=$(printf '%s\n' "$manifest" | /usr/bin/wc -l)
  digest=$(printf '%s\n' "$manifest" | /usr/bin/sha256sum | /usr/bin/awk '{print $1}')
  contract_digest=$(production_transition_git -C "$REPO" show \
    "$p6:$PRODUCTION_TRANSITION_CONTRACT_PATH" | /usr/bin/sha256sum | \
    /usr/bin/awk '{print $1}')
  printf '%s\n' \
    "version=$PRODUCTION_TRANSITION_CANONICAL_VERSION" \
    "repository=$PRODUCTION_TRANSITION_REPOSITORY_ID" "b0=$b0" "s2=$s2" \
    "s2-tree=$s2_tree" "p6=$p6" "p6-tree=$p6_tree" \
    'target-tree-policy=exact-review-overlay-v2' \
    "target-parent-1=$p6" "target-parent-2=$s2" \
    "run-id=$run_id" "workflow-ref=$PRODUCTION_TRANSITION_WORKFLOW_REF" \
    "workflow-head=$b0" "producer=$PRODUCTION_TRANSITION_REVIEW_PRODUCER" \
    "transition-id=$transition_id" "audience=$PRODUCTION_TRANSITION_AUDIENCE" \
    "signature-namespace=$PRODUCTION_TRANSITION_SIGNATURE_NAMESPACE" \
    "replay-id=$replay_id" "lease-ref=$PRODUCTION_TRANSITION_LEASE_REF" \
    "lease-main=$b0" \
    "manifest-serialization=$PRODUCTION_TRANSITION_MANIFEST_SERIALIZATION" \
    "manifest-count=$count" "manifest-sha256=$digest" \
    "p6-contract-sha256=$contract_digest" "issued-at=$issued" "expires-at=$expires"
}

production_transition_canonical_review() {
  local prefix review_id
  prefix=$(production_transition_review_prefix "$@")
  review_id=$(printf '%s\n' "$prefix" | /usr/bin/sha256sum | /usr/bin/awk '{print $1}')
  printf '%s\n' "$prefix" "review-id=$review_id"
}

production_transition_verify_p6() {
  local b0=$1 s2=$2 p6=$3 run_id=$4 transition_id=$5 replay_id=$6
  local expected_contract actual_contract tree manifest expected_message actual_message
  local -a parents=()
  read -r -a parents <<< "$(production_transition_git -C "$REPO" \
    rev-list --parents -n 1 "$p6" 2>/dev/null)"
  [[ ${#parents[@]} == 2 && ${parents[0]} == "$p6" && \
     ${parents[1]} == "$b0" ]] || fail 'P6 is not the sole child of exact B0'
  tree=$(production_transition_git -C "$REPO" rev-parse "$s2^{tree}")
  manifest=$(production_transition_s2_manifest "$b0" "$s2")
  expected_contract=$(production_transition_payload_contract "$b0" "$s2" "$tree" \
    "$run_id" "$transition_id" "$replay_id" "$manifest")
  actual_contract=$(production_transition_git -C "$REPO" show \
    "$p6:$PRODUCTION_TRANSITION_CONTRACT_PATH") || fail 'P6 contract is unavailable'
  [[ $actual_contract == "$expected_contract" ]] || fail 'P6 canonical contract differs'
  expected_message=$(printf '%s\n' 'Social Monitor inert production transition P6' '' \
    "$(printf '%s\n' "$expected_contract" | /usr/bin/head -n 15)")
  actual_message=$(production_transition_git -C "$REPO" show -s --format=%B "$p6")
  [[ $actual_message == "$expected_message" ]] || fail 'P6 canonical message differs'
  [[ $(production_transition_git -C "$REPO" diff --name-only --no-renames \
      "$s2" "$p6" --) == "$PRODUCTION_TRANSITION_CONTRACT_PATH" ]] || \
    fail 'P6 differs from S2 outside its inert contract'
}

production_transition_review_field() {
  local file=$1 name=$2
  /usr/bin/awk -F= -v key="$name" '$1 == key {print substr($0, length(key) + 2)}' "$file"
}

production_transition_verify_canonical_review() (
  local s2=$1 p6=$2 statement_source=$3 signature_source=$4 signers_source=$5
  local lifetime=${6:-fresh} statement='' signature='' signers='' expected output
  local b0 run_id transition_id replay_id issued expires review_id now fingerprint
  cleanup() { [[ -z $statement ]] || /usr/bin/rm -f -- "$statement"; \
    [[ -z $signature ]] || /usr/bin/rm -f -- "$signature"; \
    [[ -z $signers ]] || /usr/bin/rm -f -- "$signers"; }
  trap cleanup EXIT
  for source in "$statement_source" "$signature_source" "$signers_source"; do
    [[ -f $source && ! -L $source ]] || fail 'review evidence must be regular files'
  done
  statement=$(/usr/bin/mktemp "${TMPDIR:-/tmp}/transition-review.XXXXXX")
  signature=$(/usr/bin/mktemp "${TMPDIR:-/tmp}/transition-signature.XXXXXX")
  signers=$(/usr/bin/mktemp "${TMPDIR:-/tmp}/transition-signers.XXXXXX")
  /usr/bin/cp -- "$statement_source" "$statement"
  /usr/bin/cp -- "$signature_source" "$signature"
  /usr/bin/cp -- "$signers_source" "$signers"
  [[ $(/usr/bin/wc -l < "$statement") == 27 ]] || fail 'canonical review shape differs'
  b0=$(production_transition_review_field "$statement" b0)
  run_id=$(production_transition_review_field "$statement" run-id)
  transition_id=$(production_transition_review_field "$statement" transition-id)
  replay_id=$(production_transition_review_field "$statement" replay-id)
  issued=$(production_transition_review_field "$statement" issued-at)
  expires=$(production_transition_review_field "$statement" expires-at)
  review_id=$(production_transition_review_field "$statement" review-id)
  production_transition_validate_sha "$b0" B0
  production_transition_validate_id "$run_id" run-id
  production_transition_validate_id "$transition_id" transition-id
  [[ $replay_id =~ ^[A-Za-z0-9._:-]{16,128}$ ]] || fail 'replay-id is malformed'
  [[ $issued =~ ^[0-9]+$ && $expires =~ ^[0-9]+$ && \
     $review_id =~ ^[0-9a-f]{64}$ ]] || fail 'canonical review lifetime or id is malformed'
  production_transition_verify_p6 "$b0" "$s2" "$p6" "$run_id" \
    "$transition_id" "$replay_id"
  expected=$(production_transition_canonical_review "$b0" "$s2" "$p6" \
    "$run_id" "$transition_id" "$replay_id" "$issued" "$expires")
  [[ $(<"$statement") == "$expected" ]] || \
    fail 'canonical review has missing, extra, reordered, or unbound fields'
  fingerprint=$(/usr/bin/awk '{print $3,$4}' "$signers" | \
    /usr/bin/ssh-keygen -lf - -E sha256 2>/dev/null | /usr/bin/awk '{print $2}')
  [[ $fingerprint == "$PRODUCTION_TRANSITION_EFFECTIVE_REVIEW_FINGERPRINT" && \
     $(/usr/bin/wc -l < "$signers") == 1 ]] || fail 'review signer authority differs'
  output=$(/usr/bin/ssh-keygen -Y verify -f "$signers" \
    -I "$PRODUCTION_TRANSITION_REVIEW_PRINCIPAL" -n git -s "$signature" \
    < "$statement" 2>&1) || fail 'canonical review signature is invalid'
  /usr/bin/grep -F "Good \"git\" signature for $PRODUCTION_TRANSITION_REVIEW_PRINCIPAL" \
    <<< "$output" >/dev/null || fail 'canonical review principal differs'
  now=${PRODUCTION_TRANSITION_EFFECTIVE_NOW_EPOCH:-$(/usr/bin/date +%s)}
  [[ $now =~ ^[0-9]+$ && $issued -le $expires && $((expires - issued)) -le 604800 ]] || \
    fail 'canonical review lifetime is invalid'
  [[ $lifetime == allow-expired || ($lifetime == fresh && $issued -le $now && \
     $now -le $expires) ]] || fail 'canonical review is stale'
  printf '%s\n' \
    "statement-sha256=$(production_transition_sha256_file "$statement")" \
    "signature-sha256=$(production_transition_sha256_file "$signature")" \
    "review-id=$review_id" "review-repository=$PRODUCTION_TRANSITION_REPOSITORY_ID" \
    "review-b0=$b0" "review-s2=$s2" "review-p6=$p6" \
    "review-run-id=$run_id" "review-workflow-ref=$PRODUCTION_TRANSITION_WORKFLOW_REF" \
    "review-workflow-head=$b0" "review-producer=$PRODUCTION_TRANSITION_REVIEW_PRODUCER" \
    "review-transition-id=$transition_id" "review-audience=$PRODUCTION_TRANSITION_AUDIENCE" \
    'review-signature-namespace=git' "review-replay-id=$replay_id" \
    "review-lease-ref=$PRODUCTION_TRANSITION_LEASE_REF" "review-lease-main=$b0" \
    "review-issued-at=$issued" "review-expires-at=$expires" \
    "review-signer-principal=$PRODUCTION_TRANSITION_REVIEW_PRINCIPAL" \
    "review-signer-fingerprint=$fingerprint"
)

production_transition_target_message() {
  local b0=$1 s2=$2 p6=$3 tree=$4 statement_digest=$5 signature_digest=$6
  local review_id=$7 run_id=$8 transition_id=$9 replay_id=${10}
  printf '%s\n' 'Social Monitor authenticated production transition T' '' \
    "version=$PRODUCTION_TRANSITION_TARGET_VERSION" \
    "repository=$PRODUCTION_TRANSITION_REPOSITORY_ID" "b0=$b0" "s2=$s2" \
    "p6=$p6" "target-tree=$tree" "target-parent-1=$p6" "target-parent-2=$s2" \
    "run-id=$run_id" "workflow-ref=$PRODUCTION_TRANSITION_WORKFLOW_REF" \
    "workflow-head=$b0" "producer=$PRODUCTION_TRANSITION_REVIEW_PRODUCER" \
    "transition-id=$transition_id" "audience=$PRODUCTION_TRANSITION_AUDIENCE" \
    'signature-namespace=git' "replay-id=$replay_id" \
    "lease-ref=$PRODUCTION_TRANSITION_LEASE_REF" "lease-main=$b0" \
    "review-id=$review_id" "review-statement-sha256=$statement_digest" \
    "review-signature-sha256=$signature_digest"
}

production_transition_build_target_tree() (
  local p6=$1 statement=$2 signature=$3 index='' statement_blob signature_blob
  cleanup() { [[ -z $index ]] || /usr/bin/rm -f -- "$index"; }
  trap cleanup EXIT
  index=$(/usr/bin/mktemp "${TMPDIR:-/tmp}/transition-target-index.XXXXXX")
  /usr/bin/rm -f -- "$index"
  statement_blob=$(production_transition_git -C "$REPO" hash-object -w "$statement")
  signature_blob=$(production_transition_git -C "$REPO" hash-object -w "$signature")
  GIT_INDEX_FILE=$index production_transition_git -C "$REPO" read-tree "$p6^{tree}"
  GIT_INDEX_FILE=$index production_transition_git -C "$REPO" update-index \
    --add --cacheinfo \
    "100644,$statement_blob,$PRODUCTION_TRANSITION_REVIEW_STATEMENT_PATH"
  GIT_INDEX_FILE=$index production_transition_git -C "$REPO" update-index \
    --add --cacheinfo \
    "100644,$signature_blob,$PRODUCTION_TRANSITION_REVIEW_SIGNATURE_PATH"
  GIT_INDEX_FILE=$index production_transition_git -C "$REPO" write-tree
)

production_transition_materialize_review_from_target() {
  local target=$1 statement=$2 signature=$3
  production_transition_copy_blob "$target" \
    "$PRODUCTION_TRANSITION_REVIEW_STATEMENT_PATH" "$statement" \
    'target canonical review statement'
  production_transition_copy_blob "$target" \
    "$PRODUCTION_TRANSITION_REVIEW_SIGNATURE_PATH" "$signature" \
    'target canonical review signature'
}

production_transition_verify_target_authority() (
  local target=$1 b0=$2 signers_source=$3 expected_fingerprint=$4
  local signers='' fingerprint output
  cleanup() { [[ -z $signers ]] || /usr/bin/rm -f -- "$signers"; }
  trap cleanup EXIT
  [[ -f $signers_source && ! -L $signers_source ]] || \
    fail 'target public signer authority is unsafe'
  signers=$(/usr/bin/mktemp "${TMPDIR:-/tmp}/transition-target-signers.XXXXXX")
  /usr/bin/cp -- "$signers_source" "$signers"
  [[ $(/usr/bin/wc -l < "$signers") == 1 ]] || \
    fail 'target public signer authority must contain one signer'
  fingerprint=$(/usr/bin/awk '{print $3,$4}' "$signers" | \
    /usr/bin/ssh-keygen -lf - -E sha256 2>/dev/null | /usr/bin/awk '{print $2}')
  [[ $fingerprint == "$expected_fingerprint" ]] || fail 'target signer fingerprint differs'
  output=$(production_transition_git -C "$REPO" -c gpg.format=ssh \
    -c gpg.ssh.program=/usr/bin/ssh-keygen \
    -c gpg.ssh.allowedSignersFile="$signers" verify-commit --raw "$target" 2>&1) || \
    fail 'target Git SSH signature is invalid'
  /usr/bin/grep -F \
    "Good \"git\" signature for $PRODUCTION_TRANSITION_TARGET_PRINCIPAL with ED25519 key $expected_fingerprint" \
    <<< "$output" >/dev/null || fail 'target signing principal differs'
  production_transition_verify_trust_and_protected_blobs "$b0"
)

production_transition_verify_target_contract() (
  local target=$1 statement_source=${2:-} signature_source=${3:-}
  local lifetime=${4:-fresh} target_signers=$5 target_fingerprint=$6
  local statement='' signature='' review_signers='' verification
  local b0 s2 p6 tree expected_tree message expected_message
  local statement_digest signature_digest review_id run_id transition_id replay_id
  local -a parents=()
  cleanup() { [[ -z ${statement:-} ]] || /usr/bin/rm -f -- "$statement"; \
    [[ -z ${signature:-} ]] || /usr/bin/rm -f -- "$signature"; \
    [[ -z ${review_signers:-} ]] || /usr/bin/rm -f -- "$review_signers"; }
  trap cleanup EXIT
  production_transition_validate_sha "$target" T
  read -r -a parents <<< "$(production_transition_git -C "$REPO" \
    rev-list --parents -n 1 "$target" 2>/dev/null)"
  [[ ${#parents[@]} == 3 && ${parents[0]} == "$target" ]] || \
    fail 'T must have exact ordered P6 and S2 parents'
  p6=${parents[1]}; s2=${parents[2]}
  b0=$(production_transition_git -C "$REPO" rev-parse "$p6^1") || \
    fail 'T B0 lease cannot be inspected'
  statement=$(/usr/bin/mktemp "${TMPDIR:-/tmp}/transition-target-review.XXXXXX")
  signature=$(/usr/bin/mktemp "${TMPDIR:-/tmp}/transition-target-signature.XXXXXX")
  review_signers=$(/usr/bin/mktemp "${TMPDIR:-/tmp}/transition-review-signers.XXXXXX")
  production_transition_materialize_review_from_target "$target" "$statement" "$signature"
  if [[ -n $statement_source || -n $signature_source ]]; then
    [[ -f $statement_source && ! -L $statement_source && -f $signature_source && \
       ! -L $signature_source && \
       $(production_transition_sha256_file "$statement_source") == \
         $(production_transition_sha256_file "$statement") && \
       $(production_transition_sha256_file "$signature_source") == \
         $(production_transition_sha256_file "$signature") ]] || \
      fail 'supplied review evidence differs from exact T blobs'
  fi
  production_transition_copy_blob "$b0" "$PRODUCTION_TRANSITION_REVIEW_SIGNERS_PATH" \
    "$review_signers" 'B0 review signers'
  verification=$(production_transition_verify_canonical_review "$s2" "$p6" \
    "$statement" "$signature" "$review_signers" "$lifetime")
  review_id=$(/usr/bin/sed -n 's/^review-id=//p' <<< "$verification")
  run_id=$(/usr/bin/sed -n 's/^review-run-id=//p' <<< "$verification")
  transition_id=$(/usr/bin/sed -n 's/^review-transition-id=//p' <<< "$verification")
  replay_id=$(/usr/bin/sed -n 's/^review-replay-id=//p' <<< "$verification")
  statement_digest=$(production_transition_sha256_file "$statement")
  signature_digest=$(production_transition_sha256_file "$signature")
  tree=$(production_transition_git -C "$REPO" rev-parse "$target^{tree}")
  expected_tree=$(production_transition_build_target_tree "$p6" "$statement" "$signature")
  [[ $tree == "$expected_tree" ]] || fail 'T tree differs from exact review overlay'
  message=$(production_transition_git -C "$REPO" show -s --format=%B "$target")
  expected_message=$(production_transition_target_message "$b0" "$s2" "$p6" "$tree" \
    "$statement_digest" "$signature_digest" "$review_id" "$run_id" \
    "$transition_id" "$replay_id")
  [[ $message == "$expected_message" ]] || fail 'T canonical signed message differs'
  production_transition_verify_target_authority "$target" "$b0" "$target_signers" \
    "$target_fingerprint"
  printf '%s\n' "$verification" "s2=$s2" "p6=$p6" "t=$target" \
    "lease-current-main=$b0"
)
