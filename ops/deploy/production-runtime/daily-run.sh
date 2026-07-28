#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

if [[ ${SOCIAL_MONITOR_DAILY_RUN_TEST_MODE:-} == 1 ]]; then
  ROOT=${SOCIAL_MONITOR_DAILY_RUN_TEST_ROOT:?daily-run test root is required}
  [[ $ROOT == /tmp/* ]] || {
    echo 'daily production-day test root must be below /tmp' >&2
    exit 64
  }
  POSTGRES_ADMISSION_WAIT_SECONDS=${SOCIAL_MONITOR_DAILY_RUN_TEST_ADMISSION_WAIT_SECONDS:-7500}
  FLOCK_COMMAND=${SOCIAL_MONITOR_DAILY_RUN_TEST_FLOCK:-flock}
else
  ROOT=/var/data/social-monitor
  POSTGRES_ADMISSION_WAIT_SECONDS=7500
  FLOCK_COMMAND=flock
  unset SOCIAL_MONITOR_DAILY_RUN_TEST_MODE \
    SOCIAL_MONITOR_DAILY_RUN_TEST_ADMISSION_WAIT_SECONDS \
    SOCIAL_MONITOR_DAILY_RUN_TEST_DOCKER \
    SOCIAL_MONITOR_DAILY_RUN_TEST_FLOCK \
    SOCIAL_MONITOR_DAILY_RUN_TEST_ROOT \
    READER_SUMMARY_DAILY_RUN_EXPECTED_DATE \
    READER_SUMMARY_DAILY_RUN_FAILPOINT \
    READER_SUMMARY_DAILY_RUN_FAILPOINT_READY_FILE \
    READER_SUMMARY_DAILY_RUN_PAUSE_WORKER \
    READER_SUMMARY_DAILY_RUN_REPORT_DIR \
    READER_SUMMARY_DAILY_RUN_PUBLIC_DIR \
    READER_SUMMARY_DAILY_RUN_TEST_TODAY \
    READER_SUMMARY_DAILY_RUN_TIMEOUT_MS
fi
unset DATABASE_URL
DOCKER_COMMAND=${SOCIAL_MONITOR_DAILY_RUN_TEST_DOCKER:-docker}
COMPOSE=(
  "$DOCKER_COMMAND" compose -p social-monitor-prod
  --env-file "$ROOT/secrets/production.env"
  -f "$ROOT/integration/docker-compose.yml"
  -f "$ROOT/control/compose.production.yml"
  -f "$ROOT/control/compose.managed-db.yml"
  -f "$ROOT/control/postgres-runtime-current/compose.postgres-runtime.yml"
)
DATE_FLAG=${1:---yesterday}

case "$DATE_FLAG" in
  --today|--yesterday) ;;
  *) echo "usage: $0 [--today|--yesterday]" >&2; exit 64 ;;
esac

[[ $POSTGRES_ADMISSION_WAIT_SECONDS =~ \
   ^([0-9]+([.][0-9]+)?|[.][0-9]+)$ ]] || {
  echo "daily production-day admission wait is invalid" >&2
  exit 64
}

exec 9>"$ROOT/control/daily-run-singleton.lock"
"$FLOCK_COMMAND" -n 9 || {
  echo "daily production-day run already active"
  exit 0
}
exec 8>"$ROOT/control/daily-run.lock"
"$FLOCK_COMMAND" -w "$POSTGRES_ADMISSION_WAIT_SECONDS" 8 || {
  echo "daily production-day timed out waiting for PostgreSQL admission" >&2
  exit 75
}

runtime_release=$(cat "$ROOT/control/postgres-runtime-current/READY" 2>/dev/null || true)
backend_release=$(cat "$ROOT/control/deploy-state/backend.sha" 2>/dev/null || true)
if [[ ! $runtime_release =~ ^[0-9a-f]{40}$ || $runtime_release != "$backend_release" ]]; then
  echo "daily production-day runtime is not committed by the backend release" >&2
  exit 75
fi

"$ROOT/control/refresh-codex-auth.sh"

if [[ -f "$ROOT/runtime/auth-account-changed" ]]; then
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  if [[ -d "$ROOT/runtime/subscription-runtime/sessions" ]]; then
    mv "$ROOT/runtime/subscription-runtime/sessions" \
      "$ROOT/backups/subscription-runtime-sessions.$stamp"
  fi
  install -d -m 0700 -o 1000 -g 1000 \
    "$ROOT/runtime/subscription-runtime/sessions"
  "${COMPOSE[@]}" restart agent-runtime
  rm -f "$ROOT/runtime/auth-account-changed"
  sleep 3
fi

# The quoted body expands inside the daily runner container.
# shellcheck disable=SC2016
"${COMPOSE[@]}" --profile daily run --rm --no-deps daily-runner sh -lc '
  set -eu

  timeout_ms=${READER_SUMMARY_DAILY_RUN_TIMEOUT_MS:-12300000}
  report_dir=${READER_SUMMARY_DAILY_RUN_REPORT_DIR:-ops/evals}
  public_dir=${READER_SUMMARY_DAILY_RUN_PUBLIC_DIR:-/var/lib/social-monitor/artifacts/reports}
  requested_date=${READER_SUMMARY_DAILY_RUN_EXPECTED_DATE:-}
  if [ -z "$requested_date" ]; then
    today=${READER_SUMMARY_DAILY_RUN_TEST_TODAY:-$(date -u +%F)}
    requested_date=$(node -e '\''
      const { existsSync, readFileSync } = require("node:fs");
      const [flag, today, latestPath] = process.argv.slice(1);
      const validDate = (value) =>
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
      if (!validDate(today)) throw new Error("daily catch-up today is invalid");
      if (flag === "--today") {
        process.stdout.write(today);
        process.exit(0);
      }
      const yesterday = new Date(`${today}T00:00:00.000Z`);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const latestEligibleDate = yesterday.toISOString().slice(0, 10);
      if (!existsSync(latestPath)) {
        process.stdout.write(latestEligibleDate);
        process.exit(0);
      }
      const latest = JSON.parse(readFileSync(latestPath, "utf8"));
      if (
        !validDate(latest.requestedDate) ||
        latest.blockingPassed !== true
      ) {
        throw new Error("latest daily publication cannot anchor catch-up");
      }
      if (latest.requestedDate > latestEligibleDate) {
        throw new Error("latest daily publication is ahead of yesterday");
      }
      if (latest.requestedDate === latestEligibleDate) {
        process.stdout.write("already-published");
        process.exit(0);
      }
      const candidate = new Date(`${latest.requestedDate}T00:00:00.000Z`);
      candidate.setUTCDate(candidate.getUTCDate() + 1);
      process.stdout.write(candidate.toISOString().slice(0, 10));
    '\'' -- '"$DATE_FLAG"' "$today" "$public_dir/latest.v1.json")
  fi
  if [ "$requested_date" = already-published ]; then
    echo "daily production-day is already published through yesterday"
    exit 0
  fi
  case "$requested_date" in
    ????-??-??) ;;
    *) echo "daily production-day catch-up date is invalid" >&2; exit 64 ;;
  esac
  export READER_SUMMARY_DAILY_RUN_EXPECTED_DATE=$requested_date

  if [ -n "${READER_SUMMARY_DAILY_RUN_PAUSE_WORKER:-}" ]; then
    node scripts/run-with-timeout.mjs \
      --timeout-ms "$timeout_ms" \
      -- bash "$READER_SUMMARY_DAILY_RUN_PAUSE_WORKER" '"$DATE_FLAG"'
  else
    node scripts/run-with-timeout.mjs \
      --timeout-ms "$timeout_ms" \
      --node-options --max-old-space-size=1024 \
      -- ./node_modules/.bin/ts-node -r tsconfig-paths/register \
      scripts/run-reader-summary-production-day.ts \
      --date "$requested_date" --update
  fi

  expected_date=$requested_date

  latest_candidate="$report_dir/reader-summary-production-day-run.v1.json"
  dated_name="reader-summary-production-day-run.$expected_date.v1.json"
  dated_candidate="$report_dir/$dated_name"
  proof_name="reader-summary-production-day-run.$expected_date.publication-proof.v1.json"
  if [ -n "${READER_SUMMARY_DAILY_RUN_PAUSE_WORKER:-}" ]; then
    artifact_dir=$report_dir
  else
    artifact_dir=${READER_SUMMARY_PRODUCTION_DAY_ARTIFACT_DIR:-/tmp/social-monitor/reader-summary-production-day/$expected_date}
  fi
  evidence_artifact="$artifact_dir/durable-reader-summary-$expected_date.v1.json"
  frontend_artifact="$artifact_dir/frontend-reader-summary-$expected_date.fixture.v1.json"
  runtime_identity_name="runtime-live-identity-$expected_date.v1.json"
  runtime_identity_artifact="$artifact_dir/$runtime_identity_name"

  mkdir -p "$public_dir"
  staging_dir=$(mktemp -d "$public_dir/.reader-summary-publication.XXXXXX")
  trap '\''rm -rf "$staging_dir"'\'' EXIT HUP INT TERM
  staged_report="$staging_dir/$dated_name"
  staged_proof="$staging_dir/$proof_name"
  staged_runtime_identity="$staging_dir/$runtime_identity_name"
  cp "$dated_candidate" "$staged_report"
  cp "$runtime_identity_artifact" "$staged_runtime_identity"
  chmod 0444 "$staged_report"
  chmod 0444 "$staged_runtime_identity"

  node scripts/verify-reader-summary-production-day-publication.mjs \
    --latest-candidate "$latest_candidate" \
    --dated-report "$staged_report" \
    --expected-date "$expected_date" \
    --evidence-artifact "$evidence_artifact" \
    --frontend-artifact "$frontend_artifact" \
    --proof-out "$staged_proof"
  node scripts/verify-reader-summary-production-day-publication.mjs \
    --dated-report "$staged_report" \
    --expected-date "$expected_date" \
    --evidence-artifact "$evidence_artifact" \
    --frontend-artifact "$frontend_artifact" \
    --proof "$staged_proof"

  install_immutable() {
    source=$1
    destination=$2
    if [ -e "$destination" ]; then
      cmp -s "$source" "$destination" || {
        echo "immutable reader-summary publication conflicts with $destination" >&2
        return 1
      }
      return 0
    fi
    if ! ln "$source" "$destination" 2>/dev/null; then
      cmp -s "$source" "$destination" || {
        echo "immutable reader-summary publication raced at $destination" >&2
        return 1
      }
    fi
  }

  pause_publication_failpoint() {
    failpoint=$1
    if [ "${READER_SUMMARY_DAILY_RUN_FAILPOINT:-}" != "$failpoint" ]; then
      return 0
    fi
    ready=${READER_SUMMARY_DAILY_RUN_FAILPOINT_READY_FILE:?failpoint ready file is required}
    printf "%s\n" "$$" > "$ready"
    trap "" TERM
    while :; do sleep 0.1; done
  }

  dated_public="$public_dir/$dated_name"
  proof_public="$public_dir/$proof_name"
  runtime_identity_public="$public_dir/$runtime_identity_name"
  install_immutable "$staged_proof" "$proof_public"
  install_immutable "$staged_runtime_identity" "$runtime_identity_public"
  pause_publication_failpoint after-proof-before-report
  install_immutable "$staged_report" "$dated_public"
  node scripts/verify-reader-summary-production-day-publication.mjs \
    --dated-report "$dated_public" \
    --expected-date "$expected_date" \
    --evidence-artifact "$evidence_artifact" \
    --frontend-artifact "$frontend_artifact" \
    --proof "$proof_public"
  pause_publication_failpoint after-report-before-latest

  cp "$dated_public" "$staging_dir/latest.v1.json"
  chmod 0444 "$staging_dir/latest.v1.json"
  mv -f "$staging_dir/latest.v1.json" "$public_dir/latest.v1.json"
'
