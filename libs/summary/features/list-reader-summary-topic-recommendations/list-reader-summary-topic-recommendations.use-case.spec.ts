import {
  FixedClock,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import {
  buildReaderSummaryPeriod,
  emptyReaderSummaryReliabilityReport,
  ReaderSummaryArtifact,
  ReaderSummaryTopicRecommendationDecision,
} from "../../domain";
import type {
  ListReaderSummaryArtifactsQuery,
  ListReaderSummaryArtifactsResult,
  ListReaderSummaryPeriodSummariesResult,
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryTopicCollectionMetrics,
  ReaderSummaryTopicCollectionMetricsQuery,
  ReaderSummaryTopicCollectionMetricsReaderPort,
  ReaderSummaryTopicRecommendationDecisionRepositoryPort,
} from "../../ports";
import { ListReaderSummaryTopicRecommendationsUseCase } from "./list-reader-summary-topic-recommendations.use-case";

describe("ListReaderSummaryTopicRecommendationsUseCase", () => {
  it("lists topic recommendations from recent reader summary artifacts", async () => {
    const repository = new FakeReaderSummaryArtifactRepository([
      artifact("summary-1", "AI security"),
      artifact("summary-2", "AI security"),
      artifact("summary-3", "AI security"),
    ]);
    const useCase = new ListReaderSummaryTopicRecommendationsUseCase(
      repository,
      new FixedClock(new Date("2026-07-05T00:00:00.000Z")),
      new FakeTopicCollectionMetrics(24),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      windowDays: 14,
      limit: 5,
    });

    expect(repository.lastQuery).toMatchObject({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      periodStartedFrom: new Date("2026-06-21T00:00:00.000Z"),
      periodStartedBefore: new Date("2026-07-05T00:00:00.000Z"),
      limit: 120,
    });
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        windowStartedAt: new Date("2026-06-21T00:00:00.000Z"),
        windowEndedAt: new Date("2026-07-05T00:00:00.000Z"),
        items: [
          expect.objectContaining({
            kind: "promote_adjacent_topic",
            topicLabel: "AI security",
            metrics: expect.objectContaining({
              collectedPostCount: 24,
              lowRelevanceSignalCount: 2,
              noiseRate: 0.5,
            }),
          }),
        ],
      }),
    });
  });

  it("applies existing accept or reject decisions to recomputed recommendations", async () => {
    const recommendationId = "topic-rec:14:ai security";
    const useCase = new ListReaderSummaryTopicRecommendationsUseCase(
      new FakeReaderSummaryArtifactRepository([
        artifact("summary-1", "AI security"),
        artifact("summary-2", "AI security"),
        artifact("summary-3", "AI security"),
      ]),
      new FixedClock(new Date("2026-07-05T00:00:00.000Z")),
      new FakeTopicCollectionMetrics(12),
      new FakeTopicRecommendationDecisions([
        ReaderSummaryTopicRecommendationDecision.record({
          tenantId: tenant,
          workspaceId: workspace,
          recommendationId,
          topicLabel: "AI security",
          status: "accepted",
          decidedBy: "admin-user",
          note: "Promote to core",
          decidedAt: new Date("2026-07-04T12:00:00.000Z"),
        }),
      ]),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      windowDays: 14,
      limit: 5,
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        items: [
          expect.objectContaining({
            recommendationId,
            decisionStatus: "accepted",
            decidedBy: "admin-user",
            decisionNote: "Promote to core",
            decidedAt: new Date("2026-07-04T12:00:00.000Z"),
          }),
        ],
      }),
    });
  });

  it("rejects unsupported recommendation windows", async () => {
    const useCase = new ListReaderSummaryTopicRecommendationsUseCase(
      new FakeReaderSummaryArtifactRepository([]),
      new FixedClock(new Date("2026-07-05T00:00:00.000Z")),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      windowDays: 1,
      limit: 5,
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "validation.failed" }),
    });
  });
});

const tenant = tenantId("tenant-topic-rec-use-case");
const workspace = workspaceId("workspace-topic-rec-use-case");

class FakeReaderSummaryArtifactRepository
  implements ReaderSummaryArtifactRepositoryPort
{
  lastQuery: ListReaderSummaryArtifactsQuery | undefined;

  constructor(private readonly items: readonly ReaderSummaryArtifact[]) {}

  async save(): Promise<void> {}

  async list(
    query: ListReaderSummaryArtifactsQuery,
  ): Promise<ListReaderSummaryArtifactsResult> {
    this.lastQuery = query;

    return { items: this.items };
  }

  async listPeriodSummaries(): Promise<ListReaderSummaryPeriodSummariesResult> {
    return { items: [] };
  }

  async findById(): Promise<ReaderSummaryArtifact | null> {
    return null;
  }
}

class FakeTopicCollectionMetrics
  implements ReaderSummaryTopicCollectionMetricsReaderPort
{
  lastQuery: ReaderSummaryTopicCollectionMetricsQuery | undefined;

  constructor(private readonly collectedPostCount: number) {}

  async readTopicCollectionMetrics(
    query: ReaderSummaryTopicCollectionMetricsQuery,
  ): Promise<ReaderSummaryTopicCollectionMetrics> {
    this.lastQuery = query;

    return {
      collectedPostCount: this.collectedPostCount,
      lowRelevancePostCount: 2,
      mutedPostCount: 0,
      userRatedPostCount: 0,
    };
  }
}

class FakeTopicRecommendationDecisions
  implements ReaderSummaryTopicRecommendationDecisionRepositoryPort
{
  constructor(
    private readonly decisions: readonly ReaderSummaryTopicRecommendationDecision[],
  ) {}

  async save(): Promise<void> {}

  async findByRecommendationId(): Promise<
    ReaderSummaryTopicRecommendationDecision | null
  > {
    return null;
  }

  async deleteByRecommendationId(): Promise<void> {}

  async listByRecommendationIds(): Promise<
    readonly ReaderSummaryTopicRecommendationDecision[]
  > {
    return this.decisions;
  }
}

const artifact = (
  readerSummaryId: string,
  topicLabel: string,
): ReaderSummaryArtifact =>
  ReaderSummaryArtifact.create({
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId,
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: "workspace" },
    period: buildReaderSummaryPeriod({
      cadence: "daily",
      startedAt: new Date("2026-07-01T00:00:00.000Z"),
      endedAt: new Date("2026-07-02T00:00:00.000Z"),
      timezone: "UTC",
    }),
    sourceWindow: {
      windowId: `window-${readerSummaryId}`,
      startedAt: new Date("2026-07-01T00:00:00.000Z"),
      endedAt: new Date("2026-07-02T00:00:00.000Z"),
      selectedFeedItemIds: ["feed-main"],
      storyClusterIds: [`story-${readerSummaryId}`],
    },
    storyClusters: [
      {
        id: `story-${readerSummaryId}`,
        storyKey: `story:${topicLabel}`,
        representativeFeedItemId: "feed-main",
        duplicateFeedItemIds: [],
        interestIds: ["interest-ai-security"],
        providerKeys: ["reddit", "rss"],
        score: 2.2,
        observedAtRange: {
          startedAt: new Date("2026-07-01T00:00:00.000Z"),
          endedAt: new Date("2026-07-01T01:00:00.000Z"),
        },
        whyImportant: ["Repeated adjacent signal"],
      },
    ],
    contextArtifacts: [],
    headline: `${topicLabel} summary`,
    executiveSummary: `${topicLabel} is gaining useful signal.`,
    content: {
      headline: `${topicLabel} summary`,
      oneLineTakeaway: `${topicLabel} is gaining useful signal.`,
      bullets: [],
      mainTopics: [topicLabel],
      topicMap: {
        schemaVersion: "reader_summary.topic_map.v1",
        generatedBy: "deterministic",
        confidence: { level: "high", score: 0.9, rationale: "Fixture" },
        nodes: [
          {
            id: `topic:story-${readerSummaryId}`,
            label: topicLabel,
            groupId: "group:security",
            storyClusterIds: [`story-${readerSummaryId}`],
            popularityScore: 90,
            sizeWeight: 1,
            evidenceCount: 4,
            providerKeys: ["reddit", "rss"],
            interestIds: ["interest-ai-security"],
            citationIds: [`citation-${readerSummaryId}`],
            keywords: ["security"],
            rationale: "Adjacent topic signal",
          },
        ],
        groups: [
          {
            id: "group:security",
            label: "Security",
            colorKey: "amber",
            nodeIds: [`topic:story-${readerSummaryId}`],
            confidence: {
              level: "high",
              score: 0.9,
              rationale: "Fixture",
            },
          },
        ],
        edges: [],
        warnings: [],
      },
      qualityState: {
        status: "ready",
        flags: [],
        warnings: [],
        isSingleSource: false,
      },
      interestSections: [],
      sourceMix: [
        {
          providerKey: "reddit",
          itemCount: 1,
          citationCount: 1,
          storyClusterCount: 1,
          crossSourceClusterCount: 1,
          singleSourceOnly: false,
          interestIds: ["interest-ai-security"],
        },
        {
          providerKey: "rss",
          itemCount: 1,
          citationCount: 0,
          storyClusterCount: 1,
          crossSourceClusterCount: 1,
          singleSourceOnly: false,
          interestIds: ["interest-ai-security"],
        },
      ],
      topReads: [
        {
          title: `${topicLabel} top read`,
          providerKey: "reddit",
          providerName: "Reddit",
          primaryActionKind: "read_source",
          reason: "Useful adjacent signal",
          matchedInterestIds: ["interest-ai-security"],
          matchedRules: ["ai-security"],
          signalScore: 2,
          confidence: { level: "high", score: 0.9, rationale: "Fixture" },
          confirmedProviderKeys: ["reddit", "rss"],
          providerMetrics: [],
          whyImportant: ["Useful adjacent signal"],
          whyNow: "Fresh",
          citationIds: [`citation-${readerSummaryId}`],
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
    },
    topStories: [
      {
        storyClusterId: `story-${readerSummaryId}`,
        title: `${topicLabel} top story`,
        summary: `${topicLabel} is repeated across sources.`,
        interestIds: ["interest-ai-security"],
        providerKeys: ["reddit", "rss"],
        citationIds: [`citation-${readerSummaryId}`],
      },
    ],
    interestHighlights: [
      {
        interestId: "interest-ai-security",
        title: topicLabel,
        summary: `${topicLabel} is gaining signal.`,
        citationIds: [`citation-${readerSummaryId}`],
      },
    ],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: [
      {
        citationId: `citation-${readerSummaryId}`,
        feedItemId: "feed-main",
        sourceItemId: "source-main",
        providerKey: "reddit",
        field: "title",
        canonicalUrl: "https://example.test/source",
      },
    ],
    qualityFlags: [],
    confidence: { level: "high", score: 0.9, rationale: "Fixture" },
    lineage: {
      promptVersion: "test",
      schemaVersion: "reader_summary.artifact.v1",
      modelVersion: "test",
      providerVersion: "test",
      rulesVersion: "test",
      evalDatasetVersion: "test",
    },
    usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
  });
