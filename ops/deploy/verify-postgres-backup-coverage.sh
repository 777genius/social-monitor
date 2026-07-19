#!/usr/bin/env bash
set -euo pipefail

schema_tables_path=${1:?schema table list path is required}
migration_state_path=${2:?publication migration state path is required}
listing_path=${3:-}
post_dump_schema_tables_path=${4:-}
post_dump_migration_state_path=${5:-}

require_regular_file() {
  local path=$1
  local description=$2

  [[ -f $path && ! -L $path ]] || {
    echo "backup-coverage-error: $description must be a regular file" >&2
    exit 1
  }
}

require_regular_file "$schema_tables_path" 'schema table list'
require_regular_file "$migration_state_path" 'publication migration state'
if [[ -n $listing_path ]]; then
  require_regular_file "$listing_path" 'pg_restore listing'
  [[ -n $post_dump_schema_tables_path && \
     -n $post_dump_migration_state_path ]] || {
    echo 'backup-coverage-error: completed dump verification requires both post-dump snapshots' >&2
    exit 1
  }
  require_regular_file "$post_dump_schema_tables_path" \
    'post-dump schema table list'
  require_regular_file "$post_dump_migration_state_path" \
    'post-dump publication migration state'
elif [[ -n $post_dump_schema_tables_path || \
        -n $post_dump_migration_state_path ]]; then
  echo 'backup-coverage-error: post-dump snapshots require a pg_restore listing' >&2
  exit 1
fi

read_publication_migration_state() {
  local path=$1
  local context=$2
  local -a lines=()
  local version total completed failed rolled_back in_progress contradictory
  local extra count exact_hex

  mapfile -t lines < "$path"
  ((${#lines[@]} == 2)) || {
    echo "backup-coverage-error: $context migration state has an invalid record count" >&2
    return 1
  }
  IFS=$'\t' read -r version total completed failed rolled_back in_progress \
    contradictory extra <<< "${lines[0]}"
  [[ $version == reader-summary-publication-migration-state-v1 && \
     -z ${extra:-} ]] || {
    echo "backup-coverage-error: $context migration state header is invalid" >&2
    return 1
  }
  for count in \
    "$total" "$completed" "$failed" "$rolled_back" "$in_progress" \
    "$contradictory"; do
    [[ $count =~ ^(0|[1-9][0-9]{0,5})$ ]] || {
      echo "backup-coverage-error: $context migration state count is invalid" >&2
      return 1
    }
  done
  ((completed + failed + rolled_back + in_progress + contradictory == total)) || {
    echo "backup-coverage-error: $context migration state counts contradict each other" >&2
    return 1
  }
  [[ ${lines[1]} =~ ^exact-hex=([0-9a-f]+)$ ]] || {
    echo "backup-coverage-error: $context exact migration state is invalid" >&2
    return 1
  }
  exact_hex=${BASH_REMATCH[1]}
  ((${#exact_hex} % 2 == 0)) || {
    echo "backup-coverage-error: $context exact migration state is truncated" >&2
    return 1
  }
  if ((total == 0)); then
    [[ $exact_hex == 5b5d ]] || {
      echo "backup-coverage-error: $context absent migration has contradictory exact state" >&2
      return 1
    }
  else
    [[ $exact_hex != 5b5d ]] || {
      echo "backup-coverage-error: $context present migration has empty exact state" >&2
      return 1
    }
  fi

  MIGRATION_TOTAL=$total
  MIGRATION_COMPLETED=$completed
  MIGRATION_FAILED=$failed
  MIGRATION_ROLLED_BACK=$rolled_back
  MIGRATION_IN_PROGRESS=$in_progress
  MIGRATION_CONTRADICTORY=$contradictory
}

require_publication_schema_migration_match() {
  local context=$1

  case $publication_schema in
    absent)
      ((MIGRATION_TOTAL == 0 && MIGRATION_COMPLETED == 0 && \
        MIGRATION_FAILED == 0 && MIGRATION_ROLLED_BACK == 0 && \
        MIGRATION_IN_PROGRESS == 0 && MIGRATION_CONTRADICTORY == 0)) || {
        echo "backup-coverage-error: $context publication tables are absent but the exact migration is not unapplied" >&2
        return 1
      }
      publication_migration_state=not-applied
      ;;
    present)
      ((MIGRATION_TOTAL == 1 && MIGRATION_COMPLETED == 1 && \
        MIGRATION_FAILED == 0 && MIGRATION_ROLLED_BACK == 0 && \
        MIGRATION_IN_PROGRESS == 0 && MIGRATION_CONTRADICTORY == 0)) || {
        echo "backup-coverage-error: $context publication tables exist without one exact completed migration" >&2
        return 1
      }
      publication_migration_state=completed
      ;;
  esac
}

required_relations=()
declare -A required_relation_set=()
while IFS= read -r relation; do
  [[ -n $relation ]] || continue
  [[ $relation =~ ^_?[a-z][a-z0-9_]*$ ]] || {
    echo 'backup-coverage-error: live schema contains an unsafe relation name' >&2
    exit 1
  }
  [[ -z ${required_relation_set[$relation]+present} ]] || {
    echo "backup-coverage-error: duplicate live schema relation: $relation" >&2
    exit 1
  }
  required_relations+=("$relation")
  required_relation_set[$relation]=present
done < "$schema_tables_path"

((${#required_relations[@]} > 0)) || {
  echo 'backup-coverage-error: live schema table list is empty' >&2
  exit 1
}
for core_relation in \
  _prisma_migrations tenants workspaces source_items feed_items \
  reader_summary_artifacts outbox_events inbox_records idempotency_keys; do
  [[ -n ${required_relation_set[$core_relation]+present} ]] || {
    echo "backup-coverage-error: live schema fingerprint is missing: $core_relation" >&2
    exit 1
  }
done

publication_relation_count=0
for publication_relation in \
  reader_summary_publications reader_summary_publication_slots; do
  if [[ -n ${required_relation_set[$publication_relation]+present} ]]; then
    publication_relation_count=$((publication_relation_count + 1))
  fi
done
case $publication_relation_count in
  0) publication_schema=absent ;;
  2) publication_schema=present ;;
  *)
    echo 'backup-coverage-error: live publication schema is only partially present' >&2
    exit 1
    ;;
esac

read_publication_migration_state "$migration_state_path" pre-dump
require_publication_schema_migration_match pre-dump

if [[ -n $listing_path ]]; then
  declare -A dump_relation_set=()
  dump_relation_count=0
  while IFS= read -r relation; do
    [[ $relation =~ ^_?[a-z][a-z0-9_]*$ ]] || {
      echo 'backup-coverage-error: dump contains an unsafe public relation name' >&2
      exit 1
    }
    [[ -z ${dump_relation_set[$relation]+present} ]] || {
      echo "backup-coverage-error: dump contains duplicate relation data: $relation" >&2
      exit 1
    }
    dump_relation_set[$relation]=present
    dump_relation_count=$((dump_relation_count + 1))
  done < <(
    awk '$4 == "TABLE" && $5 == "DATA" && $6 == "public" { print $7 }' \
      "$listing_path"
  )

  for relation in "${required_relations[@]}"; do
    [[ -n ${dump_relation_set[$relation]+present} ]] || {
      echo "backup-coverage-error: dump is missing live relation data: $relation" >&2
      exit 1
    }
  done
  for relation in "${!dump_relation_set[@]}"; do
    [[ -n ${required_relation_set[$relation]+present} ]] || {
      echo "backup-coverage-error: dump schema differs from captured live schema: $relation" >&2
      exit 1
    }
  done
  ((dump_relation_count == ${#required_relations[@]})) || {
    echo 'backup-coverage-error: dump relation count differs from captured live schema' >&2
    exit 1
  }

  cmp -s "$schema_tables_path" "$post_dump_schema_tables_path" || {
    echo 'backup-coverage-error: live schema changed while backup was captured' >&2
    exit 1
  }
  read_publication_migration_state \
    "$post_dump_migration_state_path" post-dump
  require_publication_schema_migration_match post-dump
  cmp -s "$migration_state_path" "$post_dump_migration_state_path" || {
    echo 'backup-coverage-error: exact publication migration state changed while backup was captured' >&2
    exit 1
  }

  printf 'database-backup-relations-verified=%s publication-schema=%s publication-migration=%s\n' \
    "${#required_relations[@]}" "$publication_schema" \
    "$publication_migration_state"
else
  printf 'database-backup-schema-verified=%s publication-schema=%s publication-migration=%s\n' \
    "${#required_relations[@]}" "$publication_schema" \
    "$publication_migration_state"
fi
