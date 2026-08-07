#!/usr/bin/env bash
# shellcheck disable=SC2317
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/social-monitor-recovery-maintenance-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

ROOT=$FIXTURE/root
REPO=$FIXTURE/repo
CONTROL=$ROOT/control
STATE=$CONTROL/deploy-state
POSTGRES_RUNTIME_CURRENT=$CONTROL/postgres-runtime-current
DAILY_SINGLETON_LOCK=$CONTROL/daily-run-singleton.lock
POSTGRES_ADMISSION_LOCK=$CONTROL/daily-run.lock
DAILY_RUNNER_MAINTENANCE_ADMISSION_WAIT_SECONDS=1
READER_SUMMARY_WEEKLY_PRODUCTION_ARTIFACT_DIR=/var/lib/social-monitor/artifacts/reader-summary-weekly-production
DOCKER_LOG=$FIXTURE/docker.log
COMPOSE_LOG=$FIXTURE/compose.log
AUTH_LOG=$FIXTURE/auth.log
ORDER_LOG=$FIXTURE/order.log
AUTH_CHANGED_MARKER=$ROOT/runtime/auth-account-changed
SHA=1234567890abcdef1234567890abcdef12345678
CONTROL_ONLY_SHA=89abcdef0123456789abcdef0123456789abcdef
DIVERGENT_BACKEND_SHA=fedcba9876543210fedcba9876543210fedcba98
FRONTEND_DOCS_ONLY_SHA=0123456789abcdef0123456789abcdef01234567
DIVERGENT_CONTROL_SHA=abcdef0123456789abcdef0123456789abcdef01
FAKE_GIT_HEAD=$SHA
FAKE_GIT_ANCESTORS=("$SHA")
FAKE_BACKEND_DIFF_STATUS=0
FAKE_CONTROL_DIFF_STATUS=0
BACKEND_PATHS=(backend)
CONTROL_PATHS=(control)
FINAL_MODEL_OVERLAY=$REPO/ops/deploy/production-runtime/compose.agent-runtime-model.yml
DAILY_CANONICAL_RECOVERY_CONFIRMATION=reader-summary-daily-canonical-recovery-v4
MODEL_JOB_IDENTITY=a771ebcf1dbb24f6a4eb1c6299133397a5fc1599ed4109c7fba27a0ec5e7b148
AUTHORITY_SHA256=010fd4f8da8aa2e4b332601e145e49549ff41c34b7ea498024b7449f9c827bbb
DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN=invalid-product-retry-set-v1
TERMINAL_SET_SHA256=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
AUTHORIZED_STDIN_RECORD="reader-summary-daily-canonical-recovery-v4 $DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN $TERMINAL_SET_SHA256"
LEGACY_STDIN_RECORD="$DAILY_CANONICAL_RECOVERY_CONFIRMATION 2026-07-23 $MODEL_JOB_IDENTITY $AUTHORITY_SHA256"

install -d "$REPO/ops/deploy" "$STATE" "$POSTGRES_RUNTIME_CURRENT" \
  "$ROOT/runtime/subscription-runtime/sessions" "$ROOT/backups"
cp "$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.sh" "$REPO/ops/deploy/"
printf '%s\n' "$SHA" > "$POSTGRES_RUNTIME_CURRENT/READY"
printf '%s\n' "$SHA" > "$STATE/backend.sha"
printf '%s\n' "$SHA" > "$STATE/control.sha"
: > "$DOCKER_LOG"
: > "$COMPOSE_LOG"
: > "$AUTH_LOG"
: > "$ORDER_LOG"

cat > "$CONTROL/refresh-codex-auth.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

[[ $# == 2 && ${1:-} == --broker-pool-job-id && \
   ${2:-} == social-monitor-production-account-pool-terra-v25-20260804 ]] || exit 93
if [[ ${ASSERT_AUTH_LOCKS_HELD:-0} == 1 ]]; then
  exec 6>"$DAILY_SINGLETON_LOCK"
  if flock -n 6; then exit 91; fi
  exec 6>&-
  exec 5>"$POSTGRES_ADMISSION_LOCK"
  if flock -n 5; then exit 92; fi
  exec 5>&-
fi
printf 'refresh:%s:%s\n' "$1" "$2" >> "$AUTH_LOG"
printf 'refresh\n' >> "$ORDER_LOG"
if [[ ${AUTH_ACCOUNT_CHANGED:-0} == 1 ]]; then
  : > "$AUTH_CHANGED_MARKER"
fi
SH
chmod 0700 "$CONTROL/refresh-codex-auth.sh"

fail() {
  printf 'test failure: %s\n' "$*" >&2
  exit 1
}

git() {
  if [[ ${1:-} == -C && ${2:-} == "$REPO" && ${3:-} == rev-parse && \
        ${4:-} == --verify && ${5:-} == 'HEAD^{commit}' ]]; then
    printf '%s\n' "$FAKE_GIT_HEAD"
    return 0
  fi
  if [[ ${1:-} == -C && ${2:-} == "$REPO" && ${3:-} == merge-base && \
        ${4:-} == --is-ancestor ]]; then
    local ancestor
    [[ ${6:-} == "$FAKE_GIT_HEAD" ]] || return 1
    for ancestor in "${FAKE_GIT_ANCESTORS[@]}"; do
      [[ ${5:-} == "$ancestor" ]] && return 0
    done
    return 1
  fi
  if [[ ${1:-} == -C && ${2:-} == "$REPO" && ${3:-} == diff && \
        ${4:-} == --quiet && ${7:-} == -- ]]; then
    shift 7
    case ${1:-} in
      backend)
        [[ $# == 1 && $1 == backend ]] || return 97
        return "$FAKE_BACKEND_DIFF_STATUS"
        ;;
      control)
        [[ $# == 1 && $1 == control ]] || return 97
        return "$FAKE_CONTROL_DIFF_STATUS"
        ;;
      *) return 97 ;;
    esac
  fi
  return 97
}

docker() {
  printf '%s\n' "$*" >> "$DOCKER_LOG"
  return 0
}

fake_compose() {
  local source_env_status=unset
  [[ -z ${READER_SUMMARY_PRODUCTION_RECOVERY_SOURCE_DATABASE_URL:-} ]] || \
    source_env_status=set
  if [[ ${ASSERT_WEEKLY_LOCKS_HELD:-0} == 1 ]]; then
    exec 6>"$DAILY_SINGLETON_LOCK"
    if flock -n 6; then
      return 91
    fi
    exec 6>&-
    exec 5>"$POSTGRES_ADMISSION_LOCK"
    if flock -n 5; then
      return 92
    fi
    exec 5>&-
  fi
  printf '%s\n' "$*" >> "$COMPOSE_LOG"
  printf 'source-env=%s\n' "$source_env_status" >> "$COMPOSE_LOG"
  if [[ $* == *'restart agent-runtime' ]]; then
    printf 'reset\n' >> "$ORDER_LOG"
  elif [[ $* == *'npm run run:reader-summary-daily-canonical-recovery'* ]]; then
    [[ $* != *'npm run authorize:reader-summary-daily-canonical-recovery-ambiguity-retry'* ]] || return 94
    if [[ $* == *'invalid-product-retry-set-v1'* ]]; then
      [[ $* == *"npm run run:reader-summary-daily-canonical-recovery -- invalid-product-retry-set-v1 $TERMINAL_SET_SHA256"* ]] || return 95
      [[ $* != *'prepare:reader-summary-production-recovery-gap-authority'* ]] || return 96
    else
      [[ $* == *'npm run prepare:reader-summary-production-recovery-gap-authority; npm run run:reader-summary-daily-canonical-recovery'* ]] || return 93
    fi
    printf '%s\n' canonical >> "$ORDER_LOG"
  elif [[ $* == *'scripts/run-reader-summary-daily-bounded-maintenance.ts'* ]]; then
    printf 'bounded\n' >> "$ORDER_LOG"
  fi
  [[ ${FAKE_COMPOSE_FAIL:-0} == 1 ]] && return 44
  return 0
}

export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
export DOCKER_LOG COMPOSE_LOG AUTH_LOG ORDER_LOG AUTH_CHANGED_MARKER DAILY_SINGLETON_LOCK \
  POSTGRES_ADMISSION_LOCK
COMPOSE=(fake_compose)

# shellcheck source=ops/deploy/reader-summary-recovery-maintenance-lib.sh
source "$REPO/ops/deploy/reader-summary-recovery-maintenance-lib.sh"
daily_runner_maintenance_sleep() { :; }
daily_runner_maintenance_now_seconds() { printf '%s\n' 0; }
install() {
  if [[ ${1:-} == -d && ${2:-} == -m && ${3:-} == 0700 && \
        ${4:-} == -o && ${5:-} == 1000 && ${6:-} == -g && \
        ${7:-} == 1000 ]]; then
    command install -d -m 0700 "$8"
    return
  fi
  command install "$@"
}

unset READER_SUMMARY_PRODUCTION_RECOVERY_SOURCE_DATABASE_URL
export ASSERT_AUTH_LOCKS_HELD=1
# Empty/EOF stdin is the ordinary ambiguity probe even when a caller injects
# the retired authorization environment names.
READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE=unexpected \
READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY=unexpected \
READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256=unexpected \
  run_reader_summary_daily_runner_maintenance reader-summary-recover-missing-days < /dev/null
ASSERT_WEEKLY_LOCKS_HELD=1
run_reader_summary_daily_runner_maintenance reader-summary-weekly-run
unset ASSERT_WEEKLY_LOCKS_HELD ASSERT_AUTH_LOCKS_HELD

recovery_command='--profile daily run --rm --no-deps -e READER_SUMMARY_DAILY_TENANT_ID=00000000-0000-7000-8000-000000000901 -e READER_SUMMARY_DAILY_WORKSPACE_ID=00000000-0000-7000-8000-000000000902 -e READER_SUMMARY_DAILY_FIRST_UNRESOLVED_UTC_DATE=2026-07-23 -e READER_SUMMARY_DAILY_PUBLIC_DIRECTORY=/var/lib/social-monitor/artifacts/reports daily-runner sh -lc set -eu; npm run prepare:reader-summary-production-recovery-gap-authority; npm run run:reader-summary-daily-canonical-recovery'
reconcile_command="-f $FINAL_MODEL_OVERLAY --profile app up -d --no-deps agent-runtime"
recovery_command="-f $FINAL_MODEL_OVERLAY $recovery_command"
weekly_command="-f $FINAL_MODEL_OVERLAY --profile daily run --rm --no-deps -e READER_SUMMARY_WEEKLY_PRODUCTION_TENANT_ID=00000000-0000-7000-8000-000000000901 -e READER_SUMMARY_WEEKLY_PRODUCTION_WORKSPACE_ID=00000000-0000-7000-8000-000000000902 -e READER_SUMMARY_WEEKLY_PRODUCTION_FIRST_WEEK_START=2026-07-27 -e READER_SUMMARY_WEEKLY_PRODUCTION_CATCH_UP_LIMIT=1 -e READER_SUMMARY_WEEKLY_PRODUCTION_ARTIFACT_DIR=/var/lib/social-monitor/artifacts/reader-summary-weekly-production daily-runner sh -lc set -eu; npm run run:reader-summary-weekly-production -- --week-start 2026-07-27; npm run run:reader-summary-weekly-production -- --replay --week-start 2026-07-27"
mapfile -t compose_commands < <(grep -v '^source-env=' "$COMPOSE_LOG")
[[ ${#compose_commands[@]} == 4 ]]
[[ ${compose_commands[0]} == "$reconcile_command" ]]
[[ ${compose_commands[1]} == "$recovery_command" ]]
[[ ${compose_commands[2]} == "$reconcile_command" ]]
[[ ${compose_commands[3]} == "$weekly_command" ]]
[[ $(grep -Fc 'source-env=unset' "$COMPOSE_LOG") == 4 ]]
[[ $(grep -Fc 'refresh:--broker-pool-job-id:social-monitor-production-account-pool-terra-v25-20260804' "$AUTH_LOG") == 2 ]]
! grep -F 'source-env=set' "$COMPOSE_LOG" >/dev/null
! grep -F 'READER_SUMMARY_PRODUCTION_RECOVERY_SOURCE_DATABASE_URL' \
  "$COMPOSE_LOG" >/dev/null
! grep -F 'backfill:reader-summary-weekly-daily-certifications' "$COMPOSE_LOG" >/dev/null
grep -F 'npm run run:reader-summary-weekly-production -- --week-start 2026-07-27; npm run run:reader-summary-weekly-production -- --replay --week-start 2026-07-27' "$COMPOSE_LOG" >/dev/null
! grep -F 'postgresql://' "$COMPOSE_LOG" >/dev/null
! grep -F 'pg_restore' "$DOCKER_LOG" "$COMPOSE_LOG" >/dev/null
! grep -F 'social-monitor-reader-summary-recovery-source-' \
  "$DOCKER_LOG" "$COMPOSE_LOG" >/dev/null
! compgen -G "$STATE/reader-summary-recovery-source.*.env" >/dev/null

: > "$COMPOSE_LOG"
: > "$AUTH_LOG"
: > "$ORDER_LOG"
run_reader_summary_daily_runner_maintenance \
  reader-summary-daily-terminal-set-receipt-v1 < /dev/null
receipt_command='--profile daily run --rm --no-deps daily-runner sh -lc set -eu; node scripts/run-with-timeout.mjs --timeout-ms 60000 --node-options --max-old-space-size=768 -- ./node_modules/.bin/ts-node -r tsconfig-paths/register scripts/read-reader-summary-daily-terminal-set-receipt.ts'
mapfile -t receipt_commands < <(grep -v '^source-env=' "$COMPOSE_LOG")
[[ ${#receipt_commands[@]} == 1 ]]
[[ ${receipt_commands[0]} == "$receipt_command" ]]
[[ ! -s $AUTH_LOG && ! -s $ORDER_LOG ]]
! grep -F -- '-f compose.agent-runtime-model.yml' "$COMPOSE_LOG" >/dev/null
! grep -F 'agent-runtime' "$COMPOSE_LOG" >/dev/null
! grep -F 'authorize:' "$COMPOSE_LOG" >/dev/null
! grep -F 'READER_SUMMARY_DAILY_TERMINAL_SET_RECEIPT_DIRECTORY' "$COMPOSE_LOG" >/dev/null

: > "$COMPOSE_LOG"
: > "$ORDER_LOG"
printf 'old subscription session\n' > "$ROOT/runtime/subscription-runtime/sessions/session"
export AUTH_ACCOUNT_CHANGED=1
printf '%s\n' "$LEGACY_STDIN_RECORD" | \
  run_reader_summary_daily_runner_maintenance reader-summary-recover-missing-days
unset AUTH_ACCOUNT_CHANGED
canonical_recovery_command="$recovery_command"
bounded_command="--profile daily run --rm --no-deps -e READER_SUMMARY_DAILY_TENANT_ID=00000000-0000-7000-8000-000000000901 -e READER_SUMMARY_DAILY_WORKSPACE_ID=00000000-0000-7000-8000-000000000902 -e READER_SUMMARY_DAILY_FIRST_UNRESOLVED_UTC_DATE=2026-07-31 -e READER_SUMMARY_DAILY_PUBLIC_DIRECTORY=/var/lib/social-monitor/artifacts/reports -e READER_SUMMARY_DAILY_COLLECTION_ARTIFACT_DIRECTORY=/var/lib/social-monitor/artifacts/reader-summary-daily-collection -e READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE=2026-07-23 -e READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY=$MODEL_JOB_IDENTITY -e READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256=$AUTHORITY_SHA256 daily-runner sh -lc set -eu; node scripts/run-with-timeout.mjs --timeout-ms 19800000 --node-options --max-old-space-size=768 -- ./node_modules/.bin/ts-node -r tsconfig-paths/register scripts/run-reader-summary-daily-bounded-maintenance.ts"
bounded_command="-f $FINAL_MODEL_OVERLAY $bounded_command"
restart_command="-f $FINAL_MODEL_OVERLAY restart agent-runtime"
mapfile -t bounded_commands < <(grep -v '^source-env=' "$COMPOSE_LOG")
[[ ${#bounded_commands[@]} == 7 ]]
[[ ${bounded_commands[0]} == "$restart_command" ]]
[[ ${bounded_commands[1]} == "$reconcile_command" ]]
[[ ${bounded_commands[2]} == "$canonical_recovery_command" ]]
for bounded_index in 3 4 5 6; do
  [[ ${bounded_commands[$bounded_index]} == "$bounded_command" ]]
done
[[ $(grep -Fc 'scripts/run-reader-summary-daily-bounded-maintenance.ts' "$COMPOSE_LOG") == 4 ]]
! grep -F 'npm run run:reader-summary-daily-bounded-maintenance' "$COMPOSE_LOG" >/dev/null
! grep -F 'npm run authorize:reader-summary-daily-canonical-recovery-ambiguity-retry' "$COMPOSE_LOG" >/dev/null
mapfile -t bounded_execution_order < "$ORDER_LOG"
[[ ${bounded_execution_order[*]} == 'refresh reset canonical bounded bounded bounded bounded' ]]
[[ ! -e $AUTH_CHANGED_MARKER ]]
[[ -d $ROOT/runtime/subscription-runtime/sessions ]]
compgen -G "$ROOT/backups/subscription-runtime-sessions.*/session" >/dev/null

: > "$COMPOSE_LOG"
: > "$ORDER_LOG"
printf '%s\n' "$AUTHORIZED_STDIN_RECORD" | \
  run_reader_summary_daily_runner_maintenance reader-summary-recover-missing-days
canonical_recovery_command="--profile daily run --rm --no-deps -e READER_SUMMARY_DAILY_TENANT_ID=00000000-0000-7000-8000-000000000901 -e READER_SUMMARY_DAILY_WORKSPACE_ID=00000000-0000-7000-8000-000000000902 -e READER_SUMMARY_DAILY_FIRST_UNRESOLVED_UTC_DATE=2026-07-23 -e READER_SUMMARY_DAILY_PUBLIC_DIRECTORY=/var/lib/social-monitor/artifacts/reports daily-runner sh -lc set -eu; npm run run:reader-summary-daily-canonical-recovery -- $DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN $TERMINAL_SET_SHA256"
canonical_recovery_command="-f $FINAL_MODEL_OVERLAY $canonical_recovery_command"
mapfile -t retry_set_commands < <(grep -v '^source-env=' "$COMPOSE_LOG")
[[ ${#retry_set_commands[@]} == 2 ]]
[[ ${retry_set_commands[0]} == "$reconcile_command" ]]
[[ ${retry_set_commands[1]} == "$canonical_recovery_command" ]]
! grep -F 'scripts/run-reader-summary-daily-bounded-maintenance.ts' "$COMPOSE_LOG" >/dev/null
! grep -F 'READER_SUMMARY_DAILY_FIRST_UNRESOLVED_UTC_DATE=2026-07-31' "$COMPOSE_LOG" >/dev/null
! grep -F 'npm run authorize:reader-summary-daily-canonical-recovery-ambiguity-retry' "$COMPOSE_LOG" >/dev/null
mapfile -t retry_set_execution_order < "$ORDER_LOG"
[[ ${retry_set_execution_order[*]} == 'refresh canonical' ]]
[[ ! -e $AUTH_CHANGED_MARKER ]]
[[ -d $ROOT/runtime/subscription-runtime/sessions ]]
compgen -G "$ROOT/backups/subscription-runtime-sessions.*/session" >/dev/null

assert_stdin_authorization_rejected() {
  local authorization_record=$1 status
  : > "$COMPOSE_LOG"
  : > "$AUTH_LOG"
  : > "$ORDER_LOG"
  set +e
  printf '%s\n' "$authorization_record" | \
    run_reader_summary_daily_runner_maintenance reader-summary-recover-missing-days \
      >/dev/null 2>&1
  status=$?
  set -e
  ((status != 0))
  [[ ! -s $COMPOSE_LOG ]]
  [[ ! -s $AUTH_LOG ]]
  [[ ! -s $ORDER_LOG ]]
}

assert_stdin_authorization_rejected \
  "reader-summary-daily-canonical-recovery-v4 $DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN"
assert_stdin_authorization_rejected \
  "reader-summary-daily-canonical-recovery-v4 $DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN $TERMINAL_SET_SHA256 extra"
assert_stdin_authorization_rejected \
  "reader-summary-daily-canonical-recovery-v4 $DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN short"
assert_stdin_authorization_rejected \
  "reader-summary-daily-canonical-recovery-v4 $DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN ${TERMINAL_SET_SHA256^^}"
assert_stdin_authorization_rejected \
  "reader-summary-daily-canonical-recovery-v4 wrong-invalid-product-retry-set-v1 $TERMINAL_SET_SHA256"
assert_stdin_authorization_rejected \
  "wrong-reader-summary-daily-canonical-recovery-v4 $DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN $TERMINAL_SET_SHA256"
assert_stdin_authorization_rejected \
  "reader-summary-daily-canonical-recovery-v4 $DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN 2026-07-24"
assert_stdin_authorization_rejected \
  "reader-summary-daily-canonical-recovery-v4  $DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN $TERMINAL_SET_SHA256"
assert_stdin_authorization_rejected \
  "$DAILY_CANONICAL_RECOVERY_CONFIRMATION 2026-07-23 $MODEL_JOB_IDENTITY"
assert_stdin_authorization_rejected \
  "$DAILY_CANONICAL_RECOVERY_CONFIRMATION 2026-07-23 $MODEL_JOB_IDENTITY $AUTHORITY_SHA256 extra"
assert_stdin_authorization_rejected \
  "$DAILY_CANONICAL_RECOVERY_CONFIRMATION 2026-07-23 short $AUTHORITY_SHA256"
assert_stdin_authorization_rejected \
  "$DAILY_CANONICAL_RECOVERY_CONFIRMATION 2026-07-23 ${MODEL_JOB_IDENTITY^^} $AUTHORITY_SHA256"
assert_stdin_authorization_rejected \
  "$DAILY_CANONICAL_RECOVERY_CONFIRMATION 2026-07-23 $MODEL_JOB_IDENTITY ${AUTHORITY_SHA256^^}"
assert_stdin_authorization_rejected \
  "wrong-reader-summary-daily-canonical-recovery-v4 2026-07-23 $MODEL_JOB_IDENTITY $AUTHORITY_SHA256"
assert_stdin_authorization_rejected \
  "$DAILY_CANONICAL_RECOVERY_CONFIRMATION 2026-07-24 $MODEL_JOB_IDENTITY $AUTHORITY_SHA256"

: > "$COMPOSE_LOG"
: > "$AUTH_LOG"
: > "$ORDER_LOG"
set +e
printf '%s' "$AUTHORIZED_STDIN_RECORD" | \
  run_reader_summary_daily_runner_maintenance reader-summary-recover-missing-days \
    >/dev/null 2>&1
status=$?
set -e
((status != 0))
[[ ! -s $COMPOSE_LOG ]]
[[ ! -s $AUTH_LOG ]]
[[ ! -s $ORDER_LOG ]]

: > "$COMPOSE_LOG"
: > "$AUTH_LOG"
: > "$ORDER_LOG"
set +e
printf '%s\0' "$AUTHORIZED_STDIN_RECORD" | \
  run_reader_summary_daily_runner_maintenance reader-summary-recover-missing-days \
    >/dev/null 2>&1
status=$?
set -e
((status != 0))
[[ ! -s $COMPOSE_LOG ]]
[[ ! -s $AUTH_LOG ]]
[[ ! -s $ORDER_LOG ]]

: > "$COMPOSE_LOG"
: > "$AUTH_LOG"
: > "$ORDER_LOG"
set +e
printf '%s\nunexpected\n' "$AUTHORIZED_STDIN_RECORD" | \
  run_reader_summary_daily_runner_maintenance reader-summary-recover-missing-days \
    >/dev/null 2>&1
status=$?
set -e
((status != 0))
[[ ! -s $COMPOSE_LOG ]]
[[ ! -s $AUTH_LOG ]]
[[ ! -s $ORDER_LOG ]]

: > "$COMPOSE_LOG"
printf 'old subscription session\n' > "$ROOT/runtime/subscription-runtime/sessions/session"
export AUTH_ACCOUNT_CHANGED=1
run_reader_summary_daily_runner_maintenance reader-summary-weekly-run
unset AUTH_ACCOUNT_CHANGED
restart_command="-f $FINAL_MODEL_OVERLAY restart agent-runtime"
mapfile -t auth_changed_commands < <(grep -v '^source-env=' "$COMPOSE_LOG")
[[ ${#auth_changed_commands[@]} == 3 ]]
[[ ${auth_changed_commands[0]} == "$restart_command" ]]
[[ ${auth_changed_commands[1]} == "$reconcile_command" ]]
[[ ${auth_changed_commands[2]} == "$weekly_command" ]]
[[ ! -e $AUTH_CHANGED_MARKER ]]
[[ -d $ROOT/runtime/subscription-runtime/sessions ]]
compgen -G "$ROOT/backups/subscription-runtime-sessions.*/session" >/dev/null

COMPOSE=(fake_compose -f "$REPO/compose.base.yml" -f "$FINAL_MODEL_OVERLAY" -f "$FINAL_MODEL_OVERLAY")
append_final_agent_runtime_model_overlay
[[ ${#COMPOSE[@]} == 5 ]]
[[ ${COMPOSE[1]} == -f ]]
[[ ${COMPOSE[2]} == "$REPO/compose.base.yml" ]]
[[ ${COMPOSE[-2]} == -f ]]
[[ ${COMPOSE[-1]} == "$FINAL_MODEL_OVERLAY" ]]
[[ $(printf '%s\n' "${COMPOSE[@]}" | grep -Fxc -- "$FINAL_MODEL_OVERLAY") == 1 ]]

for action in reader-summary-daily-canonical-recovery-v4 reader-summary-recover-missing-days; do
  : > "$COMPOSE_LOG"
  set +e
  run_reader_summary_daily_runner_maintenance "$action" unexpected >/dev/null 2>&1
  status=$?
  set -e
  [[ $status == 1 ]]
  [[ ! -s $COMPOSE_LOG ]]
done

: > "$COMPOSE_LOG"
set +e
run_reader_summary_daily_runner_maintenance reader-summary-daily-canonical-recovery-v4 >/dev/null 2>&1
status=$?
set -e
[[ $status == 1 ]]
[[ ! -s $COMPOSE_LOG ]]

: > "$COMPOSE_LOG"
printf '%s\n' 89abcdef0123456789abcdef0123456789abcdef > "$POSTGRES_RUNTIME_CURRENT/READY"
set +e
run_reader_summary_daily_runner_maintenance reader-summary-recover-missing-days \
  < /dev/null >/dev/null 2>&1
status=$?
set -e
[[ $status == 1 ]]
[[ ! -s $COMPOSE_LOG ]]
printf '%s\n' "$SHA" > "$POSTGRES_RUNTIME_CURRENT/READY"

: > "$COMPOSE_LOG"
printf '%s\n' 89abcdef0123456789abcdef0123456789abcdef > "$STATE/backend.sha"
set +e
run_reader_summary_daily_runner_maintenance reader-summary-recover-missing-days \
  < /dev/null >/dev/null 2>&1
status=$?
set -e
[[ $status == 1 ]]
[[ ! -s $COMPOSE_LOG ]]
printf '%s\n' "$SHA" > "$STATE/backend.sha"

: > "$COMPOSE_LOG"
exec 7>"$DAILY_SINGLETON_LOCK"
flock -n 7
set +e
run_reader_summary_daily_runner_maintenance reader-summary-weekly-run \
  >/dev/null 2>&1
status=$?
set -e
flock -u 7
exec 7>&-
[[ $status == 1 ]]
[[ ! -s $COMPOSE_LOG ]]

(
  DAILY_RUNNER_MAINTENANCE_ADMISSION_WAIT_SECONDS=7500
  LOCK_CLOCK_SECONDS=0
  LOCK_WAIT_SECONDS=()
  daily_runner_maintenance_now_seconds() {
    printf '%s\n' "$LOCK_CLOCK_SECONDS"
  }
  flock() {
    [[ $1 == '-w' ]] || return 97
    LOCK_WAIT_SECONDS+=("$2")
    if [[ ${#LOCK_WAIT_SECONDS[@]} == 1 ]]; then
      LOCK_CLOCK_SECONDS=7499
    fi
    return 0
  }
  acquire_daily_runner_maintenance_locks
  [[ ${LOCK_WAIT_SECONDS[*]} == '7500 1' ]]
)

: > "$COMPOSE_LOG"
exec 7>"$POSTGRES_ADMISSION_LOCK"
flock -n 7
set +e
run_reader_summary_daily_runner_maintenance reader-summary-weekly-run \
  >/dev/null 2>&1
status=$?
set -e
flock -u 7
exec 7>&-
[[ $status == 1 ]]
[[ ! -s $COMPOSE_LOG ]]

: > "$DOCKER_LOG"
: > "$COMPOSE_LOG"
export FAKE_COMPOSE_FAIL=1
set +e
run_reader_summary_daily_runner_maintenance reader-summary-recover-missing-days < /dev/null
status=$?
set -e
[[ $status == 44 ]]
unset FAKE_COMPOSE_FAIL
[[ ! -s $DOCKER_LOG ]]
grep -Fx 'source-env=unset' "$COMPOSE_LOG" >/dev/null
! grep -F 'READER_SUMMARY_PRODUCTION_RECOVERY_SOURCE_DATABASE_URL' \
  "$COMPOSE_LOG" >/dev/null

reset_daily_runner_maintenance_runtime_identity() {
  FAKE_GIT_HEAD=$SHA
  FAKE_GIT_ANCESTORS=("$SHA")
  FAKE_BACKEND_DIFF_STATUS=0
  FAKE_CONTROL_DIFF_STATUS=0
  printf '%s\n' "$SHA" > "$POSTGRES_RUNTIME_CURRENT/READY"
  printf '%s\n' "$SHA" > "$STATE/backend.sha"
  printf '%s\n' "$SHA" > "$STATE/control.sha"
}

assert_daily_runner_maintenance_runtime_rejected() {
  local status
  : > "$COMPOSE_LOG"
  set +e
  run_reader_summary_daily_runner_maintenance reader-summary-weekly-run \
    >/dev/null 2>&1
  status=$?
  set -e
  [[ $status == 1 ]]
  [[ ! -s $COMPOSE_LOG ]]
}

# Backend-only deploys are valid when the deployed control marker is a clean
# ancestor of the current integration commit.
reset_daily_runner_maintenance_runtime_identity
FAKE_GIT_ANCESTORS=("$SHA" "$CONTROL_ONLY_SHA")
printf '%s\n' "$CONTROL_ONLY_SHA" > "$STATE/control.sha"
: > "$COMPOSE_LOG"
run_reader_summary_daily_runner_maintenance reader-summary-weekly-run
[[ $(grep -Fc \
  'daily-runner sh -lc set -eu; npm run run:reader-summary-weekly-production -- --week-start 2026-07-27; npm run run:reader-summary-weekly-production -- --replay --week-start 2026-07-27' \
  "$COMPOSE_LOG") == 1 ]]

# Control-only deploys are valid when the deployed backend/runtime marker is a
# clean ancestor of the current integration commit.
reset_daily_runner_maintenance_runtime_identity
FAKE_GIT_HEAD=$CONTROL_ONLY_SHA
FAKE_GIT_ANCESTORS=("$SHA" "$CONTROL_ONLY_SHA")
printf '%s\n' "$CONTROL_ONLY_SHA" > "$STATE/control.sha"
verify_daily_runner_maintenance_runtime

# Frontend/docs-only commits may leave both runtime markers on valid clean
# ancestors rather than advancing either marker to integration HEAD.
reset_daily_runner_maintenance_runtime_identity
FAKE_GIT_HEAD=$FRONTEND_DOCS_ONLY_SHA
FAKE_GIT_ANCESTORS=("$SHA" "$CONTROL_ONLY_SHA" "$FRONTEND_DOCS_ONLY_SHA")
printf '%s\n' "$CONTROL_ONLY_SHA" > "$STATE/control.sha"
verify_daily_runner_maintenance_runtime

# A backend change after the deployed backend marker must reject maintenance.
reset_daily_runner_maintenance_runtime_identity
FAKE_GIT_HEAD=$FRONTEND_DOCS_ONLY_SHA
FAKE_GIT_ANCESTORS=("$SHA" "$CONTROL_ONLY_SHA" "$FRONTEND_DOCS_ONLY_SHA")
FAKE_BACKEND_DIFF_STATUS=1
printf '%s\n' "$CONTROL_ONLY_SHA" > "$STATE/control.sha"
assert_daily_runner_maintenance_runtime_rejected

# A control/deploy change after the deployed control marker must reject
# maintenance, as must a git diff error.
reset_daily_runner_maintenance_runtime_identity
FAKE_GIT_HEAD=$FRONTEND_DOCS_ONLY_SHA
FAKE_GIT_ANCESTORS=("$SHA" "$CONTROL_ONLY_SHA" "$FRONTEND_DOCS_ONLY_SHA")
FAKE_CONTROL_DIFF_STATUS=1
printf '%s\n' "$CONTROL_ONLY_SHA" > "$STATE/control.sha"
assert_daily_runner_maintenance_runtime_rejected

reset_daily_runner_maintenance_runtime_identity
FAKE_BACKEND_DIFF_STATUS=2
assert_daily_runner_maintenance_runtime_rejected

# Valid-looking but divergent markers cannot authorize maintenance.
reset_daily_runner_maintenance_runtime_identity
printf '%s\n' "$DIVERGENT_BACKEND_SHA" > "$POSTGRES_RUNTIME_CURRENT/READY"
printf '%s\n' "$DIVERGENT_BACKEND_SHA" > "$STATE/backend.sha"
assert_daily_runner_maintenance_runtime_rejected

reset_daily_runner_maintenance_runtime_identity
printf '%s\n' "$DIVERGENT_CONTROL_SHA" > "$STATE/control.sha"
assert_daily_runner_maintenance_runtime_rejected

# The runtime and backend markers must be the same deployed release.
reset_daily_runner_maintenance_runtime_identity
printf '%s\n' "$CONTROL_ONLY_SHA" > "$POSTGRES_RUNTIME_CURRENT/READY"
assert_daily_runner_maintenance_runtime_rejected

# A missing control marker fails closed.
reset_daily_runner_maintenance_runtime_identity
rm -f "$STATE/control.sha"
assert_daily_runner_maintenance_runtime_rejected

reset_daily_runner_maintenance_runtime_identity
printf '%s\n' "${SHA^^}" > "$STATE/control.sha"
assert_daily_runner_maintenance_runtime_rejected

# Every runtime identity input fails closed when malformed.
reset_daily_runner_maintenance_runtime_identity
printf '%s\n' "${SHA^^}" > "$POSTGRES_RUNTIME_CURRENT/READY"
assert_daily_runner_maintenance_runtime_rejected

reset_daily_runner_maintenance_runtime_identity
printf '%s\n' "${SHA^^}" > "$STATE/backend.sha"
assert_daily_runner_maintenance_runtime_rejected

reset_daily_runner_maintenance_runtime_identity
FAKE_GIT_HEAD=${SHA^^}
assert_daily_runner_maintenance_runtime_rejected

grep -F 'reader-summary-recover-missing-days|reader-summary-weekly-run|reader-summary-daily-canonical-recovery-v4' \
  "$SCRIPT_DIR/social-monitor-production-ssh-wrapper.sh" >/dev/null
grep -F 'reader-summary-recover-missing-days|reader-summary-weekly-run|reader-summary-daily-canonical-recovery-v4' \
  "$SCRIPT_DIR/github-production-deploy-client.sh" >/dev/null

echo 'Reader summary recovery maintenance tests passed'
