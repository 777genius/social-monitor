#!/usr/bin/env bash

# Bounded forward-only handling for the reviewed original-cutoff P3009 row.
# The predecessor SQL is authenticated but is never executed by this helper.

READER_SUMMARY_ORIGINAL_CUTOFF_MIGRATION=20260731153000_reader_summary_production_recovery_original_cutoff_authority
READER_SUMMARY_ORIGINAL_CUTOFF_CORRECTED_CHECKSUM=4100dd4ae236a300e002d2599a880b27df50972aed2f4a9f33578a3da2fe5c35
READER_SUMMARY_ORIGINAL_CUTOFF_CORRECTION_MIGRATION=20260801130000_reader_summary_original_cutoff_consumed_state_correction
READER_SUMMARY_ORIGINAL_CUTOFF_CORRECTION_CHECKSUM=da638eae2183abefb22addbfbb9228cad67050d2817809289a53e13eb5447fc5

reader_summary_original_cutoff_target_has_correction() {
  local helper_relative=ops/deploy/reader-summary-original-cutoff-correction-lib.sh

  [[ ${sha:-} =~ ^[0-9a-f]{40}$ ]] || return 1
  git -C "$REPO" cat-file -e "$sha:$helper_relative" 2>/dev/null
}

verify_reader_summary_original_cutoff_target() {
  local migration_relative=prisma/migrations/$READER_SUMMARY_ORIGINAL_CUTOFF_MIGRATION/migration.sql
  local correction_relative=prisma/migrations/$READER_SUMMARY_ORIGINAL_CUTOFF_CORRECTION_MIGRATION/migration.sql
  local helper_relative=ops/deploy/reader-summary-original-cutoff-correction-lib.sh
  local probe_relative=ops/deploy/reader-summary-original-cutoff-failed-migration-preflight.sql
  local relative file canonical target_digest actual_digest
  local -a reviewed_paths=("$migration_relative" "$probe_relative")

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
    fi
  done
}

reader_summary_original_cutoff_probe() {
  local phase=$1
  local secret=$ROOT/secrets/db/reader-summary-publication-admin-url
  local ca_certificate=$ROOT/secrets/db/ca-certificate.crt
  local sql=$REPO/ops/deploy/reader-summary-original-cutoff-failed-migration-preflight.sql
  local query result expected

  [[ $phase == pre || $phase == resolved || $phase == post ]] ||
    fail 'reader summary original-cutoff probe phase is invalid'
  query=$(< "$sql") || return
  result=$(reader_summary_publication_run_postgres_client \
    "$secret" "$ca_certificate" \
    "social-monitor/original-cutoff-$phase" catalog \
    "$READER_SUMMARY_PUBLICATION_RUNTIME_ROLE" "$query") || return
  expected=clean
  [[ $phase != resolved ]] || expected=resolved
  [[ $phase != post ]] || expected=corrected
  if [[ $result == "$expected" || ($phase == pre && \
    ($result == resolve || $result == rollback || $result == apply)) ]]; then
    printf '%s\n' "$result"
    return 0
  fi
  return 65
}

resolve_reader_summary_original_cutoff_failure() {
  local secret=$ROOT/secrets/db/reader-summary-publication-admin-url
  local ca_certificate=$ROOT/secrets/db/ca-certificate.crt
  local action

  verify_reader_summary_original_cutoff_target || return
  action=$(reader_summary_original_cutoff_probe pre) || return
  [[ $action == resolve || $action == rollback || $action == apply ]] ||
    return 0

  # resolve is retained only for the legacy deterministic deploy harness.
  # shellcheck disable=SC2016 # Expansion occurs in the child shell.
  "${COMPOSE[@]}" --profile app run -T --rm --no-deps \
    --user 0:0 \
    -v "$secret:/run/secrets/reader-summary-publication-admin-url:ro" \
    -v "$ca_certificate:/run/social-monitor-db/ca-certificate.crt:ro" \
    migrate sh -c '
      set -eu
      set +x
      action=$1
      DATABASE_URL=$(cat /run/secrets/reader-summary-publication-admin-url)
      export DATABASE_URL
      case $action in
        resolve|rollback)
          npx prisma migrate resolve --rolled-back 20260731153000_reader_summary_production_recovery_original_cutoff_authority --schema prisma/schema.prisma
          ;;
        apply) ;;
        *) exit 64 ;;
      esac
      exec npx prisma migrate resolve --applied 20260731153000_reader_summary_production_recovery_original_cutoff_authority --schema prisma/schema.prisma
    ' _ "$action" || return

  [[ $(reader_summary_original_cutoff_probe resolved) == resolved ]]
}
