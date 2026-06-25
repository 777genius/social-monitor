import type { RequestReaderSummaryResult } from "../../features/request-reader-summary/request-reader-summary.result";
import type { GetReaderSummaryJobStatusResult } from "../../features/get-reader-summary-job-status/get-reader-summary-job-status.result";
import type {
  ReaderSummaryArtifactView,
  ReaderSummaryContextArtifactView,
  ReaderSummaryStoryClusterView,
} from "../../features/shared/reader-summary-artifact-presenter";
import type {
  BriefingArtifactResponseDto,
  ListBriefingsResponseDto,
} from "./briefing.dto";
import type { BriefingJobStatusResponseDto } from "./briefing-job-status.dto";
import type { RequestBriefingResponseDto } from "./request-briefing.dto";

export type BriefingCitationView = {
  readonly citationId: string;
  readonly label: string;
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly providerKey: string;
  readonly field: "title" | "bodyPreview" | "canonicalUrl";
  readonly canonicalUrl?: string;
};

export type BriefingStoryClusterView = ReaderSummaryStoryClusterView;

export type BriefingContextArtifactView = ReaderSummaryContextArtifactView;

export type BriefingArtifactView = Omit<
  ReaderSummaryArtifactView,
  "schemaVersion" | "readerSummaryId" | "content" | "lineage" | "freshness"
> & {
  readonly schemaVersion: "briefing.artifact.v1";
  readonly briefingId: string;
  readonly readerBrief: ReaderSummaryArtifactView["content"];
  readonly lineage: Omit<
    ReaderSummaryArtifactView["lineage"],
    "schemaVersion"
  > & {
    readonly schemaVersion: "briefing.artifact.v1";
  };
  readonly freshness: BriefingFreshnessView;
};

export type BriefingFreshnessView =
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
        | "topic_bindings_changed"
        | "briefing_policy_changed"
        | "ranking_policy_changed";
      readonly newestFeedItemId?: string;
      readonly newestObservedAt?: string;
    };

export const briefingArtifactViewFromReaderSummaryView = (
  view: ReaderSummaryArtifactView,
): BriefingArtifactView => {
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
    schemaVersion: "briefing.artifact.v1",
    briefingId: readerSummaryId,
    readerBrief: content,
    lineage: {
      ...lineage,
      schemaVersion: "briefing.artifact.v1",
    },
    freshness:
      freshness.status === "fresh"
        ? freshness
        : {
            ...freshness,
            reason:
              freshness.reason === "reader_summary_policy_changed"
                ? "briefing_policy_changed"
                : freshness.reason,
          },
  };
};

export const requestBriefingResponseFromReaderSummary = (
  result: RequestReaderSummaryResult,
): RequestBriefingResponseDto => ({
  briefingJobId: result.readerSummaryJobId,
  status: result.status,
  created: result.created,
});

export const briefingJobStatusFromReaderSummary = (
  result: GetReaderSummaryJobStatusResult,
): BriefingJobStatusResponseDto => ({
  briefingJobId: result.readerSummaryJobId,
  scope: result.scope,
  status: result.status,
  requestedAt: result.requestedAt,
  startedAt: result.startedAt,
  completedAt: result.completedAt,
  failedAt: result.failedAt,
  briefingId: result.readerSummaryId,
  failureReason: result.failureReason,
  timeline: result.timeline.map((event) => ({
    ...event,
    message: event.message
      .replace(/Reader summary/g, "Briefing")
      .replace(/reader summary/g, "briefing"),
  })),
});

export const briefingResponseFromReaderSummary = (
  view: ReaderSummaryArtifactView,
): BriefingArtifactResponseDto =>
  briefingArtifactViewFromReaderSummaryView(view);

export const listBriefingsResponseFromReaderSummaries = (params: {
  readonly items: readonly ReaderSummaryArtifactView[];
  readonly nextCursor?: string;
}): ListBriefingsResponseDto => ({
  items: params.items.map(briefingArtifactViewFromReaderSummaryView),
  nextCursor: params.nextCursor,
});
