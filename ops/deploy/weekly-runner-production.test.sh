#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO=$(cd "$SCRIPT_DIR/../.." && pwd)

service=$SCRIPT_DIR/production-runtime/social-monitor-weekly.service
timer=$SCRIPT_DIR/production-runtime/social-monitor-weekly.timer
maintenance_lib=$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.sh
deploy_lib=$SCRIPT_DIR/postgres-runtime-deploy-lib.sh
weekly_timer_state_lib=$SCRIPT_DIR/postgres-runtime-weekly-timer-state-lib.sh
deploy_entrypoint=$SCRIPT_DIR/social-monitor-production-deploy.sh
package_json=$REPO/package.json
production_workflow=$REPO/.github/workflows/production-deploy.yml
weekly_seal_migration=$REPO/prisma/migrations/20260731120000_reader_summary_weekly_certification_seal/migration.sql
weekly_seal_contract=$REPO/scripts/lib/reader-summary-weekly-certification-seal-postgres-contract.ts
weekly_receipt=$REPO/scripts/lib/reader-summary-weekly-execution-receipt.ts
weekly_scheduler=$REPO/scripts/lib/reader-summary-weekly-production-scheduler.ts
weekly_schedule=$REPO/scripts/lib/reader-summary-weekly-schedule-postgres.ts
weekly_runner=$REPO/scripts/run-reader-summary-weekly-production.ts
weekly_slot_pipeline=$REPO/scripts/lib/reader-summary-weekly-slot-pipeline.ts
weekly_review_admission=$REPO/scripts/lib/reader-summary-weekly-review-admission.ts
publication_pre_migration=$REPO/ops/deploy/reader-summary-publication-pre-migration.sql
publication_post_migration=$REPO/ops/deploy/reader-summary-publication-post-migration.sql

[[ -f $service ]]
[[ -f $timer ]]
[[ -f $weekly_timer_state_lib ]]
grep -Fx 'Type=oneshot' "$service" >/dev/null
grep -F 'github-production-deploy.sh" reader-summary-weekly-run "$release"' \
  "$service" >/dev/null
grep -Fx 'Restart=on-failure' "$service" >/dev/null
grep -Fx 'RestartSec=30min' "$service" >/dev/null
grep -Fx 'StartLimitIntervalSec=3h' "$service" >/dev/null
grep -Fx 'StartLimitBurst=3' "$service" >/dev/null
grep -Fx 'TimeoutStartSec=23400' "$service" >/dev/null
grep -Fx 'Persistent=true' "$timer" >/dev/null
grep -Fx 'Unit=social-monitor-weekly.service' "$timer" >/dev/null
grep -F 'OnCalendar=Mon ' "$timer" >/dev/null
! grep -Eq '^(OnBootSec|OnActiveSec|OnUnitActiveSec)=' "$timer"
grep -F 'ops/deploy/postgres-runtime-weekly-timer-state-lib.sh' \
  "$deploy_lib" >/dev/null
grep -F 'source "$helper"' "$deploy_lib" >/dev/null
grep -F 'ops/deploy/postgres-runtime-weekly-timer-state-lib.sh' \
  "$deploy_entrypoint" >/dev/null
grep -F 'reconcile_postgres_runtime_weekly_timer()' \
  "$weekly_timer_state_lib" >/dev/null
grep -F 'systemctl enable "$timer"' "$weekly_timer_state_lib" >/dev/null
grep -F 'systemctl start "$timer"' "$weekly_timer_state_lib" >/dev/null
grep -F 'NextElapseUSecRealtime' "$weekly_timer_state_lib" >/dev/null
! grep -F 'systemctl enable "$timer"' "$deploy_lib" >/dev/null
! grep -F 'systemctl start "$timer"' "$deploy_lib" >/dev/null
! grep -Eq 'systemctl[[:space:]]+(enable|start|restart)[[:space:]]+social-monitor-weekly' "$deploy_entrypoint"
grep -F 'social-monitor-weekly.service' "$deploy_lib" >/dev/null
grep -F 'social-monitor-weekly.timer' "$deploy_lib" >/dev/null
grep -F 'ops/deploy/production-runtime/social-monitor-weekly.service' \
  "$deploy_entrypoint" >/dev/null
grep -F 'ops/deploy/production-runtime/social-monitor-weekly.timer' \
  "$deploy_entrypoint" >/dev/null
grep -F 'run:reader-summary-weekly-production' "$package_json" >/dev/null
[[ $(grep -Fc 'model_call=${result.modelCallPerformed ? "true" : "false"}' \
  "$weekly_runner") -eq 1 ]]
grep -F 'run:reader-summary-weekly-production": "node scripts/run-with-timeout.mjs --timeout-ms 14400000' \
  "$package_json" >/dev/null
grep -F 'check:reader-summary-weekly-production-postgres' \
  "$package_json" >/dev/null
grep -F 'check:reader-summary-weekly-production-runner' "$package_json" \
  >/dev/null
grep -F 'reader-summary-weekly-slot-pipeline.spec.ts' "$package_json" >/dev/null
grep -F 'check:reader-summary-weekly-execution-receipt-postgres18' \
  "$package_json" >/dev/null
grep -F 'check:reader-summary-weekly-certification-seal-postgres' \
  "$package_json" >/dev/null
grep -F 'npm run check:reader-summary-weekly-production-runner' \
  "$production_workflow" >/dev/null
grep -F 'npm run check:reader-summary-weekly-execution-receipt-postgres18' \
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
[[ $(grep -Fc "'reader_summary_weekly_review_manifests'" \
  "$publication_pre_migration") -eq 7 ]]
[[ $(awk '
  /AND relation\.relname NOT IN \(/ { in_owner_exclusion = 1; next }
  in_owner_exclusion && /reader_summary_weekly_review_manifests/ { count++ }
  in_owner_exclusion && /^      \)/ { in_owner_exclusion = 0 }
  END { print count + 0 }
' "$publication_pre_migration") -eq 3 ]]
[[ $(awk '
  /^DO \$ownership_transfer_audit\$/ { in_owner_audit = 1 }
  in_owner_audit && /AND relation\.relname IN \(/ { in_owner_list = 1; next }
  in_owner_list && /reader_summary_weekly_review_manifests/ { count++ }
  in_owner_list && /^[[:space:]]*\)[,;]?$/ { in_owner_list = 0 }
  END { print count + 0 }
' "$publication_pre_migration") -eq 2 ]]
[[ $(awk '
  /^DO \$ownership_transfer_audit\$/ { in_owner_audit = 1 }
  in_owner_audit && /FROM unnest\(ARRAY\[/ {
    in_protected_array = 1
    protected_array = ""
  }
  in_owner_audit && in_protected_array {
    protected_array = protected_array $0 "\n"
  }
  in_owner_audit && in_protected_array && /\]\) protected_table\(name\)/ {
    if (protected_array ~ /reader_summary_weekly_review_manifests/) {
      count++
    }
    in_protected_array = 0
  }
  END { print count + 0 }
' "$publication_pre_migration") -eq 1 ]]
[[ $(grep -Fc "'reader_summary_weekly_review_manifests'" \
  "$publication_post_migration") -eq 3 ]]
[[ $(awk '
  /^DO \$bootstrap\$/ { in_bootstrap = 1 }
  in_bootstrap && /AND relation\.relname IN \(/ { in_owner_list = 1; next }
  in_owner_list && /reader_summary_weekly_review_manifests/ { count++ }
  in_owner_list && /^    \)/ { in_owner_list = 0 }
  END { print count + 0 }
' "$publication_post_migration") -eq 1 ]]
grep -F 'IF v_weekly_review_manifest_table_count NOT IN (0, 1)' \
  "$publication_post_migration" >/dev/null
grep -F 'OR v_v4_table_count NOT IN (0, 3, 4, 5)' \
  "$publication_post_migration" >/dev/null
grep -F 'OR v_owner_count <> 4 + v_weekly_review_manifest_table_count' \
  "$publication_post_migration" >/dev/null
grep -F '+ v_v4_table_count THEN' \
  "$publication_post_migration" >/dev/null
[[ $(awk '
  /^DO \$bootstrap\$/ { in_bootstrap = 1 }
  in_bootstrap && /FROM unnest\(ARRAY\[/ {
    in_protected_array = 1
    protected_array = ""
  }
  in_bootstrap && in_protected_array {
    protected_array = protected_array $0 "\n"
  }
  in_bootstrap && in_protected_array && /\]\) protected_table\(name\)/ {
    if (protected_array ~ /reader_summary_weekly_review_manifests/) {
      count++
    }
    in_protected_array = 0
  }
  END { print count + 0 }
' "$publication_post_migration") -eq 1 ]]
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
  in_transfer && /^[[:space:]]+GRANT social_monitor_reader_summary_publication_owner$/ {
    temporary_grant = NR
  }
  in_transfer && /^[[:space:]]+SET LOCAL ROLE social_monitor_public_schema_owner;$/ {
    set_role = NR
  }
  in_transfer && /^[[:space:]]+ALTER TABLE public\.reader_summary_weekly_certification_seals$/ {
    transfer_owner = NR
  }
  in_transfer && /^  SET LOCAL ROLE social_monitor_reader_summary_publication_owner;$/ {
    publication_owner_role = NR
  }
  in_transfer && /^  REVOKE REFERENCES ON TABLE public\.reader_summary_weekly_certification_seals$/ {
    revoke_references = NR
    expect_revoke_grantee = 1
    next
  }
  expect_revoke_grantee && /^  FROM social_monitor_reader_summary_publication_owner;$/ {
    revoke_grantee = NR
    expect_revoke_grantee = 0
  }
  in_transfer && /^  RESET ROLE;/ { reset_role = NR }
  in_transfer && /^[[:space:]]+REVOKE social_monitor_reader_summary_publication_owner$/ {
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
      set_role < transfer_owner && transfer_owner < publication_owner_role &&
      publication_owner_role < revoke_references &&
      revoke_references < revoke_grantee && revoke_grantee < reset_role &&
      reset_role < temporary_revoke && temporary_revoke < transfer_end &&
      transfer_end < audit
    exit !(valid_safe_owners && valid_order && !expect_revoke_grantee)
  }
' "$publication_pre_migration"
! grep -Eq '(GRANT|REVOKE).+reader_summary_weekly_certification_seals' \
  "$weekly_seal_contract"

grep -F 'FOR UPDATE OF job' "$weekly_receipt" >/dev/null
grep -F 'ON CONFLICT (tenant_id, idempotency_key) DO NOTHING' \
  "$weekly_receipt" >/dev/null
grep -F 'claimReaderSummaryWeeklyExecutionReceiptPair' "$weekly_receipt" >/dev/null
grep -F 'releaseReaderSummaryWeeklyExecutionReceiptPair' "$weekly_receipt" >/dev/null
! grep -Eq '\bLOCK[[:space:]]+TABLE\b' "$weekly_receipt"
grep -F 'planReaderSummaryWeeklyCatchUp' "$weekly_scheduler" >/dev/null
grep -F 'decideReaderSummaryWeeklyRetry' "$weekly_scheduler" >/dev/null
grep -F 'terminalDiagnostics' "$weekly_scheduler" >/dev/null
grep -F '$5::timestamptz' "$weekly_schedule" >/dev/null
! grep -F '$5::date' "$weekly_schedule" >/dev/null
[[ -f $weekly_slot_pipeline ]]
grep -F 'backfillDailyCertifications' "$weekly_slot_pipeline" >/dev/null
grep -F 'replayZeroModel' "$weekly_slot_pipeline" >/dev/null
grep -F 'persistReplayFailure' "$weekly_slot_pipeline" >/dev/null
grep -F 'zeroModel: true' "$weekly_slot_pipeline" >/dev/null
grep -F 'zeroWrite: true' "$weekly_slot_pipeline" >/dev/null
grep -F 'runReaderSummaryWeeklySlotPipeline' "$weekly_runner" >/dev/null
grep -F 'backfillReaderSummaryWeeklyDailyCertifications' "$weekly_runner" >/dev/null
grep -F 'onDurableArtifactPair' "$weekly_runner" >/dev/null
grep -F 'persistReplayFailure' "$weekly_runner" >/dev/null
grep -F 'ReaderSummaryWeeklySubscriptionRuntimeFailureError' "$weekly_runner" \
  >/dev/null
grep -F 'PrismaReaderSummaryWeeklyReviewManifest' "$weekly_runner" >/dev/null
grep -F 'admitReaderSummaryWeeklyReviewManifest' "$weekly_runner" >/dev/null
grep -F 'buildModelInputFromDbState' "$weekly_runner" >/dev/null
grep -F 'runReaderSummaryWeeklyReviewProducer' "$weekly_review_admission" >/dev/null
grep -F 'manifestStore.findBySeal' "$weekly_review_admission" >/dev/null
grep -F 'if (params.replay)' "$weekly_review_admission" >/dev/null
grep -F 'reviewManifestId' "$REPO/scripts/lib/reader-summary-weekly-production-runner.ts" \
  >/dev/null
grep -F 'reviewManifestSha256' "$REPO/scripts/lib/reader-summary-weekly-production-runner.ts" \
  >/dev/null
review_admission_line=$(grep -n -m1 'admitReaderSummaryWeeklyReviewManifest({' \
  "$weekly_runner" | cut -d: -f1)
input_admission_line=$(grep -n -m1 'const inputAdmission = buildModelInputFromDbState(' \
  "$weekly_runner" | cut -d: -f1)
receipt_line=$(grep -n -m1 'acquireReaderSummaryWeeklyExecutionReceipt(client' \
  "$weekly_runner" | cut -d: -f1)
model_line=$(grep -n 'runReaderSummaryWeeklyProduction({' \
  "$weekly_runner" | tail -n1 | cut -d: -f1)
[[ $review_admission_line =~ ^[0-9]+$ && $input_admission_line =~ ^[0-9]+$ && $receipt_line =~ ^[0-9]+$ && $model_line =~ ^[0-9]+$ ]]
(( review_admission_line < input_admission_line && input_admission_line < receipt_line && receipt_line < model_line ))
completion_callback_line=$(grep -n -m1 'complete: async (input)' \
  "$weekly_runner" | cut -d: -f1)
reconciliation_line=$(grep -n -m1 '=> reconcileReaderSummaryWeeklyExecutionReceiptPublication(' \
  "$weekly_runner" | cut -d: -f1)
[[ $completion_callback_line =~ ^[0-9]+$ && $reconciliation_line =~ ^[0-9]+$ ]]
(( model_line < completion_callback_line && completion_callback_line < reconciliation_line ))
replay_branch_line=$(grep -n -m1 'if (options.replay)' \
  "$weekly_runner" | cut -d: -f1)
runtime_connect_line=$(grep -n -m1 'GrpcAgentRuntimeClient.connect' \
  "$weekly_runner" | cut -d: -f1)
[[ $replay_branch_line =~ ^[0-9]+$ && $runtime_connect_line =~ ^[0-9]+$ ]]
(( replay_branch_line < runtime_connect_line ))
grep -F 'model: "gpt-5.6-sol"' "$weekly_runner" >/dev/null
grep -F 'reasoningEffort: "high"' "$weekly_runner" >/dev/null
! grep -Eq '(OPENAI|CODEX)_API_KEY' "$weekly_runner"

grep -F 'DAILY_SINGLETON_LOCK' "$maintenance_lib" >/dev/null
grep -F 'POSTGRES_ADMISSION_LOCK' "$maintenance_lib" >/dev/null
grep -F 'local deadline_seconds=7500' "$maintenance_lib" >/dev/null
grep -F 'flock -w "$deadline_seconds" 9' "$maintenance_lib" >/dev/null
grep -F 'remaining_seconds=$(( deadline_seconds - elapsed_seconds ))' \
  "$maintenance_lib" >/dev/null
grep -F 'flock -w "$remaining_seconds" 8' "$maintenance_lib" >/dev/null
! grep -F 'flock -n 9' "$maintenance_lib" >/dev/null
grep -F 'npm run run:reader-summary-weekly-production' \
  "$maintenance_lib" >/dev/null
grep -F 'npm run run:reader-summary-weekly-production; npm run run:reader-summary-weekly-production -- --replay' \
  "$maintenance_lib" >/dev/null
! grep -F 'npm run backfill:reader-summary-weekly-daily-certifications' \
  "$maintenance_lib" >/dev/null
grep -F 'READER_SUMMARY_PRODUCTION_TENANT_ID=00000000-0000-7000-8000-000000006101' \
  "$maintenance_lib" >/dev/null
grep -F -- '-e "READER_SUMMARY_WEEKLY_PRODUCTION_TENANT_ID=$READER_SUMMARY_PRODUCTION_TENANT_ID"' \
  "$maintenance_lib" >/dev/null
grep -F 'READER_SUMMARY_PRODUCTION_WORKSPACE_ID=00000000-0000-7000-8000-000000006102' \
  "$maintenance_lib" >/dev/null
grep -F -- '-e "READER_SUMMARY_WEEKLY_PRODUCTION_WORKSPACE_ID=$READER_SUMMARY_PRODUCTION_WORKSPACE_ID"' \
  "$maintenance_lib" >/dev/null
grep -F -- '-e READER_SUMMARY_WEEKLY_PRODUCTION_FIRST_WEEK_START=2026-07-27' \
  "$maintenance_lib" >/dev/null
grep -F -- '-e READER_SUMMARY_WEEKLY_PRODUCTION_CATCH_UP_LIMIT=4' \
  "$maintenance_lib" >/dev/null
grep -F 'READER_SUMMARY_WEEKLY_PRODUCTION_ARTIFACT_DIR=' \
  "$maintenance_lib" >/dev/null

bash "$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.test.sh"
