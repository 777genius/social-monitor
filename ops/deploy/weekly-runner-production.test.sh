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
weekly_seal_migration=$REPO/prisma/migrations/20260731120000_reader_summary_weekly_certification_seal/migration.sql
weekly_seal_contract=$REPO/scripts/lib/reader-summary-weekly-certification-seal-postgres-contract.ts
publication_pre_migration=$REPO/ops/deploy/reader-summary-publication-pre-migration.sql

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
grep -F 'systemctl enable "$timer"' "$deploy_lib" >/dev/null
grep -F 'systemctl start "$timer"' "$deploy_lib" >/dev/null
grep -F 'NextElapseUSecRealtime' "$deploy_lib" >/dev/null
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
grep -F 'check:reader-summary-weekly-certification-seal-postgres' \
  "$package_json" >/dev/null
grep -F 'npm run check:reader-summary-weekly-production-runner' \
  "$production_workflow" >/dev/null
grep -F 'npm run check:reader-summary-weekly-certification-seal-postgres' \
  "$production_workflow" >/dev/null

grep -F 'FORCE ROW LEVEL SECURITY' "$weekly_seal_migration" >/dev/null
grep -F "current_setting('transaction_isolation') <> 'serializable'" \
  "$weekly_seal_migration" >/dev/null
grep -F 'FOR SHARE OF slot, publication, evidence' \
  "$weekly_seal_migration" >/dev/null
! grep -Eq '\bLOCK[[:space:]]+TABLE\b' "$weekly_seal_migration"
grep -F 'capability_table_acl_count === "0"' "$weekly_seal_contract" \
  >/dev/null
grep -F 'function_capability_acl_count === "0"' "$weekly_seal_contract" \
  >/dev/null
[[ $(grep -Fc "'reader_summary_weekly_certification_seals'" \
  "$publication_pre_migration") -eq 6 ]]
[[ $(awk '
  /AND relation\.relname NOT IN \(/ { in_owner_exclusion = 1; next }
  in_owner_exclusion && /reader_summary_weekly_certification_seals/ { count++ }
  in_owner_exclusion && /^      \)/ { in_owner_exclusion = 0 }
  END { print count + 0 }
' "$publication_pre_migration") -eq 3 ]]
[[ $(awk '
  /^DO \$ownership_transfer_audit\$/ { in_owner_audit = 1 }
  in_owner_audit && /AND relation\.relname IN \(/ { in_owner_list = 1; next }
  in_owner_list && /reader_summary_weekly_certification_seals/ { count++ }
  in_owner_list && /^      \)/ { in_owner_list = 0 }
  END { print count + 0 }
' "$publication_pre_migration") -eq 1 ]]
awk '
  /^DO \$weekly_certification_seal_ownership_transfer\$/ {
    in_transfer = 1
    transfer = NR
  }
  in_transfer && /IF v_seal_relation_kind NOT IN .*v_seal_owner NOT IN \(/ {
    owner_guard = NR
    in_safe_owners = 1
    next
  }
  in_safe_owners && /social_monitor_public_schema_owner/ {
    schema_owner++
    safe_owner_count++
  }
  in_safe_owners && /social_monitor_reader_summary_publication_owner/ {
    publication_owner++
    safe_owner_count++
  }
  in_safe_owners && /^  \) THEN/ { in_safe_owners = 0 }
  in_transfer && /weekly certification seal has an unexpected owner/ {
    unsafe_rejection = NR
  }
  in_transfer && /^  GRANT social_monitor_reader_summary_publication_owner$/ {
    temporary_grant = NR
  }
  in_transfer && /^  SET LOCAL ROLE social_monitor_public_schema_owner;/ {
    set_role = NR
  }
  in_transfer && /^  ALTER TABLE public\.reader_summary_weekly_certification_seals$/ {
    transfer_owner = NR
  }
  in_transfer && /^  RESET ROLE;/ { reset_role = NR }
  in_transfer && /^  REVOKE social_monitor_reader_summary_publication_owner$/ {
    temporary_revoke = NR
  }
  /^\$weekly_certification_seal_ownership_transfer\$;/ {
    transfer_end = NR
    in_transfer = 0
  }
  /^DO \$ownership_transfer_audit\$/ { audit = NR }
  END {
    valid_safe_owners = schema_owner == 1 && publication_owner == 1 &&
      safe_owner_count == 2
    valid_order = transfer < owner_guard && owner_guard < unsafe_rejection &&
      unsafe_rejection < temporary_grant && temporary_grant < set_role &&
      set_role < transfer_owner && transfer_owner < reset_role &&
      reset_role < temporary_revoke && temporary_revoke < transfer_end &&
      transfer_end < audit
    exit !(valid_safe_owners && valid_order)
  }
' "$publication_pre_migration"
! grep -Eq '(GRANT|REVOKE).+reader_summary_weekly_certification_seals' \
  "$weekly_seal_contract"

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
