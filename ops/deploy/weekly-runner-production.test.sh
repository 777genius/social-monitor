#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO=$(cd "$SCRIPT_DIR/../.." && pwd)

service=$SCRIPT_DIR/production-runtime/social-monitor-weekly.service
timer=$SCRIPT_DIR/production-runtime/social-monitor-weekly.timer
maintenance_lib=$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.sh
deploy_lib=$SCRIPT_DIR/postgres-runtime-deploy-lib.sh
deploy_entrypoint=$SCRIPT_DIR/social-monitor-production-deploy.sh
package_json=$REPO/package.json
production_workflow=$REPO/.github/workflows/production-deploy.yml

[[ -f $service ]]
[[ -f $timer ]]
grep -Fx 'Type=oneshot' "$service" >/dev/null
grep -F 'github-production-deploy.sh" reader-summary-weekly-run "$release"' \
  "$service" >/dev/null
grep -Fx 'Restart=on-failure' "$service" >/dev/null
grep -Fx 'RestartSec=30min' "$service" >/dev/null
grep -Fx 'StartLimitIntervalSec=3h' "$service" >/dev/null
grep -Fx 'StartLimitBurst=3' "$service" >/dev/null
grep -Fx 'Persistent=true' "$timer" >/dev/null
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
grep -F 'npm run check:reader-summary-weekly-production-runner' \
  "$production_workflow" >/dev/null

grep -F 'DAILY_SINGLETON_LOCK' "$maintenance_lib" >/dev/null
grep -F 'POSTGRES_ADMISSION_LOCK' "$maintenance_lib" >/dev/null
grep -F 'npm run run:reader-summary-weekly-production' \
  "$maintenance_lib" >/dev/null
grep -F 'npm run run:reader-summary-weekly-production -- --replay' \
  "$maintenance_lib" >/dev/null
grep -F 'npm run backfill:reader-summary-weekly-daily-certifications' \
  "$maintenance_lib" >/dev/null
grep -F -- '-e READER_SUMMARY_WEEKLY_PRODUCTION_TENANT_ID=00000000-0000-7000-8000-000000000901' \
  "$maintenance_lib" >/dev/null
grep -F -- '-e READER_SUMMARY_WEEKLY_PRODUCTION_WORKSPACE_ID=00000000-0000-7000-8000-000000000902' \
  "$maintenance_lib" >/dev/null
grep -F 'READER_SUMMARY_WEEKLY_PRODUCTION_ARTIFACT_DIR=' \
  "$maintenance_lib" >/dev/null
! grep -Ei 'backup|subscription-runtime' "$maintenance_lib" >/dev/null

bash "$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.test.sh"
