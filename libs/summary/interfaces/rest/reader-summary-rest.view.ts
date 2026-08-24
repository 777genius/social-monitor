import type {
  ReaderSummaryArtifactView as CanonicalReaderSummaryArtifactView,
  ReaderSummaryContextArtifactView as CanonicalReaderSummaryContextArtifactView,
  ReaderSummaryStoryClusterView as CanonicalReaderSummaryStoryClusterView,
} from "../../features/shared/reader-summary-artifact-presenter";
import type { ReaderSummaryReaderItemDto } from "./reader-summary-reader.dto";

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
  "narrativeSections" | "topReads" | "selectedPosts" | "interestSections"
> & {
  readonly narrativeSections: NonNullable<
    CanonicalReaderSummaryArtifactView["content"]["narrativeSections"]
  >;
  readonly topReads: readonly ReaderSummaryReaderItemDto[];
  readonly selectedPosts: readonly ReaderSummaryReaderItemDto[];
  readonly interestSections: readonly (Omit<
    CanonicalReaderSummaryArtifactView["content"]["interestSections"][number],
    "items"
  > & { readonly items: readonly ReaderSummaryReaderItemDto[] })[];
};

export type ReaderSummaryArtifactView = Omit<
  CanonicalReaderSummaryArtifactView,
  | "schemaVersion"
  | "readerSummaryId"
  | "content"
  | "lineage"
  | "freshness"
  | "relatedTopicRelations"
  | "contextArtifacts"
  | "promotionAttestations"
  | "promotionBoardState"
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
