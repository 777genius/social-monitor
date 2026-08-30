#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=ops/deploy/production-runtime/reader-summary-scheduler-hold-common.sh
source "$SCRIPT_DIR/reader-summary-scheduler-hold-common.sh"

[[ $# == 1 ]] || { echo 'usage: reader-summary-scheduler-hold-prepare.sh TARGET' >&2; exit 64; }
target=$1
reader_summary_hold_validate_target "$target" || { echo 'invalid target' >&2; exit 64; }
root=$(reader_summary_hold_root)
state=$root/control/deploy-state
marker=$(reader_summary_runtime_hold_path)
lock=$(reader_summary_hold_lock_path)
install -d -m 0755 "$state"
if [[ -v SOCIAL_MONITOR_READER_SUMMARY_DISPATCH_LOCK_FD ]]; then
  inherited_fd=$SOCIAL_MONITOR_READER_SUMMARY_DISPATCH_LOCK_FD
  [[ $inherited_fd == 7 && -e /proc/$$/fd/7 && \
     $(stat -Lc '%d:%i' /proc/$$/fd/7) == $(stat -Lc '%d:%i' "$lock") ]] || {
    echo 'reader-summary inherited scheduler dispatch lock is unsafe' >&2
    exit 76
  }
else
  exec 7>"$lock"
fi
flock -x 7
unset SOCIAL_MONITOR_READER_SUMMARY_DISPATCH_LOCK_FD

expected=$(reader_summary_runtime_hold_record "$target")
if [[ -e $marker || -L $marker ]]; then
  actual=$(reader_summary_hold_read_regular "$marker") || {
    echo 'reader-summary runtime hold is unsafe' >&2
    exit 76
  }
  [[ $actual == "$expected" ]] || {
    echo 'reader-summary runtime hold belongs to another target' >&2
    exit 76
  }
  printf 'held target=%s\n' "$target"
  exit 0
fi
next=$marker.next
[[ ! -e $next && ! -L $next ]] || {
  echo 'reader-summary runtime hold staging path exists' >&2
  exit 76
}
umask 077
printf '%s\n' "$expected" > "$next"
chmod 0600 "$next"
sync -f "$next"
mv -f "$next" "$marker"
sync -f "$marker"
sync -f "$state"
[[ $(reader_summary_hold_read_regular "$marker") == "$expected" ]] || {
  echo 'reader-summary runtime hold did not commit' >&2
  exit 76
}
printf 'held target=%s\n' "$target"
