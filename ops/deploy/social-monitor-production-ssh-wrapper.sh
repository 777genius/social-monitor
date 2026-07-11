#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/bin:/bin:/usr/sbin:/sbin
ENTRYPOINT=/var/data/social-monitor/control/github-production-deploy.sh

read -r action sha extra <<< "${SSH_ORIGINAL_COMMAND:-}"

[[ -z ${extra:-} ]] || exit 64
[[ ${action:-} =~ ^(plan|upload|deploy)$ ]] || exit 64
[[ ${sha:-} =~ ^[0-9a-f]{40}$ ]] || exit 64

exec sudo -n "$ENTRYPOINT" "$action" "$sha"
