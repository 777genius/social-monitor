#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO=$(cd "$SCRIPT_DIR/../.." && pwd)
LIBRARY=$SCRIPT_DIR/reader-summary-telemetry-migration-recovery-lib.sh
STATE_SQL=$SCRIPT_DIR/reader-summary-telemetry-migration-state.sql
PREFLIGHT=$SCRIPT_DIR/reader-summary-telemetry-failed-migration-preflight.sql
POSTFLIGHT=$SCRIPT_DIR/reader-summary-telemetry-migration-postflight.sql
ATTESTATION_AUTHORIZE=$SCRIPT_DIR/reader-summary-telemetry-recovery-attestation-authorize.sql
ATTESTATION_COMPLETE=$SCRIPT_DIR/reader-summary-telemetry-recovery-attestation-complete.sql
ATTESTATION_VERIFY=$SCRIPT_DIR/reader-summary-telemetry-recovery-attestation-verify.sql
PUBLICATION=$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh

fail() { return 1; }
# shellcheck source=ops/deploy/reader-summary-telemetry-migration-recovery-lib.sh
source "$LIBRARY"

run_case() (
  local initial=$1 authorization=${2:-authorized} after=${3:-resolved}
  local mark_status=${4:-0}
  local verify_count=0 guard_count=0 authorization_count=0 mark_count=0
  local postflight_count=0 migrate_count=0 complete_count=0 guard_active=false
  verify_reader_summary_telemetry_recovery_target() {
    verify_count=$((verify_count + 1))
  }
  reader_summary_telemetry_deployment_state() { printf '%s\n' "$initial"; }
  with_reader_summary_telemetry_database_guard() {
    guard_count=$((guard_count + 1)); guard_active=true
    authorize_reader_summary_telemetry_recovery || return
    mark_exact_reader_summary_telemetry_migration_rolled_back || return
    verify_reader_summary_telemetry_recovery_postflight || return
    "$@" || return
    complete_reader_summary_telemetry_recovery_attestation
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
  migration_batch() { migrate_count=$((migrate_count + 1)); }
  complete_reader_summary_telemetry_recovery_attestation() {
    [[ $guard_active == true ]] || return 74
    complete_count=$((complete_count + 1))
  }
  resolve_reader_summary_telemetry_migration_failure migration_batch || return
  printf '%s|%s|%s|%s|%s|%s|%s\n' "$verify_count" "$guard_count" \
    "$authorization_count" "$mark_count" "$postflight_count" \
    "$migrate_count" "$complete_count"
)

for state in clean corrected recovered; do
  [[ $(run_case "$state") == '1|0|0|0|0|1|0' ]]
done
if run_case resolved >/dev/null; then exit 1; fi
[[ $(run_case recovery-required) == '1|1|1|1|1|1|1' ]]
if run_case recovery-required denied >/dev/null; then exit 1; fi
if run_case recovery-required authorized invalid >/dev/null; then exit 1; fi
if run_case recovery-required authorized resolved 41 >/dev/null; then exit 1; fi
if run_case invalid >/dev/null; then exit 1; fi

run_watchdog_case() (
  local mode=$1 events=$2
  od() { printf '01 23 45 67 89 ab cd ef 01 23 45 67\n'; }
  reader_summary_telemetry_hold_database_guard() {
    printf 'guard-held|4321|2026-08-24 12:00:00+00|0123456789abcdef01234567\n'
    while true; do sleep 1; done
  }
  reader_summary_telemetry_release_database_guard() {
    kill "$guard_pid" 2>/dev/null || true
  }
  reader_summary_telemetry_assert_database_guard() { return 0; }
  reader_summary_telemetry_hold_mutation_lease() {
    printf 'mutation-held|4323|2026-08-24 12:00:01+00\n'
    while true; do sleep 1; done
  }
  reader_summary_telemetry_release_mutation_lease() {
    kill "$mutation_lease_pid" 2>/dev/null || true
  }
  reader_summary_telemetry_watch_database_guard() {
    printf 'watchdog-held|4322\n'
    case $mode in
      success|delayed_reconnect|quiet_gap)
        while kill -0 "$mutation_lease_pid" 2>/dev/null; do sleep 0.01; done
        ;;
      watcher_done) sleep 0.03 ;;
      during|second_backend|descendant_guard_loss) sleep 0.03; return 65 ;;
      after|boundary_race) sleep 0.1; return 65 ;;
      *) return 64 ;;
    esac
  }
  authorize_reader_summary_telemetry_recovery() { return 0; }
  verify_reader_summary_telemetry_recovery_postflight() { return 0; }
  complete_reader_summary_telemetry_recovery_attestation() { return 0; }
  mark_exact_reader_summary_telemetry_migration_rolled_back() {
    printf 'start\n' >>"$events"
    if [[ $mode == descendant_guard_loss ]]; then
      (sleep 0.15; printf 'mutation\n' >>"$events") &
      return 0
    fi
    if [[ $mode == after ]]; then printf 'mutation\n' >>"$events"; fi
    sleep 0.08
    if [[ $mode != after ]]; then printf 'mutation\n' >>"$events"; fi
  }
  migration_batch() { return 0; }
  with_reader_summary_telemetry_database_guard migration_batch
)

watchdog_events=$(mktemp)
mutated=$(mktemp)
trap 'rm -f -- "$watchdog_events" "$mutated"' EXIT
run_watchdog_case success "$watchdog_events"
[[ $(grep -c '^mutation$' "$watchdog_events") == 1 ]]
: >"$watchdog_events"
if run_watchdog_case watcher_done "$watchdog_events"; then exit 1; fi
: >"$watchdog_events"
if run_watchdog_case during "$watchdog_events"; then exit 1; fi
if grep -q '^mutation$' "$watchdog_events"; then exit 1; fi
: >"$watchdog_events"
if run_watchdog_case descendant_guard_loss "$watchdog_events"; then exit 1; fi
sleep 0.2
if grep -q '^mutation$' "$watchdog_events"; then exit 1; fi
: >"$watchdog_events"
if run_watchdog_case after "$watchdog_events"; then exit 1; fi
[[ $(grep -c '^mutation$' "$watchdog_events") == 1 ]]
for mode in delayed_reconnect quiet_gap; do
  : >"$watchdog_events"
  run_watchdog_case "$mode" "$watchdog_events"
  [[ $(grep -c '^mutation$' "$watchdog_events") == 1 ]]
done
for mode in second_backend boundary_race; do
  : >"$watchdog_events"
  if run_watchdog_case "$mode" "$watchdog_events"; then exit 1; fi
done

grep -F 'migration=20260824120000_reader_summary_daily_model_job_telemetry' \
  "$LIBRARY" >/dev/null
# shellcheck disable=SC2016
grep -F 'exec npx prisma migrate resolve --rolled-back "$migration"' \
  "$LIBRARY" >/dev/null
grep -F 'authorize_reader_summary_telemetry_recovery || return' "$LIBRARY" >/dev/null
grep -F 'verify_reader_summary_telemetry_recovery_postflight' "$LIBRARY" >/dev/null
grep -F 'with_reader_summary_telemetry_database_guard' "$LIBRARY" >/dev/null
grep -F 'pg_try_advisory_lock' "$LIBRARY" >/dev/null
grep -F 'social-monitor/telemetry-guard' "$LIBRARY" >/dev/null
grep -F 'social-monitor/telemetry-resolve' "$LIBRARY" >/dev/null
grep -F 'pg_terminate_backend(activity.pid)' "$LIBRARY" >/dev/null
grep -F 'pg_stat_clear_snapshot' "$LIBRARY" >/dev/null
grep -F 'watchdog-held|' "$LIBRARY" >/dev/null
grep -F 'mutation-held|' "$LIBRARY" >/dev/null
grep -F 'v_mutation_count' "$LIBRARY" >/dev/null
grep -F 'reader_summary_telemetry_assert_database_guard || return 65' \
  "$LIBRARY" >/dev/null
if grep -F 'v_quiet_ticks' "$LIBRARY" >/dev/null; then exit 1; fi
grep -F 'local target=${mutation_group:-$mutation_pid}' "$LIBRARY" >/dev/null
grep -F 'kill -KILL -- "-$target"' "$LIBRARY" >/dev/null
grep -F 'trap cleanup_reader_summary_telemetry_guard EXIT' "$LIBRARY" >/dev/null

grep -F 'v_normalized_logs IS DISTINCT FROM v_expected_logs' "$PREFLIGHT" >/dev/null
grep -F 'Database error code: 42501' "$PREFLIGHT" >/dev/null
grep -F 'routine: Some("aclcheck_error")' "$PREFLIGHT" >/dev/null
if grep -F 'logs ~*' "$PREFLIGHT" >/dev/null; then exit 1; fi
if grep -F "permission denied for schema public'" "$PREFLIGHT" >/dev/null; then
  echo 'broad telemetry log substring predicate survived' >&2
  exit 1
fi
grep -F 'v_guard_count <> 1' "$PREFLIGHT" >/dev/null
grep -F 'v_function_catalog_exact IS DISTINCT FROM TRUE' "$PREFLIGHT" >/dev/null
grep -F 'v_membership_catalog_exact IS DISTINCT FROM TRUE' "$PREFLIGHT" >/dev/null
grep -F 'complete role membership closure drifted' "$PREFLIGHT" >/dev/null
grep -F 'effective role/object privileges drifted' "$PREFLIGHT" >/dev/null
grep -F 'v_v2_functions <> 0' "$PREFLIGHT" >/dev/null
grep -F 'acl.grantee = v_definer' "$PREFLIGHT" >/dev/null
grep -F 'reader_summary_daily_model_jobs_identity_check' "$PREFLIGHT" >/dev/null
grep -F 'telemetry recovery production owner ACL invariants drifted' \
  "$PREFLIGHT" >/dev/null
grep -F 'telemetry recovery schema owner or exact nspacl drifted' \
  "$PREFLIGHT" >/dev/null
grep -F 'telemetry recovery relevant sequence owner, ACL, or default state drifted' \
  "$PREFLIGHT" >/dev/null
grep -F '5a256df7c312b06182ad56d4100df8c80067a7fd149aa34b4e3862e237502255' \
  "$PREFLIGHT" >/dev/null
grep -F 'ARRAY['"'"'INSERT'"'"','"'"'SELECT'"'"','"'"'UPDATE'"'"']::TEXT[]' \
  "$PREFLIGHT" >/dev/null
[[ $(sha256sum "$STATE_SQL" | cut -d' ' -f1) == \
  "$READER_SUMMARY_TELEMETRY_STATE_SHA256" ]]
[[ $(sha256sum "$PREFLIGHT" | cut -d' ' -f1) == \
  "$READER_SUMMARY_TELEMETRY_PREFLIGHT_SHA256" ]]
[[ $(sha256sum "$POSTFLIGHT" | cut -d' ' -f1) == \
  "$READER_SUMMARY_TELEMETRY_POSTFLIGHT_SHA256" ]]
[[ $(sha256sum "$ATTESTATION_AUTHORIZE" | cut -d' ' -f1) == \
  "$READER_SUMMARY_TELEMETRY_ATTESTATION_AUTHORIZE_SHA256" ]]
[[ $(sha256sum "$ATTESTATION_COMPLETE" | cut -d' ' -f1) == \
  "$READER_SUMMARY_TELEMETRY_ATTESTATION_COMPLETE_SHA256" ]]
[[ $(sha256sum "$ATTESTATION_VERIFY" | cut -d' ' -f1) == \
  "$READER_SUMMARY_TELEMETRY_ATTESTATION_VERIFY_SHA256" ]]
cp "$PREFLIGHT" "$mutated"
printf '%s\n' '-- appended mutation' >>"$mutated"
[[ $(sha256sum "$mutated" | cut -d' ' -f1) != \
  "$READER_SUMMARY_TELEMETRY_PREFLIGHT_SHA256" ]]

resolver_line=$(grep -nF 'resolve_reader_summary_telemetry_migration_failure \' \
  "$PUBLICATION" | cut -d: -f1)
migrate_line=$(grep -nF 'npm run migrate:deploy' "$PUBLICATION" | head -1 | cut -d: -f1)
[[ -n $resolver_line && -n $migrate_line && $migrate_line -lt $resolver_line ]]
grep -F 'apply_reader_summary_publication_migration_batch || return' \
  "$PUBLICATION" >/dev/null

printf 'Reader summary telemetry migration recovery library contract OK\n'
