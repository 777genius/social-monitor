#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ENTRYPOINT=$SCRIPT_DIR/verify-postgres-backup-coverage.sh
CLASSIFIER=$SCRIPT_DIR/postgres-backup-deploy-lib.sh
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/social-monitor-backup-coverage-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

ROLLED_BACK_FILTER=$(awk '
  /count\(\*\) FILTER \(/ { filter_number++ }
  filter_number == 3 { print }
  /\) AS rolled_back,/ { exit }
' "$CLASSIFIER")
for predicate in \
  'WHERE started_at IS NOT NULL' 'AND finished_at IS NULL' \
  'AND rolled_back_at IS NOT NULL' 'AND rolled_back_at >= started_at' \
  'AND applied_steps_count = 0' "AND id <> ''" \
  "AND checksum ~ '^[0-9a-f]{64}$'" \
  "AND checksum <> :'migration_checksum'" 'AND logs IS NULL'; do
  grep -F "$predicate" <<< "$ROLLED_BACK_FILTER" >/dev/null
done
! grep -F 'btrim(logs)' <<< "$ROLLED_BACK_FILTER" >/dev/null

cat > "$FIXTURE/first-deploy-schema.txt" <<'TEXT'
_prisma_migrations
tenants
workspaces
source_items
feed_items
reader_summary_artifacts
outbox_events
inbox_records
idempotency_keys
TEXT
cat > "$FIXTURE/first-deploy-listing.txt" <<'TEXT'
;
; Archive created by pg_dump
;
1; 0 1 TABLE DATA public _prisma_migrations owner
2; 0 2 TABLE DATA public tenants owner
3; 0 3 TABLE DATA public workspaces owner
4; 0 4 TABLE DATA public source_items owner
5; 0 5 TABLE DATA public feed_items owner
6; 0 6 TABLE DATA public reader_summary_artifacts owner
7; 0 7 TABLE DATA public outbox_events owner
8; 0 8 TABLE DATA public inbox_records owner
9; 0 9 TABLE DATA public idempotency_keys owner
TEXT

write_migration_state() {
  local path=$1 total=$2 completed=$3 failed=$4 rolled_back=$5
  local in_progress=$6 contradictory=$7 exact_hex=$8
  printf 'reader-summary-publication-migration-state-v1\t%s\t%s\t%s\t%s\t%s\t%s\nexact-hex=%s\n' \
    "$total" "$completed" "$failed" "$rolled_back" "$in_progress" \
    "$contradictory" "$exact_hex" > "$path"
}

NOT_APPLIED_STATE=$FIXTURE/migration-not-applied.txt
COMPLETED_STATE=$FIXTURE/migration-completed.txt
ROLLED_BACK_STATE=$FIXTURE/migration-rolled-back.txt
RETRY_COMPLETED_STATE=$FIXTURE/migration-retry-completed.txt
write_migration_state "$NOT_APPLIED_STATE" 0 0 0 0 0 0 5b5d
write_migration_state "$COMPLETED_STATE" 1 1 0 0 0 0 \
  7b22636f6d706c65746564223a747275657d
write_migration_state "$ROLLED_BACK_STATE" 1 0 0 1 0 0 \
  7b22726f6c6c6564223a747275657d
write_migration_state "$RETRY_COMPLETED_STATE" 2 1 0 1 0 0 5b7b7d2c7b7d5d

assert_pre_state_rejected() {
  local name=$1 schema=$2 state=$3
  if bash "$ENTRYPOINT" "$schema" "$state" >/dev/null 2>&1; then
    echo "$name publication migration state was accepted" >&2
    exit 1
  fi
}

schema_output=$(bash "$ENTRYPOINT" "$FIXTURE/first-deploy-schema.txt" \
  "$NOT_APPLIED_STATE")
grep -Fx \
  'database-backup-schema-verified=9 publication-schema=absent publication-migration=not-applied' \
  <<< "$schema_output" >/dev/null
output=$(bash "$ENTRYPOINT" "$FIXTURE/first-deploy-schema.txt" \
  "$NOT_APPLIED_STATE" "$FIXTURE/first-deploy-listing.txt" \
  "$FIXTURE/first-deploy-schema.txt" "$NOT_APPLIED_STATE")
grep -Fx \
  'database-backup-relations-verified=9 publication-schema=absent publication-migration=not-applied' \
  <<< "$output" >/dev/null
output=$(bash "$ENTRYPOINT" "$FIXTURE/first-deploy-schema.txt" \
  "$ROLLED_BACK_STATE" "$FIXTURE/first-deploy-listing.txt" \
  "$FIXTURE/first-deploy-schema.txt" "$ROLLED_BACK_STATE")
grep -Fx \
  'database-backup-relations-verified=9 publication-schema=absent publication-migration=retry-pending' \
  <<< "$output" >/dev/null

cp "$FIXTURE/first-deploy-schema.txt" "$FIXTURE/upgrade-schema.txt"
printf '%s\n' reader_summary_publications \
  reader_summary_publication_slots >> "$FIXTURE/upgrade-schema.txt"
cp "$FIXTURE/first-deploy-listing.txt" "$FIXTURE/upgrade-listing.txt"
cat >> "$FIXTURE/upgrade-listing.txt" <<'TEXT'
10; 0 10 TABLE DATA public reader_summary_publications owner
11; 0 11 TABLE DATA public reader_summary_publication_slots owner
TEXT
output=$(bash "$ENTRYPOINT" "$FIXTURE/upgrade-schema.txt" \
  "$COMPLETED_STATE" "$FIXTURE/upgrade-listing.txt" \
  "$FIXTURE/upgrade-schema.txt" "$COMPLETED_STATE")
grep -Fx \
  'database-backup-relations-verified=11 publication-schema=present publication-migration=completed' \
  <<< "$output" >/dev/null
output=$(bash "$ENTRYPOINT" "$FIXTURE/upgrade-schema.txt" \
  "$RETRY_COMPLETED_STATE" "$FIXTURE/upgrade-listing.txt" \
  "$FIXTURE/upgrade-schema.txt" "$RETRY_COMPLETED_STATE")
grep -Fx \
  'database-backup-relations-verified=11 publication-schema=present publication-migration=retry-completed' \
  <<< "$output" >/dev/null

FAILED_STATE=$FIXTURE/migration-failed.txt
IN_PROGRESS_STATE=$FIXTURE/migration-in-progress.txt
DUPLICATE_STATE=$FIXTURE/migration-duplicate.txt
CONTRADICTORY_STATE=$FIXTURE/migration-contradictory.txt
CHECKSUM_MISMATCH_STATE=$FIXTURE/migration-checksum-mismatch.txt
EXTRA_ROW_STATE=$FIXTURE/migration-extra-row.txt
write_migration_state "$FAILED_STATE" 1 0 1 0 0 0 \
  7b226661696c6564223a747275657d
write_migration_state "$IN_PROGRESS_STATE" 1 0 0 0 1 0 \
  7b2272756e6e696e67223a747275657d
write_migration_state "$DUPLICATE_STATE" 2 2 0 0 0 0 5b7b7d2c7b7d5d
write_migration_state "$CONTRADICTORY_STATE" 1 0 0 0 0 1 \
  7b2266696e6973686564416e64526f6c6c65644261636b223a747275657d
write_migration_state "$CHECKSUM_MISMATCH_STATE" 1 0 0 0 0 1 \
  7b22636865636b73756d223a2277726f6e67227d
write_migration_state "$EXTRA_ROW_STATE" 3 1 0 1 0 1 5b7b7d2c7b7d2c7b7d5d
assert_pre_state_rejected failed "$FIXTURE/upgrade-schema.txt" "$FAILED_STATE"
assert_pre_state_rejected predecessor-present "$FIXTURE/upgrade-schema.txt" \
  "$ROLLED_BACK_STATE"
assert_pre_state_rejected pair-absent "$FIXTURE/first-deploy-schema.txt" \
  "$RETRY_COMPLETED_STATE"
assert_pre_state_rejected extra-row "$FIXTURE/upgrade-schema.txt" \
  "$EXTRA_ROW_STATE"
for invalid_rollback in non-null-logs checksum-equal-current bad-timestamps bad-steps; do
  assert_pre_state_rejected "rollback-$invalid_rollback" \
    "$FIXTURE/first-deploy-schema.txt" "$CONTRADICTORY_STATE"
done
assert_pre_state_rejected in-progress "$FIXTURE/upgrade-schema.txt" \
  "$IN_PROGRESS_STATE"
assert_pre_state_rejected duplicate "$FIXTURE/upgrade-schema.txt" \
  "$DUPLICATE_STATE"
assert_pre_state_rejected contradictory "$FIXTURE/upgrade-schema.txt" \
  "$CONTRADICTORY_STATE"
assert_pre_state_rejected checksum-mismatch "$FIXTURE/upgrade-schema.txt" \
  "$CHECKSUM_MISMATCH_STATE"
assert_pre_state_rejected completed-without-tables \
  "$FIXTURE/first-deploy-schema.txt" "$COMPLETED_STATE"
assert_pre_state_rejected tables-without-migration \
  "$FIXTURE/upgrade-schema.txt" "$NOT_APPLIED_STATE"

cp "$FIXTURE/first-deploy-schema.txt" "$FIXTURE/partial-schema.txt"
printf '%s\n' reader_summary_publications >> "$FIXTURE/partial-schema.txt"
assert_pre_state_rejected partial "$FIXTURE/partial-schema.txt" \
  "$NOT_APPLIED_STATE"

grep -v '^feed_items$' "$FIXTURE/first-deploy-schema.txt" \
  > "$FIXTURE/schema-missing-critical.txt"
assert_pre_state_rejected missing-critical \
  "$FIXTURE/schema-missing-critical.txt" "$NOT_APPLIED_STATE"
grep -v 'TABLE DATA public feed_items ' "$FIXTURE/first-deploy-listing.txt" \
  > "$FIXTURE/listing-missing-critical.txt"
if bash "$ENTRYPOINT" "$FIXTURE/first-deploy-schema.txt" \
  "$NOT_APPLIED_STATE" "$FIXTURE/listing-missing-critical.txt" \
  "$FIXTURE/first-deploy-schema.txt" "$NOT_APPLIED_STATE" \
  >/dev/null 2>&1; then
  echo 'dump missing an existing critical table was accepted' >&2
  exit 1
fi

grep -v 'TABLE DATA public reader_summary_publication_slots ' \
  "$FIXTURE/upgrade-listing.txt" > "$FIXTURE/upgrade-listing-missing.txt"
if bash "$ENTRYPOINT" "$FIXTURE/upgrade-schema.txt" \
  "$COMPLETED_STATE" "$FIXTURE/upgrade-listing-missing.txt" \
  "$FIXTURE/upgrade-schema.txt" "$COMPLETED_STATE" >/dev/null 2>&1; then
  echo 'upgrade dump missing an existing publication table was accepted' >&2
  exit 1
fi

cp "$FIXTURE/first-deploy-listing.txt" "$FIXTURE/listing-extra.txt"
printf '%s\n' '10; 0 10 TABLE DATA public unexpected_table owner' \
  >> "$FIXTURE/listing-extra.txt"
if bash "$ENTRYPOINT" "$FIXTURE/first-deploy-schema.txt" \
  "$NOT_APPLIED_STATE" "$FIXTURE/listing-extra.txt" \
  "$FIXTURE/first-deploy-schema.txt" "$NOT_APPLIED_STATE" \
  >/dev/null 2>&1; then
  echo 'dump with a mismatched public table set was accepted' >&2
  exit 1
fi
cp "$FIXTURE/first-deploy-listing.txt" "$FIXTURE/listing-duplicate.txt"
printf '%s\n' '10; 0 10 TABLE DATA public feed_items owner' \
  >> "$FIXTURE/listing-duplicate.txt"
if bash "$ENTRYPOINT" "$FIXTURE/first-deploy-schema.txt" \
  "$NOT_APPLIED_STATE" "$FIXTURE/listing-duplicate.txt" \
  "$FIXTURE/first-deploy-schema.txt" "$NOT_APPLIED_STATE" \
  >/dev/null 2>&1; then
  echo 'dump with duplicate public table data was accepted' >&2
  exit 1
fi
printf '%s\n' 'not a PostgreSQL archive listing' \
  > "$FIXTURE/corrupt-listing.txt"
if bash "$ENTRYPOINT" "$FIXTURE/first-deploy-schema.txt" \
  "$NOT_APPLIED_STATE" "$FIXTURE/corrupt-listing.txt" \
  "$FIXTURE/first-deploy-schema.txt" "$NOT_APPLIED_STATE" \
  >/dev/null 2>&1; then
  echo 'corrupt archive listing was accepted' >&2
  exit 1
fi

cp "$FIXTURE/first-deploy-schema.txt" "$FIXTURE/post-dump-schema-changed.txt"
printf '%s\n' concurrent_table >> "$FIXTURE/post-dump-schema-changed.txt"
if bash "$ENTRYPOINT" "$FIXTURE/first-deploy-schema.txt" \
  "$NOT_APPLIED_STATE" "$FIXTURE/first-deploy-listing.txt" \
  "$FIXTURE/post-dump-schema-changed.txt" "$NOT_APPLIED_STATE" \
  >/dev/null 2>&1; then
  echo 'live schema race during backup was accepted' >&2
  exit 1
fi

COMPLETED_STATE_CHANGED=$FIXTURE/migration-completed-changed.txt
write_migration_state "$COMPLETED_STATE_CHANGED" 1 1 0 0 0 0 \
  7b22636f6d706c65746564223a747275652c226964223a226368616e676564227d
if bash "$ENTRYPOINT" "$FIXTURE/upgrade-schema.txt" "$COMPLETED_STATE" \
  "$FIXTURE/upgrade-listing.txt" "$FIXTURE/upgrade-schema.txt" \
  "$COMPLETED_STATE_CHANGED" >/dev/null 2>&1; then
  echo 'exact publication migration state race was accepted' >&2
  exit 1
fi

cp "$FIXTURE/first-deploy-schema.txt" "$FIXTURE/duplicate-schema.txt"
printf 'feed_items\n' >> "$FIXTURE/duplicate-schema.txt"
assert_pre_state_rejected duplicate-schema "$FIXTURE/duplicate-schema.txt" \
  "$NOT_APPLIED_STATE"
cp "$FIXTURE/first-deploy-schema.txt" "$FIXTURE/unsafe-schema.txt"
printf '../unsafe\n' >> "$FIXTURE/unsafe-schema.txt"
assert_pre_state_rejected unsafe "$FIXTURE/unsafe-schema.txt" \
  "$NOT_APPLIED_STATE"
printf 'feed_items\n' > "$FIXTURE/no-migrations.txt"
assert_pre_state_rejected no-migrations "$FIXTURE/no-migrations.txt" \
  "$NOT_APPLIED_STATE"
: > "$FIXTURE/empty.txt"
assert_pre_state_rejected empty "$FIXTURE/empty.txt" "$NOT_APPLIED_STATE"
printf '%s\n' 'reader-summary-publication-migration-state-v1' \
  > "$FIXTURE/corrupt-migration-state.txt"
assert_pre_state_rejected corrupt "$FIXTURE/first-deploy-schema.txt" \
  "$FIXTURE/corrupt-migration-state.txt"
write_migration_state "$FIXTURE/empty-exact-state.txt" 0 0 0 0 0 0 7b7d
assert_pre_state_rejected absent-exact-contradiction \
  "$FIXTURE/first-deploy-schema.txt" "$FIXTURE/empty-exact-state.txt"

echo 'PostgreSQL pre-migration backup coverage tests passed'
