#!/usr/bin/env bash

# Sourced through source_deploy_library by the reviewed publication deploy
# library. This keeps the SYSTEM_DATABASE_URL contract cohesive while preserving
# the caller's authenticated nested-library loading and stable-inode seal.

ensure_system_database_url_deploy_contract() (
  set +x
  local production_env=$ROOT/secrets/production.env approved_system_secret=$ROOT/secrets/db/system-database-url
  local admin_secret=$ROOT/secrets/db/reader-summary-publication-admin-url ca_certificate=$ROOT/secrets/db/ca-certificate.crt
  local effective_api_secret=$STATE/database-url.$$.secret effective_system_secret=$STATE/system-database-url.$$.secret
  local database_url system_database_url system_secret_ref
  local system_secret system_password materialize_system_database_url=false
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
    if reader_summary_publication_private_file_absent "$approved_system_secret"; then
      reader_summary_publication_bootstrap_system_database_url \
        "$admin_secret" "$ca_certificate" "$approved_system_secret" || \
        fail 'SYSTEM_DATABASE_URL system role bootstrap failed'
    fi
    reader_summary_publication_repair_private_file_mode "$approved_system_secret" '400|600' '600' || \
      fail "SYSTEM_DATABASE_URL secret file must be root-owned with mode 0400 or 0600 ($(reader_summary_publication_private_file_state "$approved_system_secret"))"
    system_secret=$approved_system_secret
    materialize_system_database_url=true
  else
    printf '%s\n' "$system_database_url" > "$effective_system_secret"
    system_secret=$effective_system_secret
  fi
  reader_summary_publication_validate_runtime_database_urls \
    "$effective_api_secret" "$system_secret" || \
    fail 'SYSTEM_DATABASE_URL must be a separate social_monitor_system_app PostgreSQL URL with verify-full TLS; do not reuse DATABASE_URL'
  system_password=$(reader_summary_publication_system_password_from_secret \
    "$system_secret") || fail 'SYSTEM_DATABASE_URL password cannot be read for controlled role reconciliation'
  reader_summary_publication_reconcile_system_runtime_roles \
    "$admin_secret" "$ca_certificate" "$system_password" || \
    fail 'SYSTEM_DATABASE_URL runtime role reconciliation failed'
  if ! validate_reader_summary_system_runtime_role "$admin_secret" "$ca_certificate"; then
    if [[ $system_secret == "$approved_system_secret" ]]; then
      reader_summary_publication_bootstrap_system_database_url \
        "$admin_secret" "$ca_certificate" "$approved_system_secret" || \
        fail 'SYSTEM_DATABASE_URL system role repair failed'
      validate_reader_summary_system_runtime_role \
        "$admin_secret" "$ca_certificate" || \
        fail "SYSTEM_DATABASE_URL role validation failed after controlled repair ($(reader_summary_publication_system_runtime_role_state "$admin_secret" "$ca_certificate"))"
    else
      fail 'SYSTEM_DATABASE_URL role validation failed; provision social_monitor_system_app with tenant-system capability before deploy'
    fi
  fi
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

reader_summary_publication_system_runtime_role_state() {
  local secret=$1 ca_certificate=$2 catalog_result

  if catalog_result=$(reader_summary_publication_system_runtime_catalog_query \
      "$secret" "$ca_certificate" 2>/dev/null) && [[ -n $catalog_result ]]; then
    printf 'catalog=%s' "$catalog_result"
  else
    printf 'catalog=unavailable'
  fi
}

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
