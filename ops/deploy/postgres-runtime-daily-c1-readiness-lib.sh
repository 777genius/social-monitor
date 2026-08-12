#!/usr/bin/env bash

# Sourced by postgres-runtime-deploy-lib.sh. This file owns the bounded daily
# C1 readiness asset and the READY-only systemd timer handoff transaction.

POSTGRES_RUNTIME_DAILY_C1_MARKER=reader-summary-daily-c1.readiness
POSTGRES_RUNTIME_DAILY_TIMER=social-monitor-daily.timer
POSTGRES_RUNTIME_DAILY_SERVICE=social-monitor-daily.service
POSTGRES_RUNTIME_DAILY_RUNNER=daily-run.sh
POSTGRES_RUNTIME_DAILY_V6_TIMER=social-monitor-reader-summary-production-day.timer
POSTGRES_RUNTIME_DAILY_V6_SERVICE=social-monitor-reader-summary-production-day.service
POSTGRES_RUNTIME_DAILY_C1_RUNTIME=daily-c1-runtime.sh
POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_ASSET=social-monitor-reader-summary-production-day.service.d-10-daily-c1-owner.conf
POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_DIRECTORY=$POSTGRES_RUNTIME_DAILY_V6_SERVICE.d
POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN=10-daily-c1-owner.conf
POSTGRES_RUNTIME_DAILY_C1_OWNER=reader-summary-daily-c1-owner.v1
POSTGRES_RUNTIME_DAILY_C1_BASELINES=reader-summary-daily-c1-baselines

require_postgres_runtime_daily_c1_source() {
  local source=$1
  require_postgres_runtime_regular_source \
    "$source/$POSTGRES_RUNTIME_DAILY_C1_MARKER" 644 || return
  require_postgres_runtime_regular_source \
    "$source/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME" 755 || return
  require_postgres_runtime_regular_source \
    "$source/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_ASSET" 644 || return
}

stage_postgres_runtime_daily_c1_readiness() {
  local source=$1 staged_release=$2
  install -m 0644 "$source/$POSTGRES_RUNTIME_DAILY_C1_MARKER" \
    "$staged_release/$POSTGRES_RUNTIME_DAILY_C1_MARKER"
  install -m 0755 "$source/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME" \
    "$staged_release/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME"
  install -m 0644 "$source/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_ASSET" \
    "$staged_release/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_ASSET"
}

verify_postgres_runtime_daily_c1_release() {
  local source=$1 release=$2
  require_postgres_runtime_regular_release_file \
    "$release/$POSTGRES_RUNTIME_DAILY_C1_MARKER" 644 || return
  cmp -s "$source/$POSTGRES_RUNTIME_DAILY_C1_MARKER" \
    "$release/$POSTGRES_RUNTIME_DAILY_C1_MARKER" || \
    { fail 'immutable daily C1 readiness marker differs from source'; return 1; }
  require_postgres_runtime_regular_release_file \
    "$release/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME" 755 || return
  require_postgres_runtime_regular_release_file \
    "$release/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_ASSET" 644 || return
  cmp -s "$source/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME" \
    "$release/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME" || \
    { fail 'immutable daily C1 runtime helper differs from source'; return 1; }
  cmp -s "$source/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_ASSET" \
    "$release/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_ASSET" || \
    { fail 'immutable daily C1 v6 owner drop-in differs from source'; return 1; }
}

verify_installed_postgres_runtime_daily_c1_readiness() {
  local source=$1 release=$2 current=$3
  require_postgres_runtime_regular_release_file \
    "$release/$POSTGRES_RUNTIME_DAILY_C1_MARKER" 644 || return
  cmp -s "$source/$POSTGRES_RUNTIME_DAILY_C1_MARKER" \
    "$release/$POSTGRES_RUNTIME_DAILY_C1_MARKER" || \
    { fail 'installed daily C1 readiness marker differs from release source'; return 1; }
  cmp -s "$release/$POSTGRES_RUNTIME_DAILY_C1_MARKER" \
    "$current/$POSTGRES_RUNTIME_DAILY_C1_MARKER" || \
    { fail 'current daily C1 readiness marker differs from the release'; return 1; }
  cmp -s "$source/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME" \
    "$release/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME" || \
    { fail 'installed daily C1 runtime helper differs from release source'; return 1; }
  cmp -s "$release/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME" \
    "$CONTROL/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME" || \
    { fail 'installed daily C1 runtime helper differs from the release'; return 1; }
  cmp -s "$source/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_ASSET" \
    "$release/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_ASSET" || \
    { fail 'installed daily C1 v6 owner drop-in differs from release source'; return 1; }
}

postgres_runtime_daily_c1_readiness_state() {
  local marker=$1
  if cmp -s "$marker" <(printf '%s\n' \
    schemaVersion=reader_summary.daily_delivery_readiness.c1 \
    state=READY \
    requires=H_GREEN,C0_GREEN,C1_SCAN_TERMINAL_REPAIR_GREEN \
    activation=reviewed); then
    printf 'READY\n'
  elif cmp -s "$marker" <(printf '%s\n' \
    schemaVersion=reader_summary.daily_delivery_readiness.c1 \
    state=BLOCKED \
    requires=H_GREEN,C0_GREEN,reviewed_activation \
    activation=forbidden); then
    printf 'BLOCKED\n'
  else
    fail 'daily C1 readiness marker state is invalid'
    return 1
  fi
}

require_postgres_runtime_daily_c1_transition() {
  local next_state=$1 current=$2 current_state
  [[ -f $current/$POSTGRES_RUNTIME_DAILY_C1_MARKER ]] || return 0
  current_state=$(postgres_runtime_daily_c1_readiness_state \
    "$current/$POSTGRES_RUNTIME_DAILY_C1_MARKER") || return
  if [[ $current_state == READY && $next_state == BLOCKED ]]; then
    fail 'daily C1 readiness cannot regress from READY to BLOCKED'
    return 1
  fi
}

postgres_runtime_daily_c1_owner_marker() {
  printf '%s/%s\n' "$CONTROL" "$POSTGRES_RUNTIME_DAILY_C1_OWNER"
}

postgres_runtime_daily_c1_fsync_path_and_parent() {
  python3 - "$1" <<'PY'
import os, sys
path = sys.argv[1]
fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
try:
    os.fsync(fd)
finally:
    os.close(fd)
fd = os.open(os.path.dirname(path) or ".", os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
try:
    os.fsync(fd)
finally:
    os.close(fd)
PY
}

postgres_runtime_daily_c1_fsync_parent() {
  python3 - "$1" <<'PY'
import os, sys
fd = os.open(os.path.dirname(sys.argv[1]) or ".", os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
try:
    os.fsync(fd)
finally:
    os.close(fd)
PY
}

postgres_runtime_daily_c1_owner_record() {
  local marker owner sha mode
  marker=$(postgres_runtime_daily_c1_owner_marker)
  [[ -f $marker && ! -L $marker ]] || {
    fail 'daily C1 owner marker is not a regular file'
    return 1
  }
  mode=$(stat -c '%a' "$marker" 2>/dev/null || stat -f '%Lp' "$marker") || return
  [[ $mode == 444 ]] || {
    fail 'daily C1 owner marker mode is invalid'
    return 1
  }
  owner=$(sed -n '2s/^owner=//p' "$marker")
  sha=$(sed -n '3s/^releaseSha=//p' "$marker")
  [[ $owner == V6 || $owner == LEGACY ]] || {
    fail 'daily C1 owner marker state is invalid'
    return 1
  }
  [[ $sha =~ ^[0-9a-f]{40}$ ]] || {
    fail 'daily C1 owner marker release SHA is invalid'
    return 1
  }
  cmp -s "$marker" <(printf '%s\n' \
    schemaVersion=reader_summary.daily_c1_owner.v1 \
    "owner=$owner" "releaseSha=$sha") || {
    fail 'daily C1 owner marker is not canonical'
    return 1
  }
  printf '%s\t%s\n' "$owner" "$sha"
}

postgres_runtime_daily_c1_owner_state() {
  local marker record
  marker=$(postgres_runtime_daily_c1_owner_marker)
  if [[ ! -e $marker && ! -L $marker ]]; then
    printf 'absent\n'
    return
  fi
  record=$(postgres_runtime_daily_c1_owner_record) || return
  printf '%s\n' "${record%%$'\t'*}"
}

persist_postgres_runtime_daily_c1_v6_owner() {
  local sha=$1 marker staged state
  [[ $sha =~ ^[0-9a-f]{40}$ ]] || {
    fail 'daily C1 V6 owner release SHA is invalid'
    return 1
  }
  marker=$(postgres_runtime_daily_c1_owner_marker)
  state=$(postgres_runtime_daily_c1_owner_state) || return
  [[ $state == absent ]] || {
    [[ $state == V6 || $state == LEGACY ]] || return 1
    return 0
  }
  staged=$marker.next.$$
  printf '%s\n' schemaVersion=reader_summary.daily_c1_owner.v1 \
    owner=V6 "releaseSha=$sha" > "$staged"
  chmod 0444 "$staged"
  postgres_runtime_daily_c1_fsync_path_and_parent "$staged"
  if ! ln "$staged" "$marker" 2>/dev/null; then
    rm -f "$staged"
    postgres_runtime_daily_c1_owner_record >/dev/null
    return
  fi
  rm -f "$staged"
  postgres_runtime_daily_c1_fsync_parent "$marker"
  [[ $(postgres_runtime_daily_c1_owner_state) == V6 ]]
}

commit_postgres_runtime_daily_c1_legacy_owner() {
  local sha=$1 marker staged record
  [[ $sha =~ ^[0-9a-f]{40}$ ]] || {
    fail 'daily C1 LEGACY owner release SHA is invalid'
    return 1
  }
  marker=$(postgres_runtime_daily_c1_owner_marker)
  record=$(postgres_runtime_daily_c1_owner_record) || return
  if [[ ${record%%$'\t'*} == LEGACY ]]; then
    return 0
  fi
  [[ ${record%%$'\t'*} == V6 ]] || {
    fail 'daily C1 owner transition is invalid'
    return 1
  }
  staged=$marker.legacy.$$
  printf '%s\n' schemaVersion=reader_summary.daily_c1_owner.v1 \
    owner=LEGACY "releaseSha=$sha" > "$staged"
  chmod 0444 "$staged"
  postgres_runtime_daily_c1_fsync_path_and_parent "$staged"
  mv -f "$staged" "$marker"
  postgres_runtime_daily_c1_fsync_path_and_parent "$marker"
  record=$(postgres_runtime_daily_c1_owner_record) || return
  [[ $record == "LEGACY"$'\t'"$sha" ]]
}

postgres_runtime_daily_c1_baseline_path() {
  printf '%s/%s/%s.v1\n' "$CONTROL" \
    "$POSTGRES_RUNTIME_DAILY_C1_BASELINES" "$1"
}

verify_postgres_runtime_daily_c1_baseline() {
  local sha=$1 path release_sha boot_id previous_id previous_start mode
  path=$(postgres_runtime_daily_c1_baseline_path "$sha")
  [[ -f $path && ! -L $path ]] || {
    fail 'daily C1 baseline is not a regular file'
    return 1
  }
  mode=$(stat -c '%a' "$path" 2>/dev/null || stat -f '%Lp' "$path") || return
  [[ $mode == 444 ]] || {
    fail 'daily C1 baseline mode is invalid'
    return 1
  }
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
    "releaseSha=$sha" "bootId=$boot_id" \
    "previousInvocationId=$previous_id" \
    "previousMainTimestampMonotonic=$previous_start") || {
    fail 'daily C1 baseline is not canonical'
    return 1
  }
}

prepare_postgres_runtime_daily_c1_baseline() {
  local sha=$1 path directory staged boot_id previous_id previous_start
  [[ $sha =~ ^[0-9a-f]{40}$ ]] || {
    fail 'daily C1 baseline release SHA is invalid'
    return 1
  }
  path=$(postgres_runtime_daily_c1_baseline_path "$sha")
  if [[ -e $path || -L $path ]]; then
    verify_postgres_runtime_daily_c1_baseline "$sha"
    return
  fi
  directory=${path%/*}
  install -d -m 0700 "$directory"
  boot_id=${POSTGRES_RUNTIME_DAILY_C1_TEST_BOOT_ID:-}
  [[ -n $boot_id ]] || boot_id=$(tr '[:upper:]' '[:lower:]' < /proc/sys/kernel/random/boot_id)
  previous_id=$(systemctl show --property=InvocationID --value \
    "$POSTGRES_RUNTIME_DAILY_SERVICE") || return
  previous_start=$(systemctl show --property=ExecMainStartTimestampMonotonic \
    --value "$POSTGRES_RUNTIME_DAILY_SERVICE") || return
  [[ -z $previous_id || $previous_id =~ ^[0-9a-f]{32}$ ]] || {
    fail 'daily C1 baseline previous invocation ID is invalid'
    return 1
  }
  [[ -n $previous_start ]] || previous_start=0
  [[ $previous_start =~ ^[0-9]+$ ]] || {
    fail 'daily C1 baseline previous start timestamp is invalid'
    return 1
  }
  staged=$path.next.$$
  printf '%s\n' schemaVersion=reader_summary.daily_c1_baseline.v1 \
    "releaseSha=$sha" "bootId=$boot_id" \
    "previousInvocationId=$previous_id" \
    "previousMainTimestampMonotonic=$previous_start" > "$staged"
  chmod 0444 "$staged"
  postgres_runtime_daily_c1_fsync_path_and_parent "$staged"
  if ! ln "$staged" "$path" 2>/dev/null; then
    rm -f "$staged"
    verify_postgres_runtime_daily_c1_baseline "$sha"
    return
  fi
  rm -f "$staged"
  postgres_runtime_daily_c1_fsync_parent "$path"
  verify_postgres_runtime_daily_c1_baseline "$sha"
}

install_postgres_runtime_daily_c1_bridge_assets() {
  local release=$1 unit_directory=$2 dropin_directory dropin
  dropin_directory=$unit_directory/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_DIRECTORY
  dropin=$dropin_directory/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN
  install -d -m 0755 "$dropin_directory"
  install -m 0755 "$release/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME" \
    "$CONTROL/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME.next"
  mv -f "$CONTROL/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME.next" \
    "$CONTROL/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME"
  install -m 0644 "$release/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_ASSET" \
    "$dropin.next"
  mv -f "$dropin.next" "$dropin"
}

verify_postgres_runtime_daily_c1_bridge_assets() {
  local release=$1 unit_directory=$2 dropin
  dropin=$unit_directory/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_DIRECTORY/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN
  cmp -s "$release/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME" \
    "$CONTROL/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME" || {
    fail 'daily C1 installed runtime helper differs from release'
    return 1
  }
  cmp -s "$release/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_ASSET" "$dropin" || {
    fail 'daily C1 installed v6 owner drop-in differs from release'
    return 1
  }
}

postgres_runtime_daily_c1_containment_marker() {
  printf '%s/reader-summary-daily-c1-contained.v1\n' "$CONTROL"
}

postgres_runtime_daily_c1_containment_record() {
  local marker state value mode
  marker=$(postgres_runtime_daily_c1_containment_marker)
  if [[ ! -e $marker && ! -L $marker ]]; then
    return 1
  fi
  [[ -f $marker && ! -L $marker ]] || \
    { fail 'daily C1 containment marker is not a regular file'; return 1; }
  mode=$(stat -c '%a' "$marker" 2>/dev/null || stat -f '%Lp' "$marker") || return
  [[ $mode == 444 ]] || \
    { fail 'daily C1 containment marker mode is invalid'; return 1; }
  state=$(sed -n '2s/^state=//p' "$marker") || return
  value=$(sed -n '3s/^readySha=//p' "$marker") || return
  [[ $state == REQUESTED || $state == CONTAINED ]] || \
    { fail 'daily C1 containment marker is invalid'; return 1; }
  [[ $value =~ ^[0-9a-f]{40}$ ]] || \
    { fail 'daily C1 containment marker is invalid'; return 1; }
  cmp -s "$marker" <(printf '%s\n' \
    schemaVersion=reader_summary.daily_c1_containment.v1 \
    "state=$state" "readySha=$value") || \
    { fail 'daily C1 containment marker is invalid'; return 1; }
  printf '%s\t%s\n' "$state" "$value"
}

postgres_runtime_daily_c1_containment_sha() {
  local record
  record=$(postgres_runtime_daily_c1_containment_record) || return
  printf '%s\n' "${record#*$'\t'}"
}

postgres_runtime_daily_c1_containment_state() {
  local marker
  marker=$(postgres_runtime_daily_c1_containment_marker)
  if [[ ! -e $marker && ! -L $marker ]]; then
    printf 'clear\n'
    return
  fi
  local record state
  record=$(postgres_runtime_daily_c1_containment_record) || return
  state=${record%%$'\t'*}
  case $state in
    REQUESTED) printf 'requested\n' ;;
    CONTAINED) printf 'contained\n' ;;
  esac
}

persist_postgres_runtime_daily_c1_containment_requested() {
  local sha=$1 marker staged
  [[ $sha =~ ^[0-9a-f]{40}$ ]] || \
    { fail 'daily C1 containment SHA is invalid'; return 1; }
  marker=$(postgres_runtime_daily_c1_containment_marker)
  if [[ -e $marker || -L $marker ]]; then
    [[ $(postgres_runtime_daily_c1_containment_sha) == "$sha" ]] || \
      { fail 'daily C1 containment marker conflicts with an existing incident'; return 1; }
    postgres_runtime_daily_c1_fsync_path_and_parent "$marker"
    return
  fi
  staged=$marker.next.$$
  umask 077
  printf '%s\n' schemaVersion=reader_summary.daily_c1_containment.v1 \
    state=REQUESTED "readySha=$sha" > "$staged"
  chmod 0444 "$staged"
  postgres_runtime_daily_c1_fsync_path_and_parent "$staged" || {
    rm -f "$staged"
    return 1
  }
  if ! ln "$staged" "$marker" 2>/dev/null; then
    rm -f "$staged"
    [[ $(postgres_runtime_daily_c1_containment_sha) == "$sha" ]] || \
      { fail 'daily C1 containment marker raced with another incident'; return 1; }
    postgres_runtime_daily_c1_fsync_path_and_parent "$marker" || return
    return
  fi
  rm -f "$staged"
  postgres_runtime_daily_c1_fsync_parent "$marker" || return
  [[ $(postgres_runtime_daily_c1_containment_sha) == "$sha" ]]
}

promote_postgres_runtime_daily_c1_containment_contained() {
  local sha=$1 marker staged state
  [[ $sha =~ ^[0-9a-f]{40}$ ]] || \
    { fail 'daily C1 containment SHA is invalid'; return 1; }
  marker=$(postgres_runtime_daily_c1_containment_marker)
  [[ $(postgres_runtime_daily_c1_containment_sha) == "$sha" ]] || \
    { fail 'daily C1 containment marker is bound to another READY release'; return 1; }
  state=$(postgres_runtime_daily_c1_containment_state) || return
  if [[ $state == contained ]]; then
    postgres_runtime_daily_c1_fsync_path_and_parent "$marker"
    return
  fi
  [[ $state == requested ]] || \
    { fail 'daily C1 containment marker cannot be promoted'; return 1; }
  staged=$marker.contained.$$
  umask 077
  printf '%s\n' schemaVersion=reader_summary.daily_c1_containment.v1 \
    state=CONTAINED "readySha=$sha" > "$staged"
  chmod 0444 "$staged"
  postgres_runtime_daily_c1_fsync_path_and_parent "$staged" || {
    rm -f "$staged"
    return 1
  }
  [[ $(postgres_runtime_daily_c1_containment_state) == requested && \
     $(postgres_runtime_daily_c1_containment_sha) == "$sha" ]] || {
    rm -f "$staged"
    fail 'daily C1 containment marker changed before promotion'
    return 1
  }
  mv -f "$staged" "$marker" || {
    rm -f "$staged"
    return 1
  }
  postgres_runtime_daily_c1_fsync_path_and_parent "$marker" || return
  verify_postgres_runtime_daily_c1_containment "$sha" CONTAINED
}

verify_postgres_runtime_daily_c1_containment() {
  local sha=$1 expected_state=${2:-} actual_state expected_normalized
  [[ $(postgres_runtime_daily_c1_containment_sha) == "$sha" ]] || \
    { fail 'daily C1 containment marker is bound to another READY release'; return 1; }
  if [[ -n $expected_state ]]; then
    actual_state=$(postgres_runtime_daily_c1_containment_state) || return
    case $expected_state in
      REQUESTED|requested) expected_normalized=requested ;;
      CONTAINED|contained) expected_normalized=contained ;;
      *) fail 'daily C1 expected containment state is invalid'; return 1 ;;
    esac
    [[ $actual_state == "$expected_normalized" ]] || \
      { fail "daily C1 containment marker is not $expected_state"; return 1; }
  fi
}

verify_postgres_runtime_daily_c1_contained_topology() {
  local release=$1 unit_directory=$2 unit
  [[ $(systemctl show --property=UnitFileState --value \
    "$POSTGRES_RUNTIME_DAILY_TIMER") == disabled ]] || \
    { fail 'contained daily C1 legacy timer is not disabled'; return 1; }
  [[ $(systemctl show --property=ActiveState --value \
    "$POSTGRES_RUNTIME_DAILY_TIMER") == inactive ]] || \
    { fail 'contained daily C1 legacy timer is not inactive'; return 1; }
  [[ $(systemctl show --property=UnitFileState --value \
    "$POSTGRES_RUNTIME_DAILY_V6_TIMER") == disabled ]] || \
    { fail 'contained daily C1 v6 timer is not disabled'; return 1; }
  [[ $(systemctl show --property=ActiveState --value \
    "$POSTGRES_RUNTIME_DAILY_V6_TIMER") == inactive ]] || \
    { fail 'contained daily C1 v6 timer is not inactive'; return 1; }
  [[ $(systemctl show --property=ActiveState --value \
    "$POSTGRES_RUNTIME_DAILY_SERVICE") == inactive ]] || \
    { fail 'contained daily C1 legacy service is not inactive'; return 1; }
  [[ $(systemctl show --property=ActiveState --value \
    "$POSTGRES_RUNTIME_DAILY_V6_SERVICE") == inactive ]] || \
    { fail 'contained daily C1 v6 service is not inactive'; return 1; }
  for unit in "$POSTGRES_RUNTIME_DAILY_TIMER" \
    "$POSTGRES_RUNTIME_DAILY_SERVICE"; do
    [[ $(systemctl show --property=FragmentPath --value "$unit") == \
       "$unit_directory/$unit" ]] || return 1
    [[ -z $(systemctl show --property=DropInPaths --value "$unit") ]] || return 1
    cmp -s "$release/$unit" "$unit_directory/$unit" || return 1
  done
}

enforce_postgres_runtime_daily_c1_containment() {
  local release=$1 unit_directory=$2 timer sha
  sha=$(postgres_runtime_daily_c1_containment_sha) || return
  for timer in "$POSTGRES_RUNTIME_DAILY_TIMER" \
    "$POSTGRES_RUNTIME_DAILY_V6_TIMER"; do
    systemctl stop "$timer" || \
      { fail "contained daily C1 timer could not be stopped: $timer"; return 1; }
    systemctl disable "$timer" || \
      { fail "contained daily C1 timer could not be disabled: $timer"; return 1; }
  done
  verify_postgres_runtime_daily_c1_contained_topology \
    "$release" "$unit_directory" || return
  promote_postgres_runtime_daily_c1_containment_contained "$sha"
}

snapshot_postgres_runtime_daily_handoff() {
  local backup=$1 unit_directory=$2
  local timer unit unit_state active_state dropin
  local state_file=$backup/daily-timer-states

  : > "$state_file"
  for timer in \
    "$POSTGRES_RUNTIME_DAILY_TIMER" "$POSTGRES_RUNTIME_DAILY_V6_TIMER"; do
    unit_state=$(systemctl show --property=UnitFileState --value "$timer") || \
      { fail "daily timer enablement is unavailable: $timer"; return 1; }
    active_state=$(systemctl show --property=ActiveState --value "$timer") || \
      { fail "daily timer active state is unavailable: $timer"; return 1; }
    [[ -n $unit_state ]] || unit_state=not-found
    [[ ($unit_state =~ ^(enabled|disabled)$ && \
        $active_state =~ ^(active|inactive)$) || \
       ($unit_state == not-found && $active_state == inactive) ]] || {
      fail "daily timer state is not rollback-safe: $timer ($unit_state/$active_state)"
      return 1
    }
    printf '%s\t%s\t%s\n' "$timer" "$unit_state" "$active_state" \
      >> "$state_file"
  done
  for unit in \
    "$POSTGRES_RUNTIME_DAILY_V6_SERVICE" "$POSTGRES_RUNTIME_DAILY_V6_TIMER"; do
    if [[ -e $unit_directory/$unit || -L $unit_directory/$unit ]]; then
      cp -a "$unit_directory/$unit" "$backup/$unit.daily-handoff"
    else
      : > "$backup/$unit.daily-handoff.absent"
    fi
  done
  if [[ -e $CONTROL/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME || \
        -L $CONTROL/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME ]]; then
    cp -a "$CONTROL/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME" \
      "$backup/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME.daily-handoff"
  else
    : > "$backup/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME.daily-handoff.absent"
  fi
  dropin=$unit_directory/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_DIRECTORY/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN
  if [[ -e $dropin || -L $dropin ]]; then
    cp -a "$dropin" "$backup/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN.daily-handoff"
  else
    : > "$backup/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN.daily-handoff.absent"
  fi
}

restore_postgres_runtime_daily_handoff_units() {
  local backup=$1 unit_directory=$2 unit dropin dropin_directory
  for unit in \
    "$POSTGRES_RUNTIME_DAILY_V6_SERVICE" "$POSTGRES_RUNTIME_DAILY_V6_TIMER"; do
    if [[ -e $backup/$unit.daily-handoff || \
          -L $backup/$unit.daily-handoff ]]; then
      cp -a "$backup/$unit.daily-handoff" "$unit_directory/$unit.restore" || \
        return 1
      mv -f "$unit_directory/$unit.restore" "$unit_directory/$unit" || return 1
    elif [[ -f $backup/$unit.daily-handoff.absent ]]; then
      rm -f "$unit_directory/$unit" || return 1
    else
      return 1
    fi
  done
  if [[ -e $backup/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME.daily-handoff || \
        -L $backup/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME.daily-handoff ]]; then
    cp -a "$backup/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME.daily-handoff" \
      "$CONTROL/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME.restore" || return 1
    mv -f "$CONTROL/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME.restore" \
      "$CONTROL/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME" || return 1
  elif [[ -f $backup/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME.daily-handoff.absent ]]; then
    rm -f "$CONTROL/$POSTGRES_RUNTIME_DAILY_C1_RUNTIME" || return 1
  else
    return 1
  fi
  dropin_directory=$unit_directory/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_DIRECTORY
  dropin=$dropin_directory/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN
  if [[ -e $backup/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN.daily-handoff || \
        -L $backup/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN.daily-handoff ]]; then
    install -d -m 0755 "$dropin_directory"
    cp -a "$backup/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN.daily-handoff" \
      "$dropin.restore" || return 1
    mv -f "$dropin.restore" "$dropin" || return 1
  elif [[ -f $backup/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN.daily-handoff.absent ]]; then
    rm -f "$dropin" || return 1
  else
    return 1
  fi
}

restore_postgres_runtime_daily_handoff_states() {
  local backup=$1 timer unit_state active_state enablement_command current_unit_state
  local state_file=$backup/daily-timer-states
  local restored=0

  [[ -f $state_file ]] || return 0
  while IFS=$'\t' read -r timer unit_state active_state; do
    [[ $timer == "$POSTGRES_RUNTIME_DAILY_TIMER" || \
       $timer == "$POSTGRES_RUNTIME_DAILY_V6_TIMER" ]] || return 1
    [[ ($unit_state =~ ^(enabled|disabled)$ && \
        $active_state =~ ^(active|inactive)$) || \
       ($unit_state == not-found && $active_state == inactive) ]] || return 1
    case $unit_state in
      enabled) enablement_command=enable ;;
      disabled) enablement_command=disable ;;
      not-found)
        current_unit_state=$(systemctl show \
          --property=UnitFileState --value "$timer") || return 1
        [[ -n $current_unit_state ]] || current_unit_state=not-found
        [[ $current_unit_state == not-found && \
           $(systemctl show --property=ActiveState --value "$timer") == \
           inactive ]] || return 1
        restored=$((restored + 1))
        continue
        ;;
    esac
    systemctl stop "$timer" || return 1
    systemctl "$enablement_command" "$timer" || return 1
    [[ $active_state == inactive ]] || systemctl start "$timer" || return 1
    [[ $(systemctl show --property=UnitFileState --value "$timer") == \
       "$unit_state" ]] || return 1
    [[ $(systemctl show --property=ActiveState --value "$timer") == \
       "$active_state" ]] || return 1
    restored=$((restored + 1))
  done < "$state_file"
  ((restored == 2))
}

wait_postgres_runtime_daily_c1_services_idle() {
  local attempt service state
  local attempts=${POSTGRES_RUNTIME_DAILY_C1_TEST_IDLE_ATTEMPTS:-60}
  for ((attempt=0; attempt<attempts; attempt++)); do
    local all_idle=true
    for service in \
      "$POSTGRES_RUNTIME_DAILY_SERVICE" "$POSTGRES_RUNTIME_DAILY_V6_SERVICE"; do
      state=$(systemctl show --property=ActiveState --value "$service") || return
      [[ $state == inactive ]] || all_idle=false
    done
    [[ $all_idle == true ]] && return 0
    sleep 1
  done
  fail 'daily C1 handoff services did not become idle'
}

verify_postgres_runtime_daily_c1_v6_dropin() {
  local release=$1 unit_directory=$2 dropin expected_dropins
  dropin=$unit_directory/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_DIRECTORY/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN
  cmp -s "$release/$POSTGRES_RUNTIME_DAILY_C1_V6_DROPIN_ASSET" "$dropin" || {
    fail 'daily C1 v6 owner drop-in differs from release'
    return 1
  }
  expected_dropins=$dropin
  [[ $(systemctl show --property=DropInPaths --value \
    "$POSTGRES_RUNTIME_DAILY_V6_SERVICE") == "$expected_dropins" ]] || {
    fail 'daily C1 v6 service drop-in set is not exact'
    return 1
  }
}

bridge_postgres_runtime_daily_c1_owner() {
  local release=$1 unit_directory=$2 sha=$3 owner_state
  verify_postgres_runtime_daily_c1_bridge_assets "$release" "$unit_directory"
  persist_postgres_runtime_daily_c1_v6_owner "$sha"
  verify_postgres_runtime_daily_c1_v6_dropin "$release" "$unit_directory"
  owner_state=$(postgres_runtime_daily_c1_owner_state) || return
  [[ $owner_state == V6 ]] || return 0
  systemctl enable "$POSTGRES_RUNTIME_DAILY_V6_TIMER" || {
    fail 'daily C1 bridge could not enable the v6 timer'
    return 1
  }
  systemctl start "$POSTGRES_RUNTIME_DAILY_V6_TIMER" || {
    fail 'daily C1 bridge could not start the v6 timer'
    return 1
  }
  systemctl stop "$POSTGRES_RUNTIME_DAILY_TIMER" || return
  systemctl disable "$POSTGRES_RUNTIME_DAILY_TIMER" || return
  [[ $(systemctl show --property=UnitFileState --value \
      "$POSTGRES_RUNTIME_DAILY_V6_TIMER") == enabled && \
     $(systemctl show --property=ActiveState --value \
      "$POSTGRES_RUNTIME_DAILY_V6_TIMER") == active && \
     $(systemctl show --property=UnitFileState --value \
      "$POSTGRES_RUNTIME_DAILY_TIMER") == disabled && \
     $(systemctl show --property=ActiveState --value \
      "$POSTGRES_RUNTIME_DAILY_TIMER") == inactive ]] || {
    fail 'daily C1 bridge topology is invalid'
    return 1
  }
}

prove_postgres_runtime_daily_c1_flip_idle() {
  probe_daily_singleton_clear || {
    fail 'daily C1 handoff found an active daily singleton before owner flip'
    return 1
  }
  wait_postgres_runtime_daily_c1_services_idle
}

verify_postgres_runtime_daily_c1_handoff() {
  local release=$1 unit_directory=$2 next_trigger fragment unit
  local exec_condition='ExecCondition=/var/data/social-monitor/control/daily-c1-runtime.sh --check-legacy-owner'

  [[ $(systemctl show --property=UnitFileState --value \
    "$POSTGRES_RUNTIME_DAILY_TIMER") == enabled ]] || \
    { fail 'daily C1 legacy timer is not enabled'; return 1; }
  [[ $(systemctl show --property=ActiveState --value \
    "$POSTGRES_RUNTIME_DAILY_TIMER") == active ]] || \
    { fail 'daily C1 legacy timer is not active'; return 1; }
  next_trigger=$(systemctl show --property=NextElapseUSecRealtime --value \
    "$POSTGRES_RUNTIME_DAILY_TIMER") || return 1
  [[ -n $next_trigger && $next_trigger != n/a ]] || \
    { fail 'daily C1 legacy timer has no next trigger'; return 1; }
  [[ $(systemctl show --property=UnitFileState --value \
    "$POSTGRES_RUNTIME_DAILY_V6_TIMER") == disabled ]] || \
    { fail 'daily C1 v6 timer is not disabled'; return 1; }
  [[ $(systemctl show --property=ActiveState --value \
    "$POSTGRES_RUNTIME_DAILY_V6_TIMER") == inactive ]] || \
    { fail 'daily C1 v6 timer is not inactive'; return 1; }
  for unit in "$POSTGRES_RUNTIME_DAILY_TIMER" \
    "$POSTGRES_RUNTIME_DAILY_SERVICE"; do
    fragment=$(systemctl show --property=FragmentPath --value "$unit") || return 1
    [[ $fragment == "$unit_directory/$unit" ]] || \
      { fail "daily C1 systemd fragment path is invalid: $unit"; return 1; }
    [[ -z $(systemctl show --property=DropInPaths --value "$unit") ]] || \
      { fail "daily C1 systemd unit has an unreviewed drop-in: $unit"; return 1; }
    cmp -s "$release/$unit" "$unit_directory/$unit" || \
      { fail "daily C1 installed unit differs from release: $unit"; return 1; }
  done
  [[ $(systemctl show --property=Unit --value \
    "$POSTGRES_RUNTIME_DAILY_TIMER") == "$POSTGRES_RUNTIME_DAILY_SERVICE" ]] || \
    { fail 'daily C1 timer unit mapping is invalid'; return 1; }
  [[ $(grep -Fxc "$exec_condition" \
    "$release/$POSTGRES_RUNTIME_DAILY_SERVICE") == 1 ]] || \
    { fail 'daily C1 service ExecCondition is invalid'; return 1; }
  grep -Fx 'ExecStartPre=/var/data/social-monitor/control/daily-c1-runtime.sh --prepare-legacy-start' \
    "$release/$POSTGRES_RUNTIME_DAILY_SERVICE" >/dev/null || return 1
  grep -Fx 'ExecStart=/var/data/social-monitor/control/daily-c1-runtime.sh --run-and-complete-legacy' \
    "$release/$POSTGRES_RUNTIME_DAILY_SERVICE" >/dev/null || return 1
  grep -Fx 'ExecStopPost=/var/data/social-monitor/control/daily-c1-runtime.sh --complete-legacy-start' \
    "$release/$POSTGRES_RUNTIME_DAILY_SERVICE" >/dev/null || return 1
  cmp -s "$release/$POSTGRES_RUNTIME_DAILY_RUNNER" \
    "$CONTROL/$POSTGRES_RUNTIME_DAILY_RUNNER" || \
    { fail 'daily C1 installed runner differs from release'; return 1; }
  cmp -s "$release/$POSTGRES_RUNTIME_DAILY_C1_MARKER" \
    "$POSTGRES_RUNTIME_CURRENT/$POSTGRES_RUNTIME_DAILY_C1_MARKER" || \
    { fail 'daily C1 current readiness marker differs from release'; return 1; }
  verify_postgres_runtime_daily_c1_bridge_assets "$release" "$unit_directory"
  verify_postgres_runtime_daily_c1_v6_dropin "$release" "$unit_directory"
  [[ $(postgres_runtime_daily_c1_owner_state) == LEGACY ]] || {
    fail 'daily C1 effective owner is not LEGACY'
    return 1
  }
}

verify_postgres_runtime_daily_c1_ready_static() {
  local sha=$1 source=$REPO/ops/deploy/production-runtime
  local release=$POSTGRES_RUNTIME_RELEASES/$sha state unit fragment current_release
  local exec_condition='ExecCondition=/var/data/social-monitor/control/daily-c1-runtime.sh --check-legacy-owner'
  [[ $sha =~ ^[0-9a-f]{40}$ ]] || \
    { fail 'daily C1 static proof release marker is invalid'; return 1; }
  current_release=$(readlink -f "$POSTGRES_RUNTIME_CURRENT" 2>/dev/null || \
    realpath "$POSTGRES_RUNTIME_CURRENT") || return
  [[ $current_release == "$release" ]] || \
    { fail 'daily C1 static proof current release is invalid'; return 1; }
  verify_installed_postgres_runtime_daily_c1_readiness \
    "$source" "$release" "$POSTGRES_RUNTIME_CURRENT" || return
  state=$(postgres_runtime_daily_c1_readiness_state \
    "$release/$POSTGRES_RUNTIME_DAILY_C1_MARKER") || return
  [[ $state == READY ]] || \
    { fail 'daily C1 static proof requires READY readiness'; return 1; }
  for unit in "$POSTGRES_RUNTIME_DAILY_TIMER" \
    "$POSTGRES_RUNTIME_DAILY_SERVICE"; do
    fragment=$(systemctl show --property=FragmentPath --value "$unit") || return
    [[ $fragment == "$SYSTEMD_UNIT_DIR/$unit" ]] || return 1
    [[ -z $(systemctl show --property=DropInPaths --value "$unit") ]] || return 1
    cmp -s "$source/$unit" "$release/$unit" || return 1
    cmp -s "$release/$unit" "$SYSTEMD_UNIT_DIR/$unit" || return 1
  done
  [[ $(systemctl show --property=Unit --value \
    "$POSTGRES_RUNTIME_DAILY_TIMER") == "$POSTGRES_RUNTIME_DAILY_SERVICE" ]] || \
    return 1
  cmp -s "$release/$POSTGRES_RUNTIME_DAILY_RUNNER" \
    "$CONTROL/$POSTGRES_RUNTIME_DAILY_RUNNER" || return
  cmp -s "$source/$POSTGRES_RUNTIME_DAILY_RUNNER" \
    "$release/$POSTGRES_RUNTIME_DAILY_RUNNER" || return
  verify_postgres_runtime_daily_c1_baseline "$sha" || return
  [[ $(postgres_runtime_daily_c1_owner_state) == LEGACY ]] || return
  [[ $(grep -Fxc "$exec_condition" \
    "$release/$POSTGRES_RUNTIME_DAILY_SERVICE") == 1 ]]
}

verify_postgres_runtime_daily_c1_ready_topology() {
  local sha=$1
  local release=$POSTGRES_RUNTIME_RELEASES/$sha
  verify_postgres_runtime_daily_c1_ready_static "$sha" || return
  verify_postgres_runtime_daily_c1_handoff "$release" "$SYSTEMD_UNIT_DIR"
}

activate_postgres_runtime_daily_c1_handoff() {
  local release=$1 unit_directory=$2 sha=$3 backup=$4
  local containment owner_state
  containment=$(postgres_runtime_daily_c1_containment_state) || return
  if [[ $containment != clear ]]; then
    enforce_postgres_runtime_daily_c1_containment "$release" "$unit_directory"
    return
  fi
  owner_state=$(postgres_runtime_daily_c1_owner_state) || return
  if [[ $owner_state == V6 ]]; then
    systemctl enable "$POSTGRES_RUNTIME_DAILY_TIMER" || \
      { fail 'daily C1 legacy timer could not be enabled'; return 1; }
    systemctl stop "$POSTGRES_RUNTIME_DAILY_V6_TIMER" || {
      fail 'daily C1 READY could not stop the v6 timer before owner flip'
      return 1
    }
    prove_postgres_runtime_daily_c1_flip_idle || return
    : > "$backup/daily-c1-forward-only"
    postgres_runtime_daily_c1_fsync_path_and_parent \
      "$backup/daily-c1-forward-only"
    commit_postgres_runtime_daily_c1_legacy_owner "$sha" || return
  elif [[ $owner_state != LEGACY ]]; then
    fail 'daily C1 owner cannot activate READY'
    return 1
  fi
  # The durable LEGACY owner is the irreversible commit point. Every command
  # below is idempotent forward reconciliation; rollback must never restore V6.
  systemctl enable "$POSTGRES_RUNTIME_DAILY_TIMER" || \
    { fail 'daily C1 legacy timer could not be enabled'; return 1; }
  systemctl disable "$POSTGRES_RUNTIME_DAILY_V6_TIMER" || {
    fail 'daily C1 READY could not disable the v6 timer'
    return 1
  }
  systemctl stop "$POSTGRES_RUNTIME_DAILY_V6_TIMER" || {
    fail 'daily C1 READY could not stop the v6 timer'
    return 1
  }
  systemctl start "$POSTGRES_RUNTIME_DAILY_TIMER" || \
    { fail 'daily C1 legacy timer could not be started'; return 1; }
  verify_postgres_runtime_daily_c1_handoff "$release" "$unit_directory"
}

reconcile_effective_postgres_daily_timer() {
  local timer=$1 active_state next_trigger
  active_state=$(systemctl show --property=ActiveState --value "$timer") ||
    { fail "systemd daily timer active state is unavailable: $timer"; return 1; }
  case $active_state in
    active) ;;
    inactive) systemctl start "$timer" ||
      { fail "systemd daily timer could not be started: $timer"; return 1; } ;;
    *) fail "systemd daily timer active state is not reconcilable: $timer ($active_state)"
      return 1 ;;
  esac
  active_state=$(systemctl show --property=ActiveState --value "$timer") ||
    { fail "systemd daily timer active state is unavailable after reconciliation: $timer"; return 1; }
  [[ $active_state == active ]] ||
    { fail "systemd daily timer is not active after reconciliation: $timer"; return 1; }
  next_trigger=$(systemctl show --property=NextElapseUSecRealtime --value "$timer") ||
    { fail "systemd daily timer next trigger is unavailable: $timer"; return 1; }
  [[ -n $next_trigger && $next_trigger != n/a ]] ||
    { fail "systemd daily timer has no next trigger: $timer"; return 1; }
}

verify_effective_postgres_daily_topology() (
  set -euo pipefail
  local containment timer service runner
  local legacy_enabled=false v6_enabled=false
  # STATE is a required caller-owned deploy path.
  # shellcheck disable=SC2153
  local effective_service=$STATE/postgres-daily-service.$$.unit
  trap 'rm -f "$effective_service"' EXIT

  containment=$(postgres_runtime_daily_c1_containment_state) || return
  if [[ $containment != clear ]]; then
    verify_postgres_runtime_daily_c1_contained_topology \
      "$POSTGRES_RUNTIME_CURRENT" "$SYSTEMD_UNIT_DIR"
    return
  fi

  systemctl is-enabled --quiet "$POSTGRES_RUNTIME_DAILY_TIMER" && \
    legacy_enabled=true
  systemctl is-enabled --quiet "$POSTGRES_RUNTIME_DAILY_V6_TIMER" && \
    v6_enabled=true
  if [[ $legacy_enabled == "$v6_enabled" ]]; then
    fail 'exactly one reviewed production daily timer must be enabled'
    return 1
  fi
  if [[ $v6_enabled == true ]]; then
    timer=$POSTGRES_RUNTIME_DAILY_V6_TIMER
    service=$POSTGRES_RUNTIME_DAILY_V6_SERVICE
    runner=$CONTROL/run-reader-summary-production-day.sh
  else
    timer=$POSTGRES_RUNTIME_DAILY_TIMER
    service=$POSTGRES_RUNTIME_DAILY_SERVICE
    runner=$CONTROL/daily-run.sh
  fi
  [[ -f $runner ]] || {
    fail 'effective production daily runner is unavailable'
    return 1
  }
  [[ -z $(systemctl show --property=DropInPaths --value "$timer") ]] || {
    fail "systemd daily timer has an unreviewed drop-in: $timer"
    return 1
  }
  if [[ $service == "$POSTGRES_RUNTIME_DAILY_V6_SERVICE" ]]; then
    verify_postgres_runtime_daily_c1_v6_dropin \
      "$POSTGRES_RUNTIME_CURRENT" "$SYSTEMD_UNIT_DIR" || return
  else
    [[ -z $(systemctl show --property=DropInPaths --value "$service") ]] || {
      fail "systemd daily service has an unreviewed drop-in: $service"
      return 1
    }
  fi
  systemctl cat "$service" > "$effective_service" || {
    fail 'effective production daily service is unavailable'
    return 1
  }
  python3 "$REPO/ops/deploy/verify-postgres-runtime-topology.py" \
    daily "$effective_service" "$runner" || return
  reconcile_effective_postgres_daily_timer "$timer"
)
