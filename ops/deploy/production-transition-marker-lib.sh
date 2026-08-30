#!/usr/bin/env bash

# Crash-safe marker publication for the authenticated production transition.
# The history policy supplies constants, validation, state inspection, and
# fail(). A fixed .next name is intentionally retained so residue is visible
# and can be reconciled instead of being hidden behind unbounded temp names.

production_transition_marker_failpoint() { :; }

production_transition_guarded_path_operation() {
  local action=$1 path=$2 expected=$3 canonical=${4:-} canonical_expected=${5:-}
  python3 - "$action" "$path" "$expected" "$canonical" "$canonical_expected" <<'PY'
import ctypes
import errno
import os
import stat
import subprocess
import sys
import uuid

action, path, expected, canonical, canonical_expected = sys.argv[1:]
expected_bytes = None if action == "read" else (expected + "\n").encode()
libc = ctypes.CDLL(None, use_errno=True)
AT_EMPTY_PATH = 0x1000
AT_SYMLINK_FOLLOW = 0x400
RENAME_EXCHANGE = 2

def die(message):
    raise SystemExit(message)

def identity(st):
    return (st.st_dev, st.st_ino)

def open_verified(candidate, content, allowed_modes=(0o600,)):
    try:
        fd = os.open(candidate, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
    except OSError as error:
        die(f"unsafe opened path: {error}")
    st = os.fstat(fd)
    if not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid() or \
            stat.S_IMODE(st.st_mode) not in allowed_modes:
        os.close(fd)
        die("opened path type, owner, or mode differs")
    data = b""
    while True:
        chunk = os.read(fd, 65536)
        if not chunk:
            break
        data += chunk
        if len(data) > 131072:
            os.close(fd)
            die("opened path is oversized")
    if content is not None and data != content:
        os.close(fd)
        die("opened path content differs")
    try:
        current = os.lstat(candidate)
    except OSError:
        os.close(fd)
        die("opened path disappeared")
    if identity(current) != identity(st) or not stat.S_ISREG(current.st_mode):
        os.close(fd)
        die("opened path identity differs")
    return fd, st, data

def same_path(candidate, st):
    try:
        current = os.lstat(candidate)
    except OSError:
        return False
    return stat.S_ISREG(current.st_mode) and identity(current) == identity(st)

def exchange(left, right):
    result = libc.renameat2(-100, os.fsencode(left), -100, os.fsencode(right), RENAME_EXCHANGE)
    if result != 0:
        error = ctypes.get_errno()
        die(f"guarded exchange failed: {os.strerror(error)}")

def call_hook():
    hook = os.environ.get("PRODUCTION_TRANSITION_PATH_OPERATION_HOOK", "")
    if os.environ.get("SOCIAL_MONITOR_DEPLOY_TEST_MODE") == "1" and hook:
        subprocess.run([hook, action, path, canonical], check=True)

def guarded_remove(candidate, fd, st):
    directory = os.path.dirname(candidate) or "."
    sentinel = os.path.join(directory, ".transition-sentinel-" + uuid.uuid4().hex)
    sentinel_fd = os.open(sentinel, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC, 0o600)
    sentinel_st = os.fstat(sentinel_fd)
    os.close(sentinel_fd)
    if not same_path(candidate, st):
        os.unlink(sentinel)
        die("guarded removal detected replacement")
    exchange(candidate, sentinel)
    try:
        if not same_path(sentinel, st) or not same_path(candidate, sentinel_st):
            exchange(candidate, sentinel)
            die("guarded removal exchanged a replacement")
        os.unlink(sentinel)
        if same_path(candidate, sentinel_st):
            os.unlink(candidate)
        else:
            die("guarded removal preserved uncertain replacement residue")
        os.fsync(os.open(directory, os.O_RDONLY | os.O_DIRECTORY))
    finally:
        for residue in (sentinel,):
            try:
                os.unlink(residue)
            except FileNotFoundError:
                pass

source_fd, source_st, source_data = open_verified(path, expected_bytes)
try:
    call_hook()
    if action == "read":
        if not same_path(path, source_st):
            die("opened path changed during read")
        if not source_data.endswith(b"\n") or b"\x00" in source_data:
            die("opened path content framing differs")
        sys.stdout.buffer.write(source_data)
    elif action == "remove":
        guarded_remove(path, source_fd, source_st)
    elif action == "promote":
        if not canonical:
            die("guarded promotion canonical path is missing")
        directory = os.path.dirname(canonical) or "."
        try:
            canonical_fd, canonical_st, _ = open_verified(
                canonical, (canonical_expected + "\n").encode(), (0o600, 0o644))
        except SystemExit:
            canonical_fd = None
            canonical_st = None
            if os.path.lexists(canonical):
                raise
        if not same_path(path, source_st):
            die("guarded promotion detected source replacement")
        if canonical_fd is None:
            result = libc.linkat(source_fd, b"", -100, os.fsencode(canonical), AT_EMPTY_PATH)
            if result != 0:
                error = ctypes.get_errno()
                if error in (errno.ENOENT, errno.EPERM):
                    proc_fd = os.fsencode(f"/proc/self/fd/{source_fd}")
                    result = libc.linkat(-100, proc_fd, -100, os.fsencode(canonical), AT_SYMLINK_FOLLOW)
                    error = ctypes.get_errno() if result != 0 else 0
                if error == errno.EEXIST:
                    die("guarded promotion refused concurrent canonical creation")
                if result != 0:
                    die(f"guarded promotion link failed: {os.strerror(error)}")
            if not same_path(canonical, source_st):
                die("guarded promotion canonical identity differs")
            guarded_remove(path, source_fd, source_st)
        else:
            try:
                if not same_path(canonical, canonical_st):
                    die("guarded promotion detected canonical replacement")
                exchange(path, canonical)
                if not same_path(canonical, source_st) or not same_path(path, canonical_st):
                    exchange(path, canonical)
                    die("guarded promotion exchanged a replacement")
                guarded_remove(path, canonical_fd, canonical_st)
            finally:
                os.close(canonical_fd)
        canonical_fd_check, canonical_st_check, _ = open_verified(canonical, expected_bytes)
        os.close(canonical_fd_check)
        os.fsync(os.open(directory, os.O_RDONLY | os.O_DIRECTORY))
    else:
        die("unknown guarded path operation")
finally:
    os.close(source_fd)
PY
}

production_transition_read_regular_file() {
  local path=$1 label=$2
  [[ -f $path && ! -L $path ]] || fail "$label is unsafe"
  production_transition_guarded_path_operation read "$path" '' || \
    fail "$label opened inode verification failed"
}

production_transition_remove_safe_duplicate() {
  local path=$1 expected=$2 label=$3 actual
  actual=$(production_transition_read_regular_file "$path" "$label") || return 1
  [[ $actual == "$expected" ]] || \
    fail "$label conflicts with authenticated durable state"
  production_transition_guarded_path_operation remove "$path" "$expected" || \
    fail "$label guarded removal failed"
  sync -f "$(dirname "$path")"
}

production_transition_promote_next() {
  local next=$1 marker=$2 expected=$3 existing=${4:-}
  production_transition_guarded_path_operation \
    promote "$next" "$expected" "$marker" "$existing" || \
    fail 'authenticated temporary record guarded promotion failed'
}

production_transition_exclusive_stage() {
  local next=$1 expected=$2 label=$3
  if ! (set -o noclobber; printf '%s\n' "$expected" > "$next") 2>/dev/null; then
    fail "$label was concurrently created"
  fi
  chmod 0600 "$next"
  sync -f "$next"
}

production_transition_read_sha_next() {
  local next=$1 label=$2 value
  value=$(production_transition_read_regular_file "$next" "$label") || return 1
  [[ $(wc -c < "$next") == 41 && $value =~ ^[0-9a-f]{40}$ ]] || \
    fail "$label is malformed"
  printf '%s\n' "$value"
}

production_transition_commit_effect_sha_marker() {
  local marker=$1 target=$2 label=$3 proof_function=$4
  local next=$marker.next existing='' residue scope
  scope=$(basename "$marker" .sha)
  validate_sha "$target"
  if [[ -e $marker || -L $marker ]]; then
    existing=$(marker_value "$(basename "$marker" .sha)") || \
      fail "$label validation failed"
    git -C "$REPO" cat-file -e "$existing^{commit}" 2>/dev/null && \
      git -C "$REPO" merge-base --is-ancestor "$existing" "$target" \
      2>/dev/null || fail "$label marker is outside target ancestry"
  fi
  if [[ -e $next || -L $next ]]; then
    residue=$(production_transition_read_sha_next \
      "$next" "$label temporary marker") || return 1
    [[ $residue == "$target" ]] || \
      fail "$label temporary marker belongs to another effect"
    "$proof_function" "$target" || \
      fail "$label temporary marker has no matching durable effect"
    if [[ $existing == "$target" ]]; then
      production_transition_remove_safe_duplicate \
        "$next" "$target" "$label temporary marker"
      return 0
    fi
    production_transition_marker_failpoint "$scope-before-marker"
    production_transition_promote_next "$next" "$marker" "$target" "$existing"
    sync -f "$marker"
    sync -f "$(dirname "$marker")"
    [[ $(marker_value "$(basename "$marker" .sha)") == "$target" ]] || \
      fail "$label recovered marker did not commit"
    production_transition_marker_failpoint "$scope-after-marker"
    return 0
  fi
  if [[ $existing == "$target" ]]; then
    "$proof_function" "$target" || fail "$label has no matching durable effect"
    return 0
  fi
  "$proof_function" "$target" || fail "$label durable effect is incomplete"
  production_transition_exclusive_stage "$next" "$target" "$label temporary marker"
  production_transition_marker_failpoint "$scope-before-marker"
  production_transition_promote_next "$next" "$marker" "$target" "$existing"
  sync -f "$marker"
  sync -f "$(dirname "$marker")"
  [[ $(marker_value "$(basename "$marker" .sha)") == "$target" ]] || \
    fail "$label marker did not commit"
  production_transition_marker_failpoint "$scope-after-marker"
}

production_transition_control_effect_installed() {
  production_transition_installed_control_sha "$1" >/dev/null
}

production_transition_reconcile_target_effect_markers() {
  local target=$1 bootstrap_next=$STATE/postgres-pool-bootstrap.sha.next
  local control_next=$STATE/control.sha.next
  if [[ -e $bootstrap_next || -L $bootstrap_next ]]; then
    commit_postgres_pool_bootstrap "$target"
  fi
  if [[ -e $control_next || -L $control_next ]]; then
    production_transition_commit_effect_sha_marker \
      "$STATE/control.sha" "$target" control production_transition_control_effect_installed
  fi
}

production_transition_consumption_status_rank() {
  case $1 in
    pending) printf '1\n' ;;
    runtime-complete) printf '2\n' ;;
    complete) printf '3\n' ;;
    *) return 1 ;;
  esac
}

production_transition_scheduler_hold_path() {
  printf '%s/%s\n' "$STATE" "$PRODUCTION_TRANSITION_SCHEDULER_HOLD_MARKER"
}

production_transition_scheduler_hold_exists() {
  local marker
  marker=$(production_transition_scheduler_hold_path) || return
  [[ -e $marker || -L $marker ]]
}

production_transition_scheduler_hold_record() {
  local phase=$1 authorization=$2 authorization_sha
  [[ $phase == held || $phase == release-authorized ]] || return 1
  production_transition_validate_authorization "$authorization" || return
  authorization_sha=$(printf '%s\n' "$authorization" | sha256sum | awk '{print $1}')
  printf '%s\n' \
    version=social-monitor-production-transition-scheduler-hold-v2 \
    "phase=$phase" "authorization-sha256=$authorization_sha" \
    "$authorization"
}

production_transition_read_scheduler_hold() {
  local marker
  marker=$(production_transition_scheduler_hold_path) || return
  production_transition_read_regular_file \
    "$marker" 'production transition scheduler hold'
}

production_transition_scheduler_hold_phase() {
  local authorization=$1 record held release
  record=$(production_transition_read_scheduler_hold) || return
  held=$(production_transition_scheduler_hold_record held "$authorization") || return
  release=$(production_transition_scheduler_hold_record \
    release-authorized "$authorization") || return
  if [[ $record == "$held" ]]; then
    printf 'held\n'
  elif [[ $record == "$release" ]]; then
    printf 'release-authorized\n'
  else
    fail 'production transition scheduler hold differs from signed authority'
  fi
}

production_transition_reconcile_scheduler_hold_next() {
  local authorization=$1 marker next next_record held release phase existing=''
  marker=$(production_transition_scheduler_hold_path) || return
  next=$marker.next
  [[ -e $next || -L $next ]] || return 0
  next_record=$(production_transition_read_regular_file \
    "$next" 'production transition scheduler hold temporary record') || return 1
  held=$(production_transition_scheduler_hold_record held "$authorization") || return
  release=$(production_transition_scheduler_hold_record \
    release-authorized "$authorization") || return
  if [[ $next_record == "$held" ]]; then
    phase=held
  elif [[ $next_record == "$release" ]]; then
    phase='release-authorized'
  else
    fail 'production transition scheduler hold temporary record differs from signed authority'
    return 1
  fi
  if [[ -e $marker || -L $marker ]]; then
    existing=$(production_transition_read_scheduler_hold) || return
    if [[ $existing == "$next_record" ]]; then
      production_transition_remove_safe_duplicate \
        "$next" "$next_record" 'production transition scheduler hold temporary record'
      sync -f "$STATE"
      return 0
    fi
  fi
  if [[ $phase == held ]]; then
    [[ -z $existing ]] || \
      fail 'held scheduler temporary record has an existing durable hold'
  else
    [[ $existing == "$held" ]] || \
      fail 'scheduler release temporary record lacks its exact held predecessor'
  fi
  production_transition_marker_failpoint "scheduler-hold-$phase-before-marker"
  production_transition_promote_next \
    "$next" "$marker" "$next_record" "$existing"
  sync -f "$marker"
  sync -f "$STATE"
  [[ $(production_transition_read_scheduler_hold) == "$next_record" ]] || \
    fail 'production transition scheduler hold temporary record did not recover'
  production_transition_marker_failpoint "scheduler-hold-$phase-after-marker"
}

production_transition_write_scheduler_hold() {
  local phase=$1 authorization=$2 marker next expected existing=''
  marker=$(production_transition_scheduler_hold_path) || return
  next=$marker.next
  expected=$(production_transition_scheduler_hold_record \
    "$phase" "$authorization") || return
  production_transition_reconcile_scheduler_hold_next "$authorization" || return 1
  if [[ -e $marker || -L $marker ]]; then
    existing=$(production_transition_read_scheduler_hold) || return
    [[ $existing != "$expected" ]] || return 0
  fi
  [[ ! -e $next && ! -L $next ]] || \
    fail 'production transition scheduler hold temporary record exists'
  production_transition_exclusive_stage \
    "$next" "$expected" 'production transition scheduler hold temporary record'
  production_transition_marker_failpoint "scheduler-hold-$phase-before-marker"
  production_transition_promote_next \
    "$next" "$marker" "$expected" "$existing"
  sync -f "$marker"
  sync -f "$STATE"
  [[ $(production_transition_read_scheduler_hold) == "$expected" ]] || \
    fail 'production transition scheduler hold did not commit'
  production_transition_marker_failpoint "scheduler-hold-$phase-after-marker"
}

production_transition_quiesce_scheduler_timers() {
  local timer service state
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 && \
        ${PRODUCTION_TRANSITION_TEST_REAL_SCHEDULER_HOLD:-} != 1 ]]; then
    return 0
  fi
  for timer in social-monitor-github-premidnight-capture-v1.timer \
    social-monitor-weekly.timer social-monitor-rolling.timer \
    social-monitor-daily.timer \
    social-monitor-reader-summary-production-day.timer; do
    state=$(systemctl show --property=UnitFileState --value "$timer") || return
    [[ $state != not-found ]] || continue
    systemctl disable --now "$timer" || return
    [[ $(systemctl show --property=UnitFileState --value "$timer") == disabled && \
       $(systemctl show --property=ActiveState --value "$timer") == inactive ]] || \
      fail "production transition scheduler hold did not quiesce $timer"
  done
  for service in social-monitor-github-premidnight-capture-v1.service \
    social-monitor-weekly.service social-monitor-rolling.service \
    social-monitor-daily.service \
    social-monitor-reader-summary-production-day.service; do
    state=$(systemctl show --property=ActiveState --value "$service") || return
    [[ $state == inactive || $state == failed || $state == not-found ]] || \
      fail "production transition scheduler hold found active service: $service"
  done
}

production_transition_begin_scheduler_hold() {
  local authorization=$1 phase marker
  marker=$(production_transition_scheduler_hold_path) || return
  PRODUCTION_TRANSITION_ACTIVE_SCHEDULER_AUTHORIZATION=$authorization
  if [[ ! -e $marker && ! -L $marker ]]; then
    production_transition_write_scheduler_hold held "$authorization"
  fi
  phase=$(production_transition_scheduler_hold_phase "$authorization") || return
  [[ $phase == held || $phase == release-authorized ]] || return 1
  [[ $phase != held ]] || production_transition_quiesce_scheduler_timers
}

production_transition_scheduler_hold_runtime_mode() {
  local authorization=${PRODUCTION_TRANSITION_ACTIVE_SCHEDULER_AUTHORIZATION:-}
  [[ -n $authorization ]] || \
    fail 'production transition scheduler mutation lacks signed authority'
  production_transition_scheduler_hold_phase "$authorization"
}

production_transition_authorize_scheduler_release() {
  local authorization=$1 complete
  complete=$(production_transition_consumption_record complete "$authorization") || return
  [[ $(production_transition_read_consumption_record) == "$complete" ]] || \
    fail 'scheduler release requires exact terminal transition consumption'
  [[ $(production_transition_scheduler_hold_phase "$authorization") == held ]] || {
    [[ $(production_transition_scheduler_hold_phase "$authorization") == \
       release-authorized ]] && return 0
    return 1
  }
  production_transition_write_scheduler_hold release-authorized "$authorization"
}

production_transition_resume_scheduler_hold() {
  local target=$1 authorization=$2 activated complete
  [[ $(production_transition_scheduler_hold_phase "$authorization") == \
     release-authorized ]] || \
    fail 'production transition scheduler resume is not authorized'
  complete=$(production_transition_consumption_record complete "$authorization") || return
  [[ $(production_transition_read_consumption_record) == "$complete" ]] || \
    fail 'scheduler release hook requires terminal transition receipt'
  production_transition_require_target_deploy_state "$target" allow-expired
  activated=$(production_transition_read_activation_marker) || \
    fail 'scheduler release hook requires durable target activation'
  [[ $activated == "$target" ]] || \
    fail 'scheduler release hook activation differs from target'
  declare -F production_transition_resume_runtime_schedulers >/dev/null || {
    if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 && \
          ${PRODUCTION_TRANSITION_TEST_REAL_SCHEDULER_HOLD:-} != 1 ]]; then
      return 0
    fi
    fail 'production transition runtime scheduler resume is unavailable'
  }
  production_transition_resume_runtime_schedulers "$target" || \
    fail 'production transition runtime scheduler resume failed'
  production_transition_marker_failpoint scheduler-hold-after-runtime-resume
}

production_transition_finalize_scheduler_hold() {
  local target=$1 authorization=$2 marker expected activated complete
  production_transition_validate_sha "$target" T || \
    fail 'scheduler hold finalization target is invalid'
  production_transition_validate_authorization "$authorization" || \
    fail 'scheduler hold finalization authorization is invalid'
  declare -F production_transition_require_host_terminal_receipt >/dev/null || \
    fail 'scheduler hold finalization requires the frozen host terminal hook'
  production_transition_require_host_terminal_receipt "$target" || \
    fail 'scheduler hold finalization requires the exact host terminal receipt'
  marker=$(production_transition_scheduler_hold_path) || return
  complete=$(production_transition_consumption_record complete "$authorization") || return
  [[ $(production_transition_read_consumption_record) == "$complete" ]] || \
    fail 'scheduler hold finalization requires terminal transition consumption'
  activated=$(production_transition_read_activation_marker) || \
    fail 'scheduler hold finalization requires durable target activation'
  [[ $activated == "$target" ]] || \
    fail 'scheduler hold finalization activation differs from target'
  [[ -e $marker || -L $marker ]] || return 0
  [[ $(production_transition_scheduler_hold_phase "$authorization") == \
     release-authorized ]] || \
    fail 'scheduler hold finalization is not authorized'
  expected=$(production_transition_scheduler_hold_record \
    release-authorized "$authorization") || return
  production_transition_remove_safe_duplicate \
    "$marker" "$expected" 'production transition scheduler hold' || \
    fail 'production transition scheduler hold removal failed'
  sync -f "$STATE" || fail 'production transition scheduler hold removal was not durable'
}

production_transition_parse_consumption() {
  local record=$1 expected_authorization=$2 label=$3 status authorization
  status=$(sed -n '2s/^status=//p' <<< "$record")
  authorization=$(tail -n +4 <<< "$record")
  production_transition_consumption_status_rank "$status" >/dev/null || {
    fail "$label status is malformed"
    return 1
  }
  [[ $record == "$(production_transition_consumption_record \
      "$status" "$expected_authorization")" ]] || \
    fail "$label differs from exact authenticated transition authority"
  printf '%s\n' "$status"
}

production_transition_prove_consumption_status() {
  local status=$1 authorization=$2 target activated
  target=$(sed -n 's/^t=//p' <<< "$authorization")
  case $status in
    pending) return 0 ;;
    runtime-complete)
      production_transition_require_target_deploy_state \
        "$target" allow-expired >/dev/null
      ;;
    complete)
      production_transition_require_target_deploy_state \
        "$target" allow-expired >/dev/null
      activated=$(production_transition_read_activation_marker) || \
        fail 'complete transition residue has no durable activation marker'
      [[ $activated == "$target" ]] || \
        fail 'complete transition residue activation differs from target'
      ;;
  esac
}

production_transition_reconcile_consumption_next() {
  local authorization=$1 marker=$STATE/$PRODUCTION_TRANSITION_REVIEW_CONSUMPTION_MARKER
  local next=$marker.next next_record next_status marker_record marker_status
  local next_rank marker_rank
  [[ -e $next || -L $next ]] || return 0
  next_record=$(production_transition_read_regular_file \
    "$next" 'transition review consumption temporary record') || return 1
  next_status=$(production_transition_parse_consumption \
    "$next_record" "$authorization" \
    'transition review consumption temporary record') || return 1
  production_transition_prove_consumption_status \
    "$next_status" "$authorization" || return 1
  next_rank=$(production_transition_consumption_status_rank "$next_status") || return 1
  if [[ -e $marker || -L $marker ]]; then
    marker_record=$(production_transition_read_consumption_record) || return 1
    marker_status=$(production_transition_parse_consumption \
      "$marker_record" "$authorization" \
      'transition review consumption record') || return 1
    marker_rank=$(production_transition_consumption_status_rank "$marker_status") || return 1
    if ((marker_rank >= next_rank)); then
      production_transition_remove_safe_duplicate \
        "$next" "$next_record" 'transition review consumption temporary record'
      sync -f "$STATE"
      return 0
    fi
    ((next_rank == marker_rank + 1)) || \
      fail 'transition review consumption temporary record skips a durable phase'
  elif [[ $next_status != pending ]]; then
    fail 'transition review consumption temporary record has no pending predecessor'
  fi
  production_transition_marker_failpoint "consumption-$next_status-before-marker"
  production_transition_promote_next \
    "$next" "$marker" "$next_record" "${marker_record:-}"
  sync -f "$marker"
  sync -f "$STATE"
  [[ $(production_transition_read_consumption_record) == "$next_record" ]] || \
    fail 'transition review consumption temporary record did not recover'
  production_transition_marker_failpoint "consumption-$next_status-after-marker"
}

production_transition_write_consumption() {
  local status=$1 authorization=$2
  local marker=$STATE/$PRODUCTION_TRANSITION_REVIEW_CONSUMPTION_MARKER
  local next=$marker.next expected actual
  production_transition_validate_authorization "$authorization"
  expected=$(production_transition_consumption_record "$status" "$authorization")
  production_transition_reconcile_consumption_next "$authorization" || return 1
  if [[ -e $marker || -L $marker ]]; then
    actual=$(production_transition_read_consumption_record) || return 1
    [[ $actual != "$expected" ]] || return 0
  fi
  [[ ! -e $next && ! -L $next ]] || \
    fail 'transition review consumption temporary record was not reconciled'
  production_transition_exclusive_stage \
    "$next" "$expected" 'transition review consumption temporary record'
  production_transition_marker_failpoint "consumption-$status-before-marker"
  production_transition_promote_next \
    "$next" "$marker" "$expected" "${actual:-}"
  sync -f "$marker"
  sync -f "$STATE"
  [[ $(production_transition_read_consumption_record) == "$expected" ]] || \
    fail 'transition review consumption record did not commit'
  production_transition_marker_failpoint "consumption-$status-after-marker"
}

production_transition_commit_activation() {
  local target=$1 marker=$STATE/$PRODUCTION_TRANSITION_ACTIVATED_MARKER
  local next=$marker.next existing='' residue authorization record expected_runtime
  authorization=$(production_transition_verify_embedded_review \
    "$target" '' '' allow-expired) || return 1
  expected_runtime=$(production_transition_consumption_record \
    runtime-complete "$authorization")
  record=$(production_transition_read_consumption_record) || return 1
  [[ $record == "$expected_runtime" ]] || \
    fail 'transition activation requires exact authenticated runtime completion'
  if existing=$(production_transition_read_activation_marker); then
    [[ $existing == "$target" ]] || \
      fail 'production transition was already activated by another target'
  fi
  if [[ -e $next || -L $next ]]; then
    residue=$(production_transition_read_sha_next \
      "$next" 'production transition activation temporary marker') || return 1
    [[ $residue == "$target" ]] || \
      fail 'production transition activation temporary marker belongs to another target'
    production_transition_verify_signed_target "$residue" allow-expired
    if [[ $existing == "$target" ]]; then
      production_transition_remove_safe_duplicate \
        "$next" "$target" 'production transition activation temporary marker'
      return 0
    fi
    production_transition_marker_failpoint 'activation-before-marker'
    production_transition_promote_next "$next" "$marker" "$target" "$existing"
  elif [[ $existing == "$target" ]]; then
    return 0
  else
    production_transition_exclusive_stage \
      "$next" "$target" 'production transition activation temporary marker'
    production_transition_marker_failpoint 'activation-before-marker'
    production_transition_promote_next "$next" "$marker" "$target" "$existing"
  fi
  sync -f "$marker"
  sync -f "$STATE"
  [[ $(production_transition_read_activation_marker) == "$target" ]] || \
    fail 'production transition activation marker did not commit'
  production_transition_marker_failpoint 'activation-after-marker'
}

production_transition_s2_bootstrap_pending() {
  local target=$1 authorization=$2 s2 current control bootstrap backend installed
  s2=$(sed -n 's/^review-s2=//p' <<< "$authorization")
  [[ $s2 =~ ^[0-9a-f]{40}$ ]] || fail 'authenticated bootstrap S2 is malformed'
  current=$(git -C "$REPO" rev-parse 'HEAD^{commit}') || \
    fail 'authenticated bootstrap integration cannot be read'
  [[ $current == "$s2" ]] || return 1
  control=$(marker_value control) || fail 'authenticated bootstrap control marker is invalid'
  bootstrap=$(marker_value postgres-pool-bootstrap) || \
    fail 'authenticated bootstrap PostgreSQL marker is invalid'
  backend=$(marker_value backend) || fail 'authenticated bootstrap backend marker is invalid'
  [[ $control == "$PRODUCTION_TRANSITION_BRIDGE_BASE" || $control == "$s2" ]] || \
    fail 'authenticated bootstrap control marker is outside exact B0 to S2'
  [[ $bootstrap == "$PRODUCTION_TRANSITION_BRIDGE_BASE" || $bootstrap == "$s2" ]] || \
    fail 'authenticated bootstrap PostgreSQL marker is outside exact B0 to S2'
  [[ $backend == "$PRODUCTION_TRANSITION_BACKEND_BASE" || \
     $backend == "$PRODUCTION_TRANSITION_BRIDGE_BASE" ]] || \
    fail 'authenticated bootstrap backend marker changed during control-only S2'
  installed=$(production_transition_installed_control_sha \
    "$PRODUCTION_TRANSITION_BRIDGE_BASE" "$s2") || return 1
  if [[ $control == "$s2" && $bootstrap == "$s2" ]]; then
    production_transition_installed_control_sha "$s2" >/dev/null
    return 1
  fi
  [[ $installed =~ ^[0-9a-f]{40}$ ]] || \
    fail 'authenticated bootstrap installed controller is invalid'
  return 0
}

deploy_production_transition_bootstrap() {
  local target=$1 statement=$2 signature=$3 verification s2 lock_fd
  exec {lock_fd}>"$STATE/$PRODUCTION_TRANSITION_REVIEW_CONSUMPTION_LOCK"
  flock -w 3600 "$lock_fd" || \
    fail 'timed out waiting for authenticated bootstrap recovery lock'
  production_transition_verify_signed_target "$target" allow-expired
  verification=$(production_transition_verify_embedded_review \
    "$target" "$statement" "$signature" allow-expired) || return 1
  s2=$(sed -n 's/^review-s2=//p' <<< "$verification")
  production_transition_s2_bootstrap_pending "$target" "$verification" || \
    fail 'authenticated S2 bootstrap is not in an exact resumable phase'
  if postgres_pool_bootstrap_effect_installed "$s2"; then
    commit_postgres_pool_bootstrap "$s2"
    production_transition_commit_effect_sha_marker \
      "$STATE/control.sha" "$s2" control production_transition_control_effect_installed
  else
    deploy_release "$s2"
  fi
  production_transition_require_target_deploy_state "$target" allow-expired
  flock -u "$lock_fd"
  exec {lock_fd}>&-
}
