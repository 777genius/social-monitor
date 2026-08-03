import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const readerSummaryPublicationMigration =
  "20260716170000_reader_summary_fail_closed_publication";
export const readerSummaryDailyActivationMigration =
  "20260802143000_reader_summary_daily_execution_publication_activation";
export const readerSummaryDailyActivationAclMigration =
  "20260802143100_reader_summary_daily_execution_publication_activation_acl";
export const readerSummaryDailyActivationDefinerRole =
  "social_monitor_reader_summary_daily_publication_definer";

export type ReaderSummaryPublicationMigrationWorkspace = Readonly<{
  directory: string;
  schemaPath: string;
}>;

export const createReaderSummaryPublicationMigrationWorkspace =
  (): ReaderSummaryPublicationMigrationWorkspace => {
    const directory = mkdtempSync(
      join(tmpdir(), "reader-summary-publication-migrations-"),
    );
    return { directory, schemaPath: join(directory, "schema.prisma") };
  };

export const preparePrePublicationMigrations = (
  workspace: ReaderSummaryPublicationMigrationWorkspace,
): void => {
  cpSync("prisma/schema.prisma", workspace.schemaPath);
  const targetMigrations = join(workspace.directory, "migrations");
  mkdirSync(targetMigrations);
  for (const migration of readerSummaryMigrationNames()) {
    if (migration >= readerSummaryPublicationMigration) {
      continue;
    }
    copyMigration(workspace, migration);
  }
};

export const installPublicationAndFollowingMigrations = (
  workspace: ReaderSummaryPublicationMigrationWorkspace,
): void => {
  for (const migration of readerSummaryMigrationNames()) {
    if (migration < readerSummaryPublicationMigration) {
      continue;
    }
    copyMigration(workspace, migration);
  }
};

export const installPublicationMigrationsBeforeDailyActivation = (
  workspace: ReaderSummaryPublicationMigrationWorkspace,
): void => {
  // Merge invariant with weekly staging parity: retain every staged weekly
  // publication migration and its ordering, then apply this cutoff so all
  // migrations before daily activation are installed.  The daily activation
  // and its immediately following ACL/recovery exercise remain separate.
  for (const migration of readerSummaryMigrationNames()) {
    if (migration < readerSummaryPublicationMigration ||
        migration >= readerSummaryDailyActivationMigration) {
      continue;
    }
    copyMigration(workspace, migration);
  }
};

export const installDailyActivationMigration = (
  workspace: ReaderSummaryPublicationMigrationWorkspace,
  migration: typeof readerSummaryDailyActivationMigration |
    typeof readerSummaryDailyActivationAclMigration,
): void => copyMigration(workspace, migration);

export const removeInstalledReaderSummaryMigration = (
  workspace: ReaderSummaryPublicationMigrationWorkspace,
  migration: string,
): void => rmSync(join(workspace.directory, "migrations", migration), {
  recursive: true,
  force: true,
});

export const removeReaderSummaryPublicationMigrationWorkspace = (
  workspace: ReaderSummaryPublicationMigrationWorkspace,
): void => {
  rmSync(workspace.directory, { recursive: true, force: true });
};

export const readerSummaryMigrationNames = (): readonly string[] =>
  readdirSync("prisma/migrations", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

export const applyOrderedReaderSummaryMigrations = (
  url: string,
  workspace: ReaderSummaryPublicationMigrationWorkspace,
): void => {
  const result = runOrderedReaderSummaryMigrations(url, workspace);
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.stdout.write(result.stdout);
    throw new Error("ordered baseline migration upgrade failed");
  }
};

export const runOrderedReaderSummaryMigrations = (
  url: string,
  workspace: ReaderSummaryPublicationMigrationWorkspace,
) =>
  spawnPrisma(
    [
      "migrate",
      "deploy",
      "--config",
      "scripts/reader-summary-publication-prisma.config.ts",
    ],
    {
      DATABASE_URL: url,
      READER_SUMMARY_PUBLICATION_TEST_SCHEMA_PATH: workspace.schemaPath,
      READER_SUMMARY_PUBLICATION_TEST_MIGRATIONS_PATH: join(
        dirname(workspace.schemaPath),
        "migrations",
      ),
    },
  );

export const resolveRolledBackReaderSummaryMigration = (
  url: string,
  workspace: ReaderSummaryPublicationMigrationWorkspace,
  migration: string,
): void => {
  const result = spawnPrisma(
    [
      "migrate",
      "resolve",
      "--rolled-back",
      migration,
      "--config",
      "scripts/reader-summary-publication-prisma.config.ts",
    ],
    {
      DATABASE_URL: url,
      READER_SUMMARY_PUBLICATION_TEST_SCHEMA_PATH: workspace.schemaPath,
      READER_SUMMARY_PUBLICATION_TEST_MIGRATIONS_PATH: join(
        dirname(workspace.schemaPath),
        "migrations",
      ),
    },
  );
  if (result.status !== 0) {
    throw new Error(`failed migration resolution was rejected: ${result.stderr}`);
  }
};

export const installFailingDailyActivationAclMigration = (
  workspace: ReaderSummaryPublicationMigrationWorkspace,
): void => {
  installDailyActivationMigration(
    workspace,
    readerSummaryDailyActivationAclMigration,
  );
  writeFileSync(
    join(
      workspace.directory,
      "migrations",
      readerSummaryDailyActivationAclMigration,
      "migration.sql",
    ),
    `-- @social-monitor-forward-migration
-- Deliberate fixture-only failure used to prove Prisma P3009 recovery.
-- Lock risk: fixture catalog assertion only; no table lock or data scan.
-- Keep this statement-scoped: an aborted explicit transaction prevents Prisma
-- from persisting the failed migration log on the same PostgreSQL session.
DO $fixture_failure$ BEGIN
  RAISE EXCEPTION 'fixture daily activation ACL failure';
END $fixture_failure$;
`,
  );
};

export const assertDailyActivationMigrationContract = (): void => {
  const names = readerSummaryMigrationNames();
  const activationIndex = names.indexOf(readerSummaryDailyActivationMigration);
  assert(
    activationIndex >= 0 &&
      names[activationIndex + 1] === readerSummaryDailyActivationAclMigration,
    "daily activation ACL migration must immediately follow activation",
  );
  const activation = readMigration(readerSummaryDailyActivationMigration);
  const acl = readMigration(readerSummaryDailyActivationAclMigration);
  const bootstrapPre = readFileSync(
    "ops/deploy/reader-summary-publication-pre-migration.sql", "utf8",
  );
  const bootstrapPost = readFileSync(
    "ops/deploy/reader-summary-publication-post-migration.sql", "utf8",
  );
  for (const [name, sql] of [["activation", activation], ["ACL", acl]] as const) {
    assert(sql.split("\n").length < 1_000, `${name} migration exceeds line cap`);
  }
  assert(!activation.includes("GRANT CREATE ON SCHEMA public"),
    "activation migration must not grant broad public CREATE");
  assert(
    (activation.match(/SET search_path = pg_catalog AS/g) ?? []).length === 2 &&
      (activation.match(/IS DISTINCT FROM/g) ?? []).length === 15 &&
      !activation.includes("SET search_path = pg_catalog, public") &&
    activation.includes('FROM public."reader_summary_daily_execution_cursors"') &&
      activation.includes("migration admin cannot SET the daily table owner") &&
      activation.includes("GRANT SELECT, UPDATE ON TABLE") &&
      activation.includes("pg_catalog.sha256(") &&
      !activation.includes("public.sha256(") &&
      activation.includes(
        "v_public_frontend->'readerSummaryArtifact'->>'readerSummaryId'\n" +
        "      IS DISTINCT FROM target_artifact_id::TEXT",
      ) &&
      activation.includes("FROM PUBLIC,") &&
      !activation.includes("GRANT EXECUTE ON FUNCTION"),
    "activation migration must be schema-explicit and fail closed",
  );
  for (const comparison of [
    `::JSONB->>'modelJobIdentity'\n      IS DISTINCT FROM v_job."identity"`,
    `::JSONB->>'responseSha256'\n      IS DISTINCT FROM pg_catalog.btrim(exact_response_sha256)`,
    `::JSONB->>'attestationSha256'\n      IS DISTINCT FROM pg_catalog.btrim(exact_attestation_sha256)`,
    `verified_attestation->>'provider' IS DISTINCT FROM 'codex'`,
    `verified_attestation->>'model' IS DISTINCT FROM 'gpt-5.6-sol'`,
    `verified_attestation->>'reasoningEffort' IS DISTINCT FROM 'xhigh'`,
    `verified_attestation->>'runtimeEngine'\n      IS DISTINCT FROM 'subscription-runtime-cli'`,
    `verified_attestation->>'selectedOutputSha256' IS DISTINCT FROM\n` +
      `      pg_catalog.btrim(exact_response_sha256)`,
  ]) {
    assert(activation.includes(comparison),
      `activation completion comparison is not NULL-safe: ${comparison}`);
  }
  for (const constraint of ["publication_check", "job_key", "artifact_key",
    "publication_key", "job_fkey", "artifact_fkey", "publication_fkey"]) {
    assert(activation.includes(`reader_summary_daily_model_jobs_${constraint}`),
      `activation migration is missing ${constraint}`);
  }
  assert(activation.includes(`ALTER TABLE public."reader_summary_daily_model_jobs"
  DROP CONSTRAINT "reader_summary_daily_model_jobs_source_fkey";

ALTER TABLE public."reader_summary_daily_model_jobs"
  ADD CONSTRAINT "reader_summary_daily_model_jobs_source_fkey"
    FOREIGN KEY ("tenant_id", "workspace_id", "requested_utc_date")
      REFERENCES public."reader_summary_daily_source_authorities"
        ("tenant_id", "workspace_id", "requested_utc_date")
      ON DELETE RESTRICT ON UPDATE RESTRICT;`),
  "activation migration must correct daily source FK update-action parity");
  const temporaryDefinerSchemaCreateGrant = `GRANT CREATE ON SCHEMA public
TO social_monitor_reader_summary_daily_publication_definer;`;
  const firstAlterFunction = acl.indexOf("ALTER FUNCTION");
  assert(
    acl.split(temporaryDefinerSchemaCreateGrant).length === 2 &&
      acl.indexOf(temporaryDefinerSchemaCreateGrant) < firstAlterFunction &&
      !acl.includes("GRANT CREATE ON SCHEMA public\nTO PUBLIC"),
    "activation ACL migration must grant temporary CREATE to the definer exactly once before ALTER FUNCTION and never to PUBLIC",
  );
  const temporaryDefinerSetBlock =
    "DO $grant_daily_activation_definer_set$";
  const revokeDefinerSetBlock =
    "DO $revoke_daily_activation_definer_set$";
  const aclDefinerBootstrap = acl.slice(
    0, acl.indexOf("DO $validate_daily_activation_principals$"),
  );
  const finalDefinerAclGrants = [
    "GRANT USAGE, CREATE ON SCHEMA public",
    "GRANT SELECT, UPDATE ON TABLE",
    "GRANT SELECT ON TABLE",
  ] as const;
  const finalPublicationReadGrant = `GRANT SELECT ON TABLE
  public."reader_summary_artifacts",`;
  const finalSchemaCreateRevoke = "REVOKE CREATE ON SCHEMA public";
  const definerMembershipRevoke =
    "REVOKE social_monitor_reader_summary_daily_publication_definer";
  assert(
    acl.includes(readerSummaryDailyActivationDefinerRole) &&
      !acl.includes(`CREATE ROLE ${readerSummaryDailyActivationDefinerRole}`) &&
      acl.includes("DO $validate_daily_publication_definer_bootstrap$") &&
      aclDefinerBootstrap.includes("member.rolname = session_user") &&
      aclDefinerBootstrap.includes("count(*) <> 1") &&
      aclDefinerBootstrap.includes("grantor.rolsuper") &&
      !aclDefinerBootstrap.includes(
        "REVOKE social_monitor_reader_summary_daily_publication_definer",
      ) &&
      acl.includes("ALTER FUNCTION %s OWNER TO") &&
      acl.includes("relation.relowner") &&
      acl.includes("pg_auth_members AS membership") &&
      acl.includes(temporaryDefinerSetBlock) &&
      acl.includes(revokeDefinerSetBlock) &&
      acl.includes("WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER") &&
      finalDefinerAclGrants.every((grant) =>
        acl.includes(grant) &&
        acl.indexOf(revokeDefinerSetBlock) < acl.indexOf(grant)) &&
      acl.indexOf("ALTER DEFAULT PRIVILEGES IN SCHEMA public") <
        acl.indexOf(revokeDefinerSetBlock) &&
      acl.lastIndexOf(definerMembershipRevoke) <
        acl.indexOf(finalDefinerAclGrants[0]) &&
      acl.indexOf(finalPublicationReadGrant) <
        acl.indexOf(finalSchemaCreateRevoke) &&
      acl.includes("definer_usage") &&
      acl.includes("ALTER DEFAULT PRIVILEGES IN SCHEMA public") &&
      acl.includes("TO \"social_monitor_reader_summary_daily_terminal\"") &&
      acl.includes("relation.relforcerowsecurity") &&
      acl.includes("acl.grantee NOT IN (v_definer_oid, v_terminal_oid)"),
    "activation ACL migration must retain only the PG18 bootstrap edge, revoke temporary SET, and preserve FORCE RLS",
  );
  const preDefinerAudit = bootstrapPre.slice(
    bootstrapPre.indexOf(`CREATE ROLE ${readerSummaryDailyActivationDefinerRole}`),
  );
  const postDefinerAudit = bootstrapPost.slice(
    bootstrapPost.indexOf("DO $daily_activation_definer_audit$"),
  );
  const pg18CreatorEdge = [
    "grantor.rolsuper",
    "membership.admin_option", "NOT membership.inherit_option",
    "NOT membership.set_option",
  ];
  assert(
    bootstrapPre.includes(`CREATE ROLE ${readerSummaryDailyActivationDefinerRole}`) &&
      bootstrapPre.includes("createrole_self_grant', '', true") &&
      bootstrapPre.includes("daily publication definer PG18 bootstrap membership is unsafe") &&
      bootstrapPost.includes("DO $daily_activation_definer_audit$") &&
      bootstrapPost.includes("daily publication definer PG18 bootstrap membership is unsafe") &&
      preDefinerAudit.includes("member.rolname = current_user") &&
      postDefinerAudit.includes("member.rolname = session_user") &&
      pg18CreatorEdge.every((token) =>
        preDefinerAudit.includes(token) && postDefinerAudit.includes(token)),
    "pre/post bootstrap audits must prove the exact PG18 definer creator edge",
  );
};

type QueryClient = Readonly<{
  query<T = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<Readonly<{ rows: readonly T[] }>>;
}>;

type DailyCompletionNegativeFixture = Readonly<{
  date: string;
  fencing: unknown;
  identity: string;
  response: Buffer;
  responseSha: string;
  tenantId: string;
  worker: string;
  workspaceId: string;
}>;

export const assertDailyActivationRejectsNullishCompletionBindings = async (
  terminal: QueryClient,
  auditor: QueryClient,
  fixture: DailyCompletionNegativeFixture,
): Promise<void> => {
  const validAttestation = {
    provider: "codex", model: "gpt-5.6-sol", reasoningEffort: "xhigh",
    runtimeEngine: "subscription-runtime-cli",
    selectedOutputSha256: fixture.responseSha,
  };
  const validReceipt = (attestationSha256: string) => ({
    modelJobIdentity: fixture.identity, responseSha256: fixture.responseSha,
    attestationSha256,
  });
  const validAttestationSha = hashJson(validAttestation);
  const cases = [
    { attestation: {}, receipt: validReceipt(hashJson({})) },
    ...nullishFieldVariants(validAttestation).map((attestation) => ({
      attestation, receipt: validReceipt(hashJson(attestation)),
    })),
    { attestation: validAttestation, receipt: {} },
    ...nullishFieldVariants(validReceipt(validAttestationSha)).map(
      (receipt) => ({ attestation: validAttestation, receipt })),
  ];
  for (const candidate of cases) {
    const attestationBytes = jsonBytes(candidate.attestation);
    const receiptBytes = jsonBytes(candidate.receipt);
    await terminal.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    try {
      await terminal.query(`SELECT public.complete_reader_summary_daily_model_job(
        $1, $2, $3::DATE, $4, $5, pg_catalog.transaction_timestamp(),
        $6, $7, $8::JSONB, $9, $10, $11, $12)`, [
        fixture.tenantId, fixture.workspaceId, fixture.date, fixture.worker,
        fixture.fencing, fixture.response, fixture.responseSha,
        candidate.attestation, attestationBytes, hashBytes(attestationBytes),
        receiptBytes, hashBytes(receiptBytes),
      ]);
      throw new Error("NULLish completion binding was accepted");
    } catch (error: unknown) {
      assert(error instanceof Error && error.message.includes(
        "daily response or verified attestation receipt is invalid"),
      "NULLish completion binding did not fail closed");
    } finally {
      await terminal.query("ROLLBACK").catch(() => undefined);
    }
    const result = await auditor.query<{
      readonly publication_finalized_at: Date | null;
      readonly state: string;
    }>(`SELECT state, publication_finalized_at
        FROM public.reader_summary_daily_model_jobs
        WHERE tenant_id = $1 AND workspace_id = $2
          AND requested_utc_date = $3::DATE`,
    [fixture.tenantId, fixture.workspaceId, fixture.date]);
    assert(result.rows[0]?.state === "RUNNING" &&
      result.rows[0]?.publication_finalized_at === null,
    "rejected NULLish completion binding changed publication state");
  }
};

const jsonBytes = (value: unknown): Buffer =>
  Buffer.from(JSON.stringify(value), "utf8");
const hashBytes = (value: Buffer): string =>
  createHash("sha256").update(value).digest("hex");
const hashJson = (value: unknown): string => hashBytes(jsonBytes(value));
const nullishFieldVariants = (
  record: Readonly<Record<string, unknown>>,
): readonly Readonly<Record<string, unknown>>[] =>
  Object.keys(record).flatMap((key) => {
    const missing = { ...record };
    delete missing[key];
    return [missing, { ...record, [key]: null }];
  });

const dailyCompletionSignature =
  "public.complete_reader_summary_daily_model_job(uuid,uuid,date,text,bigint,timestamp with time zone,bytea,character,jsonb,bytea,character,bytea,character)";
const dailyPublicationSignature =
  "public.finalize_reader_summary_daily_publication(uuid,uuid,date,text,bigint,timestamp with time zone,uuid,uuid,uuid,character,character,character,bytea,character,bytea,character)";

export const assertDailyActivationIntermediateIsFailClosed = async (
  client: QueryClient,
): Promise<void> => {
  const result = await client.query<{
    readonly owner_create: boolean;
    readonly public_execute: boolean;
    readonly terminal_execute: boolean;
    readonly safe_metadata: boolean;
  }>(`
    SELECT
      pg_catalog.has_schema_privilege(
        'social_monitor_reader_summary_publication_owner', 'public', 'CREATE'
      ) AS owner_create,
      pg_catalog.has_function_privilege(
        'public', $1::REGPROCEDURE, 'EXECUTE'
      ) AS public_execute,
      pg_catalog.has_function_privilege(
        'social_monitor_reader_summary_daily_terminal',
        $1::REGPROCEDURE, 'EXECUTE'
      ) AS terminal_execute,
      (SELECT proc.prosecdef
          AND proc.proconfig = ARRAY['search_path=pg_catalog']::TEXT[]
          AND owner.rolname = 'social_monitor_public_schema_owner'
       FROM pg_catalog.pg_proc AS proc
       JOIN pg_catalog.pg_roles AS owner ON owner.oid = proc.proowner
       WHERE proc.oid = $1::REGPROCEDURE) AS safe_metadata
  `, [dailyPublicationSignature]);
  const row = result.rows[0];
  assert(row?.owner_create === false && row.public_execute === false &&
    row.terminal_execute === false && row.safe_metadata === true,
  "activation must remain fail-closed until its ordered ACL migration");
};

export const assertDailyActivationRuntimeSecurity = async (
  client: QueryClient,
  deniedRoles: readonly string[],
  migratorRole: string,
): Promise<void> => {
  const result = await client.query<{
    readonly activation_constraint_count: string;
    readonly acl_exact: boolean;
    readonly daily_access_diagnostics: string | null;
    readonly default_public_execute: boolean;
    readonly daily_access_exact: boolean;
    readonly daily_owner_boundary: boolean;
    readonly daily_owner_diagnostics: string | null;
    readonly denied_execute: boolean;
    readonly definer_incoming_count: string;
    readonly definer_incoming_memberships: string | null;
    readonly definer_incoming_safe: boolean;
    readonly definer_outgoing_memberships: string | null;
    readonly definer_outgoing_safe: boolean;
    readonly definer_schema_create: boolean;
    readonly definer_schema_usage: boolean;
    readonly definitions: readonly string[];
    readonly owner_create: boolean;
    readonly read_access_exact: boolean;
    readonly rls_count: string;
    readonly safe_metadata: boolean;
    readonly terminal_execute: boolean;
    readonly migrator_cannot_set_definer: boolean;
  }>(`
    WITH functions AS (
      SELECT proc.*, pg_catalog.pg_get_functiondef(proc.oid) AS definition
      FROM pg_catalog.pg_proc AS proc
      WHERE proc.oid = ANY(ARRAY[$1::REGPROCEDURE, $2::REGPROCEDURE]::OID[])
    ), daily_tables AS (
      SELECT relation.oid, relation.relname, relation.relowner,
        owner.rolname AS owner_name, owner.rolbypassrls AS owner_bypassrls
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      JOIN pg_catalog.pg_roles AS owner ON owner.oid = relation.relowner
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY(ARRAY[
          'reader_summary_daily_execution_cursors',
          'reader_summary_daily_model_jobs'
        ])
    ) SELECT
      pg_catalog.bool_and(proc.prosecdef
        AND proc.proconfig = ARRAY['search_path=pg_catalog']::TEXT[]
        AND owner.rolname = $5
        AND NOT owner.rolcanlogin AND NOT owner.rolsuper
        AND NOT owner.rolcreatedb AND NOT owner.rolcreaterole
        AND NOT owner.rolinherit AND NOT owner.rolreplication
        AND NOT owner.rolbypassrls AND owner.rolconfig IS NULL) AS safe_metadata,
      pg_catalog.bool_and(pg_catalog.has_function_privilege(
        'social_monitor_reader_summary_daily_terminal', proc.oid, 'EXECUTE'
      )) AS terminal_execute,
      EXISTS (SELECT 1 FROM functions AS denied_function
        CROSS JOIN pg_catalog.unnest($3::TEXT[]) AS denied(role_name)
        WHERE pg_catalog.has_function_privilege(
          denied.role_name, denied_function.oid, 'EXECUTE'
        )) AS denied_execute,
      NOT EXISTS (SELECT 1 FROM functions AS acl_function
        CROSS JOIN LATERAL pg_catalog.aclexplode(acl_function.proacl) AS acl
        WHERE acl.privilege_type = 'EXECUTE'
          AND acl.grantee NOT IN (
            acl_function.proowner,
            'social_monitor_reader_summary_daily_terminal'::REGROLE::OID
          ))
        AS acl_exact,
      pg_catalog.has_schema_privilege(
        'social_monitor_reader_summary_publication_owner', 'public', 'CREATE'
      ) AS owner_create,
      NOT pg_catalog.pg_has_role($4, $5, 'SET') AS migrator_cannot_set_definer,
      (SELECT pg_catalog.bool_and(
          pg_catalog.has_table_privilege(
            $5, daily_table.oid,
            'SELECT,UPDATE'
          ) AND NOT pg_catalog.has_table_privilege(
            $5, daily_table.oid,
            'INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER'
          )
        )
       FROM daily_tables AS daily_table) AS daily_access_exact,
      (SELECT pg_catalog.string_agg(
          pg_catalog.format(
            '%s(relowner=%s, bypassrls=%s, select=%s, update=%s, '
            'insert=%s, delete=%s, truncate=%s, references=%s, trigger=%s)',
            daily_table.relname, daily_table.owner_name,
            daily_table.owner_bypassrls,
            pg_catalog.has_table_privilege($5, daily_table.oid, 'SELECT'),
            pg_catalog.has_table_privilege($5, daily_table.oid, 'UPDATE'),
            pg_catalog.has_table_privilege($5, daily_table.oid, 'INSERT'),
            pg_catalog.has_table_privilege($5, daily_table.oid, 'DELETE'),
            pg_catalog.has_table_privilege($5, daily_table.oid, 'TRUNCATE'),
            pg_catalog.has_table_privilege($5, daily_table.oid, 'REFERENCES'),
            pg_catalog.has_table_privilege($5, daily_table.oid, 'TRIGGER')
          ),
          '; ' ORDER BY daily_table.relname
        ) FROM daily_tables AS daily_table) AS daily_access_diagnostics,
      NOT EXISTS (
        SELECT 1
        FROM daily_tables AS daily_table
        WHERE daily_table.relowner = $5::REGROLE::OID
          OR daily_table.owner_bypassrls
          OR pg_catalog.pg_has_role($5, daily_table.owner_name, 'MEMBER')
          OR pg_catalog.pg_has_role($5, daily_table.owner_name, 'USAGE')
          OR pg_catalog.pg_has_role($5, daily_table.owner_name, 'SET')
      ) AS daily_owner_boundary,
      (SELECT pg_catalog.string_agg(
          pg_catalog.format(
            '%s(relowner=%s, bypassrls=%s, member=%s, usage=%s, set=%s)',
            daily_table.relname, daily_table.owner_name,
            daily_table.owner_bypassrls,
            pg_catalog.pg_has_role($5, daily_table.owner_name, 'MEMBER'),
            pg_catalog.pg_has_role($5, daily_table.owner_name, 'USAGE'),
            pg_catalog.pg_has_role($5, daily_table.owner_name, 'SET')
          ),
          '; ' ORDER BY daily_table.relname
        ) FROM daily_tables AS daily_table) AS daily_owner_diagnostics,
      NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_auth_members AS membership
        WHERE membership.member = $5::REGROLE::OID
      ) AS definer_outgoing_safe,
      (SELECT pg_catalog.string_agg(
          pg_catalog.format(
            '%s->%s(admin=%s, inherit=%s, set=%s, grantor=%s)',
            member.rolname, granted.rolname, membership.admin_option,
            membership.inherit_option, membership.set_option, grantor.rolname
          ),
          '; ' ORDER BY granted.rolname, grantor.rolname
        )
       FROM pg_catalog.pg_auth_members AS membership
       JOIN pg_catalog.pg_roles AS granted ON granted.oid = membership.roleid
       JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
       JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = membership.grantor
       WHERE membership.member = $5::REGROLE::OID) AS definer_outgoing_memberships,
      (SELECT pg_catalog.count(*)::TEXT
       FROM pg_catalog.pg_auth_members AS membership
       WHERE membership.roleid = $5::REGROLE::OID) AS definer_incoming_count,
      (SELECT pg_catalog.count(*) = 1
          AND pg_catalog.bool_and(
            member.rolname = $4 AND grantor.rolsuper
            AND membership.admin_option AND NOT membership.inherit_option
            AND NOT membership.set_option
          )
       FROM pg_catalog.pg_auth_members AS membership
       JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
       JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = membership.grantor
       WHERE membership.roleid = $5::REGROLE::OID) AS definer_incoming_safe,
      (SELECT pg_catalog.string_agg(
          pg_catalog.format(
            '%s->%s(admin=%s, inherit=%s, set=%s, grantor=%s)',
            member.rolname, granted.rolname, membership.admin_option,
            membership.inherit_option, membership.set_option, grantor.rolname
          ),
          '; ' ORDER BY member.rolname, grantor.rolname
        )
       FROM pg_catalog.pg_auth_members AS membership
       JOIN pg_catalog.pg_roles AS granted ON granted.oid = membership.roleid
       JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
       JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = membership.grantor
       WHERE membership.roleid = $5::REGROLE::OID) AS definer_incoming_memberships,
      pg_catalog.has_schema_privilege($5, 'public', 'USAGE') AS definer_schema_usage,
      pg_catalog.has_schema_privilege($5, 'public', 'CREATE') AS definer_schema_create,
      (SELECT pg_catalog.bool_and(
          pg_catalog.has_table_privilege($5, read_table.name, 'SELECT')
          AND NOT pg_catalog.has_table_privilege(
            $5, read_table.name,
            'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
          )
        )
       FROM pg_catalog.unnest(ARRAY[
         'public.reader_summary_artifacts',
         'public.reader_summary_publications',
         'public.reader_summary_weekly_publication_evidence',
         'public.reader_summary_jobs'
       ]) AS read_table(name)) AS read_access_exact,
      (SELECT pg_catalog.count(*)::TEXT
       FROM pg_catalog.pg_constraint AS constraint_row
       JOIN pg_catalog.pg_class AS relation
         ON relation.oid = constraint_row.conrelid
       JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relname = 'reader_summary_daily_model_jobs'
         AND constraint_row.convalidated
         AND constraint_row.conname = ANY(ARRAY[
           'reader_summary_daily_model_jobs_publication_check',
           'reader_summary_daily_model_jobs_job_key',
           'reader_summary_daily_model_jobs_artifact_key',
           'reader_summary_daily_model_jobs_publication_key',
           'reader_summary_daily_model_jobs_job_fkey',
           'reader_summary_daily_model_jobs_artifact_fkey',
           'reader_summary_daily_model_jobs_publication_fkey']))
        AS activation_constraint_count,
      EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl AS defaults
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = defaults.defaclnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(defaults.defaclacl) AS acl
        WHERE defaults.defaclrole IN (
            $5::REGROLE::OID,
            'social_monitor_public_schema_owner'::REGROLE::OID
          )
          AND defaults.defaclobjtype = 'f' AND namespace.nspname = 'public'
          AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE')
        AS default_public_execute,
      (SELECT pg_catalog.count(*)::TEXT
       FROM pg_catalog.pg_class AS relation
       JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relname = ANY(ARRAY[
           'reader_summary_artifacts', 'reader_summary_publications',
           'reader_summary_publication_slots',
           'reader_summary_weekly_publication_evidence',
           'reader_summary_jobs'])
         AND relation.relrowsecurity AND relation.relforcerowsecurity)
        AS rls_count,
      pg_catalog.array_agg(proc.definition ORDER BY proc.oid) AS definitions
    FROM functions AS proc
    JOIN pg_catalog.pg_roles AS owner ON owner.oid = proc.proowner
  `, [
    dailyCompletionSignature,
    dailyPublicationSignature,
    deniedRoles,
    migratorRole,
    readerSummaryDailyActivationDefinerRole,
  ]);
  const row = result.rows[0];
  assert(row?.safe_metadata && row.terminal_execute && row.acl_exact &&
    row.daily_access_exact && row.daily_owner_boundary &&
    row.definer_outgoing_safe && row.definer_incoming_count === "1" &&
    row.definer_incoming_safe &&
    row.migrator_cannot_set_definer &&
    row.definer_schema_usage && !row.definer_schema_create &&
    row.read_access_exact &&
    !row.denied_execute && !row.owner_create &&
    !row.default_public_execute && row.rls_count === "5" &&
    row.activation_constraint_count === "7",
  `daily activation ownership, ACL, schema, RLS, or post-revoke boundary is unsafe ` +
    `(relations=${row?.daily_owner_diagnostics ?? "<missing>"}; ` +
    `privileges=${row?.daily_access_diagnostics ?? "<missing>"}; ` +
    `outgoing=${row?.definer_outgoing_memberships ?? "<none>"}; ` +
    `incoming=${row?.definer_incoming_memberships ?? "<none>"})`);
  for (const definition of row?.definitions ?? []) {
    assert(definition.includes("FROM public.") &&
      definition.includes("SET search_path TO 'pg_catalog'") &&
      !definition.includes("search_path TO 'pg_catalog', 'public'") &&
      !/(?:FROM|JOIN|UPDATE)\s+"reader_summary_/u.test(definition),
    "daily activation definition permits public/temporary schema shadowing");
  }
};

export const assertDailyActivationRejectsTemporaryForgeries = async (
  terminal: QueryClient,
): Promise<void> => {
  const tenantId = "00000000-0000-4000-8000-000000000001";
  const workspaceId = "00000000-0000-4000-8000-000000000002";
  const zeroSha = "0".repeat(64);
  const attestation = {
    provider: "codex", model: "gpt-5.6-sol", reasoningEffort: "xhigh",
    runtimeEngine: "subscription-runtime-cli", selectedOutputSha256: zeroSha,
  };
  const attestationBytes = Buffer.from(JSON.stringify(attestation), "utf8");
  const receiptBytes = Buffer.from(JSON.stringify({
    modelJobIdentity: "forged-temp-job", responseSha256: zeroSha,
    attestationSha256: zeroSha,
  }), "utf8");
  await terminal.query(`CREATE TEMP TABLE reader_summary_daily_execution_cursors (
    tenant_id UUID,
    workspace_id UUID,
    next_unresolved_utc_date DATE,
    active_requested_utc_date DATE,
    lease_owner TEXT,
    fencing_token BIGINT,
    leased_at TIMESTAMPTZ,
    lease_expires_at TIMESTAMPTZ,
    absolute_expires_at TIMESTAMPTZ
  )`);
  await terminal.query(`CREATE TEMP TABLE reader_summary_daily_model_jobs (
    tenant_id UUID,
    workspace_id UUID,
    requested_utc_date DATE,
    identity TEXT,
    source_authority_sha256 CHAR(64),
    provider TEXT,
    model TEXT,
    reasoning_effort TEXT,
    runtime_engine TEXT,
    state TEXT,
    reserved_at TIMESTAMPTZ,
    running_at TIMESTAMPTZ
  )`);
  await terminal.query(`CREATE FUNCTION pg_temp.sha256(BYTEA) RETURNS BYTEA
    LANGUAGE SQL IMMUTABLE AS
    'SELECT pg_catalog.decode(pg_catalog.repeat(''00'', 32), ''hex'')'`);
  await terminal.query(`INSERT INTO pg_temp.reader_summary_daily_execution_cursors
    (tenant_id, workspace_id, next_unresolved_utc_date,
     active_requested_utc_date, lease_owner, fencing_token, leased_at,
     lease_expires_at, absolute_expires_at)
    VALUES ($1, $2, DATE '2026-01-01', DATE '2026-01-01', 'forgery', 1,
      pg_catalog.transaction_timestamp(),
      pg_catalog.transaction_timestamp() + INTERVAL '10 minutes',
      pg_catalog.transaction_timestamp() + INTERVAL '20 minutes')`,
  [tenantId, workspaceId]);
  await terminal.query(`INSERT INTO pg_temp.reader_summary_daily_model_jobs
    (tenant_id, workspace_id, requested_utc_date, identity,
     source_authority_sha256, provider, model, reasoning_effort,
     runtime_engine, state, reserved_at, running_at)
    VALUES ($1, $2, DATE '2026-01-01', 'forged-temp-job', $3,
      'codex', 'gpt-5.6-sol', 'xhigh', 'subscription-runtime-cli', 'RUNNING',
      pg_catalog.transaction_timestamp(), pg_catalog.transaction_timestamp())`,
  [tenantId, workspaceId, zeroSha]);
  await terminal.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await terminal.query(`SELECT public.complete_reader_summary_daily_model_job(
      $1, $2, DATE '2026-01-01', 'forgery', 1,
      pg_catalog.transaction_timestamp(), ''::BYTEA, $3, $4, $5, $3, $6, $3)`,
    [tenantId, workspaceId, zeroSha, attestation, attestationBytes, receiptBytes]);
    throw new Error("temporary-schema forgery reached daily completion");
  } catch (error: unknown) {
    assert(error instanceof Error && error.message.includes("query returned no rows"),
      "daily completion resolved a forged temporary object");
  } finally {
    await terminal.query("ROLLBACK").catch(() => undefined);
    const forged = await terminal.query<{ readonly state: string }>(`
      SELECT state FROM pg_temp.reader_summary_daily_model_jobs
      WHERE tenant_id = $1 AND workspace_id = $2`, [tenantId, workspaceId]);
    assert(forged.rows[0]?.state === "RUNNING",
      "public-qualified completion mutated the forged temporary job");
  }
  const evidence = Buffer.from("{}", "utf8");
  const frontend = Buffer.from("{}", "utf8");
  await terminal.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await terminal.query(`SELECT public.finalize_reader_summary_daily_publication(
      $1, $2, DATE '2026-01-01', 'forgery', 1,
      pg_catalog.transaction_timestamp(), $3, $3, $3, $4, $4, $4,
      $5, $4, $6, $4)`,
    [tenantId, workspaceId, tenantId, zeroSha, evidence, frontend]);
    throw new Error("temporary-schema forgery reached daily finalization");
  } catch (error: unknown) {
    assert(error instanceof Error && error.message.includes("query returned no rows"),
      "daily finalizer resolved a forged temporary object");
  } finally {
    await terminal.query("ROLLBACK").catch(() => undefined);
    const forged = await terminal.query<{ readonly state: string }>(`
      SELECT state FROM pg_temp.reader_summary_daily_model_jobs
      WHERE tenant_id = $1 AND workspace_id = $2`, [tenantId, workspaceId]);
    assert(forged.rows[0]?.state === "RUNNING",
      "public-qualified finalizer mutated the forged temporary job");
    await terminal.query("DISCARD TEMP");
  }
};

export const assertReaderSummaryMigrationDatabaseMatchesSchema = (
  url: string,
): void => {
  const paritySchema = createReaderSummaryMigrationParitySchema();
  try {
    const result = spawnPrisma(
      ["migrate", "diff", "--from-config-datasource", "--to-schema",
        paritySchema.schemaPath, "--exit-code"],
      { DATABASE_URL: url },
    );
    if (result.status !== 0) {
      process.stderr.write(result.stderr);
      process.stdout.write(result.stdout);
      throw new Error(
        "ordered migrations must match the schema and daily authority tables",
      );
    }
  } finally {
    rmSync(paritySchema.directory, { recursive: true, force: true });
  }
};

const createReaderSummaryMigrationParitySchema = (): Readonly<{
  directory: string; schemaPath: string;
}> => {
  const directory = mkdtempSync(join(tmpdir(), "reader-summary-migration-parity-"));
  const schemaPath = join(directory, "schema.prisma");
  try {
    const productionSchema = readFileSync("prisma/schema.prisma", "utf8");
    const mappedCount = terminalOwnedDailyTableNames.filter((name) =>
      productionSchema.includes(`@@map("${name}")`)).length;
    assert(mappedCount === 0 || mappedCount === terminalOwnedDailyTableNames.length,
      "Prisma schema must model all or none of the daily authority tables");
    writeFileSync(schemaPath, mappedCount === terminalOwnedDailyTableNames.length
      ? productionSchema : `${productionSchema}\n${terminalOwnedDailyParityModels}`);
    return { directory, schemaPath };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
};

const terminalOwnedDailyTableNames = [
  "reader_summary_daily_execution_cursors",
  "reader_summary_daily_source_authorities",
  "reader_summary_daily_model_jobs",
] as const;

// Fallback parity models keep terminal-owned tables out of the application
// client while migration drift remains executable. PostgreSQL CHECK clauses
// are asserted directly by assertDailyActivationMigrationContract.
const terminalOwnedDailyParityModels = `
model ReaderSummaryDailyExecutionCursorMigrationParity {
  tenantId String @map("tenant_id") @db.Uuid
  workspaceId String @map("workspace_id") @db.Uuid
  nextUnresolvedUtcDate DateTime @map("next_unresolved_utc_date") @db.Date
  activeRequestedUtcDate DateTime? @map("active_requested_utc_date") @db.Date
  leaseOwner String? @map("lease_owner")
  fencingToken BigInt @default(0) @map("fencing_token")
  leasedAt DateTime? @map("leased_at") @db.Timestamptz(6)
  leaseExpiresAt DateTime? @map("lease_expires_at") @db.Timestamptz(6)
  absoluteExpiresAt DateTime? @map("absolute_expires_at") @db.Timestamptz(6)
  recoveryRequiredAt DateTime? @map("recovery_required_at") @db.Timestamptz(6)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @default(now()) @map("updated_at") @db.Timestamptz(6)
  @@id([tenantId, workspaceId], map: "reader_summary_daily_execution_cursors_pkey")
  @@map("reader_summary_daily_execution_cursors")
}
model ReaderSummaryDailySourceAuthorityMigrationParity {
  tenantId String @map("tenant_id") @db.Uuid
  workspaceId String @map("workspace_id") @db.Uuid
  requestedUtcDate DateTime @map("requested_utc_date") @db.Date
  ingestionCutoff DateTime @map("ingestion_cutoff") @db.Timestamptz(6)
  canonicalRecord Json @map("canonical_record")
  canonicalBytes Bytes @map("canonical_bytes")
  canonicalSha256 String @map("canonical_sha256") @db.Char(64)
  createdAt DateTime @map("created_at") @db.Timestamptz(6)
  modelJob ReaderSummaryDailyModelJobMigrationParity?
  @@id([tenantId, workspaceId, requestedUtcDate], map: "reader_summary_daily_source_authorities_pkey")
  @@map("reader_summary_daily_source_authorities")
}
model ReaderSummaryDailyModelJobMigrationParity {
  tenantId String @map("tenant_id") @db.Uuid
  workspaceId String @map("workspace_id") @db.Uuid
  requestedUtcDate DateTime @map("requested_utc_date") @db.Date
  identity String @unique(map: "reader_summary_daily_model_jobs_identity_key")
  sourceAuthoritySha256 String @map("source_authority_sha256") @db.Char(64)
  provider String
  model String
  reasoningEffort String @map("reasoning_effort")
  runtimeEngine String @map("runtime_engine")
  state String
  reservedAt DateTime @map("reserved_at") @db.Timestamptz(6)
  runningAt DateTime? @map("running_at") @db.Timestamptz(6)
  completedAt DateTime? @map("completed_at") @db.Timestamptz(6)
  failedAmbiguousAt DateTime? @map("failed_ambiguous_at") @db.Timestamptz(6)
  responseBytes Bytes? @map("response_bytes")
  responseSha256 String? @map("response_sha256") @db.Char(64)
  attestation Json?
  attestationBytes Bytes? @map("attestation_bytes")
  attestationSha256 String? @map("attestation_sha256") @db.Char(64)
  receiptBytes Bytes? @map("receipt_bytes")
  receiptSha256 String? @map("receipt_sha256") @db.Char(64)
  readerSummaryJobId String? @unique(map: "reader_summary_daily_model_jobs_job_key") @map("reader_summary_job_id") @db.Uuid
  readerSummaryArtifactId String? @unique(map: "reader_summary_daily_model_jobs_artifact_key") @map("reader_summary_artifact_id") @db.Uuid
  publicationId String? @unique(map: "reader_summary_daily_model_jobs_publication_key") @map("publication_id") @db.Uuid
  publicationReportSha256 String? @map("publication_report_sha256") @db.Char(64)
  publicationProofSha256 String? @map("publication_proof_sha256") @db.Char(64)
  weeklyEvidenceSha256 String? @map("weekly_evidence_sha256") @db.Char(64)
  publicEvidenceSha256 String? @map("public_evidence_sha256") @db.Char(64)
  publicFrontendSha256 String? @map("public_frontend_sha256") @db.Char(64)
  publicationFinalizedAt DateTime? @map("publication_finalized_at") @db.Timestamptz(6)
  sourceAuthority ReaderSummaryDailySourceAuthorityMigrationParity @relation(fields: [tenantId, workspaceId, requestedUtcDate], references: [tenantId, workspaceId, requestedUtcDate], onDelete: Restrict, onUpdate: Restrict, map: "reader_summary_daily_model_jobs_source_fkey")
  readerSummaryJob ReaderSummaryJob? @relation("ReaderSummaryDailyJob", fields: [readerSummaryJobId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "reader_summary_daily_model_jobs_job_fkey")
  readerSummaryArtifact ReaderSummaryArtifact? @relation("ReaderSummaryDailyArtifact", fields: [readerSummaryArtifactId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "reader_summary_daily_model_jobs_artifact_fkey")
  publication ReaderSummaryPublication? @relation("ReaderSummaryDailyPublication", fields: [publicationId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "reader_summary_daily_model_jobs_publication_fkey")
  @@id([tenantId, workspaceId, requestedUtcDate], map: "reader_summary_daily_model_jobs_pkey")
  @@map("reader_summary_daily_model_jobs")
}
`;

const copyMigration = (
  workspace: ReaderSummaryPublicationMigrationWorkspace,
  migration: string,
): void => {
  cpSync(
    join("prisma/migrations", migration),
    join(workspace.directory, "migrations", migration),
    { recursive: true },
  );
};

const readMigration = (migration: string): string =>
  readFileSync(join("prisma/migrations", migration, "migration.sql"), "utf8");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const spawnPrisma = (
  args: readonly string[],
  env: Readonly<Record<string, string>>,
) =>
  spawnSync(process.platform === "win32" ? "prisma.cmd" : "prisma", args, {
    encoding: "utf8",
    env: { ...process.env, JITI_FS_CACHE: "false", ...env },
  });
