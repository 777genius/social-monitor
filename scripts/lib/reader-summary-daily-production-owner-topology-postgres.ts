import type { PoolClient } from "pg";

type ProductionOwnerTopologyFixture = {
  admin: PoolClient;
  migrationAdminRole: string;
  schemaOwnerRole: string;
};

type ProductionOwnerTopology = {
  active_owner: string;
  active_owner_has_create: boolean;
  bounded_owner: string;
  bounded_owner_has_create: boolean;
  cursor_owner: string;
  cursor_acl_exact: boolean;
  job_owner: string;
  job_acl_exact: boolean;
  fixture_current_user: string;
  fixture_session_user: string;
};

export const grantAndAssertReaderSummaryDailyProductionOwnerTopology = async ({
  admin,
  migrationAdminRole,
  schemaOwnerRole,
}: ProductionOwnerTopologyFixture): Promise<void> => {
  await admin.query(`SET ROLE ${quoteIdentifier(schemaOwnerRole)};
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      public.reader_summary_daily_execution_cursors,
      public.reader_summary_daily_model_jobs
    TO ${quoteIdentifier(migrationAdminRole)} GRANTED BY CURRENT_USER;
    RESET ROLE`);
  const topology = await admin.query<ProductionOwnerTopology>(`SELECT
      pg_catalog.pg_get_userbyid(active_claim.proowner) AS active_owner,
      pg_catalog.has_schema_privilege(active_claim.proowner, 'public', 'CREATE')
        AS active_owner_has_create,
      pg_catalog.pg_get_userbyid(cursor_relation.relowner) AS cursor_owner,
      (SELECT pg_catalog.count(*) = 4
          AND pg_catalog.bool_and(acl.privilege_type = ANY (
            ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']))
          AND pg_catalog.bool_and(acl.grantor = cursor_relation.relowner)
          AND NOT pg_catalog.bool_or(acl.is_grantable)
        FROM pg_catalog.aclexplode(cursor_relation.relacl) AS acl
        WHERE acl.grantee = active_claim.proowner) AS cursor_acl_exact,
      pg_catalog.pg_get_userbyid(job_relation.relowner) AS job_owner,
      (SELECT pg_catalog.count(*) = 4
          AND pg_catalog.bool_and(acl.privilege_type = ANY (
            ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']))
          AND pg_catalog.bool_and(acl.grantor = job_relation.relowner)
          AND NOT pg_catalog.bool_or(acl.is_grantable)
        FROM pg_catalog.aclexplode(job_relation.relacl) AS acl
        WHERE acl.grantee = active_claim.proowner) AS job_acl_exact,
      pg_catalog.pg_get_userbyid(bounded_claim.proowner) AS bounded_owner,
      pg_catalog.has_schema_privilege(bounded_claim.proowner, 'public', 'CREATE')
        AS bounded_owner_has_create,
      current_user AS fixture_current_user, session_user AS fixture_session_user
    FROM pg_catalog.pg_proc AS active_claim
    CROSS JOIN pg_catalog.pg_proc AS bounded_claim
    CROSS JOIN pg_catalog.pg_class AS cursor_relation
    CROSS JOIN pg_catalog.pg_class AS job_relation
    WHERE active_claim.oid =
        'public.claim_reader_summary_daily_execution(uuid,uuid,text,date,timestamp with time zone)'::pg_catalog.regprocedure
      AND bounded_claim.oid =
        'public.claim_reader_summary_daily_execution_bounded_maintenance(uuid,uuid,text,date,timestamp with time zone)'::pg_catalog.regprocedure
      AND cursor_relation.oid =
        'public.reader_summary_daily_execution_cursors'::pg_catalog.regclass
      AND job_relation.oid =
        'public.reader_summary_daily_model_jobs'::pg_catalog.regclass`);
  const row = topology.rows[0];
  assert(row?.active_owner === migrationAdminRole &&
    row.active_owner_has_create === false &&
    row.cursor_owner === schemaOwnerRole && row.cursor_acl_exact === true &&
    row.job_owner === schemaOwnerRole && row.job_acl_exact === true &&
    row.bounded_owner === schemaOwnerRole && row.bounded_owner_has_create === true &&
    row.fixture_current_user === migrationAdminRole &&
    row.fixture_session_user === migrationAdminRole,
  "daily telemetry PG18 fixture does not match production mixed-owner topology");
};

const quoteIdentifier = (input: string): string =>
  `"${input.replaceAll('"', '""')}"`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
