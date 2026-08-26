import {
  assertReaderSummaryDailyTelemetryReleaseDatabaseState,
  readerSummaryTelemetryMigration,
  type ReaderSummaryDailyTelemetryReleaseOperations,
  runReaderSummaryDailyTelemetryRelease,
} from "./reader-summary-daily-telemetry-release";
import {
  type ReaderSummaryTelemetryMigrationRow,
  readerSummaryTelemetryCorrectedChecksum,
  readerSummaryTelemetryOldChecksum,
  reviewedTelemetryFailureLog,
} from "./reader-summary-telemetry-migration-history";

const stages = [
  "preparePreTelemetryRelease",
  "verifyPreTelemetryAuthority",
  "applyTelemetryMigration",
  "hardenPostTelemetryRelease",
  "verifyFinalReleaseState",
] as const;
type Stage = typeof stages[number];

describe("reader summary daily telemetry PostgreSQL release", () => {
  it("reaches every stage exactly once in the reviewed order", async () => {
    const trace: Stage[] = [];
    await runReaderSummaryDailyTelemetryRelease(operations(trace));
    expect(trace).toEqual(stages);
  });

  it.each(stages)("fails closed when %s fails", async (failedStage) => {
    const trace: Stage[] = [];
    await expect(runReaderSummaryDailyTelemetryRelease(
      operations(trace, failedStage),
    )).rejects.toThrow(`failed:${failedStage}`);
    expect(trace).toEqual(stages.slice(0, stages.indexOf(failedStage) + 1));
  });

  it("requires PG18, exact history, hardening, ACLs, and RLS", async () => {
    const query = releaseQuery();
    await expect(verify(query)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[0]?.[0]).toContain("Read-only exact deployment classifier");
    expect(query.mock.calls[1]).toEqual([
      expect.stringContaining('FROM public."_prisma_migrations"'),
      [readerSummaryTelemetryMigration],
    ]);
    expect(query.mock.calls[2]?.[0]).toContain(
      "social_monitor_telemetry_recovery.migration_attestations",
    );
    expect(query.mock.calls[3]?.[1]).toEqual([
      "default-acl", "fixture_migrator",
    ]);
    expect(query.mock.calls[3]?.[0]).toContain("defaults.defaclnamespace = 0");
  });

  it.each([
    [{ server_version: 179_999 }, "requires disposable PostgreSQL 18+"],
    [{ migration_admin_has_schema_create: true }, "retained schema CREATE"],
    [{ final_acl_exact: false }, "ACL/RLS state is unsafe"],
    [{ final_rls_count: "4" }, "ACL/RLS state is unsafe"],
  ] as const)("rejects unsafe final database state %#", async (
    mutation, diagnostic,
  ) => {
    await expect(verify(releaseQuery({ ...safeFinalRow(), ...mutation })))
      .rejects.toThrow(diagnostic);
  });

  it("rejects SQL/TypeScript classifier divergence and invalid history", async () => {
    await expect(verify(releaseQuery(undefined, "recovered", correctedRows())))
      .rejects.toThrow("classifiers diverged");
    const invalid = [{ ...correctedRows()[0]!, applied_steps_count: 0 }];
    await expect(verify(releaseQuery(undefined, "invalid", invalid)))
      .rejects.toThrow("exact clean row or exact recovered");
  });

  it.each([
    ["corrected", correctedRows()],
    ["recovered", recoveredRows()],
  ] as const)("accepts exact %s history", async (state, rows) => {
    await expect(verify(releaseQuery(undefined, state, rows)))
      .resolves.toBeUndefined();
  });

  it("rejects an absent forward default ACL repair", async () => {
    const row = {
      ...safeFinalRow(),
      default_acl_finished_count: "0",
      default_acl_migration_count: "0",
    };
    await expect(verify(releaseQuery(row)))
      .rejects.toThrow("finish exactly one default ACL migration");
  });

  it("rejects recovered rows with missing or forged attestation", async () => {
    await expect(verify(releaseQuery(
      undefined, "recovered", recoveredRows(), "absent",
    ))).rejects.toThrow("exact clean row or exact recovered");
    await expect(verify(releaseQuery(
      undefined, "recovered", recoveredRows(), "invalid",
    ))).rejects.toThrow("exact clean row or exact recovered");
  });

  it("rejects partial attestation artifacts with corrected history", async () => {
    await expect(verify(releaseQuery(
      undefined, "corrected", correctedRows(), "invalid",
    ))).rejects.toThrow("exact clean row or exact recovered");
  });
});

const verify = (query: jest.Mock) =>
  assertReaderSummaryDailyTelemetryReleaseDatabaseState(
    { query },
    {
      defaultAclMigration: "default-acl",
      migrationAdminRole: "fixture_migrator",
      telemetryMigration: readerSummaryTelemetryMigration,
    },
  );

const releaseQuery = (
  finalRow = safeFinalRow(),
  historyState: "corrected" | "invalid" | "recovered" = "corrected",
  historyRows: readonly ReaderSummaryTelemetryMigrationRow[] = correctedRows(),
  attestation: "absent" | "invalid" | "verified" =
    historyState === "recovered" ? "verified" : "absent",
) => jest.fn(async (sql: string, _values?: readonly unknown[]) => {
  void _values;
  if (sql.includes("Read-only exact deployment classifier")) {
    return { rows: [{ telemetry_history: historyState }] };
  }
  if (sql.includes("SELECT id, checksum, started_at")) {
    return { rows: historyRows };
  }
  if (sql.includes("Read-only verification of the complete recovery receipt")) {
    if (attestation === "invalid") throw new Error("forged receipt");
    return [{ rows: [] }, { rows: [{ case: "recovered" }] }];
  }
  if (sql.includes("to_regclass") &&
      sql.includes("social_monitor_telemetry_recovery")) {
    return { rows: [{ absent: attestation === "absent" }] };
  }
  return { rows: [finalRow] };
});

function safeFinalRow() {
  return {
  default_acl_finished_count: "1",
  default_acl_migration_count: "1",
  final_acl_exact: true,
  final_rls_count: "5",
  migration_admin_has_schema_create: false,
  publication_owner_has_schema_create: false,
  public_has_schema_create: false,
  server_version: 180_002,
  };
}

function correctedRows(): readonly ReaderSummaryTelemetryMigrationRow[] {
  return [{
    applied_steps_count: 1,
    checksum: readerSummaryTelemetryCorrectedChecksum,
    finished_at: "2026-08-24T12:01:00Z",
    id: "corrected",
    logs: null,
    rolled_back_at: null,
    started_at: "2026-08-24T12:00:00Z",
  }];
}

function recoveredRows(): readonly ReaderSummaryTelemetryMigrationRow[] {
  return [{
    applied_steps_count: 0,
    checksum: readerSummaryTelemetryOldChecksum,
    finished_at: null,
    id: "failed",
    logs: reviewedTelemetryFailureLog,
    rolled_back_at: "2026-08-24T12:01:00Z",
    started_at: "2026-08-24T12:00:00Z",
  }, {
    ...correctedRows()[0]!,
    finished_at: "2026-08-24T12:03:00Z",
    started_at: "2026-08-24T12:02:00Z",
  }];
}

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
