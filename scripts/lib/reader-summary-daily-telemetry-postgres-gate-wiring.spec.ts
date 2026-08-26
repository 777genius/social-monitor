import {
  assertReaderSummaryDailyTelemetryReleaseDatabaseState,
  readerSummaryTelemetryMigration,
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
      migration_admin_has_schema_create: false,
      publication_owner_has_schema_create: false,
      public_has_schema_create: false,
      server_version: 180_002,
      telemetry_history: "clean",
      telemetry_migration_count: "1",
    }] });

    await expect(assertReaderSummaryDailyTelemetryReleaseDatabaseState(
      { query },
      {
        defaultAclMigration: "default-acl",
        migrationAdminRole: "fixture_migrator",
        telemetryMigration: readerSummaryTelemetryMigration,
      },
    )).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining(
      'FROM public."_prisma_migrations"',
    ), [
      readerSummaryTelemetryMigration, "default-acl", "fixture_migrator",
      "575ece3521b26d769c5f65aae4d4a47ba33502695ac866030524319808812250",
      "e3e5b65d71d47942513478849dd745835f16c72175eb2ef821e245af02b79cad",
    ]);
    expect(query.mock.calls[0]?.[0]).toContain("defaults.defaclnamespace = 0");
    expect(query.mock.calls[0]?.[0]).toContain("namespace.nspname = 'public'");
  });

  it.each([
    [179_999, "1", "clean", false, true, "5", "requires disposable PostgreSQL 18+"],
    [180_000, "3", "invalid", false, true, "5", "exact clean row or exact recovered"],
    [180_000, "2", "clean", false, true, "5", "exact clean row or exact recovered"],
    [180_000, "1", "recovered", false, true, "5", "exact clean row or exact recovered"],
    [180_000, "1", "invalid", false, true, "5", "exact clean row or exact recovered"],
    [180_000, "1", "clean", true, true, "5", "retained schema CREATE"],
    [180_000, "1", "clean", false, false, "5", "ACL/RLS state is unsafe"],
    [180_000, "1", "clean", false, true, "4", "ACL/RLS state is unsafe"],
  ] as const)("rejects an unsafe final database state", async (
    serverVersion,
    telemetryCount,
    telemetryHistory,
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
      migration_admin_has_schema_create: migratorCreate,
      publication_owner_has_schema_create: false,
      public_has_schema_create: false,
      server_version: serverVersion,
      telemetry_history: telemetryHistory,
      telemetry_migration_count: telemetryCount,
    }] });

    await expect(assertReaderSummaryDailyTelemetryReleaseDatabaseState(
      { query },
      {
        defaultAclMigration: "default-acl",
        migrationAdminRole: "fixture_migrator",
        telemetryMigration: readerSummaryTelemetryMigration,
      },
    )).rejects.toThrow(diagnostic);
  });

  it.each([
    ["1", "clean"],
    ["2", "recovered"],
  ] as const)("accepts the exact %s-row telemetry lifecycle", async (
    telemetryCount,
    telemetryHistory,
  ) => {
    const query = jest.fn().mockResolvedValue({ rows: [{
      default_acl_finished_count: "1", default_acl_migration_count: "1",
      final_acl_exact: true, final_rls_count: "5",
      migration_admin_has_schema_create: false,
      publication_owner_has_schema_create: false, public_has_schema_create: false,
      server_version: 180_000, telemetry_history: telemetryHistory,
      telemetry_migration_count: telemetryCount,
    }] });
    await expect(assertReaderSummaryDailyTelemetryReleaseDatabaseState(
      { query }, { defaultAclMigration: "default-acl",
        migrationAdminRole: "fixture_migrator",
        telemetryMigration: readerSummaryTelemetryMigration },
    )).resolves.toBeUndefined();
  });

  it("rejects an absent forward default ACL repair", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{
      default_acl_finished_count: "0", default_acl_migration_count: "0",
      final_acl_exact: true, final_rls_count: "5",
      migration_admin_has_schema_create: false,
      publication_owner_has_schema_create: false, public_has_schema_create: false,
      server_version: 180_000, telemetry_history: "clean",
      telemetry_migration_count: "1",
    }] });
    await expect(assertReaderSummaryDailyTelemetryReleaseDatabaseState(
      { query }, { defaultAclMigration: "default-acl",
        migrationAdminRole: "fixture_migrator",
        telemetryMigration: readerSummaryTelemetryMigration },
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
