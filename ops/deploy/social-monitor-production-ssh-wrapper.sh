#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/bin:/bin:/usr/sbin:/sbin
ENTRYPOINT=/var/data/social-monitor/control/github-production-deploy.sh
DAILY_CANONICAL_RECOVERY_CONFIRMATION=reader-summary-daily-canonical-recovery-v4

original_command=${SSH_ORIGINAL_COMMAND:-}
[[ $original_command != *$'\n'* && $original_command != *$'\r'* ]] || exit 64
read -r action sha confirmation extra <<< "$original_command"

[[ -z ${extra:-} ]] || exit 64
[[ ${action:-} =~ ^(plan|upload|deploy|disk-report|project-disk-cleanup|reader-summary-recover-missing-days|reader-summary-weekly-run|reader-summary-daily-canonical-recovery-v4)$ ]] || exit 64
[[ ${sha:-} =~ ^[0-9a-f]{40}$ ]] || exit 64
if [[ $action == reader-summary-daily-canonical-recovery-v4 ]]; then
  [[ ${confirmation:-} == "$DAILY_CANONICAL_RECOVERY_CONFIRMATION" ]] || exit 64
  exec sudo -n "$ENTRYPOINT" "$action" "$sha" "$confirmation"
fi
[[ -z ${confirmation:-} ]] || exit 64

exec sudo -n "$ENTRYPOINT" "$action" "$sha"
