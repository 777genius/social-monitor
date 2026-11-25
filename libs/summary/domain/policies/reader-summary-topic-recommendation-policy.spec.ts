import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryArtifactProps } from "../entities/reader-summary-artifact";
import { emptyReaderSummaryReliabilityReport } from "../entities/reader-summary-reliability";
import type { ReaderSummaryTopicMap } from "../entities/reader-summary-topic-map";
import { buildReaderSummaryTopicRecommendations } from "./reader-summary-topic-recommendation-policy";

describe("buildReaderSummaryTopicRecommendations", () => {
  it("recommends promoting adjacent topics with repeated useful signal", () => {
    const recommendations = buildReaderSummaryTopicRecommendations({
      artifacts: [
        artifact("summary-1", {
          topicLabel: "AI security",
          providerKeys: ["reddit", "rss"],
          evidenceCount: 4,
          citationIds: ["c1", "c2", "c3"],
          clusterScore: 2.2,
          duplicateCount: 1,
        }),
        artifact("summary-2", {
          topicLabel: "AI security",
          providerKeys: ["hacker-news", "rss"],
          evidenceCount: 5,
          citationIds: ["c4", "c5", "c6"],
          clusterScore: 2.5,
          duplicateCount: 1,
        }),
        artifact("summary-3", {
          topicLabel: "AI security",
          providerKeys: ["x-twitter", "reddit"],
          evidenceCount: 3,
          citationIds: ["c7", "c8"],
          clusterScore: 1.9,
        }),
      ],
      windowDays: 14,
      limit: 5,
    });

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]).toMatchObject({
      kind: "promote_adjacent_topic",
      topicLabel: "AI security",
      currentTier: "adjacent",
      suggestedTier: "core",
      windowDays: 14,
      metrics: {
        summaryCount: 3,
        selectedEvidenceCount: 12,
        topReadCount: 3,
        citationCount: 8,
        crossSourceSummaryCount: 3,
        usefulSummaryCount: 3,
        averageSignalScore: 2.2,
      },
      providerKeys: ["reddit", "rss", "hacker-news", "x-twitter"],
      evidenceReaderSummaryIds: ["summary-1", "summary-2", "summary-3"],
    });
    expect(recommendations[0]?.confidenceScore).toBeGreaterThanOrEqual(0.68);
    expect(recommendations[0]?.reasons).toContain("3 cross-source summaries");
  });

  it("does not recommend already-core topics", () => {
    const recommendations = buildReaderSummaryTopicRecommendations({
      artifacts: [
        artifact("summary-core", {
          topicLabel: "Claude Code",
          providerKeys: ["reddit", "hacker-news"],
          evidenceCount: 8,
          citationIds: ["c1", "c2", "c3"],
          clusterScore: 3,
        }),
      ],
      windowDays: 14,
      limit: 5,
    });

    expect(recommendations).toEqual([]);
  });

  it("deduplicates title-like duration variants for the same topic", () => {
    const recommendations = buildReaderSummaryTopicRecommendations({
      artifacts: [
        artifact("summary-1", {
          topicLabel:
            "Anthropic just showed a 24-minute workshop on AI security",
          keywords: ["anthropic", "ai", "security"],
          providerKeys: ["reddit", "rss"],
          evidenceCount: 4,
          citationIds: ["c1", "c2"],
          clusterScore: 2.1,
        }),
        artifact("summary-2", {
          topicLabel:
            "Anthropic just showed a 27-minute workshop on AI security",
          keywords: ["anthropic", "ai", "security"],
          providerKeys: ["hacker-news", "rss"],
          evidenceCount: 4,
          citationIds: ["c3", "c4"],
          clusterScore: 2.2,
        }),
        artifact("summary-3", {
          topicLabel:
            "Anthropic just showed a 24 minute workshop on AI security",
          keywords: ["anthropic", "ai", "security"],
          providerKeys: ["x-twitter", "reddit"],
          evidenceCount: 4,
          citationIds: ["c5", "c6"],
          clusterScore: 2.3,
        }),
      ],
      windowDays: 14,
      limit: 5,
    });

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]).toMatchObject({
      recommendationId: "topic-rec:14:anthropic ai security",
      topicLabel: "Anthropic AI security",
      metrics: {
        summaryCount: 3,
        selectedEvidenceCount: 12,
        citationCount: 6,
      },
    });
  });

  it("uses concise query labels when topic nodes contain headline-like labels", () => {
    const recommendations = buildReaderSummaryTopicRecommendations({
      artifacts: [
        artifact("summary-productivity-1", {
          topicLabel: "The productivity stack many professionals rely on every",
          keywords: ["productivity", "stack", "professionals"],
          providerKeys: ["reddit", "rss"],
          evidenceCount: 4,
          citationIds: ["c1", "c2"],
          clusterScore: 2.2,
        }),
        artifact("summary-productivity-2", {
          topicLabel: "The productivity stack many professionals rely on every",
          keywords: ["productivity", "stack", "professionals"],
          providerKeys: ["hacker-news", "rss"],
          evidenceCount: 4,
          citationIds: ["c3", "c4"],
          clusterScore: 2.1,
        }),
        artifact("summary-productivity-3", {
          topicLabel: "The productivity stack many professionals rely on every",
          keywords: ["productivity", "stack", "professionals"],
          providerKeys: ["x-twitter", "reddit"],
          evidenceCount: 4,
          citationIds: ["c5", "c6"],
          clusterScore: 2.3,
        }),
      ],
      windowDays: 14,
      limit: 5,
    });

    expect(recommendations[0]).toMatchObject({
      recommendationId: "topic-rec:14:productivity stack",
      topicLabel: "Productivity stack",
    });
  });

  it("replaces short stopword labels with keyword-derived topic labels", () => {
    const recommendations = buildReaderSummaryTopicRecommendations({
      artifacts: [
        artifact("summary-github-1", {
          topicLabel: "The",
          keywords: ["github", "ecosystem"],
          providerKeys: ["reddit", "rss"],
          evidenceCount: 5,
          citationIds: ["c1", "c2"],
          clusterScore: 2.2,
        }),
        artifact("summary-github-2", {
          topicLabel: "The",
          keywords: ["github", "ecosystem"],
          providerKeys: ["hacker-news", "rss"],
          evidenceCount: 5,
          citationIds: ["c3", "c4"],
          clusterScore: 2.1,
        }),
        artifact("summary-anthropic-1", {
          topicLabel: "Show",
          keywords: ["anthropic", "ai", "security"],
          providerKeys: ["x-twitter", "reddit"],
          evidenceCount: 5,
          citationIds: ["c5", "c6"],
          clusterScore: 2.3,
        }),
      ],
      windowDays: 14,
      limit: 5,
    });

    expect(recommendations.map((item) => item.topicLabel)).toEqual(
      expect.arrayContaining(["GitHub ecosystem", "Anthropic AI security"]),
    );
    expect(recommendations.map((item) => item.topicLabel)).not.toEqual(
      expect.arrayContaining(["The", "Show"]),
    );
  });

  it("drops short stopword labels when no concrete keywords exist", () => {
    const recommendations = buildReaderSummaryTopicRecommendations({
      artifacts: [
        artifact("summary-noise-1", {
          topicLabel: "The",
          keywords: [],
          providerKeys: ["reddit", "rss"],
          evidenceCount: 5,
          citationIds: ["c1", "c2"],
          clusterScore: 2.2,
        }),
        artifact("summary-noise-2", {
          topicLabel: "Show",
          keywords: [],
          providerKeys: ["hacker-news", "rss"],
          evidenceCount: 5,
          citationIds: ["c3", "c4"],
          clusterScore: 2.1,
        }),
      ],
      windowDays: 14,
      limit: 5,
    });

    expect(recommendations).toEqual([]);
  });
});

const tenant = tenantId("tenant-topic-rec");
const workspace = workspaceId("workspace-topic-rec");

const artifact = (
  readerSummaryId: string,
  params: {
    readonly topicLabel: string;
    readonly providerKeys: readonly string[];
    readonly evidenceCount: number;
    readonly citationIds: readonly string[];
    readonly clusterScore: number;
    readonly duplicateCount?: number;
    readonly keywords?: readonly string[];
  },
): ReaderSummaryArtifactProps => {
  const duplicateFeedItemIds = Array.from(
    { length: params.duplicateCount ?? 0 },
    (_, index) => `feed-duplicate-${readerSummaryId}-${index}`,
  );

  return {
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId,
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: "workspace" },
    period: {
      cadence: "daily",
      startedAt: new Date("2026-07-01T00:00:00.000Z"),
      endedAt: new Date("2026-07-02T00:00:00.000Z"),
      timezone: "UTC",
      periodKey: `daily:${readerSummaryId}`,
    },
    sourceWindow: {
      windowId: `window-${readerSummaryId}`,
      startedAt: new Date("2026-07-01T00:00:00.000Z"),
      endedAt: new Date("2026-07-02T00:00:00.000Z"),
      selectedFeedItemIds: ["feed-main", ...duplicateFeedItemIds],
      storyClusterIds: [`story-${readerSummaryId}`],
    },
    storyClusters: [
      {
        id: `story-${readerSummaryId}`,
        storyKey: `story:${params.topicLabel}`,
        representativeFeedItemId: "feed-main",
        duplicateFeedItemIds,
        interestIds: ["interest-ai-security"],
        providerKeys: params.providerKeys,
        score: params.clusterScore,
        observedAtRange: {
          startedAt: new Date("2026-07-01T00:00:00.000Z"),
          endedAt: new Date("2026-07-01T01:00:00.000Z"),
        },
        whyImportant: ["Repeated adjacent signal"],
      },
    ],
    contextArtifacts: [],
    headline: `${params.topicLabel} summary`,
    executiveSummary: `${params.topicLabel} is gaining useful signal.`,
    content: content(readerSummaryId, params),
    topStories: [],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: params.citationIds.map((citationId) => ({
      citationId,
      feedItemId: `feed-${citationId}`,
      sourceItemId: `source-${citationId}`,
      providerKey: params.providerKeys[0] ?? "reddit",
      field: "title",
      canonicalUrl: `https://example.test/${citationId}`,
    })),
    qualityFlags: [],
    confidence: {
      level: "high",
      score: 0.9,
      rationale: "Fixture",
    },
    lineage: {
      promptVersion: "test",
      schemaVersion: "reader_summary.artifact.v1",
      modelVersion: "test",
      providerVersion: "test",
      rulesVersion: "test",
      evalDatasetVersion: "test",
    },
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    },
  };
};

const content = (
  readerSummaryId: string,
  params: {
    readonly topicLabel: string;
    readonly providerKeys: readonly string[];
    readonly evidenceCount: number;
    readonly citationIds: readonly string[];
    readonly keywords?: readonly string[];
  },
): ReaderSummaryArtifactProps["content"] => ({
  headline: `${params.topicLabel} summary`,
  oneLineTakeaway: `${params.topicLabel} is gaining useful signal.`,
  bullets: [],
  mainTopics: [params.topicLabel],
  topicMap: topicMap(readerSummaryId, params),
  qualityState: {
    status: "ready",
    flags: [],
    warnings: [],
    isSingleSource: false,
  },
  interestSections: [],
  sourceMix: [],
  topReads: [
    {
      title: `${params.topicLabel} top read`,
      providerKey: params.providerKeys[0] ?? "reddit",
      providerName: "Provider",
      primaryActionKind: "read_source",
      reason: "Useful adjacent signal",
      matchedInterestIds: ["interest-ai-security"],
      matchedRules: ["ai-security"],
      signalScore: 2,
      confidence: {
        level: "high",
        score: 0.9,
        rationale: "Fixture",
      },
      confirmedProviderKeys: params.providerKeys,
      providerMetrics: [],
      whyImportant: ["Useful adjacent signal"],
      whyNow: "Fresh",
      citationIds: params.citationIds.slice(0, 1),
    },
  ],
  selectedPosts: [],
  claimBoard: [],
  reliabilityReport: emptyReaderSummaryReliabilityReport(),
  trendDelta: {
    newSignals: [],
    growingSignals: [],
    repeatedSignals: [],
    fadingSignals: [],
  },
  openQuestions: [],
  risks: [],
  nextActions: [],
});

const topicMap = (
  readerSummaryId: string,
  params: {
    readonly topicLabel: string;
    readonly providerKeys: readonly string[];
    readonly evidenceCount: number;
    readonly citationIds: readonly string[];
    readonly keywords?: readonly string[];
  },
): ReaderSummaryTopicMap => ({
  schemaVersion: "reader_summary.topic_map.v1",
  generatedBy: "deterministic",
  confidence: {
    level: "high",
    score: 0.9,
    rationale: "Fixture",
  },
  nodes: [
    {
      id: `topic:story-${readerSummaryId}`,
      label: params.topicLabel,
      groupId: "group:security",
      storyClusterIds: [`story-${readerSummaryId}`],
      popularityScore: 90,
      sizeWeight: 1,
      evidenceCount: params.evidenceCount,
      providerKeys: params.providerKeys,
      interestIds: ["interest-ai-security"],
      citationIds: params.citationIds,
      keywords: params.keywords ?? ["security"],
      rationale: "Adjacent topic signal",
    },
  ],
  groups: [],
  edges: [],
  warnings: [],
});
