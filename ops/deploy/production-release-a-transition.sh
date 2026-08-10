#!/usr/bin/env bash
set -euo pipefail

SOURCE_BASE=9adb8eca792c6208c1477576f72487dc4224c4cf
FRONTEND_TARGET=683c6ff94e964a2f268041fda462a2aa1c9eb2e2
BACKEND_BASE=4bb8f6d4969b8449726a10859202b23e2bfb4366
SNAPSHOT_PATH=libs/contracts/rest/openapi.snapshot.json
RELEASE_A_SNAPSHOT_BLOB=5948d59742978b90e8b884dcec62df4fc72c58d3
RELEASE_B_SNAPSHOT_BLOB=e54354c8e7a38a3763af25265a024b619c80b4bb
POSTGRES_POOL_BOOTSTRAP_VERSION=postgres-pool-v1
EXPECTED_FRONTEND_PATHS=33
EXPECTED_PUBLIC_PATHS=34

fail() {
  printf 'release-transition-error: %s\n' "$*" >&2
  exit 1
}

require_commit() {
  git cat-file -e "$1^{commit}" 2>/dev/null || fail "$2 is unavailable"
}

snapshot_blob() {
  git rev-parse "$1:$SNAPSHOT_PATH" 2>/dev/null
}

manifest_digest() {
  local commit=$1
  LC_ALL=C git diff-tree --no-commit-id -r --full-index --no-renames "$commit" |
    sha256sum | awk '{print $1}'
}

manifest_trailer() {
  local release_b=$1 key=$2 value
  value=$(git show -s --format=%B "$release_b" |
    git interpret-trailers --parse |
    awk -F': ' -v key="$key" '$1 == key { print $2 }')
  [[ $(wc -l <<< "$value") == 1 && $value =~ ^[0-9a-f]{64}$ ]] ||
    fail "Release B must contain one exact $key trailer"
  printf '%s\n' "$value"
}

verify_public_tree() {
  local reference=$1 target=$2 expected_snapshot=$3 count
  count=$(git diff --name-only "$SOURCE_BASE" "$FRONTEND_TARGET" -- apps/frontend | wc -l)
  [[ $count == "$EXPECTED_FRONTEND_PATHS" ]] || fail 'reviewed frontend path count is not 33'
  git diff --quiet "$reference" "$target" -- apps/frontend ||
    fail 'apps/frontend does not match its reviewed tree'
  [[ $(snapshot_blob "$target") == "$expected_snapshot" ]] ||
    fail 'OpenAPI snapshot blob does not match its reviewed state'
}

verify_release_a_tree() {
  local target=$1
  [[ $(git rev-parse "$target^") == "$SOURCE_BASE" ]] ||
    fail 'Release A parent is not exact SOURCE_BASE'
  verify_public_tree "$SOURCE_BASE" "$target" "$RELEASE_A_SNAPSHOT_BLOB"
}

verify_release_b_tree() {
  local target=$1 parent expected_paths actual_paths expected_manifest
  parent=$(git rev-parse "$target^")
  [[ $(git rev-parse "$parent^") == "$SOURCE_BASE" ]] ||
    fail 'Release B parent is not a direct child of SOURCE_BASE'
  verify_release_a_tree "$parent"
  verify_public_tree "$FRONTEND_TARGET" "$target" "$RELEASE_B_SNAPSHOT_BLOB"
  expected_paths=$(
    {
      git diff --name-only "$SOURCE_BASE" "$FRONTEND_TARGET" -- apps/frontend
      printf '%s\n' "$SNAPSHOT_PATH"
    } | LC_ALL=C sort
  )
  actual_paths=$(git diff --name-only "$parent" "$target" | LC_ALL=C sort)
  [[ $(wc -l <<< "$expected_paths") == "$EXPECTED_PUBLIC_PATHS" ]] ||
    fail 'reviewed public path count is not 34'
  [[ $actual_paths == "$expected_paths" ]] ||
    fail 'Release B does not change exactly the 34 reviewed public paths'

  expected_manifest=$(manifest_trailer "$target" Recovery-A-Manifest-SHA256)
  [[ $(manifest_digest "$parent") == "$expected_manifest" ]] ||
    fail 'Release A path/hash manifest does not match its Release B trailer'
  expected_manifest=$(manifest_trailer "$target" Recovery-B-Manifest-SHA256)
  [[ $(manifest_digest "$target") == "$expected_manifest" ]] ||
    fail 'Release B path/hash manifest does not match its Release B trailer'
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
  [[ ${PLAN[postgres_pool_bootstrap_sha]} =~ ^[0-9a-f]{40}$ ]] ||
    fail 'plan bootstrap SHA is invalid'
  [[ ${PLAN[postgres_pool_bootstrap]} == "$POSTGRES_POOL_BOOTSTRAP_VERSION" ]] ||
    fail 'plan PostgreSQL pool bootstrap is not postgres-pool-v1'
  [[ ${PLAN[postgres_pool_repair]} == false ]] || fail 'inspect-plan must never report a repair'
}

plan_flags_are() {
  [[ ${PLAN[frontend]} == "$1" && ${PLAN[backend]} == "$2" && \
     ${PLAN[control]} == "$3" && ${PLAN[x_collector]} == "$4" ]]
}

classify_plan() {
  local release_b=$1 target_phase=$2 plan_file=$3 release_a
  verify_release_b_tree "$release_b"
  release_a=$(git rev-parse "$release_b^")
  load_plan "$plan_file"
  case $target_phase in
    A)
      [[ ${PLAN[backend_base]} == "$BACKEND_BASE" ]] ||
        fail 'pre-A backend_base is not the reviewed durable backend'
      plan_flags_are false true true false || fail 'Release A plan is neither pending nor complete'
      printf 'transition_state=pre-A\n'
      ;;
    B)
      [[ ${PLAN[backend_base]} == "$release_a" ]] ||
        fail 'Release B backend_base is not Release A'
      if plan_flags_are true false false false; then
        printf 'transition_state=A-complete\n'
      elif plan_flags_are false false false false; then
        printf 'transition_state=B-complete\n'
      else
        fail 'Release B plan is neither pending nor complete'
      fi
      ;;
    *) fail 'plan phase must be A or B' ;;
  esac
}

require_commit "$SOURCE_BASE" 'SOURCE_BASE'
require_commit "$FRONTEND_TARGET" 'frontend target'
case ${1:-} in
  worktree)
    git diff --quiet "$SOURCE_BASE" -- apps/frontend ||
      fail 'pre-A worktree apps/frontend does not match SOURCE_BASE'
    [[ $(git hash-object "$SNAPSHOT_PATH") == "$RELEASE_A_SNAPSHOT_BLOB" ]] ||
      fail 'pre-A worktree snapshot blob is not Release A state'
    printf 'transition_state=pre-A\n'
    ;;
  validate)
    [[ $# == 2 && ${2:-} =~ ^[0-9a-f]{40}$ ]] || fail 'validate requires Release B SHA'
    require_commit "$2" 'Release B'
    verify_release_b_tree "$2"
    printf 'release_a=%s\n' "$(git rev-parse "$2^")"
    printf 'release_b=%s\n' "$2"
    ;;
  state)
    [[ $# == 4 && ${2:-} =~ ^[0-9a-f]{40}$ ]] ||
      fail 'state requires Release B SHA, A|B, and plan file'
    require_commit "$2" 'Release B'
    classify_plan "$2" "$3" "$4"
    ;;
  *) fail 'usage: production-release-a-transition.sh worktree|validate B_SHA|state B_SHA A|B PLAN_FILE' ;;
esac
