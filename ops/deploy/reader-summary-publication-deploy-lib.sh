#!/usr/bin/env bash

# Sourced by social-monitor-production-deploy.sh. Publication migrations need
# a role-creating admin connection that is never placed in production.env or
# in a Docker command argument. The secret file contains only the PostgreSQL
# URL and is mounted read-only into short-lived migration/bootstrap containers.

READER_SUMMARY_PUBLICATION_MIGRATOR_ROLE=social_monitor_publication_migrator
READER_SUMMARY_PUBLICATION_RUNTIME_ROLE=social_monitor_app
READER_SUMMARY_PUBLICATION_DATABASE=social_monitor
READER_SUMMARY_PUBLICATION_DATABASE_HOST=dbaas-db-8050451-do-user-39622063-0.e.db.ondigitalocean.com
READER_SUMMARY_PUBLICATION_DATABASE_PORT=25060
READER_SUMMARY_PUBLICATION_VALIDATION_ATTEMPTS=3
READER_SUMMARY_PUBLICATION_VALIDATION_RETRY_SECONDS=2

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
  local postgres_image=postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15

  [[ $phase == pre || $phase == post ]] ||
    fail 'reader summary publication bootstrap phase is invalid'
  [[ -f $sql && ! -L $sql ]] ||
    fail "reader summary publication $phase-migration SQL is unavailable"

  docker run --rm \
    --user 0:0 \
    --env PGAPPNAME="social-monitor/publication-$phase-migration" \
    -v "$secret:/run/secrets/reader-summary-publication-admin-url:ro" \
    -v "$ca_certificate:/run/social-monitor-db/ca-certificate.crt:ro" \
    -v "$sql:/run/social-monitor-db/publication-migration.sql:ro" \
    "$postgres_image" \
    sh -c '
      set -eu
      PGDATABASE=$(cat /run/secrets/reader-summary-publication-admin-url)
      export PGDATABASE
      exec psql -X -v ON_ERROR_STOP=1 \
        --set=runtime_role="$1" \
        --file=/run/social-monitor-db/publication-migration.sql
    ' _ "$runtime_role"
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
  local unexpected_membership_count extra
  local query_status

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
  if catalog_result=$(reader_summary_publication_admin_catalog_query \
    "$secret" "$ca_certificate" "$runtime_role" 2>/dev/null); then
    :
  else
    query_status=$?
    # psql reserves status 2 for a failed server connection. SQL, auth,
    # privilege, TLS-policy and container-launch failures are deterministic
    # release blockers and must not be disguised as transient retries.
    [[ $query_status == 2 ]] && return 75
    return 65
  fi
  [[ -n $catalog_result && $catalog_result != *$'\n'* ]] || return 65
  catalog_delimiters=${catalog_result//[!|]/}
  ((${#catalog_delimiters} == 17)) || return 65

  IFS='|' read -r database_name current_identity session_identity \
    can_login can_create_role inherits_role is_superuser \
    can_create_database can_replicate can_bypass_rls server_version \
    uses_tls membership_count membership_admin membership_inherit \
    membership_set protected_memberships_valid \
    unexpected_membership_count extra \
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
)

reader_summary_publication_admin_secret_metadata() {
  stat -c '%U|%a' "$1"
}

reader_summary_publication_validate_admin_url() {
  local secret=$1

  python3 - "$secret" \
    "$READER_SUMMARY_PUBLICATION_MIGRATOR_ROLE" \
    "$READER_SUMMARY_PUBLICATION_DATABASE_HOST" \
    "$READER_SUMMARY_PUBLICATION_DATABASE_PORT" \
    "$READER_SUMMARY_PUBLICATION_DATABASE" >/dev/null 2>&1 <<'PY'
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
    if unquote(parsed.username or "", errors="strict") != expected_user:
        raise ValueError
    if parsed.password is None or not unquote(parsed.password, errors="strict"):
        raise ValueError
    if parsed.hostname != expected_host or not parsed.hostname.isascii():
        raise ValueError
    if parsed.port != int(expected_port):
        raise ValueError
    if unquote(parsed.path, errors="strict") != f"/{expected_database}":
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
except (OSError, UnicodeError, ValueError):
    raise SystemExit(1)
PY
}

reader_summary_publication_admin_catalog_query() {
  local secret=$1
  local ca_certificate=$2
  local runtime_role=$3
  local postgres_image=postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15
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
  COALESCE(membership.unexpected_membership_count, 0)
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
    COUNT(*) FILTER (
      WHERE granted_role.rolname =
        'social_monitor_reader_summary_publication_owner'
    ) <= 1
      AND COUNT(*) FILTER (
        WHERE granted_role.rolname =
          'social_monitor_reader_summary_publication_runtime'
      ) <= 1
      AND BOOL_AND(
        CASE WHEN granted_role.rolname =
          'social_monitor_reader_summary_publication_owner'
        THEN membership.admin_option
          AND NOT membership.inherit_option
          AND membership.set_option
        ELSE true END
      )
      AND BOOL_AND(
        CASE WHEN granted_role.rolname =
          'social_monitor_reader_summary_publication_runtime'
        THEN membership.admin_option
          AND NOT membership.inherit_option
          AND NOT membership.set_option
        ELSE true END
      ) AS protected_memberships_valid,
    COUNT(*) FILTER (
      WHERE granted_role.rolname NOT IN (
        :'runtime_role',
        'social_monitor_reader_summary_publication_owner',
        'social_monitor_reader_summary_publication_runtime'
      )
    ) AS unexpected_membership_count
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS granted_role
      ON granted_role.oid = membership.roleid
    JOIN pg_catalog.pg_roles AS member_role
      ON member_role.oid = membership.member
    WHERE member_role.rolname = current_user
) AS membership ON true
WHERE migrator.rolname = current_user;"

  docker run --rm \
    --user 0:0 \
    --env PGAPPNAME=social-monitor/publication-migrator-validation \
    -v "$secret:/run/secrets/reader-summary-publication-admin-url:ro" \
    -v "$ca_certificate:/run/social-monitor-db/ca-certificate.crt:ro" \
    "$postgres_image" \
    sh -c '
      set -eu
      PGDATABASE=$(cat /run/secrets/reader-summary-publication-admin-url)
      PGCONNECT_TIMEOUT=15
      export PGDATABASE PGCONNECT_TIMEOUT
      exec psql -X -A -t -F "|" --no-password -v ON_ERROR_STOP=1 \
        --set=runtime_role="$1" --command="$2"
    ' _ "$runtime_role" "$query"
}
