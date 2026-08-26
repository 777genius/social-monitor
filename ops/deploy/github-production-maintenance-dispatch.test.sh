#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
WORKFLOW=$SCRIPT_DIR/../../.github/workflows/production-deploy.yml
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/production-maintenance-dispatch.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

cp "$SCRIPT_DIR/github-production-maintenance-dispatch.sh" "$FIXTURE/dispatch.sh"
CLIENT_LOG=$FIXTURE/client.log
cat > "$FIXTURE/github-production-deploy-client.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$CLIENT_LOG"
case ${1:-} in
  maintenance)
    case ${3:-} in
      reader-summary-daily-scan-terminal-preimage-c1)
        node <<'NODE'
const crypto = require("node:crypto");
const zero = { failureQueue: 0, githubCandidates: 0, githubResults: 0, engagementObservations: 0, sourceItems: 0, feedItems: 0, outbox: 0, inbox: 0, idempotency: 0, cursor: 0 };
const common = { attemptNumber: 1, fetched: 0, inserted: 0, skippedDuplicates: 0, projected: 0, schedulerDecisionCount: 1, downstream: zero, failureMetadataSqlNull: true, executionMetadataSqlNull: true };
const targets = [
  { target: "hacker_news", jobId: "e630ed7d-42b7-4bf0-a747-f9bdf0f8a9d7", sourceBindingId: "0348ff97-3925-4d04-a192-7e782badbf50", leaseId: "703fd7b5-cf83-4508-a5b1-5a9dfdc4643e", leasePresent: true, jobStatus: "ENQUEUED", attemptStatus: "RUNNING", ...common, failureReasonSha256: null },
  { target: "reddit", jobId: "b9de1ac8-4490-48d6-befa-a25472b5e94a", sourceBindingId: "8e753ea9-fb03-4c05-8288-6e871cb20b27", leaseId: null, leasePresent: false, jobStatus: "REQUESTED", attemptStatus: "FAILED", ...common, failureReasonSha256: "f6080204874629cf05223f8dc7650330a89106f0e4562a92b4b5310bd9f90ad1" },
];
process.stdout.write(JSON.stringify({ schemaVersion: "reader_summary.daily_scan_terminal_preimage.c1", confirmation: "reader-summary-daily-scan-terminal-repair-c1", capturedAt: "2026-08-11T12:00:00.000Z", reviewedPreimageSha256: "a".repeat(64), targetCount: 2, redactedTargetsSha256: crypto.createHash("sha256").update(JSON.stringify(targets), "utf8").digest("hex"), targets }) + "\n");
NODE
        ;;
      reader-summary-daily-scan-terminal-repair-c1)
        printf '%s\n' '{"schemaVersion":"reader_summary.daily_scan_terminal_repair.c1","confirmation":"reader-summary-daily-scan-terminal-repair-c1","reviewedPreimageSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","transactionTimestamp":"2026-08-11T12:01:00.000Z","targetCount":2,"restoreEvidenceSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","durableReceipt":true}'
        ;;
      reader-summary-daily-delivery-c1-run)
        printf '%s\n' '{"schemaVersion":"reader_summary.daily_delivery_c1_run.v2","confirmation":"reader-summary-daily-delivery-c1-run","releaseSha":"1234567890abcdef1234567890abcdef12345678","requestedUtcDate":"2026-08-10","eligibleThrough":"2026-08-10","nextUnresolvedUtcDate":"2026-08-11","publicationCount":19,"publicationSetSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","receiptSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","journalState":"SUCCESS","serviceInvocationId":"11111111111111111111111111111111","serviceBootId":"11111111-2222-4333-8444-555555555555","baselineSha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","invocationOrigin":"automatic","startedAtRealtimeUsec":"1000","serviceResult":"success","exitCode":"exited","exitStatus":"0","owner":"LEGACY","ownerReleaseSha":"1234567890abcdef1234567890abcdef12345678","legacyTimerUnitFileState":"enabled","legacyTimerActiveState":"active","legacyTimerNextElapseUSecRealtime":"Tue 2026-08-11 00:15:00 UTC","v6TimerUnitFileState":"disabled","v6TimerActiveState":"inactive"}'
        ;;
      reader-summary-daily-delivery-c1-contain)
        printf '%s\n' '{"schemaVersion":"reader_summary.daily_delivery_c1_containment.v1","confirmation":"reader-summary-daily-delivery-c1-contain","releaseSha":"1234567890abcdef1234567890abcdef12345678","state":"CONTAINED","scheduleResumePolicy":"separate-reviewed-clearance-required","legacyTimerUnitFileState":"disabled","legacyTimerActiveState":"inactive","v6TimerUnitFileState":"disabled","v6TimerActiveState":"inactive","legacyServiceActiveState":"inactive","v6ServiceActiveState":"inactive"}'
        ;;
      *) printf 'ordinary-maintenance\n' ;;
    esac
    ;;
  validate-daily-scan-terminal-artifact)
    chmod 0444 "$3"
    ;;
  validate-daily-delivery-c1-artifact)
    chmod 0444 "$3"
    ;;
  *) exit 91 ;;
esac
SH
chmod 0755 "$FIXTURE/dispatch.sh" "$FIXTURE/github-production-deploy-client.sh"

SHA=1234567890abcdef1234567890abcdef12345678
export CLIENT_LOG

run_dispatch() {
  MAINTENANCE_ACTION=$1 GITHUB_SHA=$SHA GITHUB_RUN_ID=701 \
    GITHUB_RUN_ATTEMPT=2 RUNNER_TEMP=$FIXTURE \
    bash "$FIXTURE/dispatch.sh"
}

file_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }

: > "$CLIENT_LOG"
[[ -z $(run_dispatch reader-summary-daily-scan-terminal-preimage-c1) ]]
PREIMAGE=$FIXTURE/reader-summary-daily-scan-terminal-preimage-c1-701-2.json
[[ -f $PREIMAGE && $(file_mode "$PREIMAGE") == 444 ]]
grep -Fx "maintenance $SHA reader-summary-daily-scan-terminal-preimage-c1" "$CLIENT_LOG" >/dev/null
grep -Fx "validate-daily-scan-terminal-artifact preimage $PREIMAGE" "$CLIENT_LOG" >/dev/null
if grep -E 'snapshot|before|after|config|metadata|idempotencyKey|correlationId|workerId|fencingToken' "$PREIMAGE" >/dev/null; then
  echo 'preimage artifact exposed private target evidence' >&2
  exit 1
fi

: > "$CLIENT_LOG"
[[ -z $(
  DAILY_SCAN_TERMINAL_REPAIR_CONFIRMATION=reader-summary-daily-scan-terminal-repair-c1 \
  DAILY_SCAN_TERMINAL_REPAIR_PREIMAGE_SHA256=$(printf 'a%.0s' {1..64}) \
    run_dispatch reader-summary-daily-scan-terminal-repair-c1
) ]]
REPAIR=$FIXTURE/reader-summary-daily-scan-terminal-repair-c1-701-2.json
[[ -f $REPAIR && $(file_mode "$REPAIR") == 444 ]]
grep -Fx "maintenance $SHA reader-summary-daily-scan-terminal-repair-c1 reader-summary-daily-scan-terminal-repair-c1 $(printf 'a%.0s' {1..64})" "$CLIENT_LOG" >/dev/null
grep -Fx "validate-daily-scan-terminal-artifact repair $REPAIR $(printf 'a%.0s' {1..64})" "$CLIENT_LOG" >/dev/null
if grep -E 'targets|before|after|jobId|sourceBindingId' "$REPAIR" >/dev/null; then
  echo 'repair artifact exposed private target evidence' >&2
  exit 1
fi

: > "$CLIENT_LOG"
if DAILY_SCAN_TERMINAL_REPAIR_CONFIRMATION=reader-summary-daily-scan-terminal-repair-c1 \
  run_dispatch reader-summary-daily-scan-terminal-preimage-c1 >/dev/null 2>&1; then
  echo 'preimage action accepted repair authorization' >&2
  exit 1
fi
[[ ! -s $CLIENT_LOG ]]

: > "$CLIENT_LOG"
DAILY_DELIVERY_C1_CONFIRMATION=reader-summary-daily-delivery-c1-run \
DAILY_DELIVERY_C1_RECOVERY_THROUGH=2026-08-10 \
  run_dispatch reader-summary-daily-delivery-c1-run >/dev/null
RUN_ARTIFACT=$FIXTURE/reader-summary-daily-delivery-c1-run-701-2.json
[[ -f $RUN_ARTIFACT && $(file_mode "$RUN_ARTIFACT") == 444 ]]
grep -Fx "maintenance $SHA reader-summary-daily-delivery-c1-run reader-summary-daily-delivery-c1-run 2026-08-10" "$CLIENT_LOG" >/dev/null
grep -Fx "validate-daily-delivery-c1-artifact run $RUN_ARTIFACT $SHA 2026-08-10" "$CLIENT_LOG" >/dev/null

: > "$CLIENT_LOG"
DAILY_DELIVERY_C1_CONFIRMATION=reader-summary-daily-delivery-c1-contain \
DAILY_DELIVERY_C1_READY_SHA=$SHA \
  run_dispatch reader-summary-daily-delivery-c1-contain >/dev/null
CONTAIN_ARTIFACT=$FIXTURE/reader-summary-daily-delivery-c1-contain-701-2.json
[[ -f $CONTAIN_ARTIFACT && $(file_mode "$CONTAIN_ARTIFACT") == 444 ]]
grep -Fx "maintenance $SHA reader-summary-daily-delivery-c1-contain reader-summary-daily-delivery-c1-contain $SHA" "$CLIENT_LOG" >/dev/null
grep -Fx "validate-daily-delivery-c1-artifact contain $CONTAIN_ARTIFACT $SHA" "$CLIENT_LOG" >/dev/null

for invalid in wrong-confirmation wrong-date foreign-input; do
  : > "$CLIENT_LOG"
  case $invalid in
    wrong-confirmation) DAILY_DELIVERY_C1_CONFIRMATION=wrong DAILY_DELIVERY_C1_RECOVERY_THROUGH=2026-08-10 \
      ;;
    wrong-date) DAILY_DELIVERY_C1_CONFIRMATION=reader-summary-daily-delivery-c1-run DAILY_DELIVERY_C1_RECOVERY_THROUGH=not-a-date \
      ;;
    foreign-input) DAILY_DELIVERY_C1_CONFIRMATION=reader-summary-daily-delivery-c1-run DAILY_DELIVERY_C1_RECOVERY_THROUGH=2026-08-10 DAILY_SCAN_TERMINAL_REPAIR_CONFIRMATION=x \
      ;;
  esac
  if env DAILY_DELIVERY_C1_CONFIRMATION="${DAILY_DELIVERY_C1_CONFIRMATION:-}" \
      DAILY_DELIVERY_C1_RECOVERY_THROUGH="${DAILY_DELIVERY_C1_RECOVERY_THROUGH:-}" \
      DAILY_SCAN_TERMINAL_REPAIR_CONFIRMATION="${DAILY_SCAN_TERMINAL_REPAIR_CONFIRMATION:-}" \
      MAINTENANCE_ACTION=reader-summary-daily-delivery-c1-run GITHUB_SHA=$SHA \
      GITHUB_RUN_ID=701 GITHUB_RUN_ATTEMPT=2 RUNNER_TEMP="$FIXTURE" \
      bash "$FIXTURE/dispatch.sh" >/dev/null 2>&1; then
    echo "invalid C1 run dispatch was accepted: $invalid" >&2
    exit 1
  fi
  [[ ! -s $CLIENT_LOG ]]
  unset DAILY_DELIVERY_C1_CONFIRMATION DAILY_DELIVERY_C1_RECOVERY_THROUGH \
    DAILY_SCAN_TERMINAL_REPAIR_CONFIRMATION
done

grep -F 'bash ops/deploy/github-production-maintenance-dispatch.sh' "$WORKFLOW" >/dev/null
[[ $(grep -Fc 'uses: actions/upload-artifact@' "$WORKFLOW") == 3 ]]
[[ $(grep -Fc 'name: Store unique immutable maintenance artifact' "$WORKFLOW") == 1 ]]
# Literal GitHub expressions are asserted.
# shellcheck disable=SC2016
grep -F 'name: ${{ inputs.maintenance_action }}-${{ github.run_id }}-${{ github.run_attempt }}' "$WORKFLOW" >/dev/null
# Literal GitHub expressions are asserted.
# shellcheck disable=SC2016
grep -F 'path: ${{ runner.temp }}/${{ inputs.maintenance_action }}-${{ github.run_id }}-${{ github.run_attempt }}.json' "$WORKFLOW" >/dev/null
[[ $(wc -l < "$WORKFLOW") -lt 1000 ]]

echo 'Production maintenance dispatch tests passed'
