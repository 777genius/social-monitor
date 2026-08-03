import { createHash } from "node:crypto";

import { stablePublicationJson } from "@social-monitor/summary/adapters/persistence/reader-summary-publication-proof";

import { productionRecoveryBinding } from "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-production-recovery-authority.spec-support";
import {
  buildReaderSummaryProductionRecoveryModelClaim,
} from "./reader-summary-production-recovery-claim-verifier";
import {
  readerSummaryProductionRecoveryClaimExpectation,
  readerSummaryProductionRecoveryHistoricClaimExpectation,
} from "./reader-summary-production-recovery-cli";
import { recoveryProvenanceForDay } from "./reader-summary-production-recovery-data";
import {
  PrismaReaderSummaryProductionRecoveryExecutionGuard,
} from "./reader-summary-production-recovery-replay-guard";

const requestedUtcDate = "2026-07-24" as const;
const generationProfile = {
  modelVersion: "codex:gpt-5.5:xhigh",
  promptVersion: "reader_summary.prompt.2026-07-14.daily_synthesis",
  rankingPolicyVersion: "story_ranking_v10",
} as const;

describe("PrismaReaderSummaryProductionRecoveryExecutionGuard", () => {
  it("atomically persists one deterministic pre-model lease and job", async () => {
    const fixture = guardFixture([
      [],
      [{ claimed: true, jobClaimed: true }],
    ]);

    await expect(claim(fixture.guard)).resolves.toBe("execute");
    expect(fixture.queries).toHaveLength(2);
    expect(fixture.queries[0]).toContain("FOR UPDATE OF claim");
    expect(fixture.queries[0]).not.toContain("LOCK TABLE");
    expect(fixture.queries[1]).toContain(
      'INSERT INTO "idempotency_keys"',
    );
    expect(fixture.queries[1]).toContain(
      'INSERT INTO "reader_summary_jobs"',
    );
    expect(fixture.queries[1]).not.toContain("source_items");
    expect(fixture.queries[1]).not.toContain(
      "reader_summary_artifacts",
    );
    expect(JSON.stringify(fixture.values[1])).toContain(
      "generationProfile",
    );
  });

  it("rejects duplicate and concurrent claims without another model lease", async () => {
    const concurrent = guardFixture([
      [],
      [{ claimed: false, jobClaimed: false }],
    ]);
    await expect(claim(concurrent.guard)).rejects.toThrow(
      "concurrent model claim was rejected",
    );

    const consumed = guardFixture([[claimRow("RUNNING")]]);
    await expect(claim(consumed.guard)).rejects.toThrow(
      "durable pre-model lease was consumed without an exact final receipt",
    );
    expect(consumed.queries).toHaveLength(1);
    expect(consumed.queries.every((sql) => !sql.includes("INSERT"))).toBe(
      true,
    );
  });

  it("fails closed after a crash with a consumed lease", async () => {
    const crashed = guardFixture([[claimRow("FAILED")]]);

    await expect(claim(crashed.guard)).rejects.toThrow(
      "consumed without an exact final receipt",
    );
    expect(crashed.queries).toHaveLength(1);
    expect(crashed.queries[0]).not.toContain("INSERT");
  });

  it("keeps a historic claim without generationProfile readable but never executable", async () => {
    const expectation = historicExpected(
      "reader_summary.production_recovery_model_retry_claim.v1",
    );
    const row = claimRow("RUNNING", {}, expectation);
    const historicPayload = {
      schemaVersion:
        "reader_summary.production_recovery_model_retry_claim.v1",
      recoveryId: expectation.recoveryId,
      tenantId: expectation.tenantId,
      workspaceId: expectation.workspaceId,
      requestedUtcDate: expectation.requestedUtcDate,
      readerSummaryJobId: expectation.readerSummaryJobId,
      readerSummaryArtifactId: expectation.readerSummaryArtifactId,
      planSha256s: expectation.dryRunCanonicalSha256s,
      providerEvidenceSha256: expectation.providerEvidenceSha256,
      supersedes: null,
      boundaries: {
        stage: "pre_model",
        leaseConsumed: true,
        modelCallPerformed: false,
        recollectionPerformed: false,
        providerWritePerformed: false,
      },
    };
    const fixture = guardFixture([
      [
        {
          ...row,
          claimScope:
            "reader-summary-production-recovery-model-retry-v1",
          responsePayload: historicPayload,
          jobId: expectation.readerSummaryJobId,
          jobIdempotencyKey:
            `reader-summary-production-recovery-retry-v1:${requestedUtcDate}:` +
            expectation.planCanonicalSha256,
        },
      ],
    ]);

    await expect(claim(fixture.guard)).rejects.toThrow(
      "consumed without an exact final receipt",
    );
    expect(fixture.queries).toHaveLength(1);
  });

  it("never replaces trusted historic job and artifact ids from a forged claim payload", async () => {
    const expectation = historicExpected(
      "reader_summary.production_recovery_model_retry_claim.v1",
    );
    const payload = historicRetryPayload(expectation);
    const fixture = guardFixture([
      [
        claimRow(
          "RUNNING",
          {
            claimScope:
              "reader-summary-production-recovery-model-retry-v1",
            responsePayload: {
              ...payload,
              readerSummaryJobId: expected().readerSummaryJobId,
              readerSummaryArtifactId:
                expected().readerSummaryArtifactId,
            },
          },
          expectation,
        ),
      ],
    ]);

    await expect(claim(fixture.guard)).rejects.toThrow(
      "historic claim does not match its exact authority",
    );
    expect(fixture.queries[0]).not.toContain(
      "response_payload\"->>'readerSummaryJobId')::uuid",
    );
  });

  it("accepts only the closed exact quality-rejection evidence contract", async () => {
    const exact = guardFixture([
      [
        claimRow("REJECTED", {
          jobFailureReason:
            "Reader summary artifact failed pre-publish quality gate: insufficient coverage",
        }),
      ],
    ]);
    await expect(claim(exact.guard)).resolves.toMatchObject({
      schemaVersion:
        "reader_summary.production_recovery_rejection_evidence.v2",
      reason: "pre_publish_quality_gate",
      terminalStatus: "REJECTED",
    });
  });

  it("verifies the claimed job idempotency key", async () => {
    const fixture = guardFixture([
      [
        claimRow("RUNNING", {
          jobIdempotencyKey: "forged-idempotency-key",
        }),
      ],
    ]);

    await expect(claim(fixture.guard)).rejects.toThrow(
      "claimed job diverged",
    );
    expect(fixture.queries).toHaveLength(1);
  });

  it("replays an exact final receipt with one read and zero writes", async () => {
    const fixture = guardFixture([[finalizedClaimRow()]]);

    await expect(claim(fixture.guard)).resolves.toBe("replayed");
    expect(fixture.queries).toHaveLength(1);
    expect(fixture.queries[0]).toContain(
      "reader_summary_recovery_receipts",
    );
    expect(fixture.queries[0]).not.toContain("INSERT");
    expect(fixture.queries[0]).not.toContain('UPDATE "');
    expect(fixture.queries[0]).not.toContain('DELETE FROM');
  });

  it("rejects a forged or partially matched superseded receipt", async () => {
    const fixture = guardFixture(
      historicFinalizedClaimRows(true),
    );

    await expect(claim(fixture.guard)).rejects.toThrow(
      "superseded predecessor diverged",
    );
    expect(fixture.queries).toHaveLength(1);
  });

  it("accepts an exact historic superseded predecessor chain only as replay", async () => {
    const fixture = guardFixture(
      historicFinalizedClaimRows(false),
    );

    await expect(claim(fixture.guard)).resolves.toBe("replayed");
    expect(fixture.queries).toHaveLength(1);
    expect(fixture.queries[0]).not.toContain("INSERT");
  });
});

type Guard = PrismaReaderSummaryProductionRecoveryExecutionGuard;

const claim = (guard: Guard) =>
  guard.claim({
    binding: productionRecoveryBinding(),
    requestedUtcDate,
    generationProfile,
  });

const expected = () =>
  readerSummaryProductionRecoveryClaimExpectation({
    binding: productionRecoveryBinding(),
    requestedUtcDate,
    generationProfile,
  });

const historicExpected = (
  schema: Parameters<
    typeof readerSummaryProductionRecoveryHistoricClaimExpectation
  >[1],
) =>
  readerSummaryProductionRecoveryHistoricClaimExpectation(
    {
      binding: productionRecoveryBinding(),
      requestedUtcDate,
      generationProfile,
    },
    schema,
  );

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

const claimRow = (
  status: "RUNNING" | "FAILED" | "REJECTED" | "COMPLETED",
  overrides: Readonly<Record<string, unknown>> = {},
  expectation = expected(),
) => {
  const startedAt = new Date("2026-07-30T10:00:00.000Z");
  const rejected = status === "REJECTED";
  const terminal = status !== "RUNNING";
  return {
    claimScope: "reader-summary-production-recovery-model-v2",
    requestHash: expectation.planCanonicalSha256,
    responseStatus: 102,
    responsePayload:
      buildReaderSummaryProductionRecoveryModelClaim(expectation),
    jobId: expectation.readerSummaryJobId,
    jobScopeType: "workspace",
    jobScopeKey: "workspace",
    jobInterestId: null,
    jobCadence: "daily",
    jobPeriodStartedAt: new Date("2026-07-24T00:00:00.000Z"),
    jobPeriodEndedAt: new Date("2026-07-25T00:00:00.000Z"),
    jobPeriodTimezone: "UTC",
    jobPeriodKey:
      "daily:2026-07-24T00:00:00.000Z:2026-07-25T00:00:00.000Z:UTC",
    jobUserId: null,
    jobSubscriptionId: null,
    jobStatus: status,
    jobIdempotencyKey: expectation.recoveryIdentity,
    jobStartedAt: startedAt,
    jobCompletedAt: status === "COMPLETED" ? startedAt : null,
    jobFailedAt: terminal && status !== "COMPLETED" ? startedAt : null,
    jobReaderSummaryArtifactId:
      rejected || status === "COMPLETED"
        ? expectation.readerSummaryArtifactId
        : null,
    jobFailureReason: rejected
      ? "Reader summary artifact failed pre-publish quality gate: quality fixture"
      : status === "FAILED"
        ? "model process terminated after lease consumption"
        : null,
    artifactId:
      rejected || status === "COMPLETED"
        ? expectation.readerSummaryArtifactId
        : null,
    artifactStatus: rejected
      ? "REJECTED"
      : status === "COMPLETED"
        ? "READY"
        : null,
    receiptTenantId: null,
    receiptWorkspaceId: null,
    receiptPublicationId: null,
    receiptJobId: null,
    receiptArtifactId: null,
    receiptRecoveryKind: null,
    receiptProvenance: null,
    receiptProvenanceSha256: null,
    receiptExact: null,
    receiptSha256: null,
    receiptRecordedAt: null,
    publicationReportSha256: null,
    publicationProofSha256: null,
    publicationPublishedAt: null,
    ...overrides,
  };
};

const finalizedClaimRow = () => {
  const expectation = expected();
  const binding = productionRecoveryBinding();
  const provenance = recoveryProvenanceForDay(
    binding,
    requestedUtcDate,
  );
  const recordedAt = new Date("2026-07-30T12:00:00.000Z");
  const reportSha256 = "a".repeat(64);
  const proofSha256 = "b".repeat(64);
  const provenanceSha256 = sha256(stablePublicationJson(provenance));
  const receiptExact = {
    schemaVersion: "reader_summary.recovery_receipt.v1",
    recoveryKind: "SUMMARY_ONLY",
    tenantId: expectation.tenantId,
    workspaceId: expectation.workspaceId,
    publicationId: expectation.readerSummaryArtifactId,
    readerSummaryJobId: expectation.readerSummaryJobId,
    readerSummaryArtifactId: expectation.readerSummaryArtifactId,
    reportSha256,
    proofSha256,
    recordedAt: recordedAt.toISOString(),
    provenance,
    provenanceSha256,
  };
  return claimRow("COMPLETED", {
    receiptTenantId: expectation.tenantId,
    receiptWorkspaceId: expectation.workspaceId,
    receiptPublicationId: expectation.readerSummaryArtifactId,
    receiptJobId: expectation.readerSummaryJobId,
    receiptArtifactId: expectation.readerSummaryArtifactId,
    receiptRecoveryKind: "SUMMARY_ONLY",
    receiptProvenance: provenance,
    receiptProvenanceSha256: provenanceSha256,
    receiptExact,
    receiptSha256: sha256(stablePublicationJson(receiptExact)),
    receiptRecordedAt: recordedAt,
    publicationReportSha256: reportSha256,
    publicationProofSha256: proofSha256,
    publicationPublishedAt: recordedAt,
  });
};

const historicRetryPayload = (
  expectation: ReturnType<typeof historicExpected>,
) => ({
  schemaVersion:
    "reader_summary.production_recovery_model_retry_claim.v1",
  recoveryId: expectation.recoveryId,
  tenantId: expectation.tenantId,
  workspaceId: expectation.workspaceId,
  requestedUtcDate: expectation.requestedUtcDate,
  readerSummaryJobId: expectation.readerSummaryJobId,
  readerSummaryArtifactId: expectation.readerSummaryArtifactId,
  planSha256s: expectation.dryRunCanonicalSha256s,
  providerEvidenceSha256: expectation.providerEvidenceSha256,
  supersedes: null,
  boundaries: {
    stage: "pre_model",
    leaseConsumed: true,
    modelCallPerformed: false,
    recollectionPerformed: false,
    providerWritePerformed: false,
  },
});

const historicFinalizedClaimRows = (
  forged: boolean,
): readonly (readonly unknown[])[] => {
  const retry = historicExpected(
    "reader_summary.production_recovery_model_retry_claim.v1",
  );
  const resume = historicExpected(
    "reader_summary.production_recovery_model_resume_claim.v1",
  );
  const failureReason = "weekly canonical JSON exceeds byte bounds";
  const resumePayload = {
    schemaVersion:
      "reader_summary.production_recovery_model_resume_claim.v1",
    recoveryId: resume.recoveryId,
    tenantId: resume.tenantId,
    workspaceId: resume.workspaceId,
    requestedUtcDate: resume.requestedUtcDate,
    readerSummaryJobId: resume.readerSummaryJobId,
    readerSummaryArtifactId: resume.readerSummaryArtifactId,
    planSha256s: resume.dryRunCanonicalSha256s,
    providerEvidenceSha256: resume.providerEvidenceSha256,
    supersedes: {
      readerSummaryJobId: retry.readerSummaryJobId,
      readerSummaryArtifactId: null,
      terminalStatus: "FAILED",
      infrastructureFailure: "postgres_canonical_bounds",
      failureReasonSha256: forged
        ? "f".repeat(64)
        : sha256(failureReason),
    },
    boundaries: {
      stage: "pre_model",
      leaseConsumed: true,
      modelCallPerformed: false,
      recollectionPerformed: false,
      providerWritePerformed: false,
    },
  };
  const predecessor = claimRow(
    "FAILED",
    {
      claimScope:
        "reader-summary-production-recovery-model-retry-v1",
      responsePayload: historicRetryPayload(retry),
      jobIdempotencyKey:
        `reader-summary-production-recovery-retry-v1:${requestedUtcDate}:` +
        retry.planCanonicalSha256,
      jobFailureReason: failureReason,
    },
    retry,
  );
  const finalized = finalizedHistoricClaimRow(resume, resumePayload);
  return [[predecessor, finalized]];
};

const finalizedHistoricClaimRow = (
  expectation: ReturnType<typeof historicExpected>,
  responsePayload: Readonly<Record<string, unknown>>,
) => {
  const current = finalizedClaimRow();
  const receiptExact = {
    ...(current.receiptExact as Record<string, unknown>),
    publicationId: expectation.readerSummaryArtifactId,
    readerSummaryJobId: expectation.readerSummaryJobId,
    readerSummaryArtifactId: expectation.readerSummaryArtifactId,
  };
  return {
    ...current,
    claimScope:
      "reader-summary-production-recovery-model-resume-v1",
    responsePayload,
    jobId: expectation.readerSummaryJobId,
    jobIdempotencyKey:
      `reader-summary-production-recovery-resume-v1:${requestedUtcDate}:` +
      expectation.planCanonicalSha256,
    jobReaderSummaryArtifactId: expectation.readerSummaryArtifactId,
    artifactId: expectation.readerSummaryArtifactId,
    receiptPublicationId: expectation.readerSummaryArtifactId,
    receiptJobId: expectation.readerSummaryJobId,
    receiptArtifactId: expectation.readerSummaryArtifactId,
    receiptExact,
    receiptSha256: sha256(stablePublicationJson(receiptExact)),
  };
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
