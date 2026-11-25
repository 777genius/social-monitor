import type { ReaderSummaryDailyModelJobIdentity } from "../domain/value-objects/reader-summary-daily-model-job";

export type ReaderSummaryDailyModelJobState =
  | "RESERVED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED_AMBIGUOUS";

export type ReaderSummaryDailyUsageSource =
  | "PROVIDER_REPORTED"
  | "ESTIMATED"
  | "UNAVAILABLE"
  | "HISTORICAL_INCOMPLETE";

export type ReaderSummaryDailyModelTelemetry = Readonly<{
  provider: string;
  model: string;
  reasoningEffort: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  usageSource: ReaderSummaryDailyUsageSource;
  durationMs: number | null;
}>;

export type ReaderSummaryDailySourceAuthority = Readonly<{
  requestedUtcDate: string;
  ingestionCutoff: string;
  canonicalBytes: Uint8Array;
  canonicalSha256: string;
}>;

export type ReaderSummaryDailyLease = Readonly<{
  owner: string;
  fencingToken: bigint;
  leasedAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
}>;

export type ReaderSummaryDailyExecutionWork = Readonly<{
  tenantId: string;
  workspaceId: string;
  requestedUtcDate: string;
  eligibleThrough: string;
  sourceAuthority: ReaderSummaryDailySourceAuthority;
  modelJob: ReaderSummaryDailyModelJobIdentity;
  modelJobState: ReaderSummaryDailyModelJobState;
  lease: ReaderSummaryDailyLease;
  completedResponseBytes?: Uint8Array;
  completedReceiptBytes?: Uint8Array;
}>;

export type ReaderSummaryDailyCanonicalPublication = Readonly<{
  readerSummaryJobId: string;
  readerSummaryArtifactId: string;
  publicationId: string;
  reportSha256: string;
  proofSha256: string;
  weeklyEvidenceSha256: string;
  publicEvidenceBytes: Uint8Array;
  publicEvidenceSha256: string;
  publicFrontendBytes: Uint8Array;
  publicFrontendSha256: string;
}>;

export type ReaderSummaryDailyClaimResult =
  | Readonly<{ kind: "claimed"; work: ReaderSummaryDailyExecutionWork }>
  | Readonly<{ kind: "caught_up"; eligibleThrough: string }>
  | Readonly<{
      kind: "recovery_required";
      nextUnresolvedUtcDate: string;
      eligibleThrough: string;
    }>
  | Readonly<{ kind: "leased"; requestedUtcDate: string }>
  | Readonly<{ kind: "failed_ambiguous"; requestedUtcDate: string }>;

export type ReaderSummaryDailyExecutionCursorClaim = Readonly<{
  tenantId: string;
  workspaceId: string;
  workerId: string;
  firstUnresolvedUtcDate: string;
  invokedAt: string;
}>;

export interface ReaderSummaryDailyExecutionCursorPort {
  claimNext(
    input: ReaderSummaryDailyExecutionCursorClaim,
  ): Promise<ReaderSummaryDailyClaimResult>;
  renewLease(input: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly workerId: string;
    readonly requestedUtcDate: string;
    readonly fencingToken: bigint;
    readonly renewedAt: string;
  }): Promise<ReaderSummaryDailyLease>;
  markRunning(input: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly workerId: string;
    readonly requestedUtcDate: string;
    readonly fencingToken: bigint;
    readonly startedAt: string;
  }): Promise<void>;
  complete(input: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly workerId: string;
    readonly requestedUtcDate: string;
    readonly fencingToken: bigint;
    readonly completedAt: string;
    readonly responseBytes: Uint8Array;
    readonly responseSha256: string;
    readonly attestation: Readonly<Record<string, unknown>>;
    readonly attestationBytes: Uint8Array;
    readonly attestationSha256: string;
    readonly receiptBytes: Uint8Array;
    readonly receiptSha256: string;
    readonly modelTelemetry: ReaderSummaryDailyModelTelemetry;
  }): Promise<void>;
  finalizePublication(input: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly workerId: string;
    readonly requestedUtcDate: string;
    readonly fencingToken: bigint;
    readonly finalizedAt: string;
    readonly publication: ReaderSummaryDailyCanonicalPublication;
  }): Promise<void>;
}
