import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { stablePublicationJson } from "@social-monitor/summary/adapters/persistence/reader-summary-publication-proof";
import type {
  ReaderSummaryProductionRecoveryGapDayAuthority,
} from "./reader-summary-production-recovery-gap-authority";
import {
  readerSummaryProductionRecoveryModelContract,
  type ReaderSummaryProductionRecoveryModelContract,
} from "./reader-summary-production-recovery-model-contract";

export const readerSummaryProductionRecoveryClaimSchema =
  "reader_summary.production_recovery_model_claim.v2" as const;
export const readerSummaryProductionRecoveryGapClaimSchema =
  "reader_summary.production_recovery_model_claim.v3" as const;

export const readerSummaryProductionRecoveryHistoricClaimSchemas = [
  "reader_summary.production_recovery_model_claim.v1",
  "reader_summary.production_recovery_model_retry_claim.v1",
  "reader_summary.production_recovery_model_resume_claim.v1",
  "reader_summary.production_recovery_model_quality_remediation_claim.v1",
  "reader_summary.production_recovery_model_quality_remediation_resume_claim.v1",
] as const;

export type ReaderSummaryProductionRecoveryHistoricClaimSchema =
  (typeof readerSummaryProductionRecoveryHistoricClaimSchemas)[number];

export const readerSummaryProductionRecoveryRejectionReasons = [
  "pre_publish_quality_gate",
] as const;

export type ReaderSummaryProductionRecoveryRejectionReason =
  (typeof readerSummaryProductionRecoveryRejectionReasons)[number];

export type ReaderSummaryProductionRecoveryGenerationProfile = Readonly<{
  modelVersion: string;
  promptVersion: string;
  rankingPolicyVersion: string;
}>;

export type ReaderSummaryProductionRecoveryClaimExpectation = Readonly<{
  recoveryIdentity: string;
  recoveryId: string;
  tenantId: string;
  workspaceId: string;
  requestedUtcDate: string;
  readerSummaryJobId: string;
  readerSummaryArtifactId: string;
  planCanonicalSha256: string;
  dryRunCanonicalSha256s: readonly [string, string];
  providerEvidenceSha256: string;
  generationProfile: ReaderSummaryProductionRecoveryGenerationProfile;
}>;

export type ReaderSummaryProductionRecoveryModelClaimV2 =
  ReaderSummaryProductionRecoveryClaimExpectation &
    Readonly<{
      schemaVersion: typeof readerSummaryProductionRecoveryClaimSchema;
      supersededPredecessor: null;
      boundaries: Readonly<{
        stage: "pre_model";
        leaseConsumed: true;
        modelCallPerformed: false;
        recollectionPerformed: false;
        providerWritePerformed: false;
      }>;
    }>;

export type ReaderSummaryProductionRecoveryGapClaimExpectation =
  ReaderSummaryProductionRecoveryClaimExpectation &
    Readonly<{
      modelEligibility: ReaderSummaryProductionRecoveryGapDayAuthority["modelEligibility"];
      modelContract: ReaderSummaryProductionRecoveryModelContract;
    }>;

export type ReaderSummaryProductionRecoveryModelClaimV3 =
  ReaderSummaryProductionRecoveryGapClaimExpectation &
    Readonly<{
      schemaVersion: typeof readerSummaryProductionRecoveryGapClaimSchema;
      supersededPredecessor: null;
      boundaries: typeof v2Boundaries;
    }>;

export type VerifiedReaderSummaryProductionRecoveryClaim = Readonly<{
  payload: Readonly<Record<string, unknown>>;
  historic: boolean;
  supersededPredecessor: Readonly<Record<string, unknown>> | null;
  generationProfile:
    | ReaderSummaryProductionRecoveryGenerationProfile
    | undefined;
}>;

export type ReaderSummaryProductionRecoveryRejectionEvidence = Readonly<{
  schemaVersion:
    "reader_summary.production_recovery_rejection_evidence.v2";
  reason: ReaderSummaryProductionRecoveryRejectionReason;
  terminalStatus: "REJECTED";
  readerSummaryJobId: string;
  readerSummaryArtifactId: string;
  planCanonicalSha256: string;
}>;

export type ReaderSummaryProductionRecoveryPredecessorState = Readonly<{
  claimScope: string;
  responsePayload: unknown;
  jobId: string | null;
  jobStatus: string | null;
  jobReaderSummaryArtifactId: string | null;
  jobFailureReason: string | null;
}>;

export type ReaderSummaryProductionRecoveryFinalReceiptRow = Readonly<{
  tenantId: string;
  workspaceId: string;
  publicationId: string;
  readerSummaryJobId: string;
  readerSummaryArtifactId: string;
  recoveryKind: string;
  provenance: unknown;
  provenanceSha256: string;
  exactReceipt: unknown;
  receiptSha256: string;
  recordedAt: Date;
  publicationReportSha256: string;
  publicationProofSha256: string;
  publicationPublishedAt: Date;
}>;

const exactClaimKeys = [
  "schemaVersion",
  "recoveryIdentity",
  "recoveryId",
  "tenantId",
  "workspaceId",
  "requestedUtcDate",
  "readerSummaryJobId",
  "readerSummaryArtifactId",
  "planCanonicalSha256",
  "dryRunCanonicalSha256s",
  "providerEvidenceSha256",
  "generationProfile",
  "supersededPredecessor",
  "boundaries",
] as const;

const exactGapClaimKeys = [
  ...exactClaimKeys,
  "modelEligibility",
  "modelContract",
] as const;

const historicCoreKeys = [
  "schemaVersion",
  "recoveryId",
  "tenantId",
  "workspaceId",
  "requestedUtcDate",
  "readerSummaryJobId",
  "readerSummaryArtifactId",
  "planSha256s",
  "providerEvidenceSha256",
] as const;

const v2Boundaries = Object.freeze({
  stage: "pre_model" as const,
  leaseConsumed: true as const,
  modelCallPerformed: false as const,
  recollectionPerformed: false as const,
  providerWritePerformed: false as const,
});

export const buildReaderSummaryProductionRecoveryModelClaim = (
  expected: ReaderSummaryProductionRecoveryClaimExpectation,
): ReaderSummaryProductionRecoveryModelClaimV2 => {
  assertClaimExpectation(expected);
  return {
    schemaVersion: readerSummaryProductionRecoveryClaimSchema,
    ...expected,
    dryRunCanonicalSha256s: [...expected.dryRunCanonicalSha256s] as [
      string,
      string,
    ],
    generationProfile: { ...expected.generationProfile },
    supersededPredecessor: null,
    boundaries: v2Boundaries,
  };
};

export const buildReaderSummaryProductionRecoveryGapModelClaim = (
  expected: ReaderSummaryProductionRecoveryGapClaimExpectation,
): ReaderSummaryProductionRecoveryModelClaimV3 => {
  assertClaimExpectation(expected);
  if (
    !expected.modelEligibility.eligible ||
    expected.modelEligibility.reasons.length !== 0 ||
    !isDeepStrictEqual(
      expected.modelContract,
      readerSummaryProductionRecoveryModelContract,
    ) ||
    expected.generationProfile.modelVersion !== "codex:gpt-5.6-sol:xhigh"
  ) {
    throw claimError("gap claim is not model eligible");
  }
  return {
    schemaVersion: readerSummaryProductionRecoveryGapClaimSchema,
    ...expected,
    dryRunCanonicalSha256s: [...expected.dryRunCanonicalSha256s] as [string, string],
    generationProfile: { ...expected.generationProfile },
    modelEligibility: {
      ...expected.modelEligibility,
      reasons: [...expected.modelEligibility.reasons],
    },
    modelContract: { ...expected.modelContract },
    supersededPredecessor: null,
    boundaries: v2Boundaries,
  };
};

export const verifyReaderSummaryProductionRecoveryGapClaim = (
  value: unknown,
  expected: ReaderSummaryProductionRecoveryGapClaimExpectation,
): VerifiedReaderSummaryProductionRecoveryClaim => {
  const exact = buildReaderSummaryProductionRecoveryGapModelClaim(expected);
  if (
    !isRecord(value) ||
    value.schemaVersion !== readerSummaryProductionRecoveryGapClaimSchema ||
    !hasExactKeys(value, exactGapClaimKeys) ||
    !isDeepStrictEqual(value, exact)
  ) {
    throw claimError("gap claim does not match its exact authority");
  }
  return {
    payload: value,
    historic: false,
    supersededPredecessor: null,
    generationProfile: exact.generationProfile,
  };
};

export const verifyReaderSummaryProductionRecoveryClaim = (
  value: unknown,
  expected: ReaderSummaryProductionRecoveryClaimExpectation,
): VerifiedReaderSummaryProductionRecoveryClaim => {
  assertClaimExpectation(expected);
  if (!isRecord(value) || typeof value.schemaVersion !== "string") {
    throw claimError("payload is not an object with a schema");
  }
  if (value.schemaVersion === readerSummaryProductionRecoveryClaimSchema) {
    const exact = buildReaderSummaryProductionRecoveryModelClaim(expected);
    if (
      !hasExactKeys(value, exactClaimKeys) ||
      !isDeepStrictEqual(value, exact)
    ) {
      throw claimError("new claim does not match its exact authority");
    }
    return {
      payload: value,
      historic: false,
      supersededPredecessor: null,
      generationProfile: exact.generationProfile,
    };
  }
  if (!isHistoricSchema(value.schemaVersion)) {
    throw claimError("schema is not supported");
  }
  verifyHistoricClaim(value, expected);
  return {
    payload: value,
    historic: true,
    supersededPredecessor:
      "supersedes" in value && isRecord(value.supersedes)
        ? value.supersedes
        : null,
    generationProfile: undefined,
  };
};

export const buildReaderSummaryProductionRecoveryRejectionEvidence = (
  params: Readonly<{
    reason: ReaderSummaryProductionRecoveryRejectionReason;
    readerSummaryJobId: string;
    readerSummaryArtifactId: string;
    planCanonicalSha256: string;
  }>,
): ReaderSummaryProductionRecoveryRejectionEvidence => {
  if (
    !(readerSummaryProductionRecoveryRejectionReasons as readonly string[])
      .includes(params.reason)
  ) {
    throw claimError("rejection reason is outside the closed enum");
  }
  assertUuid(params.readerSummaryJobId, "rejected job id");
  assertUuid(params.readerSummaryArtifactId, "rejected artifact id");
  assertSha256(params.planCanonicalSha256, "rejected plan");
  return {
    schemaVersion:
      "reader_summary.production_recovery_rejection_evidence.v2",
    reason: params.reason,
    terminalStatus: "REJECTED",
    readerSummaryJobId: params.readerSummaryJobId,
    readerSummaryArtifactId: params.readerSummaryArtifactId,
    planCanonicalSha256: params.planCanonicalSha256,
  };
};

export const verifyReaderSummaryProductionRecoveryRejectionEvidence = (
  value: unknown,
  params: Parameters<
    typeof buildReaderSummaryProductionRecoveryRejectionEvidence
  >[0],
): ReaderSummaryProductionRecoveryRejectionEvidence => {
  const expected = buildReaderSummaryProductionRecoveryRejectionEvidence(
    params,
  );
  if (!isDeepStrictEqual(value, expected)) {
    throw claimError("rejection evidence is not exact");
  }
  return expected;
};

export const verifyReaderSummaryProductionRecoveryFinalReceipt = (
  row: ReaderSummaryProductionRecoveryFinalReceiptRow,
  params: Readonly<{
    claim: VerifiedReaderSummaryProductionRecoveryClaim;
    expectedProvenance: unknown;
    predecessorStates:
      readonly ReaderSummaryProductionRecoveryPredecessorState[];
  }>,
): void => {
  verifyReaderSummaryProductionRecoverySupersededPredecessor(
    params.claim,
    params.predecessorStates,
  );
  const claim = params.claim.payload;
  const jobId = exactString(claim.readerSummaryJobId);
  const artifactId = exactString(claim.readerSummaryArtifactId);
  if (
    row.recoveryKind !== "SUMMARY_ONLY" ||
    row.tenantId !== claim.tenantId ||
    row.workspaceId !== claim.workspaceId ||
    row.readerSummaryJobId !== jobId ||
    row.readerSummaryArtifactId !== artifactId ||
    row.publicationId !== artifactId ||
    row.publicationReportSha256.length !== 64 ||
    row.publicationProofSha256.length !== 64 ||
    row.recordedAt.getTime() !== row.publicationPublishedAt.getTime() ||
    !isDeepStrictEqual(row.provenance, params.expectedProvenance)
  ) {
    throw claimError("final receipt binding diverged");
  }
  const provenanceCanonical = stablePublicationJson(row.provenance);
  if (sha256(provenanceCanonical) !== row.provenanceSha256) {
    throw claimError("final receipt provenance hash diverged");
  }
  const expectedExactReceipt = {
    schemaVersion: "reader_summary.recovery_receipt.v1",
    recoveryKind: "SUMMARY_ONLY",
    tenantId: row.tenantId,
    workspaceId: row.workspaceId,
    publicationId: row.publicationId,
    readerSummaryJobId: row.readerSummaryJobId,
    readerSummaryArtifactId: row.readerSummaryArtifactId,
    reportSha256: row.publicationReportSha256,
    proofSha256: row.publicationProofSha256,
    recordedAt: row.recordedAt.toISOString(),
    provenance: params.expectedProvenance,
    provenanceSha256: row.provenanceSha256,
  };
  if (!isDeepStrictEqual(row.exactReceipt, expectedExactReceipt)) {
    throw claimError(
      "final receipt does not exact-compare the full predecessor payload",
    );
  }
  if (
    sha256(stablePublicationJson(row.exactReceipt)) !== row.receiptSha256
  ) {
    throw claimError("final receipt hash diverged");
  }
};

export const verifyReaderSummaryProductionRecoverySupersededPredecessor = (
  claim: VerifiedReaderSummaryProductionRecoveryClaim,
  states: readonly ReaderSummaryProductionRecoveryPredecessorState[],
): void => {
  if (!claim.historic) {
    if (claim.supersededPredecessor !== null) {
      throw claimError("new claim carries a superseded predecessor");
    }
    return;
  }
  const schema = String(claim.payload.schemaVersion);
  const predecessor = claim.supersededPredecessor;
  if (
    schema === "reader_summary.production_recovery_model_claim.v1" ||
    (schema ===
      "reader_summary.production_recovery_model_retry_claim.v1" &&
      predecessor === null)
  ) {
    return;
  }
  if (predecessor === null) {
    throw claimError("historic superseded predecessor is absent");
  }
  if (
    schema ===
    "reader_summary.production_recovery_model_retry_claim.v1"
  ) {
    verifyRetryPredecessor(predecessor, states);
    return;
  }
  if (
    schema ===
    "reader_summary.production_recovery_model_resume_claim.v1"
  ) {
    verifyFailedPredecessor(
      predecessor,
      states,
      "reader-summary-production-recovery-model-retry-v1",
      false,
    );
    return;
  }
  if (
    schema ===
    "reader_summary.production_recovery_model_quality_remediation_claim.v1"
  ) {
    verifyQualityPredecessor(
      predecessor,
      states,
      String(
        Array.isArray(claim.payload.planSha256s)
          ? claim.payload.planSha256s[0]
          : "",
      ),
    );
    return;
  }
  if (
    schema ===
    "reader_summary.production_recovery_model_quality_remediation_resume_claim.v1"
  ) {
    verifyFailedPredecessor(
      predecessor,
      states,
      "reader-summary-production-recovery-model-quality-remediation-v1",
      true,
    );
    return;
  }
  throw claimError("historic superseded predecessor schema diverged");
};

const verifyHistoricClaim = (
  value: Record<string, unknown>,
  expected: ReaderSummaryProductionRecoveryClaimExpectation,
): void => {
  const allowedKeys =
    value.schemaVersion ===
    "reader_summary.production_recovery_model_claim.v1"
      ? [...historicCoreKeys, "boundaries"]
      : [...historicCoreKeys, "supersedes", "boundaries"];
  if (
    !hasExactKeys(value, allowedKeys) ||
    value.recoveryId !== expected.recoveryId ||
    value.tenantId !== expected.tenantId ||
    value.workspaceId !== expected.workspaceId ||
    value.requestedUtcDate !== expected.requestedUtcDate ||
    value.readerSummaryJobId !== expected.readerSummaryJobId ||
    value.readerSummaryArtifactId !== expected.readerSummaryArtifactId ||
    !isDeepStrictEqual(value.planSha256s, expected.dryRunCanonicalSha256s) ||
    value.providerEvidenceSha256 !== expected.providerEvidenceSha256 ||
    !isHistoricBoundaries(value.boundaries)
  ) {
    throw claimError("historic claim does not match its exact authority");
  }
  if (
    "supersedes" in value &&
    value.supersedes !== null &&
    !isRecord(value.supersedes)
  ) {
    throw claimError("historic superseded predecessor is invalid");
  }
};

const verifyRetryPredecessor = (
  predecessor: Readonly<Record<string, unknown>>,
  states: readonly ReaderSummaryProductionRecoveryPredecessorState[],
): void => {
  if (
    !hasExactKeys(predecessor, [
      "readerSummaryJobId",
      "readerSummaryArtifactId",
      "terminalStatus",
    ]) ||
    !["RUNNING", "FAILED", "REJECTED"].includes(
      String(predecessor.terminalStatus),
    )
  ) {
    throw claimError("historic superseded predecessor is invalid");
  }
  const state = exactPredecessorState(
    states,
    "reader-summary-production-recovery-model-v2",
    predecessor.readerSummaryJobId,
  );
  if (
    state.jobStatus !== predecessor.terminalStatus ||
    state.jobReaderSummaryArtifactId !==
      predecessor.readerSummaryArtifactId
  ) {
    throw claimError("historic superseded predecessor diverged");
  }
};

const verifyFailedPredecessor = (
  predecessor: Readonly<Record<string, unknown>>,
  states: readonly ReaderSummaryProductionRecoveryPredecessorState[],
  claimScope: string,
  includesRejectionEvidence: boolean,
): void => {
  const keys = [
    "readerSummaryJobId",
    "readerSummaryArtifactId",
    "terminalStatus",
    "infrastructureFailure",
    "failureReasonSha256",
    ...(includesRejectionEvidence
      ? ["claimScope", "rejectionEvidenceSha256"]
      : []),
  ];
  if (
    !hasExactKeys(predecessor, keys) ||
    predecessor.readerSummaryArtifactId !== null ||
    predecessor.terminalStatus !== "FAILED" ||
    predecessor.infrastructureFailure !== "postgres_canonical_bounds" ||
    !isSha256(predecessor.failureReasonSha256) ||
    (includesRejectionEvidence &&
      (predecessor.claimScope !== claimScope ||
        !isSha256(predecessor.rejectionEvidenceSha256)))
  ) {
    throw claimError("historic superseded predecessor is invalid");
  }
  const state = exactPredecessorState(
    states,
    claimScope,
    predecessor.readerSummaryJobId,
  );
  if (
    state.jobStatus !== "FAILED" ||
    state.jobReaderSummaryArtifactId !== null ||
    sha256(state.jobFailureReason?.trim() ?? "") !==
      predecessor.failureReasonSha256
  ) {
    throw claimError("historic superseded predecessor diverged");
  }
  if (includesRejectionEvidence) {
    const payload = asRecord(state.responsePayload);
    const supersedes = asRecord(payload.supersedes);
    if (
      supersedes.rejectionEvidenceSha256 !==
      predecessor.rejectionEvidenceSha256
    ) {
      throw claimError("historic superseded predecessor diverged");
    }
  }
};

const verifyQualityPredecessor = (
  predecessor: Readonly<Record<string, unknown>>,
  states: readonly ReaderSummaryProductionRecoveryPredecessorState[],
  planCanonicalSha256: string,
): void => {
  const allowedScopes = [
    "reader-summary-production-recovery-model-v2",
    "reader-summary-production-recovery-model-retry-v1",
    "reader-summary-production-recovery-model-resume-v1",
  ];
  if (
    !hasExactKeys(predecessor, [
      "claimScope",
      "readerSummaryJobId",
      "readerSummaryArtifactId",
      "terminalStatus",
      "rejectionEvidenceSha256",
    ]) ||
    !allowedScopes.includes(String(predecessor.claimScope)) ||
    predecessor.terminalStatus !== "REJECTED" ||
    !isSha256(predecessor.rejectionEvidenceSha256) ||
    !isSha256(planCanonicalSha256)
  ) {
    throw claimError("historic superseded predecessor is invalid");
  }
  const state = exactPredecessorState(
    states,
    String(predecessor.claimScope),
    predecessor.readerSummaryJobId,
  );
  if (
    state.jobStatus !== "REJECTED" ||
    state.jobReaderSummaryArtifactId !==
      predecessor.readerSummaryArtifactId
  ) {
    throw claimError("historic superseded predecessor diverged");
  }
  const expectedEvidenceSha256 = sha256(
    JSON.stringify({
      claimScope: predecessor.claimScope,
      readerSummaryJobId: state.jobId,
      readerSummaryArtifactId: state.jobReaderSummaryArtifactId,
      terminalStatus: "REJECTED",
      failureReasonSha256: sha256(
        state.jobFailureReason?.trim() ?? "",
      ),
      planSha256: planCanonicalSha256,
    }),
  );
  if (
    predecessor.rejectionEvidenceSha256 !== expectedEvidenceSha256
  ) {
    throw claimError("historic superseded predecessor diverged");
  }
};

const exactPredecessorState = (
  states: readonly ReaderSummaryProductionRecoveryPredecessorState[],
  claimScope: string,
  jobId: unknown,
): ReaderSummaryProductionRecoveryPredecessorState => {
  const matches = states.filter(
    (state) =>
      state.claimScope === claimScope &&
      state.jobId === jobId,
  );
  if (matches.length !== 1 || matches[0] === undefined) {
    throw claimError("historic superseded predecessor is absent or ambiguous");
  }
  return matches[0];
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw claimError("historic superseded predecessor is invalid");
  }
  return value;
};

const assertClaimExpectation = (
  value: ReaderSummaryProductionRecoveryClaimExpectation,
): void => {
  if (
    !isExactText(value.recoveryIdentity) ||
    !isUuid(value.recoveryId) ||
    !isUuid(value.tenantId) ||
    !isUuid(value.workspaceId) ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(value.requestedUtcDate) ||
    !isUuid(value.readerSummaryJobId) ||
    !isUuid(value.readerSummaryArtifactId) ||
    !isSha256(value.planCanonicalSha256) ||
    value.dryRunCanonicalSha256s.length !== 2 ||
    value.dryRunCanonicalSha256s.some(
      (hash) => hash !== value.planCanonicalSha256,
    ) ||
    !isSha256(value.providerEvidenceSha256) ||
    !isGenerationProfile(value.generationProfile)
  ) {
    throw claimError("expectation is invalid");
  }
};

const isGenerationProfile = (
  value: unknown,
): value is ReaderSummaryProductionRecoveryGenerationProfile =>
  isRecord(value) &&
  hasExactKeys(value, [
    "modelVersion",
    "promptVersion",
    "rankingPolicyVersion",
  ]) &&
  [value.modelVersion, value.promptVersion, value.rankingPolicyVersion].every(
    isExactText,
  );

const isHistoricBoundaries = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }
  const keys = Object.keys(value).sort();
  const legacyKeys = [
    "modelCallPerformed",
    "recollectionPerformed",
    "stage",
  ].sort();
  const consumedKeys = [
    "leaseConsumed",
    "modelCallPerformed",
    "providerWritePerformed",
    "recollectionPerformed",
    "stage",
  ].sort();
  return (
    (isDeepStrictEqual(keys, legacyKeys) ||
      isDeepStrictEqual(keys, consumedKeys)) &&
    value.stage === "pre_model" &&
    value.modelCallPerformed === false &&
    value.recollectionPerformed === false &&
    (keys.length === legacyKeys.length ||
      (value.leaseConsumed === true &&
        value.providerWritePerformed === false))
  );
};

const isHistoricSchema = (
  value: string,
): value is (typeof readerSummaryProductionRecoveryHistoricClaimSchemas)[number] =>
  (
    readerSummaryProductionRecoveryHistoricClaimSchemas as readonly string[]
  ).includes(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean =>
  isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isExactText = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 256 &&
  value === value.trim() &&
  !/[\r\n]/u.test(value);

const exactString = (value: unknown): string => {
  if (typeof value !== "string") {
    throw claimError("claim identity is invalid");
  }
  return value;
};

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
    value,
  );

const assertUuid = (value: unknown, label: string): void => {
  if (!isUuid(value)) {
    throw claimError(`${label} is invalid`);
  }
};

const isSha256 = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);

const assertSha256 = (value: unknown, label: string): void => {
  if (!isSha256(value)) {
    throw claimError(`${label} SHA-256 is invalid`);
  }
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const claimError = (reason: string): Error =>
  new Error(`Reader summary production recovery ${reason}`);
