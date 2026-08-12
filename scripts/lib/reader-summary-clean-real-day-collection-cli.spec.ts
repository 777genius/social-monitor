import { readReaderSummaryCleanRealDayCollectionCli } from "./reader-summary-clean-real-day-collection-cli";
import {
  readerSummaryDailyMaintenanceScope,
  readerSummaryProductionHistoryScope,
} from "./reader-summary-daily-maintenance-scope";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
    const cli = withArgs(
      [
        "--update",
        "--date",
        "2026-07-31",
        "--provider-catch-up",
        "--allow-historical-provider-collection",
        "--allow-unproven-existing-window",
        "--artifact-directory",
        "/durable/reader-summary-collection",
      ],
      () => readCli(),
    );

    expect(cli.maintenanceScope).toEqual(readerSummaryDailyMaintenanceScope);
    expect(cli.outputPath).toBe(
      "/durable/reader-summary-collection/reader-summary-clean-real-day-collection.2026-07-31.v1.json",
    );
    expect(cli.targetDiscoveryScopePredicate).toContain(
      "sb.tenant_id = $2::uuid",
    );
    expect(cli.targetDiscoveryScopeValues).toEqual([
      readerSummaryDailyMaintenanceScope.tenantId,
      readerSummaryDailyMaintenanceScope.workspaceId,
    ]);
  });

  it("rejects Aug4 before a bounded collection can start", () => {
    expect(() =>
      withArgs(
        [
          "--update",
          "--date",
          "2026-08-04",
          "--provider-catch-up",
          "--allow-historical-provider-collection",
          "--allow-unproven-existing-window",
          "--artifact-directory",
          "/durable/reader-summary-collection",
        ],
        () => readCli(),
      ),
    ).toThrow("outside the daily maintenance upper bound");
  });

  it("binds production history to 6101/6102 and an exact Aug12 artifact", () => {
    const cli = withArgs(
      [
        "--update",
        "--date",
        "2026-08-12",
        "--provider-catch-up",
        "--allow-historical-provider-collection",
        "--allow-unproven-existing-window",
        "--production-history-scope",
        "--artifact-directory",
        "/durable/production-history",
      ],
      () => readCli(),
    );

    expect(cli.maintenanceScope).toEqual(readerSummaryProductionHistoryScope);
    expect(cli.outputPath).toBe(
      "/durable/production-history/reader-summary-clean-real-day-collection.2026-08-12.v1.json",
    );
    expect(cli.targetDiscoveryScopeValues).toEqual([
      readerSummaryProductionHistoryScope.tenantId,
      readerSummaryProductionHistoryScope.workspaceId,
    ]);
  });

  it("rejects production history outside Jul23-Aug12", () => {
    expect(() =>
      withArgs(
        [
          "--update",
          "--date",
          "2026-08-13",
          "--provider-catch-up",
          "--allow-historical-provider-collection",
          "--allow-unproven-existing-window",
          "--production-history-scope",
          "--artifact-directory",
          "/durable/production-history",
        ],
        () => readCli(),
      ),
    ).toThrow("outside the daily maintenance upper bound");
  });

  it("accepts a retry only with the exact dated artifact and no first-attempt flag", () => {
    const directory = mkdtempSync(join(tmpdir(), "history-cli-"));
    try {
      writeFileSync(
        join(
          directory,
          "reader-summary-clean-real-day-collection.2026-08-07.v1.json",
        ),
        `${JSON.stringify(productionHistoryArtifact("2026-08-07"))}\n`,
      );
      const cli = withArgs(
        [
          "--update",
          "--date",
          "2026-08-07",
          "--provider-catch-up",
          "--allow-historical-provider-collection",
          "--production-history-retry",
          "--artifact-directory",
          directory,
        ],
        () => readCli(),
      );
      expect(cli.maintenanceScope).toEqual(readerSummaryProductionHistoryScope);
      expect(cli.allowUnprovenExistingRowsForExactFullCollection).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

const productionHistoryArtifact = (collectionDate: string) => ({
  schemaVersion: 1,
  artifactFormat: "reader-summary-clean-real-day-collection-v1",
  generatedBy: "npm run run:reader-summary-clean-real-day-collection",
  run: { collectionDate },
  inputs: {
    database: "local-postgres",
    targetPublishedWindow: {
      startInclusive: `${collectionDate}T00:00:00.000Z`,
      endExclusive: "2026-08-08T00:00:00.000Z",
    },
    scope: {
      tenantId: "00000000-0000-7000-8000-000000006101",
      workspaceId: "00000000-0000-7000-8000-000000006102",
    },
  },
});

const readCli = () =>
  readReaderSummaryCleanRealDayCollectionCli({
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
