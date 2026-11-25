import type { ReaderSummaryProductionRecoveryModelContract } from "./reader-summary-production-recovery-model-contract";

type ReaderSummaryProductionRecoveryGapDates = readonly [
  "2026-07-29",
  "2026-07-30",
  "2026-07-31",
];

export type ReaderSummaryProductionRecoveryGapDate =
  ReaderSummaryProductionRecoveryGapDates[number];

export type ReaderSummaryProductionRecoveryGapProviderKey =
  | "github-trending-page"
  | "hacker-news"
  | "reddit"
  | "rss"
  | "x-twitter";

export type ReaderSummaryProductionRecoveryGapEvidenceState =
  | "verified_existing"
  | "missing"
  | "unavailable";

export type ReaderSummaryProductionRecoveryGapEvidence = Readonly<{
  providerKey: ReaderSummaryProductionRecoveryGapProviderKey;
  feedItemId: string; sourceItemId: string; sourceBindingId: string;
  interestId: string; providerItemId: string; canonicalUrl: string;
  title: string; bodyPreview: string; sourceText: string;
  authorHandle?: string;
  sourceContentHash: string; sourceProviderContentHash: string | null;
  publishedAt: string; observedAt: string; createdAt: string;
  sourceObservedAt: string; canonicalIngestedAt: string;
  github?: Readonly<{
    resultId: string; scanJobId: string; scanAttemptNumber: number;
    repositoryIdentity: string; rank: number; checkedAt: string;
  }>;
}>;

export type ReaderSummaryProductionRecoveryGapCoverage = Readonly<{
  providerKey: ReaderSummaryProductionRecoveryGapProviderKey;
  evidenceState: ReaderSummaryProductionRecoveryGapEvidenceState;
  count: number;
  evidenceSha256: string;
}>;

export type ReaderSummaryProductionRecoveryGapDayAuthority = Readonly<{
  schemaVersion: "reader_summary.production_recovery_gap_day.v3";
  recoveryId: string; tenantId: string; workspaceId: string; identity: string;
  requestedUtcDate: ReaderSummaryProductionRecoveryGapDate;
  period: Readonly<{
    startedAt: string; endedAt: string; timezone: "UTC";
  }>;
  providerCoverage: readonly ReaderSummaryProductionRecoveryGapCoverage[];
  providerCounts: readonly ReaderSummaryProductionRecoveryGapCoverage[];
  providerEvidence: Readonly<
    Record<
      ReaderSummaryProductionRecoveryGapProviderKey,
      readonly ReaderSummaryProductionRecoveryGapEvidence[]
    >
  >;
  providerEvidenceSha256: string;
  dominance: Readonly<{
    providerKey: ReaderSummaryProductionRecoveryGapProviderKey | null;
    evidenceCount: number; totalEvidenceCount: number;
    ratioBasisPoints: number; maximumRatioBasisPoints: 7000;
    permitted: boolean;
  }>;
  modelEligibility: Readonly<{
    eligible: boolean; reasons: readonly string[];
    evaluatedAgainst: "immutable_db_evidence";
  }>;
  terminalOutcome: Readonly<{
    status: "PARTIAL" | "UNAVAILABLE"; reasons: readonly string[];
  }> | null;
  modelContract: ReaderSummaryProductionRecoveryModelContract;
  githubEvidence: Readonly<{
    schemaVersion: "reader_summary.production_recovery_github_evidence.v3";
    mode: "verified_existing" | "missing" | "unavailable";
    providerKey: "github-trending-page";
    requestedUtcDate: ReaderSummaryProductionRecoveryGapDate;
    evidenceCount: number; evidenceSha256: string;
    scanJobIds: readonly string[];
  }>;
  canonicalSha256: string;
  planSha256s: readonly [string, string];
}>;

export type ReaderSummaryProductionRecoveryGapAuthorityBinding = Readonly<{
  schemaVersion: "reader_summary.production_recovery_gap_authority.v3";
  recoveryId: string; identity: string; tenantId: string; workspaceId: string;
  requestedUtcDates: ReaderSummaryProductionRecoveryGapDates;
  canonicalSha256: string;
  dryRunCanonicalSha256s: readonly [string, string];
  lease: Readonly<{
    state: "CONSUMED"; issuedAt: string; consumedAt: string;
  }>;
  boundaries: Readonly<{
    stage: "pre_model"; modelCallPerformed: false;
    publicationPerformed: false; recollectionPerformed: false;
    providerWritePerformed: false;
    authorityCutoffAt: "2026-08-01T21:30:00.000Z";
  }>;
  modelContract: ReaderSummaryProductionRecoveryModelContract;
  days: readonly [
    ReaderSummaryProductionRecoveryGapDayAuthority,
    ReaderSummaryProductionRecoveryGapDayAuthority,
    ReaderSummaryProductionRecoveryGapDayAuthority,
  ];
}>;

export type ReaderSummaryProductionRecoveryGapScope = Readonly<{
  tenantId: string; workspaceId: string;
}>;

export type ReaderSummaryProductionRecoveryGapEvidenceRow = Readonly<{
  requestedUtcDate: string; providerKey: string;
  feedItemId: string; sourceItemId: string; sourceBindingId: string;
  interestId: string; providerItemId: string; canonicalUrl: string;
  title: string; bodyPreview: string; sourceText: string;
  authorHandle: string | null; sourceContentHash: string;
  sourceProviderContentHash: string | null;
  publishedAt: Date; observedAt: Date; createdAt: Date;
  sourceObservedAt: Date; sourceCreatedAt: Date;
  githubResultId: string | null; githubScanJobId: string | null;
  githubAttemptNumber: number | null; githubRepositoryIdentity: string | null;
  githubRank: number | null; githubCheckedAt: Date | null;
}>;
