#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO=$(cd "$SCRIPT_DIR/../.." && pwd)
foundation=$REPO/prisma/migrations/20260802233000_reader_summary_daily_canonical_recovery_v4/migration.sql
security=$REPO/prisma/migrations/20260802233100_reader_summary_daily_canonical_recovery_v4_security/migration.sql
runner=$REPO/scripts/run-reader-summary-daily-canonical-recovery.ts
package_json=$REPO/package.json
workflow=$REPO/.github/workflows/production-deploy.yml
frozen_input=$REPO/scripts/lib/reader-summary-daily-frozen-publication-input.ts
frozen_input_spec=$REPO/scripts/lib/reader-summary-daily-frozen-publication-input.spec.ts

[[ -f $foundation && -f $security && -f $runner && -f $frozen_input && -f $frozen_input_spec ]]
[[ ! -e $REPO/scripts/lib/reader-summary-daily-frozen-authority-projection.ts ]]
[[ ! -e $REPO/prisma/migrations/20260802180000_reader_summary_daily_canonical_recovery_v4 ]]
mapfile -t v4_migrations < <(compgen -G "$REPO/prisma/migrations/*daily_canonical_recovery_v4*" || true)
[[ ${#v4_migrations[@]} == 2 ]]
[[ ${v4_migrations[0]} == *20260802233000_reader_summary_daily_canonical_recovery_v4 || ${v4_migrations[1]} == *20260802233000_reader_summary_daily_canonical_recovery_v4 ]]
[[ ${v4_migrations[0]} == *20260802233100_reader_summary_daily_canonical_recovery_v4_security || ${v4_migrations[1]} == *20260802233100_reader_summary_daily_canonical_recovery_v4_security ]]
grep -F 'run:reader-summary-daily-canonical-recovery' "$package_json" >/dev/null
grep -F 'run:reader-summary-daily-canonical-recovery": "node scripts/run-with-timeout.mjs --timeout-ms 19800000' "$package_json" >/dev/null
grep -F 'run:reader-summary-weekly-production": "node scripts/run-with-timeout.mjs --timeout-ms 14400000' "$package_json" >/dev/null
grep -F 'GrpcReaderSummaryDailyCanonicalRecoveryRuntime' "$runner" >/dev/null
grep -F 'PrismaReaderSummaryDailyCanonicalRecoveryV4Finalization' "$runner" >/dev/null
grep -F 'PostgresCanonicalRecoveryAuthority' "$runner" >/dev/null
grep -F 'required("SYSTEM_DATABASE_URL")' "$runner" >/dev/null
! grep -F 'required("DATABASE_URL")' "$runner" >/dev/null
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
grep -F "'requestedUtcDates', jsonb_build_array(" "$foundation" >/dev/null
grep -F "'2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26'," "$foundation" >/dev/null
grep -F "'2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30'" "$foundation" >/dev/null
! grep -F 'reader-summary-daily-canonical-recovery-v4' \
  "$SCRIPT_DIR/production-runtime/social-monitor-weekly.service" \
  "$SCRIPT_DIR/production-runtime/social-monitor-weekly.timer" \
  "$SCRIPT_DIR/production-runtime/social-monitor-daily.service" \
  "$SCRIPT_DIR/production-runtime/daily-run.sh"
grep -F 'reader-summary-daily-canonical-recovery-v4' \
  "$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.sh" >/dev/null
grep -F 'DAILY_CANONICAL_RECOVERY_CONFIRMATION=reader-summary-daily-canonical-recovery-v4' \
  "$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.sh" >/dev/null
grep -F 'daily_canonical_recovery_confirmation:' "$workflow" >/dev/null
grep -F 'timeout-minutes: 360' "$workflow" >/dev/null
grep -F 'npm run check:reader-summary-daily-canonical-recovery-postgres18' "$workflow" >/dev/null
grep -F 'npm run check:reader-summary-daily-canonical-recovery-production' "$workflow" >/dev/null

bash "$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.test.sh"
echo 'Daily canonical recovery production contract passed'
