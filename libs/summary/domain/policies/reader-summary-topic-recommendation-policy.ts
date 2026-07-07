import type { ReaderSummaryArtifactProps } from "../entities/reader-summary-artifact";
import type {
  ReaderSummaryTopicRecommendation,
  ReaderSummaryTopicTier,
} from "../entities/reader-summary-topic-recommendation";
import type { ReaderSummaryTopicMapNode } from "../entities/reader-summary-topic-map";
import type { TopRead } from "../entities/top-read";
import { uniqueNonEmpty } from "../value-objects/summary-text";
import {
  isUsableReaderSummaryTopicRecommendationLabel,
  normalizeReaderSummaryTopicRecommendationLabel as normalizeTopicLabel,
  readerSummaryTopicRecommendationLabel,
  readerSummaryTopicRecommendationQueryTokens,
} from "./reader-summary-topic-recommendation-label";

export type BuildReaderSummaryTopicRecommendationsParams = {
  readonly artifacts: readonly ReaderSummaryArtifactProps[];
  readonly windowDays: number;
  readonly limit: number;
};

type TopicSignal = {
  readonly readerSummaryId: string;
  readonly label: string;
  readonly providerKeys: readonly string[];
  readonly interestIds: readonly string[];
  readonly citationIds: readonly string[];
  readonly selectedEvidenceCount: number;
  readonly topReadCount: number;
  readonly duplicateCount: number;
  readonly signalScore: number;
  readonly usefulSummary: boolean;
};

type TopicAggregate = {
  readonly label: string;
  readonly normalizedLabel: string;
  readonly signals: readonly TopicSignal[];
};

const coreTopicNeedles = [
  "artificial intelligence",
  "ai agent",
  "ai model",
  "llm",
  "claude",
  "openai",
  "coding agent",
  "agent tooling",
  "developer tool",
  "mcp",
  "model context protocol",
] as const;

const adjacentTopicNeedles = [
  "security",
  "cyber",
  "startup",
  "infra",
  "infrastructure",
  "open source",
  "python",
  "rust",
  "golang",
  "go language",
  "javascript",
  "typescript",
  "flutter",
  "dart",
  "rag",
  "langchain",
  "local ai",
  "open model",
] as const;

export const buildReaderSummaryTopicRecommendations = (
  params: BuildReaderSummaryTopicRecommendationsParams,
): readonly ReaderSummaryTopicRecommendation[] => {
  const aggregates = aggregateTopicSignals(params.artifacts);

  return aggregates
    .map((aggregate) =>
      recommendationForAggregate({
        aggregate,
        windowDays: params.windowDays,
      }),
    )
    .filter(
      (
        recommendation,
      ): recommendation is ReaderSummaryTopicRecommendation =>
        recommendation !== null,
    )
    .sort(
      (left, right) =>
        right.confidenceScore - left.confidenceScore ||
        right.metrics.selectedEvidenceCount -
          left.metrics.selectedEvidenceCount,
    )
    .slice(0, params.limit);
};

const aggregateTopicSignals = (
  artifacts: readonly ReaderSummaryArtifactProps[],
): readonly TopicAggregate[] => {
  const byLabel = new Map<string, TopicSignal[]>();

  for (const artifact of artifacts) {
    for (const signal of topicSignalsForArtifact(artifact)) {
      const normalizedLabel = normalizeTopicLabel(signal.label);
      if (
        !isUsableReaderSummaryTopicRecommendationLabel(signal.label) ||
        topicTier(normalizedLabel) === "core"
      ) {
        continue;
      }

      byLabel.set(normalizedLabel, [
        ...(byLabel.get(normalizedLabel) ?? []),
        signal,
      ]);
    }
  }

  return [...byLabel.entries()].map(([normalizedLabel, signals]) => ({
    normalizedLabel,
    label: preferredLabel(signals),
    signals,
  }));
};

const topicSignalsForArtifact = (
  artifact: ReaderSummaryArtifactProps,
): readonly TopicSignal[] => {
  const content = artifact.content;
  const topicNodes = content?.topicMap?.nodes ?? [];
  const topReads = content?.topReads ?? [];

  if (topicNodes.length > 0) {
    return topicNodes.map((node) =>
      signalForTopicNode({
        artifact,
        node,
        topReads,
      }),
    );
  }

  return (content?.mainTopics ?? []).map((label) =>
    fallbackSignalForLabel({
      artifact,
      label,
      topReads,
    }),
  );
};

const signalForTopicNode = (params: {
  readonly artifact: ReaderSummaryArtifactProps;
  readonly node: ReaderSummaryTopicMapNode;
  readonly topReads: readonly TopRead[];
}): TopicSignal => {
  const storyClusters = params.artifact.storyClusters.filter((cluster) =>
    params.node.storyClusterIds.includes(cluster.id),
  );
  const duplicateCount = storyClusters.reduce(
    (total, cluster) => total + cluster.duplicateFeedItemIds.length,
    0,
  );
  const clusterScores = storyClusters
    .map((cluster) => cluster.score)
    .filter((score) => Number.isFinite(score));

  return {
    readerSummaryId: params.artifact.readerSummaryId,
    label: readerSummaryTopicRecommendationLabel({
      label: params.node.label,
      keywords: params.node.keywords,
    }),
    providerKeys: params.node.providerKeys,
    interestIds: params.node.interestIds,
    citationIds: params.node.citationIds,
    selectedEvidenceCount: params.node.evidenceCount,
    topReadCount: topReadCountForCitationIds(
      params.topReads,
      params.node.citationIds,
    ),
    duplicateCount,
    signalScore:
      average(clusterScores) || Math.max(0, params.node.popularityScore / 40),
    usefulSummary: params.artifact.content?.qualityState.status === "ready",
  };
};

const fallbackSignalForLabel = (params: {
  readonly artifact: ReaderSummaryArtifactProps;
  readonly label: string;
  readonly topReads: readonly TopRead[];
}): TopicSignal => {
  const label = readerSummaryTopicRecommendationLabel({
    label: params.label,
    keywords: [],
  });
  const normalizedLabel = normalizeTopicLabel(label);
  const queryTokens = readerSummaryTopicRecommendationQueryTokens(label);
  const matchedTopReads = params.topReads.filter((read) => {
    const normalizedTitle = normalizeTopicLabel(read.title);

    return (
      normalizedTitle.includes(normalizedLabel) ||
      (queryTokens.length > 0 &&
        queryTokens.every((token) => normalizedTitle.includes(token)))
    );
  });

  return {
    readerSummaryId: params.artifact.readerSummaryId,
    label,
    providerKeys: uniqueNonEmpty(
      matchedTopReads.flatMap((read) => [
        read.providerKey,
        ...read.confirmedProviderKeys,
      ]),
    ),
    interestIds: uniqueNonEmpty(
      matchedTopReads.flatMap((read) => read.matchedInterestIds),
    ),
    citationIds: uniqueNonEmpty(
      matchedTopReads.flatMap((read) => read.citationIds),
    ),
    selectedEvidenceCount: Math.max(1, matchedTopReads.length),
    topReadCount: matchedTopReads.length,
    duplicateCount: 0,
    signalScore: average(matchedTopReads.map((read) => read.signalScore)),
    usefulSummary: params.artifact.content?.qualityState.status === "ready",
  };
};

const recommendationForAggregate = (params: {
  readonly aggregate: TopicAggregate;
  readonly windowDays: number;
}): ReaderSummaryTopicRecommendation | null => {
  const metrics = metricsForAggregate(params.aggregate);
  const confidenceScore = recommendationConfidence(metrics, params.windowDays);
  const currentTier = topicTier(params.aggregate.normalizedLabel);
  const kind =
    confidenceScore >= 0.68 && metrics.selectedEvidenceCount >= 3
      ? "promote_adjacent_topic"
      : "observe_adjacent_topic";

  if (kind === "observe_adjacent_topic" && confidenceScore < 0.48) {
    return null;
  }

  return {
    recommendationId: `topic-rec:${params.windowDays}:${params.aggregate.normalizedLabel}`,
    kind,
    decisionStatus: "pending",
    topicLabel: params.aggregate.label,
    currentTier,
    suggestedTier: kind === "promote_adjacent_topic" ? "core" : currentTier,
    confidenceScore,
    rationale: recommendationRationale(kind, metrics),
    windowDays: params.windowDays,
    metrics,
    providerKeys: uniqueNonEmpty(
      params.aggregate.signals.flatMap((signal) => signal.providerKeys),
    ),
    interestIds: uniqueNonEmpty(
      params.aggregate.signals.flatMap((signal) => signal.interestIds),
    ),
    evidenceReaderSummaryIds: uniqueNonEmpty(
      params.aggregate.signals.map((signal) => signal.readerSummaryId),
    ),
    reasons: recommendationReasons(metrics),
  };
};

const metricsForAggregate = (
  aggregate: TopicAggregate,
): ReaderSummaryTopicRecommendation["metrics"] => {
  const citationIds = uniqueNonEmpty(
    aggregate.signals.flatMap((signal) => signal.citationIds),
  );
  const selectedEvidenceCount = sum(
    aggregate.signals.map((signal) => signal.selectedEvidenceCount),
  );
  const duplicateCount = sum(
    aggregate.signals.map((signal) => signal.duplicateCount),
  );
  const topReadCount = sum(aggregate.signals.map((signal) => signal.topReadCount));
  const lowRelevanceSignalCount = aggregate.signals.filter(
    (signal) => signal.signalScore > 0 && signal.signalScore < 1,
  ).length;

  return {
    collectedPostCount: selectedEvidenceCount,
    summaryCount: uniqueNonEmpty(
      aggregate.signals.map((signal) => signal.readerSummaryId),
    ).length,
    selectedEvidenceCount,
    topReadCount,
    citationCount: citationIds.length,
    crossSourceSummaryCount: aggregate.signals.filter(
      (signal) => signal.providerKeys.length > 1,
    ).length,
    usefulSummaryCount: aggregate.signals.filter(
      (signal) => signal.usefulSummary,
    ).length,
    duplicateEvidenceCount: duplicateCount,
    lowRelevanceSignalCount,
    mutedSignalCount: 0,
    userRatedSignalCount: 0,
    selectionRate: rate(selectedEvidenceCount, selectedEvidenceCount),
    citationRate: rate(citationIds.length, selectedEvidenceCount),
    topReadRate: rate(topReadCount, selectedEvidenceCount),
    duplicateRate:
      selectedEvidenceCount === 0 ? 0 : duplicateCount / selectedEvidenceCount,
    noiseRate: 0,
    averageSignalScore: roundNumber(
      average(aggregate.signals.map((signal) => signal.signalScore)),
    ),
  };
};

const recommendationConfidence = (
  metrics: ReaderSummaryTopicRecommendation["metrics"],
  windowDays: number,
): number => {
  const consistency = Math.min(1, metrics.summaryCount / Math.min(3, windowDays));
  const selectedEvidence = Math.min(1, metrics.selectedEvidenceCount / 10);
  const topReads = Math.min(1, metrics.topReadCount / 3);
  const citations = Math.min(1, metrics.citationCount / 8);
  const crossSource = Math.min(1, metrics.crossSourceSummaryCount / 2);
  const signal = Math.min(1, metrics.averageSignalScore / 2.4);
  const useful = Math.min(1, metrics.usefulSummaryCount / Math.max(1, metrics.summaryCount));
  const duplicatePenalty = Math.min(0.18, metrics.duplicateRate * 0.12);
  const qualityPenalty = Math.min(
    0.12,
    metrics.noiseRate * 0.08 +
      (metrics.lowRelevanceSignalCount / Math.max(1, metrics.summaryCount)) *
        0.04,
  );

  return roundScore(
    0.16 * consistency +
      0.22 * selectedEvidence +
      0.16 * topReads +
      0.14 * citations +
      0.16 * crossSource +
      0.12 * signal +
      0.04 * useful -
      duplicatePenalty -
      qualityPenalty,
  );
};

const topicTier = (normalizedLabel: string): ReaderSummaryTopicTier => {
  if (coreTopicNeedles.some((needle) => normalizedLabel.includes(needle))) {
    return "core";
  }

  if (adjacentTopicNeedles.some((needle) => normalizedLabel.includes(needle))) {
    return "adjacent";
  }

  return "unknown";
};

const recommendationRationale = (
  kind: ReaderSummaryTopicRecommendation["kind"],
  metrics: ReaderSummaryTopicRecommendation["metrics"],
): string =>
  kind === "promote_adjacent_topic"
    ? `Promote candidate: ${metrics.selectedEvidenceCount} selected evidence items, ${metrics.topReadCount} top reads and ${metrics.crossSourceSummaryCount} cross-source summaries.`
    : `Keep observing: the topic has signal, but needs more repeated or cross-source evidence before promotion.`;

const recommendationReasons = (
  metrics: ReaderSummaryTopicRecommendation["metrics"],
): readonly string[] =>
  uniqueNonEmpty([
    `${metrics.selectedEvidenceCount} selected evidence items`,
    `${metrics.topReadCount} top reads`,
    `${metrics.citationCount} citations`,
    metrics.crossSourceSummaryCount > 0
      ? `${metrics.crossSourceSummaryCount} cross-source summaries`
      : "",
    metrics.lowRelevanceSignalCount > 0
      ? `${metrics.lowRelevanceSignalCount} low-relevance signals`
      : "",
    `average signal ${metrics.averageSignalScore.toFixed(2)}`,
  ]);

const topReadCountForCitationIds = (
  topReads: readonly TopRead[],
  citationIds: readonly string[],
): number => {
  const citationSet = new Set(citationIds);

  return topReads.filter((read) =>
    read.citationIds.some((citationId) => citationSet.has(citationId)),
  ).length;
};

const preferredLabel = (signals: readonly TopicSignal[]): string =>
  signals
    .map((signal) => signal.label.trim())
    .sort((left, right) => left.length - right.length)[0] ?? "Topic";

const average = (values: readonly number[]): number => {
  const finite = values.filter((value) => Number.isFinite(value));

  return finite.length === 0 ? 0 : sum(finite) / finite.length;
};

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

const roundScore = (value: number): number =>
  Number(Math.max(0, Math.min(1, value)).toFixed(3));

const roundNumber = (value: number): number =>
  Number(Math.max(0, value).toFixed(3));

const rate = (numerator: number, denominator: number): number =>
  denominator <= 0 ? 0 : roundNumber(numerator / denominator);
