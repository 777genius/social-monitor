#!/usr/bin/env bash
set -euo pipefail

while (($# > 0)); do
  if [[ $1 == sh && ${2:-} == -lc && -n ${3:-} ]]; then
    exec "$1" "$2" "$3"
  fi
  shift
done

echo 'fake docker did not receive the daily-run container command' >&2
exit 64
