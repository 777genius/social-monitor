#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/bin:/bin:/usr/sbin:/sbin
ENTRYPOINT=/var/data/social-monitor/control/github-production-deploy.sh
DAILY_CANONICAL_RECOVERY_CONFIRMATION=reader-summary-daily-canonical-recovery-v4
DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN=invalid-product-retry-set-v1

unset original_command action sha first_authorization_value second_authorization_value third_authorization_value extra authorization_record confirmation model_job_identity authority_sha256 retry_set_token terminal_set_sha256
original_command=${SSH_ORIGINAL_COMMAND:-}
[[ $original_command != *$'\n'* && $original_command != *$'\r'* ]] || exit 64
read -r action sha first_authorization_value second_authorization_value \
  third_authorization_value extra <<< "$original_command"

[[ -z ${extra:-} ]] || exit 64
[[ ${action:-} =~ ^(plan|upload|deploy|disk-report|project-disk-cleanup|reader-summary-recover-missing-days|reader-summary-weekly-run|reader-summary-production-history|reader-summary-daily-canonical-recovery-v4|reader-summary-daily-terminal-set-receipt-v1|reader-summary-daily-scan-terminal-preimage-c1|reader-summary-daily-scan-terminal-repair-c1|reader-summary-daily-delivery-c1-run|reader-summary-daily-delivery-c1-contain)$ ]] || exit 64
[[ ${sha:-} =~ ^[0-9a-f]{40}$ ]] || exit 64
if [[ $action == reader-summary-daily-delivery-c1-run ]]; then
  [[ ${first_authorization_value:-} == "$action" && \
     ${second_authorization_value:-} =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ && \
     -z ${third_authorization_value:-} ]] || exit 64
  authorization_record="$first_authorization_value $second_authorization_value"
  unset SSH_ORIGINAL_COMMAND first_authorization_value second_authorization_value third_authorization_value
  exec sudo -n -- "$ENTRYPOINT" "$action" "$sha" <<< "$authorization_record"
fi
if [[ $action == reader-summary-production-history ]]; then
  [[ ${first_authorization_value:-} =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ && \
     -z ${second_authorization_value:-}${third_authorization_value:-} ]] || exit 64
  authorization_record=$first_authorization_value
  unset SSH_ORIGINAL_COMMAND first_authorization_value second_authorization_value third_authorization_value
  exec sudo -n -- "$ENTRYPOINT" "$action" "$sha" <<< "$authorization_record"
fi
if [[ $action == reader-summary-daily-delivery-c1-contain ]]; then
  [[ ${first_authorization_value:-} == "$action" && \
     ${second_authorization_value:-} == "$sha" && \
     -z ${third_authorization_value:-} ]] || exit 64
  authorization_record="$first_authorization_value $second_authorization_value"
  unset SSH_ORIGINAL_COMMAND first_authorization_value second_authorization_value third_authorization_value
  exec sudo -n -- "$ENTRYPOINT" "$action" "$sha" <<< "$authorization_record"
fi
if [[ $action == reader-summary-daily-scan-terminal-repair-c1 ]]; then
  [[ ${first_authorization_value:-} == reader-summary-daily-scan-terminal-repair-c1 && \
     ${second_authorization_value:-} =~ ^[0-9a-f]{64}$ && \
     -z ${third_authorization_value:-} ]] || exit 64
  authorization_record="$first_authorization_value $second_authorization_value"
  unset SSH_ORIGINAL_COMMAND first_authorization_value second_authorization_value third_authorization_value
  exec sudo -n -- "$ENTRYPOINT" "$action" "$sha" <<< "$authorization_record"
fi
if [[ $action == reader-summary-daily-canonical-recovery-v4 ]]; then
  # Both externally-confirmed forms map onto the existing recovery intent. The
  # retry-set form is mutually exclusive so only it can skip the Jul31 runner.
  unset SSH_ORIGINAL_COMMAND authorization_record
  unset READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256 READER_SUMMARY_DAILY_MAINTENANCE_RETRY_SET_TOKEN READER_SUMMARY_DAILY_MAINTENANCE_TERMINAL_SET_SHA256
  if [[ ${first_authorization_value:-} == "$DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN" ]]; then
    [[ ${second_authorization_value:-} =~ ^[0-9a-f]{64}$ && \
       -z ${third_authorization_value:-} ]] || exit 64
    # The retry-set identity travels once over stdin, never through sudo env.
    authorization_record="reader-summary-daily-canonical-recovery-v4 $DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN $second_authorization_value"
  else
    [[ ${first_authorization_value:-} == "$DAILY_CANONICAL_RECOVERY_CONFIRMATION" && \
       ${second_authorization_value:-} =~ ^[0-9a-f]{64}$ && \
       ${third_authorization_value:-} =~ ^[0-9a-f]{64}$ ]] || exit 64
    authorization_record="$DAILY_CANONICAL_RECOVERY_CONFIRMATION 2026-07-23 $second_authorization_value $third_authorization_value"
  fi
  unset first_authorization_value second_authorization_value third_authorization_value confirmation model_job_identity authority_sha256 retry_set_token terminal_set_sha256
  exec sudo -n -- "$ENTRYPOINT" reader-summary-recover-missing-days "$sha" \
    <<< "$authorization_record"
fi
[[ -z ${first_authorization_value:-}${second_authorization_value:-}${third_authorization_value:-} ]] || exit 64

unset SSH_ORIGINAL_COMMAND first_authorization_value second_authorization_value third_authorization_value confirmation model_job_identity authority_sha256 retry_set_token terminal_set_sha256 authorization_record
unset READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256 READER_SUMMARY_DAILY_MAINTENANCE_RETRY_SET_TOKEN READER_SUMMARY_DAILY_MAINTENANCE_TERMINAL_SET_SHA256
if [[ $action == upload ]]; then
  exec sudo -n -- "$ENTRYPOINT" "$action" "$sha"
fi
exec sudo -n -- "$ENTRYPOINT" "$action" "$sha" </dev/null
