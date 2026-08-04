#!/usr/bin/env bash

# Bounded forward-only handling for the reviewed original-cutoff P3009 row.
# The predecessor SQL is authenticated but is never executed by this helper.

READER_SUMMARY_ORIGINAL_CUTOFF_MIGRATION=20260731153000_reader_summary_production_recovery_original_cutoff_authority
READER_SUMMARY_ORIGINAL_CUTOFF_CORRECTED_CHECKSUM=4100dd4ae236a300e002d2599a880b27df50972aed2f4a9f33578a3da2fe5c35
READER_SUMMARY_ORIGINAL_CUTOFF_CORRECTION_MIGRATION=20260801130000_reader_summary_original_cutoff_consumed_state_correction
READER_SUMMARY_ORIGINAL_CUTOFF_CORRECTION_CHECKSUM=d26709b51ab37d368add42732b4c9fc8c70a56894ec9afdaec417408d4822dbc
READER_SUMMARY_DAILY_ACTIVATION_ACL_MIGRATION=20260802143100_reader_summary_daily_execution_publication_activation_acl
READER_SUMMARY_WEEKLY_REVIEW_MANIFEST_MIGRATION=20260802170000_reader_summary_weekly_review_manifest
READER_SUMMARY_DAILY_CANONICAL_RECOVERY_V4_MIGRATION=20260802233000_reader_summary_daily_canonical_recovery_v4
READER_SUMMARY_DAILY_EXECUTION_TENANT_RLS_MIGRATION=20260803174000_reader_summary_daily_execution_tenant_rls
READER_SUMMARY_DAILY_V4_FORWARD_MIGRATION=20260804110000_reader_summary_daily_v4_original_cutoff_forward_correction
READER_SUMMARY_DAILY_V4_FORWARD_NEW_CHECKSUM=8000636562c896e41d1af2b892aef08862fc5f0e94741ec3ce07567f77016f4f

reader_summary_original_cutoff_target_has_correction() {
  local helper_relative=ops/deploy/reader-summary-original-cutoff-correction-lib.sh

  [[ ${sha:-} =~ ^[0-9a-f]{40}$ ]] || return 1
  git -C "$REPO" cat-file -e "$sha:$helper_relative" 2>/dev/null
}

verify_reader_summary_original_cutoff_target() {
  local migration_relative=prisma/migrations/$READER_SUMMARY_ORIGINAL_CUTOFF_MIGRATION/migration.sql
  local correction_relative=prisma/migrations/$READER_SUMMARY_ORIGINAL_CUTOFF_CORRECTION_MIGRATION/migration.sql
  local forward_relative=prisma/migrations/$READER_SUMMARY_DAILY_V4_FORWARD_MIGRATION/migration.sql
  local helper_relative=ops/deploy/reader-summary-original-cutoff-correction-lib.sh
  local probe_relative=ops/deploy/reader-summary-original-cutoff-failed-migration-preflight.sql
  local relative file canonical target_digest actual_digest
  local -a reviewed_paths=("$migration_relative" "$probe_relative" "$forward_relative")

  [[ ${sha:-} =~ ^[0-9a-f]{40}$ ]] ||
    fail 'reader summary original-cutoff target SHA is invalid'
  if reader_summary_original_cutoff_target_has_correction; then
    reviewed_paths+=("$helper_relative" "$correction_relative")
  fi
  for relative in "${reviewed_paths[@]}"; do
    file=$REPO/$relative
    [[ -f $file && ! -L $file ]] ||
      fail 'reader summary original-cutoff target file is unavailable'
    canonical=$(readlink -f -- "$file") ||
      fail 'reader summary original-cutoff target file cannot be resolved'
    [[ $canonical == "$REPO/$relative" ]] ||
      fail 'reader summary original-cutoff target file escapes the repository'
    target_digest=$(deploy_control_git_blob_digest "$sha" "$relative") ||
      fail 'reader summary original-cutoff target blob is unavailable'
    actual_digest=$(deploy_control_file_digest "$canonical") ||
      fail 'reader summary original-cutoff target file cannot be authenticated'
    [[ $actual_digest == "$target_digest" ]] ||
      fail 'reader summary original-cutoff target file differs from target blob'
    if [[ $relative == "$migration_relative" ]]; then
      [[ $target_digest == "$READER_SUMMARY_ORIGINAL_CUTOFF_CORRECTED_CHECKSUM" ]] ||
        fail 'reader summary original-cutoff corrected migration is not reviewed'
    elif [[ $relative == "$correction_relative" ]]; then
      [[ $target_digest == "$READER_SUMMARY_ORIGINAL_CUTOFF_CORRECTION_CHECKSUM" ]] ||
        fail 'reader summary original-cutoff correction migration is not reviewed'
    elif [[ $relative == "$forward_relative" ]]; then
      [[ $target_digest == "$READER_SUMMARY_DAILY_V4_FORWARD_NEW_CHECKSUM" ]] ||
        fail 'reader summary daily V4 forward migration is not the reviewed new blob'
    fi
  done
}

reader_summary_original_cutoff_probe() {
  local phase=$1
  local secret=$ROOT/secrets/db/reader-summary-publication-admin-url
  local ca_certificate=$ROOT/secrets/db/ca-certificate.crt
  local sql=$REPO/ops/deploy/reader-summary-original-cutoff-failed-migration-preflight.sql
  local query result expected

  [[ $phase == pre || $phase == resolved || $phase == forward-resolved || $phase == post ]] ||
    fail 'reader summary original-cutoff probe phase is invalid'
  query=$(< "$sql") || return
  result=$(reader_summary_publication_run_postgres_client \
    "$secret" "$ca_certificate" \
    "social-monitor/original-cutoff-$phase" catalog \
    "$READER_SUMMARY_PUBLICATION_RUNTIME_ROLE" "$query") || return
  expected=clean
  [[ $phase != resolved ]] || expected=resolved
  [[ $phase != forward-resolved ]] || expected=forward-resolved
  [[ $phase != post ]] || expected=corrected
  if [[ $result == "$expected" || ($phase == pre && \
    ($result == rollback || $result == apply || \
      $result == correction-rollback || \
      $result == activation-acl-rollback || \
      $result == weekly-manifest-rollback || \
      $result == daily-canonical-v4-rollback || \
      $result == daily-execution-rls-rollback || \
      $result == daily-v4-forward-current-rollback)) ]]; then
    printf '%s\n' "$result"
    return 0
  fi
  return 65
}

run_reader_summary_original_cutoff_prisma_resolve() {
  local resolution=$1
  local migration=${2:-$READER_SUMMARY_ORIGINAL_CUTOFF_MIGRATION}
  local secret=$ROOT/secrets/db/reader-summary-publication-admin-url
  local ca_certificate=$ROOT/secrets/db/ca-certificate.crt

  [[ $resolution == rolled-back || $resolution == applied ]] || return 64
  [[ $migration == "$READER_SUMMARY_ORIGINAL_CUTOFF_MIGRATION" || \
    $migration == "$READER_SUMMARY_ORIGINAL_CUTOFF_CORRECTION_MIGRATION" || \
    $migration == "$READER_SUMMARY_DAILY_ACTIVATION_ACL_MIGRATION" || \
    $migration == "$READER_SUMMARY_WEEKLY_REVIEW_MANIFEST_MIGRATION" || \
    $migration == "$READER_SUMMARY_DAILY_CANONICAL_RECOVERY_V4_MIGRATION" || \
    $migration == "$READER_SUMMARY_DAILY_EXECUTION_TENANT_RLS_MIGRATION" || \
    $migration == "$READER_SUMMARY_DAILY_V4_FORWARD_MIGRATION" ]] || \
    return 64
  # shellcheck disable=SC2016 # Expansion occurs in the child shell.
  "${COMPOSE[@]}" --profile app run -T --rm --no-deps \
    --user 0:0 \
    -v "$secret:/run/secrets/reader-summary-publication-admin-url:ro" \
    -v "$ca_certificate:/run/social-monitor-db/ca-certificate.crt:ro" \
    migrate sh -c '
      set -eu
      set +x
      resolution=$1
      migration=$2
      DATABASE_URL=$(cat /run/secrets/reader-summary-publication-admin-url)
      export DATABASE_URL
      case $resolution in
        rolled-back) flag=--rolled-back ;;
        applied) flag=--applied ;;
        *) exit 64 ;;
      esac
      exec npx prisma migrate resolve "$flag" "$migration" \
        --schema prisma/schema.prisma
    ' _ "$resolution" "$migration"
}

resolve_reader_summary_original_cutoff_failure() {
  local action

  verify_reader_summary_original_cutoff_target || return
  action=$(reader_summary_original_cutoff_probe pre) || return
  # The reviewed failed forward row is resolved only by its exact migration id.
  if [[ $action == daily-v4-forward-current-rollback ]]; then
    run_reader_summary_original_cutoff_prisma_resolve rolled-back \
      "$READER_SUMMARY_DAILY_V4_FORWARD_MIGRATION" || return
    [[ $(reader_summary_original_cutoff_probe forward-resolved) == forward-resolved ]]
    return
  fi
  if [[ $action == daily-execution-rls-rollback ]]; then
    run_reader_summary_original_cutoff_prisma_resolve rolled-back \
      "$READER_SUMMARY_DAILY_EXECUTION_TENANT_RLS_MIGRATION" || return
    [[ $(reader_summary_original_cutoff_probe pre) == clean ]]
    return
  fi
  if [[ $action == daily-canonical-v4-rollback ]]; then
    run_reader_summary_original_cutoff_prisma_resolve rolled-back \
      "$READER_SUMMARY_DAILY_CANONICAL_RECOVERY_V4_MIGRATION" || return
    [[ $(reader_summary_original_cutoff_probe pre) == clean ]]
    return
  fi
  if [[ $action == weekly-manifest-rollback ]]; then
    run_reader_summary_original_cutoff_prisma_resolve rolled-back \
      "$READER_SUMMARY_WEEKLY_REVIEW_MANIFEST_MIGRATION" || return
    [[ $(reader_summary_original_cutoff_probe pre) == clean ]]
    return
  fi
  if [[ $action == activation-acl-rollback ]]; then
    run_reader_summary_original_cutoff_prisma_resolve rolled-back \
      "$READER_SUMMARY_DAILY_ACTIVATION_ACL_MIGRATION" || return
    [[ $(reader_summary_original_cutoff_probe pre) == clean ]]
    return
  fi
  if [[ $action == correction-rollback ]]; then
    run_reader_summary_original_cutoff_prisma_resolve rolled-back \
      "$READER_SUMMARY_ORIGINAL_CUTOFF_CORRECTION_MIGRATION" || return
    [[ $(reader_summary_original_cutoff_probe pre) == clean ]]
    return
  fi
  [[ $action == rollback || $action == apply ]] ||
    return 0

  if [[ $action == rollback ]]; then
    run_reader_summary_original_cutoff_prisma_resolve rolled-back || return
    action=$(reader_summary_original_cutoff_probe pre) || return
    [[ $action == apply ]] || return 65
  fi
  run_reader_summary_original_cutoff_prisma_resolve applied || return

  [[ $(reader_summary_original_cutoff_probe resolved) == resolved ]]
}
