import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { readerSummaryDailyModelJobIdentity } from "@social-monitor/summary/domain/value-objects/reader-summary-daily-model-job";
import type {
  ReaderSummaryDailyClaimResult,
  ReaderSummaryDailyExecutionWork,
} from "@social-monitor/summary/ports/reader-summary-daily-execution-cursor.port";

import {
  bindReaderSummaryDailyJul31Aug3ExactClaim,
  ReaderSummaryDailyJul31Aug3MaintenanceRunner,
  readerSummaryDailyJul31Aug3CollectionArgs,
  validateReaderSummaryDailyMaintenanceCollectionArtifact,
  type ReaderSummaryDailyBoundedMaintenanceDependencies,
} from "./reader-summary-daily-bounded-maintenance";
import { readerSummaryDailyMaintenanceScope } from "./reader-summary-daily-maintenance-scope";

describe("Jul31-Aug3 reader summary bounded maintenance", () => {
  it("collects and validates exact-day evidence before it claims, freezes, models, or publishes", async () => {
    const order: string[] = [];
    const result = await new ReaderSummaryDailyJul31Aug3MaintenanceRunner(
      dependencies({
        readCursor: async () => {
          order.push("cursor");
          return { nextUnresolvedUtcDate: "2026-07-31" };
        },
        collectExactDate: async (input) => {
          order.push("collect");
          expect(input).toMatchObject({
            requestedUtcDate: "2026-07-31",
            allowHistoricalCollection: true,
            allowUnprovenExistingRowsForExactFullCollection: true,
            scope: readerSummaryDailyMaintenanceScope,
          });
          expect(input.artifactPath).toContain("2026-07-31");
        },
        validateProviderEvidence: async (input) => {
          order.push("provider-evidence");
          expect(input.artifactPath).toContain("2026-07-31");
          return { kind: "authority_verified" };
        },
        claimExactDate: async (input) => {
          order.push("claim");
          expect(input).toEqual({ requestedUtcDate: "2026-07-31" });
          return claimed(work("2026-07-31"));
        },
        validateClaimedAuthority: async (input) => {
          order.push("claimed-authority");
          expect(input.work.requestedUtcDate).toBe("2026-07-31");
          expect(input.artifactPath).toContain("2026-07-31");
          return { kind: "authority_verified" };
        },
        executeClaimed: async (input) => {
          order.push("terminal");
          return { kind: "completed", requestedUtcDate: input.requestedUtcDate };
        },
      }),
    ).runOne();

    expect(result.outcome).toBe("pending");
    expect(order).toEqual([
      "cursor",
      "collect",
      "provider-evidence",
      "claim",
      "claimed-authority",
      "terminal",
    ]);
  });

  it("fails below Jul31 before collection or any claim", async () => {
    const collectExactDate = jest.fn();
    const claimExactDate = jest.fn();
    const runner = new ReaderSummaryDailyJul31Aug3MaintenanceRunner(
      dependencies({
        readCursor: async () => ({ nextUnresolvedUtcDate: "2026-07-30" }),
        collectExactDate,
        claimExactDate,
      }),
    );

    await expect(runner.runOne()).rejects.toThrow("below the lower bound");
    expect(collectExactDate).not.toHaveBeenCalled();
    expect(claimExactDate).not.toHaveBeenCalled();
  });

  it("builds one historical full-collection command only inside Jul31-Aug3", () => {
    expect(readerSummaryDailyJul31Aug3CollectionArgs({
      requestedUtcDate: "2026-07-31",
      collectionArtifactDirectory: "/durable/reader-summary-collection",
    })).toEqual([
      "run",
      "run:reader-summary-clean-real-day-collection",
      "--",
      "--update",
      "--date",
      "2026-07-31",
      "--provider-catch-up",
      "--wait-for-x-readiness",
      "--allow-historical-provider-collection",
      "--allow-unproven-existing-window",
      "--artifact-directory",
      "/durable/reader-summary-collection",
    ]);
    expect(() => readerSummaryDailyJul31Aug3CollectionArgs({
      requestedUtcDate: "2026-07-30",
      collectionArtifactDirectory: "/durable/reader-summary-collection",
    })).toThrow("below the lower bound");
    expect(() => readerSummaryDailyJul31Aug3CollectionArgs({
      requestedUtcDate: "2026-08-04",
      collectionArtifactDirectory: "/durable/reader-summary-collection",
    })).toThrow("above the upper bound");
  });

  it("rejects Aug4 evidence before it can be treated as bounded maintenance input", () => {
    expect(() => validateReaderSummaryDailyMaintenanceCollectionArtifact({
      collectionArtifactDirectory: "/durable/reader-summary-collection",
      requestedUtcDate: "2026-08-04",
    })).toThrow("above the upper bound");
  });

  it("admits Jul31 after Aug7 while keeping Aug4 impossible", async () => {
    const claimExactBoundedMaintenance = jest.fn().mockResolvedValue(
      claimed(work("2026-07-31")),
    );
    const claim = bindReaderSummaryDailyJul31Aug3ExactClaim(
      { claimExactBoundedMaintenance },
      {
        workerId: "maintenance-worker",
        now: () => new Date("2026-08-08T01:00:00.000Z"),
      },
    );

    await expect(claim({ requestedUtcDate: "2026-07-31" })).resolves.toMatchObject({
      kind: "claimed",
    });
    expect(claimExactBoundedMaintenance).toHaveBeenCalledWith({
      ...readerSummaryDailyMaintenanceScope,
      workerId: "maintenance-worker",
      requestedUtcDate: "2026-07-31",
      invokedAt: "2026-08-08T01:00:00.000Z",
    });
    await expect(claim({ requestedUtcDate: "2026-08-04" })).rejects.toThrow(
      "above the upper bound",
    );
  });

  it("uses the bounded migration instead of inheriting the timer recovery guard", () => {
    const migration = readFileSync(
      "prisma/migrations/20260804130400_reader_summary_daily_bounded_maintenance_claim/migration.sql",
      "utf8",
    );

    expect(migration).toContain("v_eligible DATE := c_upper_inclusive");
    expect(migration).not.toContain(
      'SELECT * FROM public."claim_reader_summary_daily_execution"(',
    );
    expect(migration).not.toContain("'RECOVERY_REQUIRED'");
    expect(migration).toContain("expected_utc_date > c_upper_inclusive");
  });

  it("completes Aug3 without probing or claiming Aug4", async () => {
    const claims: string[] = [];
    const runner = new ReaderSummaryDailyJul31Aug3MaintenanceRunner(
      dependencies({
        readCursor: async () => ({ nextUnresolvedUtcDate: "2026-08-03" }),
        claimExactDate: async ({ requestedUtcDate }) => {
          claims.push(requestedUtcDate);
          return claimed(work(requestedUtcDate));
        },
      }),
    );

    await expect(runner.runOne()).resolves.toMatchObject({
      outcome: "caught_up",
      upperInclusive: "2026-08-03",
    });
    expect(claims).toEqual(["2026-08-03"]);
  });

  it("returns bounded caught-up above Aug3 without collection or claim", async () => {
    const collectExactDate = jest.fn();
    const claimExactDate = jest.fn();
    const runner = new ReaderSummaryDailyJul31Aug3MaintenanceRunner(
      dependencies({
        readCursor: async () => ({ nextUnresolvedUtcDate: "2026-08-04" }),
        collectExactDate,
        claimExactDate,
      }),
    );

    await expect(runner.runOne()).resolves.toMatchObject({
      outcome: "caught_up",
      events: [{ requestedUtcDate: "2026-08-04", state: "bounded_caught_up" }],
    });
    expect(collectExactDate).not.toHaveBeenCalled();
    expect(claimExactDate).not.toHaveBeenCalled();
  });

  it("does not execute a different day when the atomic claim sees a stale cursor", async () => {
    const executeClaimed = jest.fn();
    const runner = new ReaderSummaryDailyJul31Aug3MaintenanceRunner(
      dependencies({
        claimExactDate: async () => ({
          kind: "stale_cursor",
          nextUnresolvedUtcDate: "2026-08-01",
        }),
        executeClaimed,
      }),
    );

    await expect(runner.runOne()).resolves.toMatchObject({
      outcome: "nothing_eligible",
      events: [{ requestedUtcDate: "2026-08-01", state: "stale_cursor" }],
    });
    expect(executeClaimed).not.toHaveBeenCalled();
  });
});

function dependencies(
  overrides: Partial<ReaderSummaryDailyBoundedMaintenanceDependencies>,
): ReaderSummaryDailyBoundedMaintenanceDependencies {
  return {
    collectionArtifactDirectory: "/durable/reader-summary-collection",
    readCursor: async () => ({ nextUnresolvedUtcDate: "2026-07-31" }),
    collectExactDate: async () => undefined,
    validateProviderEvidence: async () => ({ kind: "authority_verified" }),
    claimExactDate: async () => claimed(work("2026-07-31")),
    validateClaimedAuthority: async () => ({ kind: "authority_verified" }),
    executeClaimed: async (input) => ({
      kind: "completed",
      requestedUtcDate: input.requestedUtcDate,
    }),
    ...overrides,
  };
}

function claimed(work: ReaderSummaryDailyExecutionWork): ReaderSummaryDailyClaimResult {
  return { kind: "claimed", work };
}

function work(requestedUtcDate: string): ReaderSummaryDailyExecutionWork {
  const source = {
    schemaVersion: 1,
    ...readerSummaryDailyMaintenanceScope,
    requestedUtcDate,
    ingestionCutoff: "2026-08-04T00:00:00.000Z",
    items: [],
  };
  const canonicalBytes = Buffer.from(JSON.stringify(source));
  const canonicalSha256 = createHash("sha256").update(canonicalBytes).digest("hex");
  return {
    ...readerSummaryDailyMaintenanceScope,
    requestedUtcDate,
    eligibleThrough: "2026-08-03",
    sourceAuthority: {
      requestedUtcDate,
      ingestionCutoff: source.ingestionCutoff,
      canonicalBytes,
      canonicalSha256,
    },
    modelJob: readerSummaryDailyModelJobIdentity({
      ...readerSummaryDailyMaintenanceScope,
      requestedUtcDate,
      sourceAuthoritySha256: canonicalSha256,
    }),
    modelJobState: "RESERVED",
    lease: {
      owner: "maintenance-worker",
      fencingToken: 1n,
      leasedAt: "2026-08-04T01:00:00.000Z",
      expiresAt: "2026-08-04T01:20:00.000Z",
      absoluteExpiresAt: "2026-08-04T08:00:00.000Z",
    },
  };
}
