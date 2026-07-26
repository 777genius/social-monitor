#!/usr/bin/env bash
{ set +x; } 2>/dev/null
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
LIBRARY=$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh
DEPLOY_ENTRYPOINT=$SCRIPT_DIR/social-monitor-production-deploy.sh
FIXTURE=$(mktemp -d "/tmp/publication-migrator-validation.XXXXXX")
FIXTURE=$(cd "$FIXTURE" && pwd -P)
trap 'rm -rf "$FIXTURE"' EXIT

ROOT=$FIXTURE/root
REPO=$FIXTURE/repo
STATE=$ROOT/control/deploy-state
SECRET=$ROOT/secrets/db/reader-summary-publication-admin-url
CA_CERTIFICATE=$ROOT/secrets/db/ca-certificate.crt
EVENT_LOG=$FIXTURE/events.log
WRITE_LOG=$FIXTURE/writes.log
TRANSPORT_LOG=$FIXTURE/transport.log
TRANSPORT_PGPASS_PATH_LOG=$FIXTURE/transport-pgpass-path.log
TRANSPORT_QUERY_PATH_LOG=$FIXTURE/transport-query-path.log
FAKE_BIN=$FIXTURE/bin
PRIVATE_QUERY_PAYLOAD=private-query-output-must-stay-redacted
PRIVATE_PASSWORD=redacted-test-password
API_PASSWORD=api-test-password
SYSTEM_PASSWORD=system-test-password
MIGRATOR_ROLE=social_monitor_publication_migrator
API_ROLE=social_monitor_app
SYSTEM_ROLE=social_monitor_system_app
DATABASE_HOST=dbaas-db-8050451-do-user-39622063-0.e.db.ondigitalocean.com
VALID_URL="postgresql://${MIGRATOR_ROLE}:${PRIVATE_PASSWORD}@${DATABASE_HOST}:25060/social_monitor?connect_timeout=10&sslmode=verify-full&sslrootcert=%2Frun%2Fsocial-monitor-db%2Fca-certificate.crt"
API_URL="postgresql://${API_ROLE}:${API_PASSWORD}@${DATABASE_HOST}:25060/social_monitor?connect_timeout=10&sslmode=verify-full&sslrootcert=%2Frun%2Fsocial-monitor-db%2Fca-certificate.crt"
SYSTEM_URL="postgresql://${SYSTEM_ROLE}:${SYSTEM_PASSWORD}@${DATABASE_HOST}:25060/social_monitor?connect_timeout=10&sslmode=verify-full&sslrootcert=%2Frun%2Fsocial-monitor-db%2Fca-certificate.crt"
VALID_CATALOG="social_monitor|${MIGRATOR_ROLE}|${MIGRATOR_ROLE}|t|t|t|f|f|f|f|180004|t|1|t|f|t|t|0|1|t|t"
SYSTEM_VALID_CATALOG="social_monitor|${SYSTEM_ROLE}|t|t|f|f|f|f|f|1|f|t|f|1|f|t|f|0|t|180004|t"
SYSTEM_VALID_AUTH="social_monitor|${SYSTEM_ROLE}|${SYSTEM_ROLE}|t|t"
CATALOG_RESULT=$VALID_CATALOG
CATALOG_QUERY_STATUS=0
SYSTEM_CATALOG_RESULT=$SYSTEM_VALID_CATALOG
SYSTEM_CATALOG_QUERY_STATUS=0
SYSTEM_AUTH_RESULT=$SYSTEM_VALID_AUTH
SYSTEM_AUTH_QUERY_STATUS=0
AVAILABILITY_STATUS=0
SECRET_OWNER=root
SECRET_METADATA_STATUS=0
CA_OWNER=root
CA_METADATA_STATUS=0
FAIL_PHASE=
TEST_COUNT=0

mkdir -p "$ROOT/secrets/db" "$REPO/ops/deploy" "$STATE" "$FAKE_BIN"
printf '%s\n' 'test-only-ca-certificate' > "$CA_CERTIFICATE"
cp "$SCRIPT_DIR/deploy-control-lib.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/backend-runtime-health-lib.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/backend-image-rescue-lib.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/x-collector-image-deploy-lib.sh" "$REPO/ops/deploy/"
cp "$DEPLOY_ENTRYPOINT" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/postgres-backup-deploy-lib.sh" "$REPO/ops/deploy/"
git init -q -b main "$REPO"
git -C "$REPO" config user.name 'Publication Migrator Validation'
git -C "$REPO" config user.email publication-validation@example.invalid
git -C "$REPO" add ops/deploy
git -C "$REPO" commit -qm 'test: reviewed target backup helper'
TARGET_LIBRARY_SHA=$(git -C "$REPO" rev-parse HEAD)

cat > "$FAKE_BIN/psql" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ -f $PGPASSFILE && ! -L $PGPASSFILE && -s $PGPASSFILE ]]
mode=$(stat -c '%a' "$PGPASSFILE")
[[ $mode == 600 ]]
[[ $* != *postgresql://* && $* != *redacted-test-password* ]]
[[ $* != *api-test-password* && $* != *system-test-password* ]]
if env | grep -F 'redacted-test-password' >/dev/null || \
  env | grep -F 'system-test-password' >/dev/null; then
  exit 91
fi
query_file= query_result= client_status=$TRANSPORT_CLIENT_STATUS
for argument in "$@"; do
  case $argument in
    --command=*) exit 90 ;;
    --file=/tmp/social-monitor-catalog-query.*) query_file=${argument#--file=} ;;
  esac
done
if [[ -n $query_file ]]; then
  [[ -f $query_file && ! -L $query_file && -s $query_file ]]
  query_mode=$(stat -c '%a' "$query_file")
  [[ $query_mode == 600 ]]
  query_payload=$(< "$query_file")
  if [[ $query_payload == *'system_role.rolname'* ]]; then
    [[ $query_payload == *"WHERE system_role.rolname = :'system_runtime_role';"* ]]
    [[ $query_payload == *"NOT pg_catalog.pg_has_role(:'runtime_role'"* ]]
    [[ $query_payload == *'social_monitor_tenant_system_runtime'* ]]
    [[ " $* " == *' --username=social_monitor_publication_migrator '* ]]
    query_result=$SYSTEM_CATALOG_RESULT
    client_status=$SYSTEM_CATALOG_QUERY_STATUS
  elif [[ $query_payload == *'current_user, '\''social_monitor_tenant_system_runtime'\'''* ]]; then
    [[ $query_payload == *'COALESCE(connection.ssl, false)'* ]]
    [[ " $* " == *' --username=social_monitor_system_app '* ]]
    query_result=$SYSTEM_AUTH_RESULT
    client_status=$SYSTEM_AUTH_QUERY_STATUS
  else
    [[ $query_payload == *"WHERE granted_role.rolname = :'runtime_role'"* ]]
    [[ $query_payload == *'FROM pg_catalog.pg_auth_members AS membership'* ]]
    [[ $query_payload == *'social_monitor_public_schema_owner'* ]]
    [[ $query_payload == *'pg_catalog.pg_namespace namespace'* ]]
    [[ $query_payload == *'public_schema_ownership.boundary_valid'* ]]
    [[ $query_payload == *'schema_grantee.rolname NOT IN ('* ]]
    [[ $query_payload == *"'social_monitor_public_schema_owner',"* ]]
    [[ $query_payload == *"current_user,"* ]]
    [[ $query_payload == *"'social_monitor_reader_summary_publication_owner'"* ]]
    [[ " $* " == *' --set=runtime_role=social_monitor_app '* ]]
    [[ " $* " == *' --set=provisioner_role=doadmin '* ]]
    query_result=${TRANSPORT_QUERY_RESULT:-}
  fi
  [[ -z $query_result ]] || printf '%s\n' "$query_result"
  printf '%s\n' "$query_file" > "$TRANSPORT_QUERY_PATH_LOG"
  printf 'client:psql:catalog-file:mode=%s\n' "$query_mode" \
    >> "$TRANSPORT_LOG"
fi
printf '%s\n' "$PGPASSFILE" > "$TRANSPORT_PGPASS_PATH_LOG"
printf 'client:psql:mode=%s\n' "$mode" >> "$TRANSPORT_LOG"
exit "$client_status"
SH
cat > "$FAKE_BIN/pg_isready" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ -f $PGPASSFILE && ! -L $PGPASSFILE && -s $PGPASSFILE ]]
mode=$(stat -c '%a' "$PGPASSFILE")
[[ $mode == 600 ]]
[[ $* != *postgresql://* && $* != *redacted-test-password* ]]
if env | grep -F 'redacted-test-password' >/dev/null; then
  exit 91
fi
printf '%s\n' "$PGPASSFILE" > "$TRANSPORT_PGPASS_PATH_LOG"
printf 'client:pg_isready:mode=%s\n' "$mode" >> "$TRANSPORT_LOG"
exit "$TRANSPORT_CLIENT_STATUS"
SH
chmod 0755 "$FAKE_BIN/psql" "$FAKE_BIN/pg_isready"

fail() {
  printf 'deploy-error: %s\n' "$*" >&2
  exit 1
}

deploy_control_file_digest() {
  sha256sum "$1" | awk '{print $1}'
}

deploy_control_git_blob_digest() {
  git -C "$REPO" show "$1:$2" | sha256sum | awk '{print $1}'
}

stat() {
  local last_argument=${!#}
  if [[ $1 == -c && $2 == '%u %a' && \
        $last_argument == "$REPO/ops/deploy/postgres-backup-deploy-lib.sh" ]]; then
    printf '0 %s\n' "$(command stat -c '%a' "$last_argument")"
  else
    command stat "$@"
  fi
}

sha=$TARGET_LIBRARY_SHA
# shellcheck source=ops/deploy/reader-summary-publication-deploy-lib.sh
source "$LIBRARY"
declare -F create_pre_migration_database_backup >/dev/null
declare -f backup_database | \
  grep -F 'create_pre_migration_database_backup "$@"' >/dev/null

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

docker() {
  local stdin_payload arguments script status pgpass_path query_path
  local index position
  local -a docker_arguments=("$@") child_arguments
  stdin_payload=$(cat)
  arguments=${docker_arguments[*]}
  [[ $arguments != *postgresql://* ]] || return 93
  [[ $arguments != *"$PRIVATE_PASSWORD"* ]] || return 94
  [[ $arguments != *"$SYSTEM_PASSWORD"* ]] || return 94
  [[ $arguments != *reader-summary-publication-admin-url* ]] || return 95
  [[ " $arguments " == *' run --rm -i '* ]] || return 96
  [[ $stdin_payload == "$TRANSPORT_EXPECTED_PGPASS" || \
    $stdin_payload == "${TRANSPORT_EXPECTED_SYSTEM_PGPASS:-}" ]] || return 97
  if env | grep -F "$TRANSPORT_FORBIDDEN_ENV_VALUE" >/dev/null; then
    return 92
  fi

  index=-1
  for ((position = 0; position < ${#docker_arguments[@]}; position++)); do
    if [[ ${docker_arguments[position]} == sh && \
      ${docker_arguments[position + 1]:-} == -c ]]; then
      index=$position
      break
    fi
  done
  ((index >= 0)) || return 98
  script=${docker_arguments[index + 2]}
  child_arguments=("${docker_arguments[@]:index + 3}")
  : > "$TRANSPORT_PGPASS_PATH_LOG"
  set +e
  printf '%s\n' "$stdin_payload" | \
      env PATH="$FAKE_BIN:$PATH" \
      TRANSPORT_CLIENT_STATUS="$TRANSPORT_CLIENT_STATUS" \
      TRANSPORT_QUERY_RESULT="${TRANSPORT_QUERY_RESULT:-}" \
      SYSTEM_CATALOG_RESULT="$SYSTEM_CATALOG_RESULT" \
      SYSTEM_CATALOG_QUERY_STATUS="$SYSTEM_CATALOG_QUERY_STATUS" \
      SYSTEM_AUTH_RESULT="$SYSTEM_AUTH_RESULT" \
      SYSTEM_AUTH_QUERY_STATUS="$SYSTEM_AUTH_QUERY_STATUS" \
      TRANSPORT_LOG="$TRANSPORT_LOG" \
      TRANSPORT_PGPASS_PATH_LOG="$TRANSPORT_PGPASS_PATH_LOG" \
      TRANSPORT_QUERY_PATH_LOG="$TRANSPORT_QUERY_PATH_LOG" \
      sh -c "$script" "${child_arguments[@]}"
  status=${PIPESTATUS[1]}
  set -e
  pgpass_path=$(< "$TRANSPORT_PGPASS_PATH_LOG")
  [[ -n $pgpass_path && ! -e $pgpass_path ]] || return 99
  query_path=$(< "$TRANSPORT_QUERY_PATH_LOG")
  if [[ ${child_arguments[6]} == catalog ]]; then
    [[ -n $query_path && ! -e $query_path ]] || return 89
    printf 'docker:status=%s:query-removed\n' "$status" >> "$TRANSPORT_LOG"
  else
    [[ -z $query_path ]] || return 88
  fi
  printf 'docker:status=%s:pgpass-removed\n' "$status" >> "$TRANSPORT_LOG"
  return "$status"
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

publication_url_with_password() {
  local password=$1
  printf '%s%s:%s@%s:25060/social_monitor?%s\n' \
    'postgresql://' "$MIGRATOR_ROLE" "$password" "$DATABASE_HOST" \
    'connect_timeout=10&sslmode=verify-full&sslrootcert=%2Frun%2Fsocial-monitor-db%2Fca-certificate.crt'
}

runtime_url_for() {
  local role=$1
  local password=$2
  printf 'postgresql://%s:%s@%s:25060/social_monitor?%s\n' \
    "$role" "$password" "$DATABASE_HOST" \
    'connect_timeout=10&sslmode=verify-full&sslrootcert=%2Frun%2Fsocial-monitor-db%2Fca-certificate.crt'
}

write_production_env() {
  chmod 0600 "$ROOT/secrets/production.env" 2>/dev/null || true
  printf '%s\n' "$@" > "$ROOT/secrets/production.env"
  chmod 0600 "$ROOT/secrets/production.env"
}

write_system_url() {
  chmod 0600 "$ROOT/secrets/db/system-database-url" 2>/dev/null || true
  printf '%s\n' "$1" > "$ROOT/secrets/db/system-database-url"
  chmod 0400 "$ROOT/secrets/db/system-database-url"
}

reset_case() {
  rm -f "$SECRET" "$CA_CERTIFICATE" "$ROOT/secrets/production.env" \
    "$ROOT/secrets/db/system-database-url"
  : > "$EVENT_LOG"
  : > "$WRITE_LOG"
  : > "$TRANSPORT_LOG"
  : > "$TRANSPORT_PGPASS_PATH_LOG"
  : > "$TRANSPORT_QUERY_PATH_LOG"
  CATALOG_RESULT=$VALID_CATALOG
  CATALOG_QUERY_STATUS=0
  SYSTEM_CATALOG_RESULT=$SYSTEM_VALID_CATALOG
  SYSTEM_CATALOG_QUERY_STATUS=0
  SYSTEM_AUTH_RESULT=$SYSTEM_VALID_AUTH
  SYSTEM_AUTH_QUERY_STATUS=0
  TRANSPORT_CLIENT_STATUS=0
  TRANSPORT_QUERY_RESULT=
  TRANSPORT_EXPECTED_SYSTEM_PGPASS=
  AVAILABILITY_STATUS=0
  SECRET_OWNER=root
  SECRET_METADATA_STATUS=0
  CA_OWNER=root
  CA_METADATA_STATUS=0
  FAIL_PHASE=
  printf '%s\n' 'test-only-ca-certificate' > "$CA_CERTIFICATE"
  write_admin_url "$VALID_URL"
}

assert_pgpass_transport() {
  local operation=$1
  local expected_client=$2
  local expected_status=${3:-0}
  local actual_status
  reset_case
  TRANSPORT_FORBIDDEN_ENV_VALUE="${PRIVATE_PASSWORD}:with\\delimiters"
  TRANSPORT_EXPECTED_PGPASS="${DATABASE_HOST}:25060:social_monitor:${MIGRATOR_ROLE}:redacted-test-password\\:with\\\\delimiters"
  write_admin_url "$(publication_url_with_password \
    "${PRIVATE_PASSWORD}%3Awith%5Cdelimiters")"
  [[ $(reader_summary_publication_admin_pgpass "$SECRET") == \
    "$TRANSPORT_EXPECTED_PGPASS" ]]
  TRANSPORT_CLIENT_STATUS=$expected_status
  set +e
  case $operation in
    bootstrap)
      reader_summary_publication_run_postgres_client \
        "$SECRET" "$CA_CERTIFICATE" publication-transport-test \
        bootstrap "$READER_SUMMARY_PUBLICATION_RUNTIME_ROLE" '' \
        "$SCRIPT_DIR/reader-summary-publication-pre-migration.sql"
      actual_status=$?
      ;;
    catalog)
      reader_summary_publication_admin_catalog_query \
        "$SECRET" "$CA_CERTIFICATE" \
        "$READER_SUMMARY_PUBLICATION_RUNTIME_ROLE"
      actual_status=$?
      ;;
    availability)
      reader_summary_publication_run_postgres_client \
        "$SECRET" "$CA_CERTIFICATE" publication-transport-test \
        availability '' ''
      actual_status=$?
      ;;
  esac
  set -e
  ((actual_status == expected_status))
  grep -Fx "client:${expected_client}:mode=600" "$TRANSPORT_LOG" >/dev/null
  if [[ $operation == catalog ]]; then
    grep -Fx 'client:psql:catalog-file:mode=600' "$TRANSPORT_LOG" >/dev/null
    grep -Fx "docker:status=${expected_status}:query-removed" \
      "$TRANSPORT_LOG" >/dev/null
  fi
  grep -Fx "docker:status=${expected_status}:pgpass-removed" \
    "$TRANSPORT_LOG" >/dev/null
  [[ ! -e $ROOT/production.env ]]
  TEST_COUNT=$((TEST_COUNT + 1))
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

system_catalog_with_field() {
  local index=$1
  local value=$2
  local -a fields
  IFS='|' read -r -a fields <<< "$SYSTEM_VALID_CATALOG"
  fields[index]=$value
  local IFS='|'
  printf '%s' "${fields[*]}"
}

assert_redacted() {
  local output=$1
  local admin_url=$2
  [[ $output != *"$admin_url"* ]]
  [[ $output != *"$PRIVATE_PASSWORD"* ]]
  [[ $output != *"$API_PASSWORD"* ]]
  [[ $output != *"$SYSTEM_PASSWORD"* ]]
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

prepare_system_contract_case() {
  reset_case
  write_production_env \
    "DATABASE_URL=$API_URL" \
    "SYSTEM_DATABASE_URL_SECRET_REF=$ROOT/secrets/db/system-database-url"
  write_system_url "$SYSTEM_URL"
  TRANSPORT_FORBIDDEN_ENV_VALUE=$SYSTEM_PASSWORD
  TRANSPORT_EXPECTED_PGPASS="${DATABASE_HOST}:25060:social_monitor:${MIGRATOR_ROLE}:${PRIVATE_PASSWORD}"
  TRANSPORT_EXPECTED_SYSTEM_PGPASS="${DATABASE_HOST}:25060:social_monitor:${SYSTEM_ROLE}:${SYSTEM_PASSWORD}"
}

assert_system_contract_failure() {
  local label=$1
  local output status
  set +e
  output=$(ensure_system_database_url_deploy_contract 2>&1)
  status=$?
  set -e
  ((status != 0))
  assert_redacted "$output" "$VALID_URL"
  : "$label"
  TEST_COUNT=$((TEST_COUNT + 1))
}

prepare_system_contract_case
system_contract_output=$(ensure_system_database_url_deploy_contract 2>&1)
[[ -z $system_contract_output ]]
grep -Fx "SYSTEM_DATABASE_URL=$SYSTEM_URL" \
  "$ROOT/secrets/production.env" >/dev/null
[[ $(stat -c '%a' "$ROOT/secrets/production.env") == 600 ]]
grep -Fx 'client:psql:mode=600' "$TRANSPORT_LOG" >/dev/null
[[ $(grep -cFx 'client:psql:catalog-file:mode=600' "$TRANSPORT_LOG") == 2 ]]
TEST_COUNT=$((TEST_COUNT + 1))

prepare_system_contract_case
write_production_env "DATABASE_URL=$API_URL" "SYSTEM_DATABASE_URL=$API_URL"
assert_system_contract_failure api-database-url-not-system-fallback
[[ ! -s $TRANSPORT_LOG ]]

prepare_system_contract_case
write_system_url "$(runtime_url_for "$API_ROLE" "$SYSTEM_PASSWORD")"
assert_system_contract_failure wrong-system-login
[[ ! -s $TRANSPORT_LOG ]]

prepare_system_contract_case
SYSTEM_AUTH_QUERY_STATUS=28
assert_system_contract_failure wrong-system-password
! grep -F 'SYSTEM_DATABASE_URL=' "$ROOT/secrets/production.env" >/dev/null
grep -F 'docker:status=28:query-removed' "$TRANSPORT_LOG" >/dev/null

prepare_system_contract_case
SYSTEM_CATALOG_RESULT=$(system_catalog_with_field 18 f)
assert_system_contract_failure api-has-tenant-system-capability
! grep -F 'SYSTEM_DATABASE_URL=' "$ROOT/secrets/production.env" >/dev/null

assert_pgpass_transport bootstrap psql
assert_pgpass_transport catalog psql
assert_pgpass_transport availability pg_isready
assert_pgpass_transport catalog psql 37

reader_summary_publication_admin_catalog_query() {
  printf '%s\n' catalog-query >> "$EVENT_LOG"
  if ((CATALOG_QUERY_STATUS != 0)); then
    printf '%s\n' "$PRIVATE_QUERY_PAYLOAD"
    return "$CATALOG_QUERY_STATUS"
  fi
  printf '%s\n' "$CATALOG_RESULT"
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
assert_invalid_url encoded-password-newline \
  "$(publication_url_with_password "${PRIVATE_PASSWORD}%0A")"
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
assert_invalid_catalog missing-protected-creator-membership \
  "$(catalog_with_field 18 0)"
assert_invalid_catalog additional-outgoing-member \
  "$(catalog_with_field 18 2)"
assert_invalid_catalog unsafe-protected-creator-membership \
  "$(catalog_with_field 19 f)"
assert_invalid_catalog unsafe-public-schema-owner-boundary \
  "$(catalog_with_field 20 f)"

assert_deploy_backend_preflight_order() {
  local mode=$1
  local expected=$2
  local actual
  local orchestration_output
  local orchestration_log=$FIXTURE/orchestration-$mode.log
  local counter=$FIXTURE/orchestration-$mode.count
  : > "$orchestration_log"
  printf '0\n' > "$counter"
  set +e
  orchestration_output=$(
    SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
    SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
    SOCIAL_MONITOR_DEPLOY_REPO="$REPO" \
    SOCIAL_MONITOR_DEPLOY_CONTROL="$ROOT/control" \
    SOCIAL_MONITOR_DEPLOY_STATE="$ROOT/control/deploy-state" \
    ORCHESTRATION_LOG="$orchestration_log" \
    ORCHESTRATION_COUNTER="$counter" \
    ORCHESTRATION_MODE="$mode" \
    TARGET_LIBRARY_SHA="$TARGET_LIBRARY_SHA" \
      bash -c '
      set -euo pipefail
      source "$1"
      helper_path=$SOCIAL_MONITOR_DEPLOY_REPO/ops/deploy/postgres-backup-deploy-lib.sh
      stat() {
        local last_argument=${!#}
        if [[ $1 == -c && $2 == "%u %a" && \
              $last_argument == "$helper_path" ]]; then
          printf "0 %s\n" "$(command stat -c "%a" "$last_argument")"
        else
          command stat "$@"
        fi
      }
      sha=$TARGET_LIBRARY_SHA
      source "$2"
      declare -F create_pre_migration_database_backup >/dev/null
      declare -f backup_database | \
        grep -F "create_pre_migration_database_backup \"\$@\"" >/dev/null
      backend_services() { printf "%s\n" migrate; }
      marker_value() { printf "%s\n" 0123456789abcdef0123456789abcdef01234567; }
      backend_image_rescue_prepare() { printf "%s\n" capture >> "$ORCHESTRATION_LOG"; }
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
      ' _ "$DEPLOY_ENTRYPOINT" "$LIBRARY" 2>&1
  )
  local status=$?
  set -e
  ((status != 0))
  assert_redacted "$orchestration_output" "$VALID_URL"
  actual=$(< "$orchestration_log")
  if [[ $actual != "$expected" ]]; then
    printf 'validation-orchestration-mismatch:%s:status=%s:actual=%q:output=%q\n' \
      "$mode" "$status" "$actual" "$orchestration_output" >&2
    return 1
  fi
  TEST_COUNT=$((TEST_COUNT + 1))
}

assert_deploy_backend_preflight_order first-failure $'capture\npreflight:1'
assert_deploy_backend_preflight_order second-failure \
  $'capture\npreflight:1\ncompatibility\nbackup\nbuild\npreflight:2'

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
  'outgoing_memberships.membership_count' \
  'protected_creator_membership_valid' \
  'public_schema_ownership.boundary_valid' \
  'social_monitor_public_schema_owner' \
  'pg_catalog.pg_namespace namespace' \
  'pg_catalog.aclexplode' \
  'namespace.nspacl' \
  "schema_privilege.privilege_type = 'CREATE'" \
  "schema_owner.rolname = 'pg_database_owner'" \
  "database_owner.rolname = :'runtime_role'" \
  "pg_has_role(" \
  'outgoing_membership.roleid = migrator.oid' \
  "member_role.rolname = :'provisioner_role'" \
  'grantor_role.rolsuper' \
  'outgoing_membership.admin_option' \
  'NOT outgoing_membership.inherit_option' \
  'NOT outgoing_membership.set_option' \
  'runtime_membership.grantor = outgoing_membership.member' \
  'membership.admin_option' \
  'membership.inherit_option' \
  'membership.set_option' \
  'membership.grantor' \
  'provisioner_membership' \
  'pg_isready' \
  '--no-password'; do
  grep -F -- "$catalog_token" "$LIBRARY" >/dev/null
done

# shellcheck disable=SC2016
preflight_line=$(grep -n -F \
  'reader_summary_publication_migrator_preflight ||' \
  "$DEPLOY_ENTRYPOINT" | cut -d: -f1)
system_contract_line=$(grep -nF 'ensure_system_database_url_deploy_contract' \
  "$DEPLOY_ENTRYPOINT" | cut -d: -f1)
compose_render_line=$(grep -nF 'config --format json > "$rendered"' \
  "$DEPLOY_ENTRYPOINT" | cut -d: -f1)
# shellcheck disable=SC2016
backup_line=$(grep -n -F 'backup_database "$sha"' \
  "$DEPLOY_ENTRYPOINT" | cut -d: -f1)
# shellcheck disable=SC2016
build_line=$(grep -n -F \
  '"${COMPOSE[@]}" --profile app --profile daily build' \
  "$DEPLOY_ENTRYPOINT" | cut -d: -f1)
((preflight_line < backup_line && backup_line < build_line))
((system_contract_line < compose_render_line))

printf 'reader-summary-publication-migrator-validation: ok (%s cases)\n' \
  "$TEST_COUNT"
