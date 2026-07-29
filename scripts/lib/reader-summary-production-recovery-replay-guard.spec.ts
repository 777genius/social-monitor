import { productionRecoveryBinding } from "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-production-recovery-authority.spec-support";

import { readerSummaryProductionRecoveryDayIds } from "./reader-summary-production-recovery-cli";
import {
  dayAuthority,
  periodForRecoveryDate,
  type ReaderSummaryProductionRecoveryDate,
} from "./reader-summary-production-recovery-data";
import { PrismaReaderSummaryProductionRecoveryExecutionGuard } from "./reader-summary-production-recovery-replay-guard";

describe("PrismaReaderSummaryProductionRecoveryExecutionGuard", () => {
  it("reports replay only when the exact final receipt exists", async () => {
    const queries: string[] = [];
    const guard = executionGuard(async (sql) => {
      queries.push(sql);
      return [{ replayed: true }];
    });

    await expect(claim(guard, "2026-07-23")).resolves.toBe("replayed");
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("reader_summary_recovery_receipts");
    expect(queries[0]).not.toContain("idempotency_keys");
  });

  it("executes after atomically creating a fresh claim and RUNNING job", async () => {
    const queries: string[] = [];
    const guard = executionGuard(async (sql) => {
      queries.push(sql);
      if (sql.includes("SELECT EXISTS")) {
        return [{ replayed: false }];
      }
      if (sql.includes('FROM "idempotency_keys" AS claim')) {
        return [];
      }
      if (sql.includes("WITH claimed AS")) {
        return [{ claimed: true }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    await expect(claim(guard, "2026-07-24")).resolves.toBe("execute");
    expect(queries[2]).toContain('INSERT INTO "idempotency_keys"');
    expect(queries[2]).toContain('INSERT INTO "reader_summary_jobs"');
  });

  it("resumes a matching 102 pre-model claim without a final receipt", async () => {
    const requestedUtcDate = "2026-07-25";
    const guard = executionGuard(async (sql) => {
      if (sql.includes("SELECT EXISTS")) {
        return [{ replayed: false }];
      }
      if (sql.includes('FROM "idempotency_keys" AS claim')) {
        return [matchingClaimRow(requestedUtcDate, "RUNNING")];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    await expect(claim(guard, requestedUtcDate)).resolves.toBe("execute");
  });

  it.each(["REJECTED", "FAILED"] as const)(
    "fails closed for a matching 102 claim with a %s job and no receipt",
    async (jobStatus) => {
      const requestedUtcDate = "2026-07-26";
      const guard = executionGuard(async (sql) => {
        if (sql.includes("SELECT EXISTS")) {
          return [{ replayed: false }];
        }
        if (sql.includes('FROM "idempotency_keys" AS claim')) {
          return [matchingClaimRow(requestedUtcDate, jobStatus)];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      });

      await expect(claim(guard, requestedUtcDate)).rejects.toThrow(
        new Error(
          "Reader summary production recovery existing model claim cannot be safely resumed",
        ),
      );
    },
  );
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

const executionGuard = (
  query: (sql: string) => Promise<readonly unknown[]>,
): Guard => {
  const client = {
    $queryRaw: async <T>(
      strings: TemplateStringsArray,
    ): Promise<T> => {
      const rows = await query(
        strings.join("?").replace(/\s+/gu, " "),
      );
      return rows as unknown as T;
    },
    $transaction: async <T>(
      operation: (client: unknown) => Promise<T>,
    ): Promise<T> => operation(client),
  };
  return new PrismaReaderSummaryProductionRecoveryExecutionGuard(
    client as never,
  );
};

const matchingClaimRow = (
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
  jobStatus: "RUNNING" | "REJECTED" | "FAILED",
) => {
  const binding = productionRecoveryBinding();
  const day = dayAuthority(binding, requestedUtcDate);
  const ids = readerSummaryProductionRecoveryDayIds(
    binding,
    requestedUtcDate,
  );
  const period = periodForRecoveryDate(requestedUtcDate);
  const terminal = jobStatus !== "RUNNING";
  return {
    requestHash: day.canonicalSha256,
    responseStatus: 102,
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
    jobId: ids.readerSummaryJobId,
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
    jobStatus,
    jobIdempotencyKey:
      `reader-summary-production-recovery:${requestedUtcDate}:${day.canonicalSha256}`,
    jobStartedAt: new Date(binding.lease.consumedAt),
    jobCompletedAt: null,
    jobFailedAt: terminal ? new Date(binding.lease.consumedAt) : null,
    jobReaderSummaryArtifactId:
      jobStatus === "REJECTED" ? ids.readerSummaryId : null,
    jobFailureReason: terminal ? "terminal fixture" : null,
  };
};
