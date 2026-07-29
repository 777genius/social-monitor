import { productionRecoveryBinding } from "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-production-recovery-authority.spec-support";

import {
  readerSummaryProductionRecoveryDayIds,
  readerSummaryProductionRecoveryJobIdempotencyKey,
  readerSummaryProductionRecoveryLegacyDayIds,
} from "./reader-summary-production-recovery-cli";
import {
  dayAuthority,
  periodForRecoveryDate,
  type ReaderSummaryProductionRecoveryDate,
} from "./reader-summary-production-recovery-data";
import { PrismaReaderSummaryProductionRecoveryExecutionGuard } from "./reader-summary-production-recovery-replay-guard";

describe("PrismaReaderSummaryProductionRecoveryExecutionGuard", () => {
  it("reports replay only when the exact final receipt exists", async () => {
    const fixture = guardFixture([[{ replayed: true }]]);

    await expect(claim(fixture.guard, "2026-07-23")).resolves.toBe(
      "replayed",
    );
    expect(fixture.queries).toHaveLength(1);
    expect(fixture.queries[0]).toContain(
      "reader_summary_recovery_receipts",
    );
    expect(fixture.queries[0]).not.toContain("idempotency_keys");
  });

  it("creates one consumed retry lease and RUNNING job for a fresh date", async () => {
    const fixture = guardFixture([
      [{ replayed: false }],
      [],
      [],
      [claimOutcome()],
    ]);

    await expect(claim(fixture.guard, "2026-07-24")).resolves.toBe(
      "execute",
    );
    expect(fixture.queries[3]).toContain('INSERT INTO "idempotency_keys"');
    expect(fixture.queries[3]).toContain('INSERT INTO "reader_summary_jobs"');
  });

  it.each(["RUNNING", "FAILED", "REJECTED"] as const)(
    "atomically supersedes a legacy %s attempt and creates one retry",
    async (jobStatus) => {
      const requestedUtcDate = "2026-07-25";
      const fixture = guardFixture([
        [{ replayed: false }],
        [],
        [legacyClaimRow(requestedUtcDate, jobStatus)],
        [
          claimOutcome({
            staleJobSuperseded: jobStatus === "RUNNING",
            rejectedArtifactSuperseded: jobStatus === "REJECTED",
          }),
        ],
      ]);

      await expect(claim(fixture.guard, requestedUtcDate)).resolves.toBe(
        "execute",
      );
      expect(fixture.queries[3]).toContain("stale_job AS");
      expect(fixture.queries[3]).toContain("INTERVAL '1 hour'");
      expect(fixture.queries[3]).toContain(
        'RETURNING "reader_summary_jobs"."id"',
      );
      expect(fixture.queries[3]).toContain("rejected_artifact AS");
      expect(fixture.queries[3]).toContain(
        'RETURNING "reader_summary_artifacts"."id"',
      );
      expect(fixture.queries[3]).not.toContain("source_items");
    },
  );

  it("does not re-consume an existing retry lease without a receipt", async () => {
    const requestedUtcDate = "2026-07-26";
    const fixture = guardFixture([
      [{ replayed: false }],
      [retryClaimRow(requestedUtcDate, "RUNNING")],
    ]);

    await expect(claim(fixture.guard, requestedUtcDate)).rejects.toThrow(
      "retry lease was already consumed without final receipt",
    );
    expect(fixture.queries).toHaveLength(2);
    expect(fixture.queries.every((sql) => !sql.includes("INSERT"))).toBe(
      true,
    );
  });

  it("fails closed when legacy terminal authority is not exact", async () => {
    const requestedUtcDate = "2026-07-27";
    const forged = {
      ...legacyClaimRow(requestedUtcDate, "FAILED"),
      jobFailureReason: null,
    };
    const fixture = guardFixture([
      [{ replayed: false }],
      [],
      [forged],
    ]);

    await expect(claim(fixture.guard, requestedUtcDate)).rejects.toThrow(
      "legacy model claim cannot be safely superseded",
    );
    expect(fixture.queries).toHaveLength(3);
  });
});

type Guard = PrismaReaderSummaryProductionRecoveryExecutionGuard;

const claim = (
  guard: Guard,
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
) =>
  guard.claim({
    binding: productionRecoveryBinding(),
    requestedUtcDate,
  });

const guardFixture = (
  responses: readonly (readonly unknown[])[],
): Readonly<{ guard: Guard; queries: string[] }> => {
  const queries: string[] = [];
  let invocation = 0;
  const client = {
    $queryRaw: async <T>(strings: TemplateStringsArray): Promise<T> => {
      queries.push(strings.join("?").replace(/\s+/gu, " "));
      const response = responses[invocation];
      invocation += 1;
      if (response === undefined) {
        throw new Error(`Unexpected SQL invocation ${invocation}`);
      }
      return response as T;
    },
    $transaction: async <T>(
      operation: (client: unknown) => Promise<T>,
    ): Promise<T> => operation(client),
  };
  return {
    guard: new PrismaReaderSummaryProductionRecoveryExecutionGuard(
      client as never,
    ),
    queries,
  };
};

const claimOutcome = (
  overrides: Partial<{
    claimed: boolean;
    staleJobSuperseded: boolean;
    rejectedArtifactSuperseded: boolean;
  }> = {},
) => ({
  claimed: true,
  staleJobSuperseded: false,
  rejectedArtifactSuperseded: false,
  ...overrides,
});

const legacyClaimRow = (
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
  jobStatus: "RUNNING" | "REJECTED" | "FAILED",
) => {
  const binding = productionRecoveryBinding();
  const day = dayAuthority(binding, requestedUtcDate);
  const ids = readerSummaryProductionRecoveryLegacyDayIds(
    binding,
    requestedUtcDate,
  );
  return claimRow({
    requestedUtcDate,
    ids,
    jobStatus,
    jobIdempotencyKey:
      `reader-summary-production-recovery:${requestedUtcDate}:${day.canonicalSha256}`,
    responsePayload: {
      schemaVersion: "reader_summary.production_recovery_model_claim.v1",
      recoveryId: binding.recoveryId,
      tenantId: binding.tenantId,
      workspaceId: binding.workspaceId,
      requestedUtcDate,
      readerSummaryJobId: ids.readerSummaryJobId,
      readerSummaryArtifactId: ids.readerSummaryId,
      planSha256s: day.planSha256s,
      providerEvidenceSha256: day.providerEvidenceSha256,
      boundaries: {
        stage: "pre_model",
        modelCallPerformed: false,
        recollectionPerformed: false,
      },
    },
  });
};

const retryClaimRow = (
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
  jobStatus: "RUNNING" | "REJECTED" | "FAILED",
) => {
  const binding = productionRecoveryBinding();
  const day = dayAuthority(binding, requestedUtcDate);
  const ids = readerSummaryProductionRecoveryDayIds(
    binding,
    requestedUtcDate,
  );
  return claimRow({
    requestedUtcDate,
    ids,
    jobStatus,
    jobIdempotencyKey:
      readerSummaryProductionRecoveryJobIdempotencyKey(
        requestedUtcDate,
        day.canonicalSha256,
      ),
    responsePayload: {
      schemaVersion:
        "reader_summary.production_recovery_model_retry_claim.v1",
      recoveryId: binding.recoveryId,
      tenantId: binding.tenantId,
      workspaceId: binding.workspaceId,
      requestedUtcDate,
      readerSummaryJobId: ids.readerSummaryJobId,
      readerSummaryArtifactId: ids.readerSummaryId,
      planSha256s: day.planSha256s,
      providerEvidenceSha256: day.providerEvidenceSha256,
      supersedes: null,
      boundaries: {
        stage: "pre_model",
        leaseConsumed: true,
        modelCallPerformed: false,
        recollectionPerformed: false,
        providerWritePerformed: false,
      },
    },
  });
};

const claimRow = (params: {
  requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  ids: Readonly<{ readerSummaryJobId: string; readerSummaryId: string }>;
  jobStatus: "RUNNING" | "REJECTED" | "FAILED";
  jobIdempotencyKey: string;
  responsePayload: unknown;
}) => {
  const binding = productionRecoveryBinding();
  const day = dayAuthority(binding, params.requestedUtcDate);
  const period = periodForRecoveryDate(params.requestedUtcDate);
  const terminal = params.jobStatus !== "RUNNING";
  return {
    requestHash: day.canonicalSha256,
    responseStatus: 102,
    responsePayload: params.responsePayload,
    jobId: params.ids.readerSummaryJobId,
    jobScopeType: "workspace",
    jobScopeKey: "workspace",
    jobInterestId: null,
    jobCadence: "daily",
    jobPeriodStartedAt: period.startedAt,
    jobPeriodEndedAt: period.endedAt,
    jobPeriodTimezone: "UTC",
    jobPeriodKey: period.periodKey,
    jobUserId: null,
    jobSubscriptionId: null,
    jobStatus: params.jobStatus,
    jobIdempotencyKey: params.jobIdempotencyKey,
    jobStartedAt: new Date(binding.lease.consumedAt),
    jobCompletedAt: null,
    jobFailedAt: terminal ? new Date(binding.lease.consumedAt) : null,
    jobReaderSummaryArtifactId:
      params.jobStatus === "REJECTED" ? params.ids.readerSummaryId : null,
    jobFailureReason: terminal ? "terminal fixture" : null,
  };
};
