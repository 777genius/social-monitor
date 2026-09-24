// These mocks verify fixture orchestration only. They provide no PostgreSQL proof.
type ContractModule = typeof import("./check-reader-summary-publication-postgres");
const socketDirectory = "/tmp/social-monitor-pg18-0123456789ab/socket";
const socketTransport = {
  socketDirectory, socketDevice: 31, socketInode: 47,
};

const loadContract = (events: string[], socketMode = false) => {
  jest.resetModules();
  const poolQuery = jest.fn(async (sql: string) => {
    if (sql.includes("public.feed_items")) events.push("feed assertion");
    if (sql.includes("pg_catalog.pg_auth_members")) return { rows: [{
      protected_membership_valid: true, membership_count: 1,
      server_version_num: "180001",
    }] };
    return { rows: [{
      feed_owner: "social_monitor_public_schema_owner",
      safe_set_membership: true,
    }] };
  });
  const poolEnd = jest.fn(async () => undefined);
  const spawn = jest.fn((_command: string, _args?: readonly string[]) => {
    if (!socketMode) events.push("feed subprocess assertion");
    return { status: 0, stderr: "" };
  });
  const parity = jest.fn(() => { events.push("schema parity"); });
  const drop = jest.fn(async () => { events.push("drop fixture"); });
  const removeWorkspace = jest.fn();
  const generic = (overrides: Record<string, unknown> = {}) => new Proxy(overrides, {
    get: (target, key) => typeof key === "string"
      ? (target[key] ??= jest.fn())
      : undefined,
  });
  jest.doMock("pg", () => ({
    Pool: jest.fn(() => ({ query: poolQuery, end: poolEnd })),
  }));
  jest.doMock("node:child_process", () => ({ spawnSync: spawn }));
  if (socketMode) {
    process.env.READER_SUMMARY_PUBLICATION_TEST_PG18_SOCKET_TRANSPORT =
      JSON.stringify(socketTransport);
    const stat = (kind: "directory" | "socket", uid: number, gid: number, mode: number) => ({
      uid, gid, mode, dev: 31, ino: 47,
      isDirectory: () => kind === "directory",
      isSocket: () => kind === "socket",
      isSymbolicLink: () => false,
    });
    jest.doMock("node:fs", () => ({
      ...jest.requireActual("node:fs"),
      lstatSync: (path: string) => {
        if (path === "/tmp") return stat("directory", 0, 0, 0o41777);
        if (path === "/tmp/social-monitor-pg18-0123456789ab") {
          return stat("directory", process.getuid!(), process.getgid!(), 0o40700);
        }
        if (path === socketDirectory) return stat("directory", 999, 999, 0o40700);
        if (path === `${socketDirectory}/.s.PGSQL.5432`) {
          return stat("socket", 999, 999, 0o140777);
        }
        throw new Error("unexpected socket fixture path");
      },
      realpathSync: Object.assign(jest.fn(), { native: (path: string) => path }),
    }));
  }
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
  ]) {
    jest.doMock(path, generic);
  }
  jest.doMock("./lib/reader-summary-publication-postgres-fixture-scope", () => generic({
    requiredReaderSummaryPublicationAdminDatabaseUrl: () => {
      const url = new URL("postgresql://fixture_admin:synthetic_password_123@127.0.0.1:5432/postgres");
      if (socketMode) url.searchParams.set("host", socketDirectory);
      return url.toString();
    },
  }));
  jest.doMock("./lib/reader-summary-publication-postgres-migrations", () => generic({
    createReaderSummaryPublicationMigrationWorkspace: () => ({}),
    assertReaderSummaryMigrationDatabaseMatchesSchema: parity,
    removeReaderSummaryPublicationMigrationWorkspace: removeWorkspace,
  }));
  jest.doMock("./reader-summary-publication-postgres-privileges", () => generic({
    ...(socketMode ? {
      createPublicationFixtureRuntimeRole:
        jest.requireActual<typeof import("./reader-summary-publication-postgres-privileges")>(
          "./reader-summary-publication-postgres-privileges",
        ).createPublicationFixtureRuntimeRole,
    } : {}),
    publicationProtectedRolePresence: async () => ({
      owner: false, capability: false, schemaOwner: false,
      tenantSystemCapability: false, dailyActivationDefiner: false,
    }),
    publicationDatabaseUrl: (value: string, name: string) => {
      const parsed = new URL(value);
      parsed.pathname = `/${name}`;
      return parsed.toString();
    },
    publicationRuntimeDatabaseUrl: (url: string, role: string, password: string) => {
      const parsed = new URL(url);
      parsed.username = role;
      parsed.password = password;
      return parsed.toString();
    },
    provisionPublicationFixtureDailyTerminalRole: async () => false,
    quotePostgresIdentifier: (name: string) => name,
    quotePostgresLiteral: (value: string) => value,
    dropPublicationFixtureDatabaseAndRoles: drop,
  }));
  let contract!: ContractModule;
  jest.isolateModules(() => {
    contract = require("./check-reader-summary-publication-postgres") as ContractModule;
  });
  return { contract, drop, parity, poolEnd, poolQuery, removeWorkspace, spawn };
};

afterEach(() => {
  delete process.env.READER_SUMMARY_PUBLICATION_TEST_PG18_SOCKET_TRANSPORT;
  jest.resetModules();
});

test("callback receives the migrated fixture after schema parity and returns before contract assertions", async () => {
  const events: string[] = [];
  const { contract, drop, parity, poolEnd, spawn } = loadContract(events);
  await contract.runReaderSummaryPublicationPostgresContract(
    "feed-promotion",
    (fixture) => {
      events.push("callback");
      expect(fixture.databaseName).toMatch(/^reader_summary_publication_test_[0-9a-f]{20}$/);
      expect(new URL(fixture.runtimeDatabaseUrl).username).toMatch(/^social_monitor_publication_test_/);
      expect(new URL(fixture.auditorDatabaseUrl).pathname).toBe(`/${fixture.databaseName}`);
    },
  );
  expect(events).toEqual(["schema parity", "callback", "drop fixture"]);
  expect(parity).toHaveBeenCalledTimes(1);
  expect(spawn).not.toHaveBeenCalled();
  expect(drop).toHaveBeenCalledTimes(1);
  await contract.closeReaderSummaryPublicationPostgresContract();
  expect(poolEnd).toHaveBeenCalled();
});

test("fixture callback and existing role bootstrap use the private socket together", async () => {
  const events: string[] = [];
  const { contract, poolQuery, spawn, drop } = loadContract(events, true);
  const callback = jest.fn((fixture: { runtimeDatabaseUrl: string }) => {
    events.push("callback");
    expect(new URL(fixture.runtimeDatabaseUrl).searchParams.get("host"))
      .toBe(socketDirectory);
  });
  await contract.runReaderSummaryPublicationPostgresContract(
    "publication", callback,
  );
  expect(poolQuery).toHaveBeenCalledWith(
    expect.stringContaining("pg_catalog.pg_auth_members"),
    expect.arrayContaining([expect.stringMatching(/^social_monitor_publication_test_/)]),
  );
  expect(spawn).toHaveBeenCalledTimes(1);
  expect(spawn.mock.calls[0]![1]).toEqual(expect.arrayContaining([
    "--network=none", "--pull=never",
    `type=bind,source=${socketDirectory},target=/var/run/postgresql,readonly`,
  ]));
  expect(events).toEqual(["schema parity", "callback", "drop fixture"]);
  expect(drop).toHaveBeenCalledTimes(1);
});

test("fixture-only callback skips the ownership contract's pre-parity drift exercise", async () => {
  const events: string[] = [];
  const { contract, poolQuery, drop } = loadContract(events);
  await contract.runReaderSummaryPublicationPostgresContract(
    "promotion-v2-ownership", () => { events.push("callback"); },
  );
  expect(events).toEqual(["schema parity", "callback", "drop fixture"]);
  expect(poolQuery.mock.calls.some(([sql]) => String(sql).includes("ALTER TABLE")))
    .toBe(false);
  expect(drop).toHaveBeenCalledTimes(1);
});

test("malformed socket opt-in fails before fixture database queries", async () => {
  const events: string[] = [];
  const { contract, poolQuery, removeWorkspace, spawn, drop } = loadContract(events);
  process.env.READER_SUMMARY_PUBLICATION_TEST_PG18_SOCKET_TRANSPORT = "{}";
  await expect(contract.runReaderSummaryPublicationPostgresContract(
    "publication", jest.fn(),
  )).rejects.toThrow("test socket transport configuration");
  expect(poolQuery).not.toHaveBeenCalled();
  expect(spawn).not.toHaveBeenCalled();
  expect(drop).not.toHaveBeenCalled();
  expect(removeWorkspace).toHaveBeenCalledTimes(1);
});

test("absent callback still runs the original feed assertions", async () => {
  const events: string[] = [];
  const { contract, spawn, drop } = loadContract(events);
  await contract.runReaderSummaryPublicationPostgresContract("feed-promotion");
  expect(events).toEqual([
    "schema parity", "feed assertion",
    "feed subprocess assertion", "feed subprocess assertion", "drop fixture",
  ]);
  expect(spawn).toHaveBeenCalledTimes(2);
  expect(drop).toHaveBeenCalledTimes(1);
});

test("callback rejection propagates through the existing fixture drop", async () => {
  const events: string[] = [];
  const { contract, drop, poolEnd, spawn } = loadContract(events);
  await expect(contract.runReaderSummaryPublicationPostgresContract(
    "feed-promotion",
    async () => { events.push("callback"); throw new Error("synthetic callback failure"); },
  )).rejects.toThrow("synthetic callback failure");
  expect(events).toEqual(["schema parity", "callback", "drop fixture"]);
  expect(spawn).not.toHaveBeenCalled();
  expect(drop).toHaveBeenCalledTimes(1);
  await contract.closeReaderSummaryPublicationPostgresContract();
  expect(poolEnd).toHaveBeenCalled();
});

test("failed schema parity prevents the callback and still drops the fixture", async () => {
  const events: string[] = [];
  const { contract, parity, drop, spawn } = loadContract(events);
  parity.mockImplementationOnce(() => { throw new Error("synthetic schema drift"); });
  const callback = jest.fn();
  await expect(contract.runReaderSummaryPublicationPostgresContract(
    "feed-promotion", callback,
  )).rejects.toThrow("synthetic schema drift");
  expect(callback).not.toHaveBeenCalled();
  expect(drop).toHaveBeenCalledTimes(1);
  expect(spawn).not.toHaveBeenCalled();
});
