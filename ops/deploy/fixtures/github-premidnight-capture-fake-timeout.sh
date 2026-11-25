#!/usr/bin/env bash
set -euo pipefail

events=${GITHUB_PREMIDNIGHT_FAKE_TIMEOUT_EVENTS:?fake timeout event path is required}
[[ $# -ge 6 && $1 == --foreground && $2 == --signal=TERM && \
   $3 == --kill-after=*s && $4 =~ ^[0-9]+s$ ]] || exit 64
printf '%s %s\n' "$3" "$4" >> "$events"
shift 4
exec "$@"
