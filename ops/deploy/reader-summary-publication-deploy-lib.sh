#!/usr/bin/env bash

# Sourced by social-monitor-production-deploy.sh. Publication migrations need
# a role-creating admin connection that is never placed in production.env or
# in a Docker command argument. The secret file contains only the PostgreSQL
# URL. Prisma reads its mounted copy inside the migration container; psql gets
# only a validated, decoded and escaped pgpass record over Docker stdin.

READER_SUMMARY_PUBLICATION_MIGRATOR_ROLE=social_monitor_publication_migrator
READER_SUMMARY_PUBLICATION_RUNTIME_ROLE=social_monitor_app
READER_SUMMARY_TENANT_SYSTEM_RUNTIME_ROLE=social_monitor_system_app
READER_SUMMARY_PUBLICATION_PROVISIONER_ROLE=doadmin
READER_SUMMARY_PUBLICATION_DATABASE=social_monitor
READER_SUMMARY_PUBLICATION_DATABASE_HOST=dbaas-db-8050451-do-user-39622063-0.e.db.ondigitalocean.com
READER_SUMMARY_PUBLICATION_DATABASE_PORT=25060
READER_SUMMARY_PUBLICATION_VALIDATION_ATTEMPTS=3
READER_SUMMARY_PUBLICATION_VALIDATION_RETRY_SECONDS=2

# This file is the authenticated target-publication wrapper loaded by the
# installed c59 deploy-control bridge. The bridge's local target SHA remains
# Bash-dynamically scoped while this file is sourced, so validate the adjacent
# target-only backup implementation here before returning to installed code.
! declare -F create_pre_migration_database_backup >/dev/null || \
  fail 'PostgreSQL backup entrypoint was loaded before target validation'

load_target_postgres_backup_deploy_library() {
  local target_sha=$1
  local relative_path=ops/deploy/postgres-backup-deploy-lib.sh
  local backup_library=$REPO/$relative_path
  local backup_real metadata owner permissions reviewed_digest actual_digest
  local target_entry target_mode target_type target_object target_path extra

  [[ $target_sha =~ ^[0-9a-f]{40}$ ]] || \
    fail 'target PostgreSQL backup deploy library SHA is invalid'
  [[ -f $backup_library && ! -L $backup_library ]] || \
    fail 'target PostgreSQL backup deploy library is not a regular non-symlink file'
  backup_real=$(readlink -f -- "$backup_library") || \
    fail 'target PostgreSQL backup deploy library path cannot be resolved'
  [[ $backup_real == "$REPO/$relative_path" ]] || \
    fail 'target PostgreSQL backup deploy library is outside its canonical integration path'
  metadata=$(stat -c '%u %a' "$backup_real") || \
    fail 'target PostgreSQL backup deploy library ownership and mode cannot be read'
  read -r owner permissions extra <<< "$metadata"
  [[ -z ${extra:-} && $owner == 0 ]] || \
    fail "target PostgreSQL backup deploy library is not root-owned (metadata=$metadata)"

  target_entry=$(git -C "$REPO" ls-tree "$target_sha" -- "$relative_path") || \
    fail 'target commit PostgreSQL backup deploy library cannot be inspected'
  read -r target_mode target_type target_object target_path extra \
    <<< "$target_entry"
  [[ -z ${extra:-} && \
     ($target_mode == 100644 || $target_mode == 100755) && \
     $target_type == blob && $target_object =~ ^[0-9a-f]{40}$ && \
     $target_path == "$relative_path" ]] || \
    fail 'target commit PostgreSQL backup deploy library is not a regular blob'
  if [[ $target_mode == 100644 ]]; then
    [[ $permissions == 644 ]] || \
      fail 'target PostgreSQL backup deploy library mode does not match its target Git mode'
  else
    [[ $permissions == 755 ]] || \
      fail 'target PostgreSQL backup deploy library mode does not match its target Git mode'
  fi

  reviewed_digest=$(
    deploy_control_git_blob_digest "$target_sha" "$relative_path"
  ) || fail 'target commit is missing the PostgreSQL backup deploy library'
  actual_digest=$(deploy_control_file_digest "$backup_real") || \
    fail 'target PostgreSQL backup deploy library digest cannot be read'
  [[ $actual_digest == "$reviewed_digest" ]] || \
    fail 'target PostgreSQL backup deploy library differs from reviewed target'

  # shellcheck source=/dev/null
  source "$backup_real" || \
    fail 'target PostgreSQL backup deploy library could not be loaded'
  declare -F create_pre_migration_database_backup >/dev/null || \
    fail 'target PostgreSQL backup deploy library is missing its backup entrypoint'
}

load_target_postgres_backup_deploy_library "${sha:-}"

backup_database() {
  create_pre_migration_database_backup "$@"
}

ensure_system_database_url_deploy_contract() (
  set +x
  local production_env=$ROOT/secrets/production.env approved_system_secret=$ROOT/secrets/db/system-database-url
  local admin_secret=$ROOT/secrets/db/reader-summary-publication-admin-url ca_certificate=$ROOT/secrets/db/ca-certificate.crt
  local effective_api_secret=$STATE/database-url.$$.secret effective_system_secret=$STATE/system-database-url.$$.secret
  local database_url system_database_url system_secret_ref
  local system_secret materialize_system_database_url=false
  trap 'rm -f "$effective_api_secret" "$effective_system_secret"' EXIT
  reader_summary_publication_private_file_valid "$production_env" '600' || \
    fail 'production env file must be root-owned with mode 0600 before deploy'
  reader_summary_publication_private_file_valid "$admin_secret" '400' || \
    fail 'publication admin secret must be root-owned with mode 0400 before deploy'
  reader_summary_publication_private_file_valid "$ca_certificate" '400|444|644' || \
    fail 'database CA certificate must be root-owned before deploy'
  IFS=$'\037' read -r database_url system_database_url system_secret_ref < <(
    reader_summary_publication_env_contract_values "$production_env"
  )
  [[ -n $database_url ]] || fail 'DATABASE_URL is missing from production env'
  umask 077
  printf '%s\n' "$database_url" > "$effective_api_secret"
  if [[ -z $system_database_url ]]; then
    if [[ -z $system_secret_ref ]]; then
      system_secret_ref=$approved_system_secret
    fi
    [[ $system_secret_ref == "$approved_system_secret" ]] || fail 'SYSTEM_DATABASE_URL_SECRET_REF must point to the approved root-owned social_monitor_system_app DSN file; deploy will not reuse DATABASE_URL.'
    reader_summary_publication_repair_private_file_mode "$approved_system_secret" '400|600' '600' || \
      fail 'SYSTEM_DATABASE_URL secret file must be root-owned with mode 0400 or 0600'
    system_secret=$approved_system_secret
    materialize_system_database_url=true
  else
    printf '%s\n' "$system_database_url" > "$effective_system_secret"
    system_secret=$effective_system_secret
  fi
  reader_summary_publication_validate_runtime_database_urls \
    "$effective_api_secret" "$system_secret" || \
    fail 'SYSTEM_DATABASE_URL must be a separate social_monitor_system_app PostgreSQL URL with verify-full TLS; do not reuse DATABASE_URL'
  validate_reader_summary_system_runtime_role "$admin_secret" "$ca_certificate" || \
    fail 'SYSTEM_DATABASE_URL role validation failed; provision social_monitor_system_app with tenant-system capability before deploy'
  validate_reader_summary_system_database_auth "$system_secret" "$ca_certificate" || \
    fail 'SYSTEM_DATABASE_URL authentication failed; verify the social_monitor_system_app secret before deploy'
  if [[ $materialize_system_database_url == true ]]; then
    reader_summary_publication_materialize_system_database_url \
      "$production_env" "$system_secret" || \
      fail 'SYSTEM_DATABASE_URL could not be materialized into the root-owned production env file'
    IFS=$'\037' read -r database_url system_database_url system_secret_ref < <(
      reader_summary_publication_env_contract_values "$production_env"
    )
  fi
  [[ -n $database_url && -n $system_database_url ]]
)

reader_summary_publication_env_contract_values() {
  local production_env=$1

  python3 - "$production_env" <<'PY'
import re
import sys
from pathlib import Path

names = ("DATABASE_URL", "SYSTEM_DATABASE_URL", "SYSTEM_DATABASE_URL_SECRET_REF")
values = {}
for raw_line in Path(sys.argv[1]).read_text(encoding="utf-8").splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#"):
        continue
    match = re.match(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$", line)
    key = match.group(1) if match else None
    if key not in names:
        continue
    if key in values:
        raise SystemExit(1)
    value = match.group(2)
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1]
    values[key] = value
print("\x1f".join(values.get(name, "") for name in names))
PY
}

reader_summary_publication_private_file_valid() {
  local path=$1 allowed_modes=$2
  local metadata owner mode

  [[ -f $path && ! -L $path && -s $path ]] || return 1
  metadata=$(reader_summary_publication_admin_secret_metadata "$path" 2>/dev/null) || return 1
  IFS='|' read -r owner mode <<< "$metadata"
  [[ $owner == root && "|$allowed_modes|" == *"|$mode|"* ]]
}

reader_summary_publication_repair_private_file_mode() {
  local path=$1 allowed_modes=$2 repaired_mode=$3
  local metadata owner mode

  reader_summary_publication_private_file_valid "$path" "$allowed_modes" && return 0
  [[ -f $path && ! -L $path && -s $path ]] || return 1
  metadata=$(reader_summary_publication_admin_secret_metadata "$path" 2>/dev/null) || return 1
  IFS='|' read -r owner mode <<< "$metadata"
  [[ $owner == root ]] || return 1
  [[ $repaired_mode =~ ^[0-7]{3}$ && "|$allowed_modes|" == *"|$repaired_mode|"* ]] || return 1
  chmod "$repaired_mode" "$path" || return 1
  reader_summary_publication_private_file_valid "$path" "$allowed_modes"
}

reader_summary_publication_validate_runtime_database_urls() (
  set +x
  local api_secret=$1 system_secret=$2 api_url system_url
  api_url=$(< "$api_secret"); system_url=$(< "$system_secret")
  [[ $api_url != "$system_url" ]] || return 1
  READER_SUMMARY_PUBLICATION_MIGRATOR_ROLE=$READER_SUMMARY_PUBLICATION_RUNTIME_ROLE \
    reader_summary_publication_admin_pgpass "$api_secret" >/dev/null || return 1
  READER_SUMMARY_PUBLICATION_MIGRATOR_ROLE=$READER_SUMMARY_TENANT_SYSTEM_RUNTIME_ROLE \
    reader_summary_publication_admin_pgpass "$system_secret" >/dev/null
)

reader_summary_publication_materialize_system_database_url() (
  set +x
  local production_env=$1 system_secret=$2
  local temp=$production_env.system.$$ next=$production_env.next.$$

  trap 'rm -f "$temp" "$next"' EXIT
  umask 077
  python3 - "$production_env" "$system_secret" "$temp" <<'PY'
import re
import sys
from pathlib import Path

production_env, system_secret, temp = map(Path, sys.argv[1:])
value = system_secret.read_text(encoding="utf-8").rstrip("\n")
if not value or "\n" in value or "\r" in value:
    raise SystemExit(1)
output = []
written = False
for line in production_env.read_text(encoding="utf-8").splitlines():
    if re.match(r"^\s*(?:export\s+)?SYSTEM_DATABASE_URL\s*=", line):
        if not written:
            line = f"SYSTEM_DATABASE_URL={value}"
            written = True
        else:
            continue
    output.append(line)
if not written:
    output.append(f"SYSTEM_DATABASE_URL={value}")
temp.write_text("\n".join(output) + "\n", encoding="utf-8")
PY
  if ((EUID == 0)) && [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    install -m 0600 -o root -g root "$temp" "$next"
  else
    install -m 0600 "$temp" "$next"
  fi
  mv -f "$next" "$production_env"
)

validate_reader_summary_system_runtime_role() (
  set +x
  local secret=$1
  local ca_certificate=$2
  local catalog_result catalog_delimiters
  local database_name system_role can_login inherits_role is_superuser can_create_database
  local can_create_role can_replicate can_bypass_rls runtime_count runtime_admin
  local runtime_inherit runtime_set system_count system_admin system_inherit
  local system_set unexpected_membership_count api_lacks_system_membership
  local server_version uses_tls extra

  catalog_result=$(reader_summary_publication_system_runtime_catalog_query "$secret" "$ca_certificate" 2>/dev/null) || return 65
  [[ -n $catalog_result && $catalog_result != *$'\n'* ]] || return 65
  catalog_delimiters=${catalog_result//[!|]/}
  ((${#catalog_delimiters} == 20)) || return 65
  IFS='|' read -r database_name system_role can_login inherits_role is_superuser can_create_database can_create_role can_replicate can_bypass_rls runtime_count runtime_admin runtime_inherit runtime_set system_count system_admin system_inherit system_set unexpected_membership_count api_lacks_system_membership server_version uses_tls extra <<< "$catalog_result"

  [[ -z $extra && $database_name == "$READER_SUMMARY_PUBLICATION_DATABASE" && \
    $system_role == "$READER_SUMMARY_TENANT_SYSTEM_RUNTIME_ROLE" ]] || return 65
  [[ $can_login == t && $inherits_role == t && $is_superuser == f && \
    $can_create_database == f && $can_create_role == f && \
    $can_replicate == f && $can_bypass_rls == f ]] || return 65
  [[ $runtime_count == 1 && $runtime_admin == f && $runtime_inherit == t && \
    $runtime_set == f && $system_count == 1 && $system_admin == f && \
    $system_inherit == t && $system_set == f ]] || return 65
  [[ $unexpected_membership_count == 0 && $api_lacks_system_membership == t ]] || return 65
  [[ $server_version =~ ^18[0-9]{4}$ && $uses_tls == t ]] || return 65
)

reader_summary_publication_system_runtime_catalog_query() {
  local secret=$1 ca_certificate=$2 query="
SELECT current_database(), system_role.rolname, system_role.rolcanlogin,
  system_role.rolinherit, system_role.rolsuper, system_role.rolcreatedb,
  system_role.rolcreaterole, system_role.rolreplication,
  system_role.rolbypassrls, COALESCE(membership.runtime_count, 0),
  COALESCE(membership.runtime_admin, false),
  COALESCE(membership.runtime_inherit, false),
  COALESCE(membership.runtime_set, false),
  COALESCE(membership.system_count, 0),
  COALESCE(membership.system_admin, false),
  COALESCE(membership.system_inherit, false),
  COALESCE(membership.system_set, false),
  COALESCE(membership.unexpected_count, 0),
  NOT pg_catalog.pg_has_role(:'runtime_role',
    'social_monitor_tenant_system_runtime', 'MEMBER'),
  current_setting('server_version_num')::INTEGER, COALESCE(connection.ssl, false)
FROM pg_catalog.pg_roles AS system_role
LEFT JOIN pg_catalog.pg_stat_ssl AS connection
  ON connection.pid = pg_catalog.pg_backend_pid()
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE granted.rolname = :'runtime_role') AS runtime_count,
    BOOL_OR(membership.admin_option) FILTER (WHERE granted.rolname = :'runtime_role') AS runtime_admin,
    BOOL_OR(membership.inherit_option) FILTER (WHERE granted.rolname = :'runtime_role') AS runtime_inherit,
    BOOL_OR(membership.set_option) FILTER (WHERE granted.rolname = :'runtime_role') AS runtime_set,
    COUNT(*) FILTER (WHERE granted.rolname = 'social_monitor_tenant_system_runtime') AS system_count,
    BOOL_OR(membership.admin_option) FILTER (WHERE granted.rolname = 'social_monitor_tenant_system_runtime') AS system_admin,
    BOOL_OR(membership.inherit_option) FILTER (WHERE granted.rolname = 'social_monitor_tenant_system_runtime') AS system_inherit,
    BOOL_OR(membership.set_option) FILTER (WHERE granted.rolname = 'social_monitor_tenant_system_runtime') AS system_set,
    COUNT(*) FILTER (WHERE granted.rolname NOT IN (
      :'runtime_role', 'social_monitor_tenant_system_runtime'
    )) AS unexpected_count
  FROM pg_catalog.pg_auth_members AS membership
  JOIN pg_catalog.pg_roles AS granted
    ON granted.oid = membership.roleid
  WHERE membership.member = system_role.oid
) AS membership ON true
WHERE system_role.rolname = :'system_runtime_role';"

  reader_summary_publication_run_postgres_client \
    "$secret" "$ca_certificate" \
    social-monitor/system-runtime-validation \
    catalog "$READER_SUMMARY_PUBLICATION_RUNTIME_ROLE" "$query"
}

validate_reader_summary_system_database_auth() (
  set +x
  local secret=$1
  local ca_certificate=$2
  local auth_result auth_delimiters
  local database_name current_identity session_identity has_system_capability
  local uses_tls extra

  auth_result=$(reader_summary_publication_system_database_auth_query "$secret" "$ca_certificate" 2>/dev/null) || return 65
  [[ -n $auth_result && $auth_result != *$'\n'* ]] || return 65
  auth_delimiters=${auth_result//[!|]/}
  ((${#auth_delimiters} == 4)) || return 65
  IFS='|' read -r database_name current_identity session_identity \
    has_system_capability uses_tls extra <<< "$auth_result"

  [[ -z $extra && $database_name == "$READER_SUMMARY_PUBLICATION_DATABASE" && \
    $current_identity == "$READER_SUMMARY_TENANT_SYSTEM_RUNTIME_ROLE" && \
    $session_identity == "$READER_SUMMARY_TENANT_SYSTEM_RUNTIME_ROLE" && \
    $has_system_capability == t && $uses_tls == t ]] || return 65
)

reader_summary_publication_system_database_auth_query() (
  set +x
  local secret=$1 ca_certificate=$2 query="
SELECT current_database(), current_user, session_user,
  pg_catalog.pg_has_role(
    current_user, 'social_monitor_tenant_system_runtime', 'MEMBER'
  ), COALESCE(connection.ssl, false)
FROM pg_catalog.pg_stat_ssl AS connection
WHERE connection.pid = pg_catalog.pg_backend_pid();"

  READER_SUMMARY_PUBLICATION_MIGRATOR_ROLE=$READER_SUMMARY_TENANT_SYSTEM_RUNTIME_ROLE \
    reader_summary_publication_run_postgres_client \
      "$secret" "$ca_certificate" \
      social-monitor/system-runtime-authentication \
      catalog "$READER_SUMMARY_PUBLICATION_RUNTIME_ROLE" "$query"
)

reader_summary_publication_migrator_preflight() {
  local secret=$ROOT/secrets/db/reader-summary-publication-admin-url
  local ca_certificate=$ROOT/secrets/db/ca-certificate.crt
  local attempt status

  for ((attempt = 1; attempt <= READER_SUMMARY_PUBLICATION_VALIDATION_ATTEMPTS; attempt++)); do
    if validate_reader_summary_publication_migrator \
      "$secret" "$ca_certificate" \
      "$READER_SUMMARY_PUBLICATION_RUNTIME_ROLE"; then
      return 0
    else
      status=$?
    fi
    [[ $status == 75 ]] || return "$status"
    ((attempt < READER_SUMMARY_PUBLICATION_VALIDATION_ATTEMPTS)) || \
      return "$status"
    sleep "$READER_SUMMARY_PUBLICATION_VALIDATION_RETRY_SECONDS"
  done
}

deploy_reader_summary_publication_migrations() {
  local secret=$ROOT/secrets/db/reader-summary-publication-admin-url
  local ca_certificate=$ROOT/secrets/db/ca-certificate.crt
  local runtime_role=$READER_SUMMARY_PUBLICATION_RUNTIME_ROLE

  reader_summary_publication_migrator_preflight ||
    fail 'reader summary publication migrator validation failed'

  run_reader_summary_publication_admin_sql \
    "$secret" "$ca_certificate" "$runtime_role" pre || return

  # shellcheck disable=SC2016 # Expansion occurs in the child shell.
  "${COMPOSE[@]}" --profile app run -T --rm --no-deps \
    --user 0:0 \
    -v "$secret:/run/secrets/reader-summary-publication-admin-url:ro" \
    -v "$ca_certificate:/run/social-monitor-db/ca-certificate.crt:ro" \
    migrate sh -c '
      set -eu
      DATABASE_URL=$(cat /run/secrets/reader-summary-publication-admin-url)
      export DATABASE_URL
      exec npm run migrate:deploy
    ' || return

  run_reader_summary_publication_admin_sql \
    "$secret" "$ca_certificate" "$runtime_role" post || return
}

run_reader_summary_publication_admin_sql() {
  local secret=$1
  local ca_certificate=$2
  local runtime_role=$3
  local phase=$4
  local sql=$REPO/ops/deploy/reader-summary-publication-${phase}-migration.sql

  [[ $phase == pre || $phase == post ]] ||
    fail 'reader summary publication bootstrap phase is invalid'
  [[ -f $sql && ! -L $sql ]] ||
    fail "reader summary publication $phase-migration SQL is unavailable"

  reader_summary_publication_run_postgres_client \
    "$secret" "$ca_certificate" \
    "social-monitor/publication-$phase-migration" \
    bootstrap "$runtime_role" '' "$sql"
}

validate_reader_summary_publication_migrator() (
  set +x
  local secret=$1
  local ca_certificate=$2
  local runtime_role=$3
  local metadata mode owner ca_metadata ca_mode ca_owner
  local catalog_result catalog_delimiters
  local database_name current_identity session_identity
  local can_login can_create_role inherits_role
  local is_superuser can_create_database can_replicate can_bypass_rls
  local server_version uses_tls membership_count membership_admin
  local membership_inherit membership_set protected_memberships_valid
  local unexpected_membership_count outgoing_membership_count
  local protected_creator_membership_valid public_schema_boundary_valid extra
  local query_status availability_status

  [[ -f $secret && ! -L $secret && -s $secret ]] || return 64
  metadata=$(reader_summary_publication_admin_secret_metadata \
    "$secret" 2>/dev/null) || return 64
  IFS='|' read -r owner mode <<< "$metadata"
  [[ $owner == root && $mode == 400 ]] || return 64
  [[ -f $ca_certificate && ! -L $ca_certificate && -s $ca_certificate ]] || \
    return 64
  ca_metadata=$(reader_summary_publication_admin_secret_metadata \
    "$ca_certificate" 2>/dev/null) || return 64
  IFS='|' read -r ca_owner ca_mode <<< "$ca_metadata"
  [[ $ca_owner == root && $ca_mode =~ ^(400|444|644)$ ]] || return 64
  [[ $runtime_role == "$READER_SUMMARY_PUBLICATION_RUNTIME_ROLE" ]] || \
    return 64

  reader_summary_publication_validate_admin_url "$secret" || return 64
  if reader_summary_publication_admin_availability_query \
    "$secret" "$ca_certificate" >/dev/null 2>&1; then
    :
  else
    availability_status=$?
    [[ $availability_status == 1 || $availability_status == 2 ]] && return 75
    return 65
  fi
  if catalog_result=$(reader_summary_publication_admin_catalog_query \
    "$secret" "$ca_certificate" "$runtime_role" 2>/dev/null); then
    :
  else
    query_status=$?
    # Availability has already been retried separately. Any catalog failure,
    # including authentication, TLS, SQL and privilege errors, is permanent
    # for this release attempt.
    : "$query_status"
    return 65
  fi
  [[ -n $catalog_result && $catalog_result != *$'\n'* ]] || return 65
  catalog_delimiters=${catalog_result//[!|]/}
  ((${#catalog_delimiters} == 20)) || return 65

  IFS='|' read -r database_name current_identity session_identity \
    can_login can_create_role inherits_role is_superuser \
    can_create_database can_replicate can_bypass_rls server_version \
    uses_tls membership_count membership_admin membership_inherit \
    membership_set protected_memberships_valid \
    unexpected_membership_count outgoing_membership_count \
    protected_creator_membership_valid public_schema_boundary_valid extra \
    <<< "$catalog_result"

  [[ -z $extra && \
    $database_name == "$READER_SUMMARY_PUBLICATION_DATABASE" ]] || return 65
  [[ $current_identity == "$READER_SUMMARY_PUBLICATION_MIGRATOR_ROLE" ]] || \
    return 65
  [[ $current_identity == "$session_identity" ]] || return 65
  [[ $can_login == t && $can_create_role == t && $inherits_role == t ]] ||
    return 65
  [[ $is_superuser == f && $can_create_database == f ]] || return 65
  [[ $can_replicate == f && $can_bypass_rls == f ]] || return 65
  [[ $server_version =~ ^18[0-9]{4}$ ]] || return 65
  [[ $uses_tls == t && $membership_count == 1 ]] || return 65
  [[ $membership_admin == t ]] || return 65
  [[ $membership_inherit == f && $membership_set == t ]] || return 65
  [[ $protected_memberships_valid == t ]] || return 65
  [[ $unexpected_membership_count == 0 ]] || return 65
  [[ $outgoing_membership_count == 1 ]] || return 65
  [[ $protected_creator_membership_valid == t ]] || return 65
  [[ $public_schema_boundary_valid == t ]] || return 65
)

reader_summary_publication_admin_secret_metadata() {
  stat -c '%U|%a' "$1"
}

reader_summary_publication_validate_admin_url() {
  local secret=$1

  reader_summary_publication_admin_pgpass "$secret" >/dev/null 2>&1
}

reader_summary_publication_admin_pgpass() {
  local secret=$1

  python3 - "$secret" \
    "$READER_SUMMARY_PUBLICATION_MIGRATOR_ROLE" \
    "$READER_SUMMARY_PUBLICATION_DATABASE_HOST" \
    "$READER_SUMMARY_PUBLICATION_DATABASE_PORT" \
    "$READER_SUMMARY_PUBLICATION_DATABASE" <<'PY'
import re
import sys
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlsplit

try:
    raw = Path(sys.argv[1]).read_bytes()
    if raw.endswith(b"\n"):
        raw = raw[:-1]
    value = raw.decode("utf-8", errors="strict")
    if not value or any(ord(character) <= 0x20 for character in value):
        raise ValueError
    if "\\" in value or re.search(r"%(?![0-9A-Fa-f]{2})", value):
        raise ValueError
    if not value.startswith(("postgresql://", "postgres://")):
        raise ValueError

    parsed = urlsplit(value)
    if parsed.fragment or parsed.netloc.count("@") != 1:
        raise ValueError
    expected_user, expected_host, expected_port, expected_database = sys.argv[2:]
    username = unquote(parsed.username or "", errors="strict")
    password = unquote(parsed.password or "", errors="strict")
    database_path = unquote(parsed.path, errors="strict")
    if username != expected_user:
        raise ValueError
    if parsed.password is None or not password:
        raise ValueError
    if parsed.hostname != expected_host or not parsed.hostname.isascii():
        raise ValueError
    if parsed.port != int(expected_port):
        raise ValueError
    if database_path != f"/{expected_database}":
        raise ValueError
    decoded_fields = [parsed.hostname, str(parsed.port), expected_database, username, password]
    if any(any(ord(character) <= 0x20 for character in field) for field in decoded_fields):
        raise ValueError
    if not parsed.query or parsed.query.startswith("&") or parsed.query.endswith("&"):
        raise ValueError
    if "&&" in parsed.query:
        raise ValueError

    parameters = parse_qsl(
        parsed.query,
        keep_blank_values=True,
        strict_parsing=True,
        separator="&",
    )
    if len(parameters) != len(dict(parameters)):
        raise ValueError
    parameter_values = dict(parameters)
    if not set(parameter_values).issubset(
        {"connect_timeout", "sslmode", "sslrootcert"}
    ):
        raise ValueError
    if "connect_timeout" in parameter_values:
        timeout = parameter_values["connect_timeout"]
        if not timeout.isdecimal() or not 1 <= int(timeout) <= 15:
            raise ValueError
    if parameter_values.get("sslmode") != "verify-full":
        raise ValueError
    if parameter_values.get("sslrootcert") != (
        "/run/social-monitor-db/ca-certificate.crt"
    ):
        raise ValueError
    def pgpass_escape(field):
        return field.replace("\\", "\\\\").replace(":", "\\:")

    print(":".join(pgpass_escape(field) for field in decoded_fields))
except (OSError, UnicodeError, ValueError):
    raise SystemExit(1)
PY
}

reader_summary_publication_run_postgres_client() (
  set -o pipefail
  local secret=$1
  local ca_certificate=$2
  local application_name=$3
  local operation=$4
  local runtime_role=$5
  local query=$6
  local sql=${7:-}
  local postgres_image=postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15
  local -a docker_arguments=(
    run --rm -i
    --user 0:0
    -v "$ca_certificate:/run/social-monitor-db/ca-certificate.crt:ro"
  )

  [[ $operation == bootstrap || $operation == catalog || \
    $operation == availability ]] || return 64
  if [[ $operation == bootstrap ]]; then
    [[ -f $sql && ! -L $sql ]] || return 64
    docker_arguments+=(
      -v "$sql:/run/social-monitor-db/publication-migration.sql:ro"
    )
  else
    [[ -z $sql ]] || return 64
  fi

  reader_summary_publication_admin_pgpass "$secret" |
    docker "${docker_arguments[@]}" \
      "$postgres_image" \
      sh -c '
        set -eu
        host=$1
        port=$2
        database=$3
        username=$4
        application_name=$5
        operation=$6
        runtime_role=$7
        query=$8
        provisioner_role=$9
        system_runtime_role=${10}
        pgpass_file=
        query_file=
        cleanup_postgres_client_files() {
          if [ -n "$pgpass_file" ]; then
            rm -f -- "$pgpass_file"
          fi
          if [ -n "$query_file" ]; then
            rm -f -- "$query_file"
          fi
        }
        trap cleanup_postgres_client_files EXIT
        trap "exit 129" HUP
        trap "exit 130" INT
        trap "exit 143" TERM
        umask 077
        pgpass_file=$(mktemp /tmp/social-monitor-pgpass.XXXXXX)
        cat > "$pgpass_file"
        chmod 0600 "$pgpass_file"
        [ -s "$pgpass_file" ]
        PGPASSFILE=$pgpass_file
        PGAPPNAME=$application_name
        PGSSLMODE=verify-full
        PGSSLROOTCERT=/run/social-monitor-db/ca-certificate.crt
        export PGPASSFILE PGAPPNAME PGSSLMODE PGSSLROOTCERT

        case $operation in
          bootstrap)
            psql -X --no-password -v ON_ERROR_STOP=1 \
              --host="$host" --port="$port" --dbname="$database" \
              --username="$username" --set=runtime_role="$runtime_role" \
              --set=system_runtime_role="$system_runtime_role" \
              --file=/run/social-monitor-db/publication-migration.sql
            ;;
          catalog)
            PGCONNECT_TIMEOUT=15
            export PGCONNECT_TIMEOUT
            query_file=$(mktemp /tmp/social-monitor-catalog-query.XXXXXX)
            printf "%s\n" "$query" > "$query_file"
            chmod 0600 "$query_file"
            [ -s "$query_file" ]
            psql -X -A -t -F "|" --no-password -v ON_ERROR_STOP=1 \
              --host="$host" --port="$port" --dbname="$database" \
              --username="$username" --set=runtime_role="$runtime_role" \
              --set=provisioner_role="$provisioner_role" \
              --set=system_runtime_role="$system_runtime_role" \
              --file="$query_file"
            ;;
          availability)
            pg_isready -q -t 15 \
              --host="$host" --port="$port" --dbname="$database" \
              --username="$username"
            ;;
          *)
            exit 64
            ;;
        esac
      ' _ \
      "$READER_SUMMARY_PUBLICATION_DATABASE_HOST" \
      "$READER_SUMMARY_PUBLICATION_DATABASE_PORT" \
      "$READER_SUMMARY_PUBLICATION_DATABASE" \
      "$READER_SUMMARY_PUBLICATION_MIGRATOR_ROLE" \
      "$application_name" "$operation" "$runtime_role" "$query" \
      "$READER_SUMMARY_PUBLICATION_PROVISIONER_ROLE" \
      "$READER_SUMMARY_TENANT_SYSTEM_RUNTIME_ROLE"
)

reader_summary_publication_admin_catalog_query() {
  local secret=$1
  local ca_certificate=$2
  local runtime_role=$3
  local query="
SELECT
  current_database(),
  current_user,
  session_user,
  migrator.rolcanlogin,
  migrator.rolcreaterole,
  migrator.rolinherit,
  migrator.rolsuper,
  migrator.rolcreatedb,
  migrator.rolreplication,
  migrator.rolbypassrls,
  current_setting('server_version_num')::INTEGER,
  COALESCE(connection.ssl, false),
  COALESCE(membership.expected_membership_count, 0),
  COALESCE(membership.admin_option, false),
  COALESCE(membership.inherit_option, false),
  COALESCE(membership.set_option, false),
  COALESCE(membership.protected_memberships_valid, false),
  COALESCE(membership.unexpected_membership_count, 0),
  COALESCE(outgoing_memberships.membership_count, 0),
  COALESCE(outgoing_memberships.protected_creator_membership_valid, false),
  COALESCE(public_schema_ownership.boundary_valid, false)
FROM pg_catalog.pg_roles AS migrator
LEFT JOIN pg_catalog.pg_stat_ssl AS connection
  ON connection.pid = pg_catalog.pg_backend_pid()
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (
      WHERE granted_role.rolname = :'runtime_role'
    ) AS expected_membership_count,
    BOOL_OR(membership.admin_option) FILTER (
      WHERE granted_role.rolname = :'runtime_role'
    ) AS admin_option,
    BOOL_OR(membership.inherit_option) FILTER (
      WHERE granted_role.rolname = :'runtime_role'
    ) AS inherit_option,
    BOOL_OR(membership.set_option) FILTER (
      WHERE granted_role.rolname = :'runtime_role'
    ) AS set_option,
    (
      (
        NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_roles
          WHERE rolname = 'social_monitor_public_schema_owner'
        ) AND COUNT(*) FILTER (
          WHERE granted_role.rolname =
            'social_monitor_public_schema_owner'
        ) = 0
      ) OR (
        EXISTS (
          SELECT 1 FROM pg_catalog.pg_roles
          WHERE rolname = 'social_monitor_public_schema_owner'
        ) AND COUNT(*) FILTER (
          WHERE granted_role.rolname =
            'social_monitor_public_schema_owner'
        ) = 2 AND COUNT(*) FILTER (
          WHERE granted_role.rolname =
            'social_monitor_public_schema_owner'
            AND membership.admin_option
            AND NOT membership.inherit_option
            AND NOT membership.set_option
            AND grantor_role.rolsuper
        ) = 1 AND COUNT(*) FILTER (
          WHERE granted_role.rolname =
            'social_monitor_public_schema_owner'
            AND NOT membership.admin_option
            AND NOT membership.inherit_option
            AND membership.set_option
            AND grantor_role.rolname = current_user
        ) = 1
      )
    ) AND (
      (
        NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_roles
          WHERE rolname =
            'social_monitor_reader_summary_publication_owner'
        ) AND COUNT(*) FILTER (
          WHERE granted_role.rolname =
            'social_monitor_reader_summary_publication_owner'
        ) = 0
      ) OR (
        EXISTS (
          SELECT 1 FROM pg_catalog.pg_roles
          WHERE rolname =
            'social_monitor_reader_summary_publication_owner'
        ) AND COUNT(*) FILTER (
          WHERE granted_role.rolname =
            'social_monitor_reader_summary_publication_owner'
        ) = 2 AND COUNT(*) FILTER (
          WHERE granted_role.rolname =
            'social_monitor_reader_summary_publication_owner'
            AND membership.admin_option
            AND NOT membership.inherit_option
            AND NOT membership.set_option
            AND grantor_role.rolsuper
        ) = 1 AND COUNT(*) FILTER (
          WHERE granted_role.rolname =
            'social_monitor_reader_summary_publication_owner'
            AND NOT membership.admin_option
            AND NOT membership.inherit_option
            AND membership.set_option
            AND grantor_role.rolname = current_user
        ) = 1
      )
    ) AND (
      (
        NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_roles
          WHERE rolname =
            'social_monitor_reader_summary_publication_runtime'
        ) AND COUNT(*) FILTER (
          WHERE granted_role.rolname =
            'social_monitor_reader_summary_publication_runtime'
        ) = 0
      ) OR (
        EXISTS (
          SELECT 1 FROM pg_catalog.pg_roles
          WHERE rolname =
            'social_monitor_reader_summary_publication_runtime'
        ) AND COUNT(*) FILTER (
          WHERE granted_role.rolname =
            'social_monitor_reader_summary_publication_runtime'
        ) = 1 AND BOOL_AND(
        CASE WHEN granted_role.rolname =
          'social_monitor_reader_summary_publication_runtime'
        THEN membership.admin_option
          AND NOT membership.inherit_option
          AND NOT membership.set_option
          AND grantor_role.rolsuper
        ELSE true END
        )
      )
    ) AND BOOL_AND(
      CASE WHEN granted_role.rolname = :'runtime_role'
      THEN grantor_role.rolname = :'provisioner_role'
        AND grantor_role.rolcreaterole
        AND EXISTS (
          SELECT 1
          FROM pg_catalog.pg_auth_members AS provisioner_membership
          JOIN pg_catalog.pg_roles AS root_grantor
            ON root_grantor.oid = provisioner_membership.grantor
          WHERE provisioner_membership.roleid = membership.roleid
            AND provisioner_membership.member = membership.grantor
            AND provisioner_membership.admin_option
            AND NOT provisioner_membership.inherit_option
            AND NOT provisioner_membership.set_option
            AND root_grantor.rolsuper
        )
      ELSE true END
    ) AS protected_memberships_valid,
    COUNT(*) FILTER (
      WHERE granted_role.rolname NOT IN (
        :'runtime_role',
        'social_monitor_public_schema_owner',
        'social_monitor_reader_summary_publication_owner',
        'social_monitor_reader_summary_publication_runtime'
      )
    ) AS unexpected_membership_count
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS granted_role
      ON granted_role.oid = membership.roleid
    JOIN pg_catalog.pg_roles AS member_role
      ON member_role.oid = membership.member
    JOIN pg_catalog.pg_roles AS grantor_role
      ON grantor_role.oid = membership.grantor
    WHERE member_role.rolname = current_user
) AS membership ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS membership_count,
    BOOL_AND(
      member_role.rolname = :'provisioner_role'
      AND grantor_role.rolsuper
      AND outgoing_membership.admin_option
      AND NOT outgoing_membership.inherit_option
      AND NOT outgoing_membership.set_option
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_auth_members AS runtime_membership
        JOIN pg_catalog.pg_roles AS runtime_granted_role
          ON runtime_granted_role.oid = runtime_membership.roleid
        JOIN pg_catalog.pg_auth_members AS provisioner_membership
          ON provisioner_membership.roleid = runtime_membership.roleid
          AND provisioner_membership.member = runtime_membership.grantor
        JOIN pg_catalog.pg_roles AS bootstrap_grantor
          ON bootstrap_grantor.oid = provisioner_membership.grantor
        WHERE runtime_granted_role.rolname = :'runtime_role'
          AND runtime_membership.member = migrator.oid
          AND runtime_membership.grantor = outgoing_membership.member
          AND runtime_membership.admin_option
          AND NOT runtime_membership.inherit_option
          AND runtime_membership.set_option
          AND provisioner_membership.admin_option
          AND NOT provisioner_membership.inherit_option
          AND NOT provisioner_membership.set_option
          AND bootstrap_grantor.rolsuper
      )
    ) AS protected_creator_membership_valid
  FROM pg_catalog.pg_auth_members AS outgoing_membership
  JOIN pg_catalog.pg_roles AS member_role
    ON member_role.oid = outgoing_membership.member
  JOIN pg_catalog.pg_roles AS grantor_role
    ON grantor_role.oid = outgoing_membership.grantor
  WHERE outgoing_membership.roleid = migrator.oid
) AS outgoing_memberships ON true
LEFT JOIN LATERAL (
  SELECT (
    (
      schema_owner.rolname = 'pg_database_owner'
      AND database_owner.rolname = :'runtime_role'
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = 'social_monitor_public_schema_owner'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(
          COALESCE(
            namespace.nspacl,
            pg_catalog.acldefault('n', namespace.nspowner)
          )
        ) schema_privilege
        LEFT JOIN pg_catalog.pg_roles schema_grantee
          ON schema_grantee.oid = schema_privilege.grantee
        WHERE schema_privilege.privilege_type = 'CREATE'
          AND (
            schema_privilege.grantee = 0
            OR schema_grantee.rolname NOT IN (
              'pg_database_owner',
              current_user,
              :'runtime_role',
              'social_monitor_reader_summary_publication_owner'
            )
          )
      )
    ) OR (
      schema_owner.rolname = 'social_monitor_public_schema_owner'
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles protected_schema_owner
        WHERE protected_schema_owner.rolname =
            'social_monitor_public_schema_owner'
          AND NOT protected_schema_owner.rolcanlogin
          AND NOT protected_schema_owner.rolsuper
          AND NOT protected_schema_owner.rolcreatedb
          AND NOT protected_schema_owner.rolcreaterole
          AND NOT protected_schema_owner.rolinherit
          AND NOT protected_schema_owner.rolreplication
          AND NOT protected_schema_owner.rolbypassrls
      )
      AND NOT pg_has_role(
        :'runtime_role',
        'social_monitor_public_schema_owner',
        'MEMBER'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_auth_members schema_membership
        JOIN pg_catalog.pg_roles schema_granted
          ON schema_granted.oid = schema_membership.roleid
        JOIN pg_catalog.pg_roles schema_member
          ON schema_member.oid = schema_membership.member
        WHERE schema_granted.rolname =
            'social_monitor_public_schema_owner'
          AND schema_member.rolname <> current_user
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(
          COALESCE(
            namespace.nspacl,
            pg_catalog.acldefault('n', namespace.nspowner)
          )
        ) schema_privilege
        LEFT JOIN pg_catalog.pg_roles schema_grantee
          ON schema_grantee.oid = schema_privilege.grantee
        WHERE schema_privilege.privilege_type = 'CREATE'
          AND (
            schema_privilege.grantee = 0
            OR schema_grantee.rolname NOT IN (
              'social_monitor_public_schema_owner',
              current_user,
              'social_monitor_reader_summary_publication_owner'
            )
          )
      )
    )
  ) AS boundary_valid
  FROM pg_catalog.pg_namespace namespace
  JOIN pg_catalog.pg_roles schema_owner
    ON schema_owner.oid = namespace.nspowner
  JOIN pg_catalog.pg_database database
    ON database.datname = current_database()
  JOIN pg_catalog.pg_roles database_owner
    ON database_owner.oid = database.datdba
  WHERE namespace.nspname = 'public'
) AS public_schema_ownership ON true
WHERE migrator.rolname = current_user;"

  reader_summary_publication_run_postgres_client \
    "$secret" "$ca_certificate" \
    social-monitor/publication-migrator-validation \
    catalog "$runtime_role" "$query"
}

reader_summary_publication_admin_availability_query() {
  local secret=$1
  local ca_certificate=$2
  reader_summary_publication_run_postgres_client \
    "$secret" "$ca_certificate" \
    social-monitor/publication-migrator-availability \
    availability '' ''
}
