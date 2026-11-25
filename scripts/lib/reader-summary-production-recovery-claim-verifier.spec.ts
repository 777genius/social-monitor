import { createHash } from "node:crypto";

import { stablePublicationJson } from "@social-monitor/summary/adapters/persistence/reader-summary-publication-proof";

import { productionRecoveryBinding } from "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-production-recovery-authority.spec-support";
import {
  readerSummaryProductionRecoveryClaimExpectation,
  readerSummaryProductionRecoveryHistoricClaimExpectation,
} from "./reader-summary-production-recovery-cli";
import {
  buildReaderSummaryProductionRecoveryModelClaim,
  buildReaderSummaryProductionRecoveryGapModelClaim,
  buildReaderSummaryProductionRecoveryRejectionEvidence,
  verifyReaderSummaryProductionRecoveryClaim,
  verifyReaderSummaryProductionRecoveryGapClaim,
  verifyReaderSummaryProductionRecoveryFinalReceipt,
  verifyReaderSummaryProductionRecoveryRejectionEvidence,
  type ReaderSummaryProductionRecoveryFinalReceiptRow,
} from "./reader-summary-production-recovery-claim-verifier";
import { readerSummaryProductionRecoveryModelContract } from "./reader-summary-production-recovery-model-contract";
import { recoveryProvenanceForDay } from "./reader-summary-production-recovery-data";

const generationProfile = {
  modelVersion: "codex:gpt-5.6-sol:xhigh",
  promptVersion: "reader_summary.prompt.2026-07-14.daily_synthesis",
  rankingPolicyVersion: "story_ranking_v10",
} as const;

describe("reader summary production recovery claim verifier", () => {
  it("requires generationProfile on every new claim", () => {
    const expected = expectation();
    const claim = buildReaderSummaryProductionRecoveryModelClaim(expected);

    expect(
      verifyReaderSummaryProductionRecoveryClaim(claim, expected),
    ).toMatchObject({
      historic: false,
      generationProfile,
    });
    const missing = { ...claim } as Record<string, unknown>;
    delete missing.generationProfile;
    expect(() =>
      verifyReaderSummaryProductionRecoveryClaim(missing, expected),
    ).toThrow("new claim does not match its exact authority");
  });

  it("keeps an exact historic claim without generationProfile readable and safe", () => {
    const expected = historicExpectation(
      "reader_summary.production_recovery_model_retry_claim.v1",
    );
    const historic = {
      schemaVersion:
        "reader_summary.production_recovery_model_retry_claim.v1",
      recoveryId: expected.recoveryId,
      tenantId: expected.tenantId,
      workspaceId: expected.workspaceId,
      requestedUtcDate: expected.requestedUtcDate,
      readerSummaryJobId: expected.readerSummaryJobId,
      readerSummaryArtifactId: expected.readerSummaryArtifactId,
      planSha256s: expected.dryRunCanonicalSha256s,
      providerEvidenceSha256: expected.providerEvidenceSha256,
      supersedes: null,
      boundaries: {
        stage: "pre_model",
        leaseConsumed: true,
        modelCallPerformed: false,
        recollectionPerformed: false,
        providerWritePerformed: false,
      },
    };

    expect(
      verifyReaderSummaryProductionRecoveryClaim(historic, expected),
    ).toEqual({
      payload: historic,
      historic: true,
      supersededPredecessor: null,
      generationProfile: undefined,
    });
  });

  it("rejects arbitrary rejection reasons and non-exact evidence", () => {
    const expected = expectation();
    expect(() =>
      buildReaderSummaryProductionRecoveryRejectionEvidence({
        reason: "operator_supplied_evidence" as never,
        readerSummaryJobId: expected.readerSummaryJobId,
        readerSummaryArtifactId: expected.readerSummaryArtifactId,
        planCanonicalSha256: expected.planCanonicalSha256,
      }),
    ).toThrow("rejection reason is outside the closed enum");

    const params = {
      reason: "pre_publish_quality_gate" as const,
      readerSummaryJobId: expected.readerSummaryJobId,
      readerSummaryArtifactId: expected.readerSummaryArtifactId,
      planCanonicalSha256: expected.planCanonicalSha256,
    };
    const evidence =
      buildReaderSummaryProductionRecoveryRejectionEvidence(params);
    expect(() =>
      verifyReaderSummaryProductionRecoveryRejectionEvidence(
        { ...evidence, arbitrary: true },
        params,
      ),
    ).toThrow("rejection evidence is not exact");
  });

  it("binds eligible gap claims to the exact model contract", () => {
    const expected = {
      ...expectation(),
      modelEligibility: {
        eligible: true,
        reasons: [],
        evaluatedAgainst: "immutable_db_evidence" as const,
      },
      modelContract: readerSummaryProductionRecoveryModelContract,
    };
    const claim = buildReaderSummaryProductionRecoveryGapModelClaim(expected);
    expect(
      verifyReaderSummaryProductionRecoveryGapClaim(claim, expected),
    ).toMatchObject({ historic: false, generationProfile });
    expect(() =>
      buildReaderSummaryProductionRecoveryGapModelClaim({
        ...expected,
        generationProfile: {
          ...generationProfile,
          modelVersion: "codex:gpt-5.5:xhigh",
        },
      }),
    ).toThrow("gap claim is not model eligible");
    expect(() =>
      buildReaderSummaryProductionRecoveryGapModelClaim({
        ...expected,
        modelEligibility: {
          ...expected.modelEligibility,
          eligible: false,
          reasons: ["provider_reddit_missing"],
        },
      }),
    ).toThrow("gap claim is not model eligible");
  });

  it("carries and compares the exact full superseded predecessor through final receipt verification", () => {
    const expected = historicExpectation(
      "reader_summary.production_recovery_model_resume_claim.v1",
    );
    const predecessor = historicExpectation(
      "reader_summary.production_recovery_model_retry_claim.v1",
    );
    const failureReason = "weekly canonical JSON exceeds byte bounds";
    const supersedes = {
      readerSummaryJobId: predecessor.readerSummaryJobId,
      readerSummaryArtifactId: null,
      terminalStatus: "FAILED",
      infrastructureFailure: "postgres_canonical_bounds",
      failureReasonSha256: sha256(failureReason),
    } as const;
    const historic = {
      schemaVersion:
        "reader_summary.production_recovery_model_resume_claim.v1",
      recoveryId: expected.recoveryId,
      tenantId: expected.tenantId,
      workspaceId: expected.workspaceId,
      requestedUtcDate: expected.requestedUtcDate,
      readerSummaryJobId: expected.readerSummaryJobId,
      readerSummaryArtifactId: expected.readerSummaryArtifactId,
      planSha256s: expected.dryRunCanonicalSha256s,
      providerEvidenceSha256: expected.providerEvidenceSha256,
      supersedes,
      boundaries: {
        stage: "pre_model",
        leaseConsumed: true,
        modelCallPerformed: false,
        recollectionPerformed: false,
        providerWritePerformed: false,
      },
    };
    const claim = verifyReaderSummaryProductionRecoveryClaim(
      historic,
      expected,
    );
    expect(claim.supersededPredecessor).toEqual(supersedes);
    const binding = productionRecoveryBinding();
    const provenance = recoveryProvenanceForDay(
      binding,
      "2026-07-24",
    );
    const receipt = receiptRow(expected, provenance);
    const predecessorStates = [
      {
        claimScope:
          "reader-summary-production-recovery-model-retry-v1",
        responsePayload: {},
        jobId: predecessor.readerSummaryJobId,
        jobStatus: "FAILED",
        jobReaderSummaryArtifactId: null,
        jobFailureReason: failureReason,
      },
    ];
    expect(() =>
      verifyReaderSummaryProductionRecoveryFinalReceipt(receipt, {
        claim,
        expectedProvenance: provenance,
        predecessorStates,
      }),
    ).not.toThrow();

    const forgedClaim = verifyReaderSummaryProductionRecoveryClaim(
      {
        ...historic,
        supersedes: {
          ...supersedes,
          failureReasonSha256: "f".repeat(64),
        },
      },
      expected,
    );
    expect(() =>
      verifyReaderSummaryProductionRecoveryFinalReceipt(receipt, {
        claim: forgedClaim,
        expectedProvenance: provenance,
        predecessorStates,
      }),
    ).toThrow("superseded predecessor diverged");
  });
});

const expectation = () =>
  readerSummaryProductionRecoveryClaimExpectation({
    binding: productionRecoveryBinding(),
    requestedUtcDate: "2026-07-24",
    generationProfile,
  });

const historicExpectation = (
  schema: Parameters<
    typeof readerSummaryProductionRecoveryHistoricClaimExpectation
  >[1],
) =>
  readerSummaryProductionRecoveryHistoricClaimExpectation(
    {
      binding: productionRecoveryBinding(),
      requestedUtcDate: "2026-07-24",
      generationProfile,
    },
    schema,
  );

const receiptRow = (
  expected: ReturnType<typeof expectation>,
  provenance: ReturnType<typeof recoveryProvenanceForDay>,
): ReaderSummaryProductionRecoveryFinalReceiptRow => {
  const recordedAt = new Date("2026-07-30T12:00:00.000Z");
  const reportSha256 = "a".repeat(64);
  const proofSha256 = "b".repeat(64);
  const provenanceSha256 = sha256(stablePublicationJson(provenance));
  const exactReceipt = {
    schemaVersion: "reader_summary.recovery_receipt.v1",
    recoveryKind: "SUMMARY_ONLY",
    tenantId: expected.tenantId,
    workspaceId: expected.workspaceId,
    publicationId: expected.readerSummaryArtifactId,
    readerSummaryJobId: expected.readerSummaryJobId,
    readerSummaryArtifactId: expected.readerSummaryArtifactId,
    reportSha256,
    proofSha256,
    recordedAt: recordedAt.toISOString(),
    provenance,
    provenanceSha256,
  };
  return {
    tenantId: expected.tenantId,
    workspaceId: expected.workspaceId,
    publicationId: expected.readerSummaryArtifactId,
    readerSummaryJobId: expected.readerSummaryJobId,
    readerSummaryArtifactId: expected.readerSummaryArtifactId,
    recoveryKind: "SUMMARY_ONLY",
    provenance,
    provenanceSha256,
    exactReceipt,
    receiptSha256: sha256(stablePublicationJson(exactReceipt)),
    recordedAt,
    publicationReportSha256: reportSha256,
    publicationProofSha256: proofSha256,
    publicationPublishedAt: recordedAt,
  };
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
