import {
  type EventEnvelope,
  FixedClock,
  type IdGenerator,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import {
  type ReaderSummaryArtifact,
  ReaderSummaryJob,
  type ReaderSummaryPolicy,
  topicReaderSummaryScope,
} from "../../domain";
import type {
  ProviderReaderSummaryAttempt,
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryContextProviderPort,
  ReaderSummaryEvidenceSelectorPort,
  ReaderSummaryJobRepositoryPort,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelFailure,
  ReaderSummaryModelPort,
  ReaderSummaryModelRoute,
  ReaderSummaryModelValidationResult,
  ReaderSummaryPolicyRepositoryPort,
  SummaryEventPublisherPort,
  UserSummaryPreferenceReaderPort,
} from "../../ports";
import { ExecuteReaderSummaryJobUseCase } from "./execute-reader-summary-job.use-case";

class StaticIdGenerator implements IdGenerator {
  generate(): string {
    return "reader-summary-id-1";
  }
}

describe("ExecuteReaderSummaryJobUseCase", () => {
  it("rejects empty reader summary job ids with canonical language", async () => {
    const useCase = new ExecuteReaderSummaryJobUseCase(
      unused(),
      unused(),
      unused(),
      unused<ReaderSummaryEvidenceSelectorPort>(),
      unused(),
      unused(),
      new StaticIdGenerator(),
      new FixedClock(new Date("2026-06-23T08:31:00.000Z")),
      unused<ReaderSummaryContextProviderPort>(),
    );

    const result = await useCase.execute({
      tenantId: tenantId("tenant-reader-summary-use-case"),
      workspaceId: workspaceId("workspace-reader-summary-use-case"),
      readerSummaryJobId: "   ",
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "validation.failed",
        message: "Reader summary job id must be non-empty",
      }),
    });
  });

  it("applies user summary preferences and memory context to reader summary generation", async () => {
    const tenant = tenantId("tenant-reader-summary-use-case");
    const workspace = workspaceId("workspace-reader-summary-use-case");
    const jobs = new FakeReaderSummaryJobRepository();
    const artifacts = new FakeReaderSummaryArtifactRepository();
    const events = new CapturingSummaryEventPublisher();
    const requestedAt = new Date("2026-06-26T08:00:00.000Z");

    await jobs.save(ReaderSummaryJob.request({
      id: "reader-job-1",
      tenantId: tenant,
      workspaceId: workspace,
      scope: topicReaderSummaryScope("topic-reader-ai"),
      userId: "user-1",
      subscriptionId: "subscription-1",
      idempotencyKey: "reader-job-key-1",
      requestedAt,
    }));

    const result = await new ExecuteReaderSummaryJobUseCase(
      jobs,
      artifacts,
      new EmptyReaderSummaryPolicyRepository(),
      {
        async select() {
          return makeReaderEvidenceSelection();
        },
      },
      new CapturingReaderSummaryModel(),
      events,
      new StaticIdGenerator(),
      new FixedClock(new Date("2026-06-26T08:05:00.000Z")),
      {
        async buildContext() {
          return [
            {
              artifactId: "summary-memory:topic:topic-reader-ai",
              scope: topicReaderSummaryScope("topic-reader-ai"),
              summaryText: "User prefers risk-first summaries for runtime regressions.",
              generatedAt: requestedAt,
              freshness: "fresh",
            },
          ];
        },
      },
      {
        async findEffectivePreference() {
          return {
            tone: "concise",
            maxKeyPoints: 1,
            includeRisks: false,
            customInstructions: "Focus on runtime regressions.",
            rulesVersion: "summary.rules.user-preference.v1",
          };
        },
      } satisfies UserSummaryPreferenceReaderPort,
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: "reader-job-1",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        readerSummaryJobId: "reader-job-1",
        status: "completed",
        readerSummaryId: "reader-summary-id-1",
      },
    });

    const snapshot = artifacts.all()[0]?.toSnapshot();
    expect(snapshot).toMatchObject({
      userId: "user-1",
      subscriptionId: "subscription-1",
      executiveSummary: expect.stringContaining("Focus on runtime regressions."),
      risksAndUnknowns: [],
      lineage: expect.objectContaining({
        rulesVersion: "reader_summary.rules.policy.v1+summary.rules.user-preference.v1",
      }),
      contextArtifacts: [
        expect.objectContaining({
          artifactId: "summary-memory:topic:topic-reader-ai",
          summaryText: "User prefers risk-first summaries for runtime regressions.",
        }),
      ],
    });
    expect(snapshot?.topStories).toHaveLength(1);
    expect(events.all()).toContainEqual(expect.objectContaining({
      eventType: "reader_summary.ready",
      payload: expect.objectContaining({
        readerSummaryJobId: "reader-job-1",
        readerSummaryId: "reader-summary-id-1",
        userId: "user-1",
        subscriptionId: "subscription-1",
      }),
    }));
  });
});

const unused = <T>(): T => ({}) as T;

class FakeReaderSummaryJobRepository implements ReaderSummaryJobRepositoryPort {
  private readonly jobsById = new Map<string, ReaderSummaryJob>();

  async save(job: ReaderSummaryJob): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobsById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, job);
  }

  async findById(
    params: Parameters<ReaderSummaryJobRepositoryPort["findById"]>[0],
  ): Promise<ReaderSummaryJob | null> {
    return this.jobsById.get(`${params.tenantId}:${params.workspaceId}:${params.readerSummaryJobId}`) ?? null;
  }

  async findByIdempotencyKey(): Promise<ReaderSummaryJob | null> {
    return null;
  }

  async findRequested(): Promise<readonly ReaderSummaryJob[]> {
    return [];
  }

  async claimForExecution(
    params: Parameters<ReaderSummaryJobRepositoryPort["claimForExecution"]>[0],
  ): Promise<ReaderSummaryJob | null> {
    const job = await this.findById(params);
    if (job === null) {
      return null;
    }

    const running = job.start({ startedAt: params.startedAt });
    await this.save(running);

    return running;
  }
}

class FakeReaderSummaryArtifactRepository implements ReaderSummaryArtifactRepositoryPort {
  private readonly artifacts: ReaderSummaryArtifact[] = [];

  async save(artifact: ReaderSummaryArtifact): Promise<void> {
    this.artifacts.push(artifact);
  }

  async list(): Promise<Awaited<ReturnType<ReaderSummaryArtifactRepositoryPort["list"]>>> {
    return { items: this.artifacts };
  }

  async findById(): Promise<ReaderSummaryArtifact | null> {
    return this.artifacts[0] ?? null;
  }

  all(): readonly ReaderSummaryArtifact[] {
    return this.artifacts;
  }
}

class EmptyReaderSummaryPolicyRepository implements ReaderSummaryPolicyRepositoryPort {
  async save(): Promise<void> {}

  async findByScope(): Promise<ReaderSummaryPolicy | null> {
    return null;
  }
}

class CapturingSummaryEventPublisher implements SummaryEventPublisherPort {
  private readonly events: EventEnvelope<Readonly<Record<string, unknown>>>[] = [];

  async publish(event: EventEnvelope<Readonly<Record<string, unknown>>>): Promise<void> {
    this.events.push(event);
  }

  all(): readonly EventEnvelope<Readonly<Record<string, unknown>>>[] {
    return this.events;
  }
}

class CapturingReaderSummaryModel implements ReaderSummaryModelPort {
  route(): ReaderSummaryModelRoute {
    return {
      provider: "deterministic-local",
      model: "capturing-reader-summary-v1",
      promptVersion: "reader_summary.prompt.test.v1",
      schemaVersion: "reader_summary.artifact.v1",
    };
  }

  estimate(
    input?: Parameters<ReaderSummaryModelPort["estimate"]>[0],
    selectedRoute?: Parameters<ReaderSummaryModelPort["estimate"]>[1],
  ): ReaderSummaryModelEstimate {
    void input;
    void selectedRoute;

    return {
      inputTokens: 100,
      outputTokens: 100,
      estimatedCostUsd: 0,
    };
  }

  async generate(
    input: Parameters<ReaderSummaryModelPort["generate"]>[0],
    selectedRoute: ReaderSummaryModelRoute,
  ): Promise<ProviderReaderSummaryAttempt> {
    const firstItem = input.evidence.selectedEvidence[0];
    const firstCluster = input.evidence.clusters[0];
    if (firstItem === undefined || firstCluster === undefined) {
      throw new Error("Test evidence must include one item and cluster");
    }

    return {
      route: selectedRoute,
      draft: {
        headline: firstItem.title,
        executiveSummary: `Custom focus: ${input.policy.customInstructions ?? "none"}`,
        topStories: [
          {
            storyClusterId: firstCluster.id,
            title: firstItem.title,
            summary: "Selected because it matches the reader preference.",
            topicIds: firstCluster.topicIds,
            providerKeys: firstCluster.providerKeys,
            citationIds: ["c1"],
          },
        ],
        topicHighlights: [],
        repeatedSignals: [],
        risksAndUnknowns: input.policy.includeRisks
          ? [
              {
                description: "Risk enabled by policy.",
                citationIds: ["c1"],
                reason: "source_limit",
              },
            ]
          : [],
        citationMap: [
          {
            citationId: "c1",
            feedItemId: firstItem.feedItemId,
            sourceItemId: firstItem.sourceItemId,
            providerKey: firstItem.providerKey,
            field: "title",
            canonicalUrl: firstItem.canonicalUrl,
          },
        ],
        qualityFlags: [],
        confidence: {
          level: "medium",
          score: 0.7,
          rationale: "Test model received selected evidence.",
        },
        lineage: {
          promptVersion: selectedRoute.promptVersion,
          schemaVersion: selectedRoute.schemaVersion,
          modelVersion: selectedRoute.model,
          providerVersion: selectedRoute.provider,
          rulesVersion: input.policy.rulesVersion,
          evalDatasetVersion: "reader_summary.eval.test.v1",
          rankingPolicyVersion: input.evidence.rankingPolicyVersion,
        },
        usage: this.estimate(input, selectedRoute),
      },
    };
  }

  validateRawProviderResponse(): ReaderSummaryModelValidationResult {
    return { ok: true };
  }

  classifyError(error: unknown): ReaderSummaryModelFailure {
    return {
      kind: "unknown",
      retryable: false,
      message: error instanceof Error ? error.message : "unknown test error",
    };
  }
}

const makeReaderEvidenceSelection = () => ({
  rankingPolicyVersion: "story-ranking.v1",
  sourceWindow: {
    windowId: "window-1",
    startedAt: new Date("2026-06-26T07:00:00.000Z"),
    endedAt: new Date("2026-06-26T08:00:00.000Z"),
    selectedFeedItemIds: ["feed-1", "feed-2"],
    storyClusterIds: ["cluster-1", "cluster-2"],
  },
  clusters: [
    {
      id: "cluster-1",
      storyKey: "runtime-regression",
      representativeFeedItemId: "feed-1",
      duplicateFeedItemIds: [],
      topicIds: ["topic-reader-ai"],
      providerKeys: ["reddit"],
      score: 1,
      observedAtRange: {
        startedAt: new Date("2026-06-26T07:20:00.000Z"),
        endedAt: new Date("2026-06-26T07:20:00.000Z"),
      },
      whyImportant: ["Matches user preference"],
    },
    {
      id: "cluster-2",
      storyKey: "github-release",
      representativeFeedItemId: "feed-2",
      duplicateFeedItemIds: [],
      topicIds: ["topic-reader-ai"],
      providerKeys: ["github-trending-page"],
      score: 0.9,
      observedAtRange: {
        startedAt: new Date("2026-06-26T07:30:00.000Z"),
        endedAt: new Date("2026-06-26T07:30:00.000Z"),
      },
      whyImportant: ["Strong source engagement signal"],
    },
  ],
  selectedEvidence: [
    {
      feedItemId: "feed-1",
      sourceItemId: "reddit-post-1",
      sourceBindingId: "binding-reddit",
      topicId: "topic-reader-ai",
      providerKey: "reddit",
      providerName: "Reddit",
      canonicalUrl: "https://reddit.example.test/post-1",
      title: "Runtime regression discussion",
      bodyPreview: "Users are discussing a runtime regression.",
      publishedAt: new Date("2026-06-26T07:10:00.000Z"),
      observedAt: new Date("2026-06-26T07:20:00.000Z"),
      score: 1,
      whyImportant: ["Matches user preference"],
    },
    {
      feedItemId: "feed-2",
      sourceItemId: "github-trending-1",
      sourceBindingId: "binding-github",
      topicId: "topic-reader-ai",
      providerKey: "github-trending-page",
      providerName: "GitHub Trending",
      canonicalUrl: "https://github.com/example/project",
      title: "Example project trends on GitHub",
      publishedAt: new Date("2026-06-26T07:20:00.000Z"),
      observedAt: new Date("2026-06-26T07:30:00.000Z"),
      score: 0.9,
      whyImportant: ["Strong source engagement signal"],
    },
  ],
});
