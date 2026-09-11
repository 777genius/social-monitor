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

# Missing ownership.mjs (node unavailable) fails open: no filtering happens.
node_dir=$(dirname "$(command -v node)")
safe_path=$(printf '%s' "$PATH" | tr ':' '\n' | grep -vFx "$node_dir" | paste -sd: -)
actual=$(PATH="$safe_path" SOCIAL_MONITOR_DEPLOY_STATE="$STATE" bash "$GUARD" filter api <<< $'api\ningestion-worker')
[[ $actual == $'api\ningestion-worker' ]] || fail_test 'a missing node must fail open, not drop services'

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
