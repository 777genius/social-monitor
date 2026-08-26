#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO=$(cd "$SCRIPT_DIR/../.." && pwd)
LIBRARY=$SCRIPT_DIR/reader-summary-telemetry-migration-recovery-lib.sh
PROBE=$SCRIPT_DIR/reader-summary-telemetry-failed-migration-preflight.sql
PUBLICATION=$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh

fail() { return 1; }
# shellcheck source=ops/deploy/reader-summary-telemetry-migration-recovery-lib.sh
source "$LIBRARY"

run_case() (
  local initial=$1 after=${2:-} mark_status=${3:-0}
  local mark_count=0 verify_count=0
  verify_reader_summary_telemetry_recovery_target() { verify_count=$((verify_count + 1)); }
  reader_summary_telemetry_recovery_probe() {
    if ((mark_count == 0)); then printf '%s\n' "$initial"; else printf '%s\n' "$after"; fi
  }
  mark_exact_reader_summary_telemetry_migration_rolled_back() {
    mark_count=$((mark_count + 1)); return "$mark_status"
  }
  resolve_reader_summary_telemetry_migration_failure || return
  printf '%s|%s\n' "$verify_count" "$mark_count"
)

[[ $(run_case clean) == '1|0' ]]
[[ $(run_case corrected) == '1|0' ]]
[[ $(run_case resolved) == '1|0' ]]
[[ $(run_case resolve resolved) == '1|1' ]]
if run_case resolve clean >/dev/null; then exit 1; fi
if run_case resolve resolved 41 >/dev/null; then exit 1; fi
if run_case unexpected >/dev/null; then exit 1; fi

grep -F 'migration=20260824120000_reader_summary_daily_model_job_telemetry' "$LIBRARY" >/dev/null
# shellcheck disable=SC2016
grep -F 'exec npx prisma migrate resolve --rolled-back "$migration"' "$LIBRARY" >/dev/null
if grep -E 'mark_exact_reader_summary_telemetry_migration_rolled_back\(\).*\$[12]' \
  "$LIBRARY" >/dev/null; then exit 1; fi
grep -F "$READER_SUMMARY_TELEMETRY_OLD_CHECKSUM" "$PROBE" >/dev/null
grep -F "$READER_SUMMARY_TELEMETRY_CORRECTED_CHECKSUM" "$PROBE" >/dev/null
grep -F "logs ~* 'permission denied for schema public'" "$PROBE" >/dev/null
grep -F 'applied_steps_count = 0' "$PROBE" >/dev/null
grep -F 'v_unfinished <> v_old_unfinished' "$PROBE" >/dev/null
grep -F 'telemetry recovery transaction rollback invariants drifted' "$PROBE" >/dev/null
grep -F 'telemetry recovery production owner ACL invariants drifted' "$PROBE" >/dev/null
grep -F "ARRAY['INSERT','SELECT','UPDATE']::TEXT[]" "$PROBE" >/dev/null
if grep -F "ARRAY['DELETE'" "$PROBE" >/dev/null; then exit 1; fi

resolver_line=$(grep -nF 'resolve_reader_summary_telemetry_migration_failure || return' \
  "$PUBLICATION" | cut -d: -f1)
migrate_line=$(grep -nF 'npm run migrate:deploy' "$PUBLICATION" | head -1 | cut -d: -f1)
[[ -n $resolver_line && -n $migrate_line && $resolver_line -lt $migrate_line ]]

printf 'Reader summary telemetry migration recovery library contract OK\n'
