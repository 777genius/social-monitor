export const readerSummaryProductionRecoveryProviderKeys = [
  "github-trending-page",
  "hacker-news",
  "reddit",
  "rss",
  "x-twitter",
] as const;

export type ReaderSummaryProductionRecoveryProviderKey =
  (typeof readerSummaryProductionRecoveryProviderKeys)[number];

export type ReaderSummaryProductionRecoveryProviderCount = Readonly<{
  providerKey: ReaderSummaryProductionRecoveryProviderKey;
  count: number;
}>;

export type ReaderSummaryProductionRecoveryEvidence = Readonly<{
  providerKey: ReaderSummaryProductionRecoveryProviderKey;
  feedItemId: string;
  sourceItemId: string;
  sourceBindingId: string;
  providerItemId: string;
  canonicalUrl: string;
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

export type ReaderSummaryProductionRecoveryGitHubEvidence =
  | Readonly<{
      schemaVersion:
        "reader_summary.production_recovery_github_evidence.v1";
      mode: "historical_unavailable";
      providerKey: "github-trending-page";
      requestedUtcDate: "2026-07-23";
      evidenceCount: 0;
      authorization: Readonly<{
        authorizationId:
          "reader_summary.production_recovery.github.2026-07-23.v1";
        authorizedAt: string;
        reason: string;
      }>;
    }>
  | Readonly<{
      schemaVersion:
        "reader_summary.production_recovery_github_evidence.v1";
      mode: "verified_existing";
      providerKey: "github-trending-page";
      requestedUtcDate: "2026-07-24";
      evidenceCount: 10;
      evidenceSha256: string;
      scanJobIds: readonly string[];
    }>;

export type ReaderSummaryProductionRecoveryDayAuthority = Readonly<{
  schemaVersion: "reader_summary.production_recovery_day.v1";
  identity: string;
  requestedUtcDate: "2026-07-23" | "2026-07-24";
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
}>;

export type ReaderSummaryProductionRecoveryAuthorityBinding = Readonly<{
  schemaVersion: "reader_summary.production_recovery_authority.v1";
  recoveryId: string;
  identity: string;
  tenantId: string;
  workspaceId: string;
  requestedUtcDates: readonly ["2026-07-23", "2026-07-24"];
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
