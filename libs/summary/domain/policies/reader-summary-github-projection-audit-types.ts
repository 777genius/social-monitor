import type { GitHubTrendingArchiveMetadata } from "@social-monitor/ingestion/domain";
import type { ArchivedGitHubProjectionBinding } from "./reader-summary-github-archived-projection";
import type { ReaderSummaryGitHubProjectionCollectionTelemetry } from "./reader-summary-github-projection-collection-window";

export type ReaderSummaryGitHubProjectionViolationCode =
  | "github_projection_unavailable"
  | "github_projection_day_invalid"
  | "github_projection_missing"
  | "github_projection_duplicate"
  | "github_projection_gapped"
  | "github_projection_ambiguous"
  | "github_projection_mixed"
  | "github_projection_stale"
  | "github_projection_identity_invalid";

export type ReaderSummaryGitHubProjectionItem = {
  readonly observationKind?: "archived";
  readonly archivedObservation?: GitHubTrendingArchiveMetadata;
  readonly sourceExternalId?: string;
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly providerKey: string;
  readonly metadataKind?: string;
  readonly scanJobId?: string;
  readonly canonicalUrl: string;
  readonly repositoryFullName?: string;
  readonly rank?: number;
  readonly starsGained?: number;
  readonly window?: string;
  readonly fetchStartedAt?: Date;
  readonly checkedAt?: Date;
  readonly publishedAt: Date;
  readonly observedAt: Date;
  readonly sourceContentHash: string;
  readonly sourceProviderContentHash: string;
};

export type ReaderSummaryGitHubProjectionBinding = {
  readonly selectedPostIndex: number;
  readonly rank: number;
  readonly citationId: string;
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly providerKey: string;
  readonly metadataKind: string;
  readonly scanJobId: string;
  readonly repositoryIdentity: string;
  readonly canonicalUrl: string;
  readonly starsGained: number;
  readonly fetchStartedAt: string;
  readonly publishedAt: string;
  readonly checkedAt: string;
  readonly observedAt: string;
  readonly sourceContentHash: string;
  readonly sourceProviderContentHash: string;
};

export type ReaderSummaryGitHubProjectionAudit = {
  readonly schemaVersion: "reader_summary.github_projection.v1";
  readonly status:
    | "not_applicable"
    | "not_required"
    | "verified"
    | "rejected";
  readonly requestedUtcDay: string;
  readonly pageCount: number;
  readonly scannedItemCount: number;
  readonly eligibleBindingIds: readonly string[];
  readonly observedThrough?: string;
  readonly projectionCheckedAt?: string;
  readonly telemetry?: ReaderSummaryGitHubProjectionCollectionTelemetry;
  readonly historicalOmission?: {
    readonly mode: "github_projection_unavailable_historical";
    readonly reason: string;
    readonly authorizedAt: string;
  };
  readonly archivedProjection?: {
    readonly observationKind: "archived";
    readonly bindings: readonly ArchivedGitHubProjectionBinding[];
  };
  readonly bindings: readonly ReaderSummaryGitHubProjectionBinding[];
  readonly violationCodes: readonly ReaderSummaryGitHubProjectionViolationCode[];
  readonly reasons: readonly string[];
};

export type ReaderSummaryGitHubProjectionEvaluation = {
  readonly audit: ReaderSummaryGitHubProjectionAudit;
  readonly findings: readonly {
    readonly code: ReaderSummaryGitHubProjectionViolationCode;
    readonly reason: string;
  }[];
};
