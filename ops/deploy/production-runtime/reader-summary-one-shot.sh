#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=ops/deploy/production-runtime/reader-summary-scheduler-hold-common.sh
source "$SCRIPT_DIR/reader-summary-scheduler-hold-common.sh"

[[ $# == 1 ]] || { echo 'usage: reader-summary-one-shot.sh daily|weekly|rolling' >&2; exit 64; }
root=$(reader_summary_hold_root)
lock=$(reader_summary_hold_lock_path)
exec 7>"$lock"
flock -s 7
SOCIAL_MONITOR_READER_SUMMARY_DISPATCH_LOCK_FD=7
export SOCIAL_MONITOR_READER_SUMMARY_DISPATCH_LOCK_FD
reader_summary_require_scheduler_clear

case $1 in
  daily) exec "$root/control/daily-run.sh" --yesterday ;;
  weekly)
    release=$(reader_summary_hold_read_regular \
      "$root/control/deploy-state/backend.sha") || exit 75
    reader_summary_hold_validate_target "$release" || exit 75
    exec "$root/control/github-production-deploy.sh" \
      reader-summary-weekly-run "$release"
    ;;
  rolling) exec "$root/control/rolling-run.sh" ;;
  *) echo 'usage: reader-summary-one-shot.sh daily|weekly|rolling' >&2; exit 64 ;;
esac
