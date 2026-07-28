export const readerSummaryProductionRecoveryProviderKeys = [
  "github-trending-page",
  "hacker-news",
  "reddit",
  "rss",
  "x-twitter",
] as const;

export const readerSummaryProductionRecoveryRequestedUtcDates = [
  "2026-07-24",
  "2026-07-25",
  "2026-07-26",
  "2026-07-27",
] as const;

export type ReaderSummaryProductionRecoveryProviderKey =
  (typeof readerSummaryProductionRecoveryProviderKeys)[number];

export type ReaderSummaryProductionRecoveryRequestedUtcDate =
  (typeof readerSummaryProductionRecoveryRequestedUtcDates)[number];

export type ReaderSummaryProductionRecoveryProviderCount = Readonly<{
  providerKey: ReaderSummaryProductionRecoveryProviderKey;
  count: number;
}>;

export type ReaderSummaryProductionRecoveryEvidence = Readonly<{
  providerKey: ReaderSummaryProductionRecoveryProviderKey;
  feedItemId: string;
  sourceItemId: string;
  sourceBindingId: string;
  interestId: string;
  providerItemId: string;
  canonicalUrl: string;
  title: string;
  bodyPreview: string;
  sourceText: string;
  authorHandle?: string;
  sourceContentHash: string;
  sourceProviderContentHash: string | null;
  publishedAt: string;
  observedAt: string;
  github?: Readonly<{
    resultId: string;
    scanJobId: string;
    scanAttemptNumber: number;
    repositoryIdentity: string;
    rank: number;
    checkedAt: string;
  }>;
}>;

export type ReaderSummaryProductionRecoveryGitHubEvidence = Readonly<{
  schemaVersion: "reader_summary.production_recovery_github_evidence.v2";
  mode: "verified_existing";
  providerKey: "github-trending-page";
  requestedUtcDate: ReaderSummaryProductionRecoveryRequestedUtcDate;
  evidenceCount: number;
  evidenceSha256: string;
  scanJobIds: readonly string[];
}>;

export type ReaderSummaryProductionRecoveryDayAuthority = Readonly<{
  schemaVersion: "reader_summary.production_recovery_day.v2";
  identity: string;
  requestedUtcDate: ReaderSummaryProductionRecoveryRequestedUtcDate;
  period: Readonly<{
    startedAt: string;
    endedAt: string;
    timezone: "UTC";
  }>;
  providerCounts: readonly ReaderSummaryProductionRecoveryProviderCount[];
  providerEvidence: Readonly<
    Record<
      ReaderSummaryProductionRecoveryProviderKey,
      readonly ReaderSummaryProductionRecoveryEvidence[]
    >
  >;
  providerEvidenceSha256: string;
  githubEvidence: ReaderSummaryProductionRecoveryGitHubEvidence;
  canonicalSha256: string;
  planSha256s: readonly [string, string];
}>;

export type ReaderSummaryProductionRecoveryAuthorityBinding = Readonly<{
  schemaVersion: "reader_summary.production_recovery_authority.v2";
  recoveryId: string;
  identity: string;
  tenantId: string;
  workspaceId: string;
  requestedUtcDates: typeof readerSummaryProductionRecoveryRequestedUtcDates;
  canonicalSha256: string;
  dryRunCanonicalSha256s: readonly [string, string];
  lease: Readonly<{
    state: "CONSUMED";
    issuedAt: string;
    consumedAt: string;
  }>;
  boundaries: Readonly<{
    stage: "pre_model";
    modelCallPerformed: false;
    publicationPerformed: false;
    recollectionPerformed: false;
  }>;
  days: readonly [
    ReaderSummaryProductionRecoveryDayAuthority,
    ReaderSummaryProductionRecoveryDayAuthority,
    ReaderSummaryProductionRecoveryDayAuthority,
    ReaderSummaryProductionRecoveryDayAuthority,
  ];
}>;

declare const readerSummaryProductionRecoveryAuthorityHandleBrand:
  unique symbol;

export type ReaderSummaryProductionRecoveryAuthorityHandle = Readonly<{
  readonly [readerSummaryProductionRecoveryAuthorityHandleBrand]:
    "reader_summary.production_recovery_authority.opaque_handle";
}>;

export type PrepareReaderSummaryProductionRecoveryResult = Readonly<{
  outcome: "prepared" | "replayed";
  authority: ReaderSummaryProductionRecoveryAuthorityHandle;
}>;

export interface ReaderSummaryProductionRecoveryAuthorityPort {
  prepare(): Promise<PrepareReaderSummaryProductionRecoveryResult>;
  readVerifiedBinding(
    authority: ReaderSummaryProductionRecoveryAuthorityHandle,
  ): ReaderSummaryProductionRecoveryAuthorityBinding;
}
