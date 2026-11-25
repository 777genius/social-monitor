#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

if [[ ${SOCIAL_MONITOR_DAILY_C1_RUNTIME_TEST_MODE:-} == 1 ]]; then
  ROOT=${SOCIAL_MONITOR_DAILY_C1_RUNTIME_TEST_ROOT:?daily C1 runtime test root is required}
  SYSTEMCTL_COMMAND=${SOCIAL_MONITOR_DAILY_C1_RUNTIME_TEST_SYSTEMCTL:-systemctl}
  [[ $ROOT == /tmp/* ]] || {
    echo 'daily C1 runtime test root must be below /tmp' >&2
    exit 64
  }
else
  ROOT=/var/data/social-monitor
  unset SOCIAL_MONITOR_DAILY_C1_RUNTIME_TEST_MODE \
    SOCIAL_MONITOR_DAILY_C1_RUNTIME_TEST_ROOT \
    SOCIAL_MONITOR_DAILY_C1_RUNTIME_TEST_BOOT_ID \
    SOCIAL_MONITOR_DAILY_C1_RUNTIME_TEST_FLOCK \
    SOCIAL_MONITOR_DAILY_C1_RUNTIME_TEST_SYSTEMCTL \
    SOCIAL_MONITOR_DAILY_C1_RUNTIME_TEST_TODAY
  SYSTEMCTL_COMMAND=systemctl
fi
FLOCK_COMMAND=${SOCIAL_MONITOR_DAILY_C1_RUNTIME_TEST_FLOCK:-flock}

CONTROL=$ROOT/control
OWNER=$CONTROL/reader-summary-daily-c1-owner.v1
BASELINES=$CONTROL/reader-summary-daily-c1-baselines
INVOCATIONS=$CONTROL/reader-summary-daily-c1-invocations
MANUAL_REQUESTS=$CONTROL/reader-summary-daily-c1-manual-requests
DECISION_LOCK=$CONTROL/reader-summary-daily-c1-decision.lock
CONTAINMENT=$CONTROL/reader-summary-daily-c1-contained.v1
CURRENT=$CONTROL/postgres-runtime-current
REPORTS=$ROOT/artifacts/reports

fail() {
  printf 'daily-c1-runtime: %s\n' "$*" >&2
  return 1
}

file_mode() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}

file_uid() {
  stat -c '%u' "$1" 2>/dev/null || stat -f '%u' "$1"
}

require_control_file() {
  local path=$1 mode=${2:-444}
  [[ -f $path && ! -L $path ]] || {
    fail "control record is not a regular non-symlink file: $path"
    return 1
  }
  [[ $(file_mode "$path") == "$mode" ]] || {
    fail "control record mode is invalid: $path"
    return 1
  }
  if [[ ${SOCIAL_MONITOR_DAILY_C1_RUNTIME_TEST_MODE:-} != 1 ]]; then
    [[ $(file_uid "$path") == 0 ]] || {
      fail "control record owner is invalid: $path"
      return 1
    }
  fi
}

fsync_file_and_parent() {
  python3 - "$1" <<'PY'
import os, sys
path = sys.argv[1]
fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
try:
    os.fsync(fd)
finally:
    os.close(fd)
parent = os.path.dirname(path) or "."
fd = os.open(parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
try:
    os.fsync(fd)
finally:
    os.close(fd)
PY
}

fsync_parent() {
  python3 - "$1" <<'PY'
import os, sys
fd = os.open(os.path.dirname(sys.argv[1]) or ".", os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
try:
    os.fsync(fd)
finally:
    os.close(fd)
PY
}

install_create_only() {
  local source=$1 target=$2 staged
  staged=$target.next.$$
  install -m 0444 "$source" "$staged"
  fsync_file_and_parent "$staged"
  if ! ln "$staged" "$target" 2>/dev/null; then
    rm -f "$staged"
    cmp -s "$source" "$target" || {
      fail "immutable control record conflicts: $target"
      return 1
    }
    return 0
  fi
  rm -f "$staged"
  fsync_parent "$target"
}

install_replace() {
  local source=$1 target=$2 staged
  staged=$target.next.$$
  install -m 0444 "$source" "$staged"
  fsync_file_and_parent "$staged"
  mv -f "$staged" "$target"
  fsync_file_and_parent "$target"
}

current_release_sha() {
  local sha_file=$CURRENT/SOURCE_SHA sha
  [[ -f $sha_file && ! -L $sha_file ]] || {
    fail 'current runtime SOURCE_SHA is unavailable'
    return 1
  }
  IFS= read -r sha < "$sha_file"
  [[ $sha =~ ^[0-9a-f]{40}$ && $(awk 'END { print NR }' "$sha_file") == 1 ]] || {
    fail 'current runtime SOURCE_SHA is invalid'
    return 1
  }
  printf '%s\n' "$sha"
}

owner_record() {
  local owner release_sha
  require_control_file "$OWNER" || return
  owner=$(sed -n '2s/^owner=//p' "$OWNER")
  release_sha=$(sed -n '3s/^releaseSha=//p' "$OWNER")
  [[ $owner == V6 || $owner == LEGACY ]] || {
    fail 'daily C1 owner is invalid'
    return 1
  }
  [[ $release_sha =~ ^[0-9a-f]{40}$ ]] || {
    fail 'daily C1 owner release SHA is invalid'
    return 1
  }
  cmp -s "$OWNER" <(printf '%s\n' \
    schemaVersion=reader_summary.daily_c1_owner.v1 \
    "owner=$owner" "releaseSha=$release_sha") || {
    fail 'daily C1 owner record is not canonical'
    return 1
  }
  printf '%s\t%s\n' "$owner" "$release_sha"
}

require_no_containment() {
  [[ ! -e $CONTAINMENT && ! -L $CONTAINMENT ]] || {
    fail 'daily C1 containment is present'
    return 1
  }
}

baseline_record() {
  local sha=$1 path release_sha boot_id previous_id previous_start
  path=$BASELINES/$sha.v1
  require_control_file "$path" || return
  release_sha=$(sed -n '2s/^releaseSha=//p' "$path")
  boot_id=$(sed -n '3s/^bootId=//p' "$path")
  previous_id=$(sed -n '4s/^previousInvocationId=//p' "$path")
  previous_start=$(sed -n '5s/^previousMainTimestampMonotonic=//p' "$path")
  [[ $release_sha == "$sha" && \
     $boot_id =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ && \
     (-z $previous_id || $previous_id =~ ^[0-9a-f]{32}$) && \
     $previous_start =~ ^[0-9]+$ ]] || {
    fail 'daily C1 baseline fields are invalid'
    return 1
  }
  cmp -s "$path" <(printf '%s\n' \
    schemaVersion=reader_summary.daily_c1_baseline.v1 \
    "releaseSha=$release_sha" "bootId=$boot_id" \
    "previousInvocationId=$previous_id" \
    "previousMainTimestampMonotonic=$previous_start") || {
    fail 'daily C1 baseline is not canonical'
    return 1
  }
  sha256sum "$path" | awk '{print $1}'
}

require_ready() {
  cmp -s "$CURRENT/reader-summary-daily-c1.readiness" <(printf '%s\n' \
    schemaVersion=reader_summary.daily_delivery_readiness.c1 \
    state=READY \
    requires=H_GREEN,C0_GREEN,C1_SCAN_TERMINAL_REPAIR_GREEN \
    activation=reviewed) || {
    fail 'daily C1 readiness is not canonical READY'
    return 1
  }
}

check_owner() {
  local expected=$1 record actual sha
  require_no_containment || return
  record=$(owner_record) || return
  actual=${record%%$'\t'*}
  [[ $actual == "$expected" ]] || {
    fail "daily C1 effective owner is not $expected"
    return 1
  }
  if [[ $expected == LEGACY ]]; then
    require_ready || return
    sha=$(current_release_sha) || return
    baseline_record "$sha" >/dev/null || return
  fi
}

inspect_owner() {
  local record owner owner_sha current_sha
  require_no_containment || return
  record=$(owner_record) || return
  owner=${record%%$'\t'*}
  owner_sha=${record#*$'\t'}
  current_sha=$(current_release_sha) || return
  if [[ $owner == LEGACY ]]; then
    require_ready || return
    baseline_record "$current_sha" >/dev/null || return
  fi
  printf 'OWNER\t%s\t%s\t%s\n' "$owner" "$owner_sha" "$current_sha"
}

valid_date() {
  python3 - "$1" <<'PY' >/dev/null 2>&1
import datetime, re, sys
value = sys.argv[1]
if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
    raise SystemExit(1)
if datetime.date.fromisoformat(value).isoformat() != value:
    raise SystemExit(1)
PY
}

utc_yesterday() {
  python3 - "${SOCIAL_MONITOR_DAILY_C1_RUNTIME_TEST_TODAY:-}" <<'PY'
import datetime, sys
today = datetime.date.fromisoformat(sys.argv[1]) if sys.argv[1] else datetime.datetime.now(datetime.timezone.utc).date()
print((today - datetime.timedelta(days=1)).isoformat())
PY
}

manual_request_path() {
  printf '%s/%s/%s.v1\n' "$MANUAL_REQUESTS" "$1" "$2"
}

require_manual_request() {
  local sha=$1 requested_date=$2 path
  path=$(manual_request_path "$sha" "$requested_date")
  require_control_file "$path" || return
  cmp -s "$path" <(printf '%s\n' \
    schemaVersion=reader_summary.daily_c1_manual_request.v1 \
    "releaseSha=$sha" "requestedUtcDate=$requested_date") || {
    fail 'daily C1 manual request is not canonical'
    return 1
  }
}

journal_path() {
  printf '%s/%s/%s/journal.v1\n' "$INVOCATIONS" "$1" "$2"
}

parse_journal() {
  local path=$1
  local state release_sha requested_date boot_id invocation_id baseline_sha origin
  local started_at service_result exit_code exit_status receipt_sha
  require_control_file "$path" || return
  state=$(sed -n '2s/^state=//p' "$path")
  release_sha=$(sed -n '3s/^releaseSha=//p' "$path")
  requested_date=$(sed -n '4s/^requestedUtcDate=//p' "$path")
  boot_id=$(sed -n '5s/^bootId=//p' "$path")
  invocation_id=$(sed -n '6s/^invocationId=//p' "$path")
  baseline_sha=$(sed -n '7s/^baselineSha256=//p' "$path")
  origin=$(sed -n '8s/^origin=//p' "$path")
  started_at=$(sed -n '9s/^startedAtRealtimeUsec=//p' "$path")
  service_result=$(sed -n '10s/^serviceResult=//p' "$path")
  exit_code=$(sed -n '11s/^exitCode=//p' "$path")
  exit_status=$(sed -n '12s/^exitStatus=//p' "$path")
  receipt_sha=$(sed -n '13s/^receiptSha256=//p' "$path")
  [[ $state == STARTED || $state == SUCCESS || $state == FAILED ]] || return 1
  [[ $release_sha =~ ^[0-9a-f]{40}$ ]] || return 1
  valid_date "$requested_date" || return 1
  [[ $boot_id =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || return 1
  [[ $invocation_id =~ ^[0-9a-f]{32}$ && $baseline_sha =~ ^[0-9a-f]{64}$ ]] || return 1
  [[ $origin == automatic || $origin == manual-reconcile ]] || return 1
  [[ $started_at =~ ^[1-9][0-9]*$ ]] || return 1
  [[ $service_result =~ ^[A-Za-z0-9_-]*$ && $exit_code =~ ^[A-Za-z0-9_-]*$ && \
     $exit_status =~ ^[A-Za-z0-9_-]*$ ]] || return 1
  [[ -z $receipt_sha || $receipt_sha =~ ^[0-9a-f]{64}$ ]] || return 1
  if [[ $state == STARTED ]]; then
    [[ -z $service_result && -z $exit_code && -z $exit_status && -z $receipt_sha ]] || return 1
  elif [[ $state == SUCCESS ]]; then
    [[ $service_result == success && $exit_code == exited && $exit_status == 0 && \
       $receipt_sha =~ ^[0-9a-f]{64}$ ]] || return 1
  else
    [[ -n $service_result && -n $exit_code && -n $exit_status && -z $receipt_sha ]] || return 1
  fi
  cmp -s "$path" <(printf '%s\n' \
    schemaVersion=reader_summary.daily_c1_invocation.v1 \
    "state=$state" "releaseSha=$release_sha" \
    "requestedUtcDate=$requested_date" "bootId=$boot_id" \
    "invocationId=$invocation_id" "baselineSha256=$baseline_sha" \
    "origin=$origin" "startedAtRealtimeUsec=$started_at" \
    "serviceResult=$service_result" "exitCode=$exit_code" \
    "exitStatus=$exit_status" "receiptSha256=$receipt_sha") || return 1
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$state" "$release_sha" "$requested_date" "$boot_id" \
    "$invocation_id" "$baseline_sha" "$origin" "$started_at" \
    "$service_result" "$exit_code" "$exit_status" "$receipt_sha"
}

inspect_journal() {
  local sha=$1 requested_date=$2 path record baseline_sha journal_baseline
  [[ $sha =~ ^[0-9a-f]{40}$ ]] || fail 'daily C1 inspect SHA is invalid'
  valid_date "$requested_date" || fail 'daily C1 inspect date is invalid'
  baseline_sha=$(baseline_record "$sha") || return
  path=$(journal_path "$sha" "$requested_date")
  if [[ ! -e $path && ! -L $path ]]; then
    printf 'NONE\t%s\t%s\n' "$sha" "$requested_date"
    return
  fi
  record=$(parse_journal "$path") || fail 'daily C1 invocation journal is invalid'
  journal_baseline=$(printf '%s' "$record" | cut -f6)
  [[ $journal_baseline == "$baseline_sha" ]] || fail 'daily C1 invocation baseline digest is invalid'
  printf '%s\n' "$record"
}

inspect_unresolved_journal() {
  local sha=$1 path record state found='' baseline_sha journal_baseline
  [[ $sha =~ ^[0-9a-f]{40}$ ]] || fail 'daily C1 unresolved inspect SHA is invalid'
  baseline_sha=$(baseline_record "$sha") || return
  while IFS= read -r path; do
    record=$(parse_journal "$path") || {
      fail 'daily C1 invocation journal is invalid'
      return 1
    }
    [[ $(printf '%s' "$record" | cut -f2) == "$sha" ]] || {
      fail 'daily C1 invocation journal release is invalid'
      return 1
    }
    journal_baseline=$(printf '%s' "$record" | cut -f6)
    [[ $journal_baseline == "$baseline_sha" ]] || {
      fail 'daily C1 invocation baseline digest is invalid'
      return 1
    }
    state=$(printf '%s' "$record" | cut -f1)
    [[ $state == STARTED || $state == FAILED ]] || continue
    [[ -z $found ]] || {
      fail 'daily C1 has multiple unresolved invocation journals'
      return 1
    }
    found=$record
  done < <(find "$INVOCATIONS/$sha" -mindepth 2 -maxdepth 2 \
    \( -type f -o -type l \) -name journal.v1 -print 2>/dev/null | sort)
  if [[ -n $found ]]; then
    printf '%s\n' "$found"
  else
    printf 'NONE\t%s\n' "$sha"
  fi
}

check_no_unresolved_journal() {
  local sha unresolved
  exec 9>"$DECISION_LOCK"
  "$FLOCK_COMMAND" -x 9
  check_owner LEGACY || return
  sha=$(current_release_sha) || return
  unresolved=$(inspect_unresolved_journal "$sha") || return
  [[ $unresolved == $'NONE\t'"$sha" ]] || \
    fail 'daily C1 unresolved invocation journal is present'
}

write_journal_record() {
  local destination=$1 state=$2 release_sha=$3 requested_date=$4 boot_id=$5
  local invocation_id=$6 baseline_sha=$7 origin=$8 started_at=$9
  local service_result=${10} exit_code=${11} exit_status=${12} receipt_sha=${13}
  local temporary
  temporary=$(mktemp "$CONTROL/.daily-c1-journal.XXXXXX")
  trap 'rm -f "$temporary"' RETURN
  printf '%s\n' \
    schemaVersion=reader_summary.daily_c1_invocation.v1 \
    "state=$state" "releaseSha=$release_sha" \
    "requestedUtcDate=$requested_date" "bootId=$boot_id" \
    "invocationId=$invocation_id" "baselineSha256=$baseline_sha" \
    "origin=$origin" "startedAtRealtimeUsec=$started_at" \
    "serviceResult=$service_result" "exitCode=$exit_code" \
    "exitStatus=$exit_status" "receiptSha256=$receipt_sha" > "$temporary"
  if [[ $state == STARTED ]]; then
    install_create_only "$temporary" "$destination"
  else
    install_replace "$temporary" "$destination"
  fi
  rm -f "$temporary"
  trap - RETURN
}

request_manual_start() {
  local sha=$1 requested_date=$2 path temporary result=CREATED active_state journal
  [[ $sha =~ ^[0-9a-f]{40}$ ]] || fail 'daily C1 manual request SHA is invalid'
  valid_date "$requested_date" || fail 'daily C1 manual request date is invalid'
  [[ $requested_date == "$(utc_yesterday)" ]] || fail 'daily C1 new manual request must target current UTC yesterday'
  exec 9>"$DECISION_LOCK"
  "$FLOCK_COMMAND" -x 9
  check_owner LEGACY || return
  [[ $(current_release_sha) == "$sha" ]] || fail 'daily C1 manual request release is not current'
  baseline_record "$sha" >/dev/null || return
  journal=$(inspect_journal "$sha" "$requested_date") || return
  if [[ $journal != $'NONE\t'"$sha"$'\t'"$requested_date" ]]; then
    printf 'EXISTING_JOURNAL\n'
    return
  fi
  path=$(manual_request_path "$sha" "$requested_date")
  install -d -m 0700 "${path%/*}"
  if [[ -e $path || -L $path ]]; then
    require_manual_request "$sha" "$requested_date" || return
    result=RESUBMITTED
    active_state=$("$SYSTEMCTL_COMMAND" show --property=ActiveState --value \
      social-monitor-daily.service) || \
      fail 'daily C1 manual service state is unavailable'
    case $active_state in
      activating|active)
        printf 'COALESCED\n'
        return
        ;;
      inactive) ;;
      *) fail 'daily C1 manual service state is invalid'; return 1 ;;
    esac
  else
    temporary=$(mktemp "$CONTROL/.daily-c1-manual-request.XXXXXX")
    printf '%s\n' schemaVersion=reader_summary.daily_c1_manual_request.v1 \
      "releaseSha=$sha" "requestedUtcDate=$requested_date" > "$temporary"
    install_create_only "$temporary" "$path"
    rm -f "$temporary"
  fi
  "$SYSTEMCTL_COMMAND" start --no-block \
    social-monitor-daily.service >&2 || {
      [[ $result == RESUBMITTED ]] || {
        rm -f "$path"
        fsync_parent "$path"
      }
      fail 'daily C1 manual service start could not be submitted'
      return 1
    }
  printf '%s\n' "$result"
}

prepare_legacy_start() {
  local sha requested_date baseline_sha boot_id invocation_id origin=automatic path started_at unresolved
  exec 8>"$CONTROL/production-deploy.lock"
  "$FLOCK_COMMAND" -s 8
  exec 9>"$DECISION_LOCK"
  "$FLOCK_COMMAND" -x 9
  check_owner LEGACY || return
  sha=$(current_release_sha) || return
  baseline_sha=$(baseline_record "$sha") || return
  unresolved=$(inspect_unresolved_journal "$sha") || return
  [[ $unresolved == $'NONE\t'"$sha" ]] || \
    fail 'daily C1 unresolved invocation blocks a new start'
  requested_date=$(utc_yesterday)
  invocation_id=${INVOCATION_ID:-}
  [[ $invocation_id =~ ^[0-9a-f]{32}$ ]] || fail 'daily C1 systemd invocation ID is invalid'
  boot_id=${SOCIAL_MONITOR_DAILY_C1_RUNTIME_TEST_BOOT_ID:-}
  [[ -n $boot_id ]] || \
    boot_id=$(tr '[:upper:]' '[:lower:]' < /proc/sys/kernel/random/boot_id)
  [[ $boot_id =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || fail 'daily C1 boot ID is invalid'
  if [[ -e $(manual_request_path "$sha" "$requested_date") || \
        -L $(manual_request_path "$sha" "$requested_date") ]]; then
    require_manual_request "$sha" "$requested_date" || return
    origin=manual-reconcile
  fi
  path=$(journal_path "$sha" "$requested_date")
  [[ ! -e $path && ! -L $path ]] || fail 'daily C1 first invocation journal already exists'
  install -d -m 0700 "${path%/*}"
  started_at=$(python3 - <<'PY'
import time
print(time.time_ns() // 1000)
PY
  )
  [[ $started_at =~ ^[1-9][0-9]*$ ]] || fail 'daily C1 invocation timestamp is invalid'
  write_journal_record "$path" STARTED "$sha" "$requested_date" "$boot_id" \
    "$invocation_id" "$baseline_sha" "$origin" "$started_at" '' '' '' ''
}

find_started_for_invocation() {
  local invocation_id=$1 path record found=
  while IFS= read -r path; do
    record=$(parse_journal "$path" 2>/dev/null || true)
    [[ -n $record && $(printf '%s' "$record" | cut -f1) == STARTED && \
       $(printf '%s' "$record" | cut -f5) == "$invocation_id" ]] || continue
    [[ -z $found ]] || fail 'daily C1 invocation ID has multiple journals'
    found=$path
  done < <(find "$INVOCATIONS" -mindepth 3 -maxdepth 3 -type f -name journal.v1 -print 2>/dev/null | sort)
  [[ -n $found ]] || return 1
  printf '%s\n' "$found"
}

run_and_complete_legacy() {
  local invocation_id=${INVOCATION_ID:-} path record requested_date status
  [[ $invocation_id =~ ^[0-9a-f]{32}$ ]] || fail 'daily C1 systemd invocation ID is invalid'
  path=$(find_started_for_invocation "$invocation_id") || fail 'daily C1 STARTED journal is unavailable'
  record=$(parse_journal "$path") || return
  requested_date=$(printf '%s' "$record" | cut -f3)
  exec 8>"$CONTROL/production-deploy.lock"
  "$FLOCK_COMMAND" -s 8
  check_owner LEGACY || return
  if "$CONTROL/daily-run.sh" --frozen-date "$requested_date"; then
    complete_started_invocation "$invocation_id" success exited 0
    return
  else
    status=$?
  fi
  complete_started_invocation "$invocation_id" exit-code exited "$status" || true
  return "$status"
}

receipt_sha_for_date() {
  local requested_date=$1 receipt pointer
  receipt=$REPORTS/reader-summary-daily-delivery-caught-up-c1-$requested_date.json
  pointer=$REPORTS/reader-summary-daily-delivery-caught-up-c1-latest.json
  require_control_file "$receipt" || return
  require_control_file "$pointer" || return
  python3 - "$requested_date" "$receipt" "$pointer" <<'PY'
import hashlib, json, os, re, sys
date, receipt_path, pointer_path = sys.argv[1:]
def load(path):
    raw = open(path, "rb").read()
    if len(raw) > 1024 * 1024 or not raw.endswith(b"\n") or b"\n" in raw[:-1] or b"\r" in raw:
        raise SystemExit(1)
    value = json.loads(raw[:-1])
    if json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode() + b"\n" != raw:
        raise SystemExit(1)
    return value, raw
receipt, raw = load(receipt_path)
pointer, _ = load(pointer_path)
digest = hashlib.sha256(raw).hexdigest()
if (receipt.get("schemaVersion") != "reader_summary.daily_delivery_caught_up.c1" or
    receipt.get("eligibleThrough") != date or
    not re.fullmatch(r"[0-9a-f]{64}", receipt.get("publicationSetSha256", "")) or
    pointer != {"schemaVersion":"reader_summary.daily_delivery_caught_up_pointer.c1", "eligibleThrough":date, "receiptSha256":digest}):
    raise SystemExit(1)
print(digest)
PY
}

persist_containment_requested() {
  local sha=$1 temporary
  if [[ -e $CONTAINMENT || -L $CONTAINMENT ]]; then
    require_control_file "$CONTAINMENT" || return
    grep -Fx 'schemaVersion=reader_summary.daily_c1_containment.v1' "$CONTAINMENT" >/dev/null
    grep -Eq '^state=(REQUESTED|CONTAINED)$' "$CONTAINMENT"
    grep -Fx "readySha=$sha" "$CONTAINMENT" >/dev/null
    [[ $(wc -l < "$CONTAINMENT") == 3 ]]
    return
  fi
  temporary=$(mktemp "$CONTROL/.daily-c1-containment.XXXXXX")
  printf '%s\n' schemaVersion=reader_summary.daily_c1_containment.v1 \
    state=REQUESTED "readySha=$sha" > "$temporary"
  install_create_only "$temporary" "$CONTAINMENT"
  rm -f "$temporary"
}

complete_started_invocation() {
  local invocation_id=$1 result=$2 code=$3 status=$4
  local path record state sha requested_date boot_id baseline_sha origin started_at
  local receipt_sha=''
  exec 9>"$DECISION_LOCK"
  "$FLOCK_COMMAND" -x 9
  path=$(find_started_for_invocation "$invocation_id" 2>/dev/null || true)
  [[ -n $path ]] || exit 0
  record=$(parse_journal "$path") || fail 'daily C1 STARTED journal is invalid'
  IFS=$'\t' read -r state sha requested_date boot_id invocation_id baseline_sha origin \
    started_at _ <<< "$record"
  [[ $result =~ ^[A-Za-z0-9_-]+$ ]] || result=invalid
  [[ $code =~ ^[A-Za-z0-9_-]+$ ]] || code=invalid
  [[ $status =~ ^[A-Za-z0-9_-]+$ ]] || status=invalid
  if [[ $result == success && $code == exited && $status == 0 ]]; then
    receipt_sha=$(receipt_sha_for_date "$requested_date" 2>/dev/null || true)
    if [[ $receipt_sha =~ ^[0-9a-f]{64}$ ]]; then
      write_journal_record "$path" SUCCESS "$sha" "$requested_date" "$boot_id" \
        "$invocation_id" "$baseline_sha" "$origin" "$started_at" \
        success exited 0 "$receipt_sha"
      return
    fi
    result=receipt_invalid
    code=exited
    status=1
  fi
  persist_containment_requested "$sha"
  write_journal_record "$path" FAILED "$sha" "$requested_date" "$boot_id" \
    "$invocation_id" "$baseline_sha" "$origin" "$started_at" \
    "$result" "$code" "$status" ''
  return 1
}

complete_legacy_start() {
  local invocation_id=${INVOCATION_ID:-}
  [[ $invocation_id =~ ^[0-9a-f]{32}$ ]] || exit 0
  exec 8>"$CONTROL/production-deploy.lock"
  "$FLOCK_COMMAND" -s 8
  complete_started_invocation "$invocation_id" \
    "${SERVICE_RESULT:-unknown}" "${EXIT_CODE:-unknown}" \
    "${EXIT_STATUS:-unknown}"
}

case ${1:-} in
  --check-v6-owner)
    [[ $# == 1 ]] || exit 64
    check_owner V6
    ;;
  --check-legacy-owner)
    [[ $# == 1 ]] || exit 64
    check_owner LEGACY
    ;;
  --inspect-owner)
    [[ $# == 1 ]] || exit 64
    inspect_owner
    ;;
  --inspect)
    [[ $# == 3 ]] || exit 64
    inspect_journal "$2" "$3"
    ;;
  --inspect-unresolved)
    [[ $# == 2 ]] || exit 64
    inspect_unresolved_journal "$2"
    ;;
  --check-no-unresolved)
    [[ $# == 1 ]] || exit 64
    check_no_unresolved_journal
    ;;
  --request-manual-start)
    [[ $# == 3 ]] || exit 64
    request_manual_start "$2" "$3"
    ;;
  --prepare-legacy-start)
    [[ $# == 1 ]] || exit 64
    prepare_legacy_start
    ;;
  --run-and-complete-legacy)
    [[ $# == 1 ]] || exit 64
    run_and_complete_legacy
    ;;
  --complete-legacy-start)
    [[ $# == 1 ]] || exit 64
    complete_legacy_start
    ;;
  *)
    echo 'usage: daily-c1-runtime.sh --check-v6-owner|--check-legacy-owner|--inspect-owner|--inspect SHA DATE|--inspect-unresolved SHA|--check-no-unresolved|--request-manual-start SHA DATE|--prepare-legacy-start|--run-and-complete-legacy|--complete-legacy-start' >&2
    exit 64
    ;;
esac
