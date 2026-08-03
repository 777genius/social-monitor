#!/usr/bin/env bash

# Sourced by reader-summary-publication-deploy-lib.sh after constants are set.
# It owns only the out-of-git SYSTEM_DATABASE_URL file bootstrap and private-file
# metadata repair helpers. It must never print a PostgreSQL URL or password.

reader_summary_publication_private_file_valid() {
  local path=$1 allowed_modes=$2
  local metadata owner mode

  [[ -f $path && ! -L $path && -s $path ]] || return 1
  metadata=$(reader_summary_publication_admin_secret_metadata "$path" 2>/dev/null) || return 1
  IFS='|' read -r owner mode <<< "$metadata"
  [[ $owner == root && "|$allowed_modes|" == *"|$mode|"* ]]
}

reader_summary_publication_private_file_absent() {
  local path=$1
  [[ ! -e $path && ! -L $path ]]
}

reader_summary_publication_repair_private_file_mode() {
  local path=$1 allowed_modes=$2 repaired_mode=$3
  local repair_path

  reader_summary_publication_private_file_valid "$path" "$allowed_modes" && return 0
  repair_path=$(reader_summary_publication_resolve_private_repair_path "$path") || return 1
  [[ $repaired_mode =~ ^[0-7]{3}$ && "|$allowed_modes|" == *"|$repaired_mode|"* ]] || return 1
  chown root:root "$repair_path" || return 1
  chmod "$repaired_mode" "$repair_path" || return 1
  reader_summary_publication_private_file_valid "$repair_path" "$allowed_modes"
}

reader_summary_publication_resolve_private_repair_path() {
  local path=$1 resolved

  [[ -e $path || -L $path ]] || return 1
  resolved=$(readlink -f "$path") || return 1
  [[ -f $resolved && ! -L $resolved && -s $resolved ]] || return 1
  printf '%s\n' "$resolved"
}

reader_summary_publication_private_file_state() {
  local path=$1
  local exists=false symlink=false resolved=false regular=false non_empty=false
  local owner=unavailable mode=unavailable metadata resolved_path

  [[ -e $path || -L $path ]] && exists=true
  [[ -L $path ]] && symlink=true
  if resolved_path=$(readlink -f "$path" 2>/dev/null); then
    resolved=true
    [[ -f $resolved_path && ! -L $resolved_path ]] && regular=true
    [[ -s $resolved_path ]] && non_empty=true
    if metadata=$(reader_summary_publication_admin_secret_metadata "$resolved_path" 2>/dev/null); then
      IFS='|' read -r owner mode <<< "$metadata"
    fi
  fi
  printf 'dsn_file_state=exists:%s,symlink:%s,resolved:%s,regular:%s,non_empty:%s,owner:%s,mode:%s' \
    "$exists" "$symlink" "$resolved" "$regular" "$non_empty" "$owner" "$mode"
}

reader_summary_publication_bootstrap_system_database_url() (
  set +x
  local admin_secret=$1 ca_certificate=$2 system_secret=$3
  local system_password system_url sql_file temp_secret

  if ! reader_summary_publication_private_file_absent "$system_secret"; then
    reader_summary_publication_private_file_valid "$system_secret" '400|600' || \
      return 1
  fi
  system_password=$(openssl rand -base64 48 | tr -d '\n') || return 1
  [[ -n $system_password ]] || return 1
  system_url=$(
    reader_summary_publication_system_database_url_from_admin \
      "$admin_secret" "$system_password"
  ) || return 1
  sql_file=$STATE/system-database-url-bootstrap.$$.sql
  temp_secret=$system_secret.$$.next
  trap 'rm -f "$sql_file" "$temp_secret"' EXIT
  umask 077
  reader_summary_publication_write_system_runtime_bootstrap_sql \
    "$sql_file" "$system_password" || return 1
  reader_summary_publication_run_postgres_client \
    "$admin_secret" "$ca_certificate" \
    social-monitor/system-runtime-bootstrap \
    bootstrap "$READER_SUMMARY_PUBLICATION_RUNTIME_ROLE" '' "$sql_file" || \
    return 1
  install -d -m 0700 "$(dirname "$system_secret")" || return 1
  if ((EUID == 0)); then
    chown root:root "$(dirname "$system_secret")" || return 1
  fi
  printf '%s\n' "$system_url" > "$temp_secret" || return 1
  chown root:root "$temp_secret" || return 1
  chmod 0600 "$temp_secret" || return 1
  mv -f "$temp_secret" "$system_secret" || return 1
  reader_summary_publication_private_file_valid "$system_secret" '600'
)

reader_summary_publication_system_database_url_from_admin() {
  local admin_secret=$1 system_password=$2

  python3 - "$admin_secret" "$READER_SUMMARY_TENANT_SYSTEM_RUNTIME_ROLE" \
    "$system_password" <<'PY'
import sys
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit

raw = Path(sys.argv[1]).read_text(encoding="utf-8").strip()
role = sys.argv[2]
password = sys.argv[3]
parts = urlsplit(raw)
if parts.scheme not in {"postgres", "postgresql"} or not parts.hostname:
    raise SystemExit(1)
hostname = parts.hostname
if ":" in hostname and not hostname.startswith("["):
    hostname = f"[{hostname}]"
netloc = f"{quote(role, safe='')}:{quote(password, safe='')}@{hostname}"
if parts.port is not None:
    netloc = f"{netloc}:{parts.port}"
print(urlunsplit((parts.scheme, netloc, parts.path, parts.query, "")))
PY
}

reader_summary_publication_write_system_runtime_bootstrap_sql() {
  local output=$1 system_password=$2

  python3 - "$output" "$system_password" <<'PY'
from pathlib import Path
import sys

output = Path(sys.argv[1])
password = sys.argv[2]
literal = "'" + password.replace("'", "''") + "'"
output.write_text(f"""\\set ON_ERROR_STOP on
\\set VERBOSITY terse
\\set SHOW_CONTEXT never

BEGIN;

CREATE TEMP TABLE reader_summary_publication_bootstrap_settings (
  setting_name TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO reader_summary_publication_bootstrap_settings (
  setting_name,
  setting_value
) VALUES
  ('system_password', {literal}),
  ('runtime_role', :'runtime_role'),
  ('system_runtime_role', :'system_runtime_role');

DO $bootstrap_system_runtime$
DECLARE
  v_runtime_role NAME := (
    SELECT setting_value
    FROM pg_temp.reader_summary_publication_bootstrap_settings
    WHERE setting_name = 'runtime_role'
  )::NAME;
  v_system_runtime_role NAME := (
    SELECT setting_value
    FROM pg_temp.reader_summary_publication_bootstrap_settings
    WHERE setting_name = 'system_runtime_role'
  )::NAME;
  v_system_password TEXT := (
    SELECT setting_value
    FROM pg_temp.reader_summary_publication_bootstrap_settings
    WHERE setting_name = 'system_password'
  );
  v_role RECORD;
BEGIN
  IF v_runtime_role::TEXT !~ '^[a-z_][a-z0-9_]{{0,62}}$' THEN
    RAISE EXCEPTION 'reader summary runtime role name is invalid';
  END IF;
  IF v_system_runtime_role::TEXT !~ '^[a-z_][a-z0-9_]{{0,62}}$' THEN
    RAISE EXCEPTION 'tenant system runtime role name is invalid';
  END IF;
  IF v_runtime_role = v_system_runtime_role THEN
    RAISE EXCEPTION 'runtime and tenant system roles must be distinct';
  END IF;
  PERFORM pg_catalog.set_config('createrole_self_grant', 'set', true);
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'social_monitor_reader_summary_publication_runtime'
  ) THEN
    CREATE ROLE social_monitor_reader_summary_publication_runtime
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
      NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'social_monitor_tenant_system_runtime'
  ) THEN
    CREATE ROLE social_monitor_tenant_system_runtime
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
      NOREPLICATION NOBYPASSRLS;
  END IF;
  PERFORM pg_catalog.set_config('createrole_self_grant', '', true);

  IF pg_has_role(
    v_runtime_role,
    'social_monitor_tenant_system_runtime',
    'MEMBER'
  ) THEN
    RAISE EXCEPTION 'reader summary runtime role has tenant system capability';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = v_system_runtime_role
  ) THEN
    EXECUTE format(
      'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB '
        'NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS',
      v_system_runtime_role,
      v_system_password
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE %I WITH LOGIN PASSWORD %L INHERIT',
      v_system_runtime_role,
      v_system_password
    );
  END IF;

  SELECT * INTO v_role FROM pg_catalog.pg_roles
  WHERE rolname = v_system_runtime_role;
  IF NOT FOUND OR NOT v_role.rolcanlogin OR NOT v_role.rolinherit
    OR v_role.rolsuper OR v_role.rolcreatedb OR v_role.rolcreaterole
    OR v_role.rolreplication OR v_role.rolbypassrls THEN
    RAISE EXCEPTION 'tenant system runtime role is unsafe';
  END IF;

  EXECUTE format(
    'GRANT %I TO %I '
      'WITH ADMIN FALSE, INHERIT TRUE, SET FALSE GRANTED BY CURRENT_USER',
    v_runtime_role,
    v_system_runtime_role
  );
  EXECUTE format(
    'GRANT social_monitor_tenant_system_runtime TO %I '
      'WITH ADMIN FALSE, INHERIT TRUE, SET FALSE GRANTED BY CURRENT_USER',
    v_system_runtime_role
  );
  EXECUTE format(
    'REVOKE social_monitor_reader_summary_publication_runtime FROM %I',
    v_system_runtime_role
  );

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles granted
      ON granted.oid = membership.roleid
    JOIN pg_catalog.pg_roles member
      ON member.oid = membership.member
    WHERE member.rolname = v_system_runtime_role
      AND granted.rolname NOT IN (
        v_runtime_role,
        'social_monitor_tenant_system_runtime'
      )
  ) THEN
    RAISE EXCEPTION 'tenant system runtime role has unexpected membership';
  END IF;
END
$bootstrap_system_runtime$;

COMMIT;
""", encoding="utf-8")
PY
  chmod 0600 "$output"
  [[ -s $output && ! -L $output ]]
}
