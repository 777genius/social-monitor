#!/usr/bin/env bash

# Sourced by social-monitor-production-deploy.sh after project paths, COMPOSE,
# and fail are defined. The installed V4A4 entrypoint retains its one-argument
# ABI; the SSH wrapper carries the exact retry-set authorization on stdin.

DAILY_DELIVERY_C1_DEPLOY_LOCK_WAIT_SECONDS=600

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
  local confirmation authorized_utc_date model_job_identity authority_sha256
  local recovery_action retry_set_token terminal_set_sha256 extra
  local read_status
  local -r required_confirmation=reader-summary-daily-canonical-recovery-v4
  local -r required_authorized_utc_date=2026-07-23
  local -r required_recovery_action=reader-summary-daily-canonical-recovery-v4
  local -r required_retry_set_token=invalid-product-retry-set-v1
  local -r authorization_read_timeout_seconds=1
  local legacy_record_length retry_set_record_length maximum_record_characters

  legacy_record_length=$(( ${#required_confirmation} + 1 + \
    ${#required_authorized_utc_date} + 1 + 64 + 1 + 64 ))
  retry_set_record_length=$(( ${#required_recovery_action} + 1 + \
    ${#required_retry_set_token} + 1 + 64 ))
  # NUL is the delimiter so Bash cannot silently discard it. The one-byte
  # sentinel rejects a record that is longer than the canonical line plus LF.
  maximum_record_characters=$(( legacy_record_length > retry_set_record_length
    ? legacy_record_length + 2 : retry_set_record_length + 2 ))
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
  [[ ${#authorization_record} == $(( legacy_record_length + 1 )) || \
     ${#authorization_record} == $(( retry_set_record_length + 1 )) ]] || \
    fail 'reader-summary daily bounded maintenance authorization is invalid'
  [[ $authorization_record == *$'\n' ]] || \
    fail 'reader-summary daily bounded maintenance authorization is invalid'
  authorization_record=${authorization_record%$'\n'}
  if [[ $authorization_record =~ ^reader-summary-daily-canonical-recovery-v4\ 2026-07-23\ [0-9a-f]{64}\ [0-9a-f]{64}$ ]]; then
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
    return
  fi
  if [[ $authorization_record =~ ^reader-summary-daily-canonical-recovery-v4\ invalid-product-retry-set-v1\ [0-9a-f]{64}$ ]]; then
    IFS=' ' read -r recovery_action retry_set_token terminal_set_sha256 extra <<< "$authorization_record"
    [[ $recovery_action == "$required_recovery_action" && \
       $retry_set_token == "$required_retry_set_token" && \
       $terminal_set_sha256 =~ ^[0-9a-f]{64}$ && \
       -z ${extra:-} ]] || \
      fail 'reader-summary daily bounded maintenance authorization is invalid'
    READER_SUMMARY_DAILY_MAINTENANCE_RETRY_SET_TOKEN=$retry_set_token
    READER_SUMMARY_DAILY_MAINTENANCE_TERMINAL_SET_SHA256=$terminal_set_sha256
    return
  fi
  fail 'reader-summary daily bounded maintenance authorization is invalid'
}

has_reader_summary_daily_bounded_maintenance_authorization() {
  [[ -n ${READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE:-} || \
     -n ${READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY:-} || \
     -n ${READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256:-} || \
     -n ${READER_SUMMARY_DAILY_MAINTENANCE_RETRY_SET_TOKEN:-} || \
     -n ${READER_SUMMARY_DAILY_MAINTENANCE_TERMINAL_SET_SHA256:-} ]]
}

assert_reader_summary_daily_bounded_maintenance_authorization() {
  if [[ -n ${READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE:-} || \
        -n ${READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY:-} || \
        -n ${READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256:-} ]]; then
    [[ -z ${READER_SUMMARY_DAILY_MAINTENANCE_RETRY_SET_TOKEN:-} && \
       -z ${READER_SUMMARY_DAILY_MAINTENANCE_TERMINAL_SET_SHA256:-} && \
       ${READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE:-} == 2026-07-23 && \
       ${READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY:-} =~ ^[0-9a-f]{64}$ && \
       ${READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256:-} =~ ^[0-9a-f]{64}$ ]] || \
      fail 'reader-summary daily bounded maintenance authorization must name the exact Jul23 identity'
    return
  fi
  [[ ${READER_SUMMARY_DAILY_MAINTENANCE_RETRY_SET_TOKEN:-} == invalid-product-retry-set-v1 ]] || \
    fail 'reader-summary daily bounded maintenance retry-set token is invalid'
  [[ ${READER_SUMMARY_DAILY_MAINTENANCE_TERMINAL_SET_SHA256:-} =~ ^[0-9a-f]{64}$ ]] || \
    fail 'reader-summary daily bounded maintenance terminal-set SHA-256 is invalid'
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
  local recovery_command retry_set_token='' terminal_set_sha256=''
  if (($# == 2)); then
    retry_set_token=$1
    terminal_set_sha256=$2
    [[ $retry_set_token == invalid-product-retry-set-v1 && \
       $terminal_set_sha256 =~ ^[0-9a-f]{64}$ ]] || \
      fail 'reader-summary daily canonical recovery retry-set input is invalid'
  elif (($# != 0)); then
    fail 'reader-summary daily canonical recovery accepts no input or one retry-set authorization'
  fi
  recovery_command='set -eu; npm run prepare:reader-summary-production-recovery-gap-authority; npm run run:reader-summary-daily-canonical-recovery'
  if [[ -n $retry_set_token ]]; then
    # The already-terminal six-row set needs no gap-authority preparation.
    # The V4 runner authorizes the exact digest before it opens Prisma or gRPC.
    recovery_command="set -eu; npm run run:reader-summary-daily-canonical-recovery -- $retry_set_token $terminal_set_sha256"
  fi
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
    'set -eu; node scripts/run-with-timeout.mjs --timeout-ms 19800000 --node-options --max-old-space-size=768 -- ./node_modules/.bin/ts-node -r tsconfig-paths/register scripts/run-reader-summary-daily-bounded-maintenance.ts'
}

# This entrypoint intentionally rejects arguments.
# shellcheck disable=SC2120
run_reader_summary_daily_terminal_set_receipt() {
  [[ $# == 0 ]] || fail 'reader-summary daily terminal-set receipt accepts no input'
  "${COMPOSE[@]}" --profile daily run --rm --no-deps \
    daily-runner sh -lc \
    'set -eu; node scripts/run-with-timeout.mjs --timeout-ms 60000 --node-options --max-old-space-size=768 -- ./node_modules/.bin/ts-node -r tsconfig-paths/register scripts/read-reader-summary-daily-terminal-set-receipt.ts'
}

run_reader_summary_daily_scan_terminal_preimage_c1() {
  "${COMPOSE[@]}" --profile daily run --rm --no-deps \
    daily-runner sh -lc \
    'set -eu; node scripts/run-with-timeout.mjs --timeout-ms 60000 --node-options --max-old-space-size=768 -- ./node_modules/.bin/ts-node -r tsconfig-paths/register scripts/run-reader-summary-daily-canonical-recovery.ts --scan-terminal-preimage-c1'
}

run_reader_summary_production_history() (
  local sha=${1:-} through=${2:-} yesterday
  [[ $# == 2 && $sha =~ ^[0-9a-f]{40}$ && \
     $through =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ && \
     $through > 2026-07-22 && \
     ($through < 2026-08-12 || $through == 2026-08-12) ]] || \
    fail 'historical reader-summary recovery-through date is outside the reviewed bound'
  yesterday=$(node -e 'process.stdout.write(new Date(Date.now()-86400000).toISOString().slice(0,10))')
  [[ $through < $yesterday || $through == "$yesterday" ]] || \
    fail 'historical reader-summary recovery-through date must not exceed UTC yesterday'
  exec 7>"$DEPLOY_LOCK"
  flock -w "$DAILY_DELIVERY_C1_DEPLOY_LOCK_WAIT_SECONDS" 7 || \
    fail 'timed out waiting for deployment exclusion lock'
  verify_daily_delivery_c1_release_identity "$sha"
  [[ -x $REPO/ops/deploy/run-reader-summary-production-history.sh && \
     ! -L $REPO/ops/deploy/run-reader-summary-production-history.sh ]] || \
    fail 'reviewed historical reader-summary wrapper is unavailable'
  "$REPO/ops/deploy/run-reader-summary-production-history.sh" "$through"
)

run_reader_summary_production_history_from_stdin() {
  local sha=$1 through='' extra=''
  IFS= read -r through || fail 'historical reader-summary recovery-through date is missing'
  if IFS= read -r extra || [[ -n $extra ]]; then
    fail 'historical reader-summary authorization must be exactly one line'
  fi
  run_reader_summary_production_history "$sha" "$through"
}

assert_reader_summary_daily_scan_repair_quiescence_c1() {
  local service running rabbit_id queue_rows listener_rows
  for service in api ingestion-worker event-relay; do
    running=$(docker ps --no-trunc \
      --filter "label=com.docker.compose.project=$PROJECT" \
      --filter "label=com.docker.compose.service=$service" \
      --format '{{.ID}}') || \
      fail "cannot prove $service quiescence for daily scan terminal repair"
    [[ -z $running ]] || \
      fail "$service must be fully quiescent for daily scan terminal repair"
  done
  if ! declare -F rabbitmq_quorum_health_require_steady_state >/dev/null; then
    source_deploy_library rabbitmq-quorum-health.sh 'RabbitMQ quorum health library'
  fi
  # Consumed by the dynamically sourced health library.
  # shellcheck disable=SC2034
  RABBITMQ_QUORUM_HEALTH_VHOST=/
  # Consumed by the dynamically sourced health library.
  # shellcheck disable=SC2034
  RABBITMQ_QUORUM_HEALTH_QUEUES='jobs.freshness.scan,jobs.summary.execute,jobs.reader-summary.execute,jobs.delivery.attempt.send,events.delivery.summary.ready'
  rabbitmq_quorum_health_require_steady_state || \
    fail 'RabbitMQ exact required queues are not steady-state healthy'
  rabbit_id=${RABBITMQ_QUORUM_TARGET_CONTAINER_ID:-}
  [[ $rabbit_id =~ ^[0-9a-f]{64}$ ]] || \
    fail 'RabbitMQ target identity is unavailable after health proof'
  listener_rows=$(docker exec "$rabbit_id" rabbitmq-diagnostics listeners --formatter json) || \
    fail 'RabbitMQ listener inventory is unavailable'
  printf '%s' "$listener_rows" | python3 -c '
import json, sys
rows=json.load(sys.stdin)
ports={row.get("port") for row in rows if isinstance(row,dict)}
if not {5672,15672}.issubset(ports): raise SystemExit(1)
' || fail 'RabbitMQ required AMQP/management listeners are not healthy'
  queue_rows=$(docker exec "$rabbit_id" rabbitmqctl -q list_queues \
    --vhost / name messages_ready messages_unacknowledged consumers \
    --formatter json) || fail 'RabbitMQ queue counters are unavailable'
  printf '%s' "$queue_rows" | python3 -c '
import json, sys
rows=json.load(sys.stdin)
required={"jobs.freshness.scan","jobs.summary.execute","jobs.reader-summary.execute","jobs.delivery.attempt.send","events.delivery.summary.ready"}
by_name={row.get("name"):row for row in rows if isinstance(row,dict)}
if set(by_name).intersection(required) != required: raise SystemExit(1)
scan=by_name["jobs.freshness.scan"]
if any(scan.get(key) != 0 for key in ("messages_ready","messages_unacknowledged","consumers")):
    raise SystemExit(1)
' || fail 'jobs.freshness.scan must have ready=0 unacked=0 consumers=0'
}

run_reader_summary_daily_scan_terminal_repair_c1() (
  local confirmation=${1:-} reviewed_preimage_sha256=${2:-}
  local service running restore_status
  local -a previously_running=()
  [[ $# == 2 && \
     $confirmation == reader-summary-daily-scan-terminal-repair-c1 && \
    $reviewed_preimage_sha256 =~ ^[0-9a-f]{64}$ ]] || \
    fail 'daily scan terminal repair requires exact confirmation and reviewed preimage SHA-256'
  exec 7>"$DEPLOY_LOCK"
  flock -w 3600 7 || fail 'timed out waiting for deployment exclusion lock'
  acquire_daily_runner_maintenance_locks
  verify_daily_runner_maintenance_runtime
  if ! declare -F rabbitmq_quorum_health_require_steady_state >/dev/null; then
    source_deploy_library rabbitmq-quorum-health.sh 'RabbitMQ quorum health library'
  fi
  for service in api ingestion-worker event-relay; do
    running=$(docker ps --no-trunc \
      --filter "label=com.docker.compose.project=$PROJECT" \
      --filter "label=com.docker.compose.service=$service" \
      --format '{{.ID}}') || \
      fail "cannot record $service state for daily scan terminal repair"
    [[ -z $running ]] || previously_running+=("$service")
  done
  # Invoked indirectly by the EXIT trap below.
  # shellcheck disable=SC2329
  restore_reader_summary_daily_scan_repair_services_c1() {
    restore_status=$?
    trap - EXIT
    if [[ ${#previously_running[@]} -gt 0 ]]; then
      if ! "${COMPOSE[@]}" --profile app up -d --no-deps \
        "${previously_running[@]}"; then
        echo 'daily scan terminal repair could not restore prior services' >&2
        restore_status=1
      fi
      for service in "${previously_running[@]}"; do
        running=$(docker ps --no-trunc \
          --filter "label=com.docker.compose.project=$PROJECT" \
          --filter "label=com.docker.compose.service=$service" \
          --format '{{.ID}}' 2>/dev/null || true)
        if [[ -z $running ]]; then
          echo "daily scan terminal repair did not restore $service" >&2
          restore_status=1
        fi
      done
      if ! rabbitmq_quorum_health_require_steady_state; then
        echo 'RabbitMQ is not healthy after daily scan terminal repair restore' >&2
        restore_status=1
      fi
      printf 'reader-summary-daily-scan-terminal-repair-c1 restored=%s\n' \
        "${previously_running[*]}" >&2
    fi
    exit "$restore_status"
  }
  trap restore_reader_summary_daily_scan_repair_services_c1 EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
  if [[ ${#previously_running[@]} -gt 0 ]]; then
    "${COMPOSE[@]}" stop -t 60 api ingestion-worker event-relay || \
      fail 'daily scan terminal repair could not quiesce application services'
  fi
  assert_reader_summary_daily_scan_repair_quiescence_c1
  "${COMPOSE[@]}" --profile daily run --rm --no-deps \
    -e READER_SUMMARY_DAILY_REPAIR_RECEIPT_DIRECTORY=/var/lib/social-monitor/artifacts/reader-summary-recovery-private \
    daily-runner sh -lc \
    "set -eu; node scripts/run-with-timeout.mjs --timeout-ms 19800000 --node-options --max-old-space-size=768 -- ./node_modules/.bin/ts-node -r tsconfig-paths/register scripts/run-reader-summary-daily-canonical-recovery.ts --scan-terminal-repair-c1 $confirmation $reviewed_preimage_sha256"
  assert_reader_summary_daily_scan_repair_quiescence_c1
)

run_reader_summary_daily_scan_terminal_repair_c1_from_stdin() {
  local record='' extra='' confirmation reviewed_preimage_sha256
  IFS= read -r record || \
    fail 'daily scan terminal repair authorization is missing'
  if IFS= read -r extra || [[ -n $extra ]]; then
    fail 'daily scan terminal repair authorization must be exactly one line'
  fi
  IFS=' ' read -r confirmation reviewed_preimage_sha256 extra <<< "$record"
  [[ -z ${extra:-} && \
     $record == "$confirmation $reviewed_preimage_sha256" ]] || \
    fail 'daily scan terminal repair authorization has unexpected fields'
  run_reader_summary_daily_scan_terminal_repair_c1 \
    "$confirmation" "$reviewed_preimage_sha256"
}

daily_delivery_c1_current_utc_yesterday() {
  date -u -d yesterday +%F
}

daily_delivery_c1_systemctl() {
  systemctl "$@"
}

daily_delivery_c1_sleep() {
  sleep "$1"
}

daily_delivery_c1_boot_id() {
  cat /proc/sys/kernel/random/boot_id
}

daily_delivery_c1_runtime() {
  "$CONTROL/daily-c1-runtime.sh" "$@"
}

parse_daily_delivery_c1_journal_record() {
  local sha=$1 expected_date=$2 raw=$3 normalized sentinel
  [[ $raw != *$'\n'* && $raw != *$'\r'* ]] || \
    fail 'daily C1 invocation journal inspection was not one line'
  normalized=${raw//$'\t'/|}
  IFS='|' read -r DAILY_C1_JOURNAL_STATE DAILY_C1_JOURNAL_RELEASE_SHA \
    DAILY_C1_JOURNAL_DATE DAILY_C1_JOURNAL_BOOT_ID \
    DAILY_C1_JOURNAL_INVOCATION_ID DAILY_C1_JOURNAL_BASELINE_SHA256 \
    DAILY_C1_JOURNAL_ORIGIN DAILY_C1_JOURNAL_STARTED_AT \
    DAILY_C1_JOURNAL_SERVICE_RESULT DAILY_C1_JOURNAL_EXIT_CODE \
    DAILY_C1_JOURNAL_EXIT_STATUS DAILY_C1_JOURNAL_RECEIPT_SHA256 sentinel \
    <<< "$normalized|end"
  [[ $sentinel == end && \
     $DAILY_C1_JOURNAL_STATE =~ ^(STARTED|SUCCESS|FAILED)$ && \
     $DAILY_C1_JOURNAL_RELEASE_SHA == "$sha" && \
     $DAILY_C1_JOURNAL_DATE =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ && \
     (-z $expected_date || $DAILY_C1_JOURNAL_DATE == "$expected_date") && \
     $DAILY_C1_JOURNAL_BOOT_ID =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ && \
     $DAILY_C1_JOURNAL_INVOCATION_ID =~ ^[0-9a-f]{32}$ && \
     $DAILY_C1_JOURNAL_BASELINE_SHA256 =~ ^[0-9a-f]{64}$ && \
     $DAILY_C1_JOURNAL_ORIGIN =~ ^(automatic|manual-reconcile)$ && \
     $DAILY_C1_JOURNAL_STARTED_AT =~ ^[1-9][0-9]*$ ]] || \
    fail 'daily C1 invocation journal inspection fields are invalid'
  if [[ $DAILY_C1_JOURNAL_STATE == STARTED ]]; then
    [[ -z $DAILY_C1_JOURNAL_SERVICE_RESULT && \
       -z $DAILY_C1_JOURNAL_EXIT_CODE && -z $DAILY_C1_JOURNAL_EXIT_STATUS && \
       -z $DAILY_C1_JOURNAL_RECEIPT_SHA256 ]] || \
      fail 'daily C1 STARTED journal has terminal fields'
  fi
}

inspect_daily_delivery_c1_journal() {
  local sha=$1 requested_date=$2 raw
  raw=$(daily_delivery_c1_runtime --inspect "$sha" "$requested_date") || \
    fail 'daily C1 invocation journal inspection failed'
  if [[ $raw == $'NONE\t'"$sha"$'\t'"$requested_date" ]]; then
    DAILY_C1_JOURNAL_STATE=NONE
    return
  fi
  parse_daily_delivery_c1_journal_record "$sha" "$requested_date" "$raw"
}

inspect_daily_delivery_c1_unresolved() {
  local sha=$1 raw
  raw=$(daily_delivery_c1_runtime --inspect-unresolved "$sha") || \
    fail 'daily C1 unresolved journal inspection failed'
  if [[ $raw == $'NONE\t'"$sha" ]]; then
    DAILY_C1_JOURNAL_STATE=NONE
    return
  fi
  parse_daily_delivery_c1_journal_record "$sha" '' "$raw"
  [[ $DAILY_C1_JOURNAL_STATE == STARTED || \
     $DAILY_C1_JOURNAL_STATE == FAILED ]] || \
    fail 'daily C1 unresolved journal state is invalid'
}

inspect_daily_delivery_c1_owner() {
  local raw normalized sentinel
  raw=$(daily_delivery_c1_runtime --inspect-owner) || \
    fail 'daily C1 owner inspection failed'
  [[ $raw != *$'\n'* && $raw != *$'\r'* ]] || \
    fail 'daily C1 owner inspection was not one line'
  normalized=${raw//$'\t'/|}
  IFS='|' read -r DAILY_C1_OWNER_LABEL DAILY_C1_OWNER \
    DAILY_C1_OWNER_RELEASE_SHA DAILY_C1_CURRENT_RELEASE_SHA sentinel \
    <<< "$normalized|end"
  [[ $sentinel == end && $DAILY_C1_OWNER_LABEL == OWNER && \
     $DAILY_C1_OWNER =~ ^(V6|LEGACY)$ && \
     $DAILY_C1_OWNER_RELEASE_SHA =~ ^[0-9a-f]{40}$ && \
     $DAILY_C1_CURRENT_RELEASE_SHA =~ ^[0-9a-f]{40}$ ]] || \
    fail 'daily C1 owner inspection fields are invalid'
}

consume_daily_delivery_c1_authorization() {
  local required_confirmation=$1 record='' extra='' confirmation value
  IFS= read -r record || fail 'daily delivery C1 authorization is missing'
  if IFS= read -r extra || [[ -n $extra ]]; then
    fail 'daily delivery C1 authorization must be exactly one line'
  fi
  IFS=' ' read -r confirmation value extra <<< "$record"
  [[ -z ${extra:-} && $record == "$confirmation $value" && \
     $confirmation == "$required_confirmation" ]] || \
    fail 'daily delivery C1 authorization is invalid'
  DAILY_DELIVERY_C1_AUTHORIZATION_VALUE=$value
}

verify_daily_delivery_c1_release_identity() {
  local sha=$1 integration_release runtime_source_sha
  integration_release=$(git -C "$REPO" rev-parse --verify 'HEAD^{commit}' \
    2>/dev/null || true)
  runtime_source_sha=$(cat "$POSTGRES_RUNTIME_CURRENT/SOURCE_SHA" \
    2>/dev/null || true)
  [[ $integration_release == "$sha" ]] || \
    fail 'daily delivery C1 requires exact integration HEAD activation SHA'
  [[ $runtime_source_sha == "$sha" ]] || \
    fail 'daily delivery C1 requires exact immutable runtime SOURCE_SHA'
  verify_daily_runner_maintenance_runtime
}

verify_daily_delivery_c1_activation() {
  local sha=$1
  verify_daily_delivery_c1_release_identity "$sha"
  verify_postgres_runtime_daily_c1_ready_topology "$sha"
}

verify_daily_delivery_c1_containment_activation() {
  local sha=$1
  verify_daily_delivery_c1_release_identity "$sha"
  verify_postgres_runtime_daily_c1_ready_static "$sha"
}

emit_daily_delivery_c1_run_artifact() {
  local sha=$1 eligible_through=$2 invocation_id=$3 boot_id=$4 baseline_sha=$5
  local origin=$6 started_at=$7 journal_receipt_sha=$8 owner_release_sha=$9
  local legacy_unit=${10} legacy_active=${11} legacy_next=${12}
  local v6_unit=${13} v6_active=${14} reports=$ROOT/artifacts/reports
  local receipt=$reports/reader-summary-daily-delivery-caught-up-c1-$eligible_through.json
  local pointer=$reports/reader-summary-daily-delivery-caught-up-c1-latest.json
  [[ -f $receipt && ! -L $receipt && $(stat -c '%a' "$receipt") == 444 ]] || \
    fail 'daily delivery C1 dated caught-up receipt is not immutable'
  [[ -f $pointer && ! -L $pointer && $(stat -c '%a' "$pointer") == 444 ]] || \
    fail 'daily delivery C1 latest pointer is not immutable'
  python3 - "$sha" "$eligible_through" "$receipt" "$pointer" \
    "$invocation_id" "$boot_id" "$baseline_sha" "$origin" "$started_at" \
    "$journal_receipt_sha" "$owner_release_sha" "$legacy_unit" \
    "$legacy_active" "$legacy_next" "$v6_unit" "$v6_active" <<'PY' || \
    fail 'daily delivery C1 caught-up receipt is invalid'
import datetime, hashlib, json, re, sys
sha, through, receipt_path, pointer_path, invocation_id, boot_id, baseline_sha, origin, started_at, journal_receipt_sha, owner_release_sha, legacy_unit, legacy_active, legacy_next, v6_unit, v6_active = sys.argv[1:]
def load(path):
    raw = open(path, "rb").read()
    if len(raw) > 1024 * 1024 or not raw.endswith(b"\n") or b"\n" in raw[:-1] or b"\r" in raw:
        raise SystemExit(1)
    value = json.loads(raw[:-1])
    if (json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode() + b"\n") != raw:
        raise SystemExit(1)
    return value, raw
receipt, receipt_bytes = load(receipt_path)
pointer, _ = load(pointer_path)
receipt_keys = ["schemaVersion", "firstRequiredUtcDate", "eligibleThrough", "publishedDates", "publications", "publicationSetSha256"]
pointer_keys = ["schemaVersion", "eligibleThrough", "receiptSha256"]
publication_keys = ["requestedUtcDate", "readerSummaryJobId", "readerSummaryArtifactId", "publicationId", "reportSha256", "proofSha256", "weeklyEvidenceSha256", "publicEvidenceSha256", "publicFrontendSha256"]
first = datetime.date(2026, 7, 23)
last = datetime.date.fromisoformat(through)
dates = [(first + datetime.timedelta(days=i)).isoformat() for i in range((last-first).days+1)]
hex64 = re.compile(r"[0-9a-f]{64}\Z")
uuid = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z")
publications = receipt.get("publications")
valid_publications = isinstance(publications, list) and len(publications) == len(dates)
if valid_publications:
    for index, publication in enumerate(publications):
        if (not isinstance(publication, dict) or list(publication) != publication_keys or
            publication["requestedUtcDate"] != dates[index] or
            not all(uuid.fullmatch(publication[key]) for key in ("readerSummaryJobId", "readerSummaryArtifactId", "publicationId")) or
            not all(hex64.fullmatch(publication[key]) for key in publication_keys[4:])):
            valid_publications = False
            break
publication_bytes = json.dumps(publications, separators=(",", ":")).encode()
receipt_sha = hashlib.sha256(receipt_bytes).hexdigest()
if (list(receipt) != receipt_keys or receipt.get("schemaVersion") != "reader_summary.daily_delivery_caught_up.c1" or
    receipt.get("firstRequiredUtcDate") != dates[0] or receipt.get("eligibleThrough") != through or
    receipt.get("publishedDates") != dates or not valid_publications or
    receipt.get("publicationSetSha256") != hashlib.sha256(publication_bytes).hexdigest() or
    list(pointer) != pointer_keys or pointer.get("schemaVersion") != "reader_summary.daily_delivery_caught_up_pointer.c1" or
    pointer.get("eligibleThrough") != through or pointer.get("receiptSha256") != receipt_sha or
    journal_receipt_sha != receipt_sha):
    raise SystemExit(1)
next_date = (last + datetime.timedelta(days=1)).isoformat()
result = {"schemaVersion":"reader_summary.daily_delivery_c1_run.v2","confirmation":"reader-summary-daily-delivery-c1-run","releaseSha":sha,"requestedUtcDate":through,"eligibleThrough":through,"nextUnresolvedUtcDate":next_date,"publicationCount":len(publications),"publicationSetSha256":receipt["publicationSetSha256"],"receiptSha256":receipt_sha,"journalState":"SUCCESS","serviceInvocationId":invocation_id,"serviceBootId":boot_id,"baselineSha256":baseline_sha,"invocationOrigin":origin,"startedAtRealtimeUsec":started_at,"serviceResult":"success","exitCode":"exited","exitStatus":"0","owner":"LEGACY","ownerReleaseSha":owner_release_sha,"legacyTimerUnitFileState":legacy_unit,"legacyTimerActiveState":legacy_active,"legacyTimerNextElapseUSecRealtime":legacy_next,"v6TimerUnitFileState":v6_unit,"v6TimerActiveState":v6_active}
print(json.dumps(result, separators=(",", ":")))
PY
}

fail_daily_delivery_c1_with_containment() {
  local sha=$1 message=$2
  printf '%s %s\n' reader-summary-daily-delivery-c1-contain "$sha" | \
    run_reader_summary_daily_delivery_c1_containment "$sha" >&2 || \
    fail 'daily C1 failed invocation containment could not be completed'
  fail "$message"
}

run_reader_summary_daily_delivery_c1() (
  local sha=$1 confirmation=reader-summary-daily-delivery-c1-run requested_date
  local attempt active_state live_invocation request_result
  local legacy_unit legacy_active legacy_next
  local v6_unit v6_active
  consume_daily_delivery_c1_authorization "$confirmation"
  requested_date=$DAILY_DELIVERY_C1_AUTHORIZATION_VALUE
  [[ $requested_date =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || \
    fail 'daily delivery C1 requested UTC date is invalid'
  exec 7>"$DEPLOY_LOCK"
  flock -w "$DAILY_DELIVERY_C1_DEPLOY_LOCK_WAIT_SECONDS" 7 || \
    fail 'timed out waiting for deployment exclusion lock'
  verify_daily_delivery_c1_activation "$sha" >/dev/null
  flock -u 7 || fail 'daily C1 deployment lock could not be released for invocation reconciliation'
  for ((attempt=0; attempt<660; attempt++)); do
    inspect_daily_delivery_c1_unresolved "$sha"
    if [[ $DAILY_C1_JOURNAL_STATE == NONE ]]; then
      inspect_daily_delivery_c1_journal "$sha" "$requested_date"
    fi
    case $DAILY_C1_JOURNAL_STATE in
      SUCCESS) break ;;
      FAILED)
        fail_daily_delivery_c1_with_containment "$sha" \
          'daily C1 first matching invocation failed'
        ;;
      STARTED)
        active_state=$(daily_delivery_c1_systemctl show --property=ActiveState \
          --value social-monitor-daily.service)
        live_invocation=$(daily_delivery_c1_systemctl show --property=InvocationID \
          --value social-monitor-daily.service)
        if [[ ($active_state == activating || $active_state == active) && \
              $live_invocation == "$DAILY_C1_JOURNAL_INVOCATION_ID" ]]; then
          daily_delivery_c1_sleep 30
          continue
        fi
        fail_daily_delivery_c1_with_containment "$sha" \
          'daily C1 invocation journal is orphaned'
        ;;
      NONE)
        active_state=$(daily_delivery_c1_systemctl show --property=ActiveState \
          --value social-monitor-daily.service)
        if [[ $active_state == activating || $active_state == active ]]; then
          daily_delivery_c1_sleep 1
          continue
        fi
        [[ $active_state == inactive ]] || \
          fail_daily_delivery_c1_with_containment "$sha" \
            'daily C1 service failed before its invocation journal'
        [[ $requested_date == "$(daily_delivery_c1_current_utc_yesterday)" ]] || \
          fail 'daily C1 historical date has no matching invocation journal'
        request_result=$(daily_delivery_c1_runtime \
          --request-manual-start "$sha" "$requested_date") || \
          fail 'daily C1 manual start decision failed'
        case $request_result in
          CREATED|RESUBMITTED|COALESCED|EXISTING_JOURNAL) ;;
          *) fail 'daily C1 manual start decision output is invalid' ;;
        esac
        daily_delivery_c1_sleep 1
        ;;
    esac
  done
  inspect_daily_delivery_c1_unresolved "$sha"
  if [[ $DAILY_C1_JOURNAL_STATE == NONE ]]; then
    inspect_daily_delivery_c1_journal "$sha" "$requested_date"
  fi
  [[ ${DAILY_C1_JOURNAL_STATE:-} == SUCCESS && \
     $DAILY_C1_JOURNAL_DATE == "$requested_date" ]] || \
    fail_daily_delivery_c1_with_containment "$sha" \
      'daily C1 invocation reconciliation timed out'
  flock -w "$DAILY_DELIVERY_C1_DEPLOY_LOCK_WAIT_SECONDS" 7 || \
    fail 'timed out waiting for final daily C1 deployment exclusion proof'
  verify_daily_delivery_c1_activation "$sha" >/dev/null
  inspect_daily_delivery_c1_unresolved "$sha"
  [[ $DAILY_C1_JOURNAL_STATE == NONE ]] || \
    fail 'daily C1 unresolved journal appeared before final exclusion proof'
  inspect_daily_delivery_c1_journal "$sha" "$requested_date"
  [[ $DAILY_C1_JOURNAL_STATE == SUCCESS ]] || \
    fail 'daily C1 terminal journal changed before final exclusion proof'
  [[ $DAILY_C1_JOURNAL_SERVICE_RESULT == success && \
     $DAILY_C1_JOURNAL_EXIT_CODE == exited && \
     $DAILY_C1_JOURNAL_EXIT_STATUS == 0 && \
     $DAILY_C1_JOURNAL_RECEIPT_SHA256 =~ ^[0-9a-f]{64}$ ]] || \
    fail 'daily C1 SUCCESS journal terminal proof is invalid'
  active_state=$(daily_delivery_c1_systemctl show --property=ActiveState --value \
    social-monitor-daily.service)
  [[ $active_state == inactive ]] || \
    fail 'daily C1 service is not inactive for final SUCCESS proof'
  inspect_daily_delivery_c1_owner
  [[ $DAILY_C1_OWNER == LEGACY && $DAILY_C1_CURRENT_RELEASE_SHA == "$sha" ]] || \
    fail 'daily C1 final live owner proof is invalid'
  legacy_unit=$(daily_delivery_c1_systemctl show --property=UnitFileState \
    --value social-monitor-daily.timer)
  legacy_active=$(daily_delivery_c1_systemctl show --property=ActiveState \
    --value social-monitor-daily.timer)
  legacy_next=$(daily_delivery_c1_systemctl show \
    --property=NextElapseUSecRealtime --value social-monitor-daily.timer)
  v6_unit=$(daily_delivery_c1_systemctl show --property=UnitFileState --value \
    social-monitor-reader-summary-production-day.timer)
  v6_active=$(daily_delivery_c1_systemctl show --property=ActiveState --value \
    social-monitor-reader-summary-production-day.timer)
  [[ $legacy_unit == enabled && $legacy_active == active && \
     -n $legacy_next && $legacy_next != n/a && $v6_unit == disabled && \
     $v6_active == inactive ]] || fail 'daily C1 final live timer proof is invalid'
  inspect_daily_delivery_c1_journal "$sha" "$requested_date"
  [[ $DAILY_C1_JOURNAL_STATE == SUCCESS ]] || \
    fail 'daily C1 terminal journal changed before artifact emission'
  emit_daily_delivery_c1_run_artifact "$sha" "$requested_date" \
    "$DAILY_C1_JOURNAL_INVOCATION_ID" "$DAILY_C1_JOURNAL_BOOT_ID" \
    "$DAILY_C1_JOURNAL_BASELINE_SHA256" "$DAILY_C1_JOURNAL_ORIGIN" \
    "$DAILY_C1_JOURNAL_STARTED_AT" "$DAILY_C1_JOURNAL_RECEIPT_SHA256" \
    "$DAILY_C1_OWNER_RELEASE_SHA" "$legacy_unit" "$legacy_active" \
    "$legacy_next" "$v6_unit" "$v6_active"
)

run_reader_summary_daily_delivery_c1_containment() (
  local sha=$1 confirmation=reader-summary-daily-delivery-c1-contain ready_sha
  local legacy_unit legacy_active v6_unit v6_active legacy_service v6_service
  local containment_state timer
  consume_daily_delivery_c1_authorization "$confirmation"
  ready_sha=$DAILY_DELIVERY_C1_AUTHORIZATION_VALUE
  [[ $ready_sha == "$sha" ]] || fail 'daily C1 containment READY SHA is invalid'
  exec 7>"$DEPLOY_LOCK"
  flock -w 3600 7 || fail 'timed out waiting for deployment exclusion lock'
  verify_daily_delivery_c1_containment_activation "$sha" >/dev/null
  persist_postgres_runtime_daily_c1_containment_requested "$sha" >/dev/null
  containment_state=$(postgres_runtime_daily_c1_containment_state)
  if [[ $containment_state == requested ]]; then
    verify_postgres_runtime_daily_c1_containment "$sha" REQUESTED >/dev/null
    for timer in social-monitor-daily.timer \
      social-monitor-reader-summary-production-day.timer; do
      daily_delivery_c1_systemctl stop "$timer" >&2 || \
        fail "daily C1 containment could not stop timer: $timer"
      daily_delivery_c1_systemctl disable "$timer" >&2 || \
        fail "daily C1 containment could not disable timer: $timer"
    done
    # No service is killed; after maintenance admission both must be idle.
    acquire_daily_runner_maintenance_locks >/dev/null
    enforce_postgres_runtime_daily_c1_containment \
      "$POSTGRES_RUNTIME_RELEASES/$sha" "$SYSTEMD_UNIT_DIR" >&2
  else
    [[ $containment_state == contained ]] || \
      fail 'daily C1 containment marker state is invalid'
    verify_postgres_runtime_daily_c1_containment "$sha" CONTAINED >/dev/null
    verify_postgres_runtime_daily_c1_contained_topology \
      "$POSTGRES_RUNTIME_RELEASES/$sha" "$SYSTEMD_UNIT_DIR" >/dev/null
  fi
  legacy_unit=$(daily_delivery_c1_systemctl show --property=UnitFileState --value social-monitor-daily.timer)
  legacy_active=$(daily_delivery_c1_systemctl show --property=ActiveState --value social-monitor-daily.timer)
  v6_unit=$(daily_delivery_c1_systemctl show --property=UnitFileState --value social-monitor-reader-summary-production-day.timer)
  v6_active=$(daily_delivery_c1_systemctl show --property=ActiveState --value social-monitor-reader-summary-production-day.timer)
  legacy_service=$(daily_delivery_c1_systemctl show --property=ActiveState --value social-monitor-daily.service)
  v6_service=$(daily_delivery_c1_systemctl show --property=ActiveState --value social-monitor-reader-summary-production-day.service)
  [[ $legacy_unit == disabled && $legacy_active == inactive && \
     $v6_unit == disabled && $v6_active == inactive && \
     $legacy_service == inactive && $v6_service == inactive ]] || \
    fail 'daily C1 containment did not reach the exact disabled inactive topology'
  promote_postgres_runtime_daily_c1_containment_contained "$sha" >/dev/null
  verify_postgres_runtime_daily_c1_containment "$sha" CONTAINED >/dev/null
  printf '{"schemaVersion":"reader_summary.daily_delivery_c1_containment.v1","confirmation":"%s","releaseSha":"%s","state":"CONTAINED","scheduleResumePolicy":"separate-reviewed-clearance-required","legacyTimerUnitFileState":"%s","legacyTimerActiveState":"%s","v6TimerUnitFileState":"%s","v6TimerActiveState":"%s","legacyServiceActiveState":"%s","v6ServiceActiveState":"%s"}\n' \
    "$confirmation" "$sha" "$legacy_unit" "$legacy_active" "$v6_unit" \
    "$v6_active" "$legacy_service" "$v6_service"
)

run_reader_summary_daily_runner_maintenance() (
  local maintenance_action=$1
  local run_bounded_maintenance=false
  local run_invalid_product_retry_set=false
  [[ $# == 1 ]] || fail 'reader-summary daily-runner maintenance accepts exactly one action'
  case $maintenance_action in
    reader-summary-recover-missing-days|reader-summary-weekly-run|reader-summary-daily-terminal-set-receipt-v1|reader-summary-daily-scan-terminal-preimage-c1|reader-summary-daily-scan-terminal-repair-c1) ;;
    *) fail 'unknown reader-summary daily-runner maintenance action' ;;
  esac
  unset READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256 READER_SUMMARY_DAILY_MAINTENANCE_RETRY_SET_TOKEN READER_SUMMARY_DAILY_MAINTENANCE_TERMINAL_SET_SHA256
  if [[ $maintenance_action == reader-summary-recover-missing-days ]]; then
    consume_reader_summary_daily_bounded_maintenance_authorization_from_stdin
    if has_reader_summary_daily_bounded_maintenance_authorization; then
      assert_reader_summary_daily_bounded_maintenance_authorization
      if [[ -n ${READER_SUMMARY_DAILY_MAINTENANCE_RETRY_SET_TOKEN:-} ]]; then
        run_invalid_product_retry_set=true
      else
        run_bounded_maintenance=true
      fi
    fi
  fi
  acquire_daily_runner_maintenance_locks
  verify_daily_runner_maintenance_runtime
  if [[ $maintenance_action == reader-summary-daily-terminal-set-receipt-v1 ]]; then
    # The no-argument contract is deliberate.
    # shellcheck disable=SC2119
    run_reader_summary_daily_terminal_set_receipt
    return
  fi
  if [[ $maintenance_action == reader-summary-daily-scan-terminal-preimage-c1 ]]; then
    run_reader_summary_daily_scan_terminal_preimage_c1
    return
  fi
  if [[ $maintenance_action == reader-summary-daily-scan-terminal-repair-c1 ]]; then
    fail 'daily scan terminal repair authorization must use its dedicated entrypoint'
  fi
  append_final_agent_runtime_model_overlay
  refresh_daily_runner_maintenance_auth || return
  "${COMPOSE[@]}" --profile app up -d --no-deps agent-runtime || return
  case $maintenance_action in
    reader-summary-recover-missing-days)
      if [[ $run_invalid_product_retry_set == true ]]; then
        run_reader_summary_daily_canonical_recovery \
          "$READER_SUMMARY_DAILY_MAINTENANCE_RETRY_SET_TOKEN" \
          "$READER_SUMMARY_DAILY_MAINTENANCE_TERMINAL_SET_SHA256" || return
      elif [[ $run_bounded_maintenance == true ]]; then
        run_reader_summary_daily_canonical_recovery || return
        local bounded_run
        for bounded_run in 1 2 3 4; do
          : "$bounded_run"
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
