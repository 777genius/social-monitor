export const readerSummaryProductionRecoveryProviderKeys = [
  "github-trending-page",
  "hacker-news",
  "reddit",
  "rss",
  "x-twitter",
] as const;

export const readerSummaryProductionRecoveryTenantId =
  "00000000-0000-7000-8000-000000000901";
export const readerSummaryProductionRecoveryWorkspaceId =
  "00000000-0000-7000-8000-000000000902";

export const readerSummaryProductionRecoveryRequestedUtcDates = [
  "2026-07-23",
  "2026-07-24",
  "2026-07-25",
  "2026-07-26",
  "2026-07-27",
  "2026-07-28",
] as const;

export type ReaderSummaryProductionRecoveryProviderKey =
  (typeof readerSummaryProductionRecoveryProviderKeys)[number];

export type ReaderSummaryProductionRecoveryRequestedUtcDate =
  (typeof readerSummaryProductionRecoveryRequestedUtcDates)[number];

export type ReaderSummaryProductionRecoveryEvidenceState =
  | "verified_existing"
  | "partial_existing"
  | "historical_unavailable";

export const readerSummaryProductionRecoveryEvidenceState = (
  date: ReaderSummaryProductionRecoveryRequestedUtcDate,
  providerKey: ReaderSummaryProductionRecoveryProviderKey,
): ReaderSummaryProductionRecoveryEvidenceState => {
  if (
    (date === "2026-07-23" && providerKey === "github-trending-page") ||
    (date === "2026-07-28" &&
      (providerKey === "github-trending-page" ||
        providerKey === "hacker-news" ||
        providerKey === "reddit"))
  ) {
    return "historical_unavailable";
  }
  if (
    date === "2026-07-28" &&
    (providerKey === "rss" || providerKey === "x-twitter")
  ) {
    return "partial_existing";
  }
  return "verified_existing";
};

export type ReaderSummaryProductionRecoveryProviderCount = Readonly<{
  providerKey: ReaderSummaryProductionRecoveryProviderKey;
  count: number;
  evidenceState: ReaderSummaryProductionRecoveryEvidenceState;
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

export type ReaderSummaryProductionRecoveryGitHubEvidence =
  | Readonly<{
      schemaVersion: "reader_summary.production_recovery_github_evidence.v2";
      mode: "historical_unavailable";
      providerKey: "github-trending-page";
      requestedUtcDate: "2026-07-23" | "2026-07-28";
      evidenceCount: 0;
      authorization: Readonly<{
        authorizationId:
          | "reader_summary.production_recovery.github.2026-07-23.v2"
          | "reader_summary.production_recovery.github.2026-07-28.v2";
        authorizedAt: string;
        reason: string;
      }>;
    }>
  | Readonly<{
      schemaVersion: "reader_summary.production_recovery_github_evidence.v2";
      mode: "verified_existing";
      providerKey: "github-trending-page";
      requestedUtcDate: Exclude<
        ReaderSummaryProductionRecoveryRequestedUtcDate,
        "2026-07-23" | "2026-07-28"
      >;
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
