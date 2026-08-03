import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { Pool, type PoolClient } from "pg";

import {
  applyOrderedReaderSummaryMigrations,
  assertReaderSummaryMigrationDatabaseMatchesSchema,
  createReaderSummaryPublicationMigrationWorkspace,
  installPublicationAndFollowingMigrations,
  preparePrePublicationMigrations,
  removeReaderSummaryPublicationMigrationWorkspace,
} from "./lib/reader-summary-publication-postgres-migrations";
import {
  createPublicationFixtureRuntimeRole,
  dropPublicationFixtureDatabaseAndRoles,
  grantLegacyMigrationOwnership,
  makePublicationFixtureRuntimeDatabaseOwner,
  publicationDatabaseUrl,
  publicationProtectedRolePresence,
  provisionPublicationFixtureDailyTerminalRole,
  publicationRuntimeDatabaseUrl,
  quotePostgresIdentifier,
  quotePostgresLiteral,
  runReaderSummaryPublicationBootstrapSql,
} from "./reader-summary-publication-postgres-privileges";

const serverAdminDatabaseUrl = requiredEnv(
  "TENANT_RLS_TEST_ADMIN_DATABASE_URL",
);
const suffix = randomBytes(10).toString("hex");
const databaseName = `tenant_rls_test_${suffix}`;
const migrationAdminRole = `social_monitor_rls_admin_${suffix}`;
const runtimeRole = `social_monitor_rls_runtime_${suffix}`;
const systemRuntimeRole = `social_monitor_rls_system_${suffix}`;
const password = randomBytes(24).toString("base64url");
const targetDatabaseUrl = publicationDatabaseUrl(
  serverAdminDatabaseUrl,
  databaseName,
);
const migrationAdminUrl = publicationRuntimeDatabaseUrl(
  targetDatabaseUrl,
  migrationAdminRole,
  password,
);
const runtimeUrl = publicationRuntimeDatabaseUrl(
  migrationAdminUrl,
  runtimeRole,
  password,
);
const systemRuntimeUrl = publicationRuntimeDatabaseUrl(
  migrationAdminUrl,
  systemRuntimeRole,
  password,
);
const serverAdmin = new Pool({
  connectionString: serverAdminDatabaseUrl,
  min: 0,
  max: 1,
});
const workspace = createReaderSummaryPublicationMigrationWorkspace();

let ownerRolePreexisting = false;
let capabilityRolePreexisting = false;
let schemaOwnerRolePreexisting = false;
let tenantSystemCapabilityRolePreexisting = false;
let dailyActivationDefinerRolePreexisting = false;
let databaseCreated = false;
let migrationAdminCreated = false;
let runtimeCreated = false;
let systemRuntimeCreated = false;
let dailyTerminalRoleCreated = false;

async function main(): Promise<void> {
  const protectedRoles = await publicationProtectedRolePresence(serverAdmin);
  ownerRolePreexisting = protectedRoles.owner;
  capabilityRolePreexisting = protectedRoles.capability;
  schemaOwnerRolePreexisting = protectedRoles.schemaOwner;
  tenantSystemCapabilityRolePreexisting = protectedRoles.tenantSystemCapability;
  dailyActivationDefinerRolePreexisting = protectedRoles.dailyActivationDefiner;
  try {
    await createFixtureDatabase();
    preparePrePublicationMigrations(workspace);
    await grantLegacyMigrationOwnership(migrationAdminUrl, runtimeRole);
    applyOrderedReaderSummaryMigrations(runtimeUrl, workspace);
    await runReaderSummaryPublicationBootstrapSql(
      "pre",
      migrationAdminUrl,
      runtimeRole,
      systemRuntimeRole,
    );
    installPublicationAndFollowingMigrations(workspace);
    applyOrderedReaderSummaryMigrations(migrationAdminUrl, workspace);
    await runReaderSummaryPublicationBootstrapSql(
      "post",
      migrationAdminUrl,
      runtimeRole,
      systemRuntimeRole,
    );
    assertReaderSummaryMigrationDatabaseMatchesSchema(targetDatabaseUrl);
    await assertRlsContract();
  } finally {
    removeReaderSummaryPublicationMigrationWorkspace(workspace);
    await dropPublicationFixtureDatabaseAndRoles({
      serverAdmin,
      databaseName,
      migrationAdminRole,
      runtimeRole,
      ownerRolePreexisting,
      capabilityRolePreexisting,
      schemaOwnerRolePreexisting,
      tenantSystemCapabilityRolePreexisting,
      dailyActivationDefinerRolePreexisting,
      fixtureDatabaseCreated: databaseCreated,
      fixtureMigrationAdminRoleCreated: migrationAdminCreated,
      fixtureRuntimeRoleCreated: runtimeCreated,
      fixtureDailyTerminalRoleCreated: dailyTerminalRoleCreated,
      systemRuntimeRole,
      systemRuntimeRoleCreated: systemRuntimeCreated,
    });
    await serverAdmin.end();
  }
  console.log("Tenant PostgreSQL RLS isolation gate OK");
}

async function createFixtureDatabase(): Promise<void> {
  await serverAdmin.query(
    `CREATE ROLE ${quotePostgresIdentifier(migrationAdminRole)}
       LOGIN PASSWORD ${quotePostgresLiteral(password)}
       NOSUPERUSER NOCREATEDB CREATEROLE INHERIT NOREPLICATION NOBYPASSRLS`,
  );
  migrationAdminCreated = true;
  await serverAdmin.query(
    `CREATE DATABASE ${quotePostgresIdentifier(databaseName)}
       OWNER ${quotePostgresIdentifier(migrationAdminRole)}`,
  );
  databaseCreated = true;
  await createPublicationFixtureRuntimeRole({
    databaseName,
    migrationAdminRole,
    runtimePassword: password,
    runtimeRole,
    serverAdminDatabaseUrl,
  });
  runtimeCreated = true;
  await serverAdmin.query(
    `CREATE ROLE ${quotePostgresIdentifier(systemRuntimeRole)}
       LOGIN PASSWORD ${quotePostgresLiteral(password)}
       NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT
       NOREPLICATION NOBYPASSRLS;
     GRANT CONNECT ON DATABASE ${quotePostgresIdentifier(databaseName)}
       TO ${quotePostgresIdentifier(systemRuntimeRole)}`,
  );
  systemRuntimeCreated = true;
  dailyTerminalRoleCreated =
    await provisionPublicationFixtureDailyTerminalRole({
      dailyTerminalPassword: password,
      migrationAdminRole,
      serverAdmin,
    });
  await makePublicationFixtureRuntimeDatabaseOwner({
    databaseName,
    migrationAdminDatabaseUrl: migrationAdminUrl,
    migrationAdminRole,
    runtimeRole,
    systemRuntimeRole,
    targetDatabaseUrl,
  });
}

async function assertRlsContract(): Promise<void> {
  const system = new Pool({
    connectionString: systemRuntimeUrl,
    application_name: "social-monitor/runtime/ingestion-worker",
    min: 0,
    max: 1,
  });
  const api = new Pool({
    connectionString: runtimeUrl,
    application_name: "social-monitor/runtime/api-gateway",
    min: 0,
    max: 1,
  });
  const auditor = new Pool({
    connectionString: targetDatabaseUrl,
    min: 0,
    max: 1,
  });
  try {
    const systemClient = await system.connect();
    const apiClient = await api.connect();
    try {
      await setSessionSystemAccess(systemClient);
      const fixture = await seedIsolationFixture(systemClient);
      await assertProtectedInventory(auditor);
      await assertRuntimeRoleIsSafe(auditor);
      await assertTenantIsolation(apiClient, fixture);
      await assertSystemIsolation(apiClient, systemClient, fixture);
    } finally {
      systemClient.release();
      apiClient.release();
    }
  } finally {
    await system.end();
    await api.end();
    await auditor.end();
  }
}

type IsolationFixture = {
  readonly tenantOne: string;
  readonly workspaceOne: string;
  readonly tenantTwo: string;
  readonly workspaceTwo: string;
  readonly globalEventId: string;
  readonly tenantEventId: string;
  readonly webhookEndpointOne: string;
  readonly webhookEndpointTwo: string;
  readonly webhookSecretOne: string;
  readonly webhookSecretTwo: string;
};

async function seedIsolationFixture(
  client: PoolClient,
): Promise<IsolationFixture> {
  const fixture: IsolationFixture = {
    tenantOne: randomUUID(),
    workspaceOne: randomUUID(),
    tenantTwo: randomUUID(),
    workspaceTwo: randomUUID(),
    globalEventId: randomUUID(),
    tenantEventId: randomUUID(),
    webhookEndpointOne: randomUUID(),
    webhookEndpointTwo: randomUUID(),
    webhookSecretOne: `whsec_${randomUUID()}`,
    webhookSecretTwo: `whsec_${randomUUID()}`,
  };
  await client.query(
    `INSERT INTO tenants (id, slug, name, created_at, updated_at)
     VALUES ($1, $2, 'RLS tenant one', now(), now()),
            ($3, $4, 'RLS tenant two', now(), now())`,
    [
      fixture.tenantOne,
      `rls-tenant-one-${fixture.tenantOne}`,
      fixture.tenantTwo,
      `rls-tenant-two-${fixture.tenantTwo}`,
    ],
  );
  await client.query(
    `INSERT INTO workspaces
       (id, tenant_id, slug, name, created_at, updated_at)
     VALUES ($2, $1, 'rls-workspace-one', 'RLS workspace one', now(), now()),
            ($4, $3, 'rls-workspace-two', 'RLS workspace two', now(), now())`,
    [
      fixture.tenantOne,
      fixture.workspaceOne,
      fixture.tenantTwo,
      fixture.workspaceTwo,
    ],
  );
  await client.query(
    `INSERT INTO interests
       (id, tenant_id, workspace_id, name, query, status, created_at, updated_at)
     VALUES
       (gen_random_uuid(), $1, $2, 'RLS interest one', 'one', 'ENABLED', now(), now()),
       (gen_random_uuid(), $3, $4, 'RLS interest two', 'two', 'ENABLED', now(), now())`,
    [
      fixture.tenantOne,
      fixture.workspaceOne,
      fixture.tenantTwo,
      fixture.workspaceTwo,
    ],
  );
  await client.query(
    `INSERT INTO outbox_events
       (id, tenant_id, workspace_id, event_type, schema_version, payload,
        status, correlation_id, created_at)
     VALUES
       ($3::uuid, NULL, NULL, 'rls.global', 1, '{}'::jsonb, 'PENDING', $3::text, now()),
       ($4::uuid, $1, $2, 'rls.tenant', 1, '{}'::jsonb, 'PENDING', $4::text, now())`,
    [
      fixture.tenantOne,
      fixture.workspaceOne,
      fixture.globalEventId,
      fixture.tenantEventId,
    ],
  );
  await client.query(
    `INSERT INTO webhook_secrets
       (id, tenant_id, workspace_id, algorithm, ciphertext, iv, auth_tag,
        created_at, updated_at)
     VALUES
       ($5, $1, $2, 'fixture', 'ciphertext-one', 'iv-one', 'tag-one',
        now(), now()),
       ($6, $3, $4, 'fixture', 'ciphertext-two', 'iv-two', 'tag-two',
        now(), now())`,
    [
      fixture.tenantOne,
      fixture.workspaceOne,
      fixture.tenantTwo,
      fixture.workspaceTwo,
      fixture.webhookSecretOne,
      fixture.webhookSecretTwo,
    ],
  );
  await client.query(
    `INSERT INTO webhook_endpoints
       (id, tenant_id, workspace_id, url, event_types, status, secret_key_id,
        secret_preview, created_at, updated_at)
     VALUES
       ($5, $1, $2, 'https://one.example.test/webhook',
        ARRAY['digest.ready.v1'], 'ENABLED', $7, 'preview1', now(), now()),
       ($6, $3, $4, 'https://two.example.test/webhook',
        ARRAY['digest.ready.v1'], 'ENABLED', $8, 'preview2', now(), now())`,
    [
      fixture.tenantOne,
      fixture.workspaceOne,
      fixture.tenantTwo,
      fixture.workspaceTwo,
      fixture.webhookEndpointOne,
      fixture.webhookEndpointTwo,
      fixture.webhookSecretOne,
      fixture.webhookSecretTwo,
    ],
  );
  return fixture;
}

async function assertTenantIsolation(
  client: PoolClient,
  fixture: IsolationFixture,
): Promise<void> {
  assert(
    await count(client, "SELECT count(*)::integer AS count FROM interests"),
    0,
    "owner role without context must be denied by FORCE RLS",
  );
  await client.query("BEGIN");
  try {
    await setLocalTenantAccess(client, fixture.tenantOne, fixture.workspaceOne);
    assert(
      await count(client, "SELECT count(*)::integer AS count FROM interests"),
      1,
      "tenant context must see exactly one workspace",
    );
    assert(
      await count(
        client,
        `SELECT count(*)::integer AS count
           FROM interests WHERE tenant_id = $1`,
        [fixture.tenantTwo],
      ),
      0,
      "tenant context must not read another tenant",
    );
    const update = await client.query(
      "UPDATE interests SET query = query WHERE tenant_id = $1",
      [fixture.tenantTwo],
    );
    assert(
      update.rowCount ?? 0,
      0,
      "tenant context must not update another tenant",
    );
    assert(
      await count(
        client,
        `SELECT count(*)::integer AS count
           FROM webhook_secrets WHERE id = $1`,
        [fixture.webhookSecretOne],
      ),
      1,
      "tenant context must read its own webhook secret",
    );
    assert(
      await count(
        client,
        `SELECT count(*)::integer AS count
           FROM webhook_secrets WHERE id = $1`,
        [fixture.webhookSecretTwo],
      ),
      0,
      "tenant context must not read another tenant webhook secret",
    );
    const secretUpdate = await client.query(
      `UPDATE webhook_secrets
          SET ciphertext = ciphertext
        WHERE id = $1`,
      [fixture.webhookSecretTwo],
    );
    assert(
      secretUpdate.rowCount ?? 0,
      0,
      "tenant context must not update another tenant webhook secret",
    );
    const secretDelete = await client.query(
      "DELETE FROM webhook_secrets WHERE id = $1",
      [fixture.webhookSecretTwo],
    );
    assert(
      secretDelete.rowCount ?? 0,
      0,
      "tenant context must not delete another tenant webhook secret",
    );
    await assertRejectsForeignKey(client, () =>
      client.query(
        `INSERT INTO webhook_endpoints
           (id, tenant_id, workspace_id, url, event_types, status,
            secret_key_id, secret_preview, created_at, updated_at)
         VALUES
           (gen_random_uuid(), $1, $2, 'https://spoof.example.test/webhook',
            ARRAY['digest.ready.v1'], 'ENABLED', $3, 'spoofed1', now(), now())`,
        [
          fixture.tenantOne,
          fixture.workspaceOne,
          fixture.webhookSecretTwo,
        ],
      ),
      "cross-tenant webhook secret link insert",
    );
    await assertRejectsForeignKey(client, () =>
      client.query(
        `UPDATE webhook_endpoints
            SET secret_key_id = $1
          WHERE id = $2`,
        [fixture.webhookSecretTwo, fixture.webhookEndpointOne],
      ),
      "cross-tenant webhook secret link update",
    );
    await assertRejectsRls(() =>
      client.query(
        `INSERT INTO interests
          (id, tenant_id, workspace_id, name, query, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'cross tenant', 'blocked',
                 'ENABLED', now(), now())`,
        [fixture.tenantTwo, fixture.workspaceTwo],
      ),
    );
  } finally {
    await client.query("ROLLBACK");
  }
  assert(
    await count(client, "SELECT count(*)::integer AS count FROM interests"),
    0,
    "transaction-local tenant context must not leak through the pool",
  );
}

async function assertSystemIsolation(
  api: PoolClient,
  system: PoolClient,
  fixture: IsolationFixture,
): Promise<void> {
  await api.query("BEGIN");
  try {
    await api.query(
      `SELECT set_config(
                'application_name',
                'social-monitor/runtime/ingestion-worker',
                true
              ),
              set_config('social_monitor.system_access', 'true', true)`,
    );
    assert(
      await count(api, "SELECT count(*)::integer AS count FROM interests"),
      0,
      "API login must not unlock system access by spoofing application_name",
    );
  } finally {
    await api.query("ROLLBACK");
  }
  assert(
    await count(system, "SELECT count(*)::integer AS count FROM interests"),
    2,
    "reviewed worker system access must see cross-tenant work",
  );
  assert(
    await count(
      system,
      "SELECT count(*)::integer AS count FROM outbox_events WHERE id = ANY($1::uuid[])",
      [[fixture.globalEventId, fixture.tenantEventId]],
    ),
    2,
    "system access must see global and tenant outbox rows",
  );
}

async function assertProtectedInventory(client: Pool): Promise<void> {
  const contract = JSON.parse(
    readFileSync("ops/security/tenant-db-guard-contract.json", "utf8"),
  ) as {
    readonly tenantRootTables: readonly string[];
    readonly tenantOwnedTables: readonly string[];
    readonly tenantScopedSystemTables: readonly { readonly table: string }[];
    readonly indirectTenantOwnedTables: readonly { readonly table: string }[];
  };
  const expected = [
    ...contract.tenantRootTables,
    ...contract.tenantOwnedTables,
    ...contract.tenantScopedSystemTables.map((entry) => entry.table),
    ...contract.indirectTenantOwnedTables.map((entry) => entry.table),
  ];
  const inventory = await client.query<{
    readonly policy_count: number;
    readonly protected_count: number;
  }>(
    `SELECT
       count(*) FILTER (
         WHERE c.relrowsecurity AND c.relforcerowsecurity
       )::integer AS protected_count,
       count(*) FILTER (
         WHERE EXISTS (
           SELECT 1 FROM pg_policy p
           WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation'
         )
       )::integer AS policy_count
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
    [expected],
  );
  assert(
    inventory.rows[0]?.protected_count ?? 0,
    expected.length,
    "every protected table must enable and force RLS",
  );
  assert(
    inventory.rows[0]?.policy_count ?? 0,
    expected.length,
    "every protected table must install tenant_isolation policy",
  );
}

async function assertRuntimeRoleIsSafe(client: Pool): Promise<void> {
  const roles = await client.query<{
    readonly rolname: string;
    readonly rolbypassrls: boolean;
    readonly rolsuper: boolean;
    readonly tenant_system_access: boolean;
    readonly runtime_access: boolean;
  }>(
    `SELECT rolname,
            rolsuper,
            rolbypassrls,
            pg_has_role(
              rolname,
              'social_monitor_tenant_system_runtime',
              'USAGE'
            ) AS tenant_system_access,
            pg_has_role(rolname, $2, 'USAGE') AS runtime_access
       FROM pg_roles
      WHERE rolname = ANY($1::text[])
      ORDER BY rolname`,
    [[runtimeRole, systemRuntimeRole], runtimeRole],
  );
  const regular = roles.rows.find((role) => role.rolname === runtimeRole);
  const system = roles.rows.find((role) => role.rolname === systemRuntimeRole);
  if (
    regular?.rolsuper !== false ||
    regular.rolbypassrls !== false ||
    regular.tenant_system_access !== false ||
    system?.rolsuper !== false ||
    system.rolbypassrls !== false ||
    system.tenant_system_access !== true ||
    system.runtime_access !== true
  ) {
    throw new Error(
      "RLS API and system runtime roles must keep distinct safe capabilities",
    );
  }
}

async function setSessionSystemAccess(client: PoolClient): Promise<void> {
  await client.query(
    `SELECT set_config('social_monitor.tenant_id', '', false),
            set_config('social_monitor.workspace_id', '', false),
            set_config('social_monitor.system_access', 'true', false)`,
  );
}

async function setLocalTenantAccess(
  client: PoolClient,
  tenantId: string,
  workspaceId: string,
): Promise<void> {
  await client.query(
    `SELECT set_config('social_monitor.tenant_id', $1, true),
            set_config('social_monitor.workspace_id', $2, true),
            set_config('social_monitor.system_access', 'false', true)`,
    [tenantId, workspaceId],
  );
}

async function count(
  client: PoolClient,
  query: string,
  values: unknown[] = [],
): Promise<number> {
  const result = await client.query<{ readonly count: number }>(query, values);
  return result.rows[0]?.count ?? -1;
}

async function assertRejectsForeignKey(
  client: PoolClient,
  operation: () => Promise<unknown>,
  label: string,
): Promise<void> {
  await client.query("SAVEPOINT tenant_scope_constraint");
  try {
    await operation();
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT tenant_scope_constraint");
    await client.query("RELEASE SAVEPOINT tenant_scope_constraint");
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23503"
    ) {
      return;
    }
    throw error;
  }
  await client.query("RELEASE SAVEPOINT tenant_scope_constraint");
  throw new Error(`${label} must fail with a foreign key violation`);
}

async function assertRejectsRls(
  operation: () => Promise<unknown>,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (
      error instanceof Error &&
      /row-level security|violates row-level security policy/i.test(
        error.message,
      )
    ) {
      return;
    }
    throw error;
  }
  throw new Error("cross-tenant insert must fail with an RLS policy error");
}

function assert(actual: number, expected: number, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

void main();
