#!/usr/bin/env bash

# Managed-PostgreSQL catalog validation query used by publication deploys.
# Sourced only through the reviewed deploy-library loader.

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
  COALESCE(membership.legacy_unexpected_memberships_valid, false),
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
            'social_monitor_reader_summary_daily_publication_definer'
        ) AND COUNT(*) FILTER (
          WHERE granted_role.rolname =
            'social_monitor_reader_summary_daily_publication_definer'
        ) = 0
      ) OR (
        EXISTS (
          SELECT 1 FROM pg_catalog.pg_roles
          WHERE rolname =
            'social_monitor_reader_summary_daily_publication_definer'
        ) AND COUNT(*) FILTER (
          WHERE granted_role.rolname =
            'social_monitor_reader_summary_daily_publication_definer'
        ) = 1 AND BOOL_AND(
          CASE WHEN granted_role.rolname =
            'social_monitor_reader_summary_daily_publication_definer'
          THEN membership.admin_option
            AND NOT membership.inherit_option
            AND NOT membership.set_option
            AND grantor_role.rolsuper
          ELSE true END
        )
      )
    ) AND (
      (
        NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_roles
          WHERE rolname =
            'social_monitor_reader_summary_daily_terminal'
        ) AND COUNT(*) FILTER (
          WHERE granted_role.rolname =
            'social_monitor_reader_summary_daily_terminal'
        ) = 0
      ) OR (
        EXISTS (
          SELECT 1 FROM pg_catalog.pg_roles
          WHERE rolname =
            'social_monitor_reader_summary_daily_terminal'
        ) AND COUNT(*) FILTER (
          WHERE granted_role.rolname =
            'social_monitor_reader_summary_daily_terminal'
        ) = 1 AND BOOL_AND(
          CASE WHEN granted_role.rolname =
            'social_monitor_reader_summary_daily_terminal'
          THEN membership.admin_option
            AND NOT membership.inherit_option
            AND NOT membership.set_option
            AND grantor_role.rolsuper
          ELSE true END
        )
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
        'social_monitor_reader_summary_publication_runtime',
        'social_monitor_reader_summary_daily_terminal',
        'social_monitor_reader_summary_daily_publication_definer'
      )
    ) AS unexpected_membership_count,
    (
      COUNT(*) FILTER (
        WHERE granted_role.rolname NOT IN (
          :'runtime_role',
          'social_monitor_public_schema_owner',
          'social_monitor_reader_summary_publication_owner',
          'social_monitor_reader_summary_publication_runtime',
          'social_monitor_reader_summary_daily_terminal',
          'social_monitor_reader_summary_daily_publication_definer'
        )
      ) = 0 OR (
        COUNT(*) FILTER (
          WHERE granted_role.rolname NOT IN (
            :'runtime_role',
            'social_monitor_public_schema_owner',
            'social_monitor_reader_summary_publication_owner',
            'social_monitor_reader_summary_publication_runtime',
            'social_monitor_reader_summary_daily_terminal',
            'social_monitor_reader_summary_daily_publication_definer'
          )
        ) = 3
        AND COUNT(*) FILTER (
          WHERE granted_role.rolname = 'social_monitor_system_app'
            AND grantor_role.rolname = 'postgres'
            AND membership.admin_option
            AND NOT membership.inherit_option
            AND NOT membership.set_option
        ) = 1
        AND COUNT(*) FILTER (
          WHERE granted_role.rolname =
              'social_monitor_tenant_system_runtime'
            AND grantor_role.rolname = 'postgres'
            AND membership.admin_option
            AND NOT membership.inherit_option
            AND NOT membership.set_option
        ) = 1
        AND COUNT(*) FILTER (
          WHERE granted_role.rolname =
              'social_monitor_tenant_system_runtime'
            AND grantor_role.rolname = current_user
            AND NOT membership.admin_option
            AND NOT membership.inherit_option
            AND membership.set_option
        ) = 1
      )
    ) AS legacy_unexpected_memberships_valid
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
