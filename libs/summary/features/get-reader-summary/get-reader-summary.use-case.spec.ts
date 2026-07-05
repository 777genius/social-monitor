import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  ReaderSummaryArtifact,
  emptyReaderSummaryReliabilityReport,
  type ReaderSummaryContent,
} from "../../domain";
import type {
  EnrichReaderSummaryPreviewMediaCommand,
  ListReaderSummaryArtifactsQuery,
  ListReaderSummaryArtifactsResult,
  ListReaderSummaryPeriodSummariesResult,
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryCoverageCounterPort,
  ReaderSummaryFreshness,
  ReaderSummaryFreshnessProbePort,
  ReaderSummaryPreviewMediaEnricherPort,
} from "../../ports";
import { GetReaderSummaryUseCase } from "./get-reader-summary.use-case";

describe("GetReaderSummaryUseCase", () => {
  it("loads a reader summary artifact by id with freshness projection", async () => {
    const useCase = new GetReaderSummaryUseCase(
      new FakeReaderSummaryArtifactRepository([
        readerSummaryArtifact("reader-summary-1"),
      ]),
      new FakeReaderSummaryFreshnessProbe(),
      undefined,
      new FakeReaderSummaryCoverageCounter(4),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryId: "reader-summary-1",
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        readerSummaryId: "reader-summary-1",
        headline: "Workspace AI tooling reader summary",
        content: expect.objectContaining({
          selectedPosts: [
            expect.objectContaining({
              matchedRules: ["ai-tooling"],
            }),
          ],
          topReads: [
            expect.objectContaining({
              matchedRules: ["ai-tooling"],
            }),
          ],
        }),
        citations: [
          expect.objectContaining({
            citationId: "c1",
            label: "[1]",
            feedItemId: "feed-reddit",
          }),
        ],
        coverage: {
          collectedFeedItemCount: 4,
          lowRelevanceFeedItemCount: 0,
          mutedFeedItemCount: 0,
          userRatedFeedItemCount: 0,
          selectedFeedItemCount: 1,
          storyClusterCount: 1,
          topReadCount: 1,
          citationCount: 1,
          providerCount: 2,
          interestCount: 2,
          duplicateFeedItemCount: 1,
          crossSourceClusterCount: 1,
          hasCrossProviderEvidence: true,
          isSingleSource: false,
          topProviderKeys: ["reddit", "github"],
          topInterestIds: ["interest-ai", "interest-github"],
          windowStartedAt: "2026-06-23T08:00:00.000Z",
          windowEndedAt: "2026-06-23T08:30:00.000Z",
          freshnessStatus: "fresh",
          providerBreakdown: [
            {
              providerKey: "reddit",
              collectedFeedItemCount: 4,
              lowRelevanceFeedItemCount: 0,
              mutedFeedItemCount: 0,
              userRatedFeedItemCount: 0,
              selectedFeedItemCount: 1,
              topReadCount: 1,
              citationCount: 1,
            },
            {
              providerKey: "github",
              selectedFeedItemCount: 1,
              topReadCount: 0,
              citationCount: 0,
              lowRelevanceFeedItemCount: 0,
              mutedFeedItemCount: 0,
              userRatedFeedItemCount: 0,
            },
          ],
          topicBreakdown: [],
          queryBreakdown: [],
        },
      }),
    });
  });

  it("returns not found for missing reader summary artifacts", async () => {
    const useCase = new GetReaderSummaryUseCase(
      new FakeReaderSummaryArtifactRepository([]),
      new FakeReaderSummaryFreshnessProbe(),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryId: "missing",
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "resource.not_found" }),
    });
  });

  it("applies preview media enrichment before presenting the artifact", async () => {
    const useCase = new GetReaderSummaryUseCase(
      new FakeReaderSummaryArtifactRepository([
        readerSummaryArtifact("reader-summary-1"),
      ]),
      new FakeReaderSummaryFreshnessProbe(),
      new FakeReaderSummaryPreviewMediaEnricher(),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryId: "reader-summary-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.content.topReads[0]?.previewMedia).toEqual({
      kind: "image",
      url: "https://cdn.example.test/real-preview.jpg",
      sourceUrl: "https://www.reddit.com/r/example/comments/1/post/",
      altText: "Real provider preview",
    });
  });
});

const tenant = tenantId("tenant-reader-summary-get");
const workspace = workspaceId("workspace-reader-summary-get");
const period = {
  cadence: "daily" as const,
  startedAt: new Date("2026-06-23T00:00:00.000Z"),
  endedAt: new Date("2026-06-24T00:00:00.000Z"),
  timezone: "UTC",
  periodKey: "daily:2026-06-23T00:00:00.000Z:2026-06-24T00:00:00.000Z:UTC",
};

const readerSummaryArtifact = (
  readerSummaryId: string,
): ReaderSummaryArtifact =>
  ReaderSummaryArtifact.create({
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId,
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: "workspace" },
    period,
    sourceWindow: {
      windowId: "workspace:get",
      startedAt: new Date("2026-06-23T08:00:00.000Z"),
      endedAt: new Date("2026-06-23T08:30:00.000Z"),
      selectedFeedItemIds: ["feed-reddit"],
      storyClusterIds: ["story:ai-tooling"],
    },
    storyClusters: [
      {
        id: "story:ai-tooling",
        storyKey: "url:example.com/ai-tooling",
        representativeFeedItemId: "feed-reddit",
        duplicateFeedItemIds: ["feed-github"],
        interestIds: ["interest-ai", "interest-github"],
        providerKeys: ["reddit", "github"],
        score: 2.4,
        observedAtRange: {
          startedAt: new Date("2026-06-23T08:00:00.000Z"),
          endedAt: new Date("2026-06-23T08:30:00.000Z"),
        },
        whyImportant: ["Clustered 2 similar items"],
      },
    ],
    contextArtifacts: [],
    headline: "Workspace AI tooling reader summary",
    executiveSummary:
      "AI tooling discussion is repeating across monitored sources.",
    content: {
      headline: "Workspace AI tooling reader summary",
      oneLineTakeaway:
        "AI tooling discussion is repeating across monitored sources.",
      bullets: ["Developers are discussing a new AI tooling library."],
      claimBoard: [],
      reliabilityReport: emptyReaderSummaryReliabilityReport(),
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
          interestIds: ["interest-ai", "interest-github"],
        },
        {
          providerKey: "github",
          itemCount: 1,
          citationCount: 0,
          storyClusterCount: 1,
          crossSourceClusterCount: 1,
          singleSourceOnly: false,
          interestIds: ["interest-ai", "interest-github"],
        },
      ],
      topReads: [
        {
          title: "AI tooling library is trending",
          providerKey: "reddit",
          providerName: "Reddit",
          primaryActionKind: "read_source",
          reason: "Cross-provider story cluster is active.",
          matchedInterestIds: ["interest-ai", "interest-github"],
          matchedRules: [
            "interest:interest-ai",
            "source-binding:source-binding-reddit",
            "provider:reddit",
            "ai-tooling",
          ],
          signalScore: 0.91,
          confidence: {
            level: "medium",
            score: 0.72,
            rationale: "Direct citation backs the top read.",
          },
          confirmedProviderKeys: ["reddit", "github"],
          providerMetrics: [],
          whyImportant: ["Clustered 2 similar items"],
          whyNow: "It appeared in the current reader summary window.",
          citationIds: ["c1"],
        },
      ],
      trendDelta: {
        newSignals: [],
        growingSignals: ["AI tooling"],
        repeatedSignals: [],
        fadingSignals: [],
      },
      openQuestions: [],
      risks: [],
      nextActions: [],
    },
    topStories: [
      {
        storyClusterId: "story:ai-tooling",
        title: "AI tooling library is trending",
        summary:
          "Developers are discussing a new AI tooling library across Reddit and GitHub.",
        interestIds: ["interest-ai", "interest-github"],
        providerKeys: ["reddit", "github"],
        citationIds: ["c1"],
      },
    ],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: [
      {
        citationId: "c1",
        feedItemId: "feed-reddit",
        sourceItemId: "source-reddit",
        providerKey: "reddit",
        field: "title",
      },
    ],
    qualityFlags: [],
    confidence: {
      level: "medium",
      score: 0.72,
      rationale: "Evidence is clustered across two providers.",
    },
    lineage: {
      promptVersion: "reader-summary.prompt.test.v1",
      schemaVersion: "reader_summary.artifact.v1",
      modelVersion: "fake-model",
      providerVersion: "fake",
      rulesVersion: "reader_summary.rules.test.v1",
      evalDatasetVersion: "reader_summary.eval.test.v1",
    },
    usage: {
      inputTokens: 20,
      outputTokens: 10,
      estimatedCostUsd: 0,
    },
  });

class FakeReaderSummaryArtifactRepository implements ReaderSummaryArtifactRepositoryPort {
  constructor(private readonly artifacts: readonly ReaderSummaryArtifact[]) {}

  async save(artifact: ReaderSummaryArtifact): Promise<void> {
    void artifact;
    return undefined;
  }

  async list(
    query: ListReaderSummaryArtifactsQuery,
  ): Promise<ListReaderSummaryArtifactsResult> {
    void query;
    return { items: this.artifacts };
  }

  async listPeriodSummaries(): Promise<ListReaderSummaryPeriodSummariesResult> {
    return { items: [] };
  }

  async findById(
    params: Parameters<ReaderSummaryArtifactRepositoryPort["findById"]>[0],
  ): Promise<ReaderSummaryArtifact | null> {
    return (
      this.artifacts.find((artifact) => {
        const snapshot = artifact.toSnapshot();
        return (
          snapshot.tenantId === params.tenantId &&
          snapshot.workspaceId === params.workspaceId &&
          snapshot.readerSummaryId === params.readerSummaryId
        );
      }) ?? null
    );
  }
}

class FakeReaderSummaryFreshnessProbe implements ReaderSummaryFreshnessProbePort {
  async evaluate(): Promise<ReaderSummaryFreshness> {
    return {
      status: "fresh",
      checkedAt: new Date("2026-06-23T08:40:00.000Z"),
    };
  }
}

class FakeReaderSummaryPreviewMediaEnricher implements ReaderSummaryPreviewMediaEnricherPort {
  async enrich(
    command: EnrichReaderSummaryPreviewMediaCommand,
  ): Promise<ReaderSummaryContent> {
    return {
      ...command.content,
      topReads: command.content.topReads.map((item) => ({
        ...item,
        previewMedia: {
          kind: "image",
          url: "https://cdn.example.test/real-preview.jpg",
          sourceUrl: "https://www.reddit.com/r/example/comments/1/post/",
          altText: "Real provider preview",
        },
      })),
    };
  }
}

class FakeReaderSummaryCoverageCounter implements ReaderSummaryCoverageCounterPort {
  constructor(private readonly collectedFeedItemCount: number) {}

  async countCollectedFeedItems(): Promise<number> {
    return this.collectedFeedItemCount;
  }

  async countCollectedFeedItemCoverage() {
    return {
      collectedFeedItemCount: this.collectedFeedItemCount,
      lowRelevanceFeedItemCount: 0,
      mutedFeedItemCount: 0,
      userRatedFeedItemCount: 0,
      providerBreakdown: [
        {
          providerKey: "reddit",
          collectedFeedItemCount: this.collectedFeedItemCount,
          lowRelevanceFeedItemCount: 0,
          mutedFeedItemCount: 0,
          userRatedFeedItemCount: 0,
        },
      ],
      topicBreakdown: [],
      queryBreakdown: [],
    };
  }
}
