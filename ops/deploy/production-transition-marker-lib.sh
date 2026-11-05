#!/usr/bin/env bash
# Crash-safe marker publication for the authenticated production transition.
# The history policy supplies constants, validation, state inspection, and
# fail(). Fixed .next and content-addressed retired names keep every interrupted
# state visible and recoverable without unlinking an unverified basename.
production_transition_marker_failpoint() { :; }
production_transition_guarded_path_operation() {
  local action=$1 path=$2 expected=$3 canonical=${4:-} canonical_expected=${5:-}
  local canonical_identity=${6:-}
  python3 - "$action" "$path" "$expected" "$canonical" "$canonical_expected" \
    "$canonical_identity" <<'PY'
import ctypes, errno, hashlib, os, stat, subprocess, sys
action, path, expected, canonical, canonical_expected, canonical_identity = sys.argv[1:]
expected_bytes = None if action == "read" else (expected + "\n").encode()
libc = ctypes.CDLL(None, use_errno=True)
RENAME_NOREPLACE = 1
def die(message): raise SystemExit(message)
def identity(st): return (st.st_dev, st.st_ino)
def stable_identity(st):
    return (st.st_dev, st.st_ino, st.st_mode, st.st_uid, st.st_gid,
            st.st_size, st.st_mtime_ns)
def read_fd(fd):
    data = b""; offset = 0
    while True:
        chunk = os.pread(fd, 65536, offset)
        if not chunk: return data
        data += chunk; offset += len(chunk)
        if len(data) > 131072: die("opened path is oversized")
def marker_root(candidate):
    base = candidate.split(".retired.", 1)[0]
    return base[:-5] if base.endswith(".next") else base
def receipt_for(candidate, st, data):
    return candidate + ".retired." + hashlib.sha256(data).hexdigest()
def known_link_count(candidate, st, data):
    root = marker_root(candidate); count = 0
    names = (root, root + ".next", receipt_for(root, st, data),
             receipt_for(root + ".next", st, data))
    for name in names:
        try: current = os.lstat(name)
        except OSError: continue
        if stat.S_ISREG(current.st_mode) and identity(current) == identity(st): count += 1
    return count
def open_verified(candidate, content, allowed_modes=(0o600,), allowed_links=(1, 2)):
    try:
        fd = os.open(candidate, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
    except OSError as error: die(f"unsafe opened path: {error}")
    st = os.fstat(fd)
    if not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid() or \
            st.st_gid != os.getegid() or st.st_nlink not in allowed_links or \
            stat.S_IMODE(st.st_mode) not in allowed_modes:
        os.close(fd); die("opened path type, owner, or mode differs")
    data = read_fd(fd)
    if content is not None and data != content: os.close(fd); die("opened path content differs")
    try:
        current = os.lstat(candidate)
    except OSError: os.close(fd); die("opened path disappeared")
    if identity(current) != identity(st) or not stat.S_ISREG(current.st_mode):
        os.close(fd); die("opened path identity differs")
    if known_link_count(candidate, st, data) != st.st_nlink:
        os.close(fd); die("opened path has an unaccounted hardlink")
    return fd, st, data
def same_path(candidate, st):
    try:
        current = os.lstat(candidate)
    except OSError: return False
    return stat.S_ISREG(current.st_mode) and identity(current) == identity(st)
def call_hook(stage):
    hook = os.environ.get("PRODUCTION_TRANSITION_PATH_OPERATION_HOOK", "")
    if os.environ.get("SOCIAL_MONITOR_DEPLOY_TEST_MODE") == "1" and os.environ.get("PRODUCTION_TRANSITION_PATH_OPERATION_KILL_STAGE") == stage: os.kill(os.getpid(), 9)
    if os.environ.get("SOCIAL_MONITOR_DEPLOY_TEST_MODE") == "1" and hook:
        subprocess.run([hook, action, path, canonical, stage], check=True)
def parent_matches(candidate, fd):
    try: current = os.lstat(os.path.dirname(candidate) or ".")
    except OSError: return False
    opened = os.fstat(fd)
    return stat.S_ISDIR(opened.st_mode) and identity(opened) == identity(current)
def open_parent(candidate):
    directory = os.path.dirname(candidate) or "."
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC | os.O_NOFOLLOW)
    if not parent_matches(candidate, fd): os.close(fd); die("marker parent directory identity differs")
    return fd
def open_entry(parent_fd, candidate, expected_fd, initial_st, content, links):
    basename = os.path.basename(candidate)
    try:
        fd = os.open(basename, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW,
                     dir_fd=parent_fd)
    except OSError as error: die(f"guarded entry cannot be opened: {error}")
    st = os.fstat(fd)
    current = os.stat(basename, dir_fd=parent_fd, follow_symlinks=False)
    expected_st = os.fstat(expected_fd)
    if identity(st) != identity(current) or \
            stable_identity(st) != stable_identity(initial_st) or \
            stable_identity(st) != stable_identity(expected_st) or \
            st.st_nlink not in links or read_fd(fd) != content or \
            known_link_count(candidate, st, content) != st.st_nlink:
        os.close(fd); die("guarded entry differs from authenticated opened inode")
    return fd, st
def link_from_fd(source_fd, parent_fd, destination):
    try:
        os.link(f"/proc/self/fd/{source_fd}", os.path.basename(destination), dst_dir_fd=parent_fd, follow_symlinks=True)
    except FileExistsError: die("guarded transaction claim already exists")
    except OSError as error: die(f"guarded publication link failed: {error}")
def rename_noreplace(parent_fd, source, destination):
    result = libc.renameat2(parent_fd, os.fsencode(os.path.basename(source)),
                            parent_fd, os.fsencode(os.path.basename(destination)),
                            RENAME_NOREPLACE)
    if result == 0: return
    error = ctypes.get_errno()
    if error == errno.EEXIST: die("guarded retirement destination already exists")
    die(f"guarded retirement rename failed: {os.strerror(error)}")
def retire_name(parent_fd, candidate, expected_fd, initial_st, content, stage):
    receipt = receipt_for(candidate, initial_st, content)
    rename_noreplace(parent_fd, candidate, receipt)
    call_hook(stage)
    if os.path.lexists(candidate): die("guarded retirement source name remained")
    receipt_fd, receipt_st = open_entry(parent_fd, receipt, expected_fd,
                                        initial_st, content, (1, 2))
    if identity(receipt_st) != identity(initial_st): os.close(receipt_fd); die("guarded retirement moved another inode")
    os.close(receipt_fd); os.fsync(parent_fd)
    if not parent_matches(candidate, parent_fd): die("marker parent directory changed after retirement")
def guarded_remove(candidate, expected_fd, initial_st, content):
    parent_fd = open_parent(candidate)
    entry_fd = None
    try:
        os.fsync(parent_fd)
        call_hook("remove-before-retire")
        if not parent_matches(candidate, parent_fd): die("marker parent directory changed before removal")
        entry_fd, entry_st = open_entry(
            parent_fd, candidate, expected_fd, initial_st, content,
            (1, 2))
        call_hook("remove-after-open-before-retire")
        retire_name(parent_fd, candidate, expected_fd, entry_st, content,
                    "remove-after-retire-before-fsync")
    finally:
        if entry_fd is not None: os.close(entry_fd)
        os.close(parent_fd)
source_fd, source_st, source_data = open_verified(path, expected_bytes, (0o600,), (1, 2))
try:
    call_hook("before-action")
    after_hook = os.fstat(source_fd)
    os.lseek(source_fd, 0, os.SEEK_SET)
    after_data = os.read(source_fd, 131073)
    if stable_identity(after_hook) != stable_identity(source_st) or \
            after_hook.st_nlink != source_st.st_nlink or \
            after_hook.st_ctime_ns != source_st.st_ctime_ns or after_data != source_data:
        die("opened path changed after validation")
    if action == "read":
        if not same_path(path, source_st): die("opened path changed during read")
        if not source_data.endswith(b"\n") or b"\x00" in source_data: die("opened path content framing differs")
        sys.stdout.buffer.write(source_data)
    elif action == "remove":
        guarded_remove(path, source_fd, source_st, source_data)
    elif action == "promote":
        if not canonical: die("guarded promotion canonical path is missing")
        if os.path.abspath(os.path.dirname(canonical) or ".") != \
                os.path.abspath(os.path.dirname(path) or "."):
            die("guarded promotion paths have different parents")
        try:
            canonical_fd, canonical_st, canonical_data = open_verified(
                canonical, (canonical_expected + "\n").encode(),
                (0o600, 0o644), (1, 2))
            if canonical_identity:
                values = (canonical_st.st_dev, canonical_st.st_ino, canonical_st.st_mode, canonical_st.st_uid, canonical_st.st_gid, canonical_st.st_nlink, canonical_st.st_size, canonical_st.st_mtime_ns, canonical_st.st_ctime_ns)
                if ":".join(str(value) for value in values) != canonical_identity: die("guarded promotion canonical identity differs from validation")
        except SystemExit:
            canonical_fd = None; canonical_st = None
            if os.path.lexists(canonical): raise
        if not same_path(path, source_st): die("guarded promotion detected source replacement")
        if canonical_fd is not None and identity(source_st) == identity(canonical_st):
            try: guarded_remove(path, source_fd, source_st, source_data)
            finally: os.close(canonical_fd)
        else:
            parent_fd = open_parent(path)
            source_check_fd = canonical_check_fd = None
            linked = canonical_fd is None
            try:
                os.fsync(parent_fd)
                call_hook("promote-before-replace")
                if not parent_matches(canonical, parent_fd): die("marker parent directory changed before promotion")
                source_check_fd, _ = open_entry(parent_fd, path, source_fd,
                                                source_st, source_data, (1, 2))
                if not linked:
                    canonical_check_fd, _ = open_entry(parent_fd, canonical,
                        canonical_fd, canonical_st, canonical_data, (1, 2))
                call_hook("promote-after-open-before-retire")
                if not parent_matches(canonical, parent_fd): die("marker parent directory changed before mutation")
                if not linked:
                    retire_name(parent_fd, canonical, canonical_fd, canonical_st,
                                canonical_data, "promote-after-retire-before-fsync")
                link_from_fd(source_fd, parent_fd, canonical)
                published_fd, published_st = open_entry(parent_fd, canonical,
                    source_fd, source_st, source_data, (1, 2))
                os.close(published_fd)
                if identity(published_st) != identity(source_st):
                    die("guarded promotion replacement identity differs")
                os.fsync(parent_fd); call_hook("promote-after-link-before-next-retire")
                if not parent_matches(canonical, parent_fd): die("marker parent directory changed after promotion")
            finally:
                if canonical_check_fd is not None: os.close(canonical_check_fd)
                if source_check_fd is not None: os.close(source_check_fd)
                os.close(parent_fd)
                if canonical_fd is not None: os.close(canonical_fd)
            guarded_remove(path, source_fd, source_st, source_data)
        canonical_fd_check, canonical_st_check, _ = open_verified(
            canonical, expected_bytes, (0o600,), (1, 2))
        if identity(canonical_st_check) != identity(source_st):
            os.close(canonical_fd_check); die("final canonical differs from authenticated source")
        os.close(canonical_fd_check)
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
production_transition_retired_record_exists() {
  local path=$1 expected=$2 label=$3 receipt
  receipt=$(python3 -c 'import hashlib,sys; print(sys.argv[1]+".retired."+hashlib.sha256((sys.argv[2]+"\n").encode()).hexdigest())' "$path" "$expected") || return
  [[ -f $receipt && ! -L $receipt ]] || return 1
  [[ $(production_transition_read_regular_file "$receipt" "$label") == "$expected" ]]
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
production_transition_remove_legacy_sha_next() {
  local next=$1 residue=$2 target=$3 label=$4
  git -C "$REPO" cat-file -e "$residue^{commit}" 2>/dev/null && \
    git -C "$REPO" merge-base --is-ancestor "$residue" "$target" 2>/dev/null || \
    fail "$label is not an authenticated target ancestor"
  production_transition_remove_safe_duplicate "$next" "$residue" "$label"
}
production_transition_promote_next() {
  local next=$1 marker=$2 expected=$3 existing=${4:-} canonical_identity=${5:-}
  production_transition_guarded_path_operation \
    promote "$next" "$expected" "$marker" "$existing" "$canonical_identity" || \
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
production_transition_bootstrap_lock_validate() {
  local fd=$1 path=$2 owner_pid=$3
  python3 - "$fd" "$path" "$owner_pid" "$BASHPID" <<'PY'
import os, stat, sys
fd, path, owner, current = int(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4]
if owner != current:
    raise SystemExit("bootstrap lock belongs to another shell")
opened = os.fstat(fd)
current_path = os.lstat(path)
if not stat.S_ISREG(opened.st_mode) or not stat.S_ISREG(current_path.st_mode) or \
        (opened.st_dev, opened.st_ino) != (current_path.st_dev, current_path.st_ino) or \
        opened.st_uid != os.geteuid() or opened.st_gid != os.getegid() or \
        stat.S_IMODE(opened.st_mode) != 0o600 or opened.st_nlink != 1:
    raise SystemExit("bootstrap lock descriptor or path is unsafe")
PY
}
production_transition_bootstrap_lock_acquire() {
  local lock=$1
  [[ -z ${PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_FD:-} &&
     -z ${PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_OWNER:-} ]] ||
    fail 'PostgreSQL bootstrap marker inherited a lock descriptor'
  umask 077
  exec {PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_FD}<>"$lock" ||
    fail 'PostgreSQL bootstrap marker lock cannot be opened'
  PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_OWNER=$BASHPID
  if ! production_transition_bootstrap_lock_validate \
      "$PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_FD" "$lock" \
      "$PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_OWNER"; then
    exec {PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_FD}>&-
    unset PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_FD
    unset PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_OWNER
    fail 'PostgreSQL bootstrap marker lock is unsafe'
  fi
  if ! flock -w 3600 "$PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_FD"; then
    exec {PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_FD}>&-
    unset PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_FD
    unset PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_OWNER
    fail 'timed out waiting for PostgreSQL bootstrap marker lock'
  fi
  production_transition_bootstrap_lock_validate \
    "$PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_FD" "$lock" \
    "$PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_OWNER" || {
      exec {PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_FD}>&-
      unset PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_FD
      unset PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_OWNER
      fail 'PostgreSQL bootstrap marker lock changed while acquiring it'
    }
}
production_transition_bootstrap_lock_release() {
  local lock=$1 fd=${PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_FD:-}
  local owner=${PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_OWNER:-}
  [[ $fd =~ ^[0-9]+$ && $owner == "$BASHPID" ]] ||
    fail 'PostgreSQL bootstrap marker lock release is not owned by this shell'
  production_transition_bootstrap_lock_validate "$fd" "$lock" "$owner" ||
    fail 'PostgreSQL bootstrap marker lock changed before release'
  exec {PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_FD}>&-
  unset PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_FD
  unset PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_OWNER
}
production_transition_bootstrap_lock_abandon() {
  local fd=${PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_FD:-}
  [[ $fd =~ ^[0-9]+$ && \
     ${PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_OWNER:-} == "$BASHPID" ]] || \
    fail 'PostgreSQL bootstrap marker unsafe lock cannot be closed by this shell'
  exec {PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_FD}>&-
  unset PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_FD
  unset PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_OWNER
}
production_transition_prepare_bootstrap_next() {
  python3 - "$1" "$2" "$3" "${REPO:-}" <<'PY'
import hashlib, os, stat, subprocess, sys
marker, staged, target, repo = sys.argv[1:]
expected = (target + "\n").encode()
directory = os.path.dirname(marker) or "."
def identity(st): return st.st_dev, st.st_ino
def known_link_count(path, st, data):
    root = path[:-5] if path.endswith(".next") else path
    digest = hashlib.sha256(data).hexdigest(); count = 0
    for name in (root, root + ".next", root + ".retired." + digest,
                 root + ".next.retired." + digest):
        try: current = os.lstat(name)
        except OSError: continue
        if stat.S_ISREG(current.st_mode) and identity(current) == identity(st): count += 1
    return count
def encoded_identity(record):
    if not record: return ""
    st = os.fstat(record[0])
    return ":".join(str(value) for value in (
        st.st_dev, st.st_ino, st.st_mode, st.st_uid, st.st_gid, st.st_nlink,
        st.st_size, st.st_mtime_ns, st.st_ctime_ns))
def opened(path, modes, links):
    try:
        fd = os.open(path, os.O_RDWR | os.O_CLOEXEC | os.O_NOFOLLOW)
    except FileNotFoundError:
        return None
    st = os.fstat(fd)
    try: now = os.lstat(path)
    except OSError:
        os.close(fd); raise SystemExit("marker path disappeared")
    if not stat.S_ISREG(st.st_mode) or identity(st) != identity(now) or \
            st.st_uid != os.geteuid() or st.st_gid != os.getegid() or \
            stat.S_IMODE(st.st_mode) not in modes or st.st_nlink not in links:
        os.close(fd); raise SystemExit("marker type, identity, metadata, or links differ")
    data = os.read(fd, 42)
    if len(data) != 41 or data[-1:] != b"\n" or \
            any(c not in b"0123456789abcdef" for c in data[:-1]):
        os.close(fd); raise SystemExit("marker content or framing differs")
    if known_link_count(path, st, data) != st.st_nlink:
        os.close(fd); raise SystemExit("marker has an unaccounted hardlink")
    return fd, st, data
canonical = opened(marker, (0o600, 0o644), (1, 2))
next_record = opened(staged, (0o600, 0o644), (1, 2))
existing = canonical[2][:-1].decode() if canonical else ""
cleanup = ""
if canonical and next_record and identity(canonical[1]) == identity(next_record[1]):
    if canonical[2] != expected:
        raise SystemExit("same-inode marker residue differs from target")
elif canonical and canonical[2] == expected and next_record:
    # A killed exchange can leave the committed target at the canonical name
    # and its exact ancestor at .next. It is safe only when it is the value the
    # caller authenticated as the prior canonical marker.
    ancestor = next_record[2][:-1].decode()
    if not repo or subprocess.run(
            ["git", "-C", repo, "merge-base", "--is-ancestor", ancestor, target],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0:
        raise SystemExit("exchange residue is not a target ancestor")
    cleanup = ancestor
if canonical and canonical[2] == expected and next_record is None:
    print(existing + "|" + encoded_identity(canonical) + "|"); raise SystemExit(0)
if cleanup: print(existing + "|" + encoded_identity(canonical) + "|" + cleanup); raise SystemExit(0)
if next_record is None:
    fd = os.open(staged, os.O_RDWR | os.O_CREAT | os.O_EXCL |
                 os.O_CLOEXEC | os.O_NOFOLLOW, 0o600)
    os.write(fd, expected); os.fsync(fd); os.close(fd)
else:
    if next_record[2] != expected:
        raise SystemExit("temporary marker belongs to another target")
    os.fchmod(next_record[0], 0o600)
    os.fsync(next_record[0]); os.close(next_record[0])
final_identity = encoded_identity(canonical)
if canonical: os.close(canonical[0])
directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
os.fsync(directory_fd); os.close(directory_fd)
print(existing + "|" + final_identity + "|" + cleanup)
PY
}
production_transition_commit_postgres_pool_bootstrap() {
  local sha=$1 mode=${2:-normal} marker=$STATE/postgres-pool-bootstrap.sha
  local next=$marker.next lock=$STATE/postgres-pool-bootstrap.lock existing status
  local prepared canonical_identity cleanup remainder
  [[ $sha =~ ^[0-9a-f]{40}$ ]] || fail 'PostgreSQL bootstrap marker SHA is invalid'
  [[ $mode == normal || $mode == force-advance ]] ||
    fail 'PostgreSQL bootstrap marker advance mode is invalid'
  production_transition_bootstrap_lock_acquire "$lock"
  if ! prepared=$(production_transition_prepare_bootstrap_next \
      "$marker" "$next" "$sha"); then
    production_transition_bootstrap_lock_release "$lock"
    fail 'PostgreSQL bootstrap marker temporary path is invalid'
  fi
  existing=${prepared%%|*}
  remainder=${prepared#*|}
  canonical_identity=${remainder%%|*}
  cleanup=${remainder#*|}
  if [[ -n $cleanup ]]; then
    production_transition_remove_safe_duplicate \
      "$next" "$cleanup" 'PostgreSQL bootstrap marker ancestor residue'
    prepared=$(production_transition_prepare_bootstrap_next \
      "$marker" "$next" "$sha") || {
        production_transition_bootstrap_lock_release "$lock"
        fail 'PostgreSQL bootstrap marker cleanup did not reconcile'
      }
    existing=${prepared%%|*}; remainder=${prepared#*|}
    canonical_identity=${remainder%%|*}; cleanup=${remainder#*|}
    [[ -z $cleanup ]] || {
      production_transition_bootstrap_lock_release "$lock"
      fail 'PostgreSQL bootstrap marker cleanup remained pending'
    }
  fi
  if [[ $existing == "$sha" && ! -e $next && ! -L $next ]]; then
    if postgres_pool_bootstrap_physically_installed "$sha" "$sha"; then
      production_transition_bootstrap_lock_release "$lock"
      return 0
    fi
    production_transition_bootstrap_lock_release "$lock"
    fail 'PostgreSQL bootstrap marker has no installed effect'
  fi
  if ! postgres_pool_bootstrap_physically_installed "$sha" "$sha"; then
    production_transition_bootstrap_lock_release "$lock"
    fail 'PostgreSQL bootstrap marker has no installed effect'
  fi
  if production_transition_host_failpoint forward-bootstrap-next; then
    :
  else
    status=$?
    production_transition_bootstrap_lock_release "$lock"
    return "$status"
  fi
  if ! production_transition_bootstrap_lock_validate \
      "$PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_FD" "$lock" \
      "$PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_OWNER"; then
    production_transition_bootstrap_lock_abandon
    fail 'PostgreSQL bootstrap marker lock changed before promotion'
  fi
  if production_transition_promote_next \
      "$next" "$marker" "$sha" "$existing" "$canonical_identity"; then
    :
  else
    production_transition_bootstrap_lock_release "$lock"
    fail 'PostgreSQL bootstrap marker guarded promotion failed'
  fi
  if production_transition_host_failpoint forward-bootstrap-renamed; then
    :
  else
    status=$?
    production_transition_bootstrap_lock_release "$lock"
    return "$status"
  fi
  if ! production_transition_bootstrap_lock_validate \
      "$PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_FD" "$lock" \
      "$PRODUCTION_TRANSITION_BOOTSTRAP_LOCK_OWNER"; then
    production_transition_bootstrap_lock_abandon
    fail 'PostgreSQL bootstrap marker lock changed after promotion'
  fi
  if ! sync -f "$marker" || ! sync -f "$STATE"; then
    production_transition_bootstrap_lock_release "$lock"
    fail 'PostgreSQL bootstrap marker durability failed'
  fi
  if [[ $(production_transition_read_regular_file "$marker" \
      'PostgreSQL bootstrap marker') != "$sha" ]] ||
      ! postgres_pool_bootstrap_physically_installed "$sha" "$sha"; then
    production_transition_bootstrap_lock_release "$lock"
    fail 'PostgreSQL bootstrap marker did not commit the installed entrypoint'
  fi
  production_transition_bootstrap_lock_release "$lock"
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
    if [[ $existing == "$target" && $residue != "$target" ]]; then
      "$proof_function" "$target" || fail "$label has no matching durable effect"
      production_transition_remove_legacy_sha_next \
        "$next" "$residue" "$target" "$label temporary marker"
      return 0
    fi
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
  local marker next
  marker=$(production_transition_scheduler_hold_path) || return
  next=$marker.next
  [[ -e $marker || -L $marker || -e $next || -L $next ]]
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
    if [[ $existing == "$release" && $next_record == "$held" ]]; then
      production_transition_remove_safe_duplicate "$next" "$held" \
        'production transition scheduler hold temporary record'
      sync -f "$STATE"
      return 0
    fi
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
    [[ $existing == "$held" ]] || { [[ -z $existing ]] && \
      production_transition_retired_record_exists "$marker" "$held" 'retired held scheduler record'; } || \
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
  local authorization=$1 phase marker; marker=$(production_transition_scheduler_hold_path) || return
  PRODUCTION_TRANSITION_ACTIVE_SCHEDULER_AUTHORIZATION=$authorization
  production_transition_reconcile_scheduler_hold_next "$authorization" || return 1
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
  local target=$1 authorization=$2 marker next expected actual activated complete
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
  expected=$(production_transition_scheduler_hold_record release-authorized "$authorization") || return
  next=$marker.next
  if [[ ! -e $marker && ! -L $marker ]]; then
    if [[ ! -e $next && ! -L $next ]]; then
      production_transition_retired_record_exists "$marker" "$expected" 'retired scheduler release record' || \
        production_transition_retired_record_exists "$next" "$expected" 'retired scheduler temporary release record' || \
        fail 'scheduler hold finalization lacks its authenticated retirement receipt'
      return 0
    fi
    actual=$(production_transition_read_regular_file "$next" 'production transition scheduler hold temporary record') || return
    [[ $actual == "$expected" ]] || fail 'orphan scheduler release record is not authorized'
    production_transition_remove_safe_duplicate "$next" "$expected" 'production transition scheduler hold temporary record'
    sync -f "$STATE"; return 0
  fi
  production_transition_reconcile_scheduler_hold_next "$authorization" || return 1
  [[ $(production_transition_scheduler_hold_phase "$authorization") == \
     release-authorized ]] || \
    fail 'scheduler hold finalization is not authorized'
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
  local next=$marker.next next_record next_status marker_record marker_status next_rank marker_rank predecessor
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
    [[ $next_status == runtime-complete ]] && predecessor=pending || predecessor=runtime-complete
    predecessor=$(production_transition_consumption_record "$predecessor" "$authorization")
    production_transition_retired_record_exists "$marker" "$predecessor" 'retired transition review consumption record' || \
      fail 'transition review consumption temporary record has no exact predecessor'
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
    if [[ $existing == "$target" && $residue != "$target" ]]; then
      production_transition_verify_signed_target "$residue" allow-expired
      production_transition_remove_legacy_sha_next "$next" "$residue" "$target" \
        'production transition activation temporary marker'
      return 0
    fi
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
