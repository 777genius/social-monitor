#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
RUNNER=$SCRIPT_DIR/daily-collection-run.sh
SERVICE=$SCRIPT_DIR/social-monitor-post-collection.service
TIMER=$SCRIPT_DIR/social-monitor-daily.timer

grep -F 'date -u +%F' "$RUNNER" >/dev/null
grep -F 'daily-collection-singleton.lock' "$RUNNER" >/dev/null
grep -F 'daily-run.lock' "$RUNNER" >/dev/null
grep -F 'runtime_release != "$backend_release"' "$RUNNER" >/dev/null
grep -F 'run:reader-summary-clean-real-day-collection' "$RUNNER" >/dev/null
grep -F -- '--update --date "$1"' "$RUNNER" >/dev/null
! grep -F -- '--wait-for-x-readiness' "$RUNNER" >/dev/null
grep -F 'successfulProviderCount' "$RUNNER" >/dev/null
grep -F 'fetchedItemCount' "$RUNNER" >/dev/null
grep -F 'insertedItemCount' "$RUNNER" >/dev/null
grep -F 'social_monitor.daily_collection_receipt.v1' "$RUNNER" >/dev/null
grep -F 'if ((collection_status != 0)); then' "$RUNNER" >/dev/null
grep -F 'data.get("blockingPassed") is not True' "$RUNNER" >/dev/null
grep -F '\"summaryQualityGatePassed\":true' "$RUNNER" >/dev/null

for forbidden in \
  run-reader-summary-daily-catch-up \
  run-reader-summary-daily-terminal \
  reader-summary-daily-canonical-recovery \
  run:reader-summary-weekly-production; do
  ! grep -F "$forbidden" "$RUNNER" >/dev/null
done

grep -Fx 'ExecStart=/var/data/social-monitor/control/daily-collection-run.sh' \
  "$SERVICE" >/dev/null
grep -Fx 'TimeoutStartSec=5400' "$SERVICE" >/dev/null
[[ $(grep -c '^ExecStart=' "$SERVICE") -eq 1 ]]
! grep -F 'daily-c1-runtime.sh' "$SERVICE" >/dev/null
grep -Fx 'Unit=social-monitor-daily.service' "$TIMER" >/dev/null

bash -n "$RUNNER"

test_root=$(mktemp -d)
trap 'rm -rf "$test_root"' EXIT HUP INT TERM
mkdir -p "$test_root/bin" "$test_root/control/deploy-state" \
  "$test_root/control/postgres-runtime-current" "$test_root/artifacts/evals"
release=0123456789abcdef0123456789abcdef01234567
printf '%s\n' "$release" >"$test_root/control/deploy-state/backend.sha"
printf '%s\n' "$release" >"$test_root/control/postgres-runtime-current/READY"

sed \
  -e "s|^PATH=.*|PATH=$test_root/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin|" \
  -e 's|^ROOT=/var/data/social-monitor$|ROOT=$TEST_ROOT|' \
  "$RUNNER" >"$test_root/runner.sh"
chmod +x "$test_root/runner.sh"

cat >"$test_root/bin/flock" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat >"$test_root/bin/docker" <<'EOF'
#!/usr/bin/env bash
cp "$FIXTURE_ARTIFACT" \
  "$TEST_ROOT/artifacts/evals/reader-summary-clean-real-day-collection.v1.json"
exit "$FIXTURE_COLLECTION_STATUS"
EOF
chmod +x "$test_root/bin/flock" "$test_root/bin/docker"

write_artifact() {
  local blocking_passed=$1
  cat >"$test_root/artifact.json" <<EOF
{"run":{"collectionDate":"2026-08-12"},"scans":[{"status":"succeeded","fetched":1,"inserted":1,"skippedDuplicates":0}],"blockingPassed":$blocking_passed}
EOF
}

run_fixture() {
  TEST_ROOT=$test_root FIXTURE_ARTIFACT=$test_root/artifact.json \
    FIXTURE_COLLECTION_STATUS=$1 "$test_root/runner.sh" 2026-08-12
}

write_artifact true
if run_fixture 23 >"$test_root/nonzero.out" 2>&1; then
  echo 'daily collection runner accepted a failed collection process' >&2
  exit 1
fi
grep -F 'daily collection process failed with status 23' "$test_root/nonzero.out" >/dev/null
! grep -F 'outcome=SUCCESS' "$test_root/nonzero.out" >/dev/null
[[ ! -e $test_root/artifacts/daily-collection/collection.2026-08-12.receipt.v1.json ]]

write_artifact false
if run_fixture 0 >"$test_root/quality.out" 2>&1; then
  echo 'daily collection runner accepted a failed artifact quality gate' >&2
  exit 1
fi
grep -F 'daily collection artifact failed its quality gate' "$test_root/quality.out" >/dev/null
! grep -F 'outcome=SUCCESS' "$test_root/quality.out" >/dev/null
[[ ! -e $test_root/artifacts/daily-collection/collection.2026-08-12.receipt.v1.json ]]

write_artifact true
run_fixture 0 >"$test_root/success.out" 2>&1
grep -F 'outcome=SUCCESS' "$test_root/success.out" >/dev/null
python3 - "$test_root/artifacts/daily-collection/collection.2026-08-12.receipt.v1.json" <<'PY'
import json, sys
receipt = json.load(open(sys.argv[1], encoding="utf-8"))
assert receipt["status"] == "SUCCESS"
assert receipt["summaryQualityGatePassed"] is True
PY

printf 'daily collection-only runtime contract test passed\n'
