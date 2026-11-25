#!/usr/bin/env bash
set -euo pipefail

while (($# > 0)); do
  if [[ $# == 6 && $1 == --profile && ${2:-} == app && ${3:-} == up &&
    ${4:-} == -d && ${5:-} == --no-deps && ${6:-} == agent-runtime ]]; then
    exit 0
  fi
  if [[ $1 == sh && ${2:-} == -lc && -n ${3:-} ]]; then
    exec "$1" "$2" "$3"
  fi
  shift
done

echo 'fake docker did not receive the daily-run container command' >&2
exit 64
