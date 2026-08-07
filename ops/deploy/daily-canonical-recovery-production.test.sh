#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO=$(cd "$SCRIPT_DIR/../.." && pwd)
foundation=$REPO/prisma/migrations/20260802233000_reader_summary_daily_canonical_recovery_v4/migration.sql
security=$REPO/prisma/migrations/20260802233100_reader_summary_daily_canonical_recovery_v4_security/migration.sql
tenant_rls=$REPO/prisma/migrations/20260803173000_reader_summary_daily_canonical_recovery_v4_tenant_rls/migration.sql
forward=$REPO/prisma/migrations/20260804110000_reader_summary_daily_v4_original_cutoff_forward_correction/migration.sql
runner=$REPO/scripts/run-reader-summary-daily-canonical-recovery.ts
bounded_runner=$REPO/scripts/run-reader-summary-daily-bounded-maintenance.ts
bounded_runner_spec=$REPO/scripts/run-reader-summary-daily-bounded-maintenance.spec.ts
package_json=$REPO/package.json
workflow=$REPO/.github/workflows/production-deploy.yml
frozen_input=$REPO/scripts/lib/reader-summary-daily-frozen-publication-input.ts
frozen_input_spec=$REPO/scripts/lib/reader-summary-daily-frozen-publication-input.spec.ts
postgres_runtime_compose=$SCRIPT_DIR/production-runtime/compose.postgres-runtime.yml
final_runtime_model_compose=$SCRIPT_DIR/production-runtime/compose.agent-runtime-model.yml
production_service=$SCRIPT_DIR/production-runtime/social-monitor-prod.service
daily_run=$SCRIPT_DIR/production-runtime/daily-run.sh
compose=$REPO/docker-compose.yml
compose_contract_dir=$(mktemp -d)
stale_production_env=$compose_contract_dir/stale-production.env
stale_control_compose=$compose_contract_dir/compose.production.yml
stale_production_rendered=$compose_contract_dir/stale-production.json
local_override_env=$compose_contract_dir/local-override.env
local_override_rendered=$compose_contract_dir/local-override.json

cleanup_compose_contract() {
  rm -rf "$compose_contract_dir"
}
trap cleanup_compose_contract EXIT

[[ -f $foundation && -f $security && -f $tenant_rls && -f $forward && -f $runner && -f $bounded_runner && -f $bounded_runner_spec && -f $frozen_input && -f $frozen_input_spec && -f $final_runtime_model_compose ]]
[[ ! -e $REPO/scripts/lib/reader-summary-daily-frozen-authority-projection.ts ]]
[[ ! -e $REPO/prisma/migrations/20260802180000_reader_summary_daily_canonical_recovery_v4 ]]
mapfile -t v4_migrations < <(compgen -G "$REPO/prisma/migrations/*daily_canonical_recovery_v4*" | sort || true)
[[ ${#v4_migrations[@]} == 3 ]]
[[ ${v4_migrations[0]} == *20260802233000_reader_summary_daily_canonical_recovery_v4 || ${v4_migrations[1]} == *20260802233000_reader_summary_daily_canonical_recovery_v4 ]]
[[ ${v4_migrations[0]} == *20260802233100_reader_summary_daily_canonical_recovery_v4_security || ${v4_migrations[1]} == *20260802233100_reader_summary_daily_canonical_recovery_v4_security ]]
printf '%s\n' "${v4_migrations[@]}" | grep -F '20260803173000_reader_summary_daily_canonical_recovery_v4_tenant_rls' >/dev/null
grep -F 'run:reader-summary-daily-canonical-recovery' "$package_json" >/dev/null
grep -F 'run:reader-summary-daily-canonical-recovery": "node scripts/run-with-timeout.mjs --timeout-ms 19800000' "$package_json" >/dev/null
grep -F 'run:reader-summary-weekly-production": "node scripts/run-with-timeout.mjs --timeout-ms 14400000' "$package_json" >/dev/null
grep -F 'GrpcReaderSummaryDailyCanonicalRecoveryRuntime' "$runner" >/dev/null
grep -F 'PrismaReaderSummaryDailyCanonicalRecoveryV4Finalization' "$runner" >/dev/null
grep -F 'PostgresCanonicalRecoveryAuthority' "$runner" >/dev/null
grep -F 'required("SYSTEM_DATABASE_URL")' "$runner" >/dev/null
! grep -F 'required("DATABASE_URL")' "$runner" >/dev/null
grep -F 'deriveReaderSummaryDailyTerminalDatabaseUrl' "$runner" >/dev/null
grep -F 'terminalDsn.username = readerSummaryDailyTerminalRole' "$runner" >/dev/null
grep -F 'READER_SUMMARY_DAILY_TERMINAL_DATABASE_URL: terminalDatabaseUrl' "$runner" >/dev/null
grep -F 'READER_SUMMARY_DAILY_AUDITOR_DATABASE_URL: publicationDatabaseUrl' "$runner" >/dev/null
! grep -F 'createReaderSummaryDailyTerminalRuntimeConnection(process.env)' "$runner" >/dev/null
daily_runner_database_environment=$(awk '
  /^  daily-runner:$/ { daily_runner = 1; next }
  daily_runner && /^  [A-Za-z0-9_-]+:$/ { exit }
  daily_runner && /^      (DATABASE_URL|SYSTEM_DATABASE_URL): / { print }
' "$postgres_runtime_compose")
[[ $daily_runner_database_environment == $'      DATABASE_URL: ${SYSTEM_DATABASE_URL:?SYSTEM_DATABASE_URL is required for tenant-system workers}\n      SYSTEM_DATABASE_URL: ${SYSTEM_DATABASE_URL:?SYSTEM_DATABASE_URL is required for tenant-system workers}' ]]
! grep -Eiq '(OPENAI|CODEX)_API_KEY|spawnSync|child_process' "$runner"
grep -F 'executor.runAll' "$runner" >/dev/null
grep -F 'immutable authority v2' "$runner" "$frozen_input" >/dev/null
grep -F 'createReaderSummaryDailyFrozenOutputTextWiring' "$frozen_input" "$runner" >/dev/null
grep -F 'historical_omission' "$foundation" "$frozen_input" "$frozen_input_spec" >/dev/null
! grep -F 'PrismaFeedItemReadRepository' "$runner"
! grep -F 'PrismaReaderSummaryGitHubProjectionReader' "$runner"
grep -F 'daily-canonical-recovery-v4-staging' "$runner" >/dev/null
grep -F 'linkSync(file.staged, file.public)' "$runner" >/dev/null
grep -F 'PUBLICATION_PENDING' "$foundation" "$security" >/dev/null
grep -F 'pre_model_consumed_at' "$security" >/dev/null
grep -F 'SET search_path = pg_catalog' "$foundation" "$security" >/dev/null
! grep -Eiq '\bLOCK[[:space:]]+TABLE\b' "$foundation" "$security"
grep -F 'public."reader_summary_weekly_canonical_json"(v_day."canonical_record")' \
  "$foundation" >/dev/null
grep -F 'public."reader_summary_production_recovery_canonical_json"(' \
  "$foundation" >/dev/null
! grep -F 'reader_summary_weekly_canonical_json"(v_day."provider_evidence")' \
  "$foundation"
grep -F "(v_expected - 'legacyTotal') || jsonb_build_object('removedRss', v_removed_manifest_day)" \
  "$forward" >/dev/null
grep -F "'requestedUtcDates', jsonb_build_array(" "$foundation" >/dev/null
grep -F "'2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26'," "$foundation" >/dev/null
grep -F "'2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30'" "$foundation" >/dev/null
! grep -F 'reader-summary-daily-canonical-recovery-v4' \
  "$SCRIPT_DIR/production-runtime/social-monitor-weekly.service" \
  "$SCRIPT_DIR/production-runtime/social-monitor-weekly.timer" \
  "$SCRIPT_DIR/production-runtime/social-monitor-daily.service" \
  "$SCRIPT_DIR/production-runtime/daily-run.sh"
grep -F 'reader-summary-daily-canonical-recovery-v4' \
  "$SCRIPT_DIR/social-monitor-production-ssh-wrapper.sh" \
  "$SCRIPT_DIR/github-production-deploy-client.sh" >/dev/null
grep -F 'invalid-product-retry-set-v1' \
  "$SCRIPT_DIR/social-monitor-production-ssh-wrapper.sh" \
  "$SCRIPT_DIR/github-production-deploy-client.sh" \
  "$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.sh" \
  "$workflow" >/dev/null
grep -F 'daily_canonical_recovery_retry_set_token:' "$workflow" >/dev/null
grep -F 'daily_canonical_recovery_terminal_set_sha256:' "$workflow" >/dev/null
grep -F 'DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN == invalid-product-retry-set-v1' \
  "$workflow" >/dev/null
grep -F 'DAILY_CANONICAL_RECOVERY_TERMINAL_SET_SHA256 =~ ^[0-9a-f]{64}$' \
  "$workflow" >/dev/null
python3 - "$workflow" <<'PY'
import pathlib
import sys

source = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
start = source.index('          if [[ $MAINTENANCE_ACTION == reader-summary-daily-canonical-recovery-v4 ]]; then')
terminal_start = source.index(
    '          elif [[ $MAINTENANCE_ACTION == reader-summary-daily-terminal-set-receipt-v1 ]]; then',
    start,
)
else_start = source.index('\n          else\n', terminal_start)
else_end = source.index('\n          fi\n', else_start)
non_daily = source[else_start:else_end]
terminal = source[terminal_start:else_start]
guard = '[[ -z $DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN$DAILY_CANONICAL_RECOVERY_TERMINAL_SET_SHA256$DAILY_CANONICAL_RECOVERY_CONFIRMATION$DAILY_CANONICAL_RECOVERY_MODEL_JOB_IDENTITY$DAILY_CANONICAL_RECOVERY_AUTHORITY_SHA256 ]]'
if guard not in non_daily or non_daily.index(guard) > non_daily.index('github-production-deploy-client.sh maintenance'):
    raise SystemExit("non-daily maintenance must reject every daily recovery input before dispatch")
for required in (
    guard,
    'maintenance "$GITHUB_SHA"',
    'reader-summary-daily-terminal-set-receipt-v1 > "$receipt_path"',
    'validate-terminal-set-receipt "$receipt_path"',
):
    if required not in terminal:
        raise SystemExit(f"terminal-set receipt workflow is missing: {required}")
if not terminal.index(guard) < terminal.index('maintenance "$GITHUB_SHA"') < terminal.index('validate-terminal-set-receipt'):
    raise SystemExit("terminal-set receipt capture/validation order is unsafe")
PY
grep -F 'uses: actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f' "$workflow" >/dev/null
grep -F "name: reader-summary-daily-terminal-set-receipt-v1-\${{ github.run_id }}-\${{ github.run_attempt }}" "$workflow" >/dev/null
grep -F "path: \${{ runner.temp }}/reader-summary-daily-terminal-set-receipt-v1-\${{ github.run_id }}-\${{ github.run_attempt }}.json" "$workflow" >/dev/null
grep -F "if: \${{ inputs.maintenance_action == 'reader-summary-daily-terminal-set-receipt-v1' }}" "$workflow" >/dev/null
grep -F 'PostgresCanonicalRecoveryInvalidProductRetrySetAuthorizer' "$runner" >/dev/null
grep -F 'parseDailyCanonicalRecoveryV4Invocation(process.argv.slice(2))' "$runner" >/dev/null
grep -F 'recovery_command="set -eu; npm run run:reader-summary-daily-canonical-recovery -- $retry_set_token $terminal_set_sha256"' \
  "$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.sh" >/dev/null
grep -F 'if [[ $run_invalid_product_retry_set == true ]]; then' \
  "$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.sh" >/dev/null
grep -F 'elif [[ $run_bounded_maintenance == true ]]; then' \
  "$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.sh" >/dev/null
grep -F 'for bounded_run in 1 2 3 4' \
  "$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.sh" >/dev/null
grep -F 'run_reader_summary_daily_bounded_maintenance \' \
  "$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.sh" >/dev/null
grep -F 'timeout-minutes: 360' "$workflow" >/dev/null
grep -F 'npm run check:reader-summary-daily-canonical-recovery-postgres18' "$workflow" >/dev/null
grep -F 'npm run check:reader-summary-daily-canonical-recovery-production' "$workflow" >/dev/null
python3 - "$production_service" "$daily_run" <<'PY'
import pathlib
import sys

for raw_path in sys.argv[1:]:
    path = pathlib.Path(raw_path)
    source = path.read_text(encoding="utf-8")
    postgres = source.find("compose.postgres-runtime.yml")
    final_model = source.find("compose.agent-runtime-model.yml")
    if (
        postgres < 0
        or final_model < 0
        or postgres >= final_model
    ):
        raise SystemExit(f"final model Compose overlay order is invalid: {path}")
    if path == pathlib.Path(sys.argv[2]) and source.count(
        "compose.agent-runtime-model.yml"
    ) != 1:
        raise SystemExit("daily launcher includes the final model overlay more than once")

daily_source = pathlib.Path(sys.argv[2]).read_text(encoding="utf-8")
admission_lock = daily_source.find(
    '"$FLOCK_COMMAND" -w "$POSTGRES_ADMISSION_WAIT_SECONDS" 8'
)
auth_refresh = daily_source.find('"$ROOT/control/refresh-codex-auth.sh"')
auth_restart = daily_source.find('"${COMPOSE[@]}" restart agent-runtime')
reconcile_runtime = daily_source.find(
    '"${COMPOSE[@]}" --profile app up -d --no-deps agent-runtime'
)
daily_runner = daily_source.find(
    '"${COMPOSE[@]}" --profile daily run --rm --no-deps daily-runner'
)
ordered_steps = (
    admission_lock,
    auth_refresh,
    auth_restart,
    reconcile_runtime,
    daily_runner,
)
if any(step < 0 for step in ordered_steps) or ordered_steps != tuple(sorted(ordered_steps)):
    raise SystemExit(
        "daily launcher must reconcile agent-runtime after auth refresh and before daily-runner"
    )
PY

printf '%s\n' \
  'SYSTEM_DATABASE_URL=postgresql://system:password@postgres:5432/social_monitor' \
  'AGENT_RUNTIME_MODEL=gpt-5.5' \
  'AGENT_RUNTIME_READER_SUMMARY_MODEL=gpt-5.5' > "$stale_production_env"
cat > "$stale_control_compose" <<'YAML'
services:
  agent-runtime:
    environment:
      AGENT_RUNTIME_MODEL: gpt-5.5
  daily-runner:
    image: alpine:3.21
    environment:
      AGENT_RUNTIME_READER_SUMMARY_MODEL: gpt-5.5
YAML
(
  unset AGENT_RUNTIME_MODEL AGENT_RUNTIME_READER_SUMMARY_MODEL
  unset AGENT_RUNTIME_MODEL_OVERRIDE AGENT_RUNTIME_READER_SUMMARY_MODEL_OVERRIDE
  docker compose --env-file "$stale_production_env" -f "$compose" \
    -f "$stale_control_compose" -f "$postgres_runtime_compose" \
    -f "$final_runtime_model_compose" --profile app --profile daily \
    config --format json > "$stale_production_rendered"
)

printf '%s\n' \
  'AGENT_RUNTIME_MODEL=gpt-5.5' \
  'AGENT_RUNTIME_READER_SUMMARY_MODEL=gpt-5.5' \
  'AGENT_RUNTIME_MODEL_OVERRIDE=local-test-model' \
  'AGENT_RUNTIME_READER_SUMMARY_MODEL_OVERRIDE=local-test-model' > "$local_override_env"
(
  unset AGENT_RUNTIME_MODEL AGENT_RUNTIME_READER_SUMMARY_MODEL
  unset AGENT_RUNTIME_MODEL_OVERRIDE AGENT_RUNTIME_READER_SUMMARY_MODEL_OVERRIDE
  docker compose --env-file "$local_override_env" -f "$compose" --profile app \
    config --format json > "$local_override_rendered"
)

node --input-type=module - "$stale_production_rendered" "$local_override_rendered" <<'NODE'
import { readFileSync } from "node:fs";

const [staleProductionPath, localOverridePath] = process.argv.slice(2);
const expectedProductionModel = "gpt-5.6-sol";

const assertModels = (actualModels, expectedModel, scenario) => {
  for (const [name, actual] of Object.entries(actualModels)) {
    if (actual !== expectedModel || actual === "gpt-5.5") {
      throw new Error(
        `${scenario} rendered ${name} model as ${String(actual)}, expected ${expectedModel}`,
      );
    }
  }
};

const staleProduction = JSON.parse(readFileSync(staleProductionPath, "utf8"));
assertModels(
  {
    agentRuntime: staleProduction.services?.["agent-runtime"]?.environment?.AGENT_RUNTIME_MODEL,
    dailyReaderSummaryCaller:
      staleProduction.services?.["daily-runner"]?.environment?.AGENT_RUNTIME_READER_SUMMARY_MODEL,
  },
  expectedProductionModel,
  "final production overlay",
);

const localOverride = JSON.parse(readFileSync(localOverridePath, "utf8"));
assertModels(
  {
    agentRuntime: localOverride.services?.["agent-runtime"]?.environment?.AGENT_RUNTIME_MODEL,
    readerSummary: localOverride.services?.api?.environment?.AGENT_RUNTIME_READER_SUMMARY_MODEL,
  },
  "local-test-model",
  "explicit local/test override",
);
NODE

bash "$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.test.sh"
echo 'Daily canonical recovery production contract passed'
