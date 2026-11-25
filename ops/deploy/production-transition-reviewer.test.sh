#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
/usr/bin/bash -n "$ROOT/ops/deploy/production-transition-reviewer.sh"
/usr/bin/grep -F 'PRODUCTION_TRANSITION_REVIEW_SIGNING_KEY' \
  "$ROOT/ops/deploy/production-transition-reviewer.sh" >/dev/null
! /usr/bin/grep -F 'PRODUCTION_TRANSITION_TARGET_SIGNING_KEY:-' \
  "$ROOT/ops/deploy/production-transition-reviewer.sh" >/dev/null
printf 'production transition reviewer authority boundary test passed\n'
