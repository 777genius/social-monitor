#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=ops/deploy/production-runtime/reader-summary-scheduler-hold-common.sh
source "$SCRIPT_DIR/reader-summary-scheduler-hold-common.sh"

[[ $# == 2 ]] || {
  echo 'usage: reader-summary-control-action.sh prepare|status|restore TARGET' >&2
  exit 64
}
action=$1
target=$2
reader_summary_hold_validate_target "$target" || { echo 'invalid target' >&2; exit 64; }
root=$(reader_summary_hold_root)
case $action in
  prepare) exec "$SCRIPT_DIR/reader-summary-scheduler-hold-prepare.sh" "$target" ;;
  status)
    held=$(reader_summary_runtime_hold_target) || status=$?
    if [[ ${status:-0} == 0 ]]; then
      [[ $held == "$target" ]] || exit 76
      printf 'held target=%s\n' "$target"
      exit 0
    fi
    [[ $status == 1 ]] || exit 76
    "$SCRIPT_DIR/reader-summary-scheduler-hold-status.sh"
    ;;
  restore)
    # The installed entrypoint authenticates and loads the target's deploy and
    # runtime helpers, including the canonical transition receipt verifier.
    # shellcheck source=/dev/null
    source "$root/control/github-production-deploy.sh"
    production_transition_resume_runtime_schedulers "$target"
    ;;
  *) echo 'unknown reader-summary control action' >&2; exit 64 ;;
esac
