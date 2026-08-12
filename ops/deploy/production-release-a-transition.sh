#!/usr/bin/env bash
set -euo pipefail

INTEGRATION_BASE=bb76b205fb9ee77a016cf62b4905a1be53988ed3
APPROVED_A=cb6790a93122d138bae61f3155133ce926a88874
APPROVED_B=140e73127376452103bd7a5a4b8a9103a24537c0
FIXED_E=889d50f50328c89e25b3ef898e552df631b3222f
FIXED_A2=c64c3b46b6b6ba5c7ac7b04028932e09dae2116a
FIXED_B2=e3b5b5d89b3586668e36f987f03672415b5a0f37
BACKEND_BASE=4bb8f6d4969b8449726a10859202b23e2bfb4366
CONTROL_BASE=cec570ce45a357d2f521c0513b39a5ecffb2222a
ENTRYPOINT=ops/deploy/social-monitor-production-deploy.sh
OLD_ENTRYPOINT_BLOB=cd6c54ba92e2e55ecc7e9a55bcdec08a1c8f4551
APPROVED_ENTRYPOINT_BLOB=25295a9d2f9265795ca46894728b25fe9d70422b
SNAPSHOT_PATH=libs/contracts/rest/openapi.snapshot.json
POSTGRES_POOL_BOOTSTRAP_VERSION=postgres-pool-v1
POST_ROLLBACK_BOOTSTRAP_SHA=e7b19bc805815af310f1e5096d3fec5789129ddb
EXPECTED_E_PATHS=47
EXPECTED_FRONTEND_PATHS=33
EXPECTED_PUBLIC_PATHS=34

RABBIT_RECOVERY_PATHS=(
  ops/deploy/rabbitmq-quorum-health.sh
  ops/deploy/rabbitmq-quorum-health.test.sh
  ops/deploy/rabbitmq-quorum-recovery.sh
  ops/deploy/rabbitmq-quorum-recovery.test.sh
)

OWNED_PATHS=(
  .github/workflows/production-deploy.yml
  ops/deploy/production-release-a-transition.sh
  ops/deploy/production-release-a-transition.test.sh
  "${RABBIT_RECOVERY_PATHS[@]}"
)

RUNTIME_CONTROL_PATHS=(
  ops/deploy/production-runtime/daily-c1-runtime.sh
  ops/deploy/production-runtime/daily-run.sh
  ops/deploy/production-runtime/reader-summary-daily-c1.readiness
  ops/deploy/postgres-runtime-daily-c1-readiness-lib.sh
  ops/deploy/postgres-runtime-weekly-timer-state-lib.sh
  ops/deploy/production-runtime/github-premidnight-capture-v1.activation
  ops/deploy/production-runtime/github-premidnight-capture-v1.sh
  ops/deploy/production-runtime/social-monitor-github-premidnight-capture-v1.service
  ops/deploy/production-runtime/social-monitor-github-premidnight-capture-v1.timer
  ops/deploy/production-runtime/social-monitor-daily.service
  ops/deploy/production-runtime/social-monitor-daily.timer
  ops/deploy/production-runtime/social-monitor-reader-summary-production-day.service.d-10-daily-c1-owner.conf
  ops/deploy/production-runtime/social-monitor-weekly.service
  ops/deploy/production-runtime/social-monitor-weekly.timer
)

SEALED_BRIDGE_PATHS=(
  ops/deploy/social-monitor-production-deploy.sh
  ops/deploy/deploy-control-lib.sh
  ops/deploy/postgres-runtime-deploy-lib.sh
  ops/deploy/backend-image-rescue-lib.sh
  ops/deploy/x-collector-image-deploy-lib.sh
  ops/deploy/deploy-control-bridge-lib.sh
)

PENDING_RUNTIME_PATH=ops/deploy/production-runtime/daily-run.sh

fail() {
  printf 'release-transition-error: %s\n' "$*" >&2
  exit 1
}

require_commit() {
  git cat-file -e "$1^{commit}" 2>/dev/null || fail "$2 is unavailable"
}

single_parent() {
  local commit=$1 label=$2
  local -a ancestry
  read -r -a ancestry <<< "$(git rev-list --parents -n 1 "$commit")"
  ((${#ancestry[@]} == 2)) || fail "$label must have exactly one parent"
  printf '%s\n' "${ancestry[1]}"
}

tree_entry() {
  git ls-tree "$1" -- "$2" | awk 'NR == 1 { print $1 " " $3 }'
}

path_count() {
  awk 'NF { count += 1 } END { print count + 0 }' <<< "$1"
}

changed_paths() {
  git diff --name-only --no-renames "$1" "$2" -- | LC_ALL=C sort
}

manifest_digest() {
  local commit=$1
  LC_ALL=C git diff-tree --no-commit-id -r --full-index --no-renames "$commit" |
    sha256sum | awk '{print $1}'
}

manifest_trailer() {
  local commit=$1 key=$2 label=$3 values count
  values=$(git show -s --format=%B "$commit" |
    git interpret-trailers --parse |
    awk -F': ' -v key="$key" '$1 == key { print $2 }')
  count=$(awk 'NF { count += 1 } END { print count + 0 }' <<< "$values")
  [[ $count == 1 && $values =~ ^[0-9a-f]{64}$ ]] ||
    fail "$label must contain one exact $key trailer"
  printf '%s\n' "$values"
}

verify_manifest() {
  local carrier=$1 phase=$2 key=$3 label=$4 expected
  expected=$(manifest_trailer "$carrier" "$key" "$label")
  [[ $(manifest_digest "$phase") == "$expected" ]] ||
    fail "$label $key path/hash manifest does not match"
}

verify_reference_tree_except() {
  local reference=$1 target=$2 label=$3
  shift 3
  local -a pathspec=(.)
  local excluded
  for excluded in "$@"; do pathspec+=(":(exclude)$excluded"); done
  git diff --quiet "$reference" "$target" -- "${pathspec[@]}" ||
    fail "$label does not match its approved tree outside reviewed exclusions"
}

verify_owned_entries() {
  local release_e=$1 release_a2=$2 release_b2=$3 path mode expected_mode
  local entry_e entry_a2 entry_b2 approved_entry
  for path in "${OWNED_PATHS[@]}"; do
    case $path in
      .github/workflows/production-deploy.yml) expected_mode=100644 ;;
      *) expected_mode=100755 ;;
    esac
    entry_e=$(tree_entry "$release_e" "$path")
    entry_a2=$(tree_entry "$release_a2" "$path")
    entry_b2=$(tree_entry "$release_b2" "$path")
    [[ $entry_e == "$expected_mode "* ]] ||
      fail "Release E owned path has an invalid mode or type: $path"
    [[ $entry_e == "$entry_a2" && $entry_e == "$entry_b2" ]] ||
      fail "owned orchestration bytes drift across E/A2/B2: $path"
    approved_entry=$(tree_entry "$APPROVED_B" "$path")
    [[ $entry_b2 != "$approved_entry" ]] ||
      fail "owned orchestration path does not contain fresh three-phase bytes: $path"
    mode=${entry_b2%% *}
    [[ $mode == "$expected_mode" ]] || fail "owned orchestration mode is invalid: $path"
  done
}

verify_sealed_bridge() {
  local release_e=$1 path integration_entry
  for path in "${SEALED_BRIDGE_PATHS[@]}"; do
    integration_entry=$(tree_entry "$INTEGRATION_BASE" "$path")
    [[ $integration_entry == "100644 "* ]] ||
      fail "fixed integration bridge source has an invalid mode or type: $path"
    [[ $(tree_entry "$release_e" "$path") == "$integration_entry" ]] ||
      fail "Release E bridge source does not exactly match fixed integration: $path"
  done
}

verify_reviewed_path_sets() {
  local release_e=$1 release_a2=$2 release_b2=$3
  local expected_e actual_e expected_public actual_public reviewed_public frontend_paths
  expected_e=$(
    {
      git diff --name-only --no-renames \
        "$INTEGRATION_BASE" "$APPROVED_A" -- . ":(exclude)$ENTRYPOINT"
      printf '%s\n' "${RABBIT_RECOVERY_PATHS[@]}"
    } | awk 'NF' | LC_ALL=C sort -u
  )
  actual_e=$(changed_paths "$INTEGRATION_BASE" "$release_e")
  [[ $(path_count "$expected_e") == "$EXPECTED_E_PATHS" ]] ||
    fail 'reviewed Release E path count is not 47'
  [[ $actual_e == "$expected_e" ]] ||
    fail 'Release E does not change exactly the 47 reviewed paths'

  [[ $(changed_paths "$release_e" "$release_a2") == "$ENTRYPOINT" ]] ||
    fail 'Release A2 does not change exactly the sealed entrypoint'

  expected_public=$(changed_paths "$APPROVED_A" "$APPROVED_B")
  frontend_paths=$(git diff --name-only --no-renames \
    "$APPROVED_A" "$APPROVED_B" -- apps/frontend | LC_ALL=C sort)
  reviewed_public=$(
    { printf '%s\n' "$frontend_paths"; printf '%s\n' "$SNAPSHOT_PATH"; } |
      awk 'NF' | LC_ALL=C sort
  )
  [[ $(path_count "$frontend_paths") == "$EXPECTED_FRONTEND_PATHS" ]] ||
    fail 'reviewed frontend path count is not 33'
  [[ $(path_count "$expected_public") == "$EXPECTED_PUBLIC_PATHS" && \
     $expected_public == "$reviewed_public" ]] ||
    fail 'approved Release B public manifest is not the frozen 34 paths'
  actual_public=$(changed_paths "$release_a2" "$release_b2")
  [[ $actual_public == "$expected_public" ]] ||
    fail 'Release B2 does not change exactly the 34 reviewed public paths'
}

verify_three_phase_graph() {
  local release_b2=$1 release_a2 release_e parent runtime_paths
  release_a2=$(single_parent "$release_b2" 'Release B2')
  release_e=$(single_parent "$release_a2" 'Release A2')
  parent=$(single_parent "$release_e" 'Release E')
  [[ $parent == "$INTEGRATION_BASE" ]] ||
    fail 'Release E is not a direct child of the fixed integration base'

  [[ $(tree_entry "$INTEGRATION_BASE" "$ENTRYPOINT") == \
     "100644 $OLD_ENTRYPOINT_BLOB" ]] || fail 'fixed integration entrypoint blob changed'
  [[ $(tree_entry "$release_e" "$ENTRYPOINT") == \
     "100644 $OLD_ENTRYPOINT_BLOB" ]] || fail 'Release E entrypoint is not the sealed old bridge'
  [[ $(tree_entry "$APPROVED_A" "$ENTRYPOINT") == \
     "100644 $APPROVED_ENTRYPOINT_BLOB" ]] || fail 'approved Release A entrypoint blob changed'
  [[ $(tree_entry "$release_a2" "$ENTRYPOINT") == \
     "100644 $APPROVED_ENTRYPOINT_BLOB" && \
     $(tree_entry "$release_b2" "$ENTRYPOINT") == \
     "100644 $APPROVED_ENTRYPOINT_BLOB" ]] ||
    fail 'Release A2/B2 entrypoint is not the approved controller'

  verify_reviewed_path_sets "$release_e" "$release_a2" "$release_b2"
  verify_reference_tree_except "$APPROVED_A" "$release_e" 'Release E' \
    "$ENTRYPOINT" "${OWNED_PATHS[@]}"
  verify_reference_tree_except "$APPROVED_A" "$release_a2" 'Release A2' \
    "${OWNED_PATHS[@]}"
  verify_reference_tree_except "$APPROVED_B" "$release_b2" 'Release B2' \
    "${OWNED_PATHS[@]}"
  verify_owned_entries "$release_e" "$release_a2" "$release_b2"
  verify_sealed_bridge "$release_e"

  runtime_paths=$(git diff --name-only --no-renames \
    "$CONTROL_BASE" "$release_e" -- "${RUNTIME_CONTROL_PATHS[@]}" | LC_ALL=C sort)
  [[ $runtime_paths == "$PENDING_RUNTIME_PATH" ]] ||
    fail 'Release E pending runtime delta is not exactly daily-run.sh'
  if ! git diff --quiet "$release_e" "$release_a2" -- "${RUNTIME_CONTROL_PATHS[@]}" ||
     ! git diff --quiet "$release_a2" "$release_b2" -- "${RUNTIME_CONTROL_PATHS[@]}"; then
    fail 'Release A2/B2 unexpectedly changes runtime-control paths'
  fi

  verify_manifest "$release_e" "$release_e" \
    Recovery-E-Manifest-SHA256 'Release E'
  verify_manifest "$release_a2" "$release_e" \
    Recovery-E-Manifest-SHA256 'Release A2'
  verify_manifest "$release_a2" "$release_a2" \
    Recovery-A-Manifest-SHA256 'Release A2'
  verify_manifest "$release_b2" "$release_e" \
    Recovery-E-Manifest-SHA256 'Release B2'
  verify_manifest "$release_b2" "$release_a2" \
    Recovery-A-Manifest-SHA256 'Release B2'
  verify_manifest "$release_b2" "$release_b2" \
    Recovery-B-Manifest-SHA256 'Release B2'

  RELEASE_E=$release_e
  RELEASE_A2=$release_a2
  RELEASE_B2=$release_b2
}

first_parent_contains() {
  local ancestor=$1 descendant=$2 found
  found=$(git rev-list --first-parent "$descendant" |
    awk -v ancestor="$ancestor" '$0 == ancestor { found = 1 } END { print found + 0 }')
  [[ $found == 1 ]]
}

verify_target() {
  local target=$1
  require_commit "$target" 'target commit'
  verify_three_phase_graph "$FIXED_B2"
  [[ $RELEASE_E == "$FIXED_E" && $RELEASE_A2 == "$FIXED_A2" ]] ||
    fail 'fixed E/A2/B2 graph does not match the canonical anchors'
  first_parent_contains "$FIXED_B2" "$target" ||
    fail 'target commit does not first-parent-contain canonical Release B2'
  TARGET=$target
}

load_plan() {
  local plan_file=$1 key value extra required seen=' '
  PLAN_FRONTEND='' PLAN_BACKEND='' PLAN_BACKEND_BASE='' PLAN_CONTROL=''
  PLAN_X_COLLECTOR='' PLAN_BOOTSTRAP='' PLAN_BOOTSTRAP_SHA='' PLAN_REPAIR=''
  [[ -f $plan_file && ! -L $plan_file ]] || fail 'plan input is not a regular file'
  while IFS='=' read -r key value extra; do
    [[ -n $key && -n $value && -z ${extra:-} ]] || fail 'plan has a malformed line'
    case $key in
      frontend|backend|backend_base|control|x_collector|postgres_pool_bootstrap|postgres_pool_bootstrap_sha|postgres_pool_repair) ;;
      *) fail "plan contains unexpected key $key" ;;
    esac
    case $seen in *" $key "*) fail "plan contains duplicate key $key" ;; esac
    seen="$seen$key "
    case $key in
      frontend) PLAN_FRONTEND=$value ;;
      backend) PLAN_BACKEND=$value ;;
      backend_base) PLAN_BACKEND_BASE=$value ;;
      control) PLAN_CONTROL=$value ;;
      x_collector) PLAN_X_COLLECTOR=$value ;;
      postgres_pool_bootstrap) PLAN_BOOTSTRAP=$value ;;
      postgres_pool_bootstrap_sha) PLAN_BOOTSTRAP_SHA=$value ;;
      postgres_pool_repair) PLAN_REPAIR=$value ;;
    esac
  done < "$plan_file"
  for required in frontend backend backend_base control x_collector postgres_pool_bootstrap postgres_pool_bootstrap_sha postgres_pool_repair; do
    case $seen in *" $required "*) ;; *) fail "plan is missing key $required" ;; esac
  done
  for required in frontend backend control x_collector postgres_pool_repair; do
    case $required in
      frontend) value=$PLAN_FRONTEND ;; backend) value=$PLAN_BACKEND ;;
      control) value=$PLAN_CONTROL ;; x_collector) value=$PLAN_X_COLLECTOR ;;
      postgres_pool_repair) value=$PLAN_REPAIR ;;
    esac
    [[ $value =~ ^(true|false)$ ]] || fail "plan key $required is not boolean"
  done
  [[ $PLAN_BACKEND_BASE =~ ^[0-9a-f]{40}$ ]] || fail 'plan backend_base is invalid'
  [[ $PLAN_BOOTSTRAP_SHA =~ ^[0-9a-f]{40}$ ]] ||
    fail 'plan bootstrap SHA is invalid'
  [[ $PLAN_BOOTSTRAP =~ ^(uninstalled|$POSTGRES_POOL_BOOTSTRAP_VERSION)$ ]] ||
    fail 'plan PostgreSQL pool bootstrap status is invalid'
  if [[ $PLAN_BOOTSTRAP == uninstalled ]]; then
    [[ $PLAN_BOOTSTRAP_SHA == 0000000000000000000000000000000000000000 ]] ||
      fail 'uninstalled bootstrap must use the zero marker'
  fi
}

plan_flags_are() {
  [[ $PLAN_FRONTEND == "$1" && $PLAN_BACKEND == "$2" && \
     $PLAN_CONTROL == "$3" && $PLAN_X_COLLECTOR == "$4" ]]
}

repair_required() {
  [[ $PLAN_REPAIR == true || $PLAN_BOOTSTRAP == uninstalled ||
     $PLAN_BOOTSTRAP_SHA == 0000000000000000000000000000000000000000 ]]
}

emit_state() {
  if repair_required; then
    printf 'transition_state=repair-required\n'
  else
    printf 'transition_state=%s\n' "$1"
  fi
}

classify_plan() {
  local target=$1 target_phase=$2 plan_file=$3
  verify_target "$target"
  load_plan "$plan_file"
  if require_commit "$PLAN_BACKEND_BASE" 'current backend marker' &&
     first_parent_contains "$FIXED_B2" "$PLAN_BACKEND_BASE"; then
    if repair_required; then
      printf 'transition_state=repair-required\n'
    elif plan_flags_are false false false false; then
      printf 'transition_state=target-complete\n'
    else
      printf 'transition_state=target-pending\n'
    fi
    return
  fi
  if [[ $target_phase == TARGET &&
        $(git cat-file -t "$PLAN_BACKEND_BASE" 2>/dev/null || true) == commit &&
        $(first_parent_contains "$PLAN_BACKEND_BASE" "$target" && printf true || printf false) == true &&
        $PLAN_BOOTSTRAP == "$POSTGRES_POOL_BOOTSTRAP_VERSION" &&
        ( $PLAN_BOOTSTRAP_SHA == "$POST_ROLLBACK_BOOTSTRAP_SHA" ||
          ( $(git cat-file -t "$PLAN_BOOTSTRAP_SHA" 2>/dev/null || true) == commit &&
            $(first_parent_contains "$FIXED_B2" "$PLAN_BOOTSTRAP_SHA" && printf true || printf false) == true ) ) &&
        $PLAN_REPAIR == false && $PLAN_FRONTEND =~ ^(true|false)$ &&
        $PLAN_BACKEND == true && $PLAN_CONTROL == true &&
        $PLAN_X_COLLECTOR == false ]]; then
    printf 'transition_state=target-pending\n'
    return
  fi
  case $target_phase in
    E)
      if [[ $PLAN_BACKEND_BASE == "$BACKEND_BASE" ]] &&
         plan_flags_are false true true false; then
        emit_state pre-E
      elif [[ $PLAN_BACKEND_BASE == "$RELEASE_E" ]] &&
           plan_flags_are false false true false; then
        emit_state pre-E
      elif [[ $PLAN_BACKEND_BASE == "$RELEASE_E" ]] &&
           plan_flags_are false false false false; then
        emit_state E-complete
      else
        fail 'Release E plan is neither its exact pending, retry, nor complete state'
      fi
      ;;
    A2)
      [[ $PLAN_BACKEND_BASE == "$RELEASE_E" ]] ||
        fail 'Release A2 backend_base is not Release E'
      plan_flags_are false false true false ||
        fail 'Release A2 plan is not the exact control-only state'
      emit_state E-complete
      ;;
    B2)
      [[ $PLAN_BACKEND_BASE == "$RELEASE_E" ]] ||
        fail 'Release B2 backend_base is not Release E'
      if plan_flags_are true false false false; then
        emit_state A-complete
      elif plan_flags_are false false false false; then
        emit_state B-complete
      else
        fail 'Release B2 plan is neither pending nor complete'
      fi
      ;;
    TARGET) fail 'current target plan does not prove the fixed phases complete' ;;
    *) fail 'plan phase must be E, A2, B2, or TARGET' ;;
  esac
}

verify_worktree() {
  local -a pathspec=(. ":(exclude)$ENTRYPOINT")
  local path expected_mode current_blob approved_entry
  for path in "${OWNED_PATHS[@]}"; do pathspec+=(":(exclude)$path"); done
  git diff --quiet "$APPROVED_A" -- "${pathspec[@]}" ||
    fail 'worktree does not match approved A outside the sealed entrypoint and owned orchestration files'
  [[ $(git hash-object "$ENTRYPOINT") == "$OLD_ENTRYPOINT_BLOB" ]] ||
    fail 'worktree entrypoint is not the sealed old bridge'
  for path in "${OWNED_PATHS[@]}"; do
    [[ -f $path && ! -L $path ]] || fail "worktree owned path is not regular: $path"
    case $path in
      .github/workflows/production-deploy.yml) expected_mode=644 ;;
      *) expected_mode=755 ;;
    esac
    [[ $(stat -c '%a' "$path") == "$expected_mode" ]] ||
      fail "worktree owned path mode is invalid: $path"
    current_blob=$(git hash-object "$path")
    approved_entry=$(tree_entry "$APPROVED_B" "$path")
    [[ $current_blob != "${approved_entry#* }" ]] ||
      fail "worktree owned path does not contain fresh three-phase bytes: $path"
  done
  printf 'transition_state=pre-E\n'
}

for anchor in "$INTEGRATION_BASE" "$APPROVED_A" "$APPROVED_B" \
  "$BACKEND_BASE" "$CONTROL_BASE" "$FIXED_E" "$FIXED_A2" "$FIXED_B2"; do
  require_commit "$anchor" "fixed anchor $anchor"
done
git merge-base --is-ancestor "$BACKEND_BASE" "$CONTROL_BASE" ||
  fail 'fixed control marker does not descend from the durable backend marker'
git merge-base --is-ancestor "$CONTROL_BASE" "$INTEGRATION_BASE" ||
  fail 'fixed integration base does not descend from the control marker'

case ${1:-} in
  worktree)
    [[ $# == 1 ]] || fail 'worktree takes no arguments'
    verify_worktree
    ;;
  validate)
    [[ $# == 2 && ${2:-} =~ ^[0-9a-f]{40}$ ]] || fail 'validate requires target SHA'
    verify_target "$2"
    printf 'release_e=%s\nrelease_a2=%s\nrelease_b2=%s\ntarget=%s\n' \
      "$RELEASE_E" "$RELEASE_A2" "$RELEASE_B2" "$TARGET"
    ;;
  state)
    [[ $# == 4 && ${2:-} =~ ^[0-9a-f]{40}$ ]] ||
      fail 'state requires target SHA, E|A2|B2|TARGET, and plan file'
    classify_plan "$2" "$3" "$4"
    ;;
  *) fail 'usage: production-release-a-transition.sh worktree|validate TARGET_SHA|state TARGET_SHA E|A2|B2|TARGET PLAN_FILE' ;;
esac
