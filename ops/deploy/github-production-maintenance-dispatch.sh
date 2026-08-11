#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CLIENT=$SCRIPT_DIR/github-production-deploy-client.sh

for workflow_input in \
  MAINTENANCE_ACTION \
  DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN \
  DAILY_CANONICAL_RECOVERY_TERMINAL_SET_SHA256 \
  DAILY_CANONICAL_RECOVERY_CONFIRMATION \
  DAILY_CANONICAL_RECOVERY_MODEL_JOB_IDENTITY \
  DAILY_CANONICAL_RECOVERY_AUTHORITY_SHA256 \
  DAILY_SCAN_TERMINAL_REPAIR_CONFIRMATION \
  DAILY_SCAN_TERMINAL_REPAIR_PREIMAGE_SHA256 \
  DAILY_DELIVERY_C1_CONFIRMATION \
  DAILY_DELIVERY_C1_RECOVERY_THROUGH \
  DAILY_DELIVERY_C1_READY_SHA; do
  declare -p "$workflow_input" >/dev/null 2>&1 || printf -v "$workflow_input" %s ''
done
unset workflow_input

fail() {
  printf 'production-maintenance-dispatch-error: %s\n' "$*" >&2
  exit 1
}

assert_empty() {
  local name
  for name in "$@"; do
    [[ -z ${!name} ]] || fail "$name is not accepted for $MAINTENANCE_ACTION"
  done
}

require_workflow_identity() {
  [[ ${GITHUB_SHA:-} =~ ^[0-9a-f]{40}$ ]] || fail 'GITHUB_SHA is invalid'
  [[ ${GITHUB_RUN_ID:-} =~ ^[1-9][0-9]*$ ]] || fail 'GITHUB_RUN_ID is invalid'
  [[ ${GITHUB_RUN_ATTEMPT:-} =~ ^[1-9][0-9]*$ ]] || fail 'GITHUB_RUN_ATTEMPT is invalid'
  [[ -n ${RUNNER_TEMP:-} && -d $RUNNER_TEMP && ! -L $RUNNER_TEMP ]] || \
    fail 'RUNNER_TEMP must be an existing directory'
}

require_workflow_identity
umask 077

case $MAINTENANCE_ACTION in
  reader-summary-daily-delivery-c1-run)
    [[ $DAILY_DELIVERY_C1_CONFIRMATION == "$MAINTENANCE_ACTION" ]] || \
      fail 'daily delivery C1 run confirmation is invalid'
    [[ $DAILY_DELIVERY_C1_RECOVERY_THROUGH =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || \
      fail 'daily delivery C1 recovery-through date is invalid'
    assert_empty DAILY_DELIVERY_C1_READY_SHA \
      DAILY_SCAN_TERMINAL_REPAIR_CONFIRMATION \
      DAILY_SCAN_TERMINAL_REPAIR_PREIMAGE_SHA256 \
      DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN \
      DAILY_CANONICAL_RECOVERY_TERMINAL_SET_SHA256 \
      DAILY_CANONICAL_RECOVERY_CONFIRMATION \
      DAILY_CANONICAL_RECOVERY_MODEL_JOB_IDENTITY \
      DAILY_CANONICAL_RECOVERY_AUTHORITY_SHA256
    artifact_path="$RUNNER_TEMP/$MAINTENANCE_ACTION-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}.json"
    bash "$CLIENT" maintenance "$GITHUB_SHA" "$MAINTENANCE_ACTION" \
      "$DAILY_DELIVERY_C1_CONFIRMATION" \
      "$DAILY_DELIVERY_C1_RECOVERY_THROUGH" > "$artifact_path"
    bash "$CLIENT" validate-daily-delivery-c1-artifact run \
      "$artifact_path" "$GITHUB_SHA" "$DAILY_DELIVERY_C1_RECOVERY_THROUGH"
    ;;
  reader-summary-daily-delivery-c1-contain)
    [[ $DAILY_DELIVERY_C1_CONFIRMATION == "$MAINTENANCE_ACTION" ]] || \
      fail 'daily delivery C1 containment confirmation is invalid'
    [[ $DAILY_DELIVERY_C1_READY_SHA == "$GITHUB_SHA" ]] || \
      fail 'daily delivery C1 containment READY SHA is invalid'
    assert_empty DAILY_DELIVERY_C1_RECOVERY_THROUGH \
      DAILY_SCAN_TERMINAL_REPAIR_CONFIRMATION \
      DAILY_SCAN_TERMINAL_REPAIR_PREIMAGE_SHA256 \
      DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN \
      DAILY_CANONICAL_RECOVERY_TERMINAL_SET_SHA256 \
      DAILY_CANONICAL_RECOVERY_CONFIRMATION \
      DAILY_CANONICAL_RECOVERY_MODEL_JOB_IDENTITY \
      DAILY_CANONICAL_RECOVERY_AUTHORITY_SHA256
    artifact_path="$RUNNER_TEMP/$MAINTENANCE_ACTION-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}.json"
    bash "$CLIENT" maintenance "$GITHUB_SHA" "$MAINTENANCE_ACTION" \
      "$DAILY_DELIVERY_C1_CONFIRMATION" "$DAILY_DELIVERY_C1_READY_SHA" \
      > "$artifact_path"
    bash "$CLIENT" validate-daily-delivery-c1-artifact contain \
      "$artifact_path" "$GITHUB_SHA"
    ;;
  reader-summary-daily-scan-terminal-preimage-c1)
    assert_empty \
      DAILY_DELIVERY_C1_CONFIRMATION \
      DAILY_DELIVERY_C1_RECOVERY_THROUGH \
      DAILY_DELIVERY_C1_READY_SHA \
      DAILY_SCAN_TERMINAL_REPAIR_CONFIRMATION \
      DAILY_SCAN_TERMINAL_REPAIR_PREIMAGE_SHA256 \
      DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN \
      DAILY_CANONICAL_RECOVERY_TERMINAL_SET_SHA256 \
      DAILY_CANONICAL_RECOVERY_CONFIRMATION \
      DAILY_CANONICAL_RECOVERY_MODEL_JOB_IDENTITY \
      DAILY_CANONICAL_RECOVERY_AUTHORITY_SHA256
    artifact_path="$RUNNER_TEMP/reader-summary-daily-scan-terminal-preimage-c1-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}.json"
    bash "$CLIENT" maintenance "$GITHUB_SHA" "$MAINTENANCE_ACTION" > "$artifact_path"
    bash "$CLIENT" validate-daily-scan-terminal-artifact preimage "$artifact_path"
    ;;
  reader-summary-daily-scan-terminal-repair-c1)
    [[ $DAILY_SCAN_TERMINAL_REPAIR_CONFIRMATION == reader-summary-daily-scan-terminal-repair-c1 ]] || \
      fail 'daily scan terminal repair confirmation is invalid'
    [[ $DAILY_SCAN_TERMINAL_REPAIR_PREIMAGE_SHA256 =~ ^[0-9a-f]{64}$ ]] || \
      fail 'daily scan terminal repair preimage digest is invalid'
    assert_empty \
      DAILY_DELIVERY_C1_CONFIRMATION \
      DAILY_DELIVERY_C1_RECOVERY_THROUGH \
      DAILY_DELIVERY_C1_READY_SHA \
      DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN \
      DAILY_CANONICAL_RECOVERY_TERMINAL_SET_SHA256 \
      DAILY_CANONICAL_RECOVERY_CONFIRMATION \
      DAILY_CANONICAL_RECOVERY_MODEL_JOB_IDENTITY \
      DAILY_CANONICAL_RECOVERY_AUTHORITY_SHA256
    artifact_path="$RUNNER_TEMP/reader-summary-daily-scan-terminal-repair-c1-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}.json"
    bash "$CLIENT" maintenance "$GITHUB_SHA" "$MAINTENANCE_ACTION" \
      "$DAILY_SCAN_TERMINAL_REPAIR_CONFIRMATION" \
      "$DAILY_SCAN_TERMINAL_REPAIR_PREIMAGE_SHA256" > "$artifact_path"
    bash "$CLIENT" validate-daily-scan-terminal-artifact repair \
      "$artifact_path" "$DAILY_SCAN_TERMINAL_REPAIR_PREIMAGE_SHA256"
    ;;
  reader-summary-daily-canonical-recovery-v4)
    assert_empty DAILY_DELIVERY_C1_CONFIRMATION \
      DAILY_DELIVERY_C1_RECOVERY_THROUGH DAILY_DELIVERY_C1_READY_SHA \
      DAILY_SCAN_TERMINAL_REPAIR_CONFIRMATION \
      DAILY_SCAN_TERMINAL_REPAIR_PREIMAGE_SHA256
    if [[ -n $DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN || \
          -n $DAILY_CANONICAL_RECOVERY_TERMINAL_SET_SHA256 ]]; then
      [[ $DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN == invalid-product-retry-set-v1 ]] || \
        fail 'daily canonical recovery retry-set token is invalid'
      [[ $DAILY_CANONICAL_RECOVERY_TERMINAL_SET_SHA256 =~ ^[0-9a-f]{64}$ ]] || \
        fail 'daily canonical recovery terminal-set digest is invalid'
      assert_empty DAILY_CANONICAL_RECOVERY_CONFIRMATION \
        DAILY_CANONICAL_RECOVERY_MODEL_JOB_IDENTITY \
        DAILY_CANONICAL_RECOVERY_AUTHORITY_SHA256
      bash "$CLIENT" maintenance "$GITHUB_SHA" "$MAINTENANCE_ACTION" \
        "$DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN" \
        "$DAILY_CANONICAL_RECOVERY_TERMINAL_SET_SHA256"
    else
      bash "$CLIENT" maintenance "$GITHUB_SHA" "$MAINTENANCE_ACTION" \
        "$DAILY_CANONICAL_RECOVERY_CONFIRMATION" \
        "$DAILY_CANONICAL_RECOVERY_MODEL_JOB_IDENTITY" \
        "$DAILY_CANONICAL_RECOVERY_AUTHORITY_SHA256"
    fi
    ;;
  reader-summary-daily-terminal-set-receipt-v1)
    assert_empty DAILY_DELIVERY_C1_CONFIRMATION \
      DAILY_DELIVERY_C1_RECOVERY_THROUGH DAILY_DELIVERY_C1_READY_SHA \
      DAILY_SCAN_TERMINAL_REPAIR_CONFIRMATION \
      DAILY_SCAN_TERMINAL_REPAIR_PREIMAGE_SHA256 \
      DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN \
      DAILY_CANONICAL_RECOVERY_TERMINAL_SET_SHA256 \
      DAILY_CANONICAL_RECOVERY_CONFIRMATION \
      DAILY_CANONICAL_RECOVERY_MODEL_JOB_IDENTITY \
      DAILY_CANONICAL_RECOVERY_AUTHORITY_SHA256
    artifact_path="$RUNNER_TEMP/reader-summary-daily-terminal-set-receipt-v1-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}.json"
    bash "$CLIENT" maintenance "$GITHUB_SHA" "$MAINTENANCE_ACTION" > "$artifact_path"
    bash "$CLIENT" validate-terminal-set-receipt "$artifact_path"
    ;;
  disk-report|project-disk-cleanup|reader-summary-recover-missing-days|reader-summary-weekly-run)
    assert_empty DAILY_DELIVERY_C1_CONFIRMATION \
      DAILY_DELIVERY_C1_RECOVERY_THROUGH DAILY_DELIVERY_C1_READY_SHA \
      DAILY_SCAN_TERMINAL_REPAIR_CONFIRMATION \
      DAILY_SCAN_TERMINAL_REPAIR_PREIMAGE_SHA256 \
      DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN \
      DAILY_CANONICAL_RECOVERY_TERMINAL_SET_SHA256 \
      DAILY_CANONICAL_RECOVERY_CONFIRMATION \
      DAILY_CANONICAL_RECOVERY_MODEL_JOB_IDENTITY \
      DAILY_CANONICAL_RECOVERY_AUTHORITY_SHA256
    bash "$CLIENT" maintenance "$GITHUB_SHA" "$MAINTENANCE_ACTION"
    ;;
  *) fail 'maintenance action is not in the reviewed workflow allowlist' ;;
esac
