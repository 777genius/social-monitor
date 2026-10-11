// Offline orchestration and ownership model only; no PostgreSQL/SQL execution.
import type { Pool } from "pg";
import {
  provisionPublicationFixtureFirstPublicationRole,
  dropPublicationFixtureFirstPublicationRole,
} from "./reader-summary-publication-fixture-firstpub-role";
import { dropPublicationFixtureDatabaseAndRoles } from "./reader-summary-publication-postgres-privileges";
import type * as Contract from "./check-reader-summary-publication-postgres";

type Role = { oid: number; safe: boolean };
function fixture(initial?: Role) {
  let role = initial, before: Role | undefined;
  const statements: string[] = [];
  const failures = new Map<string, Error>();
  const release = jest.fn();
  const query = jest.fn(async (sql: string) => {
    statements.push(sql);
    const failure = [...failures].find(([part]) => sql.includes(part));
    if (failure) throw failure[1];
    if (sql === "BEGIN") before = role;
    if (sql === "ROLLBACK") role = before;
    if (sql.startsWith("SELECT role.oid")) return { rows: role ? [role] : [], rowCount: role ? 1 : 0 };
    if (sql.startsWith("CREATE ROLE social_monitor_summary_once")) role = { oid: 41, safe: true };
    if (sql === "DROP ROLE social_monitor_summary_once") role = undefined;
    return { rows: [], rowCount: 0 };
  });
  const connect = jest.fn(async () => ({ query, release }));
  const pool = { connect, query } as unknown as Pool;
  return { pool, statements, query, connect, release, failures,
    role: () => role, replace: (next?: Role) => { role = next; } };
}
const cleanup = (pool: Pool, overrides: Record<string, unknown> = {}) =>
  dropPublicationFixtureDatabaseAndRoles({
    serverAdmin: pool, databaseName: "fixture", migrationAdminRole: "migrator", runtimeRole: "runtime",
    ownerRolePreexisting: true, capabilityRolePreexisting: true, schemaOwnerRolePreexisting: true,
    tenantSystemCapabilityRolePreexisting: true, dailyActivationDefinerRolePreexisting: true,
    fixtureDatabaseCreated: true, fixtureMigrationAdminRoleCreated: false, fixtureRuntimeRoleCreated: false,
    ...overrides,
  });

test("provisions a closed finite prerequisite and returns only committed ownership", async () => {
  const f = fixture();
  const owned = await provisionPublicationFixtureFirstPublicationRole(f.pool);
  expect(owned).toEqual({ oid: 41 });
  expect(Object.isFrozen(owned)).toBe(true);
  expect(f.statements.filter(sql => sql.startsWith("CREATE ROLE"))).toEqual([
    `CREATE ROLE social_monitor_summary_once
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
      NOREPLICATION NOBYPASSRLS`,
  ]);
  expect(f.statements.some(sql => /GRANT|ALTER ROLE/u.test(sql))).toBe(false);
  expect(f.statements.at(-1)).toBe("COMMIT");
  expect(f.release).toHaveBeenCalledTimes(1);
});

test.each([true, false])("refuses a pre-existing role without changing or owning it (safe=%s)", async safe => {
  const original = { oid: 99, safe }, f = fixture(original);
  await expect(provisionPublicationFixtureFirstPublicationRole(f.pool)).rejects
    .toThrow(safe ? "not owned by this fixture" : "is unsafe");
  expect(f.role()).toBe(original);
  expect(f.statements.some(sql => /^(CREATE|ALTER|GRANT|DROP)/u.test(sql))).toBe(false);
  expect(f.statements.at(-1)).toBe("ROLLBACK");
});

test.each(["CREATE ROLE", "COMMIT"])("a %s failure yields no cleanup ownership", async failure => {
  const f = fixture(); f.failures.set(failure, new Error("uncertain provisioning"));
  // A lost COMMIT acknowledgement may leave a committed role. Its identity
  // was never handed to the caller, so cleanup must retain that uncertainty.
  if (failure === "COMMIT") f.failures.set("ROLLBACK", new Error("transaction already committed"));
  await expect(provisionPublicationFixtureFirstPublicationRole(f.pool)).rejects.toThrow("uncertain provisioning");
  await cleanup(f.pool);
  expect(f.statements).not.toContain("DROP ROLE social_monitor_summary_once");
  expect(f.release).toHaveBeenCalledTimes(1);
  expect(f.role()?.oid).toBe(failure === "COMMIT" ? 41 : undefined);
});

test("drops the owned role only after the owned database was dropped", async () => {
  const f = fixture();
  const owned = await provisionPublicationFixtureFirstPublicationRole(f.pool);
  await cleanup(f.pool, { fixtureFirstPublicationRoleOwnership: owned });
  expect(f.statements.findIndex(sql => sql.startsWith("DROP DATABASE")))
    .toBeLessThan(f.statements.indexOf("DROP ROLE social_monitor_summary_once"));
  expect(f.role()).toBeUndefined();
});

test("database drop failure preserves the finite role and uncertainty", async () => {
  const f = fixture(); const owned = await provisionPublicationFixtureFirstPublicationRole(f.pool);
  f.failures.set("DROP DATABASE", new Error("database remains"));
  await expect(cleanup(f.pool, { fixtureFirstPublicationRoleOwnership: owned })).rejects.toThrow("database remains");
  expect(f.role()?.oid).toBe(41);
  expect(f.statements).not.toContain("DROP ROLE social_monitor_summary_once");
});

test("missing database ownership cannot authorize role cleanup", async () => {
  const f = fixture({ oid: 41, safe: true });
  await expect(cleanup(f.pool, { fixtureDatabaseCreated: false,
    fixtureFirstPublicationRoleOwnership: { oid: 41 } })).rejects.toThrow("database cleanup is uncertain");
  expect(f.connect).not.toHaveBeenCalled();
});

test.each([undefined, { oid: 99, safe: true }, { oid: 41, safe: false }])(
  "refuses cleanup of missing, replaced or changed roles (%j)", async role => {
    const f = fixture(role);
    await expect(dropPublicationFixtureFirstPublicationRole(f.pool, { oid: 41 })).rejects.toThrow();
    expect(f.statements).not.toContain("DROP ROLE social_monitor_summary_once");
    expect(f.role()).toEqual(role);
  });

test("foreign dependency refusal propagates without broad cleanup", async () => {
  const f = fixture({ oid: 41, safe: true });
  f.failures.set("DROP ROLE", new Error("foreign database dependencies remain"));
  await expect(dropPublicationFixtureFirstPublicationRole(f.pool, { oid: 41 }))
    .rejects.toThrow("foreign database dependencies remain");
  expect(f.role()?.oid).toBe(41);
  expect(f.statements.some(sql => /DROP OWNED|REASSIGN|CASCADE/u.test(sql))).toBe(false);
});

test("four-job shared contract provisions before the final tail and passes the exact owned identity to cleanup", async () => {
  jest.resetModules();
  const f = fixture(), drop = jest.fn(async () => undefined);
  let finalTail = false;
  const generic = (overrides: Record<string, unknown> = {}) => new Proxy(overrides, {
    get: (target, key) => typeof key === "string" ? (target[key] ??= jest.fn()) : undefined,
  });
  jest.doMock("pg", () => ({ Pool: jest.fn(() => ({ query: f.query, end: jest.fn() })) }));
  for (const path of [
    "./lib/reader-summary-large-daily-publication-postgres-contract",
    "./lib/reader-summary-publication-postgres-assertions",
    "./lib/reader-summary-publication-postgres-running-fixture",
    "./lib/reader-summary-recovery-postgres-contract",
    "./lib/reader-summary-promotion-v2-rollback-postgres-contract",
    "./lib/reader-summary-weekly-daily-certification-backfill-postgres-contract",
    "./lib/reader-summary-weekly-certification-seal-postgres-contract",
    "./lib/reader-summary-weekly-atomic-publication-postgres-contract",
    "./lib/reader-summary-weekly-projection-postgres-contract",
    "./lib/reader-summary-weekly-review-manifest-postgres-contract",
    "./lib/reader-summary-weekly-production-postgres-contract",
    "./lib/reader-summary-weekly-publication-evidence-postgres-contract",
    "./reader-summary-publication-postgres-legacy",
    "./reader-summary-publication-postgres-runtime-guard",
  ]) jest.doMock(path, generic);
  jest.doMock("./lib/reader-summary-publication-postgres-fixture-scope", () => generic({
    requiredReaderSummaryPublicationAdminDatabaseUrl: () => "postgresql://fixture_admin:social_monitor_local_password@127.0.0.1:5432/postgres",
  }));
  jest.doMock("./lib/reader-summary-publication-postgres-migrations", () => generic({
    createReaderSummaryPublicationMigrationWorkspace: () => ({}),
    installPublicationAndFollowingMigrations: () => { finalTail = true; },
    applyOrderedReaderSummaryMigrations: () => {
      if (finalTail && f.role()?.safe !== true) throw new Error("first publication prerequisite missing");
    },
  }));
  jest.doMock("./reader-summary-publication-postgres-privileges", () => generic({
    publicationProtectedRolePresence: async () => ({ owner: true, capability: true,
      schemaOwner: true, tenantSystemCapability: true, dailyActivationDefiner: true }),
    publicationDatabaseUrl: (url: string) => url,
    publicationRuntimeDatabaseUrl: (url: string) => url,
    quotePostgresIdentifier: (name: string) => name,
    quotePostgresLiteral: (value: string) => value,
    provisionPublicationFixtureFirstPublicationRole: () => provisionPublicationFixtureFirstPublicationRole(f.pool),
    provisionPublicationFixtureDailyTerminalRole: async () => false,
    dropPublicationFixtureDatabaseAndRoles: drop,
  }));
  let contract!: typeof Contract;
  jest.isolateModules(() => { contract = jest.requireActual<typeof Contract>("./check-reader-summary-publication-postgres"); });
  try {
    await contract.runReaderSummaryPublicationPostgresContract("weekly-review-manifest", () => {
      expect(finalTail).toBe(true); expect(f.role()?.oid).toBe(41);
    });
    expect(drop).toHaveBeenCalledWith(expect.objectContaining({
      fixtureDatabaseCreated: true, fixtureFirstPublicationRoleOwnership: { oid: 41 },
    }));
  } finally {
    await contract.closeReaderSummaryPublicationPostgresContract();
    jest.resetModules();
  }
});
