#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
unset BACKEND_HEALTH_STARTUP_GRACE_SECONDS
unset OTEL_COLLECTOR_HEALTH_STARTUP_GRACE_SECONDS
unset BACKEND_HEALTH_RETRY_SLEEP_SECONDS
# shellcheck source=ops/deploy/backend-runtime-health-lib.sh
source "$SCRIPT_DIR/backend-runtime-health-lib.sh"

fail() {
  echo "$1" >&2
  exit 1
}

FIXTURE=$(mktemp -d /tmp/social-monitor-health.XXXXXX)
trap 'rm -rf "$FIXTURE"' EXIT
READY_CALLS_FILE=$FIXTURE/ready-calls
SLEEP_LOG=$FIXTURE/sleeps.log

COMPOSE=(fake_compose)
METRICS_STATE=succeeded
READY_FAILURES=0
READY_FAILURE_MODE=curl
DOCKER_STATUS=running
DOCKER_OOM=false

reset_runtime() {
  printf '0\n' > "$READY_CALLS_FILE"
  : > "$SLEEP_LOG"
  METRICS_STATE=succeeded
  READY_FAILURES=0
  READY_FAILURE_MODE=curl
  DOCKER_STATUS=running
  DOCKER_OOM=false
}

ready_calls() {
  tr -d '\n' < "$READY_CALLS_FILE"
}

sleep() {
  printf '%s\n' "$1" >> "$SLEEP_LOG"
}

curl() {
  local argument url calls output_file='' write_out='' fail_on_http=false
  local body='' http_status=200
  while (($# > 0)); do
    argument=$1
    case $argument in
      -f|-fsS)
        fail_on_http=true
        ;;
      -o)
        output_file=$2
        shift
        ;;
      -w)
        write_out=$2
        shift
        ;;
      --max-time)
        shift
        ;;
      http://127.0.0.1:13000/healthz|http://127.0.0.1:13000/ready)
        url=$argument
        ;;
    esac
    shift
  done
  case ${url:-} in
    http://127.0.0.1:13000/healthz)
      [[ -n $output_file ]] && : > "$output_file"
      [[ $write_out == '%{http_code}' ]] && printf '%s' "$http_status"
      return 0
      ;;
    http://127.0.0.1:13000/ready)
      calls=$(($(ready_calls) + 1))
      printf '%s\n' "$calls" > "$READY_CALLS_FILE"
      if ((calls <= READY_FAILURES)); then
        if [[ $READY_FAILURE_MODE == invalid-json ]]; then
          body=$'{not-json\n'
          if [[ -n $output_file ]]; then
            printf '%s' "$body" > "$output_file"
          else
            printf '%s' "$body"
          fi
          [[ $write_out == '%{http_code}' ]] && printf '%s' "$http_status"
          return 0
        fi
        http_status=503
        body='fixture readiness failure'
        if [[ -n $output_file ]]; then
          printf '%s\n' "$body" > "$output_file"
        else
          printf '%s\n' "$body"
        fi
        [[ $write_out == '%{http_code}' ]] && printf '%s' "$http_status"
        if [[ $fail_on_http == true ]]; then
          printf 'curl: fixture readiness failure\n' >&2
          return 22
        fi
        return 0
      fi
      body=$(printf '{"runtime":{"metrics":{"exportState":"%s","lastExportAt":%s}}}\n' \
        "$METRICS_STATE" \
        "$([[ $METRICS_STATE == succeeded ]] && \
          printf '"2026-07-26T12:00:00.000Z"' || printf null)")
      if [[ -n $output_file ]]; then
        printf '%s' "$body" > "$output_file"
      else
        printf '%s' "$body"
      fi
      [[ $write_out == '%{http_code}' ]] && printf '%s' "$http_status"
      return 0
      ;;
  esac
  return 90
}

fake_compose() {
  case $* in
    '--profile app ps -q api') printf 'api-container\n' ;;
    '--profile app ps -q otel-collector') printf 'collector-container\n' ;;
    *) return 90 ;;
  esac
}

docker() {
  [[ $1 == inspect && ($2 == api-container || $2 == collector-container) ]] || \
    return 91
  case $4 in
    '{{.State.Status}}') printf '%s\n' "$DOCKER_STATUS" ;;
    '{{.State.OOMKilled}}') printf '%s\n' "$DOCKER_OOM" ;;
    '{{.State.ExitCode}}') printf '137\n' ;;
    '{{.State.Error}}') printf 'fixture-state-error\n' ;;
    *) return 92 ;;
  esac
}

((BACKEND_HEALTH_STARTUP_GRACE_SECONDS >= 180))
((BACKEND_HEALTH_STARTUP_GRACE_SECONDS <= 300))
[[ $OTEL_COLLECTOR_HEALTH_STARTUP_GRACE_SECONDS == 600 ]]
((OTEL_COLLECTOR_HEALTH_STARTUP_GRACE_SECONDS >= \
  BACKEND_HEALTH_STARTUP_GRACE_SECONDS))

reset_runtime
verify_backend api
verify_backend otel-collector
METRICS_STATE=failed
if verify_backend otel-collector; then
  fail 'collector verification accepted a failed metrics export'
fi
METRICS_STATE=pending
if verify_backend otel-collector; then
  fail 'collector verification accepted a pending metrics export'
fi

reset_runtime
DOCKER_STATUS=exited
if verify_backend api 2>"$FIXTURE/status.err"; then
  fail 'service verification accepted a non-running container'
fi
grep -F 'failed runtime verification' "$FIXTURE/status.err" >/dev/null
grep -F 'status=exited' "$FIXTURE/status.err" >/dev/null

reset_runtime
DOCKER_OOM=true
if verify_backend api 2>"$FIXTURE/oom.err"; then
  fail 'service verification accepted an OOM-killed container'
fi
grep -F 'failed runtime verification' "$FIXTURE/oom.err" >/dev/null
grep -F 'oom=true' "$FIXTURE/oom.err" >/dev/null

BACKEND_HEALTH_STARTUP_GRACE_SECONDS=9
OTEL_COLLECTOR_HEALTH_STARTUP_GRACE_SECONDS=12
BACKEND_HEALTH_RETRY_SLEEP_SECONDS=3

reset_runtime
READY_FAILURES=2
if ! verify_backend_with_retry api 2>"$FIXTURE/api-delayed.err"; then
  fail 'api readiness did not retry through delayed startup'
fi
[[ $(ready_calls) == 3 ]]
[[ $(wc -l < "$SLEEP_LOG") == 2 ]]
[[ ! -s $FIXTURE/api-delayed.err ]]

reset_runtime
READY_FAILURES=3
READY_FAILURE_MODE=invalid-json
if ! verify_backend_with_retry otel-collector 2>"$FIXTURE/otel-delayed.err"; then
  fail 'collector readiness did not retry through delayed JSON readiness'
fi
[[ $(ready_calls) == 4 ]]
[[ $(wc -l < "$SLEEP_LOG") == 3 ]]
[[ ! -s $FIXTURE/otel-delayed.err ]]

BACKEND_HEALTH_STARTUP_GRACE_SECONDS=3
OTEL_COLLECTOR_HEALTH_STARTUP_GRACE_SECONDS=3
BACKEND_HEALTH_RETRY_SLEEP_SECONDS=3

reset_runtime
METRICS_STATE=failed
if verify_backend_with_retry otel-collector \
  2>"$FIXTURE/otel-final-diagnostics.err"; then
  fail 'collector verification accepted failed export after final diagnostics'
fi
grep -F 'healthz_http curl_exit=0 http_status=200' \
  "$FIXTURE/otel-final-diagnostics.err" >/dev/null
grep -F 'ready_http curl_exit=0 http_status=200' \
  "$FIXTURE/otel-final-diagnostics.err" >/dev/null
grep -F 'ready_json parse=ok exportState=failed lastExportAt=missing' \
  "$FIXTURE/otel-final-diagnostics.err" >/dev/null
grep -F 'service=otel-collector container=collector-container status=running oom=false exit=137 state_error=fixture-state-error' \
  "$FIXTURE/otel-final-diagnostics.err" >/dev/null

reset_runtime
READY_FAILURES=9
READY_FAILURE_MODE=invalid-json
if verify_backend_with_retry otel-collector \
  2>"$FIXTURE/otel-invalid-json-final-diagnostics.err"; then
  fail 'collector verification accepted invalid ready JSON after final diagnostics'
fi
grep -F 'ready_json parse=failed exportState=unavailable lastExportAt=unavailable' \
  "$FIXTURE/otel-invalid-json-final-diagnostics.err" >/dev/null
if grep -F '{not-json' \
  "$FIXTURE/otel-invalid-json-final-diagnostics.err" >/dev/null; then
  fail 'final diagnostics leaked raw ready JSON'
fi

reset_runtime
DOCKER_STATUS=exited
if verify_backend_with_retry api \
  2>"$FIXTURE/api-container-final-diagnostics.err"; then
  fail 'api verification accepted exited container after final diagnostics'
fi
grep -F 'failed runtime verification' \
  "$FIXTURE/api-container-final-diagnostics.err" >/dev/null
grep -F 'healthz_http curl_exit=0 http_status=200' \
  "$FIXTURE/api-container-final-diagnostics.err" >/dev/null
grep -F 'ready_http curl_exit=0 http_status=200' \
  "$FIXTURE/api-container-final-diagnostics.err" >/dev/null
grep -F 'ready_json parse=ok exportState=succeeded lastExportAt=present' \
  "$FIXTURE/api-container-final-diagnostics.err" >/dev/null
grep -F 'service=api container=api-container status=exited oom=false exit=137 state_error=fixture-state-error' \
  "$FIXTURE/api-container-final-diagnostics.err" >/dev/null

BACKEND_HEALTH_STARTUP_GRACE_SECONDS=9
OTEL_COLLECTOR_HEALTH_STARTUP_GRACE_SECONDS=12
BACKEND_HEALTH_RETRY_SLEEP_SECONDS=3

ATTEMPTS_FILE=$FIXTURE/attempts.log
install_failing_verify_backend() {
  verify_backend() {
    printf 'attempt\n' >> "$ATTEMPTS_FILE"
    return 1
  }
}

install_failing_verify_backend

: > "$ATTEMPTS_FILE"
if verify_backend_with_retry api 2>"$FIXTURE/api-exhausted.err"; then
  fail 'api health succeeded after exhausting failed attempts'
fi
[[ $(wc -l < "$ATTEMPTS_FILE") == 4 ]]

: > "$ATTEMPTS_FILE"
if verify_backend_with_retry otel-collector 2>"$FIXTURE/otel-exhausted.err"; then
  fail 'collector health succeeded after exhausting failed attempts'
fi
[[ $(wc -l < "$ATTEMPTS_FILE") == 5 ]]

echo 'Backend runtime health contract tests passed'
