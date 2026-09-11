#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# Acceptance-level failure drill for the Nomad API MVP (plan section 9/12
# checkpoint). This does not stand up a real Nomad agent, nginx process, or
# production host - every scenario below runs against the fakes/temp-dir
# adapters already used by the unit suite. Its job is to be the single named
# entrypoint the plan's acceptance checklist points at, not to duplicate
# rollout.test.mjs's per-adapter coverage.

fail_test() {
  printf 'failure-drill: %s\n' "$1" >&2
  exit 1
}

# 1) The concurrent/stale-plan/offline/mid-crash-recovery scenarios that are
#    NOT already covered by rollout.test.mjs.
node --test "$SCRIPT_DIR/concurrent-release.test.mjs"

# 2) Static invariant: no *production code path* automates the owner switch
#    to "nomad" - ownership.test.mjs legitimately calls writeApiOwner("nomad")
#    to unit-test the marker mechanism itself, so this only scans non-test
#    source files (release.mjs, reconcile-traffic.mjs, the CLIs, adapters)
#    for a call a future PR might quietly wire into an automated path. The
#    switch must stay an explicit human step (plan section 7 activation).
non_test_source_files=()
while IFS= read -r -d '' file; do
  non_test_source_files+=("$file")
done < <(find "$SCRIPT_DIR" -name '*.mjs' ! -name '*.test.mjs' -print0)
if grep -lEn 'writeApiOwner\(\s*["'"'"']nomad["'"'"']' "${non_test_source_files[@]}" 2>/dev/null; then
  fail_test 'no non-test file in ops/nomad may call writeApiOwner("nomad") - owner switch is an explicit human step, not an automated one (plan section 7)'
fi

# 3) Fresh-state / "host reboot" default: with no marker file at all (the
#    state of every host before this PR's ownership.mjs existed), the CLI
#    must report "compose", not crash or invent a value.
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/sm-nomad-failure-drill.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

owner=$(SOCIAL_MONITOR_DEPLOY_STATE="$FIXTURE/deploy-state" node "$SCRIPT_DIR/ownership.mjs" get-owner)
[[ $owner == "compose" ]] || fail_test "fresh host with no marker must report owner=compose, got: $owner"

# 4) Explicit rollback returns ownership to the prior value: writing "nomad"
#    then rolling back to "compose" must round-trip cleanly through the same
#    CLI a real rollback runbook step would call (plan section 7/10 -
#    "explicit rollback returns the previous owner").
SOCIAL_MONITOR_DEPLOY_STATE="$FIXTURE/deploy-state" node "$SCRIPT_DIR/ownership.mjs" set-owner nomad >/dev/null
owner=$(SOCIAL_MONITOR_DEPLOY_STATE="$FIXTURE/deploy-state" node "$SCRIPT_DIR/ownership.mjs" get-owner)
[[ $owner == "nomad" ]] || fail_test "set-owner nomad must round-trip, got: $owner"

SOCIAL_MONITOR_DEPLOY_STATE="$FIXTURE/deploy-state" node "$SCRIPT_DIR/ownership.mjs" set-owner compose >/dev/null
owner=$(SOCIAL_MONITOR_DEPLOY_STATE="$FIXTURE/deploy-state" node "$SCRIPT_DIR/ownership.mjs" get-owner)
[[ $owner == "compose" ]] || fail_test "explicit rollback to compose must round-trip, got: $owner"

# 5) A malformed marker on disk (corrupt state after an interrupted write,
#    or a stray/tampered file) must fail loudly instead of silently
#    defaulting - a crash-during-write must never be interpreted as a quiet
#    "compose" default once a file actually exists.
mkdir -p "$FIXTURE/deploy-state/nomad"
printf 'not-a-real-owner\n' > "$FIXTURE/deploy-state/nomad/api-owner"
set +e
SOCIAL_MONITOR_DEPLOY_STATE="$FIXTURE/deploy-state" node "$SCRIPT_DIR/ownership.mjs" get-owner >/dev/null 2>/tmp/failure-drill-corrupt-marker.$$
status=$?
set -e
[[ $status -ne 0 ]] || fail_test 'a corrupt marker file must not be silently treated as a valid owner'
rm -f /tmp/failure-drill-corrupt-marker.$$

printf 'nomad failure-drill tests passed\n'
