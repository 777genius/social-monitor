import type {
  ReaderSummaryArtifact,
  ReaderSummaryArtifactProps,
  ReaderSummaryConfidence,
  ReaderSummaryContextArtifact,
  ReaderSummaryContent,
  ReaderSummaryPeriod,
  ReaderSummaryTopicMap,
  StoryCluster,
  TopRead,
} from "../../domain";
import { buildReaderSummary, emptyReaderSummaryTopicMap } from "../../domain";
import type { ReaderSummaryFreshness } from "../../ports";
import type { ReaderSummaryCollectedFeedItemCoverage } from "../../ports";

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

export type ReaderSummaryContentView = ReaderSummaryContent & {
  readonly mainTopics: readonly string[];
  readonly topicMap: ReaderSummaryTopicMap;
  readonly selectedPosts: readonly TopRead[];
};

export type ReaderSummaryContextArtifactView = Omit<
  ReaderSummaryContextArtifact,
  "generatedAt" | "period"
> & {
  readonly period: ReaderSummaryPeriodView;
  readonly generatedAt: string;
};

export type ReaderSummaryArtifactView = Omit<
  ReaderSummaryArtifactProps,
  "period" | "sourceWindow" | "storyClusters" | "contextArtifacts" | "content"
> & {
  readonly period: ReaderSummaryPeriodView;
  readonly content: ReaderSummaryContentView;
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
  readonly coverage: ReaderSummaryCoverageView;
  readonly freshness: ReaderSummaryFreshnessView;
};

export type ReaderSummaryPeriodView = {
  readonly cadence: ReaderSummaryPeriod["cadence"];
  readonly startedAt: string;
  readonly endedAt: string;
  readonly timezone: string;
  readonly periodKey: string;
};

export type ReaderSummaryCoverageView = {
  readonly collectedFeedItemCount?: number;
  readonly lowRelevanceFeedItemCount: number;
  readonly mutedFeedItemCount: number;
  readonly userRatedFeedItemCount: number;
  readonly selectedFeedItemCount: number;
  readonly storyClusterCount: number;
  readonly topReadCount: number;
  readonly citationCount: number;
  readonly providerCount: number;
  readonly interestCount: number;
  readonly duplicateFeedItemCount: number;
  readonly crossSourceClusterCount: number;
  readonly hasCrossProviderEvidence: boolean;
  readonly isSingleSource: boolean;
  readonly topProviderKeys: readonly string[];
  readonly topInterestIds: readonly string[];
  readonly windowStartedAt: string;
  readonly windowEndedAt: string;
  readonly freshnessStatus: ReaderSummaryFreshnessView["status"];
  readonly providerBreakdown: readonly ReaderSummaryProviderCoverageView[];
  readonly topicBreakdown: readonly ReaderSummaryTopicCoverageView[];
  readonly queryBreakdown: readonly ReaderSummaryQueryCoverageView[];
};

export type ReaderSummaryProviderCoverageView = {
  readonly providerKey: string;
  readonly collectedFeedItemCount?: number;
  readonly lowRelevanceFeedItemCount: number;
  readonly mutedFeedItemCount: number;
  readonly userRatedFeedItemCount: number;
  readonly selectedFeedItemCount: number;
  readonly topReadCount: number;
  readonly citationCount: number;
};

export type ReaderSummaryTopicCoverageView = {
  readonly topicKey: string;
  readonly topicLabel?: string;
  readonly collectedFeedItemCount: number;
  readonly lowRelevanceFeedItemCount: number;
  readonly mutedFeedItemCount: number;
  readonly userRatedFeedItemCount: number;
};

export type ReaderSummaryQueryCoverageView = {
  readonly query: string;
  readonly collectedFeedItemCount: number;
  readonly lowRelevanceFeedItemCount: number;
  readonly mutedFeedItemCount: number;
  readonly userRatedFeedItemCount: number;
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

export const presentReaderSummaryArtifact = (
  artifact: ReaderSummaryArtifact,
  freshness: ReaderSummaryFreshness,
  options: {
    readonly content?: ReaderSummaryContent;
    readonly collectedCoverage?: ReaderSummaryCollectedFeedItemCoverage;
  } = {},
): ReaderSummaryArtifactView => {
  const snapshot = artifact.toSnapshot();
  const content = withReaderSummaryContentDefaults(
    options.content ?? readerSummaryContentForArtifactSnapshot(snapshot),
    snapshot.confidence,
  );
  const freshnessView = presentFreshness(freshness);

  return {
    ...snapshot,
    period: presentReaderSummaryPeriod(snapshot.period),
    content,
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
      period: presentReaderSummaryPeriod(contextArtifact.period),
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
    coverage: buildCoverageView(
      snapshot,
      content,
      freshnessView,
      options.collectedCoverage,
    ),
    freshness: freshnessView,
  };
};

export const readerSummaryContentForArtifact = (
  artifact: ReaderSummaryArtifact,
): ReaderSummaryContentView =>
  readerSummaryContentForArtifactSnapshot(artifact.toSnapshot());

const readerSummaryContentForArtifactSnapshot = (
  snapshot: ReaderSummaryArtifactProps,
): ReaderSummaryContentView =>
  withReaderSummaryContentDefaults(
    snapshot.content ??
      buildReaderSummary({
        headline: snapshot.headline,
        executiveSummary: snapshot.executiveSummary,
        topStories: snapshot.topStories,
        interestHighlights: snapshot.interestHighlights,
        repeatedSignals: snapshot.repeatedSignals,
        risksAndUnknowns: snapshot.risksAndUnknowns,
        citationMap: snapshot.citationMap,
        storyClusters: snapshot.storyClusters,
        sourceWindow: snapshot.sourceWindow,
        qualityFlags: snapshot.qualityFlags,
        noSignalReason: snapshot.noSignalReason,
      }),
    snapshot.confidence,
  );

const withReaderSummaryContentDefaults = (
  content: ReaderSummaryContent,
  confidence: ReaderSummaryConfidence,
): ReaderSummaryContentView => {
  const topReads = content.topReads.map(sanitizeTopReadForPresentation);
  const selectedPostSource = content.selectedPosts ?? content.topReads;
  const openQuestions = readerSummaryOpenQuestionsForPresentation(
    content,
    confidence,
  );

  return {
    ...content,
    mainTopics: content.mainTopics ?? [],
    topicMap: content.topicMap ?? emptyReaderSummaryTopicMap(),
    openQuestions,
    topReads,
    selectedPosts: selectedPostSource.map(sanitizeTopReadForPresentation),
    interestSections: content.interestSections.map((section) => ({
      ...section,
      items: section.items.map(sanitizeTopReadForPresentation),
    })),
  };
};

const readerSummaryOpenQuestionsForPresentation = (
  content: ReaderSummaryContent,
  confidence: ReaderSummaryConfidence,
): readonly string[] => {
  if (content.openQuestions.length > 0) {
    return content.openQuestions;
  }

  const hasRisks =
    content.risks.length > 0 || content.reliabilityReport.risks.length > 0;
  if (confidence.level !== "low" && !hasRisks) {
    return content.openQuestions;
  }

  return ["Which claims need more confirmation before acting on this summary?"];
};

const sanitizeTopReadForPresentation = (item: TopRead): TopRead => ({
  ...item,
  matchedRules: item.matchedRules.filter(isPublicMatchedRule),
});

const isPublicMatchedRule = (rule: string): boolean => {
  const normalized = rule.trim().toLowerCase();

  return !technicalMatchedRulePrefixes.some((prefix) =>
    normalized.startsWith(prefix),
  );
};

const technicalMatchedRulePrefixes = [
  "interest:",
  "source-binding:",
  "sourcebinding:",
  "provider:",
  "rule:",
  "binding:",
  "scope:",
] as const;

const presentReaderSummaryPeriod = (
  period: ReaderSummaryPeriod,
): ReaderSummaryPeriodView => ({
  cadence: period.cadence,
  startedAt: period.startedAt.toISOString(),
  endedAt: period.endedAt.toISOString(),
  timezone: period.timezone,
  periodKey: period.periodKey,
});

const buildCoverageView = (
  snapshot: ReaderSummaryArtifactProps,
  content: ReaderSummaryContent,
  freshness: ReaderSummaryFreshnessView,
  collectedCoverage: ReaderSummaryCollectedFeedItemCoverage | undefined,
): ReaderSummaryCoverageView => {
  const interestIds = countBy(
    snapshot.storyClusters.flatMap((cluster) => cluster.interestIds),
  );
  const topProviderKeys = content.sourceMix
    .filter(
      (source) =>
        source.itemCount > 0 ||
        source.citationCount > 0 ||
        source.storyClusterCount > 0,
    )
    .sort((left, right) => {
      const citationDiff = right.citationCount - left.citationCount;
      if (citationDiff !== 0) {
        return citationDiff;
      }

      const itemDiff = right.itemCount - left.itemCount;
      if (itemDiff !== 0) {
        return itemDiff;
      }

      const storyDiff = right.storyClusterCount - left.storyClusterCount;
      if (storyDiff !== 0) {
        return storyDiff;
      }

      return left.providerKey.localeCompare(right.providerKey);
    })
    .slice(0, 5)
    .map((source) => source.providerKey);

  return {
    ...(collectedCoverage === undefined
      ? {}
      : { collectedFeedItemCount: collectedCoverage.collectedFeedItemCount }),
    lowRelevanceFeedItemCount:
      collectedCoverage?.lowRelevanceFeedItemCount ?? 0,
    mutedFeedItemCount: collectedCoverage?.mutedFeedItemCount ?? 0,
    userRatedFeedItemCount: collectedCoverage?.userRatedFeedItemCount ?? 0,
    selectedFeedItemCount: snapshot.sourceWindow.selectedFeedItemIds.length,
    storyClusterCount: snapshot.storyClusters.length,
    topReadCount: content.topReads.length,
    citationCount: snapshot.citationMap.length,
    providerCount: content.sourceMix.length,
    interestCount: interestIds.size,
    duplicateFeedItemCount: snapshot.storyClusters.reduce(
      (total, cluster) => total + cluster.duplicateFeedItemIds.length,
      0,
    ),
    crossSourceClusterCount: snapshot.storyClusters.filter(
      (cluster) => cluster.providerKeys.length > 1,
    ).length,
    hasCrossProviderEvidence: snapshot.storyClusters.some(
      (cluster) => cluster.providerKeys.length > 1,
    ),
    isSingleSource:
      content.sourceMix.length <= 1 ||
      content.sourceMix.every((source) => source.singleSourceOnly),
    topProviderKeys,
    topInterestIds: [...interestIds.entries()]
      .sort((left, right) => {
        const countDiff = right[1] - left[1];
        return countDiff === 0 ? left[0].localeCompare(right[0]) : countDiff;
      })
      .slice(0, 5)
      .map(([interestId]) => interestId),
    windowStartedAt: snapshot.sourceWindow.startedAt.toISOString(),
    windowEndedAt: snapshot.sourceWindow.endedAt.toISOString(),
    freshnessStatus: freshness.status,
    providerBreakdown: buildProviderBreakdown(content, collectedCoverage),
    topicBreakdown: collectedCoverage?.topicBreakdown ?? [],
    queryBreakdown: collectedCoverage?.queryBreakdown ?? [],
  };
};

const buildProviderBreakdown = (
  content: ReaderSummaryContent,
  collectedCoverage: ReaderSummaryCollectedFeedItemCoverage | undefined,
): readonly ReaderSummaryProviderCoverageView[] => {
  const providers = new Map<string, ReaderSummaryProviderCoverageView>();

  const upsert = (
    providerKey: string,
    patch: Partial<Omit<ReaderSummaryProviderCoverageView, "providerKey">>,
  ): void => {
    const key = providerKey.trim();
    if (key.length === 0) {
      return;
    }

    const current = providers.get(key) ?? {
      providerKey: key,
      selectedFeedItemCount: 0,
      topReadCount: 0,
      citationCount: 0,
      lowRelevanceFeedItemCount: 0,
      mutedFeedItemCount: 0,
      userRatedFeedItemCount: 0,
    };
    providers.set(key, { ...current, ...patch });
  };

  for (const source of content.sourceMix) {
    upsert(source.providerKey, {
      selectedFeedItemCount: source.itemCount,
      citationCount: source.citationCount,
    });
  }
  for (const read of content.topReads) {
    const key = read.providerKey.trim();
    if (key.length === 0) {
      continue;
    }
    const current = providers.get(key);
    upsert(key, { topReadCount: (current?.topReadCount ?? 0) + 1 });
  }
  for (const provider of collectedCoverage?.providerBreakdown ?? []) {
    upsert(provider.providerKey, {
      collectedFeedItemCount: provider.collectedFeedItemCount,
      lowRelevanceFeedItemCount: provider.lowRelevanceFeedItemCount,
      mutedFeedItemCount: provider.mutedFeedItemCount,
      userRatedFeedItemCount: provider.userRatedFeedItemCount,
    });
  }

  return [...providers.values()].sort((left, right) => {
    const collectedDiff =
      (right.collectedFeedItemCount ?? 0) - (left.collectedFeedItemCount ?? 0);
    if (collectedDiff !== 0) {
      return collectedDiff;
    }

    const selectedDiff =
      right.selectedFeedItemCount - left.selectedFeedItemCount;
    if (selectedDiff !== 0) {
      return selectedDiff;
    }

    return left.providerKey.localeCompare(right.providerKey);
  });
};

const countBy = (values: readonly string[]): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
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
