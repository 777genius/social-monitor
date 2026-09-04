#!/usr/bin/env bash

# Immutable predecessor-owned authority for the one production P/B/R/H/F
# handoff. Clients load the copy committed at reviewed H only after anchoring
# its blob; host recovery loads that same H blob only after exact origin/main
# and trusted-B blob equality checks.
PRODUCTION_FORWARD_LIVE_SHA=7c4070f0b9ef1aac130284bcffac50551e20a4dd
PRODUCTION_FORWARD_MAIN_SHA=c5dc5abb12aa1ac84ddbd12f141c6d4d8aca4de2
PRODUCTION_FORWARD_MANIFEST_PATH=ops/deploy/production-forward-bridge.blobs
PRODUCTION_FORWARD_AUTHORITY_SEAL_PATH=ops/deploy/production-forward-bridge-authority.blobs

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
    package-lock.json \
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
  [[ $row_count == 17 && -n $PRODUCTION_FORWARD_BRIDGE_ENTRY && \
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
  local f_tree h_tree
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
    [[ -f $destination && ! -L $destination && \
       $(stat -Lc '%u:%g:%a' "$destination") == "$expected_owner" && \
       $(production_forward_git hash-object --no-filters "$destination") == "$blob" ]] || \
      production_forward_host_fail "installed B0 destination is unsafe or wrong: $relative"
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
  before=$(stat -Lc '%d:%i:%f:%s:%Y:%Z:%u:%g:%a' "$staged") || \
    production_forward_host_fail "B0 temporary file cannot be stated: $relative"
  [[ $before == *":$expected_owner" && \
     $(production_forward_git hash-object --no-filters "$staged") == "$blob" ]] || \
    production_forward_host_fail "B0 temporary file verification failed: $relative"
  after=$(stat -Lc '%d:%i:%f:%s:%Y:%Z:%u:%g:%a' "$staged") || \
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
  [[ -f $destination && ! -L $destination && \
     $(stat -Lc '%u:%g:%a' "$destination") == "$expected_owner" && \
     $(production_forward_git hash-object --no-filters "$destination") == "$blob" ]] || \
    production_forward_host_fail "B0 installed destination verification failed: $relative"
  production_forward_install_failpoint "after-${relative##*/}-rename" || \
    production_forward_host_fail "B0 injected crash after rename: $relative"
}

production_forward_install_b0_before_entrypoint() {
  local target=$1 remote bridge
  production_forward_derive_graph "$target"
  bridge=$PRODUCTION_FORWARD_B
  production_forward_verify_target_graph "$bridge" "$target"
  remote=$(production_forward_git rev-parse 'origin/main^{commit}' 2>/dev/null) || \
    production_forward_host_fail 'production forward origin main is unavailable before B0 install'
  [[ $remote == "$target" ]] || \
    production_forward_host_fail 'production forward B0 install requires exact origin main'
  production_forward_install_blob "$target" 0755 \
    ops/deploy/production-transition-admission.sh
  production_forward_install_blob "$target" 0644 \
    ops/deploy/production-transition-canonical-lib.sh
  production_forward_install_blob "$bridge" 0644 \
    ops/deploy/production-transition-b0-host-control.sh
  # A predecessor without B0 must load the verified authority before moving.
  # An already-loaded readonly B0 only needs the blob checks above repeated.
  if ! declare -F production_transition_host_failpoint >/dev/null; then
    # shellcheck source=/dev/null
    source "$CONTROL/production-transition-b0-host-control.sh"
  fi
}

production_forward_file_matches_commit() {
  local commit=$1 relative=$2 installed=$3 entry mode type blob path extra
  [[ -f $installed && ! -L $installed ]] || return 1
  entry=$(production_forward_git ls-tree "$commit" -- "$relative" 2>/dev/null) || return 1
  read -r mode type blob path extra <<< "$entry"
  [[ -z ${extra:-} && $type == blob && $path == "$relative" && \
     $(production_forward_git hash-object --no-filters "$installed") == "$blob" ]]
}

production_forward_require_exact_handoff() {
  local base=$1 target=$2 action=$3 current remote control bootstrap
  [[ $action =~ ^(plan|upload|deploy)$ ]] || \
    production_forward_host_fail 'production forward handoff action is denied'
  production_forward_verify_target_graph "$base" "$target"
  current=$(production_forward_git rev-parse 'HEAD^{commit}' 2>/dev/null) || \
    production_forward_host_fail 'production forward current checkout is unavailable'
  remote=$(production_forward_git rev-parse 'origin/main^{commit}' 2>/dev/null) || \
    production_forward_host_fail 'production forward origin main is unavailable'
  [[ $current == "$target" && $remote == "$target" ]] || \
    production_forward_host_fail 'production forward handoff requires target=current=origin/main'
  control=$(tr -d '\n' < "$STATE/control.sha" 2>/dev/null || true)
  bootstrap=$(tr -d '\n' < "$STATE/postgres-pool-bootstrap.sha" 2>/dev/null || true)
  [[ $control == "$base" && ( $bootstrap == "$base" || $bootstrap == "$target" ) ]] || \
    production_forward_host_fail 'production forward handoff markers are invalid'
  production_forward_file_matches_commit "$target" \
    ops/deploy/social-monitor-production-deploy.sh \
    "$CONTROL/github-production-deploy.sh" || \
    production_forward_host_fail 'production forward installed entrypoint differs from F'
  production_forward_file_matches_commit "$target" \
    ops/deploy/social-monitor-production-ssh-wrapper.sh \
    "$CONTROL/github-production-deploy-wrapper.sh" || \
    production_forward_host_fail 'production forward installed wrapper differs from F'
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
