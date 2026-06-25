import type {
  ReaderSummaryArtifact,
  ReaderSummaryArtifactProps,
  ReaderSummaryContextArtifact,
  ReaderSummaryContent,
  StoryCluster,
} from "../../domain";
import { buildReaderSummary } from "../../domain";
import type { ReaderSummaryFreshness } from "../../ports";

export type ReaderSummaryCitationView = {
  readonly citationId: string;
  readonly label: string;
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly providerKey: string;
  readonly field: "title" | "bodyPreview" | "canonicalUrl";
  readonly canonicalUrl?: string;
};

export type ReaderSummaryStoryClusterView = Omit<
  StoryCluster,
  "observedAtRange"
> & {
  readonly observedAtRange: {
    readonly startedAt: string;
    readonly endedAt: string;
  };
};

export type ReaderSummaryContextArtifactView = Omit<
  ReaderSummaryContextArtifact,
  "generatedAt"
> & {
  readonly generatedAt: string;
};

export type ReaderSummaryArtifactView = Omit<
  ReaderSummaryArtifactProps,
  "sourceWindow" | "storyClusters" | "contextArtifacts" | "content"
> & {
  readonly content: ReaderSummaryContent;
  readonly sourceWindow: Omit<
    ReaderSummaryArtifactProps["sourceWindow"],
    "startedAt" | "endedAt"
  > & {
    readonly startedAt: string;
    readonly endedAt: string;
  };
  readonly storyClusters: readonly ReaderSummaryStoryClusterView[];
  readonly contextArtifacts: readonly ReaderSummaryContextArtifactView[];
  readonly citations: readonly ReaderSummaryCitationView[];
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
        | "topic_bindings_changed"
        | "reader_summary_policy_changed"
        | "ranking_policy_changed";
      readonly newestFeedItemId?: string;
      readonly newestObservedAt?: string;
    };

export const presentReaderSummaryArtifact = (
  artifact: ReaderSummaryArtifact,
  freshness: ReaderSummaryFreshness,
): ReaderSummaryArtifactView => {
  const snapshot = artifact.toSnapshot();

  return {
    ...snapshot,
    content:
      snapshot.content ??
      buildReaderSummary({
        headline: snapshot.headline,
        executiveSummary: snapshot.executiveSummary,
        topStories: snapshot.topStories,
        topicHighlights: snapshot.topicHighlights,
        repeatedSignals: snapshot.repeatedSignals,
        risksAndUnknowns: snapshot.risksAndUnknowns,
        citationMap: snapshot.citationMap,
        storyClusters: snapshot.storyClusters,
        qualityFlags: snapshot.qualityFlags,
        noSignalReason: snapshot.noSignalReason,
      }),
    sourceWindow: {
      ...snapshot.sourceWindow,
      startedAt: snapshot.sourceWindow.startedAt.toISOString(),
      endedAt: snapshot.sourceWindow.endedAt.toISOString(),
    },
    storyClusters: snapshot.storyClusters.map((cluster) => ({
      ...cluster,
      observedAtRange: {
        startedAt: cluster.observedAtRange.startedAt.toISOString(),
        endedAt: cluster.observedAtRange.endedAt.toISOString(),
      },
    })),
    contextArtifacts: snapshot.contextArtifacts.map((contextArtifact) => ({
      ...contextArtifact,
      generatedAt: contextArtifact.generatedAt.toISOString(),
    })),
    citations: snapshot.citationMap.map((citation, index) => ({
      citationId: citation.citationId,
      label: `[${index + 1}]`,
      feedItemId: citation.feedItemId,
      sourceItemId: citation.sourceItemId,
      providerKey: citation.providerKey,
      field: citation.field,
      canonicalUrl: citation.canonicalUrl,
    })),
    freshness: presentFreshness(freshness),
  };
};

const presentFreshness = (
  freshness: ReaderSummaryFreshness,
): ReaderSummaryFreshnessView => {
  if (freshness.status === "fresh") {
    return {
      status: "fresh",
      checkedAt: freshness.checkedAt.toISOString(),
    };
  }

  return {
    status: "stale",
    checkedAt: freshness.checkedAt.toISOString(),
    staleMarkedAt: freshness.staleMarkedAt.toISOString(),
    reason: freshness.reason,
    newestFeedItemId: freshness.newestFeedItemId,
    newestObservedAt: freshness.newestObservedAt?.toISOString(),
  };
};
