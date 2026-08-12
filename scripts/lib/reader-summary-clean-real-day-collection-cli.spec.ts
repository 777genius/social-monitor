import {
  readReaderSummaryCleanRealDayCollectionCli,
} from "./reader-summary-clean-real-day-collection-cli";
import {
  readerSummaryDailyMaintenanceScope,
} from "./reader-summary-daily-maintenance-scope";

describe("clean real-day collection CLI", () => {
  it("keeps the normal timer unbounded with its existing artifact path", () => {
    const cli = withArgs([], () => readCli());

    expect(cli.maintenanceScope).toBeUndefined();
    expect(cli.outputPath).toBe(
      "ops/evals/reader-summary-clean-real-day-collection.v1.json",
    );
    expect(cli.targetDiscoveryScopePredicate).toBe("");
    expect(cli.targetDiscoveryScopeValues).toEqual([]);
  });

  it("requires the canonical scope and exact per-day artifact for bounded maintenance", () => {
    const cli = withArgs([
      "--update",
      "--date",
      "2026-07-31",
      "--provider-catch-up",
      "--allow-historical-provider-collection",
      "--allow-unproven-existing-window",
      "--artifact-directory",
      "/durable/reader-summary-collection",
    ], () => readCli());

    expect(cli.maintenanceScope).toEqual(readerSummaryDailyMaintenanceScope);
    expect(cli.outputPath).toBe(
      "/durable/reader-summary-collection/reader-summary-clean-real-day-collection.2026-07-31.v1.json",
    );
    expect(cli.targetDiscoveryScopePredicate).toContain("sb.tenant_id = $2::uuid");
    expect(cli.targetDiscoveryScopeValues).toEqual([
      readerSummaryDailyMaintenanceScope.tenantId,
      readerSummaryDailyMaintenanceScope.workspaceId,
    ]);
  });

  it("rejects Aug4 before a bounded collection can start", () => {
    expect(() => withArgs([
      "--update",
      "--date",
      "2026-08-04",
      "--provider-catch-up",
      "--allow-historical-provider-collection",
      "--allow-unproven-existing-window",
      "--artifact-directory",
      "/durable/reader-summary-collection",
    ], () => readCli())).toThrow("outside the daily maintenance upper bound");
  });
});

const readCli = () => readReaderSummaryCleanRealDayCollectionCli({
  collectionPolicyEvaluatedAt: new Date("2026-08-04T01:00:00.000Z"),
  targetPublishedWindowObservedAt: new Date("2026-08-04T01:00:01.000Z"),
});

const withArgs = <T>(args: readonly string[], run: () => T): T => {
  const original = process.argv;
  process.argv = ["node", "collection-script", ...args];
  try {
    return run();
  } finally {
    process.argv = original;
  }
};
