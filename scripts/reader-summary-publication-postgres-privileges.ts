import { readFileSync } from "node:fs";

import { Pool, type PoolClient } from "pg";

const protectedOwner = "social_monitor_reader_summary_publication_owner";

export const runReaderSummaryPublicationBootstrapSql = async (
  phase: "pre" | "post",
  databaseUrl: string,
  applicationRole: string,
): Promise<void> => {
  const path = `ops/deploy/reader-summary-publication-${phase}-migration.sql`;
  const sql = readFileSync(path, "utf8")
    .replace(/^\\set[^\n]*\n/gm, "")
    .replaceAll(":'runtime_role'", quoteLiteral(applicationRole))
    .replaceAll(':"runtime_role"', quoteIdentifier(applicationRole));
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await pool.query(sql);
  } finally {
    await pool.end();
  }
};

export const grantPublicationFixtureRuntimePrivileges = async (
  admin: Pool,
  applicationRole: string,
): Promise<void> => {
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE ON TABLE reader_summary_jobs
       TO ${quoteIdentifier(applicationRole)};
     GRANT SELECT ON TABLE outbox_events
       TO ${quoteIdentifier(applicationRole)}`,
  );
};

export const grantLegacyMigrationOwnership = async (
  databaseUrl: string,
  applicationRole: string,
): Promise<void> => {
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await admin.query(
      `GRANT USAGE, CREATE ON SCHEMA public
         TO ${quoteIdentifier(applicationRole)}`,
    );
  } finally {
    await admin.end();
  }
};

export const createPublicationFixtureRuntimeRole = async (params: {
  readonly databaseName: string;
  readonly migrationAdminRole: string;
  readonly runtimePassword: string;
  readonly runtimeRole: string;
  readonly serverAdminDatabaseUrl: string;
}): Promise<void> => {
  const admin = new Pool({
    connectionString: params.serverAdminDatabaseUrl,
    max: 1,
  });
  try {
    await admin.query(
      `CREATE ROLE ${quoteIdentifier(params.runtimeRole)} LOGIN PASSWORD ${quoteLiteral(params.runtimePassword)}
       NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS`,
    );
    await admin.query(
      `GRANT CONNECT, CREATE ON DATABASE ${quoteIdentifier(params.databaseName)}
         TO ${quoteIdentifier(params.runtimeRole)}`,
    );
    for (const membershipOption of [
      "ADMIN TRUE",
      "INHERIT FALSE",
      "SET TRUE",
    ]) {
      await admin.query(
        `GRANT ${quoteIdentifier(params.runtimeRole)}
          TO ${quoteIdentifier(params.migrationAdminRole)}
          WITH ${membershipOption}`,
      );
    }
  } finally {
    await admin.end();
  }
};

export const assertPreMigrationArtifactRuntimeContinuity = async (
  runtimeDatabaseUrl: string,
): Promise<void> => {
  const runtime = new Pool({ connectionString: runtimeDatabaseUrl, max: 1 });
  const client = await runtime.connect();
  try {
    const privileges = await client.query<{
      readonly capability_insert: boolean;
      readonly capability_delete: boolean;
      readonly capability_references: boolean;
      readonly capability_select: boolean;
      readonly capability_trigger: boolean;
      readonly capability_truncate: boolean;
      readonly capability_update: boolean;
      readonly runtime_delete: boolean;
      readonly runtime_insert: boolean;
      readonly runtime_references: boolean;
      readonly runtime_select: boolean;
      readonly runtime_trigger: boolean;
      readonly runtime_truncate: boolean;
      readonly runtime_update: boolean;
    }>(
      `SELECT
         has_table_privilege(
           'social_monitor_reader_summary_publication_runtime',
           'reader_summary_artifacts', 'SELECT'
         ) AS capability_select,
         has_table_privilege(
           'social_monitor_reader_summary_publication_runtime',
           'reader_summary_artifacts', 'INSERT'
         ) AS capability_insert,
         has_table_privilege(
           'social_monitor_reader_summary_publication_runtime',
           'reader_summary_artifacts', 'UPDATE'
         ) AS capability_update,
         has_table_privilege(
           'social_monitor_reader_summary_publication_runtime',
           'reader_summary_artifacts', 'DELETE'
         ) AS capability_delete,
         has_table_privilege(
           'social_monitor_reader_summary_publication_runtime',
           'reader_summary_artifacts', 'TRUNCATE'
         ) AS capability_truncate,
         has_table_privilege(
           'social_monitor_reader_summary_publication_runtime',
           'reader_summary_artifacts', 'REFERENCES'
         ) AS capability_references,
         has_table_privilege(
           'social_monitor_reader_summary_publication_runtime',
           'reader_summary_artifacts', 'TRIGGER'
         ) AS capability_trigger,
         has_table_privilege(current_user, 'reader_summary_artifacts', 'SELECT')
           AS runtime_select,
         has_table_privilege(current_user, 'reader_summary_artifacts', 'INSERT')
           AS runtime_insert,
         has_table_privilege(current_user, 'reader_summary_artifacts', 'UPDATE')
           AS runtime_update,
         has_table_privilege(current_user, 'reader_summary_artifacts', 'DELETE')
           AS runtime_delete,
         has_table_privilege(current_user, 'reader_summary_artifacts', 'TRUNCATE')
           AS runtime_truncate,
         has_table_privilege(current_user, 'reader_summary_artifacts', 'REFERENCES')
           AS runtime_references,
         has_table_privilege(current_user, 'reader_summary_artifacts', 'TRIGGER')
           AS runtime_trigger`,
    );
    assertDeepEqual(
      privileges.rows[0],
      {
        capability_select: true,
        capability_insert: true,
        capability_update: true,
        capability_delete: false,
        capability_truncate: false,
        capability_references: false,
        capability_trigger: false,
        runtime_select: true,
        runtime_insert: true,
        runtime_update: true,
        runtime_delete: false,
        runtime_truncate: false,
        runtime_references: false,
        runtime_trigger: false,
      },
      "pre phase alone must preserve only the live runtime artifact path",
    );

    await client.query("BEGIN");
    await client.query("SELECT count(*) FROM reader_summary_artifacts");
    await client.query(
      `INSERT INTO reader_summary_artifacts (
         id, tenant_id, workspace_id, scope_type, scope_key, cadence,
         period_started_at, period_ended_at, period_timezone, period_key,
         status, model_version, prompt_version, headline, artifact_payload,
         citations, quality_signals, created_at, updated_at
       ) VALUES (
         '00000000-0000-7000-8000-000000000099',
         '00000000-0000-7000-8000-000000000091',
         '00000000-0000-7000-8000-000000000092',
         'workspace', 'workspace', 'daily',
         '2026-07-23T00:00:00.000Z', '2026-07-24T00:00:00.000Z',
         'UTC', 'daily:2026-07-23T00:00:00.000Z:2026-07-24T00:00:00.000Z:UTC',
         'RUNNING', 'pre-migration-continuity', 'pre-migration-continuity',
         'Hidden candidate', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb,
         '2026-07-23T10:00:00.000Z', '2026-07-23T10:00:00.000Z'
       )`,
    );
    const updated = await client.query<{ readonly headline: string }>(
      `UPDATE reader_summary_artifacts
          SET headline = 'Updated hidden candidate',
              updated_at = '2026-07-23T10:01:00.000Z'
        WHERE id = '00000000-0000-7000-8000-000000000099'
      RETURNING headline`,
    );
    assertDeepEqual(
      updated.rows,
      [{ headline: "Updated hidden candidate" }],
      "pre phase runtime must still insert and update hidden candidates",
    );
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    await runtime.end();
  }
};

export const assertPublicationRoleMemberships = async (
  databaseUrl: string,
  migrationAdminRole: string,
  runtimeRole: string,
): Promise<void> => {
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const memberships = await admin.query<{
      readonly admin_option: boolean;
      readonly granted_role: string;
      readonly inherit_option: boolean;
      readonly member_role: string;
      readonly set_option: boolean;
    }>(
      `SELECT granted.rolname AS granted_role,
              member.rolname AS member_role,
              membership.admin_option,
              membership.inherit_option,
              membership.set_option
         FROM pg_auth_members membership
         JOIN pg_roles granted ON granted.oid = membership.roleid
         JOIN pg_roles member ON member.oid = membership.member
        WHERE member.rolname = ANY($1::text[])
          AND granted.rolname = ANY($2::text[])
        ORDER BY granted.rolname, member.rolname, membership.grantor`,
      [
        [migrationAdminRole, runtimeRole],
        [
          runtimeRole,
          "social_monitor_reader_summary_publication_owner",
          "social_monitor_reader_summary_publication_runtime",
        ],
      ],
    );
    assertDeepEqual(
      memberships.rows,
      [
        {
          granted_role: "social_monitor_reader_summary_publication_owner",
          member_role: migrationAdminRole,
          admin_option: true,
          inherit_option: false,
          set_option: true,
        },
        {
          granted_role: "social_monitor_reader_summary_publication_runtime",
          member_role: migrationAdminRole,
          admin_option: true,
          inherit_option: false,
          set_option: false,
        },
        {
          granted_role: "social_monitor_reader_summary_publication_runtime",
          member_role: runtimeRole,
          admin_option: false,
          inherit_option: true,
          set_option: false,
        },
        {
          granted_role: runtimeRole,
          member_role: migrationAdminRole,
          admin_option: true,
          inherit_option: false,
          set_option: true,
        },
      ].sort((left, right) =>
        `${left.granted_role}\0${left.member_role}`.localeCompare(
          `${right.granted_role}\0${right.member_role}`,
        ),
      ),
      "publication role memberships must match the exact PostgreSQL 18 boundary",
    );
  } finally {
    await admin.end();
  }
};

export const dropPublicationFixtureDatabaseAndRoles = async (params: {
  readonly serverAdmin: Pool;
  readonly databaseName: string;
  readonly migrationAdminRole: string;
  readonly runtimeRole: string;
  readonly ownerRolePreexisting: boolean;
  readonly capabilityRolePreexisting: boolean;
  readonly fixtureDatabaseCreated: boolean;
  readonly fixtureMigrationAdminRoleCreated: boolean;
  readonly fixtureRuntimeRoleCreated: boolean;
}): Promise<void> => {
  if (params.fixtureDatabaseCreated) {
    await params.serverAdmin.query(
      `DROP DATABASE ${quoteIdentifier(params.databaseName)} WITH (FORCE)`,
    );
  }
  if (params.fixtureRuntimeRoleCreated) {
    await params.serverAdmin.query(
      `DROP ROLE ${quoteIdentifier(params.runtimeRole)}`,
    );
  }
  if (!params.capabilityRolePreexisting) {
    await params.serverAdmin.query(
      `DROP ROLE IF EXISTS social_monitor_reader_summary_publication_runtime`,
    );
  }
  if (!params.ownerRolePreexisting) {
    await params.serverAdmin.query(
      `DROP ROLE IF EXISTS social_monitor_reader_summary_publication_owner`,
    );
  }
  if (params.fixtureMigrationAdminRoleCreated) {
    await params.serverAdmin.query(
      `DROP ROLE ${quoteIdentifier(params.migrationAdminRole)}`,
    );
  }
};

export function publicationDatabaseUrl(
  value: string,
  targetDatabase: string,
): string {
  const parsed = postgresUrl(value);
  parsed.pathname = `/${targetDatabase}`;
  parsed.searchParams.delete("schema");
  return parsed.toString();
}

export function publicationRuntimeDatabaseUrl(
  value: string,
  username: string,
  password: string,
): string {
  const parsed = postgresUrl(value);
  parsed.username = username;
  parsed.password = password;
  return parsed.toString();
}

export const quotePostgresIdentifier = (value: string): string =>
  `"${value.replaceAll('"', '""')}"`;

export const quotePostgresLiteral = (value: string): string =>
  `'${value.replaceAll("'", "''")}'`;

export const assertReaderSummaryPublicationPrivilegeBoundary = async (params: {
  readonly auditor: PoolClient;
  readonly runtime: PoolClient;
  readonly migrationAdminRole: string;
  readonly runtimeRole: string;
  readonly artifactIds: readonly [string, string];
  readonly proofSha256: string;
}): Promise<void> => {
  const roles = await params.auditor.query<{
    readonly owner_login: boolean;
    readonly owner_superuser: boolean;
    readonly migration_admin_superuser: boolean;
    readonly migration_admin_createrole: boolean;
    readonly runtime_superuser: boolean;
    readonly runtime_createrole: boolean;
    readonly runtime_bypassrls: boolean;
  }>(
    `SELECT
       (SELECT rolcanlogin FROM pg_roles WHERE rolname = $2) AS owner_login,
       (SELECT rolsuper FROM pg_roles WHERE rolname = $2) AS owner_superuser,
       (SELECT rolsuper FROM pg_roles WHERE rolname = $3)
         AS migration_admin_superuser,
       (SELECT rolcreaterole FROM pg_roles WHERE rolname = $3)
         AS migration_admin_createrole,
       (SELECT rolsuper FROM pg_roles WHERE rolname = $1)
         AS runtime_superuser,
       (SELECT rolcreaterole FROM pg_roles WHERE rolname = $1)
         AS runtime_createrole,
       (SELECT rolbypassrls FROM pg_roles WHERE rolname = $1)
         AS runtime_bypassrls`,
    [params.runtimeRole, protectedOwner, params.migrationAdminRole],
  );
  assertDeepEqual(
    roles.rows[0],
    {
      owner_login: false,
      owner_superuser: false,
      migration_admin_superuser: false,
      migration_admin_createrole: true,
      runtime_superuser: false,
      runtime_createrole: false,
      runtime_bypassrls: false,
    },
    "publication owner and runtime roles must retain least privilege",
  );

  const objects = await params.auditor.query<{
    readonly artifact_owner: string;
    readonly publication_owner: string;
    readonly slot_owner: string;
    readonly function_owner: string;
    readonly security_definer: boolean;
    readonly function_config: readonly string[];
  }>(
    `SELECT
       pg_get_userbyid((SELECT relowner FROM pg_class
         WHERE oid = 'reader_summary_artifacts'::regclass))
         AS artifact_owner,
       pg_get_userbyid((SELECT relowner FROM pg_class
         WHERE oid = 'reader_summary_publications'::regclass))
         AS publication_owner,
       pg_get_userbyid((SELECT relowner FROM pg_class
         WHERE oid = 'reader_summary_publication_slots'::regclass))
         AS slot_owner,
       pg_get_userbyid(proowner) AS function_owner,
       prosecdef AS security_definer,
       proconfig AS function_config
     FROM pg_proc
     WHERE oid = 'publish_reader_summary(jsonb)'::regprocedure`,
  );
  assertDeepEqual(
    objects.rows[0],
    {
      artifact_owner: protectedOwner,
      publication_owner: protectedOwner,
      slot_owner: protectedOwner,
      function_owner: protectedOwner,
      security_definer: true,
      function_config: ["search_path=pg_catalog, public, pg_temp"],
    },
    "protected tables and SECURITY DEFINER function must have the safe owner and path",
  );

  const identity = await params.runtime.query<{
    readonly current_user: string;
    readonly can_assume_owner: boolean;
    readonly can_create_public: boolean;
    readonly can_publish: boolean;
    readonly can_insert_ledger: boolean;
    readonly can_reference_artifacts: boolean;
    readonly can_trigger_artifacts: boolean;
    readonly can_update_slot: boolean;
    readonly can_truncate_artifacts: boolean;
  }>(
    `SELECT current_user,
       pg_has_role(current_user, $1, 'MEMBER') AS can_assume_owner,
       has_schema_privilege(current_user, 'public', 'CREATE')
         AS can_create_public,
       has_function_privilege(current_user,
         'publish_reader_summary(jsonb)', 'EXECUTE') AS can_publish,
       has_table_privilege(current_user,
         'reader_summary_publications', 'INSERT') AS can_insert_ledger,
       has_table_privilege(current_user,
         'reader_summary_publication_slots', 'UPDATE') AS can_update_slot,
       has_table_privilege(current_user,
         'reader_summary_artifacts', 'REFERENCES') AS can_reference_artifacts,
       has_table_privilege(current_user,
         'reader_summary_artifacts', 'TRIGGER') AS can_trigger_artifacts,
       has_table_privilege(current_user,
         'reader_summary_artifacts', 'TRUNCATE') AS can_truncate_artifacts`,
    [protectedOwner],
  );
  assertDeepEqual(
    identity.rows[0],
    {
      current_user: params.runtimeRole,
      can_assume_owner: false,
      can_create_public: false,
      can_publish: true,
      can_insert_ledger: false,
      can_update_slot: false,
      can_reference_artifacts: false,
      can_trigger_artifacts: false,
      can_truncate_artifacts: false,
    },
    "runtime must receive only SELECT/candidate writes and publisher EXECUTE",
  );

  await params.runtime.query(
    `SELECT set_config(
       'social_monitor.reader_summary_publication_proof_sha256', $1, false
     )`,
    [params.proofSha256],
  );
  for (const directMutation of directPublicationMutations(
    params.runtime,
    params.artifactIds[1],
  )) {
    await assertRejectsContaining(
      directMutation,
      "permission denied",
      "runtime direct publication mutation must be denied by PostgreSQL ACLs",
    );
  }
  for (const artifactId of params.artifactIds) {
    await assertRejectsContaining(
      () =>
        params.runtime.query(
          `UPDATE reader_summary_artifacts
              SET status = 'SUPERSEDED'
            WHERE id = $1`,
          [artifactId],
        ),
      "published reader summary artifact is immutable",
      "runtime must not directly supersede a COMPLETED or NO_SIGNAL publication",
    );
  }
  await assertRejectsContaining(
    () => params.runtime.query(`SET ROLE ${protectedOwner}`),
    "permission denied",
    "runtime must not assume the protected owner role",
  );
  await assertRejectsContaining(
    () =>
      params.runtime.query(
        "ALTER TABLE reader_summary_artifacts DISABLE TRIGGER reader_summary_artifacts_published_immutable",
      ),
    "must be owner",
    "runtime must not disable the publication immutability trigger",
  );

  const durable = await params.runtime.query<{
    readonly current_publication_id: string;
    readonly status: string;
  }>(
    `SELECT slot.current_publication_id, artifact.status::text AS status
       FROM reader_summary_publication_slots slot
       JOIN reader_summary_artifacts artifact
         ON artifact.id = slot.current_publication_id
      WHERE slot.current_publication_id = ANY($1::uuid[])
      ORDER BY artifact.status::text`,
    [params.artifactIds],
  );
  assertDeepEqual(
    durable.rows,
    [
      { current_publication_id: params.artifactIds[1], status: "COMPLETED" },
      { current_publication_id: params.artifactIds[0], status: "NO_SIGNAL" },
    ],
    "forged GUC and direct mutations must not hide the active publication",
  );
};

const directPublicationMutations = (
  runtime: PoolClient,
  artifactId: string,
): readonly (() => Promise<unknown>)[] => [
  () =>
    runtime.query(
      `UPDATE reader_summary_publication_slots
          SET current_publication_id = NULL
        WHERE current_publication_id = $1`,
      [artifactId],
    ),
  () =>
    runtime.query(
      `UPDATE reader_summary_publication_slots
          SET current_publication_id = current_publication_id
        WHERE current_publication_id = $1`,
      [artifactId],
    ),
  () =>
    runtime.query(
      `DELETE FROM reader_summary_publication_slots
        WHERE current_publication_id = $1`,
      [artifactId],
    ),
  () =>
    runtime.query(
      `UPDATE reader_summary_publications SET published_at = published_at
        WHERE id = $1`,
      [artifactId],
    ),
  () => runtime.query(`TRUNCATE TABLE reader_summary_publications`),
  () => runtime.query(`TRUNCATE TABLE reader_summary_publication_slots`),
];

const postgresUrl = (value: string): URL => {
  const parsed = new URL(value);
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(
      "READER_SUMMARY_PUBLICATION_TEST_ADMIN_DATABASE_URL must be PostgreSQL",
    );
  }
  return parsed;
};

const quoteIdentifier = quotePostgresIdentifier;
const quoteLiteral = quotePostgresLiteral;

const assertRejectsContaining = async (
  operation: () => Promise<unknown>,
  expectedMessage: string,
  assertionMessage: string,
): Promise<void> => {
  try {
    await operation();
  } catch (error: unknown) {
    assert(
      error instanceof Error && error.message.includes(expectedMessage),
      assertionMessage,
    );
    return;
  }
  throw new Error(assertionMessage);
};

const assertDeepEqual = (
  actual: unknown,
  expected: unknown,
  message: string,
): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};

const assert: (condition: boolean, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) {
    throw new Error(message);
  }
};
