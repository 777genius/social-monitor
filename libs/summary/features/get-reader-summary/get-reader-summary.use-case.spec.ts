import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { ReaderSummaryArtifact } from "../../domain";
import type {
  ListReaderSummaryArtifactsQuery,
  ListReaderSummaryArtifactsResult,
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryFreshness,
  ReaderSummaryFreshnessProbePort,
} from "../../ports";
import { GetReaderSummaryUseCase } from "./get-reader-summary.use-case";

describe("GetReaderSummaryUseCase", () => {
  it("loads a reader summary artifact by id with freshness projection", async () => {
    const useCase = new GetReaderSummaryUseCase(
      new FakeReaderSummaryArtifactRepository([
        readerSummaryArtifact("reader-summary-1"),
      ]),
      new FakeReaderSummaryFreshnessProbe(),
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
        citations: [
          expect.objectContaining({
            citationId: "c1",
            label: "[1]",
            feedItemId: "feed-reddit",
          }),
        ],
        coverage: {
          selectedFeedItemCount: 1,
          storyClusterCount: 1,
          topReadCount: 1,
          citationCount: 1,
          providerCount: 2,
          topicCount: 2,
          duplicateFeedItemCount: 1,
          crossSourceClusterCount: 1,
          hasCrossProviderEvidence: true,
          isSingleSource: false,
          topProviderKeys: ["reddit", "github"],
          topTopicIds: ["topic-ai", "topic-github"],
          windowStartedAt: "2026-06-23T08:00:00.000Z",
          windowEndedAt: "2026-06-23T08:30:00.000Z",
          freshnessStatus: "fresh",
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
});

const tenant = tenantId("tenant-reader-summary-get");
const workspace = workspaceId("workspace-reader-summary-get");
const period = {
  cadence: "daily" as const,
  startedAt: new Date("2026-06-23T00:00:00.000Z"),
  endedAt: new Date("2026-06-24T00:00:00.000Z"),
  timezone: "UTC",
  periodKey:
    "daily:2026-06-23T00:00:00.000Z:2026-06-24T00:00:00.000Z:UTC",
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
        topicIds: ["topic-ai", "topic-github"],
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
    topStories: [
      {
        storyClusterId: "story:ai-tooling",
        title: "AI tooling library is trending",
        summary:
          "Developers are discussing a new AI tooling library across Reddit and GitHub.",
        topicIds: ["topic-ai", "topic-github"],
        providerKeys: ["reddit", "github"],
        citationIds: ["c1"],
      },
    ],
    topicHighlights: [],
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
