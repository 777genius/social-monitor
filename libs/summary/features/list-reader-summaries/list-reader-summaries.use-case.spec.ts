import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { ReaderSummaryArtifact, type ReaderSummaryScope } from "../../domain";
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

  it("filters reader summaries without skipping matching cursor pages", async () => {
    const repository = new FakeReaderSummaryArtifactRepository([
      readerSummaryArtifact({
        readerSummaryId: "reader-summary-github",
        providerKeys: ["github"],
      }),
      readerSummaryArtifact({
        readerSummaryId: "reader-summary-reddit",
        providerKeys: ["reddit"],
      }),
    ]);
    const useCase = new ListReaderSummariesUseCase(
      repository,
      new FakeReaderSummaryFreshnessProbe(),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      providerKey: "reddit",
      limit: 1,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          expect.objectContaining({
            readerSummaryId: "reader-summary-reddit",
          }),
        ],
        nextCursor: undefined,
      },
    });
    expect(repository.queries).toEqual([
      expect.objectContaining({ cursor: undefined, limit: 1 }),
      expect.objectContaining({ cursor: "1", limit: 1 }),
    ]);
  });

  it("filters personal memory-guided stale reader summaries", async () => {
    const artifact = readerSummaryArtifact({
      readerSummaryId: "reader-summary-personal",
      userId: "user-1",
      subscriptionId: "11111111-1111-4111-8111-111111111111",
      personalization: {
        memoryGuidanceStatus: "available",
        memoryGuidanceApplied: true,
        providerPreferenceCount: 1,
        keywordPreferenceCount: 2,
        mutedKeywordCount: 0,
        blockedProviderCount: 0,
        signals: ["More AI agent releases"],
      },
    });
    const useCase = new ListReaderSummariesUseCase(
      new FakeReaderSummaryArtifactRepository([
        readerSummaryArtifact({
          readerSummaryId: "reader-summary-workspace",
        }),
        artifact,
      ]),
      new FakeReaderSummaryFreshnessProbe({
        "workspace:reader-summary-personal": {
          status: "stale",
          checkedAt: new Date("2026-06-23T08:40:00.000Z"),
          staleMarkedAt: new Date("2026-06-23T08:41:00.000Z"),
          reason: "new_evidence_after_window",
          newestFeedItemId: "feed-new",
          newestObservedAt: new Date("2026-06-23T08:39:00.000Z"),
        },
      }),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      userId: "user-1",
      subscriptionId: "11111111-1111-4111-8111-111111111111",
      freshnessStatus: "stale",
      memoryGuidanceApplied: true,
      limit: 5,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          expect.objectContaining({
            readerSummaryId: "reader-summary-personal",
            userId: "user-1",
            personalization: expect.objectContaining({
              memoryGuidanceApplied: true,
            }),
            freshness: expect.objectContaining({ status: "stale" }),
          }),
        ],
        nextCursor: undefined,
      },
    });
  });

  it("falls back to persisted content when optional preview enrichment fails", async () => {
    const useCase = new ListReaderSummariesUseCase(
      new FakeReaderSummaryArtifactRepository([
        readerSummaryArtifact({ readerSummaryId: "reader-summary-1" }),
      ]),
      new FakeReaderSummaryFreshnessProbe(),
      new FailingReaderSummaryPreviewMediaEnricher(),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 10,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          expect.objectContaining({
            readerSummaryId: "reader-summary-1",
            headline: "Workspace AI tooling reader summary",
          }),
        ],
        nextCursor: undefined,
      },
    });
  });

  it("falls back to artifact coverage when optional coverage enrichment fails", async () => {
    const useCase = new ListReaderSummariesUseCase(
      new FakeReaderSummaryArtifactRepository([
        readerSummaryArtifact({ readerSummaryId: "reader-summary-1" }),
      ]),
      new FakeReaderSummaryFreshnessProbe(),
      undefined,
      new FailingReaderSummaryCoverageCounter(),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 10,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          expect.objectContaining({
            readerSummaryId: "reader-summary-1",
            coverage: expect.objectContaining({
              selectedFeedItemCount: 0,
            }),
          }),
        ],
        nextCursor: undefined,
      },
    });
  });

  it("bounds presentation fan-out for small production database pools", async () => {
    const freshness = new ConcurrentFreshnessProbe();
    const useCase = new ListReaderSummariesUseCase(
      new FakeReaderSummaryArtifactRepository([
        readerSummaryArtifact({ readerSummaryId: "reader-summary-1" }),
        readerSummaryArtifact({ readerSummaryId: "reader-summary-2" }),
        readerSummaryArtifact({ readerSummaryId: "reader-summary-3" }),
      ]),
      freshness,
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 3,
    });

    expect(result.ok).toBe(true);
    expect(freshness.maximumConcurrentEvaluations).toBe(1);
  });

  it("does not hide required artifact repository failures", async () => {
    const repository = new FakeReaderSummaryArtifactRepository([]);
    repository.listFailure = new Error("reader summary persistence unavailable");
    const useCase = new ListReaderSummariesUseCase(
      repository,
      new FakeReaderSummaryFreshnessProbe(),
    );

    await expect(
      useCase.execute({
        tenantId: tenant,
        workspaceId: workspace,
        limit: 10,
      }),
    ).rejects.toThrow("reader summary persistence unavailable");
  });
});

const tenant = tenantId("tenant-reader-summary-list");
const workspace = workspaceId("workspace-reader-summary-list");
const period = {
  cadence: "daily" as const,
  startedAt: new Date("2026-06-23T00:00:00.000Z"),
  endedAt: new Date("2026-06-24T00:00:00.000Z"),
  timezone: "UTC",
  periodKey: "daily:2026-06-23T00:00:00.000Z:2026-06-24T00:00:00.000Z:UTC",
};

const readerSummaryArtifact = (params: {
  readonly readerSummaryId: string;
  readonly scope?: ReaderSummaryScope;
  readonly providerKeys?: readonly string[];
  readonly userId?: string;
  readonly subscriptionId?: string;
  readonly personalization?: Parameters<
    typeof ReaderSummaryArtifact.create
  >[0]["personalization"];
}): ReaderSummaryArtifact =>
  ReaderSummaryArtifact.create({
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId: params.readerSummaryId,
    tenantId: tenant,
    workspaceId: workspace,
    scope: params.scope ?? { type: "workspace" },
    period,
    userId: params.userId,
    subscriptionId: params.subscriptionId,
    sourceWindow: {
      windowId: `workspace:${params.readerSummaryId}`,
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
        providerKeys: params.providerKeys ?? ["reddit", "github"],
        score: 2.4,
        observedAtRange: {
          startedAt: new Date("2026-06-23T08:00:00.000Z"),
          endedAt: new Date("2026-06-23T08:30:00.000Z"),
        },
        whyImportant: ["Clustered 2 similar items"],
      },
    ],
    contextArtifacts: [],
    personalization: params.personalization,
    headline: "Workspace AI tooling reader summary",
    executiveSummary:
      "AI tooling discussion is repeating across monitored sources.",
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
        providerKey: params.providerKeys?.[0] ?? "reddit",
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
  listFailure?: Error;

  constructor(private readonly artifacts: readonly ReaderSummaryArtifact[]) {}

  async save(artifact: ReaderSummaryArtifact): Promise<void> {
    void artifact;
    return undefined;
  }

  async list(
    query: ListReaderSummaryArtifactsQuery,
  ): Promise<ListReaderSummaryArtifactsResult> {
    this.queries.push(query);
    if (this.listFailure !== undefined) {
      throw this.listFailure;
    }
    const offset = query.cursor === undefined ? 0 : Number(query.cursor);
    const items = this.artifacts.slice(offset, offset + query.limit);
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor:
        nextOffset < this.artifacts.length ? String(nextOffset) : undefined,
    };
  }

  async listPeriodSummaries(): Promise<ListReaderSummaryPeriodSummariesResult> {
    return { items: [] };
  }

  async findById(): Promise<ReaderSummaryArtifact | null> {
    return null;
  }

  async findRejectedDebugById(): Promise<null> {
    return null;
  }
}

class FailingReaderSummaryPreviewMediaEnricher implements
  ReaderSummaryPreviewMediaEnricherPort {
  async enrich(
    command: EnrichReaderSummaryPreviewMediaCommand,
  ): Promise<never> {
    void command;
    throw new Error("preview media unavailable");
  }
}

class FailingReaderSummaryCoverageCounter implements
  ReaderSummaryCoverageCounterPort {
  async countCollectedFeedItems(): Promise<never> {
    throw new Error("coverage unavailable");
  }

  async countCollectedFeedItemCoverage(): Promise<never> {
    throw new Error("coverage unavailable");
  }
}

class FakeReaderSummaryFreshnessProbe implements ReaderSummaryFreshnessProbePort {
  constructor(
    private readonly freshnessByWindowId: Readonly<
      Record<string, ReaderSummaryFreshness>
    > = {},
  ) {}

  async evaluate(
    query: Parameters<ReaderSummaryFreshnessProbePort["evaluate"]>[0],
  ): Promise<ReaderSummaryFreshness> {
    return (
      this.freshnessByWindowId[query.sourceWindow.windowId] ?? {
        status: "fresh",
        checkedAt: new Date("2026-06-23T08:40:00.000Z"),
      }
    );
  }
}

class ConcurrentFreshnessProbe implements ReaderSummaryFreshnessProbePort {
  private activeEvaluations = 0;
  maximumConcurrentEvaluations = 0;

  async evaluate(): Promise<ReaderSummaryFreshness> {
    this.activeEvaluations += 1;
    this.maximumConcurrentEvaluations = Math.max(
      this.maximumConcurrentEvaluations,
      this.activeEvaluations,
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    this.activeEvaluations -= 1;
    return {
      status: "fresh",
      checkedAt: new Date("2026-06-23T08:40:00.000Z"),
    };
  }
}
