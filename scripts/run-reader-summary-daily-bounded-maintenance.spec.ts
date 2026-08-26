import { createHash } from "node:crypto";

import { readerSummaryDailyModelJobIdentity } from "@social-monitor/summary/domain/value-objects/reader-summary-daily-model-job";
import type {
  ReaderSummaryDailyClaimResult,
  ReaderSummaryDailyExecutionWork,
} from "@social-monitor/summary/ports/reader-summary-daily-execution-cursor.port";

import type { ReaderSummaryDailyBoundedMaintenanceDependencies } from "./lib/reader-summary-daily-bounded-maintenance";
import { readerSummaryDailyMaintenanceScope } from "./lib/reader-summary-daily-maintenance-scope";
import {
  assertReaderSummaryDailyBoundedMaintenanceAuthorization,
  runReaderSummaryDailyBoundedMaintenance,
} from "./run-reader-summary-daily-bounded-maintenance";

describe("daily reader-summary bounded maintenance entrypoint", () => {
  it("runs exactly one bounded maintenance workflow invocation", async () => {
    const executeClaimed = jest.fn(async (input: ReaderSummaryDailyExecutionWork) => ({
      kind: "completed" as const,
      requestedUtcDate: input.requestedUtcDate,
    }));

    const result = await runReaderSummaryDailyBoundedMaintenance(dependencies({
      executeClaimed,
    }));

    expect(result).toMatchObject({
      outcome: "pending",
      events: [{ requestedUtcDate: "2026-07-31", state: "completed" }],
    });
    expect(executeClaimed).toHaveBeenCalledTimes(1);
    expect(executeClaimed).toHaveBeenCalledWith(work("2026-07-31"));
  });

  it("requires the explicit Jul23 authorization date and lowercase hex values", () => {
    const valid = {
      READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE: "2026-07-23",
      READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY: "a".repeat(64),
      READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256: "b".repeat(64),
    };

    expect(() => assertReaderSummaryDailyBoundedMaintenanceAuthorization(valid)).not.toThrow();
    expect(() => assertReaderSummaryDailyBoundedMaintenanceAuthorization({
      ...valid,
      READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE: "2026-07-24",
    })).toThrow("must be 2026-07-23");
    expect(() => assertReaderSummaryDailyBoundedMaintenanceAuthorization({
      ...valid,
      READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY: "A".repeat(64),
    })).toThrow("lowercase SHA-256");
    expect(() => assertReaderSummaryDailyBoundedMaintenanceAuthorization({
      ...valid,
      READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256: "short",
    })).toThrow("lowercase SHA-256");
  });
});

const dependencies = (
  overrides: Partial<ReaderSummaryDailyBoundedMaintenanceDependencies>,
): ReaderSummaryDailyBoundedMaintenanceDependencies => ({
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
});

const claimed = (work: ReaderSummaryDailyExecutionWork): ReaderSummaryDailyClaimResult => ({
  kind: "claimed",
  work,
});

const work = (requestedUtcDate: string): ReaderSummaryDailyExecutionWork => {
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
};
