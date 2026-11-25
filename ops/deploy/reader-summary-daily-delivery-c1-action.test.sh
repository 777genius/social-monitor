#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/daily-delivery-c1-action.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT
ROOT=$FIXTURE/root
REPO=$FIXTURE/repo
CONTROL=$ROOT/control
STATE=$CONTROL/deploy-state
POSTGRES_RUNTIME_CURRENT=$CONTROL/postgres-runtime-current
POSTGRES_RUNTIME_RELEASES=$CONTROL/postgres-runtime-releases
SYSTEMD_UNIT_DIR=$ROOT/systemd
DEPLOY_LOCK=$CONTROL/production-deploy.lock
DAILY_SINGLETON_LOCK=$CONTROL/daily-run-singleton.lock
POSTGRES_ADMISSION_LOCK=$CONTROL/daily-run.lock
mkdir -p "$ROOT/artifacts/reports" "$POSTGRES_RUNTIME_CURRENT" "$STATE" \
  "$REPO" "$SYSTEMD_UNIT_DIR"

fail() { printf 'test-failure: %s\n' "$*" >&2; return 1; }
flock() { printf 'flock=%s\n' "$*" >> "${SYSTEMCTL_LOG:-/dev/null}"; }
# shellcheck source=ops/deploy/reader-summary-recovery-maintenance-lib.sh
source "$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.sh"

SHA=1234567890abcdef1234567890abcdef12345678
BOOT_ID=11111111-2222-4333-8444-555555555555
INVOCATION_ID=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
BASELINE_SHA=$(printf 'b%.0s' {1..64})
SYSTEMCTL_LOG=$FIXTURE/systemctl.log
JOURNAL_STATE_FILE=$FIXTURE/journal-state
JOURNAL_ORIGIN_FILE=$FIXTURE/journal-origin
JOURNAL_RECEIPT_FILE=$FIXTURE/journal-receipt
REQUEST_FILE=$FIXTURE/manual-request
SERVICE_ACTIVE=$FIXTURE/service-active
PREJOURNAL=$FIXTURE/prejournal
HOLD_STARTED=$FIXTURE/hold-started
BAD_LEGACY_TIMER=$FIXTURE/bad-legacy-timer
BAD_OWNER=$FIXTURE/bad-owner
BAD_LIVE_INVOCATION=$FIXTURE/bad-live-invocation
OLD_STARTED=$FIXTURE/old-started
CURRENT_YESTERDAY=2026-08-10

daily_delivery_c1_current_utc_yesterday() { printf '%s\n' "$CURRENT_YESTERDAY"; }
verify_daily_delivery_c1_activation() { printf 'activation=%s\n' "$1" >> "$SYSTEMCTL_LOG"; }
verify_daily_delivery_c1_containment_activation() { verify_daily_delivery_c1_activation "$1"; }
verify_postgres_runtime_daily_c1_ready_topology() { return 0; }
postgres_runtime_daily_c1_containment_state() {
  [[ -f $CONTROL/reader-summary-daily-c1-contained.v1 ]] || { printf 'clear\n'; return; }
  sed -n '2s/^state=//p' "$CONTROL/reader-summary-daily-c1-contained.v1" | tr '[:upper:]' '[:lower:]'
}
persist_postgres_runtime_daily_c1_containment_requested() {
  [[ ! -f $CONTROL/reader-summary-daily-c1-contained.v1 ]] || return 0
  printf 'schemaVersion=reader_summary.daily_c1_containment.v1\nstate=REQUESTED\nreadySha=%s\n' \
    "$1" > "$CONTROL/reader-summary-daily-c1-contained.v1"
  chmod 0444 "$CONTROL/reader-summary-daily-c1-contained.v1"
}
verify_postgres_runtime_daily_c1_containment() {
  grep -Fx "readySha=$1" "$CONTROL/reader-summary-daily-c1-contained.v1" >/dev/null &&
    grep -Fx "state=$2" "$CONTROL/reader-summary-daily-c1-contained.v1" >/dev/null
}
promote_postgres_runtime_daily_c1_containment_contained() {
  chmod 0644 "$CONTROL/reader-summary-daily-c1-contained.v1"
  sed -i.bak 's/state=REQUESTED/state=CONTAINED/' \
    "$CONTROL/reader-summary-daily-c1-contained.v1"
  chmod 0444 "$CONTROL/reader-summary-daily-c1-contained.v1"
}
enforce_postgres_runtime_daily_c1_containment() { return 0; }
verify_postgres_runtime_daily_c1_contained_topology() { return 0; }
acquire_daily_runner_maintenance_locks() { printf 'locks\n' >> "$SYSTEMCTL_LOG"; }

set_journal() {
  printf '%s\n' "$1" > "$JOURNAL_STATE_FILE"
  printf '%s\n' "${2:-automatic}" > "$JOURNAL_ORIGIN_FILE"
  printf '%s\n' "${3:-$RECEIPT_SHA}" > "$JOURNAL_RECEIPT_FILE"
}
daily_delivery_c1_runtime() {
  case $1 in
    --inspect-owner)
      if [[ -e $BAD_OWNER ]]; then
        printf 'OWNER\tV6\t%s\t%s\n' "$SHA" "$SHA"
      else
        printf 'OWNER\tLEGACY\t%s\t%s\n' "$SHA" "$SHA"
      fi
      ;;
    --request-manual-start)
      if [[ -e $JOURNAL_STATE_FILE ]]; then
        printf 'EXISTING_JOURNAL\n'
        return
      fi
      if (set -o noclobber; : > "$REQUEST_FILE") 2>/dev/null; then
        daily_delivery_c1_systemctl start --no-block \
          social-monitor-daily.service >&2
        printf 'CREATED\n'
      else
        daily_delivery_c1_systemctl start --no-block \
          social-monitor-daily.service >&2
        printf 'RESUBMITTED\n'
      fi
      ;;
    --inspect-unresolved)
      if [[ -e $OLD_STARTED ]]; then
        printf 'STARTED\t%s\t2026-08-09\t%s\t%s\t%s\tautomatic\t900\t\t\t\t\n' \
          "$2" "$BOOT_ID" "$INVOCATION_ID" "$BASELINE_SHA"
      else
        local unresolved_state
        unresolved_state=$(cat "$JOURNAL_STATE_FILE" 2>/dev/null || printf NONE)
        if [[ $unresolved_state == STARTED || $unresolved_state == FAILED ]]; then
          daily_delivery_c1_runtime --inspect "$2" 2026-08-10
        else
          printf 'NONE\t%s\n' "$2"
        fi
      fi
      ;;
    --inspect)
      local journal_state origin receipt
      journal_state=$(cat "$JOURNAL_STATE_FILE" 2>/dev/null || printf 'NONE')
      if [[ $journal_state == NONE ]]; then
        printf 'NONE\t%s\t%s\n' "$2" "$3"
        return
      fi
      origin=$(cat "$JOURNAL_ORIGIN_FILE")
      receipt=$(cat "$JOURNAL_RECEIPT_FILE")
      if [[ $journal_state == STARTED ]]; then
        printf 'STARTED\t%s\t%s\t%s\t%s\t%s\t%s\t1000\t\t\t\t\n' \
          "$2" "$3" "$BOOT_ID" "$INVOCATION_ID" "$BASELINE_SHA" "$origin"
      else
        printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t1000\t%s\texited\t%s\t%s\n' \
          "$journal_state" "$2" "$3" "$BOOT_ID" "$INVOCATION_ID" \
          "$BASELINE_SHA" "$origin" \
          "$([[ $journal_state == SUCCESS ]] && printf success || printf failed)" \
          "$([[ $journal_state == SUCCESS ]] && printf 0 || printf 1)" "$receipt"
      fi
      ;;
    *) return 90 ;;
  esac
}
daily_delivery_c1_systemctl() {
  printf '%s\n' "$*" >> "$SYSTEMCTL_LOG"
  if [[ $1 == start ]]; then
    [[ $* == 'start --no-block social-monitor-daily.service' ]] || return 91
    printf 'STARTED\n' > "$JOURNAL_STATE_FILE"
    printf 'manual-reconcile\n' > "$JOURNAL_ORIGIN_FILE"
    : > "$SERVICE_ACTIVE"
    return
  fi
  if [[ $1 == stop || $1 == disable ]]; then return 0; fi
  case $2 in
    --property=ActiveState)
      case ${*: -1} in
        social-monitor-daily.service) [[ -e $SERVICE_ACTIVE ]] && printf 'active\n' || printf 'inactive\n' ;;
        social-monitor-daily.timer) [[ -e $BAD_LEGACY_TIMER ]] && printf 'inactive\n' || printf 'active\n' ;;
        *) printf 'inactive\n' ;;
      esac ;;
    --property=UnitFileState)
      case ${*: -1} in social-monitor-daily.timer) printf 'enabled\n' ;; *) printf 'disabled\n' ;; esac ;;
    --property=InvocationID)
      if [[ -e $BAD_LIVE_INVOCATION ]]; then
        printf 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n'
      else
        printf '%s\n' "$INVOCATION_ID"
      fi
      ;;
    --property=Result) printf 'success\n' ;;
    --property=ExecMainStatus|--property=ExecConditionStatus) printf '0\n' ;;
    --property=NextElapseUSecRealtime)
      [[ ! -e $BAD_LEGACY_TIMER ]] && printf 'Tue 2026-08-11 00:15:00 UTC\n' || printf 'n/a\n' ;;
    *) return 92 ;;
  esac
}
daily_delivery_c1_sleep() {
  if [[ -e $PREJOURNAL ]]; then
    rm "$PREJOURNAL"
    set_journal STARTED automatic
  elif [[ $(cat "$JOURNAL_STATE_FILE" 2>/dev/null || true) == STARTED && ! -e $HOLD_STARTED ]]; then
    set_journal SUCCESS "$(cat "$JOURNAL_ORIGIN_FILE")"
    rm -f "$SERVICE_ACTIVE"
  fi
}

run_c1() {
  printf '%s %s\n' reader-summary-daily-delivery-c1-run "$1" |
    run_reader_summary_daily_delivery_c1 "$SHA"
}
assert_fails() {
  local status
  set +e
  (set -e; "$@") >/dev/null 2>&1
  status=$?
  set -e
  ((status != 0))
}
reset_case() {
  : > "$SYSTEMCTL_LOG"
  rm -f "$JOURNAL_STATE_FILE" "$JOURNAL_ORIGIN_FILE" "$JOURNAL_RECEIPT_FILE" \
    "$REQUEST_FILE" "$SERVICE_ACTIVE" "$PREJOURNAL" "$HOLD_STARTED" \
    "$BAD_LEGACY_TIMER" "$BAD_OWNER" "$BAD_LIVE_INVOCATION" \
    "$OLD_STARTED" \
    "$CONTROL/reader-summary-daily-c1-contained.v1"
  CURRENT_YESTERDAY=2026-08-10
}

node - "$ROOT/artifacts/reports" <<'NODE'
const fs=require("node:fs"),crypto=require("node:crypto"),path=require("node:path"),dir=process.argv[2],first=new Date("2026-07-23T00:00:00Z"),last=new Date("2026-08-10T00:00:00Z"),dates=[];
for(let day=first;day<=last;day=new Date(day.getTime()+86400000))dates.push(day.toISOString().slice(0,10));
const publications=dates.map((requestedUtcDate,index)=>({requestedUtcDate,readerSummaryJobId:`00000000-0000-7000-8000-${String(index+1).padStart(12,"0")}`,readerSummaryArtifactId:`00000000-0000-7000-8001-${String(index+1).padStart(12,"0")}`,publicationId:`00000000-0000-7000-8002-${String(index+1).padStart(12,"0")}`,reportSha256:"a".repeat(64),proofSha256:"b".repeat(64),weeklyEvidenceSha256:"c".repeat(64),publicEvidenceSha256:"d".repeat(64),publicFrontendSha256:"e".repeat(64)}));
const publicationSetSha256=crypto.createHash("sha256").update(JSON.stringify(publications)).digest("hex"),receipt={schemaVersion:"reader_summary.daily_delivery_caught_up.c1",firstRequiredUtcDate:dates[0],eligibleThrough:dates.at(-1),publishedDates:dates,publications,publicationSetSha256},bytes=Buffer.from(JSON.stringify(receipt)+"\n"),receiptSha256=crypto.createHash("sha256").update(bytes).digest("hex");
const dated=path.join(dir,`reader-summary-daily-delivery-caught-up-c1-${dates.at(-1)}.json`),latest=path.join(dir,"reader-summary-daily-delivery-caught-up-c1-latest.json");fs.writeFileSync(dated,bytes,{mode:0o444});fs.chmodSync(dated,0o444);fs.writeFileSync(latest,JSON.stringify({schemaVersion:"reader_summary.daily_delivery_caught_up_pointer.c1",eligibleThrough:dates.at(-1),receiptSha256})+"\n",{mode:0o444});fs.chmodSync(latest,0o444);
NODE
RECEIPT_SHA=$(sha256sum "$ROOT/artifacts/reports/reader-summary-daily-delivery-caught-up-c1-2026-08-10.json" | awk '{print $1}')
stat() {
  if [[ ${1:-} == -c ]]; then
    printf '444\n'
  else
    command stat "$@"
  fi
}

# Automatic completion before the action and SSH retry reconcile without start.
reset_case
set_journal SUCCESS automatic
automatic_output=$(run_c1 2026-08-10)
grep -F '"schemaVersion":"reader_summary.daily_delivery_c1_run.v2"' <<< "$automatic_output" >/dev/null
grep -F '"invocationOrigin":"automatic"' <<< "$automatic_output" >/dev/null
[[ $(wc -l <<< "$automatic_output") == 1 ]]
node - "$automatic_output" <<'NODE'
const value=JSON.parse(process.argv[2]);
const keys=["schemaVersion","confirmation","releaseSha","requestedUtcDate","eligibleThrough","nextUnresolvedUtcDate","publicationCount","publicationSetSha256","receiptSha256","journalState","serviceInvocationId","serviceBootId","baselineSha256","invocationOrigin","startedAtRealtimeUsec","serviceResult","exitCode","exitStatus","owner","ownerReleaseSha","legacyTimerUnitFileState","legacyTimerActiveState","legacyTimerNextElapseUSecRealtime","v6TimerUnitFileState","v6TimerActiveState"];
if(JSON.stringify(Object.keys(value))!==JSON.stringify(keys)||value.journalState!=="SUCCESS"||value.serviceBootId!=="11111111-2222-4333-8444-555555555555"||value.baselineSha256!=="b".repeat(64)||value.owner!=="LEGACY")process.exit(1);
NODE
if grep -F 'start --no-block' "$SYSTEMCTL_LOG" >/dev/null; then exit 1; fi
retry_output=$(run_c1 2026-08-10)
[[ $retry_output == "$automatic_output" ]]

# Durable terminal proof survives reboot/stale systemd invocation metadata.
: > "$BAD_LIVE_INVOCATION"
reboot_output=$(run_c1 2026-08-10)
[[ $reboot_output == "$automatic_output" ]]
rm "$BAD_LIVE_INVOCATION"

# No journal + inactive service creates one request and one manual start.
reset_case
manual_output=$(run_c1 2026-08-10)
grep -F '"invocationOrigin":"manual-reconcile"' <<< "$manual_output" >/dev/null
[[ $(grep -Fxc 'start --no-block social-monitor-daily.service' "$SYSTEMCTL_LOG") == 1 ]]
unlock_line=$(grep -nF 'flock=-u 7' "$SYSTEMCTL_LOG" | head -1 | cut -d: -f1)
start_line=$(grep -nF 'start --no-block social-monitor-daily.service' \
  "$SYSTEMCTL_LOG" | head -1 | cut -d: -f1)
((unlock_line < start_line))
run_c1 2026-08-10 >/dev/null
[[ $(grep -Fxc 'start --no-block social-monitor-daily.service' "$SYSTEMCTL_LOG") == 1 ]]

# An automatic service active before ExecStartPre is observed and attached.
reset_case
: > "$SERVICE_ACTIVE"
: > "$PREJOURNAL"
active_output=$(run_c1 2026-08-10)
grep -F '"invocationOrigin":"automatic"' <<< "$active_output" >/dev/null
if grep -F 'start --no-block' "$SYSTEMCTL_LOG" >/dev/null; then exit 1; fi

# FAILED and orphan STARTED force durable containment; later live success cannot mask FAILED.
for failed_state in FAILED STARTED; do
  reset_case
  set_journal "$failed_state" automatic
  assert_fails run_c1 2026-08-10
  grep -Fx 'state=CONTAINED' "$CONTROL/reader-summary-daily-c1-contained.v1" >/dev/null
done

# A live service with a different InvocationID does not satisfy STARTED attach.
reset_case
set_journal STARTED automatic
: > "$SERVICE_ACTIVE"
: > "$BAD_LIVE_INVOCATION"
assert_fails run_c1 2026-08-10
grep -Fx 'state=CONTAINED' "$CONTROL/reader-summary-daily-c1-contained.v1" >/dev/null

# A previous-date orphan is globally visible and blocks midnight rollover.
reset_case
: > "$OLD_STARTED"
assert_fails run_c1 2026-08-10
grep -Fx 'state=CONTAINED' "$CONTROL/reader-summary-daily-c1-contained.v1" >/dev/null

# Historical dates are accepted only with an existing matching journal.
reset_case
CURRENT_YESTERDAY=2026-08-11
set_journal SUCCESS automatic
run_c1 2026-08-10 >/dev/null
reset_case
CURRENT_YESTERDAY=2026-08-11
assert_fails run_c1 2026-08-10
if grep -F 'start --no-block' "$SYSTEMCTL_LOG" >/dev/null; then exit 1; fi

# Receipt mismatch and stale final owner/timer proofs fail closed.
for bad_case in receipt owner timer; do
  reset_case
  set_journal SUCCESS automatic
  case $bad_case in
    receipt) printf '%064d\n' 0 > "$JOURNAL_RECEIPT_FILE" ;;
    owner) : > "$BAD_OWNER" ;;
    timer) : > "$BAD_LEGACY_TIMER" ;;
  esac
  assert_fails run_c1 2026-08-10
done

# Run reconciliation never mutates either timer.
if grep -E '^(stop|disable|start) .*timer' "$SYSTEMCTL_LOG" >/dev/null; then exit 1; fi
run_body=$(sed -n '/^run_reader_summary_daily_delivery_c1() (/,/^)/p' \
  "$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.sh")
if grep -E 'systemctl (stop|disable|start).*timer' <<< "$run_body" >/dev/null; then exit 1; fi

echo 'Reader summary daily delivery C1 action tests passed'
