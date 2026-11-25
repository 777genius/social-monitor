#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
GUARD=$SCRIPT_DIR/ownership-guard.sh

fail_test() {
  printf 'ownership-guard.test: %s\n' "$1" >&2
  exit 1
}

STATE=$(mktemp -d "${TMPDIR:-/tmp}/sm-ownership-guard-test.XXXXXX")
trap 'rm -rf "$STATE"' EXIT

# Default (no marker written) is compose: nothing is filtered out.
actual=$(SOCIAL_MONITOR_DEPLOY_STATE="$STATE" bash "$GUARD" filter api <<< $'api\ningestion-worker')
expected=$'api\ningestion-worker'
[[ $actual == "$expected" ]] || fail_test 'default compose owner must not filter services'

# Explicit nomad owner drops exactly the named service.
SOCIAL_MONITOR_DEPLOY_STATE="$STATE" node "$SCRIPT_DIR/ownership.mjs" set-owner nomad
actual=$(SOCIAL_MONITOR_DEPLOY_STATE="$STATE" bash "$GUARD" filter api <<< $'api\ningestion-worker')
expected='ingestion-worker'
[[ $actual == "$expected" ]] || fail_test 'nomad owner must filter out the named service'

# nomad owner with the named service absent leaves the rest untouched.
actual=$(SOCIAL_MONITOR_DEPLOY_STATE="$STATE" bash "$GUARD" filter api <<< 'ingestion-worker')
[[ $actual == 'ingestion-worker' ]] || fail_test 'nomad owner must not touch unrelated services'

# Switching back to compose restores the unfiltered list.
SOCIAL_MONITOR_DEPLOY_STATE="$STATE" node "$SCRIPT_DIR/ownership.mjs" set-owner compose
actual=$(SOCIAL_MONITOR_DEPLOY_STATE="$STATE" bash "$GUARD" filter api <<< $'api\ningestion-worker')
[[ $actual == $'api\ningestion-worker' ]] || \
  fail_test 'reverting to compose must restore the unfiltered list'

# Missing node (ownership check cannot run) fails closed: refuse rather
# than silently assuming "compose" and letting a caller mutate a service
# Nomad might actually already own.
#
# `command -v` only reports the first PATH hit, but a dev machine can have
# node resolvable from more than one directory (e.g. both Homebrew and a
# stray /usr/local/bin) - stripping only the first would leave node
# reachable via the other and silently exercise the wrong code path.
safe_path=""
IFS=':' read -ra path_dirs <<< "$PATH"
for path_dir in "${path_dirs[@]}"; do
  [[ -x "$path_dir/node" ]] && continue
  safe_path+="${safe_path:+:}$path_dir"
done
# Earlier lines in this script already ran `node ...` at its real location,
# so bash has that resolved path cached in its command hash table. A
# temporary `PATH=... command` prefix does not itself invalidate that cache,
# so `command -v node` would keep reporting the stale, real path here
# without this - silently testing nothing.
hash -r
PATH="$safe_path" command -v node >/dev/null 2>&1 && fail_test 'test setup bug: node is still reachable after PATH scrubbing'
set +e
# $BASH (this interpreter's own absolute path), not a bare `bash` that
# would itself need to resolve through the just-scrubbed $safe_path - if
# bash's own directory were ever removed by that scrub, a bare `bash` here
# would fail with "command not found" (also non-zero) and the assertion
# below would pass for the wrong reason, without ownership-guard.sh having
# run at all.
PATH="$safe_path" SOCIAL_MONITOR_DEPLOY_STATE="$STATE" "$BASH" "$GUARD" filter api \
  <<< $'api\ningestion-worker' >"$STATE/missing-node-stdout" 2>"$STATE/missing-node-stderr"
status=$?
set -e
[[ $status -ne 0 ]] || fail_test 'a missing node must refuse (fail closed), not silently pass services through'
grep -q 'could not determine the API owner' "$STATE/missing-node-stderr" || \
  fail_test 'the refusal must come from ownership-guard.sh itself, not an unrelated failure'

# A service name containing a regex metacharacter is matched literally, not
# as a pattern (grep -Fx, not -x): a stray "." must not make this match more
# or fewer lines than the exact literal service name would.
SOCIAL_MONITOR_DEPLOY_STATE="$STATE" node "$SCRIPT_DIR/ownership.mjs" set-owner nomad
actual=$(SOCIAL_MONITOR_DEPLOY_STATE="$STATE" bash "$GUARD" filter 'x.collector' <<< $'x.collector\nxacollector\napi')
expected=$'xacollector\napi'
[[ $actual == "$expected" ]] || fail_test 'a regex metacharacter in the service name must be matched literally'
SOCIAL_MONITOR_DEPLOY_STATE="$STATE" node "$SCRIPT_DIR/ownership.mjs" set-owner compose

# Missing arguments are rejected with the documented usage exit code.
set +e
bash "$GUARD" filter >/dev/null 2>&1
status=$?
set -e
[[ $status == 64 ]] || fail_test 'missing service argument must exit 64'

printf 'ownership-guard tests passed\n'
