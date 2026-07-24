#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

[[ $# == 0 ]] || {
  echo 'GitHub pre-midnight capture does not accept arguments' >&2
  exit 64
}

if [[ ${SOCIAL_MONITOR_GITHUB_PREMIDNIGHT_CAPTURE_TEST_MODE:-} == 1 ]]; then
  ROOT=${SOCIAL_MONITOR_GITHUB_PREMIDNIGHT_CAPTURE_TEST_ROOT:?test root is required}
  [[ $ROOT == /tmp/* ]] || {
    echo 'GitHub pre-midnight capture test root must be below /tmp' >&2
    exit 64
  }
  DATE_COMMAND=${SOCIAL_MONITOR_GITHUB_PREMIDNIGHT_CAPTURE_TEST_DATE:-date}
  DOCKER_COMMAND=${SOCIAL_MONITOR_GITHUB_PREMIDNIGHT_CAPTURE_TEST_DOCKER:-docker}
  FLOCK_COMMAND=${SOCIAL_MONITOR_GITHUB_PREMIDNIGHT_CAPTURE_TEST_FLOCK:-flock}
  TIMEOUT_COMMAND=${SOCIAL_MONITOR_GITHUB_PREMIDNIGHT_CAPTURE_TEST_TIMEOUT:-timeout}
  POSTGRES_ADMISSION_WAIT_SECONDS=${SOCIAL_MONITOR_GITHUB_PREMIDNIGHT_CAPTURE_TEST_ADMISSION_WAIT_SECONDS:-60}
else
  ROOT=/var/data/social-monitor
  DATE_COMMAND=date
  DOCKER_COMMAND=docker
  FLOCK_COMMAND=flock
  TIMEOUT_COMMAND=timeout
  POSTGRES_ADMISSION_WAIT_SECONDS=60
  unset SOCIAL_MONITOR_GITHUB_PREMIDNIGHT_CAPTURE_TEST_MODE \
    SOCIAL_MONITOR_GITHUB_PREMIDNIGHT_CAPTURE_TEST_ROOT \
    SOCIAL_MONITOR_GITHUB_PREMIDNIGHT_CAPTURE_TEST_DATE \
    SOCIAL_MONITOR_GITHUB_PREMIDNIGHT_CAPTURE_TEST_DOCKER \
    SOCIAL_MONITOR_GITHUB_PREMIDNIGHT_CAPTURE_TEST_FLOCK \
    SOCIAL_MONITOR_GITHUB_PREMIDNIGHT_CAPTURE_TEST_TIMEOUT \
    SOCIAL_MONITOR_GITHUB_PREMIDNIGHT_CAPTURE_TEST_ADMISSION_WAIT_SECONDS
fi
unset DATABASE_URL

readonly FINALIZATION_GUARD_SECONDS=10
readonly MAX_COLLECTION_SECONDS=540
COMPOSE=(
  "$DOCKER_COMMAND" compose -p social-monitor-prod
  --env-file "$ROOT/secrets/production.env"
  -f "$ROOT/integration/docker-compose.yml"
  -f "$ROOT/control/compose.production.yml"
  -f "$ROOT/control/compose.managed-db.yml"
  -f "$ROOT/control/postgres-runtime-current/compose.postgres-runtime.yml"
)

read_guarded_utc_clock() {
  local extra="" hour minute normalized second second_of_day
  IFS=' ' read -r CLOCK_EPOCH CLOCK_DATE CLOCK_HMS extra < <(
    "$DATE_COMMAND" -u '+%s %F %H%M%S'
  )
  [[ -z $extra && $CLOCK_EPOCH =~ ^[0-9]+$ && \
     $CLOCK_DATE =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ && \
     $CLOCK_HMS =~ ^[0-9]{6}$ ]] || {
    echo 'GitHub pre-midnight capture UTC clock is invalid' >&2
    return 64
  }
  normalized=$(
    "$DATE_COMMAND" -u --date "@$CLOCK_EPOCH" '+%F %H%M%S'
  ) || {
    echo 'GitHub pre-midnight capture UTC epoch cannot be normalized' >&2
    return 64
  }
  [[ $normalized == "$CLOCK_DATE $CLOCK_HMS" ]] || {
    echo 'GitHub pre-midnight capture UTC date and epoch are incoherent' >&2
    return 64
  }

  hour=$((10#${CLOCK_HMS:0:2}))
  minute=$((10#${CLOCK_HMS:2:2}))
  second=$((10#${CLOCK_HMS:4:2}))
  ((hour <= 23 && minute <= 59 && second <= 59)) || {
    echo 'GitHub pre-midnight capture UTC clock fields are invalid' >&2
    return 64
  }
  second_of_day=$((hour * 3600 + minute * 60 + second))
  ((CLOCK_EPOCH % 86400 == second_of_day)) || {
    echo 'GitHub pre-midnight capture UTC clock is incoherent' >&2
    return 64
  }
  ((hour == 23 && minute >= 45)) || {
    echo 'GitHub pre-midnight capture is outside 23:45:00..23:59:59 UTC' >&2
    return 64
  }

  SECONDS_UNTIL_MIDNIGHT=$((86400 - second_of_day))
}

read_guarded_utc_clock
collection_date=$CLOCK_DATE
collection_started_epoch=$CLOCK_EPOCH

exec 9>"$ROOT/control/github-premidnight-capture-v1-singleton.lock"
"$FLOCK_COMMAND" -n 9 || {
  echo 'GitHub pre-midnight capture singleton is already active' >&2
  exit 75
}

[[ $POSTGRES_ADMISSION_WAIT_SECONDS =~ ^[0-9]+$ ]] || {
  echo 'GitHub pre-midnight PostgreSQL admission wait is invalid' >&2
  exit 64
}
admission_budget=$((SECONDS_UNTIL_MIDNIGHT - FINALIZATION_GUARD_SECONDS))
((admission_budget > 0)) || {
  echo 'GitHub pre-midnight capture has no safe PostgreSQL admission window' >&2
  exit 75
}
admission_wait=$POSTGRES_ADMISSION_WAIT_SECONDS
((admission_wait <= admission_budget)) || admission_wait=$admission_budget

exec 8>"$ROOT/control/daily-run.lock"
"$FLOCK_COMMAND" -w "$admission_wait" 8 || {
  echo 'GitHub pre-midnight capture timed out waiting for PostgreSQL admission' >&2
  exit 75
}

read_guarded_utc_clock
[[ $CLOCK_DATE == "$collection_date" ]] || {
  echo 'GitHub pre-midnight capture UTC day changed during admission' >&2
  exit 75
}
((CLOCK_EPOCH >= collection_started_epoch)) || {
  echo 'GitHub pre-midnight capture UTC clock moved backwards' >&2
  exit 75
}

runtime_release=$(<"$ROOT/control/postgres-runtime-current/READY")
backend_release=$(<"$ROOT/control/deploy-state/backend.sha")
if [[ ! $runtime_release =~ ^[0-9a-f]{40}$ || \
      $runtime_release != "$backend_release" ]]; then
  echo 'GitHub pre-midnight capture runtime is not committed by the backend release' >&2
  exit 75
fi

collection_seconds=$((SECONDS_UNTIL_MIDNIGHT - FINALIZATION_GUARD_SECONDS))
((collection_seconds > 0)) || {
  echo 'GitHub pre-midnight capture has no safe collection window' >&2
  exit 75
}
((collection_seconds <= MAX_COLLECTION_SECONDS)) || \
  collection_seconds=$MAX_COLLECTION_SECONDS
collection_timeout_ms=$((collection_seconds * 1000))
container_name=social-monitor-prod-github-premidnight-capture-v1
capture_log=$ROOT/control/github-premidnight-capture-v1.$$.log
[[ ! -e $capture_log && ! -L $capture_log ]] || {
  echo 'GitHub pre-midnight capture log path already exists' >&2
  exit 73
}
umask 077
: > "$capture_log"

cleanup_capture_container() {
  local status cleanup_status=0 log_status=0
  status=$1
  trap - EXIT
  "$TIMEOUT_COMMAND" --foreground --signal=TERM --kill-after=1s 3s \
    "$DOCKER_COMMAND" rm -f "$container_name" >/dev/null 2>&1 || \
    cleanup_status=$?
  rm -f "$capture_log" || log_status=$?
  if ((cleanup_status != 0)); then
    echo 'GitHub pre-midnight capture container cleanup failed' >&2
  fi
  if ((log_status != 0)); then
    echo 'GitHub pre-midnight capture log cleanup failed' >&2
  fi
  if ((status == 0 && (cleanup_status != 0 || log_status != 0))); then
    status=74
  fi
  exit "$status"
}
trap 'cleanup_capture_container $?' EXIT

set +e
"$TIMEOUT_COMMAND" --foreground --signal=TERM --kill-after=3s \
  "${collection_seconds}s" \
  "${COMPOSE[@]}" --profile daily run --no-deps \
  --name "$container_name" \
  --env SUMMARY_MODEL_PROVIDER=deterministic \
  --env READER_SUMMARY_MODEL_PROVIDER=deterministic \
  --env READER_SUMMARY_TOPIC_LABELER=deterministic \
  --env OPENAI_API_KEY= \
  --env X_COLLECTOR_ENABLED=0 \
  --env X_COLLECTOR_EXPERIMENTAL_ENABLED=0 \
  daily-runner \
  node scripts/run-with-timeout.mjs \
  --timeout-ms "$collection_timeout_ms" \
  --node-options --max-old-space-size=768 \
  -- ./node_modules/.bin/ts-node -r tsconfig-paths/register \
  scripts/run-reader-summary-clean-real-day-collection.ts \
  --providers github-trending-page \
  --date "$collection_date" \
  2>&1 | tee "$capture_log"
pipeline_status=("${PIPESTATUS[@]}")
collection_status=${pipeline_status[0]}
tee_status=${pipeline_status[1]}
set -e
((collection_status == 0)) || exit "$collection_status"
((tee_status == 0)) || {
  echo 'GitHub pre-midnight capture output could not be recorded' >&2
  exit 74
}
[[ $(grep -Ec \
  '^Reader summary clean real-day collection OK \([1-9][0-9]* fresh items\)$' \
  "$capture_log") == 1 ]] || {
  echo 'GitHub pre-midnight capture did not prove a fresh live collection' >&2
  exit 70
}
if grep -Eq \
  'local source unavailable|artifact OK|without live collection|Recalculated' \
  "$capture_log"; then
  echo 'GitHub pre-midnight capture attempted a fallback' >&2
  exit 70
fi
