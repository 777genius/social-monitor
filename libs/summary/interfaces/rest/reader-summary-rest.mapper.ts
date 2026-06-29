import type { RequestReaderSummaryResult } from "../../features/request-reader-summary/request-reader-summary.result";
import type { GetReaderSummaryJobStatusResult } from "../../features/get-reader-summary-job-status/get-reader-summary-job-status.result";
import type {
  ReaderSummaryArtifactView as CanonicalReaderSummaryArtifactView,
  ReaderSummaryContextArtifactView as CanonicalReaderSummaryContextArtifactView,
  ReaderSummaryStoryClusterView as CanonicalReaderSummaryStoryClusterView,
} from "../../features/shared/reader-summary-artifact-presenter";
import type {
  ReaderSummaryArtifactResponseDto,
  ListReaderSummariesResponseDto,
} from "./reader-summary.dto";
import type { ReaderSummaryJobStatusResponseDto } from "./reader-summary-job-status.dto";
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

export type ReaderSummaryArtifactView = Omit<
  CanonicalReaderSummaryArtifactView,
  "schemaVersion" | "readerSummaryId" | "content" | "lineage" | "freshness"
> & {
  readonly schemaVersion: "reader_summary.artifact.v1";
  readonly readerSummaryId: string;
  readonly readerBrief: CanonicalReaderSummaryArtifactView["content"];
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
    readerBrief: content,
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
  timeline: result.timeline,
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
