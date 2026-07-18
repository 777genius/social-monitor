#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ENTRYPOINT=$SCRIPT_DIR/verify-postgres-backup-coverage.sh
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/social-monitor-backup-coverage-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

cat > "$FIXTURE/schema.txt" <<'TEXT'
_prisma_migrations
tenants
workspaces
source_items
feed_items
reader_summary_artifacts
reader_summary_publications
reader_summary_publication_slots
outbox_events
inbox_records
idempotency_keys
TEXT
cat > "$FIXTURE/listing.txt" <<'TEXT'
1; 0 1 TABLE DATA public _prisma_migrations owner
2; 0 2 TABLE DATA public tenants owner
3; 0 3 TABLE DATA public workspaces owner
4; 0 4 TABLE DATA public source_items owner
5; 0 5 TABLE DATA public feed_items owner
6; 0 6 TABLE DATA public reader_summary_artifacts owner
7; 0 7 TABLE DATA public reader_summary_publications owner
8; 0 8 TABLE DATA public reader_summary_publication_slots owner
9; 0 9 TABLE DATA public outbox_events owner
10; 0 10 TABLE DATA public inbox_records owner
11; 0 11 TABLE DATA public idempotency_keys owner
TEXT

output=$(bash "$ENTRYPOINT" "$FIXTURE/schema.txt" "$FIXTURE/listing.txt")
grep -Fx 'database-backup-relations-verified=11' <<< "$output" >/dev/null

grep -v '^feed_items$' "$FIXTURE/schema.txt" > "$FIXTURE/schema-missing.txt"
if bash "$ENTRYPOINT" "$FIXTURE/schema-missing.txt" >/dev/null 2>&1; then
  echo 'wrong live schema identity was accepted' >&2
  exit 1
fi

grep -v 'TABLE DATA public feed_items ' "$FIXTURE/listing.txt" > "$FIXTURE/listing-missing.txt"
if bash "$ENTRYPOINT" "$FIXTURE/schema.txt" \
  "$FIXTURE/listing-missing.txt" >/dev/null 2>&1; then
  echo 'missing dump relation was accepted' >&2
  exit 1
fi

for publication_relation in \
  reader_summary_publications reader_summary_publication_slots; do
  grep -v "^${publication_relation}$" "$FIXTURE/schema.txt" \
    > "$FIXTURE/schema-missing-${publication_relation}.txt"
  if bash "$ENTRYPOINT" \
    "$FIXTURE/schema-missing-${publication_relation}.txt" >/dev/null 2>&1; then
    echo "schema without $publication_relation was accepted" >&2
    exit 1
  fi

  grep -v "TABLE DATA public ${publication_relation} " \
    "$FIXTURE/listing.txt" \
    > "$FIXTURE/listing-missing-${publication_relation}.txt"
  if bash "$ENTRYPOINT" "$FIXTURE/schema.txt" \
    "$FIXTURE/listing-missing-${publication_relation}.txt" \
    >/dev/null 2>&1; then
    echo "dump without $publication_relation was accepted" >&2
    exit 1
  fi
done

cp "$FIXTURE/schema.txt" "$FIXTURE/duplicate.txt"
printf 'feed_items\n' >> "$FIXTURE/duplicate.txt"
if bash "$ENTRYPOINT" "$FIXTURE/duplicate.txt" \
  "$FIXTURE/listing.txt" >/dev/null 2>&1; then
  echo 'duplicate live schema relation was accepted' >&2
  exit 1
fi

cp "$FIXTURE/schema.txt" "$FIXTURE/unsafe.txt"
printf '../unsafe\n' >> "$FIXTURE/unsafe.txt"
if bash "$ENTRYPOINT" "$FIXTURE/unsafe.txt" \
  "$FIXTURE/listing.txt" >/dev/null 2>&1; then
  echo 'unsafe live schema relation was accepted' >&2
  exit 1
fi

printf 'feed_items\n' > "$FIXTURE/no-migrations.txt"
if bash "$ENTRYPOINT" "$FIXTURE/no-migrations.txt" \
  "$FIXTURE/listing.txt" >/dev/null 2>&1; then
  echo 'schema without migration history was accepted' >&2
  exit 1
fi

: > "$FIXTURE/empty.txt"
if bash "$ENTRYPOINT" "$FIXTURE/empty.txt" \
  "$FIXTURE/listing.txt" >/dev/null 2>&1; then
  echo 'empty live schema was accepted' >&2
  exit 1
fi

echo 'PostgreSQL backup coverage tests passed'
