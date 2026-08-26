#!/usr/bin/env bash

# Bounded recovery for the one telemetry migration whose reviewed bytes changed.
# No caller may select a migration name, checksum, or Prisma resolution mode.

READER_SUMMARY_TELEMETRY_MIGRATION=20260824120000_reader_summary_daily_model_job_telemetry
READER_SUMMARY_TELEMETRY_OLD_CHECKSUM=e3e5b65d71d47942513478849dd745835f16c72175eb2ef821e245af02b79cad
READER_SUMMARY_TELEMETRY_CORRECTED_CHECKSUM=575ece3521b26d769c5f65aae4d4a47ba33502695ac866030524319808812250

verify_reader_summary_telemetry_recovery_target() {
  local migration_relative=prisma/migrations/$READER_SUMMARY_TELEMETRY_MIGRATION/migration.sql
  local probe_relative=ops/deploy/reader-summary-telemetry-failed-migration-preflight.sql
  local relative file canonical target_digest actual_digest

  [[ ${sha:-} =~ ^[0-9a-f]{40}$ ]] ||
    fail 'reader summary telemetry recovery target SHA is invalid'
  for relative in "$migration_relative" "$probe_relative"; do
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
    if [[ $relative == "$migration_relative" ]]; then
      [[ $target_digest == "$READER_SUMMARY_TELEMETRY_CORRECTED_CHECKSUM" ]] ||
        fail 'reader summary telemetry corrected migration is not reviewed'
    else
      grep -Fq "$READER_SUMMARY_TELEMETRY_OLD_CHECKSUM" "$canonical" &&
        grep -Fq "$READER_SUMMARY_TELEMETRY_CORRECTED_CHECKSUM" "$canonical" ||
        fail 'reader summary telemetry recovery probe lacks reviewed checksums'
    fi
  done
}

reader_summary_telemetry_recovery_probe() {
  local secret=$ROOT/secrets/db/reader-summary-publication-admin-url
  local ca_certificate=$ROOT/secrets/db/ca-certificate.crt
  local sql=$REPO/ops/deploy/reader-summary-telemetry-failed-migration-preflight.sql
  local query result

  query=$(< "$sql") || return
  result=$(reader_summary_publication_run_postgres_client \
    "$secret" "$ca_certificate" social-monitor/telemetry-migration-recovery \
    catalog "$READER_SUMMARY_PUBLICATION_RUNTIME_ROLE" "$query") || return
  case $result in
    clean|resolve|resolved|corrected) printf '%s\n' "$result" ;;
    *) return 65 ;;
  esac
}

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

resolve_reader_summary_telemetry_migration_failure() {
  local action

  verify_reader_summary_telemetry_recovery_target || return
  action=$(reader_summary_telemetry_recovery_probe) || return
  case $action in
    clean|corrected) return 0 ;;
    resolved) return 0 ;;
    resolve)
      mark_exact_reader_summary_telemetry_migration_rolled_back || return
      [[ $(reader_summary_telemetry_recovery_probe) == resolved ]]
      ;;
    *) return 65 ;;
  esac
}
