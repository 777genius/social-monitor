#!/usr/bin/env bash
set -euo pipefail

events=${GITHUB_PREMIDNIGHT_FAKE_FLOCK_EVENTS:?fake flock event path is required}
printf '%s\n' "$*" >> "$events"
case ${1:-} in
  -n)
    [[ $# == 2 && $2 == 9 ]] || exit 64
    exit "${GITHUB_PREMIDNIGHT_FAKE_FLOCK_SINGLETON_STATUS:-0}"
    ;;
  -w)
    [[ $# == 3 && $2 =~ ^[0-9]+$ && $3 == 8 ]] || exit 64
    exit "${GITHUB_PREMIDNIGHT_FAKE_FLOCK_ADMISSION_STATUS:-0}"
    ;;
  *)
    exit 64
    ;;
esac
