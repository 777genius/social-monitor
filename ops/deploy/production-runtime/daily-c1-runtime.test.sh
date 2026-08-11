#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
RUNTIME=$SCRIPT_DIR/daily-c1-runtime.sh
FIXTURE=$(mktemp -d /tmp/daily-c1-runtime.XXXXXX)
trap 'rm -rf "$FIXTURE"' EXIT
ROOT=$FIXTURE/root
CONTROL=$ROOT/control
CURRENT=$CONTROL/postgres-runtime-current
REPORTS=$ROOT/artifacts/reports
SHA=1234567890abcdef1234567890abcdef12345678
SECOND_SHA=2234567890abcdef1234567890abcdef12345678
BOOT_ID=11111111-2222-4333-8444-555555555555
INVOCATION_ID=00000000000000000000000000000001
export SOCIAL_MONITOR_DAILY_C1_RUNTIME_TEST_MODE=1
export SOCIAL_MONITOR_DAILY_C1_RUNTIME_TEST_ROOT=$ROOT
export SOCIAL_MONITOR_DAILY_C1_RUNTIME_TEST_TODAY=2026-08-11
export SOCIAL_MONITOR_DAILY_C1_RUNTIME_TEST_BOOT_ID=$BOOT_ID
FLOCK_FAKE=$FIXTURE/flock
printf '%s\n' '#!/usr/bin/env python3' 'import fcntl, sys' \
  'import os' \
  'trace = os.environ.get("FLOCK_TRACE")' \
  'open(trace, "a").write(" ".join(sys.argv[1:]) + "\n") if trace else None' \
  'mode = fcntl.LOCK_SH if "-s" in sys.argv else fcntl.LOCK_EX' \
  'fcntl.flock(int(sys.argv[-1]), mode)' > "$FLOCK_FAKE"
chmod 0755 "$FLOCK_FAKE"
export SOCIAL_MONITOR_DAILY_C1_RUNTIME_TEST_FLOCK=$FLOCK_FAKE
FLOCK_TRACE=$FIXTURE/flock.trace
export FLOCK_TRACE
SYSTEMCTL_FAKE=$FIXTURE/systemctl
SYSTEMCTL_LOG=$FIXTURE/systemctl.log
SYSTEMCTL_STATE=$FIXTURE/systemctl.state
# The single-quoted lines are the literal fake script body.
# shellcheck disable=SC2016
printf '%s\n' '#!/usr/bin/env bash' \
  'printf "%s\n" "$*" >> "$SYSTEMCTL_LOG"' \
  'if [[ $1 == start ]]; then printf active > "$SYSTEMCTL_STATE"; exit 0; fi' \
  'if [[ $1 == show ]]; then [[ -e $SYSTEMCTL_STATE ]] && printf "active\n" || printf "inactive\n"; exit 0; fi' \
  'exit 64' > "$SYSTEMCTL_FAKE"
chmod 0755 "$SYSTEMCTL_FAKE"
export SOCIAL_MONITOR_DAILY_C1_RUNTIME_TEST_SYSTEMCTL=$SYSTEMCTL_FAKE \
  SYSTEMCTL_LOG SYSTEMCTL_STATE
export INVOCATION_ID
install -d -m 0700 "$CURRENT" "$REPORTS" \
  "$CONTROL/reader-summary-daily-c1-baselines"

write_owner() {
  local owner=$1 release_sha=$2
  printf '%s\n' schemaVersion=reader_summary.daily_c1_owner.v1 \
    "owner=$owner" "releaseSha=$release_sha" > \
    "$CONTROL/reader-summary-daily-c1-owner.v1"
  chmod 0444 "$CONTROL/reader-summary-daily-c1-owner.v1"
}

write_current() {
  local sha=$1
  printf '%s\n' "$sha" > "$CURRENT/SOURCE_SHA"
  printf '%s\n' \
    schemaVersion=reader_summary.daily_delivery_readiness.c1 \
    state=READY \
    requires=H_GREEN,C0_GREEN,C1_SCAN_TERMINAL_REPAIR_GREEN \
    activation=reviewed > "$CURRENT/reader-summary-daily-c1.readiness"
}

write_baseline() {
  local sha=$1
  printf '%s\n' schemaVersion=reader_summary.daily_c1_baseline.v1 \
    "releaseSha=$sha" "bootId=$BOOT_ID" previousInvocationId= \
    previousMainTimestampMonotonic=0 > \
    "$CONTROL/reader-summary-daily-c1-baselines/$sha.v1"
  chmod 0444 "$CONTROL/reader-summary-daily-c1-baselines/$sha.v1"
}

assert_fails() {
  local status
  set +e
  "$@" >/dev/null 2>&1
  status=$?
  set -e
  ((status != 0))
}

write_success_receipt() {
  local date=$1
  python3 - "$REPORTS" "$date" <<'PY'
import hashlib, json, os, sys
directory, date = sys.argv[1:]
receipt = {
    "schemaVersion": "reader_summary.daily_delivery_caught_up.c1",
    "eligibleThrough": date,
    "publicationSetSha256": "a" * 64,
}
raw = json.dumps(receipt, separators=(",", ":")).encode() + b"\n"
digest = hashlib.sha256(raw).hexdigest()
dated = os.path.join(directory, f"reader-summary-daily-delivery-caught-up-c1-{date}.json")
pointer = os.path.join(directory, "reader-summary-daily-delivery-caught-up-c1-latest.json")
open(dated, "wb").write(raw)
open(pointer, "wb").write(json.dumps({
    "schemaVersion": "reader_summary.daily_delivery_caught_up_pointer.c1",
    "eligibleThrough": date,
    "receiptSha256": digest,
}, separators=(",", ":")).encode() + b"\n")
os.chmod(dated, 0o444)
os.chmod(pointer, 0o444)
PY
}

write_owner LEGACY "$SHA"
write_current "$SHA"
write_baseline "$SHA"

[[ $($RUNTIME --inspect-owner) == \
  $'OWNER\tLEGACY\t1234567890abcdef1234567890abcdef12345678\t1234567890abcdef1234567890abcdef12345678' ]]
[[ $($RUNTIME --inspect "$SHA" 2026-08-10) == \
  $'NONE\t1234567890abcdef1234567890abcdef12345678\t2026-08-10' ]]
$RUNTIME --check-no-unresolved
# systemd runs ExecStopPost even when ExecCondition skips the oneshot. With no
# STARTED journal that callback must be an idempotent no-op.
SERVICE_RESULT=exec-condition EXIT_CODE=unknown EXIT_STATUS=unknown \
  $RUNTIME --complete-legacy-start
[[ $($RUNTIME --inspect "$SHA" 2026-08-10) == \
  $'NONE\t1234567890abcdef1234567890abcdef12345678\t2026-08-10' ]]
[[ ! -e $CONTROL/reader-summary-daily-c1-contained.v1 ]]
request_dir=$CONTROL/reader-summary-daily-c1-manual-requests/$SHA
mkdir -p "$request_dir"
( $RUNTIME --request-manual-start "$SHA" 2026-08-10 > "$FIXTURE/request.1" ) &
request_pid_1=$!
( $RUNTIME --request-manual-start "$SHA" 2026-08-10 > "$FIXTURE/request.2" ) &
request_pid_2=$!
wait "$request_pid_1" "$request_pid_2"
sort "$FIXTURE/request.1" "$FIXTURE/request.2" | \
  cmp -s - <(printf 'COALESCED\nCREATED\n')
[[ $(grep -Fxc 'start --no-block social-monitor-daily.service' "$SYSTEMCTL_LOG") == 1 ]]
# A durable request without a journal or live unit is safely resubmitted.
rm "$SYSTEMCTL_STATE"
[[ $($RUNTIME --request-manual-start "$SHA" 2026-08-10) == RESUBMITTED ]]
[[ $(grep -Fxc 'start --no-block social-monitor-daily.service' "$SYSTEMCTL_LOG") == 2 ]]
journal=$CONTROL/reader-summary-daily-c1-invocations/$SHA/2026-08-10/journal.v1
# Deployment exclusion wins before decision/journal exposure.
: > "$FLOCK_TRACE"
exec 7>"$CONTROL/production-deploy.lock"
"$FLOCK_FAKE" -x 7
$RUNTIME --prepare-legacy-start 7>&- &
prepare_pid=$!
for _ in {1..100}; do
  grep -Fx -- '-s 8' "$FLOCK_TRACE" >/dev/null 2>&1 && break
  sleep 0.01
done
grep -Fx -- '-s 8' "$FLOCK_TRACE" >/dev/null
[[ ! -e $journal && ! -L $journal ]]
exec 7>&-
wait "$prepare_pid"
[[ -f $journal && ! -L $journal ]]
[[ $(stat -c '%a' "$journal" 2>/dev/null || stat -f '%Lp' "$journal") == 444 ]]
started=$($RUNTIME --inspect "$SHA" 2026-08-10)
[[ $(cut -f1 <<< "$started") == STARTED ]]
[[ $(cut -f5 <<< "$started") == "$INVOCATION_ID" ]]
[[ $(cut -f7 <<< "$started") == manual-reconcile ]]
[[ $(awk -F $'\t' '{print NF}' <<< "$started") == 12 ]]
$RUNTIME --inspect-unresolved "$SHA" | grep -F $'STARTED\t' >/dev/null
assert_fails "$RUNTIME" --check-no-unresolved
assert_fails "$RUNTIME" --prepare-legacy-start
[[ $($RUNTIME --request-manual-start "$SHA" 2026-08-10) == EXISTING_JOURNAL ]]
[[ $(grep -Fxc 'start --no-block social-monitor-daily.service' "$SYSTEMCTL_LOG") == 2 ]]
RUN_ARGS=$FIXTURE/run-args
export RUN_ARGS
# The single-quoted line is the literal fake script body.
# shellcheck disable=SC2016
printf '%s\n' '#!/usr/bin/env bash' \
  'printf "%s\\n" "$*" > "$RUN_ARGS"' > "$CONTROL/daily-run.sh"
chmod 0755 "$CONTROL/daily-run.sh"
write_success_receipt 2026-08-10
$RUNTIME --run-and-complete-legacy
[[ $(<"$RUN_ARGS") == '--frozen-date 2026-08-10' ]]
# ExecStopPost after wrapper completion is an idempotent safe fallback.
SERVICE_RESULT=success EXIT_CODE=exited EXIT_STATUS=0 \
  $RUNTIME --complete-legacy-start
success=$($RUNTIME --inspect "$SHA" 2026-08-10)
[[ $(cut -f1 <<< "$success") == SUCCESS ]]
[[ $(cut -f9 <<< "$success") == success ]]
[[ $(cut -f10 <<< "$success") == exited ]]
[[ $(cut -f11 <<< "$success") == 0 ]]
[[ $(cut -f12 <<< "$success") =~ ^[0-9a-f]{64}$ ]]
$RUNTIME --check-no-unresolved

# Global scan sees an orphan from a previous date and blocks rollover.
old_journal=$CONTROL/reader-summary-daily-c1-invocations/$SHA/2026-08-09/journal.v1
mkdir -p "${old_journal%/*}"
printf '%s\n' schemaVersion=reader_summary.daily_c1_invocation.v1 state=STARTED \
  "releaseSha=$SHA" requestedUtcDate=2026-08-09 "bootId=$BOOT_ID" \
  invocationId=00000000000000000000000000000009 \
  "baselineSha256=$(sha256sum "$CONTROL/reader-summary-daily-c1-baselines/$SHA.v1" | awk '{print $1}')" \
  origin=automatic startedAtRealtimeUsec=900 serviceResult= exitCode= \
  exitStatus= receiptSha256= > "$old_journal"
chmod 0444 "$old_journal"
[[ $($RUNTIME --inspect-unresolved "$SHA" | cut -f3) == 2026-08-09 ]]
assert_fails "$RUNTIME" --check-no-unresolved
assert_fails "$RUNTIME" --prepare-legacy-start
rm "$old_journal"

# Broken journal symlinks fail closed in the global scan.
ln -s missing "$old_journal"
assert_fails "$RUNTIME" --check-no-unresolved
rm "$old_journal"

# A second release/date creates the first automatic journal. Its failed
# ExecStopPost persists containment before the terminal FAILED replacement.
write_current "$SECOND_SHA"
write_baseline "$SECOND_SHA"
export SOCIAL_MONITOR_DAILY_C1_RUNTIME_TEST_TODAY=2026-08-12
export INVOCATION_ID=00000000000000000000000000000002
$RUNTIME --prepare-legacy-start
second=$($RUNTIME --inspect "$SECOND_SHA" 2026-08-11)
[[ $(cut -f1 <<< "$second") == STARTED ]]
[[ $(cut -f7 <<< "$second") == automatic ]]
assert_fails env SERVICE_RESULT=exit-code EXIT_CODE=exited EXIT_STATUS=1 \
  "$RUNTIME" --complete-legacy-start
failed=$($RUNTIME --inspect "$SECOND_SHA" 2026-08-11)
[[ $(cut -f1 <<< "$failed") == FAILED ]]
grep -Fx state=REQUESTED \
  "$CONTROL/reader-summary-daily-c1-contained.v1" >/dev/null
grep -Fx "readySha=$SECOND_SHA" \
  "$CONTROL/reader-summary-daily-c1-contained.v1" >/dev/null
assert_fails "$RUNTIME" --inspect-owner

# Fail closed on symlink/malformed durable control records and invalid manual
# dates. No failed validation may create another journal.
rm "$CONTROL/reader-summary-daily-c1-contained.v1"
mv "$CONTROL/reader-summary-daily-c1-owner.v1" "$CONTROL/owner.real"
ln -s owner.real "$CONTROL/reader-summary-daily-c1-owner.v1"
assert_fails "$RUNTIME" --inspect-owner
rm "$CONTROL/reader-summary-daily-c1-owner.v1"
mv "$CONTROL/owner.real" "$CONTROL/reader-summary-daily-c1-owner.v1"
chmod 0644 "$CONTROL/reader-summary-daily-c1-baselines/$SECOND_SHA.v1"
assert_fails "$RUNTIME" --inspect "$SECOND_SHA" 2026-08-11
chmod 0444 "$CONTROL/reader-summary-daily-c1-baselines/$SECOND_SHA.v1"
assert_fails "$RUNTIME" --request-manual-start "$SECOND_SHA" 2026-08-10

echo 'daily C1 runtime contract test passed'
