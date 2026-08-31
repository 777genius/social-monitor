#!/usr/bin/env bash
set -euo pipefail

date_value=
date_lock_dir=
fence_dir=
global_lock=
wait_seconds=7500
token_output=

while (($# > 0)); do
  case "$1" in
    --date) date_value=${2:-}; shift 2 ;;
    --date-lock-dir) date_lock_dir=${2:-}; shift 2 ;;
    --fence-dir) fence_dir=${2:-}; shift 2 ;;
    --global-lock) global_lock=${2:-}; shift 2 ;;
    --wait-seconds) wait_seconds=${2:-}; shift 2 ;;
    --token-output) token_output=${2:-}; shift 2 ;;
    --) shift; break ;;
    *) echo "unknown reader-summary date-lock option: $1" >&2; exit 64 ;;
  esac
done

[[ $date_value =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || {
  echo "reader-summary date lock requires YYYY-MM-DD" >&2
  exit 64
}
[[ $date_lock_dir == /* && $fence_dir == /* ]] || {
  echo "reader-summary date lock directories must be absolute" >&2
  exit 64
}
[[ $wait_seconds =~ ^[0-9]+$ ]] || {
  echo "reader-summary date lock wait must be whole seconds" >&2
  exit 64
}
(($# > 0)) || {
  echo "reader-summary date lock requires a command" >&2
  exit 64
}

mkdir -p "$date_lock_dir" "$fence_dir"
if [[ -n $global_lock ]]; then
  [[ $global_lock == /* ]] || {
    echo "reader-summary global lock path must be absolute" >&2
    exit 64
  }
  mkdir -p "$(dirname -- "$global_lock")"
  exec 8>"$global_lock"
  flock -w "$wait_seconds" 8 || {
    echo "reader-summary date lock timed out waiting for daily-run.lock" >&2
    exit 75
  }
fi

exec 7>"$date_lock_dir/$date_value.lock"
flock -w "$wait_seconds" 7 || {
  echo "reader-summary date lock timed out for $date_value" >&2
  exit 75
}

counter_path="$fence_dir/$date_value.counter"
counter=0
if [[ -e $counter_path ]]; then
  counter=$(<"$counter_path")
  [[ $counter =~ ^[0-9]+$ ]] || {
    echo "reader-summary date fence counter is invalid" >&2
    exit 76
  }
fi
next_counter=$((counter + 1))
next_path="$counter_path.next.$$"
(set -o noclobber; printf '%s\n' "$next_counter" >"$next_path")
mv "$next_path" "$counter_path"
fence_token="reader-summary-date:$date_value:$next_counter"
export READER_SUMMARY_DATE_FENCE_TOKEN=$fence_token

if [[ -n $token_output ]]; then
  [[ $token_output == /* ]] || {
    echo "reader-summary fence token output must be absolute" >&2
    exit 64
  }
  mkdir -p "$(dirname -- "$token_output")"
  token_next="$token_output.next.$$"
  (set -o noclobber; printf '%s\n' "$fence_token" >"$token_next")
  mv "$token_next" "$token_output"
fi

exec "$@"
