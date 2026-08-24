export type ReaderSummaryDailyTelemetryReleaseOperations = Readonly<{
  applyTelemetryMigration(): Promise<void>;
  hardenPostTelemetryRelease(): Promise<void>;
  preparePreTelemetryRelease(): Promise<void>;
  verifyFinalReleaseState(): Promise<void>;
  verifyPreTelemetryAuthority(): Promise<void>;
}>;

export const runReaderSummaryDailyTelemetryRelease = async (
  operations: ReaderSummaryDailyTelemetryReleaseOperations,
): Promise<void> => {
  await operations.preparePreTelemetryRelease();
  await operations.verifyPreTelemetryAuthority();
  await operations.applyTelemetryMigration();
  await operations.hardenPostTelemetryRelease();
  await operations.verifyFinalReleaseState();
};

type QueryClient = Readonly<{
  query<TRow extends Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<Readonly<{ rows: readonly TRow[] }>>;
}>;

export const assertReaderSummaryDailyTelemetryReleaseDatabaseState = async (
  client: QueryClient,
  params: Readonly<{ migrationAdminRole: string; telemetryMigration: string }>,
): Promise<void> => {
  const result = await client.query<{
    final_acl_exact: boolean;
    final_rls_count: string;
    finished_migration_count: string;
    migration_admin_has_schema_create: boolean;
    publication_owner_has_schema_create: boolean;
    public_has_schema_create: boolean;
    server_version: number;
    telemetry_migration_count: string;
  }>(`SELECT
      current_setting('server_version_num')::INTEGER AS server_version,
      (SELECT count(*)::TEXT FROM public."_prisma_migrations"
       WHERE migration_name = $1) AS telemetry_migration_count,
      (SELECT count(*)::TEXT FROM public."_prisma_migrations"
       WHERE migration_name = $1 AND finished_at IS NOT NULL
         AND rolled_back_at IS NULL) AS finished_migration_count,
      has_schema_privilege($2, 'public', 'CREATE')
        AS migration_admin_has_schema_create,
      has_schema_privilege(
        'social_monitor_reader_summary_publication_owner', 'public', 'CREATE'
      ) AS publication_owner_has_schema_create,
      has_schema_privilege('public', 'public', 'CREATE')
        AS public_has_schema_create,
      NOT has_function_privilege(
        'social_monitor_reader_summary_daily_terminal',
        'public.complete_reader_summary_daily_model_job(uuid,uuid,date,text,bigint,timestamp with time zone,bytea,character,jsonb,bytea,character,bytea,character)',
        'EXECUTE'
      ) AND has_function_privilege(
        'social_monitor_reader_summary_daily_terminal',
        'public.complete_reader_summary_daily_model_job_v2(uuid,uuid,date,text,bigint,timestamp with time zone,bytea,character,jsonb,bytea,character,bytea,character,bigint,bigint,bigint,text,bigint)',
        'EXECUTE'
      ) AND NOT has_function_privilege(
        'public',
        'public.complete_reader_summary_daily_model_job_v2(uuid,uuid,date,text,bigint,timestamp with time zone,bytea,character,jsonb,bytea,character,bytea,character,bigint,bigint,bigint,text,bigint)',
        'EXECUTE'
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc AS acl_procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(acl_procedure.proacl) AS acl
        WHERE acl_procedure.oid =
          'public.complete_reader_summary_daily_model_job_v2(uuid,uuid,date,text,bigint,timestamp with time zone,bytea,character,jsonb,bytea,character,bytea,character,bigint,bigint,bigint,text,bigint)'::REGPROCEDURE
          AND acl.privilege_type = 'EXECUTE'
          AND acl.grantee NOT IN (
            acl_procedure.proowner,
            'social_monitor_reader_summary_daily_terminal'::REGROLE::OID
          )
      ) AND (SELECT procedure.prosecdef
          AND procedure.proconfig = ARRAY['search_path=pg_catalog']::TEXT[]
          AND owner.rolname =
            'social_monitor_reader_summary_daily_publication_definer'
        FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_roles AS owner ON owner.oid = procedure.proowner
        WHERE procedure.oid =
          'public.complete_reader_summary_daily_model_job_v2(uuid,uuid,date,text,bigint,timestamp with time zone,bytea,character,jsonb,bytea,character,bytea,character,bigint,bigint,bigint,text,bigint)'::REGPROCEDURE
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_default_acl AS defaults
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = defaults.defaclnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(defaults.defaclacl) AS acl
        WHERE defaults.defaclobjtype = 'f' AND namespace.nspname = 'public'
          AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) AS final_acl_exact,
      (SELECT count(*)::TEXT FROM pg_catalog.pg_class AS relation
       JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relname = ANY(ARRAY[
           'reader_summary_artifacts', 'reader_summary_publications',
           'reader_summary_publication_slots',
           'reader_summary_weekly_publication_evidence',
           'reader_summary_jobs'
         ]) AND relation.relrowsecurity AND relation.relforcerowsecurity)
        AS final_rls_count`, [
    params.telemetryMigration,
    params.migrationAdminRole,
  ]);
  const row = result.rows[0];
  assert((row?.server_version ?? 0) >= 180_000,
    "daily telemetry release requires disposable PostgreSQL 18+");
  assert(row?.telemetry_migration_count === "1" &&
    row.finished_migration_count === "1",
  "daily telemetry release must finish exactly one telemetry migration");
  assert(row.migration_admin_has_schema_create === false,
    "daily telemetry release migrator retained schema CREATE after hardening");
  assert(row.publication_owner_has_schema_create === false &&
    row.public_has_schema_create === false && row.final_acl_exact === true &&
    row.final_rls_count === "5",
  "daily telemetry release final post-bootstrap ACL/RLS state is unsafe");
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
