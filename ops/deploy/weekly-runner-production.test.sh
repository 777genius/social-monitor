#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO=$(cd "$SCRIPT_DIR/../.." && pwd)

service=$SCRIPT_DIR/production-runtime/social-monitor-weekly.service
timer=$SCRIPT_DIR/production-runtime/social-monitor-weekly.timer
deploy_lib=$SCRIPT_DIR/postgres-runtime-deploy-lib.sh
deploy_entrypoint=$SCRIPT_DIR/social-monitor-production-deploy.sh
package_json=$REPO/package.json

[[ -f $service ]]
[[ -f $timer ]]
grep -Fx 'Type=oneshot' "$service" >/dev/null
grep -Fx 'Restart=no' "$service" >/dev/null
grep -F 'npm run run:reader-summary-weekly-production' "$service" >/dev/null
grep -F 'READER_SUMMARY_WEEKLY_PRODUCTION_ARTIFACT_DIR=' "$service" >/dev/null
grep -Fx 'Persistent=false' "$timer" >/dev/null
grep -Fx 'Unit=social-monitor-weekly.service' "$timer" >/dev/null
grep -F 'OnCalendar=Mon ' "$timer" >/dev/null
! grep -Eq '^(OnBootSec|OnActiveSec|OnUnitActiveSec)=' "$timer"
! grep -Eq 'systemctl[[:space:]]+(enable|start|restart)[[:space:]]+social-monitor-weekly' "$deploy_lib"
! grep -Eq 'systemctl[[:space:]]+(enable|start|restart)[[:space:]]+social-monitor-weekly' "$deploy_entrypoint"
grep -F 'social-monitor-weekly.service' "$deploy_lib" >/dev/null
grep -F 'social-monitor-weekly.timer' "$deploy_lib" >/dev/null
grep -F 'ops/deploy/production-runtime/social-monitor-weekly.service' \
  "$deploy_entrypoint" >/dev/null
grep -F 'ops/deploy/production-runtime/social-monitor-weekly.timer' \
  "$deploy_entrypoint" >/dev/null
grep -F 'run:reader-summary-weekly-production' "$package_json" >/dev/null
grep -F 'check:reader-summary-weekly-production-postgres' \
  "$package_json" >/dev/null
grep -F 'check:reader-summary-weekly-production-runner' "$package_json" \
  >/dev/null
