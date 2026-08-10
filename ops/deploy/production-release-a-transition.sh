#!/usr/bin/env bash
set -euo pipefail

INTEGRATION_BASE=bb76b205fb9ee77a016cf62b4905a1be53988ed3
APPROVED_A=cb6790a93122d138bae61f3155133ce926a88874
APPROVED_B=140e73127376452103bd7a5a4b8a9103a24537c0
BACKEND_BASE=4bb8f6d4969b8449726a10859202b23e2bfb4366
CONTROL_BASE=cec570ce45a357d2f521c0513b39a5ecffb2222a
ENTRYPOINT=ops/deploy/social-monitor-production-deploy.sh
OLD_ENTRYPOINT_BLOB=cd6c54ba92e2e55ecc7e9a55bcdec08a1c8f4551
APPROVED_ENTRYPOINT_BLOB=25295a9d2f9265795ca46894728b25fe9d70422b
SNAPSHOT_PATH=libs/contracts/rest/openapi.snapshot.json
POSTGRES_POOL_BOOTSTRAP_VERSION=postgres-pool-v1
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
  ops/deploy/production-runtime/daily-run.sh
  ops/deploy/production-runtime/github-premidnight-capture-v1.activation
  ops/deploy/production-runtime/github-premidnight-capture-v1.sh
  ops/deploy/production-runtime/social-monitor-github-premidnight-capture-v1.service
  ops/deploy/production-runtime/social-monitor-github-premidnight-capture-v1.timer
  ops/deploy/production-runtime/social-monitor-daily.service
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
  local commit=$1 key=$2 label=$3
  local -a values
  mapfile -t values < <(
    git show -s --format=%B "$commit" |
      git interpret-trailers --parse |
      awk -F': ' -v key="$key" '$1 == key { print $2 }'
  )
  ((${#values[@]} == 1)) && [[ ${values[0]} =~ ^[0-9a-f]{64}$ ]] ||
    fail "$label must contain one exact $key trailer"
  printf '%s\n' "${values[0]}"
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
  git diff --quiet "$release_e" "$release_a2" -- "${RUNTIME_CONTROL_PATHS[@]}" &&
    git diff --quiet "$release_a2" "$release_b2" -- "${RUNTIME_CONTROL_PATHS[@]}" ||
    fail 'Release A2/B2 unexpectedly changes runtime-control paths'

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

load_plan() {
  local plan_file=$1 key value extra required
  declare -gA PLAN=()
  [[ -f $plan_file && ! -L $plan_file ]] || fail 'plan input is not a regular file'
  while IFS='=' read -r key value extra; do
    [[ -n $key && -n $value && -z ${extra:-} ]] || fail 'plan has a malformed line'
    case $key in
      frontend|backend|backend_base|control|x_collector|postgres_pool_bootstrap|postgres_pool_bootstrap_sha|postgres_pool_repair) ;;
      *) fail "plan contains unexpected key $key" ;;
    esac
    [[ -z ${PLAN[$key]+present} ]] || fail "plan contains duplicate key $key"
    PLAN[$key]=$value
  done < "$plan_file"
  for required in frontend backend backend_base control x_collector \
    postgres_pool_bootstrap postgres_pool_bootstrap_sha postgres_pool_repair; do
    [[ -n ${PLAN[$required]+present} ]] || fail "plan is missing key $required"
  done
  for required in frontend backend control x_collector postgres_pool_repair; do
    [[ ${PLAN[$required]} =~ ^(true|false)$ ]] || fail "plan key $required is not boolean"
  done
  [[ ${PLAN[backend_base]} =~ ^[0-9a-f]{40}$ ]] || fail 'plan backend_base is invalid'
  [[ ${PLAN[postgres_pool_bootstrap_sha]} =~ ^[0-9a-f]{40}$ && \
     ${PLAN[postgres_pool_bootstrap_sha]} != 0000000000000000000000000000000000000000 ]] ||
    fail 'plan bootstrap SHA is invalid'
  [[ ${PLAN[postgres_pool_bootstrap]} == "$POSTGRES_POOL_BOOTSTRAP_VERSION" ]] ||
    fail 'plan PostgreSQL pool bootstrap is not postgres-pool-v1'
  [[ ${PLAN[postgres_pool_repair]} == false ]] ||
    fail 'inspect-plan must never report a repair'
}

plan_flags_are() {
  [[ ${PLAN[frontend]} == "$1" && ${PLAN[backend]} == "$2" && \
     ${PLAN[control]} == "$3" && ${PLAN[x_collector]} == "$4" ]]
}

classify_plan() {
  local release_b2=$1 target_phase=$2 plan_file=$3
  verify_three_phase_graph "$release_b2"
  load_plan "$plan_file"
  case $target_phase in
    E)
      if [[ ${PLAN[backend_base]} == "$BACKEND_BASE" ]] &&
         plan_flags_are false true true false; then
        printf 'transition_state=pre-E\n'
      elif [[ ${PLAN[backend_base]} == "$RELEASE_E" ]] &&
           plan_flags_are false false true false; then
        printf 'transition_state=pre-E\n'
      elif [[ ${PLAN[backend_base]} == "$RELEASE_E" ]] &&
           plan_flags_are false false false false; then
        printf 'transition_state=E-complete\n'
      else
        fail 'Release E plan is neither its exact pending, retry, nor complete state'
      fi
      ;;
    A2)
      [[ ${PLAN[backend_base]} == "$RELEASE_E" ]] ||
        fail 'Release A2 backend_base is not Release E'
      plan_flags_are false false true false ||
        fail 'Release A2 plan is not the exact control-only state'
      printf 'transition_state=E-complete\n'
      ;;
    B2)
      [[ ${PLAN[backend_base]} == "$RELEASE_E" ]] ||
        fail 'Release B2 backend_base is not Release E'
      if plan_flags_are true false false false; then
        printf 'transition_state=A-complete\n'
      elif plan_flags_are false false false false; then
        printf 'transition_state=B-complete\n'
      else
        fail 'Release B2 plan is neither pending nor complete'
      fi
      ;;
    *) fail 'plan phase must be E, A2, or B2' ;;
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
  "$BACKEND_BASE" "$CONTROL_BASE"; do
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
    [[ $# == 2 && ${2:-} =~ ^[0-9a-f]{40}$ ]] || fail 'validate requires Release B2 SHA'
    require_commit "$2" 'Release B2'
    verify_three_phase_graph "$2"
    printf 'release_e=%s\nrelease_a2=%s\nrelease_b2=%s\n' \
      "$RELEASE_E" "$RELEASE_A2" "$RELEASE_B2"
    ;;
  state)
    [[ $# == 4 && ${2:-} =~ ^[0-9a-f]{40}$ ]] ||
      fail 'state requires Release B2 SHA, E|A2|B2, and plan file'
    require_commit "$2" 'Release B2'
    classify_plan "$2" "$3" "$4"
    ;;
  *) fail 'usage: production-release-a-transition.sh worktree|validate B2_SHA|state B2_SHA E|A2|B2 PLAN_FILE' ;;
esac
