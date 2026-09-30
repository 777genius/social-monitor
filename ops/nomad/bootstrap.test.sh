#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
BOOTSTRAP=$SCRIPT_DIR/bootstrap.sh

fail_test() {
  printf 'bootstrap.test: %s\n' "$1" >&2
  exit 1
}

FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/sm-nomad-bootstrap-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

# --dry-run reports the pinned version and never touches the filesystem
# outside of stdout.
output=$(bash "$BOOTSTRAP" --dry-run --root "$FIXTURE/root")
printf '%s\n' "$output" | grep -q 'nomad_version=2.0.6' || \
  fail_test 'dry-run must report the pinned Nomad version'
printf '%s\n' "$output" | grep -q 'would verify pinned Nomad' || \
  fail_test 'dry-run must list its planned actions'
[[ ! -e $FIXTURE/root ]] || fail_test 'dry-run must not create the root path'

# --apply is an explicit, safe refusal in this PR: it must fail rather than
# silently doing nothing or performing an untested mutation.
set +e
bash "$BOOTSTRAP" --apply --root "$FIXTURE/root" >/dev/null 2>"$FIXTURE/bootstrap-apply-stderr"
status=$?
set -e
[[ $status -ne 0 ]] || fail_test '--apply must not report success in this PR'
grep -q 'not implemented' "$FIXTURE/bootstrap-apply-stderr" || \
  fail_test '--apply must explain that it refuses to run'

# Missing mode flag is rejected with the documented usage exit code.
set +e
bash "$BOOTSTRAP" --root "$FIXTURE/root" >/dev/null 2>&1
status=$?
set -e
[[ $status == 64 ]] || fail_test 'missing mode flag must exit 64'

# Unknown flag is rejected the same way.
set +e
bash "$BOOTSTRAP" --dry-run --bogus >/dev/null 2>&1
status=$?
set -e
[[ $status == 64 ]] || fail_test 'unknown flag must exit 64'

printf 'nomad bootstrap tests passed\n'
