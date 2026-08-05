#!/usr/bin/env bash

# Sourced by social-monitor-production-deploy.sh after project paths, COMPOSE,
# and fail are defined. The installed V4A4 entrypoint invokes this function
# with its original one-argument ABI; the SSH wrapper maps the confirmed V4
# request onto the existing bounded recovery intent.

verify_daily_runner_maintenance_runtime() {
  local runtime_release backend_release control_release integration_release
  runtime_release=$(cat "$POSTGRES_RUNTIME_CURRENT/READY" 2>/dev/null || true)
  backend_release=$(cat "$STATE/backend.sha" 2>/dev/null || true)
  control_release=$(cat "$STATE/control.sha" 2>/dev/null || true)
  integration_release=$(git -C "$REPO" rev-parse --verify 'HEAD^{commit}' 2>/dev/null || true)
  if [[ ! $runtime_release =~ ^[0-9a-f]{40}$ || \
        ! $backend_release =~ ^[0-9a-f]{40}$ || \
        ! $control_release =~ ^[0-9a-f]{40}$ || \
        ! $integration_release =~ ^[0-9a-f]{40}$ || \
        $runtime_release != "$backend_release" ]]; then
    fail 'daily-runner runtime is not committed by the current backend integration release'
  fi
  git -C "$REPO" merge-base --is-ancestor \
    "$backend_release" "$integration_release" || \
    fail 'daily-runner runtime is not committed by the current backend integration release'
  git -C "$REPO" merge-base --is-ancestor \
    "$control_release" "$integration_release" || \
    fail 'daily-runner runtime is not committed by the current backend integration release'
  declare -p BACKEND_PATHS CONTROL_PATHS >/dev/null 2>&1 || \
    fail 'daily-runner runtime is not committed by the current backend integration release'
  ((${#BACKEND_PATHS[@]} > 0 && ${#CONTROL_PATHS[@]} > 0)) || \
    fail 'daily-runner runtime is not committed by the current backend integration release'
  git -C "$REPO" diff --quiet \
    "$backend_release" "$integration_release" -- "${BACKEND_PATHS[@]}" || \
    fail 'daily-runner runtime is not committed by the current backend integration release'
  git -C "$REPO" diff --quiet \
    "$control_release" "$integration_release" -- "${CONTROL_PATHS[@]}" || \
    fail 'daily-runner runtime is not committed by the current backend integration release'
}

daily_runner_maintenance_now_seconds() {
  printf '%s\n' "$SECONDS"
}

daily_runner_maintenance_sleep() {
  sleep "$1"
}

acquire_daily_runner_maintenance_locks() {
  local deadline_seconds=7500
  local started_at elapsed_seconds remaining_seconds
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 && \
        ${DAILY_RUNNER_MAINTENANCE_ADMISSION_WAIT_SECONDS:-} =~ ^[1-9][0-9]*$ ]]; then
    deadline_seconds=$DAILY_RUNNER_MAINTENANCE_ADMISSION_WAIT_SECONDS
  fi
  started_at=$(daily_runner_maintenance_now_seconds)
  exec 9>"$DAILY_SINGLETON_LOCK"
  flock -w "$deadline_seconds" 9 || \
    fail 'timed out waiting for reader-summary daily-runner singleton lock'
  elapsed_seconds=$(( $(daily_runner_maintenance_now_seconds) - started_at ))
  remaining_seconds=$(( deadline_seconds - elapsed_seconds ))
  (( remaining_seconds > 0 )) || \
    fail 'timed out waiting for PostgreSQL admission lock'
  exec 8>"$POSTGRES_ADMISSION_LOCK"
  flock -w "$remaining_seconds" 8 || \
    fail 'timed out waiting for PostgreSQL admission lock'
}

append_final_agent_runtime_model_overlay() {
  local final_model_overlay="$REPO/ops/deploy/production-runtime/compose.agent-runtime-model.yml"
  local -a reconciled_compose=()
  local index=0
  while (( index < ${#COMPOSE[@]} )); do
    if [[ ${COMPOSE[index]} == -f ]] &&
       (( index + 1 < ${#COMPOSE[@]} )) &&
       [[ ${COMPOSE[index + 1]} == "$final_model_overlay" ]]; then
      ((index += 2))
      continue
    fi
    reconciled_compose+=("${COMPOSE[index]}")
    ((index += 1))
  done
  COMPOSE=("${reconciled_compose[@]}" -f "$final_model_overlay")
}

consume_reader_summary_daily_bounded_maintenance_authorization_from_stdin() {
  local authorization_record=''
  local confirmation authorized_utc_date model_job_identity authority_sha256 extra
  local read_status
  local -r required_confirmation=reader-summary-daily-canonical-recovery-v4
  local -r required_authorized_utc_date=2026-07-23
  local -r authorization_read_timeout_seconds=1
  local expected_record_length maximum_record_characters

  expected_record_length=$(( ${#required_confirmation} + 1 + \
    ${#required_authorized_utc_date} + 1 + 64 + 1 + 64 ))
  # NUL is the delimiter so Bash cannot silently discard it. The one-byte
  # sentinel rejects a record that is longer than the canonical line plus LF.
  maximum_record_characters=$(( expected_record_length + 2 ))
  if IFS= read -r -t "$authorization_read_timeout_seconds" -d '' \
      -n "$maximum_record_characters" authorization_record; then
    read_status=0
  else
    read_status=$?
  fi

  # Ordinary ambiguity probes have an empty or EOF stdin. The finite read
  # keeps an open SSH channel from delaying that pre-existing path forever.
  if [[ -z $authorization_record ]] && \
     (( read_status == 1 || read_status > 128 )); then
    return 0
  fi

  [[ $read_status == 1 ]] || \
    fail 'reader-summary daily bounded maintenance authorization is invalid'
  [[ ${#authorization_record} == $(( expected_record_length + 1 )) ]] || \
    fail 'reader-summary daily bounded maintenance authorization is invalid'
  [[ $authorization_record == *$'\n' ]] || \
    fail 'reader-summary daily bounded maintenance authorization is invalid'
  authorization_record=${authorization_record%$'\n'}
  [[ $authorization_record =~ ^reader-summary-daily-canonical-recovery-v4\ 2026-07-23\ [0-9a-f]{64}\ [0-9a-f]{64}$ ]] || \
    fail 'reader-summary daily bounded maintenance authorization is invalid'
  IFS=' ' read -r confirmation authorized_utc_date model_job_identity \
    authority_sha256 extra <<< "$authorization_record"
  [[ $confirmation == "$required_confirmation" && \
     $authorized_utc_date == "$required_authorized_utc_date" && \
     $model_job_identity =~ ^[0-9a-f]{64}$ && \
     $authority_sha256 =~ ^[0-9a-f]{64}$ && \
     -z ${extra:-} ]] || \
    fail 'reader-summary daily bounded maintenance authorization is invalid'

  READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE=$authorized_utc_date
  READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY=$model_job_identity
  READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256=$authority_sha256
}

has_reader_summary_daily_bounded_maintenance_authorization() {
  [[ -n ${READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE:-} || \
     -n ${READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY:-} || \
     -n ${READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256:-} ]]
}

assert_reader_summary_daily_bounded_maintenance_authorization() {
  [[ ${READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE:-} == 2026-07-23 ]] || \
    fail 'reader-summary daily bounded maintenance authorization must name 2026-07-23'
  [[ ${READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY:-} =~ ^[0-9a-f]{64}$ ]] || \
    fail 'reader-summary daily bounded maintenance model job identity is invalid'
  [[ ${READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256:-} =~ ^[0-9a-f]{64}$ ]] || \
    fail 'reader-summary daily bounded maintenance authority SHA-256 is invalid'
}

refresh_daily_runner_maintenance_auth() {
  "$CONTROL/refresh-codex-auth.sh" \
    --broker-pool-job-id social-monitor-production-account-pool-terra-v25-20260804 || return
  if [[ -f $ROOT/runtime/auth-account-changed ]]; then
    local stamp
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    if [[ -d $ROOT/runtime/subscription-runtime/sessions ]]; then
      mv "$ROOT/runtime/subscription-runtime/sessions" \
        "$ROOT/backups/subscription-runtime-sessions.$stamp"
    fi
    install -d -m 0700 -o 1000 -g 1000 \
      "$ROOT/runtime/subscription-runtime/sessions"
    "${COMPOSE[@]}" restart agent-runtime || return
    rm -f "$ROOT/runtime/auth-account-changed"
    daily_runner_maintenance_sleep 3
  fi
}

run_reader_summary_daily_canonical_recovery() {
  local recovery_command
  [[ $# == 0 ]] || fail 'reader-summary daily canonical recovery accepts no authorization input'
  recovery_command='set -eu; npm run prepare:reader-summary-production-recovery-gap-authority; npm run run:reader-summary-daily-canonical-recovery'
  "${COMPOSE[@]}" --profile daily run --rm --no-deps \
    -e READER_SUMMARY_DAILY_TENANT_ID=00000000-0000-7000-8000-000000000901 \
    -e READER_SUMMARY_DAILY_WORKSPACE_ID=00000000-0000-7000-8000-000000000902 \
    -e READER_SUMMARY_DAILY_FIRST_UNRESOLVED_UTC_DATE=2026-07-23 \
    -e READER_SUMMARY_DAILY_PUBLIC_DIRECTORY=/var/lib/social-monitor/artifacts/reports \
    daily-runner sh -lc "$recovery_command"
}

run_reader_summary_daily_bounded_maintenance() {
  local model_job_identity=$1 authority_sha256=$2
  "${COMPOSE[@]}" --profile daily run --rm --no-deps \
    -e READER_SUMMARY_DAILY_TENANT_ID=00000000-0000-7000-8000-000000000901 \
    -e READER_SUMMARY_DAILY_WORKSPACE_ID=00000000-0000-7000-8000-000000000902 \
    -e READER_SUMMARY_DAILY_FIRST_UNRESOLVED_UTC_DATE=2026-07-31 \
    -e READER_SUMMARY_DAILY_PUBLIC_DIRECTORY=/var/lib/social-monitor/artifacts/reports \
    -e READER_SUMMARY_DAILY_COLLECTION_ARTIFACT_DIRECTORY=/var/lib/social-monitor/artifacts/reader-summary-daily-collection \
    -e READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE=2026-07-23 \
    -e "READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY=$model_job_identity" \
    -e "READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256=$authority_sha256" \
    daily-runner sh -lc \
    'set -eu; node scripts/run-with-timeout.mjs --timeout-ms 19800000 --node-options --max-old-space-size=768 -- ts-node -r tsconfig-paths/register scripts/run-reader-summary-daily-bounded-maintenance.ts'
}

run_reader_summary_daily_runner_maintenance() (
  local maintenance_action=$1
  local run_bounded_maintenance=false
  [[ $# == 1 ]] || fail 'reader-summary daily-runner maintenance accepts exactly one action'
  case $maintenance_action in
    reader-summary-recover-missing-days|reader-summary-weekly-run) ;;
    *) fail 'unknown reader-summary daily-runner maintenance action' ;;
  esac
  unset READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256
  if [[ $maintenance_action == reader-summary-recover-missing-days ]]; then
    consume_reader_summary_daily_bounded_maintenance_authorization_from_stdin
    if has_reader_summary_daily_bounded_maintenance_authorization; then
      assert_reader_summary_daily_bounded_maintenance_authorization
      run_bounded_maintenance=true
    fi
  fi
  acquire_daily_runner_maintenance_locks
  verify_daily_runner_maintenance_runtime
  append_final_agent_runtime_model_overlay
  refresh_daily_runner_maintenance_auth || return
  "${COMPOSE[@]}" --profile app up -d --no-deps agent-runtime || return
  case $maintenance_action in
    reader-summary-recover-missing-days)
      if [[ $run_bounded_maintenance == true ]]; then
        run_reader_summary_daily_canonical_recovery || return
        local bounded_run
        for bounded_run in 1 2 3 4; do
          run_reader_summary_daily_bounded_maintenance \
            "$READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY" \
            "$READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256" || return
        done
      else
        run_reader_summary_daily_canonical_recovery || return
      fi
      ;;
    reader-summary-weekly-run)
      "${COMPOSE[@]}" --profile daily run --rm --no-deps \
        -e READER_SUMMARY_WEEKLY_PRODUCTION_TENANT_ID=00000000-0000-7000-8000-000000000901 \
        -e READER_SUMMARY_WEEKLY_PRODUCTION_WORKSPACE_ID=00000000-0000-7000-8000-000000000902 \
        -e READER_SUMMARY_WEEKLY_PRODUCTION_FIRST_WEEK_START=2026-07-27 \
        -e READER_SUMMARY_WEEKLY_PRODUCTION_CATCH_UP_LIMIT=1 \
        -e "READER_SUMMARY_WEEKLY_PRODUCTION_ARTIFACT_DIR=$READER_SUMMARY_WEEKLY_PRODUCTION_ARTIFACT_DIR" \
        daily-runner sh -lc \
        'set -eu; npm run run:reader-summary-weekly-production -- --week-start 2026-07-27; npm run run:reader-summary-weekly-production -- --replay --week-start 2026-07-27' || return
      ;;
    *) fail 'unknown reader-summary daily-runner maintenance action' ;;
  esac
)
