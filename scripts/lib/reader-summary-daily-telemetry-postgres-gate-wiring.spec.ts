import {
  assertReaderSummaryDailyTelemetryReleaseDatabaseState,
  type ReaderSummaryDailyTelemetryReleaseOperations,
  runReaderSummaryDailyTelemetryRelease,
} from "./reader-summary-daily-telemetry-release";

const stages = [
  "preparePreTelemetryRelease",
  "verifyPreTelemetryAuthority",
  "applyTelemetryMigration",
  "hardenPostTelemetryRelease",
  "verifyFinalReleaseState",
] as const;

type Stage = typeof stages[number];

describe("reader summary daily telemetry PostgreSQL release", () => {
  it("reaches every stage and applies telemetry exactly once before final hardening", async () => {
    const trace: Stage[] = [];

    await runReaderSummaryDailyTelemetryRelease(operations(trace));

    expect(trace).toEqual(stages);
    expect(trace.filter((stage) => stage === "applyTelemetryMigration")).toHaveLength(1);
    expect(trace.indexOf("applyTelemetryMigration"))
      .toBeLessThan(trace.indexOf("hardenPostTelemetryRelease"));
    expect(trace.at(-1)).toBe("verifyFinalReleaseState");
  });

  it.each(stages)("fails closed when %s fails", async (failedStage) => {
    const trace: Stage[] = [];

    await expect(runReaderSummaryDailyTelemetryRelease(
      operations(trace, failedStage),
    )).rejects.toThrow(`failed:${failedStage}`);

    expect(trace).toEqual(stages.slice(0, stages.indexOf(failedStage) + 1));
  });

  it("requires PG18, both finished migrations, and revoked migrator CREATE", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{
      default_acl_finished_count: "1",
      default_acl_migration_count: "1",
      final_acl_exact: true,
      final_rls_count: "5",
      finished_migration_count: "1",
      migration_admin_has_schema_create: false,
      publication_owner_has_schema_create: false,
      public_has_schema_create: false,
      server_version: 180_002,
      telemetry_migration_count: "1",
    }] });

    await expect(assertReaderSummaryDailyTelemetryReleaseDatabaseState(
      { query },
      {
        defaultAclMigration: "default-acl",
        migrationAdminRole: "fixture_migrator",
        telemetryMigration: "telemetry",
      },
    )).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining(
      'FROM public."_prisma_migrations"',
    ), ["telemetry", "default-acl", "fixture_migrator"]);
    expect(query.mock.calls[0]?.[0]).toContain("defaults.defaclnamespace = 0");
    expect(query.mock.calls[0]?.[0]).toContain("namespace.nspname = 'public'");
  });

  it.each([
    [179_999, "1", "1", false, true, "5", "requires disposable PostgreSQL 18+"],
    [180_000, "2", "1", false, true, "5", "finish exactly one telemetry migration"],
    [180_000, "1", "0", false, true, "5", "finish exactly one telemetry migration"],
    [180_000, "1", "1", true, true, "5", "retained schema CREATE"],
    [180_000, "1", "1", false, false, "5", "ACL/RLS state is unsafe"],
    [180_000, "1", "1", false, true, "4", "ACL/RLS state is unsafe"],
  ] as const)("rejects an unsafe final database state", async (
    serverVersion,
    telemetryCount,
    finishedCount,
    migratorCreate,
    finalAclExact,
    finalRlsCount,
    diagnostic,
  ) => {
    const query = jest.fn().mockResolvedValue({ rows: [{
      default_acl_finished_count: "1",
      default_acl_migration_count: "1",
      final_acl_exact: finalAclExact,
      final_rls_count: finalRlsCount,
      finished_migration_count: finishedCount,
      migration_admin_has_schema_create: migratorCreate,
      publication_owner_has_schema_create: false,
      public_has_schema_create: false,
      server_version: serverVersion,
      telemetry_migration_count: telemetryCount,
    }] });

    await expect(assertReaderSummaryDailyTelemetryReleaseDatabaseState(
      { query },
      {
        defaultAclMigration: "default-acl",
        migrationAdminRole: "fixture_migrator",
        telemetryMigration: "telemetry",
      },
    )).rejects.toThrow(diagnostic);
  });

  it("rejects an absent forward default ACL repair", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{
      default_acl_finished_count: "0", default_acl_migration_count: "0",
      final_acl_exact: true, final_rls_count: "5", finished_migration_count: "1",
      migration_admin_has_schema_create: false,
      publication_owner_has_schema_create: false, public_has_schema_create: false,
      server_version: 180_000, telemetry_migration_count: "1",
    }] });
    await expect(assertReaderSummaryDailyTelemetryReleaseDatabaseState(
      { query }, { defaultAclMigration: "default-acl",
        migrationAdminRole: "fixture_migrator", telemetryMigration: "telemetry" },
    )).rejects.toThrow("finish exactly one default ACL migration");
  });
});

const operations = (
  trace: Stage[],
  failedStage?: Stage,
): ReaderSummaryDailyTelemetryReleaseOperations => {
  const run = async (stage: Stage): Promise<void> => {
    trace.push(stage);
    if (stage === failedStage) throw new Error(`failed:${stage}`);
  };
  return {
    applyTelemetryMigration: () => run("applyTelemetryMigration"),
    hardenPostTelemetryRelease: () => run("hardenPostTelemetryRelease"),
    preparePreTelemetryRelease: () => run("preparePreTelemetryRelease"),
    verifyFinalReleaseState: () => run("verifyFinalReleaseState"),
    verifyPreTelemetryAuthority: () => run("verifyPreTelemetryAuthority"),
  };
};
