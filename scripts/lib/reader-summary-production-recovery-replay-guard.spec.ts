import { createHash } from "node:crypto";

import { productionRecoveryBinding } from "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-production-recovery-authority.spec-support";

import {
  readerSummaryProductionRecoveryDayIds,
  readerSummaryProductionRecoveryJobIdempotencyKey,
  readerSummaryProductionRecoveryLegacyDayIds,
  readerSummaryProductionRecoveryQualityRemediationDayIds,
  readerSummaryProductionRecoveryQualityRemediationJobIdempotencyKey,
  readerSummaryProductionRecoveryQualityRemediationResumeDayIds,
  readerSummaryProductionRecoveryQualityRemediationResumeJobIdempotencyKey,
  readerSummaryProductionRecoveryResumeDayIds,
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

  it.each(["RUNNING", "FAILED"] as const)(
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
      expect(fixture.queries[3]).not.toContain("reader_summary_artifacts");
      expect(fixture.queries[3]).not.toContain("source_items");
    },
  );

  it.each(["2026-07-24", "2026-07-26"] as const)(
    "resumes only a consumed %s retry that failed on predecessor canonical bounds",
    async (requestedUtcDate) => {
      const fixture = guardFixture([
        [{ replayed: false }],
        [retryClaimRow(requestedUtcDate, "FAILED")],
        [],
        [claimOutcome()],
      ]);

      await expect(claim(fixture.guard, requestedUtcDate)).resolves.toBe(
        "resume",
      );
      expect(fixture.queries[3]).toContain('INSERT INTO "idempotency_keys"');
      expect(fixture.queries[3]).toContain('INSERT INTO "reader_summary_jobs"');
      expect(fixture.queries[3]).not.toContain("reader_summary_artifacts");
    },
  );

  it.each(["legacy", "retry"] as const)(
    "creates one quality remediation lease for an existing %s rejected artifact",
    async (claimKind) => {
      const requestedUtcDate = "2026-07-23";
      const fixture = guardFixture([
        [{ replayed: false }],
        ...(claimKind === "retry"
          ? [[retryClaimRow(requestedUtcDate, "REJECTED")]]
          : [[], [legacyClaimRow(requestedUtcDate, "REJECTED")]]),
        [],
        [claimOutcome()],
      ]);

      await expect(claim(fixture.guard, requestedUtcDate)).resolves.toBe(
        "remediate-quality",
      );
      const persisted = fixture.queries.at(-1)!;
      expect(persisted).toContain('INSERT INTO "idempotency_keys"');
      expect(persisted).toContain('INSERT INTO "reader_summary_jobs"');
      expect(persisted).not.toContain("reader_summary_artifacts");
      expect(persisted).not.toContain("source_items");
      expect(JSON.stringify(fixture.values.at(-1))).toContain(
        "rejectionEvidenceSha256",
      );
      expect(JSON.stringify(fixture.values.at(-1))).not.toContain(
        "quality rejection fixture",
      );
      expect(
        readerSummaryProductionRecoveryQualityRemediationDayIds(
          productionRecoveryBinding(),
          requestedUtcDate,
        ),
      ).not.toEqual(
        claimKind === "retry"
          ? readerSummaryProductionRecoveryDayIds(
              productionRecoveryBinding(),
              requestedUtcDate,
            )
          : readerSummaryProductionRecoveryLegacyDayIds(
              productionRecoveryBinding(),
              requestedUtcDate,
            ),
      );
    },
  );

  it("remediates the legacy FAILED job shape only when its linked artifact is REJECTED", async () => {
    const requestedUtcDate = "2026-07-27";
    const rejected = retryClaimRow(requestedUtcDate, "REJECTED");
    const fixture = guardFixture([
      [{ replayed: false }],
      [{ ...rejected, jobStatus: "FAILED" }],
      [],
      [claimOutcome()],
    ]);

    await expect(claim(fixture.guard, requestedUtcDate)).resolves.toBe(
      "remediate-quality",
    );
    expect(fixture.queries.at(-1)).not.toContain(
      "reader_summary_artifacts",
    );
  });

  it.each([
    "weekly canonical JSON exceeds structural bounds",
    "weekly canonical JSON exceeds byte bounds",
  ])("resumes only quality remediation that failed with %s", async (failureReason) => {
    const requestedUtcDate = "2026-07-23";
    const fixture = guardFixture([
      [{ replayed: false }],
      [retryClaimRow(requestedUtcDate, "REJECTED")],
      [qualityRemediationClaimRow(requestedUtcDate, "FAILED", failureReason)],
      [],
      [claimOutcome()],
    ]);

    await expect(claim(fixture.guard, requestedUtcDate)).resolves.toBe(
      "resume-quality",
    );
    const persisted = fixture.queries.at(-1)!;
    expect(persisted).toContain('INSERT INTO "idempotency_keys"');
    expect(persisted).toContain('INSERT INTO "reader_summary_jobs"');
    expect(persisted).not.toContain("reader_summary_artifacts");
    expect(persisted).not.toContain("source_items");
    expect(JSON.stringify(fixture.values.at(-1))).toContain(
      "rejectionEvidenceSha256",
    );
    expect(JSON.stringify(fixture.values.at(-1))).not.toContain(
      failureReason,
    );
    const binding = productionRecoveryBinding();
    expect(
      readerSummaryProductionRecoveryQualityRemediationResumeDayIds(
        binding,
        requestedUtcDate,
      ),
    ).not.toEqual(
      readerSummaryProductionRecoveryQualityRemediationDayIds(
        binding,
        requestedUtcDate,
      ),
    );
  });

  it("does not resume noncanonical or rejected quality remediation", async () => {
    const requestedUtcDate = "2026-07-23";
    for (const quality of [
      qualityRemediationClaimRow(
        requestedUtcDate,
        "FAILED",
        "provider response was unavailable",
      ),
      qualityRemediationClaimRow(requestedUtcDate, "REJECTED"),
    ]) {
      const fixture = guardFixture([
        [{ replayed: false }],
        [retryClaimRow(requestedUtcDate, "REJECTED")],
        [quality],
      ]);
      await expect(claim(fixture.guard, requestedUtcDate)).rejects.toThrow(
        "quality-remediation-v1 lease was already consumed without final receipt",
      );
      expect(fixture.queries).toHaveLength(3);
      expect(fixture.queries.every((sql) => !sql.includes("INSERT"))).toBe(
        true,
      );
    }
  });

  it("does not re-consume an existing running retry lease without a receipt", async () => {
    const requestedUtcDate = "2026-07-26";
    const fixture = guardFixture([
      [{ replayed: false }],
      [retryClaimRow(requestedUtcDate, "RUNNING")],
    ]);

    await expect(claim(fixture.guard, requestedUtcDate)).rejects.toThrow(
      "2026-07-26 retry-v1 lease was already consumed without final receipt",
    );
    expect(fixture.queries).toHaveLength(2);
    expect(fixture.queries.every((sql) => !sql.includes("INSERT"))).toBe(
      true,
    );
  });

  it("rejects a failed retry outside the exact infrastructure allowlist", async () => {
    const requestedUtcDate = "2026-07-24";
    const fixture = guardFixture([
      [{ replayed: false }],
      [
        retryClaimRow(
          requestedUtcDate,
          "FAILED",
          "provider response was unavailable",
        ),
      ],
    ]);

    await expect(claim(fixture.guard, requestedUtcDate)).rejects.toThrow(
      "2026-07-24 retry-v1 lease was already consumed without final receipt",
    );
    expect(fixture.queries).toHaveLength(2);
  });

  it("fails closed with redacted date evidence for a non-canonical legacy failure", async () => {
    const requestedUtcDate = "2026-07-25";
    const fixture = guardFixture([
      [{ replayed: false }],
      [],
      [
        {
          ...legacyClaimRow(requestedUtcDate, "FAILED"),
          jobFailureReason: "provider response was unavailable",
        },
      ],
    ]);

    await expect(claim(fixture.guard, requestedUtcDate)).rejects.toThrow(
      "2026-07-25 legacy-v2 lease was already consumed without final receipt; failure_reason_sha256=",
    );
    expect(fixture.queries).toHaveLength(3);
    expect(fixture.queries.every((sql) => !sql.includes("INSERT"))).toBe(
      true,
    );
  });

  it("keeps canonical retry-v1 unchanged and resume identity distinct", () => {
    const binding = productionRecoveryBinding();
    const requestedUtcDate = "2026-07-24";
    const retryIds = readerSummaryProductionRecoveryDayIds(
      binding,
      requestedUtcDate,
    );
    expect(retryIds).toEqual({
      readerSummaryJobId: "3f47d8c2-1d8b-494d-a102-0f754b74f758",
      readerSummaryId: "20508fb3-dfc5-4451-a13b-033f473819ff",
    });
    expect(
      readerSummaryProductionRecoveryJobIdempotencyKey(
        requestedUtcDate,
        dayAuthority(binding, requestedUtcDate).canonicalSha256,
      ),
    ).toBe(
      "reader-summary-production-recovery-retry-v1:2026-07-24:" +
        "da2c96da4b6ff19024b34eafce517a846fced2cf93d6fe876d27a3f2c30f0935",
    );
    expect(
      readerSummaryProductionRecoveryResumeDayIds(
        binding,
        requestedUtcDate,
      ),
    ).not.toEqual(retryIds);
    expect(
      readerSummaryProductionRecoveryQualityRemediationJobIdempotencyKey(
        requestedUtcDate,
        dayAuthority(binding, requestedUtcDate).canonicalSha256,
      ),
    ).toContain(
      "reader-summary-production-recovery-quality-remediation-v1:",
    );
    expect(
      readerSummaryProductionRecoveryQualityRemediationResumeJobIdempotencyKey(
        requestedUtcDate,
        dayAuthority(binding, requestedUtcDate).canonicalSha256,
      ),
    ).toContain(
      "reader-summary-production-recovery-quality-remediation-resume-v1:",
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
): Readonly<{ guard: Guard; queries: string[]; values: unknown[][] }> => {
  const queries: string[] = [];
  const values: unknown[][] = [];
  let invocation = 0;
  const client = {
    $queryRaw: async <T>(
      strings: TemplateStringsArray,
      ...queryValues: unknown[]
    ): Promise<T> => {
      queries.push(strings.join("?").replace(/\s+/gu, " "));
      values.push(queryValues);
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
    values,
  };
};

const claimOutcome = (
  overrides: Partial<{
    claimed: boolean;
    staleJobSuperseded: boolean;
  }> = {},
) => ({
  claimed: true,
  staleJobSuperseded: false,
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
  failureReason?: string,
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
    failureReason,
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

const qualityRemediationClaimRow = (
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
  jobStatus: "RUNNING" | "REJECTED" | "FAILED",
  failureReason?: string,
) => {
  const binding = productionRecoveryBinding();
  const day = dayAuthority(binding, requestedUtcDate);
  const rejected = retryClaimRow(requestedUtcDate, "REJECTED");
  const ids = readerSummaryProductionRecoveryQualityRemediationDayIds(
    binding,
    requestedUtcDate,
  );
  const rejectionEvidenceSha256 = sha256(JSON.stringify({
    claimScope: "reader-summary-production-recovery-model-retry-v1",
    readerSummaryJobId: rejected.jobId,
    readerSummaryArtifactId: rejected.jobReaderSummaryArtifactId,
    terminalStatus: "REJECTED",
    failureReasonSha256: sha256(rejected.jobFailureReason),
    planSha256: day.canonicalSha256,
  }));
  return claimRow({
    requestedUtcDate,
    ids,
    jobStatus,
    jobIdempotencyKey:
      readerSummaryProductionRecoveryQualityRemediationJobIdempotencyKey(
        requestedUtcDate,
        day.canonicalSha256,
      ),
    failureReason,
    responsePayload: {
      schemaVersion:
        "reader_summary.production_recovery_model_quality_remediation_claim.v1",
      recoveryId: binding.recoveryId,
      tenantId: binding.tenantId,
      workspaceId: binding.workspaceId,
      requestedUtcDate,
      readerSummaryJobId: ids.readerSummaryJobId,
      readerSummaryArtifactId: ids.readerSummaryId,
      planSha256s: day.planSha256s,
      providerEvidenceSha256: day.providerEvidenceSha256,
      supersedes: {
        claimScope: "reader-summary-production-recovery-model-retry-v1",
        readerSummaryJobId: rejected.jobId,
        readerSummaryArtifactId: rejected.jobReaderSummaryArtifactId,
        terminalStatus: "REJECTED",
        rejectionEvidenceSha256,
      },
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

const sha256 = (value: string | null): string =>
  createHash("sha256").update(value ?? "").digest("hex");

const claimRow = (params: {
  requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  ids: Readonly<{ readerSummaryJobId: string; readerSummaryId: string }>;
  jobStatus: "RUNNING" | "REJECTED" | "FAILED";
  jobIdempotencyKey: string;
  responsePayload: unknown;
  failureReason?: string;
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
    jobFailureReason: terminal
      ? params.failureReason ??
        (params.jobStatus === "FAILED"
          ? "weekly canonical JSON exceeds structural bounds"
          : "quality rejection fixture")
      : null,
    artifactId:
      params.jobStatus === "REJECTED" ? params.ids.readerSummaryId : null,
    artifactStatus: params.jobStatus === "REJECTED" ? "REJECTED" : null,
  };
};
