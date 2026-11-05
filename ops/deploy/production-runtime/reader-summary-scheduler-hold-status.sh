#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=ops/deploy/production-runtime/reader-summary-scheduler-hold-common.sh
source "$SCRIPT_DIR/reader-summary-scheduler-hold-common.sh"

[[ $# == 0 ]] || { echo 'usage: reader-summary-scheduler-hold-status.sh' >&2; exit 64; }
if reader_summary_scheduler_is_held; then
  printf 'held\n'
  exit 75
else
  status=$?
fi
((status == 1)) || { printf 'invalid\n' >&2; exit 76; }
printf 'clear\n'
