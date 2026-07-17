#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
LIBRARY=$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh
DEPLOY_ENTRYPOINT=$SCRIPT_DIR/social-monitor-production-deploy.sh
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/publication-migrator-validation.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

ROOT=$FIXTURE/root
REPO=$FIXTURE/repo
SECRET=$ROOT/secrets/db/reader-summary-publication-admin-url
CA_CERTIFICATE=$ROOT/secrets/db/ca-certificate.crt
EVENT_LOG=$FIXTURE/events.log
WRITE_LOG=$FIXTURE/writes.log
PRIVATE_QUERY_PAYLOAD=private-query-output-must-stay-redacted
PRIVATE_PASSWORD=redacted-test-password
MIGRATOR_ROLE=social_monitor_publication_migrator
DATABASE_HOST=dbaas-db-8050451-do-user-39622063-0.e.db.ondigitalocean.com
VALID_URL="postgresql://${MIGRATOR_ROLE}:${PRIVATE_PASSWORD}@${DATABASE_HOST}:25060/social_monitor?connect_timeout=10&sslmode=verify-full&sslrootcert=%2Frun%2Fsocial-monitor-db%2Fca-certificate.crt"
VALID_CATALOG="social_monitor|${MIGRATOR_ROLE}|${MIGRATOR_ROLE}|t|t|t|f|f|f|f|180004|t|1|t|f|t|t|0"
CATALOG_RESULT=$VALID_CATALOG
CATALOG_QUERY_STATUS=0
AVAILABILITY_STATUS=0
SECRET_OWNER=root
SECRET_METADATA_STATUS=0
CA_OWNER=root
CA_METADATA_STATUS=0
FAIL_PHASE=
TEST_COUNT=0

mkdir -p "$ROOT/secrets/db" "$REPO/ops/deploy"
printf '%s\n' 'test-only-ca-certificate' > "$CA_CERTIFICATE"
cp "$SCRIPT_DIR/deploy-control-lib.sh" "$REPO/ops/deploy/"

fail() {
  printf 'deploy-error: %s\n' "$*" >&2
  exit 1
}

# shellcheck source=ops/deploy/reader-summary-publication-deploy-lib.sh
source "$LIBRARY"

reader_summary_publication_admin_secret_metadata() {
  local mode
  if command stat -c '%a' "$1" >/dev/null 2>&1; then
    mode=$(command stat -c '%a' "$1")
  else
    mode=$(command stat -f '%Lp' "$1")
  fi
  if [[ $1 == "$SECRET" ]]; then
    ((SECRET_METADATA_STATUS == 0)) || return "$SECRET_METADATA_STATUS"
    printf '%s|%s\n' "$SECRET_OWNER" "$mode"
    return
  fi
  ((CA_METADATA_STATUS == 0)) || return "$CA_METADATA_STATUS"
  printf '%s|%s\n' "$CA_OWNER" "$mode"
}

reader_summary_publication_admin_catalog_query() {
  printf '%s\n' catalog-query >> "$EVENT_LOG"
  if ((CATALOG_QUERY_STATUS != 0)); then
    printf '%s\n' "$PRIVATE_QUERY_PAYLOAD"
    return "$CATALOG_QUERY_STATUS"
  fi
  printf '%s\n' "$CATALOG_RESULT"
}

reader_summary_publication_admin_availability_query() {
  printf '%s\n' availability >> "$EVENT_LOG"
  return "$AVAILABILITY_STATUS"
}

run_reader_summary_publication_admin_sql() {
  local phase=$4
  printf 'write:%s\n' "$phase" >> "$EVENT_LOG"
  [[ $FAIL_PHASE != "$phase" ]] || return 81
  printf 'psql:%s\n' "$phase" >> "$WRITE_LOG"
}

fake_compose() {
  printf '%s\n' write:prisma >> "$EVENT_LOG"
  [[ $FAIL_PHASE != prisma ]] || return 82
  printf '%s\n' prisma-migrate >> "$WRITE_LOG"
}

sleep() {
  :
}

COMPOSE=(fake_compose)

write_admin_url() {
  local value=$1
  chmod 0600 "$SECRET" 2>/dev/null || true
  printf '%s' "$value" > "$SECRET"
  chmod 0400 "$SECRET"
}

reset_case() {
  rm -f "$SECRET" "$CA_CERTIFICATE"
  : > "$EVENT_LOG"
  : > "$WRITE_LOG"
  CATALOG_RESULT=$VALID_CATALOG
  CATALOG_QUERY_STATUS=0
  AVAILABILITY_STATUS=0
  SECRET_OWNER=root
  SECRET_METADATA_STATUS=0
  CA_OWNER=root
  CA_METADATA_STATUS=0
  FAIL_PHASE=
  printf '%s\n' 'test-only-ca-certificate' > "$CA_CERTIFICATE"
  write_admin_url "$VALID_URL"
}

catalog_with_field() {
  local index=$1
  local value=$2
  local -a fields
  IFS='|' read -r -a fields <<< "$VALID_CATALOG"
  fields[index]=$value
  local IFS='|'
  printf '%s' "${fields[*]}"
}

assert_redacted() {
  local output=$1
  local admin_url=$2
  [[ $output != *"$admin_url"* ]]
  [[ $output != *"$PRIVATE_PASSWORD"* ]]
  [[ $output != *"$PRIVATE_QUERY_PAYLOAD"* ]]
  [[ $output != *publication_migrator* ]]
}

assert_invalid_url() {
  local label=$1
  local admin_url=$2
  local output status
  reset_case
  write_admin_url "$admin_url"
  set +e
  output=$(deploy_reader_summary_publication_migrations 2>&1)
  status=$?
  set -e
  ((status != 0))
  [[ ! -s $EVENT_LOG ]]
  [[ ! -s $WRITE_LOG ]]
  assert_redacted "$output" "$admin_url"
  TEST_COUNT=$((TEST_COUNT + 1))
  : "$label"
}

assert_invalid_catalog() {
  local label=$1
  local catalog_result=$2
  local query_status=${3:-0}
  local output status
  reset_case
  CATALOG_RESULT=$catalog_result
  CATALOG_QUERY_STATUS=$query_status
  set +e
  output=$(deploy_reader_summary_publication_migrations 2>&1)
  status=$?
  set -e
  ((status != 0))
  [[ $(< "$EVENT_LOG") == $'availability\ncatalog-query' ]]
  [[ ! -s $WRITE_LOG ]]
  assert_redacted "$output" "$VALID_URL"
  [[ $output != *"$catalog_result"* ]]
  TEST_COUNT=$((TEST_COUNT + 1))
  : "$label"
}

assert_invalid_availability() {
  local label=$1
  local availability_status=$2
  local expected=$3
  local output status
  reset_case
  AVAILABILITY_STATUS=$availability_status
  set +e
  output=$(deploy_reader_summary_publication_migrations 2>&1)
  status=$?
  set -e
  ((status != 0))
  [[ $(< "$EVENT_LOG") == "$expected" ]]
  [[ ! -s $WRITE_LOG ]]
  assert_redacted "$output" "$VALID_URL"
  TEST_COUNT=$((TEST_COUNT + 1))
  : "$label"
}

assert_invalid_file() {
  local label=$1
  local output status
  set +e
  output=$(deploy_reader_summary_publication_migrations 2>&1)
  status=$?
  set -e
  ((status != 0))
  [[ ! -s $EVENT_LOG ]]
  [[ ! -s $WRITE_LOG ]]
  assert_redacted "$output" "$VALID_URL"
  TEST_COUNT=$((TEST_COUNT + 1))
  : "$label"
}

reset_case
valid_output=$(deploy_reader_summary_publication_migrations 2>&1)
[[ -z $valid_output ]]
[[ $(< "$EVENT_LOG") == $'availability\ncatalog-query\nwrite:pre\nwrite:prisma\nwrite:post' ]]
[[ $(< "$WRITE_LOG") == $'psql:pre\nprisma-migrate\npsql:post' ]]
TEST_COUNT=$((TEST_COUNT + 1))

for failed_phase in pre prisma post; do
  reset_case
  FAIL_PHASE=$failed_phase
  set +e
  failure_output=$(deploy_reader_summary_publication_migrations 2>&1)
  failure_status=$?
  set -e
  ((failure_status != 0))
  assert_redacted "$failure_output" "$VALID_URL"
  case $failed_phase in
    pre)
      [[ $(< "$EVENT_LOG") == $'availability\ncatalog-query\nwrite:pre' ]]
      [[ ! -s $WRITE_LOG ]]
      ;;
    prisma)
      [[ $(< "$EVENT_LOG") == $'availability\ncatalog-query\nwrite:pre\nwrite:prisma' ]]
      [[ $(< "$WRITE_LOG") == psql:pre ]]
      ;;
    post)
      [[ $(< "$EVENT_LOG") == \
        $'availability\ncatalog-query\nwrite:pre\nwrite:prisma\nwrite:post' ]]
      [[ $(< "$WRITE_LOG") == $'psql:pre\nprisma-migrate' ]]
      ;;
  esac
  TEST_COUNT=$((TEST_COUNT + 1))
done

assert_invalid_url malformed-url 'not-a-postgresql-url'
assert_invalid_url malformed-percent \
  'postgresql://publication_migrator@db.invalid/social_monitor?sslmode=verify-full&sslrootcert=%ZZ'
assert_invalid_url missing-user \
  'postgresql://db.invalid/social_monitor?sslmode=verify-full&sslrootcert=%2Frun%2Fsocial-monitor-db%2Fca-certificate.crt'
assert_invalid_url fragment \
  'postgresql://publication_migrator@db.invalid/social_monitor?sslmode=verify-full&sslrootcert=%2Frun%2Fsocial-monitor-db%2Fca-certificate.crt#unsafe'
assert_invalid_url defaultdb-url \
  'postgresql://publication_migrator@db.invalid/defaultdb?sslmode=verify-full&sslrootcert=%2Frun%2Fsocial-monitor-db%2Fca-certificate.crt'
assert_invalid_url missing-sslmode \
  'postgresql://publication_migrator@db.invalid/social_monitor?sslrootcert=%2Frun%2Fsocial-monitor-db%2Fca-certificate.crt'
assert_invalid_url downgraded-sslmode \
  'postgresql://publication_migrator@db.invalid/social_monitor?sslmode=require&sslrootcert=%2Frun%2Fsocial-monitor-db%2Fca-certificate.crt'
assert_invalid_url missing-ca-path \
  'postgresql://publication_migrator@db.invalid/social_monitor?sslmode=verify-full'
assert_invalid_url wrong-ca-path \
  'postgresql://publication_migrator@db.invalid/social_monitor?sslmode=verify-full&sslrootcert=%2Ftmp%2Funtrusted.crt'
assert_invalid_url duplicate-sslmode \
  'postgresql://publication_migrator@db.invalid/social_monitor?sslmode=verify-full&sslmode=disable&sslrootcert=%2Frun%2Fsocial-monitor-db%2Fca-certificate.crt'
assert_invalid_url wrong-migrator-role \
  "postgresql://doadmin:${PRIVATE_PASSWORD}@${DATABASE_HOST}:25060/social_monitor?sslmode=verify-full&sslrootcert=%2Frun%2Fsocial-monitor-db%2Fca-certificate.crt"
assert_invalid_url missing-password \
  "postgresql://${MIGRATOR_ROLE}@${DATABASE_HOST}:25060/social_monitor?sslmode=verify-full&sslrootcert=%2Frun%2Fsocial-monitor-db%2Fca-certificate.crt"
assert_invalid_url wrong-cluster-host \
  "postgresql://${MIGRATOR_ROLE}:${PRIVATE_PASSWORD}@db.invalid:25060/social_monitor?sslmode=verify-full&sslrootcert=%2Frun%2Fsocial-monitor-db%2Fca-certificate.crt"
assert_invalid_url wrong-cluster-port \
  "postgresql://${MIGRATOR_ROLE}:${PRIVATE_PASSWORD}@${DATABASE_HOST}:5432/social_monitor?sslmode=verify-full&sslrootcert=%2Frun%2Fsocial-monitor-db%2Fca-certificate.crt"
assert_invalid_url unknown-query-parameter \
  "${VALID_URL}&application_name=unsafe"
assert_invalid_url excessive-connect-timeout \
  "${VALID_URL/connect_timeout=10/connect_timeout=60}"

reset_case
rm "$SECRET"
assert_invalid_file missing-secret
reset_case
chmod 0600 "$SECRET"
: > "$SECRET"
chmod 0400 "$SECRET"
assert_invalid_file empty-secret
reset_case
chmod 0644 "$SECRET"
assert_invalid_file unsafe-secret-mode
reset_case
chmod 0600 "$SECRET"
assert_invalid_file relaxed-secret-mode
reset_case
SECRET_OWNER=deploy-user
assert_invalid_file unsafe-secret-owner
reset_case
SECRET_METADATA_STATUS=41
assert_invalid_file unreadable-secret-metadata
reset_case
rm "$CA_CERTIFICATE"
assert_invalid_file missing-ca-certificate
reset_case
CA_OWNER=deploy-user
assert_invalid_file unsafe-ca-owner
reset_case
chmod 0666 "$CA_CERTIFICATE"
assert_invalid_file unsafe-ca-mode
reset_case
CA_METADATA_STATUS=42
assert_invalid_file unreadable-ca-metadata

assert_invalid_availability unavailable-rejecting 1 \
  $'availability\navailability\navailability'
assert_invalid_availability unavailable-no-response 2 \
  $'availability\navailability\navailability'
assert_invalid_availability invalid-availability-config 3 availability
assert_invalid_catalog catalog-connection-failure-is-deterministic \
  "$PRIVATE_QUERY_PAYLOAD" 2
assert_invalid_catalog deterministic-query-failure "$PRIVATE_QUERY_PAYLOAD" 42
assert_invalid_catalog malformed-query-output 'malformed'
assert_invalid_catalog multiline-query-output \
  "$VALID_CATALOG"$'\n'"$VALID_CATALOG"
assert_invalid_catalog extra-query-field "$VALID_CATALOG|unexpected"
assert_invalid_catalog trailing-query-delimiter "$VALID_CATALOG|"
assert_invalid_catalog wrong-current-database \
  "$(catalog_with_field 0 defaultdb)"
assert_invalid_catalog runtime-current-user \
  'social_monitor|social_monitor_app|social_monitor_app|t|t|t|f|f|f|f|180004|t|t|f|t'
assert_invalid_catalog changed-session-user \
  "social_monitor|${MIGRATOR_ROLE}|social_monitor_app|t|t|t|f|f|f|f|180004|t|t|f|t"
assert_invalid_catalog malformed-migrator-identity \
  'social_monitor|publication-migrator|publication-migrator|t|t|t|f|f|f|f|180004|t|t|f|t'
assert_invalid_catalog no-login "$(catalog_with_field 3 f)"
assert_invalid_catalog no-createrole "$(catalog_with_field 4 f)"
assert_invalid_catalog no-inherit "$(catalog_with_field 5 f)"
assert_invalid_catalog superuser "$(catalog_with_field 6 t)"
assert_invalid_catalog createdb "$(catalog_with_field 7 t)"
assert_invalid_catalog replication "$(catalog_with_field 8 t)"
assert_invalid_catalog bypassrls "$(catalog_with_field 9 t)"
assert_invalid_catalog old-postgres-major "$(catalog_with_field 10 170009)"
assert_invalid_catalog unreviewed-postgres-major "$(catalog_with_field 10 190001)"
assert_invalid_catalog malformed-server-version "$(catalog_with_field 10 invalid)"
assert_invalid_catalog no-actual-tls "$(catalog_with_field 11 f)"
assert_invalid_catalog duplicate-runtime-membership "$(catalog_with_field 12 2)"
assert_invalid_catalog no-runtime-admin-option "$(catalog_with_field 13 f)"
assert_invalid_catalog inherited-runtime-role "$(catalog_with_field 14 t)"
assert_invalid_catalog no-runtime-set-option "$(catalog_with_field 15 f)"
assert_invalid_catalog unsafe-protected-membership "$(catalog_with_field 16 f)"
assert_invalid_catalog unexpected-role-membership "$(catalog_with_field 17 1)"

assert_deploy_backend_preflight_order() {
  local mode=$1
  local expected=$2
  local orchestration_log=$FIXTURE/orchestration-$mode.log
  local counter=$FIXTURE/orchestration-$mode.count
  : > "$orchestration_log"
  printf '0\n' > "$counter"
  set +e
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
  SOCIAL_MONITOR_DEPLOY_REPO="$REPO" \
  SOCIAL_MONITOR_DEPLOY_CONTROL="$ROOT/control" \
  SOCIAL_MONITOR_DEPLOY_STATE="$ROOT/control/deploy-state" \
  ORCHESTRATION_LOG="$orchestration_log" \
  ORCHESTRATION_COUNTER="$counter" \
  ORCHESTRATION_MODE="$mode" \
    bash -c '
      set -euo pipefail
      source "$1"
      source "$2"
      backend_services() { printf "%s\n" migrate; }
      marker_value() { printf "%s\n" 0123456789abcdef0123456789abcdef01234567; }
      capture_previous_images() { printf "%s\n" capture >> "$ORCHESTRATION_LOG"; }
      verify_migration_compatibility() { printf "%s\n" compatibility >> "$ORCHESTRATION_LOG"; }
      backup_database() { printf "%s\n" backup >> "$ORCHESTRATION_LOG"; }
      reader_summary_publication_migrator_preflight() {
        local count
        read -r count < "$ORCHESTRATION_COUNTER"
        count=$((count + 1))
        printf "%s\n" "$count" > "$ORCHESTRATION_COUNTER"
        printf "preflight:%s\n" "$count" >> "$ORCHESTRATION_LOG"
        [[ $ORCHESTRATION_MODE != first-failure ]] || return 64
        ((count < 2)) || return 65
      }
      run_reader_summary_publication_admin_sql() {
        printf "write:%s\n" "$4" >> "$ORCHESTRATION_LOG"
      }
      fake_compose() {
        if [[ " $* " == *" build "* ]]; then
          printf "%s\n" build >> "$ORCHESTRATION_LOG"
        else
          printf "%s\n" prisma >> "$ORCHESTRATION_LOG"
        fi
      }
      COMPOSE=(fake_compose)
      deploy_backend fedcba9876543210fedcba9876543210fedcba98
    ' _ "$DEPLOY_ENTRYPOINT" "$LIBRARY" >/dev/null 2>&1
  local status=$?
  set -e
  ((status != 0))
  [[ $(< "$orchestration_log") == "$expected" ]]
  TEST_COUNT=$((TEST_COUNT + 1))
}

assert_deploy_backend_preflight_order first-failure 'preflight:1'
assert_deploy_backend_preflight_order second-failure \
  $'preflight:1\ncapture\ncompatibility\nbackup\nbuild\npreflight:2'

for catalog_token in \
  'current_database()' \
  'current_user' \
  'session_user' \
  'migrator.rolcanlogin' \
  'migrator.rolcreaterole' \
  'migrator.rolinherit' \
  'migrator.rolsuper' \
  'migrator.rolcreatedb' \
  'migrator.rolreplication' \
  'migrator.rolbypassrls' \
  "current_setting('server_version_num')" \
  'pg_catalog.pg_stat_ssl' \
  'pg_catalog.pg_auth_members' \
  'expected_membership_count' \
  'protected_memberships_valid' \
  'unexpected_membership_count' \
  'membership.admin_option' \
  'membership.inherit_option' \
  'membership.set_option' \
  'pg_isready' \
  '--no-password'; do
  grep -F -- "$catalog_token" "$LIBRARY" >/dev/null
done

# shellcheck disable=SC2016
preflight_line=$(grep -n -F \
  'reader_summary_publication_migrator_preflight ||' \
  "$DEPLOY_ENTRYPOINT" | cut -d: -f1)
# shellcheck disable=SC2016
backup_line=$(grep -n -F 'backup_database "$sha"' \
  "$DEPLOY_ENTRYPOINT" | cut -d: -f1)
# shellcheck disable=SC2016
build_line=$(grep -n -F \
  '"${COMPOSE[@]}" --profile app --profile daily build' \
  "$DEPLOY_ENTRYPOINT" | cut -d: -f1)
((preflight_line < backup_line && backup_line < build_line))

printf 'reader-summary-publication-migrator-validation: ok (%s cases)\n' \
  "$TEST_COUNT"
