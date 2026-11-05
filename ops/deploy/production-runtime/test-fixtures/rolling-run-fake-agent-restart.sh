#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "$*" >> \
  "${SOCIAL_MONITOR_ROLLING_RUN_TEST_ROOT:?test root is required}/agent-restart.log"
[[ ${1:-} == --restart-agent-runtime ]]
