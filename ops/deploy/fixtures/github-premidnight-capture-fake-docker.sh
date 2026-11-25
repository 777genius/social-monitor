#!/usr/bin/env bash
set -euo pipefail

events=${GITHUB_PREMIDNIGHT_FAKE_DOCKER_EVENTS:?fake Docker event path is required}
{
  first=true
  for argument in "$@"; do
    if [[ $first == true ]]; then
      first=false
    else
      printf '\t'
    fi
    printf '%s' "$argument"
  done
  printf '\n'
} >> "$events"
if [[ ${1:-} == rm ]]; then
  exit "${GITHUB_PREMIDNIGHT_FAKE_DOCKER_CLEANUP_STATUS:-0}"
fi
printf '%s\n' "${GITHUB_PREMIDNIGHT_FAKE_DOCKER_OUTPUT-Reader summary clean real-day collection OK (10 fresh items)}"
exit "${GITHUB_PREMIDNIGHT_FAKE_DOCKER_STATUS:-0}"
