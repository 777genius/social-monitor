import type {
  ReaderSummaryArtifact,
  ReaderSummaryArtifactProps,
  ReaderSummaryConfidence,
  ReaderSummaryContextArtifact,
  ReaderSummaryContent,
  ReaderSummaryPeriod,
  ReaderInterestSection,
  ReaderSummaryTopicMap,
  StoryCluster,
  TopRead,
} from "../../domain";
import { buildReaderSummary, emptyReaderSummaryTopicMap } from "../../domain";
import type { ReaderSummaryFreshness } from "../../ports";
import type { ReaderSummaryCollectedFeedItemCoverage } from "../../ports";
import {
  buildReaderSummaryCoverageView,
  type ReaderSummaryCoverageView,
} from "./reader-summary-coverage-presenter";

export type {
  ReaderSummaryCoverageView,
  ReaderSummaryProviderCollectionHealthView,
  ReaderSummaryProviderCoverageView,
  ReaderSummaryQueryCoverageView,
  ReaderSummaryTopicCoverageView,
} from "./reader-summary-coverage-presenter";

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

export type ReaderSummaryTopReadView = Omit<TopRead, "publishedAt"> & {
  readonly publishedAt?: string;
};

export type ReaderSummaryInterestSectionView = Omit<
  ReaderInterestSection,
  "items"
> & {
  readonly items: readonly ReaderSummaryTopReadView[];
};

export type ReaderSummaryContentView = Omit<
  ReaderSummaryContent,
  "interestSections" | "topReads" | "selectedPosts"
> & {
  readonly mainTopics: readonly string[];
  readonly topicMap: ReaderSummaryTopicMap;
  readonly interestSections: readonly ReaderSummaryInterestSectionView[];
  readonly topReads: readonly ReaderSummaryTopReadView[];
  readonly selectedPosts: readonly ReaderSummaryTopReadView[];
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
    options.content ?? readerSummaryDomainContentForArtifactSnapshot(snapshot),
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
    coverage: buildReaderSummaryCoverageView(
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
): ReaderSummaryContent =>
  readerSummaryDomainContentForArtifactSnapshot(artifact.toSnapshot());

const readerSummaryDomainContentForArtifactSnapshot = (
  snapshot: ReaderSummaryArtifactProps,
): ReaderSummaryContent =>
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
  });

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

const sanitizeTopReadForPresentation = (
  item: TopRead,
): ReaderSummaryTopReadView => ({
  ...item,
  publishedAt: presentTopReadPublishedAt(item.publishedAt),
  matchedRules: publicReaderSummaryMatchedRules(item.matchedRules),
});

const presentTopReadPublishedAt = (
  value: TopRead["publishedAt"] | string | undefined,
): string | undefined => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
};

const isPublicMatchedRule = (rule: string): boolean => {
  const normalized = rule.trim().toLowerCase();

  return !technicalMatchedRulePrefixes.some((prefix) =>
    normalized.startsWith(prefix),
  );
};

export const publicReaderSummaryMatchedRules = (
  matchedRules: readonly string[],
): readonly string[] => matchedRules.filter(isPublicMatchedRule);

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
