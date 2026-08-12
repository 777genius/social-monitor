#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
# Canonical daily stages are owned by run-reader-summary-production-day.ts:
# collection -> collection quality -> AI summary -> publication gates.

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
  -f "$ROOT/integration/ops/deploy/production-runtime/compose.agent-runtime-model.yml"
  -f "$ROOT/integration/ops/deploy/production-runtime/compose.daily-artifacts.yml"
)
DATE_FLAG=${1:---yesterday}
MAINTENANCE_DATE=${2:-}

case "$DATE_FLAG" in
  --check-readiness|--today|--yesterday) ;;
  --maintenance-date)
    [[ $# -eq 2 && $MAINTENANCE_DATE =~ ^2026-(07-(2[3-9]|3[01])|08-(0[1-9]|1[0-2]))$ ]] || {
      echo "historical daily production-day date is outside the reviewed recovery bound" >&2
      exit 64
    }
    yesterday=$(node -e 'process.stdout.write(new Date(Date.now()-86400000).toISOString().slice(0,10))')
    [[ $MAINTENANCE_DATE < $yesterday || $MAINTENANCE_DATE == "$yesterday" ]] || {
      echo "historical daily production-day date must not exceed UTC yesterday" >&2
      exit 64
    }
    ;;
  *) echo "usage: $0 [--check-readiness|--today|--yesterday|--maintenance-date YYYY-MM-DD]" >&2; exit 64 ;;
esac

[[ $POSTGRES_ADMISSION_WAIT_SECONDS =~ \
   ^([0-9]+([.][0-9]+)?|[.][0-9]+)$ ]] || {
  echo "daily production-day admission wait is invalid" >&2
  exit 64
}

check_runtime_release() {
  local runtime_release backend_release
  runtime_release=$(cat "$ROOT/control/postgres-runtime-current/READY" 2>/dev/null || true)
  backend_release=$(cat "$ROOT/control/deploy-state/backend.sha" 2>/dev/null || true)
  if [[ ! $runtime_release =~ ^[0-9a-f]{40}$ || \
        $runtime_release != "$backend_release" ]]; then
    echo "daily production-day runtime is not committed by the backend release" >&2
    return 75
  fi
}

if [[ $DATE_FLAG == --check-readiness ]]; then
  check_runtime_release || exit 75
  exit 0
fi

exec 9>"$ROOT/control/daily-run-singleton.lock"
"$FLOCK_COMMAND" -n 9 || {
  echo "daily production-day run already active" >&2
  exit 75
}
exec 8>"$ROOT/control/daily-run.lock"
"$FLOCK_COMMAND" -w "$POSTGRES_ADMISSION_WAIT_SECONDS" 8 || {
  echo "daily production-day timed out waiting for PostgreSQL admission" >&2
  exit 75
}

check_runtime_release || exit 75

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

"${COMPOSE[@]}" --profile app up -d --no-deps agent-runtime

# The quoted body expands inside the daily runner container.
# shellcheck disable=SC2016
"${COMPOSE[@]}" --profile daily run --rm --no-deps daily-runner sh -lc '
  set -eu

  timeout_ms=${READER_SUMMARY_DAILY_RUN_TIMEOUT_MS:-12300000}
  report_dir=${READER_SUMMARY_DAILY_RUN_REPORT_DIR:-ops/evals}
  public_dir=${READER_SUMMARY_DAILY_RUN_PUBLIC_DIR:-/var/lib/social-monitor/artifacts/reports/reader-summary-production-v2}

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

  mkdir -p "$public_dir"
  cursor_date=
  if [ -e "$public_dir/latest-state.v1.json" ]; then
    cursor_date=$(node scripts/verify-reader-summary-production-day-state.mjs \
      --latest-state "$public_dir/latest-state.v1.json" \
      --state-dir "$public_dir")
  elif [ -e "$public_dir/latest.v1.json" ]; then
    migration_dir=$(mktemp -d "$public_dir/.reader-summary-state-migration.XXXXXX")
    migration_state="$migration_dir/legacy-state.v1.json"
    if ! legacy_date=$(node scripts/verify-reader-summary-production-day-state.mjs \
      --legacy-latest "$public_dir/latest.v1.json" \
      --state-dir "$public_dir" \
      --state-out "$migration_state"); then
      rm -rf "$migration_dir"
      exit 1
    fi
    legacy_state_name="reader-summary-production-day-state.$legacy_date.v1.json"
    if ! install_immutable \
      "$migration_state" "$public_dir/$legacy_state_name"; then
      rm -rf "$migration_dir"
      exit 1
    fi
    cp "$public_dir/$legacy_state_name" "$migration_dir/latest-state.v1.json"
    chmod 0444 "$migration_dir/latest-state.v1.json"
    mv "$migration_dir/latest-state.v1.json" "$public_dir/latest-state.v1.json"
    rm -rf "$migration_dir"
    cursor_date=$(node scripts/verify-reader-summary-production-day-state.mjs \
      --latest-state "$public_dir/latest-state.v1.json" \
      --state-dir "$public_dir")
    [ "$cursor_date" = "$legacy_date" ] || {
      echo "legacy daily publication cursor migration is inconsistent" >&2
      exit 1
    }
  else
    set -- "$public_dir"/reader-summary-production-day-state.*.v1.json
    if [ -e "$1" ]; then
      [ "$#" -eq 1 ] || {
        echo "daily production-day cursor recovery is ambiguous" >&2
        exit 1
      }
      recovery_date=$(node scripts/verify-reader-summary-production-day-state.mjs \
        --dated-state "$1" \
        --state-dir "$public_dir")
      recovery_dir=$(mktemp -d "$public_dir/.reader-summary-state-recovery.XXXXXX")
      cp "$1" "$recovery_dir/latest-state.v1.json"
      chmod 0444 "$recovery_dir/latest-state.v1.json"
      mv "$recovery_dir/latest-state.v1.json" "$public_dir/latest-state.v1.json"
      rm -rf "$recovery_dir"
      cursor_date=$(node scripts/verify-reader-summary-production-day-state.mjs \
        --latest-state "$public_dir/latest-state.v1.json" \
        --state-dir "$public_dir")
      [ "$cursor_date" = "$recovery_date" ] || {
        echo "daily production-day cursor recovery is inconsistent" >&2
        exit 1
      }
    fi
  fi

  requested_date='"$([[ $DATE_FLAG == --maintenance-date ]] && printf '%s' "$MAINTENANCE_DATE")"'
  historical_args=
  if [ '"$DATE_FLAG"' = --maintenance-date ]; then
    historical_args="--allow-historical --allow-historical-provider-collection"
  fi
  if [ -z "$requested_date" ]; then
    requested_date=${READER_SUMMARY_DAILY_RUN_EXPECTED_DATE:-}
  fi
  if [ -z "$requested_date" ]; then
    today=${READER_SUMMARY_DAILY_RUN_TEST_TODAY:-$(date -u +%F)}
    requested_date=$(node -e '\''
      const [flag, today] = process.argv.slice(1);
      const validDate = (value) =>
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
      if (!validDate(today)) throw new Error("daily catch-up today is invalid");
      const eligible = new Date(`${today}T00:00:00.000Z`);
      if (flag === "--yesterday") eligible.setUTCDate(eligible.getUTCDate() - 1);
      process.stdout.write(eligible.toISOString().slice(0, 10));
    '\'' -- '"$DATE_FLAG"' "$today")
  fi
  case "$requested_date" in
    ????-??-??) ;;
    *) echo "daily production-day catch-up date is invalid" >&2; exit 64 ;;
  esac
  if [ -n "$cursor_date" ] &&
     { [ "$requested_date" = "$cursor_date" ] || [ "$requested_date" \< "$cursor_date" ]; }; then
    echo "daily production-day is already terminal for $requested_date"
    exit 0
  fi
  node -e '\''
    const [previous, expected] = process.argv.slice(1);
    const validDate = (value) =>
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
    if (!validDate(expected)) {
      throw new Error("requested daily state date is invalid");
    }
    if (previous === "") process.exit(0);
    const next = new Date(`${previous}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    if (next.toISOString().slice(0, 10) !== expected) {
      throw new Error("requested daily state transition is not consecutive");
    }
  '\'' -- "$cursor_date" "$requested_date"
  export READER_SUMMARY_DAILY_RUN_EXPECTED_DATE=$requested_date
  rm -f \
    "$report_dir/reader-summary-production-day-outcome.$requested_date.v1.json"

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
      --date "$requested_date" --update $historical_args
  fi

  expected_date=$requested_date

  latest_candidate="$report_dir/reader-summary-production-day-run.v1.json"
  dated_name="reader-summary-production-day-run.$expected_date.v1.json"
  dated_candidate="$report_dir/$dated_name"
  proof_name="reader-summary-production-day-run.$expected_date.publication-proof.v1.json"
  outcome_name="reader-summary-production-day-outcome.$expected_date.v1.json"
  outcome_candidate="$report_dir/$outcome_name"
  state_name="reader-summary-production-day-state.$expected_date.v1.json"
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
  staged_outcome="$staging_dir/$outcome_name"
  staged_state="$staging_dir/$state_name"
  staged_runtime_identity="$staging_dir/$runtime_identity_name"
  terminal_state=
  if [ -e "$outcome_candidate" ]; then
    cp "$outcome_candidate" "$staged_outcome"
    chmod 0444 "$staged_outcome"
    node scripts/verify-reader-summary-production-day-state.mjs \
      --expected-date "$expected_date" \
      --terminal-outcome "$staged_outcome" \
      --state-out "$staged_state"
    terminal_state=$(node -e '\''
      const { readFileSync } = require("node:fs");
      process.stdout.write(JSON.parse(readFileSync(process.argv[1], "utf8")).state);
    '\'' -- "$staged_state")
  else
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
    node scripts/verify-reader-summary-production-day-state.mjs \
      --expected-date "$expected_date" \
      --publication-proof "$staged_proof" \
      --state-out "$staged_state"
    terminal_state=complete
  fi
  chmod 0444 "$staged_state"

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
  outcome_public="$public_dir/$outcome_name"
  state_public="$public_dir/$state_name"
  runtime_identity_public="$public_dir/$runtime_identity_name"

  previous_state_date=
  if [ -e "$public_dir/latest-state.v1.json" ]; then
    previous_state_date=$(node scripts/verify-reader-summary-production-day-state.mjs \
      --latest-state "$public_dir/latest-state.v1.json" \
      --state-dir "$public_dir")
  fi
  transition=$(node -e '\''
    const [previous, expected] = process.argv.slice(1);
    const next = (date) => {
      const value = new Date(`${date}T00:00:00.000Z`);
      value.setUTCDate(value.getUTCDate() + 1);
      return value.toISOString().slice(0, 10);
    };
    if (previous === "") process.stdout.write("initial");
    else if (previous === expected) process.stdout.write("replay");
    else if (next(previous) === expected) process.stdout.write("advance");
    else throw new Error("daily production-day state transition is not consecutive");
  '\'' -- "$previous_state_date" "$expected_date")

  if [ "$transition" = replay ]; then
    cmp -s "$staged_state" "$public_dir/latest-state.v1.json" || {
      echo "daily production-day replay conflicts with terminal truth" >&2
      exit 1
    }
    if [ "$terminal_state" = complete ]; then
      cmp -s "$public_dir/latest.v1.json" "$dated_public" || {
        echo "completed daily production-day replay has no exact latest article" >&2
        exit 1
      }
    fi
    exit 0
  fi

  if [ -e "$state_public" ]; then
    cmp -s "$staged_state" "$state_public" || {
      echo "daily production-day dated state conflicts with terminal truth" >&2
      exit 1
    }
  fi
  if [ "$terminal_state" = complete ]; then
    [ ! -e "$outcome_public" ] || {
      echo "completed daily production-day conflicts with a terminal outcome" >&2
      exit 1
    }
  else
    if [ -e "$dated_public" ] || [ -e "$proof_public" ]; then
      echo "non-complete daily production-day conflicts with a published article" >&2
      exit 1
    fi
  fi

  if [ "$terminal_state" = complete ]; then
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
    node scripts/verify-reader-summary-production-day-state.mjs \
      --expected-date "$expected_date" \
      --publication-proof "$proof_public" \
      --state "$staged_state"
    pause_publication_failpoint after-report-before-latest
  else
    install_immutable "$staged_outcome" "$outcome_public"
    node scripts/verify-reader-summary-production-day-state.mjs \
      --expected-date "$expected_date" \
      --terminal-outcome "$outcome_public" \
      --state "$staged_state"
  fi

  install_immutable "$staged_state" "$state_public"
  pause_publication_failpoint after-state-before-latest
  if [ "$terminal_state" = complete ]; then
    cp "$dated_public" "$staging_dir/latest.v1.json"
    chmod 0444 "$staging_dir/latest.v1.json"
    if [ -e "$public_dir/latest.v1.json" ] &&
       cmp -s "$staging_dir/latest.v1.json" "$public_dir/latest.v1.json"; then
      rm "$staging_dir/latest.v1.json"
    else
      mv -f "$staging_dir/latest.v1.json" "$public_dir/latest.v1.json"
    fi
  fi

  cp "$state_public" "$staging_dir/latest-state.v1.json"
  chmod 0444 "$staging_dir/latest-state.v1.json"
  mv -f "$staging_dir/latest-state.v1.json" "$public_dir/latest-state.v1.json"
'
