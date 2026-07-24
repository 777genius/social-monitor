#!/usr/bin/env bash
set -euo pipefail

if [[ $# == 4 && $1 == -u && $2 == --date && \
      $3 == @* && $4 == '+%F %H%M%S' ]]; then
  exec /usr/bin/date "$@"
fi
[[ $# == 2 && $1 == -u && $2 == '+%s %F %H%M%S' ]] || exit 64
sequence=${GITHUB_PREMIDNIGHT_FAKE_DATE_SEQUENCE:?fake date sequence is required}
state=${GITHUB_PREMIDNIGHT_FAKE_DATE_STATE:?fake date state is required}
index=0
[[ ! -f $state ]] || read -r index < "$state"
[[ $index =~ ^[0-9]+$ ]] || exit 64

current=0
selected=
while IFS= read -r line || [[ -n $line ]]; do
  if ((current == index)); then
    selected=$line
    break
  fi
  current=$((current + 1))
done < "$sequence"
[[ -n $selected ]] || exit 64

printf '%s\n' "$((index + 1))" > "$state"
printf '%s\n' "$selected"
