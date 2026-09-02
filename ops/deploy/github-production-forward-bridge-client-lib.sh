#!/usr/bin/env bash

# Client-side mirror of the predecessor-owned production forward authority.
# No future B/R/H/F identity is embedded here: B is derived from F's graph.
PRODUCTION_FORWARD_LIVE_SHA=7c4070f0b9ef1aac130284bcffac50551e20a4dd
PRODUCTION_FORWARD_MAIN_SHA=c5dc5abb12aa1ac84ddbd12f141c6d4d8aca4de2
PRODUCTION_FORWARD_BACKEND_SHA=$PRODUCTION_FORWARD_LIVE_SHA
PRODUCTION_FORWARD_POOL_SHA=0be002ec1af2d1e0799f8507cb147a6f1406a428
PRODUCTION_FORWARD_MAX_FIRST_PARENT_COMMITS=256
# Reviewed immutable H-owned authority seal. This is a blob identity, not a
# generated B/R/W/H/F commit identity. The seal closes over every B authority
# blob before any one of those blobs can be loaded.
PRODUCTION_FORWARD_AUTHORITY_SEAL_BLOB=e43673f09addc516fc21d5bb5493bc618a88d2f9
PRODUCTION_FORWARD_AUTHORITY_SEAL_PATH=ops/deploy/production-forward-bridge-authority.blobs

production_forward_git() {
  GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 \
    git -C "${GITHUB_WORKSPACE:-.}" "$@"
}

production_forward_anchor_for_target() {
  local target=$1 current=$1 record parent hops=0
  local -a parents=()
  [[ $target =~ ^[0-9a-f]{40}$ ]] || return 1
  production_forward_git cat-file -e "$target^{commit}" 2>/dev/null || return 1
  while ((hops < PRODUCTION_FORWARD_MAX_FIRST_PARENT_COMMITS)); do
    record=$(production_forward_git rev-list --parents -n 1 "$current" 2>/dev/null) || return 1
    read -r -a parents <<< "$record"
    if [[ ${#parents[@]} == 3 && ${parents[1]} == "$PRODUCTION_FORWARD_MAIN_SHA" ]]; then
      local candidate_r candidate_record
      candidate_r=$(production_forward_git rev-parse "${parents[2]}^1^1" 2>/dev/null || true)
      candidate_record=$(production_forward_git rev-list --parents -n 1 \
        "$candidate_r" 2>/dev/null || true)
      if [[ $candidate_record == "$candidate_r $PRODUCTION_FORWARD_MAIN_SHA "* ]]; then
        printf '%s\n' "$current"
        return 0
      fi
    fi
    parent=$(production_forward_git rev-parse "$current^1" 2>/dev/null) || return 1
    current=$parent
    ((hops += 1))
  done
  # Exact H is reviewed directly in PR CI before GitHub creates F=[M,H].
  # Its H-W-R-[M,B]-P shape is the only non-F anchor accepted here.
  local h=$target w r b p
  h=$target
  w=$(production_forward_git rev-parse "$h^1" 2>/dev/null) || return 1
  [[ $(production_forward_git rev-list --parents -n 1 "$h" | wc -w) == 2 ]] || return 1
  r=$(production_forward_git rev-parse "$w^1" 2>/dev/null) || return 1
  [[ $(production_forward_git rev-list --parents -n 1 "$w" | wc -w) == 2 ]] || return 1
  record=$(production_forward_git rev-list --parents -n 1 "$r" 2>/dev/null) || return 1
  read -r -a parents <<< "$record"
  [[ ${#parents[@]} == 3 && ${parents[1]} == "$PRODUCTION_FORWARD_MAIN_SHA" ]] || return 1
  b=${parents[2]}
  p=$(production_forward_git rev-parse "$b^1" 2>/dev/null) || return 1
  [[ $(production_forward_git rev-list --parents -n 1 "$b" | wc -w) == 2 && \
     $p == "$PRODUCTION_FORWARD_LIVE_SHA" ]] || return 1
  printf '%s\n' "$h"
}

production_forward_first_parent_interval_contains() {
  local anchor=$1 target=$2 marker=$3 current=$2 parent hops=0
  [[ $anchor =~ ^[0-9a-f]{40}$ && $target =~ ^[0-9a-f]{40}$ && \
     $marker =~ ^[0-9a-f]{40}$ ]] || return 1
  while ((hops <= PRODUCTION_FORWARD_MAX_FIRST_PARENT_COMMITS)); do
    [[ $current == "$marker" ]] && return 0
    [[ $current == "$anchor" ]] && return 1
    parent=$(production_forward_git rev-parse "$current^1" 2>/dev/null) || return 1
    current=$parent
    ((hops += 1))
  done
  return 1
}

production_forward_client_require_sealed_entry() {
  local commit=$1 expected_mode=$2 expected_blob=$3 expected_path=$4
  local entry mode type blob path extra
  entry=$(production_forward_git ls-tree "$commit" -- "$expected_path" 2>/dev/null) || \
    fail "production forward cannot inspect sealed authority: $expected_path"
  read -r mode type blob path extra <<< "$entry"
  [[ -z ${extra:-} && $mode == "$expected_mode" && $type == blob && \
     $blob == "$expected_blob" && $path == "$expected_path" ]] || \
    fail "production forward sealed authority differs: $expected_path"
}

production_forward_client_load_authority_seal() {
  local reviewed_h=$1 bridge=$2 target=$3 entry mode type blob path extra
  local temporary fd line row=0 expected_path sealed_mode sealed_blob sealed_path
  local reviewed_r
  local -a expected_paths=(
    ops/deploy/deploy-control-bridge-lib.sh
    ops/deploy/production-forward-bridge-host-lib.sh
    ops/deploy/production-forward-bridge.blobs
    ops/deploy/production-transition-b0-host-control.sh
    ops/deploy/production-transition-marker-lib.sh
  )
  entry=$(production_forward_git ls-tree "$reviewed_h" -- \
    "$PRODUCTION_FORWARD_AUTHORITY_SEAL_PATH" 2>/dev/null) || \
    fail 'production forward reviewed H authority seal cannot be inspected'
  read -r mode type blob path extra <<< "$entry"
  [[ -z ${extra:-} && $mode == 100644 && $type == blob && \
     $blob == "$PRODUCTION_FORWARD_AUTHORITY_SEAL_BLOB" && \
     $path == "$PRODUCTION_FORWARD_AUTHORITY_SEAL_PATH" ]] || \
    fail 'production forward reviewed H authority seal is not anchored'
  reviewed_r=$(production_forward_git rev-parse "$reviewed_h^1^1" 2>/dev/null) || \
    fail 'production forward R cannot be derived before authority load'
  temporary=$(mktemp "${RUNNER_TEMP:-/tmp}/production-forward-seal.XXXXXX") || \
    fail 'production forward reviewed H authority seal cannot be staged'
  production_forward_git cat-file blob "$blob" > "$temporary" || \
    fail 'production forward reviewed H authority seal cannot be read'
  [[ $(tail -c 1 "$temporary" | od -An -tx1 | tr -d ' ') == 0a ]] || \
    fail 'production forward reviewed H authority seal is not newline terminated'
  chmod 0400 "$temporary" || fail 'production forward reviewed H authority seal cannot be protected'
  exec {fd}<"$temporary" || fail 'production forward reviewed H authority seal cannot be opened'
  rm -f "$temporary"
  PRODUCTION_FORWARD_SEALED_HOST_BLOB=
  while IFS= read -r line <&$fd || [[ -n $line ]]; do
    ((row += 1))
    [[ $row -le 5 && \
       $line =~ ^100644\ ([0-9a-f]{40})\ ([./a-z0-9-]+)$ ]] || \
      fail 'production forward authority seal formatting is invalid'
    sealed_mode=100644
    sealed_blob=${BASH_REMATCH[1]}
    sealed_path=${BASH_REMATCH[2]}
    expected_path=${expected_paths[row - 1]:-}
    [[ $sealed_path == "$expected_path" ]] || \
      fail 'production forward authority seal row is invalid'
    production_forward_client_require_sealed_entry \
      "$bridge" "$sealed_mode" "$sealed_blob" "$sealed_path"
    production_forward_client_require_sealed_entry \
      "$reviewed_r" "$sealed_mode" "$sealed_blob" "$sealed_path"
    production_forward_client_require_sealed_entry \
      "$reviewed_h" "$sealed_mode" "$sealed_blob" "$sealed_path"
    production_forward_client_require_sealed_entry \
      "$target" "$sealed_mode" "$sealed_blob" "$sealed_path"
    if [[ $sealed_path == ops/deploy/production-forward-bridge-host-lib.sh ]]; then
      PRODUCTION_FORWARD_SEALED_HOST_BLOB=$sealed_blob
    fi
  done
  exec {fd}<&-
  [[ $row == 5 && $PRODUCTION_FORWARD_SEALED_HOST_BLOB =~ ^[0-9a-f]{40}$ ]] || \
    fail 'production forward authority seal path set is invalid'
}

source_production_forward_host_authority() {
  local target=$1 anchor reviewed_h bridge entry mode type blob path extra temporary fd
  anchor=$(production_forward_anchor_for_target "$target") || \
    fail 'production forward main is not within the bounded first-parent interval'
  if [[ $(production_forward_git rev-parse "$anchor^1" 2>/dev/null) == \
        "$PRODUCTION_FORWARD_MAIN_SHA" ]]; then
    reviewed_h=$(production_forward_git rev-parse "$anchor^2" 2>/dev/null) || \
      fail 'production forward H cannot be derived from F graph'
    bridge=$(production_forward_git rev-parse "$anchor^2^1^1^2" 2>/dev/null) || \
      fail 'production forward B cannot be derived from F graph'
  else
    reviewed_h=$anchor
    bridge=$(production_forward_git rev-parse "$anchor^1^1^2" 2>/dev/null) || \
      fail 'production forward B cannot be derived from direct H graph'
  fi
  production_forward_client_load_authority_seal "$reviewed_h" "$bridge" "$target"
  entry=$(production_forward_git ls-tree "$reviewed_h" -- \
    ops/deploy/production-forward-bridge-host-lib.sh 2>/dev/null) || \
    fail 'production forward reviewed H host authority cannot be inspected'
  read -r mode type blob path extra <<< "$entry"
  [[ -z ${extra:-} && $mode == 100644 && $type == blob && \
     $blob == "$PRODUCTION_FORWARD_SEALED_HOST_BLOB" && \
     $path == ops/deploy/production-forward-bridge-host-lib.sh ]] || \
    fail 'production forward reviewed H host authority blob is not anchored'
  temporary=$(mktemp "${RUNNER_TEMP:-/tmp}/production-forward-authority.XXXXXX") || \
    fail 'production forward reviewed H host authority cannot be staged'
  production_forward_git cat-file blob "$blob" > "$temporary" || \
    fail 'production forward reviewed H host authority blob cannot be read'
  chmod 0400 "$temporary"
  exec {fd}<"$temporary"; rm -f "$temporary"
  export REPO=${GITHUB_WORKSPACE:-.}
  # shellcheck source=/dev/null
  source "/dev/fd/$fd" || fail 'production forward reviewed H host authority cannot be loaded'
  exec {fd}<&-
  PRODUCTION_FORWARD_ANCHOR=$anchor
  PRODUCTION_FORWARD_DERIVED_BRIDGE=$bridge
}

verify_production_forward_target_identity() {
  local target=$1 anchor
  source_production_forward_host_authority "$target"
  anchor=$PRODUCTION_FORWARD_ANCHOR
  production_forward_verify_target_graph \
    "$PRODUCTION_FORWARD_DERIVED_BRIDGE" "$target"
  production_forward_first_parent_interval_contains "$anchor" "$target" "$anchor" || \
    fail 'production forward target is outside the bounded first-parent interval'
}

plan_is_exact_production_forward_bridge_transition() {
  [[ $PLAN_FRONTEND == false && $PLAN_BACKEND == false && \
     $PLAN_BACKEND_BASE == "$PRODUCTION_FORWARD_BACKEND_SHA" && \
     $PLAN_CONTROL == true && $PLAN_X_COLLECTOR == false && \
     $PLAN_POSTGRES_POOL_BOOTSTRAP == "$POSTGRES_POOL_BOOTSTRAP_VERSION" && \
     $PLAN_POSTGRES_POOL_BOOTSTRAP_SHA == "$PRODUCTION_FORWARD_POOL_SHA" && \
     $PLAN_POSTGRES_POOL_REPAIR == false ]]
}

plan_is_exact_production_forward_pre_bridge() {
  [[ $PLAN_FRONTEND == true && $PLAN_BACKEND == true && \
     $PLAN_BACKEND_BASE == "$PRODUCTION_FORWARD_BACKEND_SHA" && \
     $PLAN_CONTROL == true && $PLAN_X_COLLECTOR == false && \
     $PLAN_POSTGRES_POOL_BOOTSTRAP == "$POSTGRES_POOL_BOOTSTRAP_VERSION" && \
     $PLAN_POSTGRES_POOL_BOOTSTRAP_SHA == "$PRODUCTION_FORWARD_POOL_SHA" && \
     $PLAN_POSTGRES_POOL_REPAIR == false ]]
}

plan_is_approved_production_forward_handoff() {
  local target=$1 bridge=$2
  [[ $PLAN_X_COLLECTOR == false && \
     $PLAN_POSTGRES_POOL_BOOTSTRAP == "$POSTGRES_POOL_BOOTSTRAP_VERSION" && \
     $PLAN_POSTGRES_POOL_REPAIR == false && \
     $PLAN_BACKEND_BASE =~ ^[0-9a-f]{40}$ ]] || return 1
  if [[ $PLAN_BACKEND == true && \
        $PLAN_BACKEND_BASE == "$PRODUCTION_FORWARD_BACKEND_SHA" && \
        $PLAN_FRONTEND == true && $PLAN_CONTROL == true && \
        $PLAN_POSTGRES_POOL_BOOTSTRAP_SHA == "$bridge" ]]; then
    return 0
  fi
  if [[ $PLAN_BACKEND == false && $PLAN_BACKEND_BASE == "$target" && \
        $PLAN_CONTROL == true && \
        $PLAN_POSTGRES_POOL_BOOTSTRAP_SHA == "$bridge" && \
        $PLAN_FRONTEND =~ ^(true|false)$ ]]; then
    return 0
  fi
  if [[ $PLAN_BACKEND == false && $PLAN_BACKEND_BASE == "$target" && \
        $PLAN_FRONTEND == false && $PLAN_CONTROL == true && \
        $PLAN_POSTGRES_POOL_BOOTSTRAP_SHA == "$target" ]]; then
    return 0
  fi
  [[ $PLAN_BACKEND == false && $PLAN_BACKEND_BASE == "$target" && \
     $PLAN_FRONTEND == false && $PLAN_CONTROL == false && \
     $PLAN_POSTGRES_POOL_BOOTSTRAP_SHA == "$target" ]]
}

production_forward_bridge_is_installed() {
  local anchor=$1 target=$2
  [[ $PLAN_FRONTEND =~ ^(true|false)$ && $PLAN_BACKEND =~ ^(true|false)$ && \
     $PLAN_CONTROL =~ ^(true|false)$ && $PLAN_X_COLLECTOR =~ ^(true|false)$ && \
     $PLAN_POSTGRES_POOL_BOOTSTRAP == "$POSTGRES_POOL_BOOTSTRAP_VERSION" && \
     $PLAN_POSTGRES_POOL_REPAIR == false && $target != "$anchor" ]] || return 1
  production_forward_first_parent_interval_contains \
    "$anchor" "$target" "$PLAN_BACKEND_BASE" && \
    production_forward_first_parent_interval_contains \
      "$anchor" "$target" "$PLAN_POSTGRES_POOL_BOOTSTRAP_SHA"
}

prepare_production_forward_bridge() {
  local target=$1 status anchor bridge
  verify_production_forward_target_identity "$target"
  anchor=$PRODUCTION_FORWARD_ANCHOR
  bridge=$PRODUCTION_FORWARD_DERIVED_BRIDGE
  if capture_plan "$target"; then
    :
  else
    status=$?
    fail "production forward target plan failed with status $status"
  fi
  print_plan
  production_forward_bridge_is_installed "$anchor" "$target" && return 0
  [[ $target == "$anchor" ]] || \
    fail 'post-forward target does not have installed bounded markers'
  if plan_is_approved_production_forward_handoff "$anchor" "$bridge"; then
    return 0
  fi
  plan_is_exact_production_forward_pre_bridge || \
    fail 'production forward target is not an approved ordered marker plan'
  if capture_plan "$bridge"; then
    :
  else
    status=$?
    fail "production forward bridge plan failed with status $status"
  fi
  print_plan
  plan_is_exact_production_forward_bridge_transition || \
    fail 'production forward B plan is inconsistent with target'
  deploy_once "$bridge"
}
