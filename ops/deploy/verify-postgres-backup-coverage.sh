#!/usr/bin/env bash
set -euo pipefail

schema_tables_path=${1:?schema table list path is required}
listing_path=${2:-}

[[ -f $schema_tables_path && ! -L $schema_tables_path ]] || {
  echo 'backup-coverage-error: schema table list must be a regular file' >&2
  exit 1
}
if [[ -n $listing_path && (! -f $listing_path || -L $listing_path) ]]; then
  echo 'backup-coverage-error: pg_restore listing must be a regular file' >&2
  exit 1
fi

required_relations=()
while IFS= read -r relation; do
  [[ -n $relation ]] || continue
  [[ $relation =~ ^_?[a-z][a-z0-9_]*$ ]] || {
    echo 'backup-coverage-error: live schema contains an unsafe relation name' >&2
    exit 1
  }
  required_relations+=("$relation")
done < "$schema_tables_path"

((${#required_relations[@]} > 0)) || {
  echo 'backup-coverage-error: live schema table list is empty' >&2
  exit 1
}
duplicate=$(printf '%s\n' "${required_relations[@]}" | LC_ALL=C sort | uniq -d | head -1)
[[ -z $duplicate ]] || {
  echo "backup-coverage-error: duplicate live schema relation: $duplicate" >&2
  exit 1
}
for core_relation in \
  _prisma_migrations tenants workspaces source_items feed_items \
  reader_summary_artifacts reader_summary_publications \
  reader_summary_publication_slots outbox_events inbox_records \
  idempotency_keys; do
  printf '%s\n' "${required_relations[@]}" | grep -Fx "$core_relation" >/dev/null || {
    echo "backup-coverage-error: live schema fingerprint is missing: $core_relation" >&2
    exit 1
  }
done

if [[ -n $listing_path ]]; then
  for relation in "${required_relations[@]}"; do
    grep -Eq "TABLE DATA public $relation( |$)" "$listing_path" || {
      echo "backup-coverage-error: dump is missing live relation data: $relation" >&2
      exit 1
    }
  done
fi

printf 'database-backup-relations-verified=%s\n' "${#required_relations[@]}"
