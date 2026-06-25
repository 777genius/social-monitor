import {
  type EventEnvelope,
  FixedClock,
  type IdGenerator,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import {
  type GeneratedReaderSummaryDraft,
  ReaderSummaryJob,
  type ReaderSummaryArtifact,
  type ReaderSummaryPolicy,
} from "../../domain";
import { ReaderSummaryLegacyEventPublisherAdapter } from "./reader-summary-legacy-event-publisher.adapter";
import type {
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryContextProviderPort,
  ReaderSummaryEvidenceSelectorPort,
  ReaderSummaryJobRepositoryPort,
  ReaderSummaryModelBudget,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelFailure,
  ReaderSummaryModelInput,
  ReaderSummaryModelPolicy,
  ReaderSummaryModelPort,
  ReaderSummaryModelRoute,
  ReaderSummaryModelValidationResult,
  ReaderSummaryPolicyRepositoryPort,
  ProviderReaderSummaryAttempt,
  SummaryEventPublisherPort,
} from "../../ports";
import { ExecuteReaderSummaryJobUseCase } from "../../features/execute-reader-summary-job/execute-reader-summary-job.use-case";

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `reader-summary-id-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class SelectedEvidenceSelector implements ReaderSummaryEvidenceSelectorPort {
  async select(): ReturnType<ReaderSummaryEvidenceSelectorPort["select"]> {
    return {
      rankingPolicyVersion: "story_ranking_v1",
      sourceWindow: {
        windowId: "workspace:selected",
        startedAt: new Date("2026-06-23T08:00:00.000Z"),
        endedAt: new Date("2026-06-23T08:30:00.000Z"),
        selectedFeedItemIds: ["feed-reddit"],
        storyClusterIds: ["story:ai-tooling"],
      },
      clusters: [
        {
          id: "story:ai-tooling",
          storyKey: "url:example.com/ai-tooling",
          representativeFeedItemId: "feed-reddit",
          duplicateFeedItemIds: ["feed-github"],
          topicIds: ["topic-ai", "topic-github"],
          providerKeys: ["github", "reddit"],
          score: 2.4,
          observedAtRange: {
            startedAt: new Date("2026-06-23T08:00:00.000Z"),
            endedAt: new Date("2026-06-23T08:30:00.000Z"),
          },
          whyImportant: ["Clustered 2 similar items"],
        },
      ],
      selectedEvidence: [
        {
          feedItemId: "feed-reddit",
          sourceItemId: "source-reddit",
          sourceBindingId: "binding-reddit",
          topicId: "topic-ai",
          providerKey: "reddit",
          canonicalUrl: "https://example.com/ai-tooling",
          title: "AI tooling library is trending",
          bodyPreview: "Developers are discussing a new AI tooling library.",
          publishedAt: new Date("2026-06-23T08:00:00.000Z"),
          observedAt: new Date("2026-06-23T08:01:00.000Z"),
          score: 2.4,
          whyImportant: ["Fresh item in the current monitoring window"],
        },
      ],
    };
  }
}

class EmptyEvidenceSelector implements ReaderSummaryEvidenceSelectorPort {
  async select(): ReturnType<ReaderSummaryEvidenceSelectorPort["select"]> {
    return {
      rankingPolicyVersion: "story_ranking_v1",
      sourceWindow: {
        windowId: "workspace:empty",
        startedAt: new Date("2026-06-23T08:00:00.000Z"),
        endedAt: new Date("2026-06-23T08:00:01.000Z"),
        selectedFeedItemIds: [],
        storyClusterIds: [],
      },
      clusters: [],
      selectedEvidence: [],
    };
  }
}

class ValidReaderSummaryModel implements ReaderSummaryModelPort {
  route(): ReaderSummaryModelRoute {
    return {
      provider: "fake",
      model: "fake-model",
      promptVersion: "reader_summary.prompt.test.v1",
      schemaVersion: "reader_summary.artifact.v1",
    };
  }

  estimate(): ReaderSummaryModelEstimate {
    return {
      inputTokens: 20,
      outputTokens: 10,
      estimatedCostUsd: 0,
    };
  }

  async generate(
    input: ReaderSummaryModelInput,
    route: ReaderSummaryModelRoute,
  ): Promise<ProviderReaderSummaryAttempt> {
    const draft =
      input.evidence.selectedEvidence.length === 0
        ? noSignalDraft(route)
        : selectedEvidenceDraft(route);

    return { route, draft };
  }

  validateRawProviderResponse(): ReaderSummaryModelValidationResult {
    return { ok: true };
  }

  classifyError(error: unknown): ReaderSummaryModelFailure {
    const message = error instanceof Error ? error.message : "Unknown error";

    return {
      kind: message.toLowerCase().includes("citation")
        ? "citation_validation_failed"
        : "unknown",
      retryable: false,
      message,
    };
  }
}

class InvalidCitationReaderSummaryModel implements ReaderSummaryModelPort {
  route(): ReaderSummaryModelRoute {
    return {
      provider: "fake",
      model: "fake-model",
      promptVersion: "reader_summary.prompt.test.v1",
      schemaVersion: "reader_summary.artifact.v1",
    };
  }

  estimate(): ReaderSummaryModelEstimate {
    return {
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    };
  }

  async generate(
    input: ReaderSummaryModelInput,
    route: ReaderSummaryModelRoute,
  ): Promise<ProviderReaderSummaryAttempt> {
    void input;

    return {
      route,
      draft: {
        headline: "Invalid citation reader summary",
        executiveSummary:
          "This draft cites evidence outside the selected window.",
        topStories: [
          {
            storyClusterId: "story:ai-tooling",
            title: "Invalid story",
            summary: "Invalid citation.",
            topicIds: ["topic-ai", "topic-github"],
            providerKeys: ["reddit"],
            citationIds: ["c1"],
          },
        ],
        topicHighlights: [],
        repeatedSignals: [],
        risksAndUnknowns: [],
        citationMap: [
          {
            citationId: "c1",
            feedItemId: "feed-outside-window",
            sourceItemId: "source-outside",
            providerKey: "reddit",
            field: "title",
          },
        ],
        qualityFlags: [],
        confidence: {
          level: "low",
          score: 0.2,
          rationale: "Invalid citation fixture.",
        },
        lineage: {
          promptVersion: route.promptVersion,
          schemaVersion: route.schemaVersion,
          modelVersion: route.model,
          providerVersion: route.provider,
          rulesVersion: "reader_summary.rules.test.v1",
          evalDatasetVersion: "reader_summary.eval.test.v1",
        },
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          estimatedCostUsd: 0,
        },
      } satisfies GeneratedReaderSummaryDraft,
    };
  }

  validateRawProviderResponse(): ReaderSummaryModelValidationResult {
    return { ok: true };
  }

  classifyError(error: unknown): ReaderSummaryModelFailure {
    const message = error instanceof Error ? error.message : "Unknown error";

    return {
      kind: message.toLowerCase().includes("citation")
        ? "citation_validation_failed"
        : "unknown",
      retryable: false,
      message,
    };
  }
}

const selectedEvidenceDraft = (
  route: ReaderSummaryModelRoute,
): GeneratedReaderSummaryDraft => ({
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
  topicHighlights: [
    {
      topicId: "topic-ai",
      title: "Developer attention is rising",
      summary:
        "The selected Reddit evidence points to fresh AI tooling interest.",
      citationIds: ["c1"],
    },
  ],
  repeatedSignals: [
    {
      storyClusterId: "story:ai-tooling",
      title: "AI tooling library is trending",
      topicIds: ["topic-ai", "topic-github"],
      citationIds: ["c1"],
    },
  ],
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
    promptVersion: route.promptVersion,
    schemaVersion: route.schemaVersion,
    modelVersion: route.model,
    providerVersion: route.provider,
    rulesVersion: "reader_summary.rules.test.v1",
    evalDatasetVersion: "reader_summary.eval.test.v1",
  },
  usage: {
    inputTokens: 20,
    outputTokens: 10,
    estimatedCostUsd: 0,
  },
});

const noSignalDraft = (
  route: ReaderSummaryModelRoute,
): GeneratedReaderSummaryDraft => ({
  headline: "No new workspace signals",
  executiveSummary:
    "No eligible evidence items were selected for this summary scope.",
  topStories: [],
  topicHighlights: [],
  repeatedSignals: [],
  risksAndUnknowns: [
    {
      description: "No source evidence was available in the selected window.",
      reason: "insufficient_evidence",
    },
  ],
  citationMap: [],
  qualityFlags: ["no_signal", "limited_sources"],
  confidence: {
    level: "none",
    score: 0,
    rationale: "No selected evidence.",
  },
  lineage: {
    promptVersion: route.promptVersion,
    schemaVersion: route.schemaVersion,
    modelVersion: route.model,
    providerVersion: route.provider,
    rulesVersion: "reader_summary.rules.test.v1",
    evalDatasetVersion: "reader_summary.eval.test.v1",
  },
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
  },
  noSignalReason: "No eligible evidence items selected for this summary scope.",
});

const tenant = tenantId("tenant-1");
const workspace = workspaceId("workspace-1");

const createRequestedJob = async (jobs: ReaderSummaryJobRepositoryPort) => {
  await jobs.save(
    ReaderSummaryJob.request({
      id: "reader-summary-job-1",
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      idempotencyKey: "reader-summary-1",
      requestedAt: new Date("2026-06-23T07:59:00.000Z"),
    }),
  );
};

const createUseCase = (params: {
  readonly jobs: ReaderSummaryJobRepositoryPort;
  readonly artifacts: ReaderSummaryArtifactRepositoryPort;
  readonly evidenceSelector: ReaderSummaryEvidenceSelectorPort;
  readonly model?: ReaderSummaryModelPort;
  readonly events?: FakeSummaryEventPublisher;
  readonly contextProvider?: ReaderSummaryContextProviderPort;
}) =>
  new ExecuteReaderSummaryJobUseCase(
    params.jobs,
    params.artifacts,
    new FakeReaderSummaryPolicyRepository(),
    params.evidenceSelector,
    params.model ?? new ValidReaderSummaryModel(),
    new ReaderSummaryLegacyEventPublisherAdapter(
      params.events ?? new FakeSummaryEventPublisher(),
    ),
    new SequenceIdGenerator(),
    new FixedClock(new Date("2026-06-23T08:31:00.000Z")),
    params.contextProvider ?? {
      async buildContext() {
        return [];
      },
    },
  );

describe("ExecuteReaderSummaryJobUseCase legacy event ACL adapters", () => {
  it("generates and stores a workspace reader summary from selected evidence", async () => {
    const jobs = new FakeReaderSummaryJobRepository();
    const artifacts = new FakeReaderSummaryArtifactRepository();
    const events = new FakeSummaryEventPublisher();
    await createRequestedJob(jobs);
    const useCase = createUseCase({
      jobs,
      artifacts,
      evidenceSelector: new SelectedEvidenceSelector(),
      events,
    });

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: "reader-summary-job-1",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        readerSummaryJobId: "reader-summary-job-1",
        status: "completed",
        readerSummaryId: "reader-summary-id-1",
      },
    });
    expect(artifacts.all()[0]?.toSnapshot()).toMatchObject({
      readerSummaryId: "reader-summary-id-1",
      scope: { type: "workspace" },
      repeatedSignals: [
        expect.objectContaining({
          storyClusterId: "story:ai-tooling",
          topicIds: ["topic-ai", "topic-github"],
        }),
      ],
    });
    expect(events.all()[0]).toMatchObject({
      eventType: "briefing.ready",
      payload: {
        briefingJobId: "reader-summary-job-1",
        briefingId: "reader-summary-id-1",
        status: "completed",
      },
    } satisfies Partial<EventEnvelope<Readonly<Record<string, unknown>>>>);
  });

  it("stores a no-signal reader summary when no evidence is selected", async () => {
    const jobs = new FakeReaderSummaryJobRepository();
    const artifacts = new FakeReaderSummaryArtifactRepository();
    await createRequestedJob(jobs);
    const useCase = createUseCase({
      jobs,
      artifacts,
      evidenceSelector: new EmptyEvidenceSelector(),
    });

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: "reader-summary-job-1",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        readerSummaryJobId: "reader-summary-job-1",
        status: "no_signal",
        readerSummaryId: "reader-summary-id-1",
      },
    });
    expect(artifacts.all()[0]?.toSnapshot()).toMatchObject({
      qualityFlags: ["no_signal", "limited_sources"],
      noSignalReason:
        "No eligible evidence items selected for this summary scope.",
    });
  });

  it("marks the reader summary degraded when optional context is unavailable", async () => {
    const jobs = new FakeReaderSummaryJobRepository();
    const artifacts = new FakeReaderSummaryArtifactRepository();
    await createRequestedJob(jobs);
    const useCase = createUseCase({
      jobs,
      artifacts,
      evidenceSelector: new SelectedEvidenceSelector(),
      contextProvider: new FailingReaderSummaryContextProvider(),
    });

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: "reader-summary-job-1",
    });

    expect(result.ok).toBe(true);
    expect(artifacts.all()[0]?.toSnapshot()).toMatchObject({
      qualityFlags: ["context_unavailable"],
      risksAndUnknowns: [
        expect.objectContaining({
          reason: "provider_outage",
        }),
      ],
    });
  });

  it("fails the job when the model cites outside selected feed evidence", async () => {
    const jobs = new FakeReaderSummaryJobRepository();
    const artifacts = new FakeReaderSummaryArtifactRepository();
    await createRequestedJob(jobs);
    const useCase = createUseCase({
      jobs,
      artifacts,
      evidenceSelector: new SelectedEvidenceSelector(),
      model: new InvalidCitationReaderSummaryModel(),
    });

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: "reader-summary-job-1",
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "external.dependency_unavailable",
        details: {
          kind: "citation_validation_failed",
        },
      }),
    });
    expect(artifacts.all()).toHaveLength(0);
    await expect(
      jobs.findById({
        tenantId: tenant,
        workspaceId: workspace,
        readerSummaryJobId: "reader-summary-job-1",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        toSnapshot: expect.any(Function),
      }),
    );
  });
});

class FakeReaderSummaryJobRepository implements ReaderSummaryJobRepositoryPort {
  private readonly jobsById = new Map<string, ReaderSummaryJob>();
  private readonly jobsByIdempotencyKey = new Map<string, ReaderSummaryJob>();

  async save(job: ReaderSummaryJob): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobsById.set(snapshot.id, job);
    this.jobsByIdempotencyKey.set(snapshot.idempotencyKey, job);
  }

  async findById(
    params: Parameters<ReaderSummaryJobRepositoryPort["findById"]>[0],
  ): Promise<ReaderSummaryJob | null> {
    const job = this.jobsById.get(params.readerSummaryJobId);
    return job?.toSnapshot().tenantId === params.tenantId &&
      job.toSnapshot().workspaceId === params.workspaceId
      ? job
      : null;
  }

  async findByIdempotencyKey(
    params: Parameters<
      ReaderSummaryJobRepositoryPort["findByIdempotencyKey"]
    >[0],
  ): Promise<ReaderSummaryJob | null> {
    const job = this.jobsByIdempotencyKey.get(params.idempotencyKey);
    return job?.toSnapshot().tenantId === params.tenantId &&
      job.toSnapshot().workspaceId === params.workspaceId
      ? job
      : null;
  }

  async findRequested(
    params: Parameters<ReaderSummaryJobRepositoryPort["findRequested"]>[0],
  ): Promise<readonly ReaderSummaryJob[]> {
    return [...this.jobsById.values()]
      .filter((job) => {
        const snapshot = job.toSnapshot();
        return (
          snapshot.status === "requested" &&
          (params.tenantId === undefined ||
            snapshot.tenantId === params.tenantId) &&
          (params.workspaceId === undefined ||
            snapshot.workspaceId === params.workspaceId)
        );
      })
      .slice(0, params.limit);
  }

  async claimForExecution(
    params: Parameters<ReaderSummaryJobRepositoryPort["claimForExecution"]>[0],
  ): ReturnType<ReaderSummaryJobRepositoryPort["claimForExecution"]> {
    const job = await this.findById(params);
    if (job === null) {
      return null;
    }

    const snapshot = job.toSnapshot();
    if (snapshot.status !== "requested" && snapshot.status !== "failed") {
      return null;
    }

    const executableJob =
      snapshot.status === "failed"
        ? job.retry({ requestedAt: params.requestedAt })
        : job;
    const runningJob = executableJob.start({ startedAt: params.startedAt });
    await this.save(runningJob);

    return runningJob;
  }
}

class FakeReaderSummaryArtifactRepository implements ReaderSummaryArtifactRepositoryPort {
  private readonly artifactsById = new Map<string, ReaderSummaryArtifact>();

  async save(artifact: ReaderSummaryArtifact): Promise<void> {
    this.artifactsById.set(artifact.toSnapshot().readerSummaryId, artifact);
  }

  async list(
    params: Parameters<ReaderSummaryArtifactRepositoryPort["list"]>[0],
  ): ReturnType<ReaderSummaryArtifactRepositoryPort["list"]> {
    const items = [...this.artifactsById.values()]
      .filter((artifact) => {
        const snapshot = artifact.toSnapshot();
        return (
          snapshot.tenantId === params.tenantId &&
          snapshot.workspaceId === params.workspaceId
        );
      })
      .slice(0, params.limit);
    return { items };
  }

  async findById(
    params: Parameters<ReaderSummaryArtifactRepositoryPort["findById"]>[0],
  ): Promise<ReaderSummaryArtifact | null> {
    const artifact = this.artifactsById.get(params.readerSummaryId);
    return artifact?.toSnapshot().tenantId === params.tenantId &&
      artifact.toSnapshot().workspaceId === params.workspaceId
      ? artifact
      : null;
  }

  all(): readonly ReaderSummaryArtifact[] {
    return [...this.artifactsById.values()];
  }
}

class FakeReaderSummaryPolicyRepository implements ReaderSummaryPolicyRepositoryPort {
  async save(_policy: ReaderSummaryPolicy): Promise<void> {
    return undefined;
  }

  async findByScope(): Promise<ReaderSummaryPolicy | null> {
    return null;
  }
}

class FailingReaderSummaryContextProvider implements ReaderSummaryContextProviderPort {
  async buildContext(): ReturnType<
    ReaderSummaryContextProviderPort["buildContext"]
  > {
    throw new Error("context provider unavailable");
  }
}

class FakeSummaryEventPublisher implements SummaryEventPublisherPort {
  private readonly events: EventEnvelope<Readonly<Record<string, unknown>>>[] =
    [];

  async publish(
    event: EventEnvelope<Readonly<Record<string, unknown>>>,
  ): Promise<void> {
    this.events.push(event);
  }

  all(): readonly EventEnvelope<Readonly<Record<string, unknown>>>[] {
    return [...this.events];
  }
}
