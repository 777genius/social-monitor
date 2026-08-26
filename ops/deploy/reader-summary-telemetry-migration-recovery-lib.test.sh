#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO=$(cd "$SCRIPT_DIR/../.." && pwd)
LIBRARY=$SCRIPT_DIR/reader-summary-telemetry-migration-recovery-lib.sh
STATE_SQL=$SCRIPT_DIR/reader-summary-telemetry-migration-state.sql
PREFLIGHT=$SCRIPT_DIR/reader-summary-telemetry-failed-migration-preflight.sql
POSTFLIGHT=$SCRIPT_DIR/reader-summary-telemetry-migration-postflight.sql
PUBLICATION=$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh

fail() { return 1; }
# shellcheck source=ops/deploy/reader-summary-telemetry-migration-recovery-lib.sh
source "$LIBRARY"

run_case() (
  local initial=$1 authorization=${2:-authorized} after=${3:-resolved}
  local mark_status=${4:-0}
  local verify_count=0 guard_count=0 authorization_count=0 mark_count=0
  local postflight_count=0 guard_active=false
  verify_reader_summary_telemetry_recovery_target() {
    verify_count=$((verify_count + 1))
  }
  reader_summary_telemetry_deployment_state() { printf '%s\n' "$initial"; }
  with_reader_summary_telemetry_database_guard() {
    guard_count=$((guard_count + 1)); guard_active=true
    "$@"
  }
  authorize_reader_summary_telemetry_recovery() {
    [[ $guard_active == true ]] || return 71
    authorization_count=$((authorization_count + 1))
    [[ $authorization == authorized ]]
  }
  mark_exact_reader_summary_telemetry_migration_rolled_back() {
    [[ $guard_active == true ]] || return 72
    mark_count=$((mark_count + 1)); return "$mark_status"
  }
  verify_reader_summary_telemetry_recovery_postflight() {
    [[ $guard_active == true ]] || return 73
    postflight_count=$((postflight_count + 1)); [[ $after == resolved ]]
  }
  resolve_reader_summary_telemetry_migration_failure || return
  printf '%s|%s|%s|%s|%s\n' "$verify_count" "$guard_count" \
    "$authorization_count" "$mark_count" "$postflight_count"
)

for state in clean corrected resolved recovered; do
  [[ $(run_case "$state") == '1|0|0|0|0' ]]
done
[[ $(run_case recovery-required) == '1|1|1|1|1' ]]
if run_case recovery-required denied >/dev/null; then exit 1; fi
if run_case recovery-required authorized invalid >/dev/null; then exit 1; fi
if run_case recovery-required authorized resolved 41 >/dev/null; then exit 1; fi
if run_case invalid >/dev/null; then exit 1; fi

grep -F 'migration=20260824120000_reader_summary_daily_model_job_telemetry' \
  "$LIBRARY" >/dev/null
# shellcheck disable=SC2016
grep -F 'exec npx prisma migrate resolve --rolled-back "$migration"' \
  "$LIBRARY" >/dev/null
grep -F 'authorize_reader_summary_telemetry_recovery || return' "$LIBRARY" >/dev/null
grep -F 'verify_reader_summary_telemetry_recovery_postflight' "$LIBRARY" >/dev/null
grep -F 'with_reader_summary_telemetry_database_guard' "$LIBRARY" >/dev/null
grep -F 'pg_try_advisory_lock' "$LIBRARY" >/dev/null
grep -F 'social-monitor/telemetry-migration-recovery-guard' "$LIBRARY" >/dev/null

grep -F 'v_normalized_logs IS DISTINCT FROM v_expected_logs' "$PREFLIGHT" >/dev/null
grep -F 'Database error code: 42501' "$PREFLIGHT" >/dev/null
grep -F 'routine: Some("aclcheck_error")' "$PREFLIGHT" >/dev/null
if grep -F 'logs ~*' "$PREFLIGHT" >/dev/null; then exit 1; fi
if grep -F "permission denied for schema public'" "$PREFLIGHT" >/dev/null; then
  echo 'broad telemetry log substring predicate survived' >&2
  exit 1
fi
grep -F 'v_guard_count <> 1' "$PREFLIGHT" >/dev/null
grep -F 'v_legacy_acl_exact IS DISTINCT FROM TRUE' "$PREFLIGHT" >/dev/null
grep -F 'v_membership_count <> 0' "$PREFLIGHT" >/dev/null
grep -F 'v_v2_functions <> 0' "$PREFLIGHT" >/dev/null
grep -F 'pg_catalog.has_schema_privilege(v_definer' "$PREFLIGHT" >/dev/null
grep -F 'reader_summary_daily_model_jobs_identity_check' "$PREFLIGHT" >/dev/null
grep -F 'telemetry recovery production owner ACL invariants drifted' \
  "$PREFLIGHT" >/dev/null
grep -F 'ARRAY['"'"'INSERT'"'"','"'"'SELECT'"'"','"'"'UPDATE'"'"']::TEXT[]' \
  "$PREFLIGHT" >/dev/null
if grep -F "ARRAY['DELETE'" "$PREFLIGHT" >/dev/null; then exit 1; fi

[[ $(sha256sum "$STATE_SQL" | cut -d' ' -f1) == \
  "$READER_SUMMARY_TELEMETRY_STATE_SHA256" ]]
[[ $(sha256sum "$PREFLIGHT" | cut -d' ' -f1) == \
  "$READER_SUMMARY_TELEMETRY_PREFLIGHT_SHA256" ]]
[[ $(sha256sum "$POSTFLIGHT" | cut -d' ' -f1) == \
  "$READER_SUMMARY_TELEMETRY_POSTFLIGHT_SHA256" ]]
mutated=$(mktemp)
trap 'rm -f -- "$mutated"' EXIT
cp "$PREFLIGHT" "$mutated"
printf '%s\n' '-- appended mutation' >>"$mutated"
[[ $(sha256sum "$mutated" | cut -d' ' -f1) != \
  "$READER_SUMMARY_TELEMETRY_PREFLIGHT_SHA256" ]]

resolver_line=$(grep -nF 'resolve_reader_summary_telemetry_migration_failure || return' \
  "$PUBLICATION" | cut -d: -f1)
migrate_line=$(grep -nF 'npm run migrate:deploy' "$PUBLICATION" | head -1 | cut -d: -f1)
[[ -n $resolver_line && -n $migrate_line && $resolver_line -lt $migrate_line ]]

printf 'Reader summary telemetry migration recovery library contract OK\n'
