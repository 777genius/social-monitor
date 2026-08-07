#!/usr/bin/env bash
set -euo pipefail

SOURCE_BASE=683c6ff94e964a2f268041fda462a2aa1c9eb2e2
FRONTEND_TARGET=cec570ce45a357d2f521c0513b39a5ecffb2222a
BACKEND_BASE=4bb8f6d4969b8449726a10859202b23e2bfb4366
EXPECTED_FRONTEND_PATHS=33

fail() {
  printf 'release-a-transition-error: %s\n' "$*" >&2
  exit 1
}

verify_frontend_tree() {
  local target=${1:-HEAD} count
  git cat-file -e "$SOURCE_BASE^{commit}" 2>/dev/null || fail 'source base is unavailable'
  git cat-file -e "$FRONTEND_TARGET^{commit}" 2>/dev/null || fail 'frontend target is unavailable'
  count=$(git diff --name-only "$FRONTEND_TARGET" "$SOURCE_BASE" -- apps/frontend | wc -l)
  [[ $count == "$EXPECTED_FRONTEND_PATHS" ]] || fail 'frontend transition path count is not 33'
  if [[ $target == WORKTREE ]]; then
    git diff --quiet "$FRONTEND_TARGET" -- apps/frontend || \
      fail 'apps/frontend is not byte-for-byte equal to the reviewed frontend target'
  else
    git diff --quiet "$FRONTEND_TARGET" "$target" -- apps/frontend || \
      fail 'apps/frontend is not byte-for-byte equal to the reviewed frontend target'
  fi
}

verify_plan() {
  [[ ${FRONTEND_CHANGED:-} == false ]] || fail 'plan frontend must be false'
  [[ ${BACKEND_CHANGED:-} == true ]] || fail 'plan backend must be true'
  [[ ${BACKEND_PLAN_BASE:-} == "$BACKEND_BASE" ]] || fail 'plan backend_base is not the reviewed backend marker'
  [[ ${CONTROL_CHANGED:-} == true ]] || fail 'plan control must be true'
  [[ ${X_COLLECTOR_CHANGED:-} == false ]] || fail 'plan x_collector must be false'
  [[ ${POSTGRES_POOL_BOOTSTRAP:-} == postgres-pool-v1 ]] || \
    fail 'plan PostgreSQL pool bootstrap is not installed'
}

case ${1:-} in
  worktree)
    verify_frontend_tree WORKTREE
    if [[ -n ${FRONTEND_CHANGED+x} ]]; then verify_plan; fi
    ;;
  ci)
    [[ $# == 2 && ${2:-} =~ ^[0-9a-f]{40}$ ]] || fail 'ci requires the target commit SHA'
    [[ $(git rev-parse "$2^") == "$SOURCE_BASE" ]] || fail 'Release A is not based exactly on 683c6ff'
    verify_frontend_tree "$2"
    verify_plan
    ;;
  *) fail 'usage: production-release-a-transition.sh worktree|ci TARGET_SHA' ;;
esac
