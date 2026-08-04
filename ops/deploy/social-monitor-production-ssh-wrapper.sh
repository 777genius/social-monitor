#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/bin:/bin:/usr/sbin:/sbin
ENTRYPOINT=/var/data/social-monitor/control/github-production-deploy.sh
DAILY_CANONICAL_RECOVERY_CONFIRMATION=reader-summary-daily-canonical-recovery-v4
DAILY_BOUNDED_MAINTENANCE_AUTHORIZED_UTC_DATE=2026-07-23

original_command=${SSH_ORIGINAL_COMMAND:-}
[[ $original_command != *$'\n'* && $original_command != *$'\r'* ]] || exit 64
read -r action sha confirmation model_job_identity authority_sha256 extra <<< "$original_command"

[[ -z ${extra:-} ]] || exit 64
[[ ${action:-} =~ ^(plan|upload|deploy|disk-report|project-disk-cleanup|reader-summary-recover-missing-days|reader-summary-weekly-run|reader-summary-daily-canonical-recovery-v4)$ ]] || exit 64
[[ ${sha:-} =~ ^[0-9a-f]{40}$ ]] || exit 64
if [[ $action == reader-summary-daily-canonical-recovery-v4 ]]; then
  [[ ${confirmation:-} == "$DAILY_CANONICAL_RECOVERY_CONFIRMATION" && \
     ${model_job_identity:-} =~ ^[0-9a-f]{64}$ && \
     ${authority_sha256:-} =~ ^[0-9a-f]{64}$ ]] || exit 64
  # V4A4's installed entrypoint accepts only the pre-existing bounded action.
  # Do not carry SSH_ORIGINAL_COMMAND across sudo: the entrypoint deliberately
  # prefers it over argv when a sudo policy preserves the environment.
  unset SSH_ORIGINAL_COMMAND
  exec sudo -n \
    READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE="$DAILY_BOUNDED_MAINTENANCE_AUTHORIZED_UTC_DATE" \
    READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY="$model_job_identity" \
    READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256="$authority_sha256" \
    "$ENTRYPOINT" reader-summary-recover-missing-days "$sha"
fi
[[ -z ${confirmation:-}${model_job_identity:-}${authority_sha256:-} ]] || exit 64

unset SSH_ORIGINAL_COMMAND
exec sudo -n "$ENTRYPOINT" "$action" "$sha"
