#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=ops/deploy/backend-runtime-health-lib.sh
source "$SCRIPT_DIR/backend-runtime-health-lib.sh"

METRICS_STATE=succeeded
COMPOSE=(fake_compose)

curl() {
  local argument
  for argument in "$@"; do
    if [[ $argument == http://127.0.0.1:13000/ready ]]; then
      printf '{"runtime":{"metrics":{"exportState":"%s","lastExportAt":%s}}}\n' \
        "$METRICS_STATE" \
        "$([[ $METRICS_STATE == succeeded ]] && \
          printf '"2026-07-26T12:00:00.000Z"' || printf null)"
      return 0
    fi
  done
}

fake_compose() {
  [[ $* == '--profile app ps -q otel-collector' ]] || return 90
  printf 'collector-container\n'
}

docker() {
  [[ $1 == inspect && $2 == collector-container ]] || return 91
  case $4 in
    '{{.State.Status}}') printf 'running\n' ;;
    '{{.State.OOMKilled}}') printf 'false\n' ;;
    *) return 92 ;;
  esac
}

install_failing_verify_backend() {
  verify_backend() {
    printf 'attempt\n' >> "$ATTEMPTS_FILE"
    return 1
  }
}

verify_backend otel-collector
METRICS_STATE=failed
if verify_backend otel-collector; then
  echo 'collector verification accepted a failed metrics export' >&2
  exit 1
fi
METRICS_STATE=pending
if verify_backend otel-collector; then
  echo 'collector verification accepted a pending metrics export' >&2
  exit 1
fi

ATTEMPTS_FILE=$(mktemp /tmp/social-monitor-health-attempts.XXXXXX)
trap 'rm -f "$ATTEMPTS_FILE"' EXIT
install_failing_verify_backend
sleep() { :; }

: > "$ATTEMPTS_FILE"
if verify_backend_with_retry otel-collector; then
  exit 1
fi
[[ $(wc -l < "$ATTEMPTS_FILE") == 40 ]]

: > "$ATTEMPTS_FILE"
if verify_backend_with_retry api; then
  exit 1
fi
[[ $(wc -l < "$ATTEMPTS_FILE") == 20 ]]

echo 'Backend runtime health contract tests passed'
