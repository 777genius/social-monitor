#!/usr/bin/env bash

# The recovery workflow may run from a main commit that contains only the
# recovery implementation after the reviewed S2. Keep that overlay explicit:
# the production target itself is still built from S2, never from this head.

production_transition_stale_b0_validate_head() {
  local b0=$1 s2=$2 head=$3 expected actual
  local -a allowed=(
    .github/workflows/production-transition-publish.yml
    .github/workflows/production-transition-review.yml
    ops/deploy/production-transition-publisher.sh
    ops/deploy/production-transition-reviewer.sh
    ops/deploy/production-transition-stale-b0-recovery-lib.sh
    ops/deploy/production-transition-stale-b0-recovery.test.sh
    ops/deploy/production-forward-bridge.blobs
    ops/deploy/production-forward-bridge-authority.blobs
    ops/deploy/github-production-forward-bridge-client-lib.sh
    scripts/check-review-ci.mjs
  )
  [[ $b0 =~ ^[0-9a-f]{40}$ && $s2 =~ ^[0-9a-f]{40}$ && \
     $head =~ ^[0-9a-f]{40}$ ]] || fail 'stale B0 recovery commit is malformed'
  [[ $(production_transition_git -C "$REPO" rev-list --parents -n 1 "$s2") == \
     "$s2 $b0" ]] || fail 'stale B0 recovery S2 is not its direct child'
  production_transition_git -C "$REPO" merge-base --is-ancestor "$s2" "$head" || \
    fail 'stale B0 recovery head is outside the reviewed S2 history'
  expected=$(printf '%s\n' "${allowed[@]}" | LC_ALL=C sort)
  actual=$(production_transition_git -C "$REPO" diff --name-only --no-renames \
    "$s2" "$head" | LC_ALL=C sort)
  [[ $actual == "$expected" ]] || \
    fail 'stale B0 recovery head contains an unreviewed non-recovery change'
}
