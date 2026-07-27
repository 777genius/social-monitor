#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/bin:/bin:/usr/sbin:/sbin
ENTRYPOINT=/var/data/social-monitor/control/github-production-deploy.sh

original_command=${SSH_ORIGINAL_COMMAND:-}
[[ $original_command != *$'\n'* && $original_command != *$'\r'* ]] || exit 64
read -r action sha extra <<< "$original_command"

[[ -z ${extra:-} ]] || exit 64
[[ ${action:-} =~ ^(plan|upload|deploy|disk-report|project-disk-cleanup|reader-summary-recover-missing-days|reader-summary-weekly-run)$ ]] || exit 64
[[ ${sha:-} =~ ^[0-9a-f]{40}$ ]] || exit 64

exec sudo -n "$ENTRYPOINT" "$action" "$sha"
