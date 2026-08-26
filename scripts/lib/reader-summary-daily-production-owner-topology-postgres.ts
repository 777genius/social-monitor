import type { PoolClient } from "pg";

type ProductionOwnerTopologyFixture = {
  admin: PoolClient;
  migrationAdminRole: string;
  postMigrationSql: string;
  schemaOwnerRole: string;
};

type ProductionOwnerTopology = {
  active_owner: string;
  active_owner_has_create: boolean;
  bounded_owner: string;
  bounded_owner_has_create: boolean;
  fixture_current_user: string;
  fixture_session_user: string;
  relation_acls_exact: boolean;
  relation_owners_exact: boolean;
  relation_count: string;
};

const aclBlockStart = "DO $grant_legacy_daily_function_owner_acl$";
const aclBlockEnd = "$grant_legacy_daily_function_owner_acl$;";

export const readerSummaryDailyProductionOwnerAclSql = (
  postMigrationSql: string,
  migrationAdminRole = "fixture_migration_admin",
  schemaOwnerRole = "social_monitor_public_schema_owner",
): string => {
  const start = postMigrationSql.indexOf(aclBlockStart);
  const end = postMigrationSql.indexOf(aclBlockEnd, start);
  assert(start >= 0 && end > start &&
    postMigrationSql.indexOf(aclBlockStart, start + 1) < 0 &&
    postMigrationSql.indexOf(aclBlockEnd, end + 1) < 0,
  "production bootstrap must contain exactly one daily owner ACL block");
  const block = postMigrationSql.slice(start, end + aclBlockEnd.length);
  for (const contract of [
    "GRANT SELECT, INSERT, UPDATE ON TABLE",
    "GRANT SELECT, INSERT ON TABLE",
    "GRANT SELECT ON TABLE public.\"feed_items\", public.\"source_items\"",
    'public."reader_summary_daily_execution_cursors"',
    'public."reader_summary_daily_model_jobs"',
    'public."reader_summary_daily_source_authorities"',
  ]) {
    assert(block.includes(contract),
      `production bootstrap daily owner ACL block is missing ${contract}`);
  }
  assert(!block.includes("DELETE"),
    "production bootstrap daily owner ACL block unexpectedly grants DELETE");
  return `SET ROLE ${quoteIdentifier(schemaOwnerRole)};
    GRANT SELECT, INSERT, UPDATE ON TABLE
      public."reader_summary_daily_execution_cursors",
      public."reader_summary_daily_model_jobs"
    TO ${quoteIdentifier(migrationAdminRole)} GRANTED BY CURRENT_USER;
    GRANT SELECT, INSERT ON TABLE
      public."reader_summary_daily_source_authorities"
    TO ${quoteIdentifier(migrationAdminRole)} GRANTED BY CURRENT_USER;
    GRANT SELECT ON TABLE public."feed_items", public."source_items"
    TO ${quoteIdentifier(migrationAdminRole)} GRANTED BY CURRENT_USER;
    RESET ROLE`;
};

export const grantAndAssertReaderSummaryDailyProductionOwnerTopology = async ({
  admin,
  migrationAdminRole,
  postMigrationSql,
  schemaOwnerRole,
}: ProductionOwnerTopologyFixture): Promise<void> => {
  await admin.query(readerSummaryDailyProductionOwnerAclSql(
    postMigrationSql, migrationAdminRole, schemaOwnerRole,
  ));
  const topology = await admin.query<ProductionOwnerTopology>(`SELECT
      pg_catalog.pg_get_userbyid(active_claim.proowner) AS active_owner,
      pg_catalog.has_schema_privilege(active_claim.proowner, 'public', 'CREATE')
        AS active_owner_has_create,
      pg_catalog.pg_get_userbyid(bounded_claim.proowner) AS bounded_owner,
      pg_catalog.has_schema_privilege(bounded_claim.proowner, 'public', 'CREATE')
        AS bounded_owner_has_create,
      count(*)::TEXT AS relation_count,
      pg_catalog.bool_and(relation.relowner = $1::pg_catalog.regrole::OID)
        AS relation_owners_exact,
      pg_catalog.bool_and(
        COALESCE((SELECT pg_catalog.array_agg(
            acl.privilege_type ORDER BY acl.privilege_type
          ) FROM pg_catalog.aclexplode(relation.relacl) AS acl
          WHERE acl.grantee = active_claim.proowner), ARRAY[]::TEXT[])
          = expected.privileges
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.aclexplode(relation.relacl) AS acl
          WHERE acl.grantee = active_claim.proowner
            AND (acl.grantor <> relation.relowner OR acl.is_grantable)
        )
      ) AS relation_acls_exact,
      current_user AS fixture_current_user, session_user AS fixture_session_user
    FROM pg_catalog.pg_proc AS active_claim
    CROSS JOIN pg_catalog.pg_proc AS bounded_claim
    CROSS JOIN (VALUES
      ('reader_summary_daily_execution_cursors', ARRAY['INSERT','SELECT','UPDATE']::TEXT[]),
      ('reader_summary_daily_model_jobs', ARRAY['INSERT','SELECT','UPDATE']::TEXT[]),
      ('reader_summary_daily_source_authorities', ARRAY['INSERT','SELECT']::TEXT[]),
      ('feed_items', ARRAY['SELECT']::TEXT[]),
      ('source_items', ARRAY['SELECT']::TEXT[])
    ) AS expected(relation_name, privileges)
    JOIN pg_catalog.pg_class AS relation ON relation.relname = expected.relation_name
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace AND namespace.nspname = 'public'
    WHERE active_claim.oid =
        'public.claim_reader_summary_daily_execution(uuid,uuid,text,date,timestamp with time zone)'::pg_catalog.regprocedure
      AND bounded_claim.oid =
        'public.claim_reader_summary_daily_execution_bounded_maintenance(uuid,uuid,text,date,timestamp with time zone)'::pg_catalog.regprocedure
    GROUP BY active_claim.proowner, bounded_claim.proowner`, [schemaOwnerRole]);
  const row = topology.rows[0];
  assert(row?.active_owner === migrationAdminRole &&
    row.active_owner_has_create === false && row.relation_count === "5" &&
    row.relation_owners_exact === true && row.relation_acls_exact === true &&
    row.bounded_owner === schemaOwnerRole && row.bounded_owner_has_create === true &&
    row.fixture_current_user === migrationAdminRole &&
    row.fixture_session_user === migrationAdminRole,
  "daily telemetry PG18 fixture does not match production mixed-owner topology");
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const quoteIdentifier = (input: string): string =>
  `"${input.replaceAll('"', '""')}"`;
