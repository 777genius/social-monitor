import type { RequestReaderSummaryResult } from "../../features/request-reader-summary/request-reader-summary.result";
import type { GetReaderSummaryJobStatusResult } from "../../features/get-reader-summary-job-status/get-reader-summary-job-status.result";
import type { GetReaderSummaryQualityRejectionResult } from "../../features/get-reader-summary-quality-rejection/get-reader-summary-quality-rejection.result";
import type {
  ReaderSummaryArtifactView as CanonicalReaderSummaryArtifactView,
  ReaderSummaryContextArtifactView as CanonicalReaderSummaryContextArtifactView,
  ReaderSummaryStoryClusterView as CanonicalReaderSummaryStoryClusterView,
} from "../../features/shared/reader-summary-artifact-presenter";
import type {
  ReaderSummaryArtifactResponseDto,
  ListReaderSummaryPeriodsResponseDto,
  ListReaderSummariesResponseDto,
} from "./reader-summary.dto";
import type {
  ReaderSummaryJobStatusResponseDto,
  ReaderSummaryQualityRejectionResponseDto,
} from "./reader-summary-job-status.dto";
import type { RequestReaderSummaryResponseDto } from "./request-reader-summary.dto";

export type ReaderSummaryCitationView = {
  readonly citationId: string;
  readonly label: string;
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly providerKey: string;
  readonly field: "title" | "bodyPreview" | "canonicalUrl";
  readonly canonicalUrl?: string;
};

export type ReaderSummaryStoryClusterView =
  CanonicalReaderSummaryStoryClusterView;

export type ReaderSummaryContextArtifactView =
  CanonicalReaderSummaryContextArtifactView;

type ReaderSummaryBriefView = Omit<
  CanonicalReaderSummaryArtifactView["content"],
  "narrativeSections"
> & {
  readonly narrativeSections: NonNullable<
    CanonicalReaderSummaryArtifactView["content"]["narrativeSections"]
  >;
};

export type ReaderSummaryArtifactView = Omit<
  CanonicalReaderSummaryArtifactView,
  "schemaVersion" | "readerSummaryId" | "content" | "lineage" | "freshness"
> & {
  readonly schemaVersion: "reader_summary.artifact.v1";
  readonly readerSummaryId: string;
  readonly readerBrief: ReaderSummaryBriefView;
  readonly lineage: Omit<
    CanonicalReaderSummaryArtifactView["lineage"],
    "schemaVersion"
  > & {
    readonly schemaVersion: "reader_summary.artifact.v1";
  };
  readonly freshness: ReaderSummaryFreshnessView;
};

export type ReaderSummaryFreshnessView =
  | {
      readonly status: "fresh";
      readonly checkedAt: string;
    }
  | {
      readonly status: "stale";
      readonly checkedAt: string;
      readonly staleMarkedAt: string;
      readonly reason:
        | "new_evidence_after_window"
        | "interest_bindings_changed"
        | "reader_summary_policy_changed"
        | "ranking_policy_changed";
      readonly newestFeedItemId?: string;
      readonly newestObservedAt?: string;
    };

export const readerSummaryArtifactViewFromReaderSummaryView = (
  view: CanonicalReaderSummaryArtifactView,
): ReaderSummaryArtifactView => {
  const {
    schemaVersion,
    readerSummaryId,
    content,
    lineage,
    freshness,
    ...rest
  } = view;
  void schemaVersion;

  return {
    ...rest,
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId: readerSummaryId,
    readerBrief: {
      ...content,
      narrativeSections: content.narrativeSections ?? [],
    },
    lineage: {
      ...lineage,
      schemaVersion: "reader_summary.artifact.v1",
    },
    freshness:
      freshness.status === "fresh"
        ? freshness
        : {
            ...freshness,
            reason:
              freshness.reason === "reader_summary_policy_changed"
                ? "reader_summary_policy_changed"
                : freshness.reason,
          },
  };
};

export const requestReaderSummaryResponseFromReaderSummary = (
  result: RequestReaderSummaryResult,
): RequestReaderSummaryResponseDto => ({
  readerSummaryJobId: result.readerSummaryJobId,
  period: result.period,
  status: result.status,
  created: result.created,
});

export const readerSummaryJobStatusFromReaderSummary = (
  result: GetReaderSummaryJobStatusResult,
): ReaderSummaryJobStatusResponseDto => ({
  readerSummaryJobId: result.readerSummaryJobId,
  scope: result.scope,
  period: result.period,
  status: result.status,
  requestedAt: result.requestedAt,
  startedAt: result.startedAt,
  completedAt: result.completedAt,
  failedAt: result.failedAt,
  readerSummaryId: result.readerSummaryId,
  failureReason: result.failureReason,
  failureClass: result.failureClass,
  timeline: result.timeline,
});

export const readerSummaryQualityRejectionFromReaderSummary = (
  result: GetReaderSummaryQualityRejectionResult,
): ReaderSummaryQualityRejectionResponseDto => ({
  readerSummaryJobId: result.readerSummaryJobId,
  readerSummaryId: result.readerSummaryId,
  scope: result.scope,
  period: {
    cadence: result.period.cadence,
    startedAt: result.period.startedAt.toISOString(),
    endedAt: result.period.endedAt.toISOString(),
    timezone: result.period.timezone,
    periodKey: result.period.periodKey,
  },
  headline: result.headline,
  failureClass: result.failureClass,
  canonicalScore: result.canonicalScore,
  shadow: result.shadow,
  reasonCodes: result.reasonCodes,
  reasons: result.reasons,
  violations: result.violations,
  topReads: result.topReads,
  citations: result.citations,
});

export const readerSummaryResponseFromReaderSummary = (
  view: CanonicalReaderSummaryArtifactView,
): ReaderSummaryArtifactResponseDto =>
  readerSummaryArtifactViewFromReaderSummaryView(view);

export const listReaderSummariesResponseFromReaderSummaries = (params: {
  readonly items: readonly CanonicalReaderSummaryArtifactView[];
  readonly nextCursor?: string;
}): ListReaderSummariesResponseDto => ({
  items: params.items.map(readerSummaryArtifactViewFromReaderSummaryView),
  nextCursor: params.nextCursor,
});

export const listReaderSummaryPeriodsResponseFromReaderSummaryPeriods =
  (params: {
    readonly items: readonly {
      readonly readerSummaryId: string;
      readonly tenantId: string;
      readonly workspaceId: string;
      readonly scope: {
        readonly type: "workspace" | "interest";
        readonly interestId?: string;
      };
      readonly period: {
        readonly cadence: "daily" | "weekly" | "monthly" | "custom";
        readonly startedAt: Date;
        readonly endedAt: Date;
        readonly timezone: string;
        readonly periodKey: string;
      };
      readonly headline: string;
      readonly status: "completed" | "no_signal";
      readonly userId?: string;
      readonly subscriptionId?: string;
    }[];
    readonly nextCursor?: string;
  }): ListReaderSummaryPeriodsResponseDto => ({
    items: params.items.map((item) => ({
      readerSummaryId: item.readerSummaryId,
      tenantId: item.tenantId,
      workspaceId: item.workspaceId,
      scope: item.scope,
      period: {
        cadence: item.period.cadence,
        startedAt: item.period.startedAt.toISOString(),
        endedAt: item.period.endedAt.toISOString(),
        timezone: item.period.timezone,
        periodKey: item.period.periodKey,
      },
      headline: item.headline,
      status: item.status,
      userId: item.userId,
      subscriptionId: item.subscriptionId,
    })),
    nextCursor: params.nextCursor,
  });
