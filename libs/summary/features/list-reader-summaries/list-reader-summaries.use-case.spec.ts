import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { ReaderSummaryArtifact, type ReaderSummaryScope } from "../../domain";
import type {
  ListReaderSummaryArtifactsQuery,
  ListReaderSummaryArtifactsResult,
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryFreshness,
  ReaderSummaryFreshnessProbePort,
} from "../../ports";
import { ListReaderSummariesUseCase } from "./list-reader-summaries.use-case";

describe("ListReaderSummariesUseCase", () => {
  it("lists reader summary artifacts with freshness projection", async () => {
    const artifact = readerSummaryArtifact({
      readerSummaryId: "reader-summary-1",
    });
    const useCase = new ListReaderSummariesUseCase(
      new FakeReaderSummaryArtifactRepository([artifact]),
      new FakeReaderSummaryFreshnessProbe(),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      limit: 10,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          expect.objectContaining({
            readerSummaryId: "reader-summary-1",
            headline: "Workspace AI tooling reader summary",
            freshness: {
              status: "fresh",
              checkedAt: "2026-06-23T08:40:00.000Z",
            },
          }),
        ],
        nextCursor: undefined,
      },
    });
  });

  it("rejects invalid page limits before reading repositories", async () => {
    const repository = new FakeReaderSummaryArtifactRepository([]);
    const useCase = new ListReaderSummariesUseCase(
      repository,
      new FakeReaderSummaryFreshnessProbe(),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 0,
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "validation.failed" }),
    });
    expect(repository.queries).toEqual([]);
  });
});

const tenant = tenantId("tenant-reader-summary-list");
const workspace = workspaceId("workspace-reader-summary-list");

const readerSummaryArtifact = (params: {
  readonly readerSummaryId: string;
  readonly scope?: ReaderSummaryScope;
}): ReaderSummaryArtifact =>
  ReaderSummaryArtifact.create({
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId: params.readerSummaryId,
    tenantId: tenant,
    workspaceId: workspace,
    scope: params.scope ?? { type: "workspace" },
    sourceWindow: {
      windowId: "workspace:list",
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
  readonly queries: ListReaderSummaryArtifactsQuery[] = [];

  constructor(private readonly artifacts: readonly ReaderSummaryArtifact[]) {}

  async save(_artifact: ReaderSummaryArtifact): Promise<void> {
    return undefined;
  }

  async list(
    query: ListReaderSummaryArtifactsQuery,
  ): Promise<ListReaderSummaryArtifactsResult> {
    this.queries.push(query);
    return {
      items: this.artifacts.slice(0, query.limit),
    };
  }

  async findById(): Promise<ReaderSummaryArtifact | null> {
    return null;
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
