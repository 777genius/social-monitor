#!/usr/bin/env bash

# Immutable predecessor-owned authority for the one production P/B/R/H/F
# handoff. Clients load the copy committed at reviewed H only after anchoring
# its blob; host recovery loads that same H blob only after exact origin/main
# and trusted-B blob equality checks.
PRODUCTION_FORWARD_LIVE_SHA=7c4070f0b9ef1aac130284bcffac50551e20a4dd
PRODUCTION_FORWARD_MAIN_SHA=c5dc5abb12aa1ac84ddbd12f141c6d4d8aca4de2
PRODUCTION_FORWARD_MANIFEST_PATH=ops/deploy/production-forward-bridge.blobs
PRODUCTION_FORWARD_AUTHORITY_SEAL_PATH=ops/deploy/production-forward-bridge-authority.blobs
PRODUCTION_FORWARD_PINNED_ORIGIN_HTTPS=https://github.com/777genius/social-monitor.git
PRODUCTION_FORWARD_PINNED_ORIGIN_HTTPS_CHECKOUT=https://github.com/777genius/social-monitor
PRODUCTION_FORWARD_PINNED_ORIGIN_SSH=git@github.com:777genius/social-monitor.git

production_forward_host_fail() {
  if declare -F production_transition_host_fail >/dev/null; then
    production_transition_host_fail "$1"
  else
    fail "$1"
  fi
}

production_forward_git() {
  GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 \
    git -C "${REPO:-${GITHUB_WORKSPACE:-.}}" "$@"
}

# Keep the forward bridge on the same exact two-form origin policy as the
# independently installed production-transition admission gate.
production_forward_verify_origin() {
  local -a urls=()
  mapfile -t urls < <(production_forward_git remote get-url --all origin)
  [[ ${#urls[@]} == 1 && \
     (${urls[0]} == "$PRODUCTION_FORWARD_PINNED_ORIGIN_HTTPS" || \
      ${urls[0]} == "$PRODUCTION_FORWARD_PINNED_ORIGIN_HTTPS_CHECKOUT" || \
      ${urls[0]} == "$PRODUCTION_FORWARD_PINNED_ORIGIN_SSH") ]] || \
    production_forward_host_fail \
      'production forward origin differs from pinned 777genius/social-monitor'
}

production_forward_require_origin_policy() {
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 && \
        ${PRODUCTION_FORWARD_TEST_ALLOW_LOCAL_ORIGIN:-} == 1 ]]; then
    return 0
  fi
  production_forward_verify_origin
}

production_forward_live_remote_main() {
  local output sha ref extra
  production_forward_require_origin_policy
  output=$(production_forward_git ls-remote --exit-code origin refs/heads/main) || \
    production_forward_host_fail 'production forward live origin main cannot be read'
  read -r sha ref extra <<< "$output"
  [[ -z ${extra:-} && $(wc -l <<< "$output") == 1 && \
     $sha =~ ^[0-9a-f]{40}$ && $ref == refs/heads/main ]] || \
    production_forward_host_fail 'production forward live origin main is malformed'
  printf '%s\n' "$sha"
}

production_forward_require_remote_main() {
  local target=$1 refresh=${2:-false} live tracking
  production_forward_require_origin_policy
  if [[ $refresh == true ]]; then
    production_forward_git fetch --quiet origin main || \
      production_forward_host_fail 'production forward origin main fetch failed'
  fi
  live=$(production_forward_live_remote_main)
  production_forward_require_origin_policy
  tracking=$(production_forward_git rev-parse --verify 'origin/main^{commit}' 2>/dev/null) || \
    production_forward_host_fail 'production forward origin main is unavailable'
  [[ $live == "$target" && $tracking == "$live" ]] || \
    production_forward_host_fail \
      'production forward target is not exact live origin main'
}

production_forward_commit_record() {
  production_forward_git rev-list --parents -n 1 "$1" 2>/dev/null
}

production_forward_exact_delta() {
  production_forward_git diff --name-only --no-renames "$1" "$2" -- \
    2>/dev/null | LC_ALL=C sort
}

production_forward_b_paths() {
  printf '%s\n' \
    ops/deploy/deploy-control-bridge-lib.sh \
    ops/deploy/production-forward-bridge-host-lib.sh \
    ops/deploy/production-forward-bridge.blobs \
    ops/deploy/production-transition-b0-host-control.sh \
    ops/deploy/production-transition-marker-lib.sh | LC_ALL=C sort
}

production_forward_head_paths() {
  printf '%s\n' \
    .github/workflows/production-deploy.yml \
    package.json \
    ops/deploy/github-production-deploy-client.sh \
    ops/deploy/github-production-deploy-client.test.sh \
    ops/deploy/github-production-forward-bridge-client-lib.sh \
    ops/deploy/deploy-control-bridge-runtime-helper.test.sh \
    ops/deploy/production-forward-bridge-authority.blobs \
    ops/deploy/production-forward-bootstrap-marker-resume.test.sh \
    ops/deploy/production-forward-bridge.test.sh \
    ops/deploy/production-release-b-bridge-order.test.sh \
    ops/deploy/production-transition-b0-host-control.test.sh \
    ops/deploy/rabbitmq-quorum-deploy-bridge-transition.test.sh \
    ops/deploy/social-monitor-production-deploy.test.sh \
    ops/deploy/x-collector-image-deploy-lib.test.sh \
    scripts/check-review-ci.mjs | LC_ALL=C sort
}

# The H-owned seal and the client that pins it are deliberately outside the
# B-owned manifest. Including either would create a blob-identity cycle:
# manifest -> client -> seal -> manifest.
production_forward_manifest_head_paths() {
  production_forward_head_paths | LC_ALL=C grep -Fvx \
    -e ops/deploy/github-production-forward-bridge-client-lib.sh \
    -e "$PRODUCTION_FORWARD_AUTHORITY_SEAL_PATH"
}

production_forward_rolling_paths() {
  printf '%s\n' ops/deploy/social-monitor-production-deploy.sh
}

production_forward_derive_graph() {
  local target=$1 record current parent hops=0 direct_h=false
  local -a parents=()
  [[ $target =~ ^[0-9a-f]{40}$ ]] || \
    production_forward_host_fail 'production forward target SHA is malformed'
  current=$target
  while ((hops < 256)); do
    record=$(production_forward_commit_record "$current") || \
      production_forward_host_fail 'production forward target is unavailable'
    read -r -a parents <<< "$record"
    if [[ ${#parents[@]} == 3 && ${parents[1]} == "$PRODUCTION_FORWARD_MAIN_SHA" ]]; then
      local candidate_r candidate_record
      candidate_r=$(production_forward_git rev-parse "${parents[2]}^1^1" 2>/dev/null || true)
      candidate_record=$(production_forward_commit_record "$candidate_r" || true)
      if [[ $candidate_record == "$candidate_r $PRODUCTION_FORWARD_MAIN_SHA "* ]]; then
        break
      fi
    fi
    parent=$(production_forward_git rev-parse "$current^1" 2>/dev/null) || break
    current=$parent
    ((hops += 1))
  done
  record=$(production_forward_commit_record "$current") || \
    production_forward_host_fail 'production forward target is unavailable'
  read -r -a parents <<< "$record"
  if ((hops < 256)) && [[ ${#parents[@]} == 3 && ${parents[0]} == "$current" && \
        ${parents[1]} == "$PRODUCTION_FORWARD_MAIN_SHA" ]]; then
    PRODUCTION_FORWARD_F=$current
    PRODUCTION_FORWARD_F_MAIN=${parents[1]}
    PRODUCTION_FORWARD_H=${parents[2]}
  else
    direct_h=true
    PRODUCTION_FORWARD_F=
    PRODUCTION_FORWARD_F_MAIN=$PRODUCTION_FORWARD_MAIN_SHA
    PRODUCTION_FORWARD_H=$target
  fi
  record=$(production_forward_commit_record "$PRODUCTION_FORWARD_H") || \
    production_forward_host_fail 'production forward H is unavailable'
  read -r -a parents <<< "$record"
  [[ ${#parents[@]} == 2 && ${parents[0]} == "$PRODUCTION_FORWARD_H" ]] || \
    production_forward_host_fail 'production forward H must have exactly one parent'
  PRODUCTION_FORWARD_R=${parents[1]}
  PRODUCTION_FORWARD_W=$PRODUCTION_FORWARD_R
  record=$(production_forward_commit_record "$PRODUCTION_FORWARD_R") || \
    production_forward_host_fail 'production forward W is unavailable'
  read -r -a parents <<< "$record"
  [[ ${#parents[@]} == 2 && ${parents[0]} == "$PRODUCTION_FORWARD_W" ]] || \
    production_forward_host_fail 'production forward W must have exactly one parent'
  PRODUCTION_FORWARD_R=${parents[1]}
  record=$(production_forward_commit_record "$PRODUCTION_FORWARD_R") || \
    production_forward_host_fail 'production forward R is unavailable'
  read -r -a parents <<< "$record"
  [[ ${#parents[@]} == 3 && ${parents[0]} == "$PRODUCTION_FORWARD_R" ]] || \
    production_forward_host_fail 'production forward R must have exactly two parents'
  PRODUCTION_FORWARD_R_MAIN=${parents[1]}
  PRODUCTION_FORWARD_B=${parents[2]}
  record=$(production_forward_commit_record "$PRODUCTION_FORWARD_B") || \
    production_forward_host_fail 'production forward B is unavailable'
  read -r -a parents <<< "$record"
  [[ ${#parents[@]} == 2 && ${parents[0]} == "$PRODUCTION_FORWARD_B" ]] || \
    production_forward_host_fail 'production forward B must have exactly one parent'
  PRODUCTION_FORWARD_P=${parents[1]}
  if [[ $direct_h == false ]]; then
    current=$target; hops=0
    while [[ $current != "$PRODUCTION_FORWARD_F" ]] && ((hops < 256)); do
      current=$(production_forward_git rev-parse "$current^1" 2>/dev/null) || \
        production_forward_host_fail \
          'production forward target is not a first-parent descendant of canonical F'
      ((hops += 1))
    done
    [[ $current == "$PRODUCTION_FORWARD_F" ]] || production_forward_host_fail \
      'production forward target exceeds the bounded first-parent interval'
  fi
  export PRODUCTION_FORWARD_F PRODUCTION_FORWARD_H PRODUCTION_FORWARD_W PRODUCTION_FORWARD_R \
    PRODUCTION_FORWARD_B PRODUCTION_FORWARD_P
}

production_forward_read_manifest() {
  local bridge=$1 manifest line scope mode blob path extra key previous_key='' row_count=0
  manifest=$(production_forward_git show \
    "$bridge:$PRODUCTION_FORWARD_MANIFEST_PATH" 2>/dev/null) || \
    production_forward_host_fail 'production forward manifest is unavailable from B'
  [[ $manifest == version=social-monitor-production-forward-bridge-blobs-v1$'\n'* ]] || \
    production_forward_host_fail 'production forward manifest version is invalid'
  PRODUCTION_FORWARD_BRIDGE_ENTRY=
  PRODUCTION_FORWARD_ROLLING_ENTRY=
  PRODUCTION_FORWARD_HEAD_ENTRIES=
  while IFS= read -r line; do
    ((row_count += 1))
    ((row_count == 1)) && continue
    [[ -n $line && $line != *$'\t'* && $line != ' '* && $line != *'  '* ]] || \
      production_forward_host_fail 'production forward manifest formatting is invalid'
    read -r scope mode blob path extra <<< "$line"
    [[ -z ${extra:-} && $scope =~ ^(bridge|head|rolling)$ && \
       $mode =~ ^100(644|755)$ && $blob =~ ^[0-9a-f]{40}$ && \
       $path != *'..'* && $path != /* ]] || \
      production_forward_host_fail 'production forward manifest row is invalid'
    key=$scope' '$path
    [[ -z $previous_key || $key > "$previous_key" ]] || \
      production_forward_host_fail 'production forward manifest is not strict sorted unique'
    previous_key=$key
    if [[ $scope == bridge ]]; then
      [[ -z $PRODUCTION_FORWARD_BRIDGE_ENTRY && \
         $path == ops/deploy/production-transition-b0-host-control.sh && \
         $mode == 100644 ]] || \
        production_forward_host_fail 'production forward bridge manifest row is invalid'
      PRODUCTION_FORWARD_BRIDGE_ENTRY=$mode' '$blob' '$path
    elif [[ $scope == rolling ]]; then
      [[ -z $PRODUCTION_FORWARD_ROLLING_ENTRY && \
         $path == ops/deploy/social-monitor-production-deploy.sh && \
         $mode == 100644 ]] || \
        production_forward_host_fail 'production forward rolling manifest row is invalid'
      PRODUCTION_FORWARD_ROLLING_ENTRY=$mode' '$blob' '$path
    else
      PRODUCTION_FORWARD_HEAD_ENTRIES+=$mode' '$blob' '$path$'\n'
    fi
  done <<< "$manifest"
  [[ $row_count == 16 && -n $PRODUCTION_FORWARD_BRIDGE_ENTRY && \
     -n $PRODUCTION_FORWARD_ROLLING_ENTRY ]] || \
    production_forward_host_fail 'production forward manifest row count is invalid'
  local expected actual
  expected=$(production_forward_manifest_head_paths)
  actual=$(printf '%s' "$PRODUCTION_FORWARD_HEAD_ENTRIES" | awk '{print $3}')
  [[ $actual == "$expected" ]] || \
    production_forward_host_fail 'production forward manifest paths are invalid'
}

production_forward_require_entry() {
  local commit=$1 expected_mode=$2 expected_blob=$3 expected_path=$4 entry
  local mode type blob path extra
  entry=$(production_forward_git ls-tree "$commit" -- "$expected_path" 2>/dev/null) || \
    production_forward_host_fail "production forward cannot inspect $expected_path"
  read -r mode type blob path extra <<< "$entry"
  [[ -z ${extra:-} && $mode == "$expected_mode" && $type == blob && \
     $blob == "$expected_blob" && $path == "$expected_path" ]] || \
    production_forward_host_fail "production forward committed blob differs: $expected_path"
}

production_forward_verify_committed_entries() {
  local bridge=$1 rolling=$2 head=$3 final=$4 mode blob path
  production_forward_read_manifest "$bridge"
  read -r mode blob path <<< "$PRODUCTION_FORWARD_BRIDGE_ENTRY"
  production_forward_require_entry "$bridge" "$mode" "$blob" "$path"
  read -r mode blob path <<< "$PRODUCTION_FORWARD_ROLLING_ENTRY"
  production_forward_require_entry "$rolling" "$mode" "$blob" "$path"
  production_forward_require_entry "$final" "$mode" "$blob" "$path"
  while read -r mode blob path; do
    [[ -n ${path:-} ]] || continue
    production_forward_require_entry "$head" "$mode" "$blob" "$path"
    production_forward_require_entry "$final" "$mode" "$blob" "$path"
  done <<< "$PRODUCTION_FORWARD_HEAD_ENTRIES"
}

production_forward_verify_target_graph() {
  local bridge=$1 target=$2 expected actual path main_delta bridge_to_join
  local f_tree h_tree target_tree
  production_forward_derive_graph "$target"
  local final=${PRODUCTION_FORWARD_F:-$PRODUCTION_FORWARD_H}
  [[ $bridge == "$PRODUCTION_FORWARD_B" && \
     $PRODUCTION_FORWARD_P == "$PRODUCTION_FORWARD_LIVE_SHA" && \
     $PRODUCTION_FORWARD_F_MAIN == "$PRODUCTION_FORWARD_MAIN_SHA" && \
     $PRODUCTION_FORWARD_R_MAIN == "$PRODUCTION_FORWARD_MAIN_SHA" ]] || \
    production_forward_host_fail 'production forward graph roots or bridge differ'
  expected=$(production_forward_b_paths)
  actual=$(production_forward_exact_delta "$PRODUCTION_FORWARD_P" "$bridge") || \
    production_forward_host_fail 'production forward B delta is unavailable'
  [[ $actual == "$expected" ]] || \
    production_forward_host_fail 'production forward B delta is invalid'
  actual=$(production_forward_exact_delta "$PRODUCTION_FORWARD_MAIN_SHA" \
    "$PRODUCTION_FORWARD_R") || production_forward_host_fail 'production forward R delta is unavailable'
  [[ $actual == "$expected" ]] || \
    production_forward_host_fail 'production forward R delta is invalid'
  while IFS= read -r path; do
    [[ $(production_forward_git rev-parse "$bridge:$path" 2>/dev/null) == \
       $(production_forward_git rev-parse "$PRODUCTION_FORWARD_R:$path" 2>/dev/null) && \
       $(production_forward_git rev-parse "$bridge:$path" 2>/dev/null) == \
       $(production_forward_git rev-parse "$PRODUCTION_FORWARD_H:$path" 2>/dev/null) && \
       $(production_forward_git rev-parse "$bridge:$path" 2>/dev/null) == \
       $(production_forward_git rev-parse "$final:$path" 2>/dev/null) ]] || \
      production_forward_host_fail "production forward B authority path was substituted: $path"
  done <<< "$expected"
  expected=$(production_forward_rolling_paths)
  actual=$(production_forward_exact_delta "$PRODUCTION_FORWARD_R" \
    "$PRODUCTION_FORWARD_W") || production_forward_host_fail 'production forward W delta is unavailable'
  [[ $actual == "$expected" ]] || \
    production_forward_host_fail 'production forward W delta is invalid'
  expected=$(production_forward_head_paths)
  actual=$(production_forward_exact_delta "$PRODUCTION_FORWARD_W" \
    "$PRODUCTION_FORWARD_H") || production_forward_host_fail 'production forward H delta is unavailable'
  [[ $actual == "$expected" ]] || \
    production_forward_host_fail 'production forward H delta is invalid'
  f_tree=$(production_forward_git rev-parse "$final^{tree}" 2>/dev/null) || \
    production_forward_host_fail 'production forward F tree is unavailable'
  h_tree=$(production_forward_git rev-parse "$PRODUCTION_FORWARD_H^{tree}" 2>/dev/null) || \
    production_forward_host_fail 'production forward H tree is unavailable'
  [[ $f_tree == "$h_tree" ]] || \
    production_forward_host_fail 'production forward F tree differs from H'
  target_tree=$(production_forward_git rev-parse "$target^{tree}" 2>/dev/null) || \
    production_forward_host_fail 'production forward target tree is unavailable'
  [[ $target_tree == "$h_tree" ]] || \
    production_forward_host_fail 'production forward descendant tree differs from H'
  expected=$(printf '%s\n%s\n%s\n' "$(production_forward_b_paths)" \
    "$(production_forward_rolling_paths)" "$(production_forward_head_paths)" | LC_ALL=C sort -u)
  actual=$(production_forward_exact_delta "$PRODUCTION_FORWARD_MAIN_SHA" "$final") || \
    production_forward_host_fail 'production forward F delta is unavailable'
  [[ $actual == "$expected" ]] || \
    production_forward_host_fail 'production forward F delta is invalid'
  main_delta=$(production_forward_exact_delta "$PRODUCTION_FORWARD_LIVE_SHA" \
    "$PRODUCTION_FORWARD_MAIN_SHA" | awk 'NR==FNR{drop[$0];next}!($0 in drop)' \
      <(production_forward_b_paths) -) || \
    production_forward_host_fail 'production forward P..M lineage is unavailable'
  bridge_to_join=$(production_forward_exact_delta "$bridge" \
    "$PRODUCTION_FORWARD_R" | awk 'NR==FNR{drop[$0];next}!($0 in drop)' \
      <(production_forward_b_paths) -) || \
    production_forward_host_fail 'production forward B..R lineage is unavailable'
  [[ $bridge_to_join == "$main_delta" ]] || \
    production_forward_host_fail 'production forward R does not preserve exact P..M lineage'
  production_forward_verify_committed_entries "$bridge" "$PRODUCTION_FORWARD_W" \
    "$PRODUCTION_FORWARD_H" "$final"
}

production_forward_fsync_path() {
  python3 - "$1" "${2:-file}" <<'PY'
import os, sys
path, kind = sys.argv[1:]
flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0)
if kind == "directory":
    flags |= getattr(os, "O_DIRECTORY", 0)
fd = os.open(path, flags)
try:
    os.fsync(fd)
finally:
    os.close(fd)
PY
}

production_forward_install_failpoint() {
  [[ ${PRODUCTION_FORWARD_INSTALL_FAILPOINT:-} != "$1" ]] || return 97
}

production_forward_install_blob() {
  local commit=$1 mode=$2 relative=$3 destination
  local entry tree_mode type blob path extra expected_owner before after staged
  destination=$CONTROL/${relative##*/}
  entry=$(production_forward_git ls-tree "$commit" -- "$relative" 2>/dev/null) || \
    production_forward_host_fail "B0 install cannot inspect $relative"
  read -r tree_mode type blob path extra <<< "$entry"
  [[ -z ${extra:-} && $tree_mode == "100${mode#0}" && $type == blob && \
     $blob =~ ^[0-9a-f]{40}$ && $path == "$relative" ]] || \
    production_forward_host_fail "B0 install source is invalid: $relative"
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]]; then
    expected_owner=$(id -u):$(id -g):${mode#0}
  else
    expected_owner=0:0:${mode#0}
  fi
  if [[ -e $destination || -L $destination ]]; then
    [[ -f $destination && ! -L $destination ]] || \
      production_forward_host_fail "installed B0 destination is unsafe or wrong: $relative"
    before=$(stat -Lc '%d:%i:%f:%s:%Y:%Z:%u:%g:%a:%h' "$destination") || \
      production_forward_host_fail "installed B0 destination cannot be stated: $relative"
    [[ $before == *":$expected_owner:1" && \
       $(production_forward_git hash-object --no-filters "$destination") == "$blob" ]] || \
      production_forward_host_fail "installed B0 destination is unsafe or wrong: $relative"
    after=$(stat -Lc '%d:%i:%f:%s:%Y:%Z:%u:%g:%a:%h' "$destination") || \
      production_forward_host_fail "installed B0 destination cannot be re-stated: $relative"
    [[ $after == "$before" ]] || \
      production_forward_host_fail "installed B0 destination changed: $relative"
    return 0
  fi
  staged=$(mktemp "$CONTROL/.production-forward-${relative##*/}.XXXXXX") || \
    production_forward_host_fail "B0 temporary file cannot be created: $relative"
  trap 'rm -f -- "$staged"' RETURN
  production_forward_git cat-file blob "$blob" > "$staged" || \
    production_forward_host_fail "B0 blob cannot be materialized: $relative"
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]]; then
    chmod "$mode" "$staged"
  else
    chown root:root "$staged" && chmod "$mode" "$staged"
  fi || production_forward_host_fail "B0 temporary metadata cannot be set: $relative"
  before=$(stat -Lc '%d:%i:%f:%s:%Y:%Z:%u:%g:%a:%h' "$staged") || \
    production_forward_host_fail "B0 temporary file cannot be stated: $relative"
  [[ $before == *":$expected_owner:1" && \
     $(production_forward_git hash-object --no-filters "$staged") == "$blob" ]] || \
    production_forward_host_fail "B0 temporary file verification failed: $relative"
  after=$(stat -Lc '%d:%i:%f:%s:%Y:%Z:%u:%g:%a:%h' "$staged") || \
    production_forward_host_fail "B0 temporary file cannot be re-stated: $relative"
  [[ $after == "$before" ]] || production_forward_host_fail "B0 temporary file changed: $relative"
  production_forward_fsync_path "$staged" || \
    production_forward_host_fail "B0 temporary file fsync failed: $relative"
  production_forward_install_failpoint "before-${relative##*/}-rename" || \
    production_forward_host_fail "B0 injected crash before rename: $relative"
  mv -T -- "$staged" "$destination" || \
    production_forward_host_fail "B0 atomic rename failed: $relative"
  trap - RETURN
  production_forward_fsync_path "$CONTROL" directory || \
    production_forward_host_fail 'B0 control directory fsync failed'
  before=$(stat -Lc '%d:%i:%f:%s:%Y:%Z:%u:%g:%a:%h' "$destination") || \
    production_forward_host_fail "B0 installed destination cannot be stated: $relative"
  [[ -f $destination && ! -L $destination && $before == *":$expected_owner:1" && \
     $(production_forward_git hash-object --no-filters "$destination") == "$blob" ]] || \
    production_forward_host_fail "B0 installed destination verification failed: $relative"
  after=$(stat -Lc '%d:%i:%f:%s:%Y:%Z:%u:%g:%a:%h' "$destination") || \
    production_forward_host_fail "B0 installed destination cannot be re-stated: $relative"
  [[ $after == "$before" ]] || \
    production_forward_host_fail "B0 installed destination changed: $relative"
  production_forward_install_failpoint "after-${relative##*/}-rename" || \
    production_forward_host_fail "B0 injected crash after rename: $relative"
}

production_forward_install_b0_before_entrypoint() {
  local target=$1 bridge
  production_forward_derive_graph "$target"
  bridge=$PRODUCTION_FORWARD_B
  production_forward_verify_target_graph "$bridge" "$target"
  production_forward_require_remote_main "$target"
  production_forward_install_blob "$target" 0755 \
    ops/deploy/production-transition-admission.sh
  production_forward_install_blob "$target" 0644 \
    ops/deploy/production-transition-canonical-lib.sh
  production_forward_install_blob "$bridge" 0644 \
    ops/deploy/production-transition-b0-host-control.sh
  production_forward_install_blob "$bridge" 0644 \
    ops/deploy/production-transition-marker-lib.sh
  production_forward_install_rolling_entrypoint "$bridge" "$PRODUCTION_FORWARD_W"
  # The predecessor process did not load this newly installed authority at
  # startup. Source the verified B blob before any post-fast-forward phase can
  # call one of its functions.
  production_forward_source_marker_authority "$bridge"
  # shellcheck source=/dev/null
  source "$CONTROL/production-transition-b0-host-control.sh"
  declare -F production_transition_commit_postgres_pool_bootstrap >/dev/null || \
    production_forward_host_fail \
      'production forward marker authority is missing bootstrap commit'
}

production_forward_source_marker_authority() {
  local bridge=$1 relative=ops/deploy/production-transition-marker-lib.sh
  local entry mode type object path extra staging staged fd before after
  entry=$(production_forward_git ls-tree "$bridge" -- "$relative" 2>/dev/null) || \
    production_forward_host_fail 'production forward marker authority cannot be inspected'
  read -r mode type object path extra <<< "$entry"
  [[ -z ${extra:-} && $mode == 100644 && $type == blob && \
     $object =~ ^[0-9a-f]{40}$ && $path == "$relative" ]] || \
    production_forward_host_fail 'production forward marker authority blob is invalid'
  if declare -p PRODUCTION_TRANSITION_HOST_MARKER_OBJECT >/dev/null 2>&1; then
    [[ $PRODUCTION_TRANSITION_HOST_MARKER_OBJECT == "$object" ]] && \
      declare -p PRODUCTION_TRANSITION_HOST_MARKER_OBJECT 2>/dev/null | \
        grep -q '^declare -[^ ]*r' && \
      declare -F production_transition_commit_postgres_pool_bootstrap >/dev/null || \
      production_forward_host_fail \
        'production forward marker authority identity conflicts with sealed B'
    return 0
  fi
  staging=$(mktemp -d "$CONTROL/.production-forward-marker-authority.XXXXXX") || \
    production_forward_host_fail 'production forward marker authority staging failed'
  chmod 0700 "$staging"
  staged=$staging/library.sh
  production_forward_git cat-file blob "$object" > "$staged" || \
    production_forward_host_fail 'production forward marker authority cannot be materialized'
  chmod 0400 "$staged"
  [[ $(production_forward_git hash-object --no-filters "$staged") == "$object" && \
     $(stat -Lc '%u:%g:%a:%h' "$staged") == "$(id -u):$(id -g):400:1" ]] || \
    production_forward_host_fail 'production forward marker authority staging differs'
  exec {fd}<"$staged" || \
    production_forward_host_fail 'production forward marker authority cannot be opened'
  rm -f "$staged"; rmdir "$staging"
  before=$(stat -Lc '%d:%i:%f:%s:%Y:%Z:%u:%g:%a:%h' "/proc/$BASHPID/fd/$fd") || \
    production_forward_host_fail 'production forward marker authority descriptor is unsafe'
  [[ $before == *":$(id -u):$(id -g):400:0" ]] || \
    production_forward_host_fail 'production forward marker authority descriptor metadata differs'
  # shellcheck source=/dev/null
  builtin source "/dev/fd/$fd" || {
    exec {fd}<&-
    production_forward_host_fail 'production forward marker authority could not be loaded'
  }
  after=$(stat -Lc '%d:%i:%f:%s:%Y:%Z:%u:%g:%a:%h' "/proc/$BASHPID/fd/$fd") || \
    production_forward_host_fail 'production forward marker authority descriptor disappeared'
  exec {fd}<&-
  [[ $after == "$before" ]] || \
    production_forward_host_fail 'production forward marker authority changed while loading'
  readonly PRODUCTION_TRANSITION_HOST_MARKER_OBJECT=$object
  declare -F production_transition_commit_postgres_pool_bootstrap >/dev/null || \
    production_forward_host_fail \
      'production forward marker authority is missing bootstrap commit'
}

production_forward_install_rolling_entrypoint() {
  local bridge=$1 rolling=$2 relative destination before after
  relative=ops/deploy/social-monitor-production-deploy.sh
  destination=$CONTROL/github-production-deploy.sh
  if production_forward_file_matches_commit \
      "$rolling" "$relative" "$destination" 0755 100644; then
    production_forward_fsync_path "$destination" || \
      production_forward_host_fail 'production forward W entrypoint fsync failed'
    production_forward_fsync_path "$CONTROL" directory || \
      production_forward_host_fail 'production forward W control directory fsync failed'
    production_forward_file_matches_commit \
      "$rolling" "$relative" "$destination" 0755 100644 || \
      production_forward_host_fail \
        'production forward W entrypoint changed during durability proof'
    return 0
  fi
  production_forward_file_matches_commit \
    "$bridge" "$relative" "$destination" 0755 100644 || \
    production_forward_host_fail \
      'production forward pre-advance entrypoint is neither exact B nor reviewed W'
  before=$(stat -Lc '%d:%i:%f:%s:%Y:%Z:%u:%g:%a:%h' "$destination") || \
    production_forward_host_fail 'production forward B entrypoint cannot be stated'
  production_forward_replace_handoff_blob \
    "$rolling" "$relative" "$destination" 0755 100644 \
    before-rolling-entrypoint-rename "$bridge" \
    after-rolling-entrypoint-rename-before-control-fsync
  after=$(stat -Lc '%d:%i:%f:%s:%Y:%Z:%u:%g:%a:%h' "$destination") || \
    production_forward_host_fail 'production forward W entrypoint cannot be stated'
  [[ $after != "$before" ]] || \
    production_forward_host_fail 'production forward rolling entrypoint CAS did not replace B'
  production_forward_install_failpoint after-rolling-entrypoint-rename || \
    production_forward_host_fail \
      'production forward injected crash after rolling entrypoint rename'
}

production_forward_file_matches_commit() {
  local commit=$1 relative=$2 installed=$3 expected_mode=${4:-}
  local expected_tree_mode=${5:-100644}
  local entry mode type blob path extra expected_owner before after
  [[ -f $installed && ! -L $installed ]] || return 1
  entry=$(production_forward_git ls-tree "$commit" -- "$relative" 2>/dev/null) || return 1
  read -r mode type blob path extra <<< "$entry"
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]]; then
    expected_owner=$(id -u):$(id -g)
  else
    expected_owner=0:0
  fi
  before=$(stat -Lc '%d:%i:%f:%s:%Y:%Z:%u:%g:%a:%h' "$installed") || return 1
  [[ -z ${extra:-} && $mode == "$expected_tree_mode" && $type == blob && \
     $path == "$relative" && \
     $before == *":$expected_owner:${expected_mode#0}:1" && \
     $(production_forward_git hash-object --no-filters "$installed") == "$blob" ]] || return 1
  after=$(stat -Lc '%d:%i:%f:%s:%Y:%Z:%u:%g:%a:%h' "$installed") || return 1
  [[ $after == "$before" ]]
}

production_forward_replace_handoff_blob() {
  local target=$1 relative=$2 destination=$3 mode=$4 expected_tree_mode=${5:-100644}
  local before_rename_failpoint=${6:-}
  local expected_old_commit=${7:-}
  local after_rename_failpoint=${8:-}
  local entry tree_mode type blob path extra
  local expected_owner staged before after
  entry=$(production_forward_git ls-tree "$target" -- "$relative" 2>/dev/null) || \
    production_forward_host_fail "production forward cannot inspect target $relative"
  read -r tree_mode type blob path extra <<< "$entry"
  [[ -z ${extra:-} && $tree_mode == "$expected_tree_mode" && $type == blob && \
     $blob =~ ^[0-9a-f]{40}$ && $path == "$relative" ]] || \
    production_forward_host_fail "production forward target handoff blob is invalid: $relative"
  staged=$(mktemp "$CONTROL/.production-forward-handoff-${relative##*/}.XXXXXX") || \
    production_forward_host_fail "production forward handoff staging failed: $relative"
  trap 'rm -f -- "$staged"' RETURN
  production_forward_git cat-file blob "$blob" > "$staged" || \
    production_forward_host_fail "production forward handoff blob cannot be materialized: $relative"
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]]; then
    expected_owner=$(id -u):$(id -g)
    chmod "$mode" "$staged"
  else
    expected_owner=0:0
    chown root:root "$staged" && chmod "$mode" "$staged"
  fi || production_forward_host_fail "production forward handoff metadata failed: $relative"
  before=$(stat -Lc '%d:%i:%f:%s:%Y:%Z:%u:%g:%a:%h' "$staged") || \
    production_forward_host_fail "production forward staged handoff cannot be stated: $relative"
  [[ $before == *":$expected_owner:${mode#0}:1" && \
     $(production_forward_git hash-object --no-filters "$staged") == "$blob" ]] || \
    production_forward_host_fail "production forward staged handoff differs: $relative"
  production_forward_fsync_path "$staged" || \
    production_forward_host_fail "production forward staged handoff fsync failed: $relative"
  after=$(stat -Lc '%d:%i:%f:%s:%Y:%Z:%u:%g:%a:%h' "$staged") || \
    production_forward_host_fail "production forward staged handoff cannot be re-stated: $relative"
  [[ $after == "$before" ]] || \
    production_forward_host_fail "production forward staged handoff changed: $relative"
  if [[ -n $before_rename_failpoint ]]; then
    production_forward_install_failpoint "$before_rename_failpoint" || \
      production_forward_host_fail \
        'production forward injected crash before rolling entrypoint rename'
    production_forward_file_matches_commit \
      "$expected_old_commit" "$relative" "$destination" "$mode" \
      "$expected_tree_mode" || \
      production_forward_host_fail 'production forward B entrypoint changed before CAS rename'
  fi
  mv -T -- "$staged" "$destination" || \
    production_forward_host_fail "production forward handoff rename failed: $relative"
  trap - RETURN
  if [[ -n $after_rename_failpoint ]]; then
    production_forward_install_failpoint "$after_rename_failpoint" || \
      production_forward_host_fail \
        "production forward injected crash before handoff directory fsync: $relative"
  fi
  production_forward_fsync_path "$CONTROL" directory || \
    production_forward_host_fail 'production forward handoff directory fsync failed'
  production_forward_file_matches_commit \
    "$target" "$relative" "$destination" "$mode" "$expected_tree_mode" || \
    production_forward_host_fail "production forward installed handoff differs: $relative"
}

production_forward_sync_handoff_blob() {
  local target=$1 relative=$2 destination=$3 mode=$4
  local expected_tree_mode=${5:-100644}
  if production_forward_file_matches_commit \
      "$target" "$relative" "$destination" "$mode" "$expected_tree_mode"; then
    production_forward_fsync_path "$destination" || \
      production_forward_host_fail "production forward installed handoff fsync failed: $relative"
    production_forward_fsync_path "$CONTROL" directory || \
      production_forward_host_fail 'production forward handoff directory fsync failed'
    production_forward_file_matches_commit \
      "$target" "$relative" "$destination" "$mode" "$expected_tree_mode" || \
      production_forward_host_fail \
        "production forward installed handoff changed during durability proof: $relative"
    return 0
  fi
  production_forward_replace_handoff_blob \
    "$target" "$relative" "$destination" "$mode" "$expected_tree_mode"
}

production_forward_read_exact_marker() {
  local marker=$1 label=$2
  python3 - "$marker" "$label" "${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-}" <<'PY'
import os
import re
import stat
import sys

path, label, test_mode = sys.argv[1:]
flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
try:
    descriptor = os.open(path, flags)
except OSError as error:
    raise SystemExit(f"{label} marker cannot be securely opened: {error}")
try:
    before = os.fstat(descriptor)
    path_before = os.lstat(path)
    expected_ids = (os.getuid(), os.getgid()) if test_mode == "1" else (0, 0)
    allowed_modes = {0o600, 0o644} if test_mode == "1" else {0o644}
    if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
        raise SystemExit(f"{label} marker is not an exact regular single-link file")
    if (before.st_uid, before.st_gid) != expected_ids or stat.S_IMODE(before.st_mode) not in allowed_modes:
        raise SystemExit(f"{label} marker owner or mode is invalid")
    if (path_before.st_dev, path_before.st_ino) != (before.st_dev, before.st_ino):
        raise SystemExit(f"{label} marker path identity differs from descriptor")
    data = os.read(descriptor, 42)
    if os.read(descriptor, 1) or not re.fullmatch(rb"[0-9a-f]{40}\n", data):
        raise SystemExit(f"{label} marker framing is invalid")
    after = os.fstat(descriptor)
    path_after = os.lstat(path)
    identity = lambda value: (
        value.st_dev, value.st_ino, value.st_mode, value.st_nlink,
        value.st_uid, value.st_gid, value.st_size, value.st_mtime_ns, value.st_ctime_ns,
    )
    if identity(after) != identity(before) or identity(path_after) != identity(before):
        raise SystemExit(f"{label} marker changed while being read")
    sys.stdout.write(data[:-1].decode("ascii"))
finally:
    os.close(descriptor)
PY
}

production_forward_recover_post_advance_handoff() {
  local base=$1 target=$2 entry_relative wrapper_relative entrypoint wrapper old_entry
  local entry_bridge=false
  entry_relative=ops/deploy/social-monitor-production-deploy.sh
  wrapper_relative=ops/deploy/social-monitor-production-ssh-wrapper.sh
  entrypoint=$CONTROL/github-production-deploy.sh
  wrapper=$CONTROL/github-production-deploy-wrapper.sh
  old_entry=${PRODUCTION_FORWARD_W:-}
  [[ $old_entry =~ ^[0-9a-f]{40}$ ]] || \
    production_forward_host_fail 'production forward reviewed rolling entrypoint is unavailable'
  # Validate both old destinations before replacing either. A retry may see a
  # target/B mix only when the first atomic replacement already completed.
  if production_forward_file_matches_commit \
      "$old_entry" "$entry_relative" "$entrypoint" 0755 100644; then
    :
  elif production_forward_file_matches_commit \
      "$base" "$entry_relative" "$entrypoint" 0755 100644; then
    entry_bridge=true
  elif production_forward_file_matches_commit \
      "$target" "$entry_relative" "$entrypoint" 0755 100644; then
    :
  else
    production_forward_host_fail 'production forward post-advance entrypoint is unsealed'
  fi
  if production_forward_file_matches_commit \
      "$base" "$wrapper_relative" "$wrapper" 0755; then
    :
  elif production_forward_file_matches_commit \
      "$target" "$wrapper_relative" "$wrapper" 0755; then
    :
  else
    production_forward_host_fail 'production forward post-advance wrapper is unsealed'
  fi
  [[ $entry_bridge != true ]] || \
    production_forward_host_fail 'production forward handoff surfaces have impossible ordering'
  production_forward_sync_handoff_blob \
    "$target" "$wrapper_relative" "$wrapper" 0755
  production_forward_sync_handoff_blob \
    "$target" "$entry_relative" "$entrypoint" 0755 100644
  if declare -F production_transition_host_failpoint >/dev/null; then
    production_transition_host_failpoint forward-post-advance-handoff-synced || \
      production_forward_host_fail \
        'production forward injected crash after post-advance handoff sync'
  fi
}

production_forward_require_exact_handoff() {
  local base=$1 target=$2 action=$3 current control bootstrap
  [[ $action =~ ^(plan|upload|deploy)$ ]] || \
    production_forward_host_fail 'production forward handoff action is denied'
  production_forward_verify_target_graph "$base" "$target"
  current=$(production_forward_git rev-parse 'HEAD^{commit}' 2>/dev/null) || \
    production_forward_host_fail 'production forward current checkout is unavailable'
  [[ $current == "$target" ]] || \
    production_forward_host_fail 'production forward handoff requires target=current'
  production_forward_require_remote_main "$target"
  control=$(production_forward_read_exact_marker "$STATE/control.sha" control) || \
    production_forward_host_fail 'production forward control marker is unsafe'
  bootstrap=$(production_forward_read_exact_marker \
    "$STATE/postgres-pool-bootstrap.sha" 'PostgreSQL bootstrap') || \
    production_forward_host_fail 'production forward PostgreSQL bootstrap marker is unsafe'
  [[ $control == "$base" && ( $bootstrap == "$base" || $bootstrap == "$target" ) ]] || \
    production_forward_host_fail 'production forward handoff markers are invalid'
  if ! production_forward_file_matches_commit "$target" \
      ops/deploy/social-monitor-production-deploy.sh \
      "$CONTROL/github-production-deploy.sh" 0755 100644 || \
     ! production_forward_file_matches_commit "$target" \
      ops/deploy/social-monitor-production-ssh-wrapper.sh \
      "$CONTROL/github-production-deploy-wrapper.sh" 0755; then
    [[ $control == "$base" && $bootstrap == "$base" ]] || \
      production_forward_host_fail \
        'production forward old handoff bytes require exact B markers'
    production_forward_recover_post_advance_handoff "$base" "$target"
  fi
}

production_forward_postgres_handoff_installed() {
  local target=$1 base=${PRODUCTION_FORWARD_B:-}
  [[ $target =~ ^[0-9a-f]{40}$ ]] || return 1
  if [[ -z $base ]]; then
    production_forward_derive_graph "$target" >/dev/null 2>&1 || return 1
    base=$PRODUCTION_FORWARD_B
  fi
  (production_forward_require_exact_handoff "$base" "$target" \
    "${action:-plan}") >/dev/null 2>&1
}
