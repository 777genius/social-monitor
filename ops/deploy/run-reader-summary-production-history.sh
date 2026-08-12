#!/usr/bin/env bash
set -euo pipefail

readonly FIRST_RECOVERY_DATE=2026-07-23
readonly LAST_REVIEWED_DATE=2026-08-12
readonly DAILY_RUN=/var/data/social-monitor/control/daily-run.sh

through=${1:-}
[[ $# -eq 1 && $through =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || {
  echo 'usage: run-reader-summary-production-history.sh YYYY-MM-DD' >&2
  exit 64
}
[[ $through > 2026-07-22 && ($through < $LAST_REVIEWED_DATE || $through == "$LAST_REVIEWED_DATE") ]] || {
  echo 'historical reader-summary recovery-through date is outside the reviewed bound' >&2
  exit 64
}
yesterday=$(node -e 'process.stdout.write(new Date(Date.now()-86400000).toISOString().slice(0,10))')
[[ $through < $yesterday || $through == "$yesterday" ]] || {
  echo 'historical reader-summary recovery-through date must not exceed UTC yesterday' >&2
  exit 64
}
[[ -x $DAILY_RUN && ! -L $DAILY_RUN ]] || {
  echo 'reviewed daily production runner is unavailable' >&2
  exit 75
}

date=$FIRST_RECOVERY_DATE
while [[ $date < $through || $date == "$through" ]]; do
  "$DAILY_RUN" --maintenance-date "$date"
  # shellcheck disable=SC2016
  date=$(node -e 'const value=new Date(`${process.argv[1]}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate()+1); process.stdout.write(value.toISOString().slice(0,10))' "$date")
done
