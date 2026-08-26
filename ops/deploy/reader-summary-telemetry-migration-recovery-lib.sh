#!/usr/bin/env bash

# Bounded recovery for one exact telemetry migration failure. Ordinary state
# classification is deliberately separate from irreversible authorization.

READER_SUMMARY_TELEMETRY_MIGRATION=20260824120000_reader_summary_daily_model_job_telemetry
READER_SUMMARY_TELEMETRY_OLD_CHECKSUM=e3e5b65d71d47942513478849dd745835f16c72175eb2ef821e245af02b79cad
READER_SUMMARY_TELEMETRY_CORRECTED_CHECKSUM=575ece3521b26d769c5f65aae4d4a47ba33502695ac866030524319808812250
READER_SUMMARY_TELEMETRY_STATE_SHA256=1bd269baa017298e5eb75474b77f4f840b1fb15dbe433c95cc1bb48ed1672b99
READER_SUMMARY_TELEMETRY_PREFLIGHT_SHA256=523bcf89863ea490b7e24ca5c9fa87539d0751da25560dda6a667744f46840f0
READER_SUMMARY_TELEMETRY_POSTFLIGHT_SHA256=faa52162122f4eddf898cc01d6c5d573548df2721518fd9c12be979fd5f83829
READER_SUMMARY_TELEMETRY_GUARD_CLASSID=1936879981
READER_SUMMARY_TELEMETRY_GUARD_OBJID=1502026082
READER_SUMMARY_TELEMETRY_GUARD_APPLICATION=social-monitor/telemetry-migration-recovery-guard

verify_reader_summary_telemetry_recovery_target() {
  local migration_relative=prisma/migrations/$READER_SUMMARY_TELEMETRY_MIGRATION/migration.sql
  local relative file canonical target_digest actual_digest expected_digest
  local -a reviewed=(
    "$migration_relative"
    ops/deploy/reader-summary-telemetry-migration-state.sql
    ops/deploy/reader-summary-telemetry-failed-migration-preflight.sql
    ops/deploy/reader-summary-telemetry-migration-postflight.sql
  )

  [[ ${sha:-} =~ ^[0-9a-f]{40}$ ]] ||
    fail 'reader summary telemetry recovery target SHA is invalid'
  [[ $READER_SUMMARY_TELEMETRY_OLD_CHECKSUM =~ ^[0-9a-f]{64}$ ]] ||
    fail 'reader summary telemetry old checksum is invalid'
  for relative in "${reviewed[@]}"; do
    file=$REPO/$relative
    [[ -f $file && ! -L $file ]] ||
      fail 'reader summary telemetry recovery target file is unavailable'
    canonical=$(readlink -f -- "$file") ||
      fail 'reader summary telemetry recovery target file cannot be resolved'
    [[ $canonical == "$REPO/$relative" ]] ||
      fail 'reader summary telemetry recovery target file escapes the repository'
    target_digest=$(deploy_control_git_blob_digest "$sha" "$relative") ||
      fail 'reader summary telemetry recovery target blob is unavailable'
    actual_digest=$(deploy_control_file_digest "$canonical") ||
      fail 'reader summary telemetry recovery target file cannot be authenticated'
    [[ $actual_digest == "$target_digest" ]] ||
      fail 'reader summary telemetry recovery target file differs from target blob'
    case $relative in
      "$migration_relative") expected_digest=$READER_SUMMARY_TELEMETRY_CORRECTED_CHECKSUM ;;
      *-migration-state.sql) expected_digest=$READER_SUMMARY_TELEMETRY_STATE_SHA256 ;;
      *-failed-migration-preflight.sql) expected_digest=$READER_SUMMARY_TELEMETRY_PREFLIGHT_SHA256 ;;
      *-migration-postflight.sql) expected_digest=$READER_SUMMARY_TELEMETRY_POSTFLIGHT_SHA256 ;;
      *) return 65 ;;
    esac
    [[ $target_digest == "$expected_digest" ]] ||
      fail 'reader summary telemetry recovery SQL is not the exact reviewed blob'
  done
}

reader_summary_telemetry_query_file() {
  local sql=$1 application=$2 result query
  local secret=$ROOT/secrets/db/reader-summary-publication-admin-url
  local ca_certificate=$ROOT/secrets/db/ca-certificate.crt

  [[ -f $sql && ! -L $sql ]] || return 64
  query=$(< "$sql") || return
  result=$(reader_summary_publication_run_postgres_client \
    "$secret" "$ca_certificate" "$application" catalog \
    "$READER_SUMMARY_PUBLICATION_RUNTIME_ROLE" "$query") || return
  printf '%s\n' "$result"
}

reader_summary_telemetry_deployment_state() {
  local result
  result=$(reader_summary_telemetry_query_file \
    "$REPO/ops/deploy/reader-summary-telemetry-migration-state.sql" \
    social-monitor/telemetry-migration-state) || return
  case $result in
    clean|recovery-required|resolved|corrected|recovered) printf '%s\n' "$result" ;;
    *) return 65 ;;
  esac
}

authorize_reader_summary_telemetry_recovery() {
  [[ $(reader_summary_telemetry_query_file \
    "$REPO/ops/deploy/reader-summary-telemetry-failed-migration-preflight.sql" \
    social-monitor/telemetry-migration-recovery-authorization) == authorized ]]
}

verify_reader_summary_telemetry_recovery_postflight() {
  [[ $(reader_summary_telemetry_query_file \
    "$REPO/ops/deploy/reader-summary-telemetry-migration-postflight.sql" \
    social-monitor/telemetry-migration-recovery-postflight) == resolved ]]
}

reader_summary_telemetry_hold_database_guard() {
  local query
  local secret=$ROOT/secrets/db/reader-summary-publication-admin-url
  local ca_certificate=$ROOT/secrets/db/ca-certificate.crt
  query="DO \$guard\$ BEGIN
    IF NOT pg_catalog.pg_try_advisory_lock(
      $READER_SUMMARY_TELEMETRY_GUARD_CLASSID,
      $READER_SUMMARY_TELEMETRY_GUARD_OBJID
    ) THEN
      RAISE EXCEPTION 'telemetry recovery database guard is already held';
    END IF;
  END \$guard\$;
  SELECT 'guard-held';
  SELECT pg_catalog.pg_sleep(3600);"
  reader_summary_publication_run_postgres_client \
    "$secret" "$ca_certificate" "$READER_SUMMARY_TELEMETRY_GUARD_APPLICATION" \
    catalog "$READER_SUMMARY_PUBLICATION_RUNTIME_ROLE" "$query"
}

reader_summary_telemetry_release_database_guard() {
  local query result
  local secret=$ROOT/secrets/db/reader-summary-publication-admin-url
  local ca_certificate=$ROOT/secrets/db/ca-certificate.crt
  query="SELECT count(*) FROM pg_catalog.pg_stat_activity AS activity
    JOIN pg_catalog.pg_locks AS lock ON lock.pid = activity.pid
    WHERE activity.datname = pg_catalog.current_database()
      AND activity.application_name = '$READER_SUMMARY_TELEMETRY_GUARD_APPLICATION'
      AND lock.locktype = 'advisory'
      AND lock.classid = $READER_SUMMARY_TELEMETRY_GUARD_CLASSID::OID
      AND lock.objid = $READER_SUMMARY_TELEMETRY_GUARD_OBJID::OID
      AND lock.objsubid = 2 AND lock.granted
      AND pg_catalog.pg_terminate_backend(activity.pid);"
  result=$(reader_summary_publication_run_postgres_client \
    "$secret" "$ca_certificate" social-monitor/telemetry-migration-guard-release \
    catalog "$READER_SUMMARY_PUBLICATION_RUNTIME_ROLE" "$query") || return
  [[ $result == 1 ]]
}

with_reader_summary_telemetry_database_guard() (
  local output guard_pid='' ready=false attempt status=0 release_status=0
  umask 077
  output=$(mktemp "${TMPDIR:-/tmp}/reader-summary-telemetry-guard.XXXXXX") || return
  cleanup_reader_summary_telemetry_guard() {
    if [[ $ready == true ]]; then
      reader_summary_telemetry_release_database_guard >/dev/null 2>&1 || true
    fi
    if [[ -n $guard_pid ]]; then
      kill "$guard_pid" 2>/dev/null || true
      wait "$guard_pid" 2>/dev/null || true
    fi
    rm -f -- "$output"
  }
  trap cleanup_reader_summary_telemetry_guard EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
  reader_summary_telemetry_hold_database_guard >"$output" 2>&1 &
  guard_pid=$!
  for ((attempt = 0; attempt < 150; attempt++)); do
    if grep -Fxq 'guard-held' "$output"; then ready=true; break; fi
    kill -0 "$guard_pid" 2>/dev/null || return 65
    sleep 0.1
  done
  [[ $ready == true ]] || return 75
  "$@" || status=$?
  reader_summary_telemetry_release_database_guard >/dev/null 2>&1 || release_status=$?
  ready=false
  if ((release_status != 0)); then
    kill "$guard_pid" 2>/dev/null || true
  fi
  wait "$guard_pid" 2>/dev/null || true
  rm -f -- "$output"
  trap - EXIT HUP INT TERM
  ((release_status == 0)) || return 65
  return "$status"
)

mark_exact_reader_summary_telemetry_migration_rolled_back() {
  local secret=$ROOT/secrets/db/reader-summary-publication-admin-url
  local ca_certificate=$ROOT/secrets/db/ca-certificate.crt

  # shellcheck disable=SC2016 # Expansion occurs in the child shell.
  "${COMPOSE[@]}" --profile app run -T --rm --no-deps \
    --user 0:0 \
    -v "$secret:/run/secrets/reader-summary-publication-admin-url:ro" \
    -v "$ca_certificate:/run/social-monitor-db/ca-certificate.crt:ro" \
    migrate sh -c '
      set -eu
      set +x
      migration=20260824120000_reader_summary_daily_model_job_telemetry
      DATABASE_URL=$(cat /run/secrets/reader-summary-publication-admin-url)
      export DATABASE_URL
      exec npx prisma migrate resolve --rolled-back "$migration" \
        --schema prisma/schema.prisma
    '
}

mutate_exact_reader_summary_telemetry_recovery() {
  authorize_reader_summary_telemetry_recovery || return
  mark_exact_reader_summary_telemetry_migration_rolled_back || return
  verify_reader_summary_telemetry_recovery_postflight
}

resolve_reader_summary_telemetry_migration_failure() {
  local state
  verify_reader_summary_telemetry_recovery_target || return
  state=$(reader_summary_telemetry_deployment_state) || return
  case $state in
    clean|corrected|resolved|recovered) return 0 ;;
    recovery-required)
      with_reader_summary_telemetry_database_guard \
        mutate_exact_reader_summary_telemetry_recovery
      ;;
    *) return 65 ;;
  esac
}
