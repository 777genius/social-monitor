import {
  type EventEnvelope,
  FixedClock,
  type IdGenerator,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import {
  BriefingJob,
  type BriefingArtifact,
  type BriefingPolicy,
  type GeneratedBriefingDraft,
} from '../../domain';
import type {
  BriefingArtifactRepositoryPort,
  BriefingContextProviderPort,
  BriefingEvidenceSelectorPort,
  BriefingJobRepositoryPort,
  BriefingModelBudget,
  BriefingModelEstimate,
  BriefingModelFailure,
  BriefingModelInput,
  BriefingModelPolicy,
  BriefingModelPort,
  BriefingModelRoute,
  BriefingModelValidationResult,
  BriefingPolicyRepositoryPort,
  ProviderBriefingAttempt,
  SummaryEventPublisherPort,
} from '../../ports';
import { ExecuteBriefingJobUseCase } from './execute-briefing-job.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `briefing-id-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class SelectedEvidenceSelector implements BriefingEvidenceSelectorPort {
  async select(): ReturnType<BriefingEvidenceSelectorPort['select']> {
    return {
      rankingPolicyVersion: 'story_ranking_v1',
      sourceWindow: {
        windowId: 'workspace:selected',
        startedAt: new Date('2026-06-23T08:00:00.000Z'),
        endedAt: new Date('2026-06-23T08:30:00.000Z'),
        selectedFeedItemIds: ['feed-reddit'],
        storyClusterIds: ['story:ai-tooling'],
      },
      clusters: [
        {
          id: 'story:ai-tooling',
          storyKey: 'url:example.com/ai-tooling',
          representativeFeedItemId: 'feed-reddit',
          duplicateFeedItemIds: ['feed-github'],
          topicIds: ['topic-ai', 'topic-github'],
          providerKeys: ['github', 'reddit'],
          score: 2.4,
          observedAtRange: {
            startedAt: new Date('2026-06-23T08:00:00.000Z'),
            endedAt: new Date('2026-06-23T08:30:00.000Z'),
          },
          whyImportant: ['Clustered 2 similar items'],
        },
      ],
      selectedEvidence: [
        {
          feedItemId: 'feed-reddit',
          sourceItemId: 'source-reddit',
          sourceBindingId: 'binding-reddit',
          topicId: 'topic-ai',
          providerKey: 'reddit',
          canonicalUrl: 'https://example.com/ai-tooling',
          title: 'AI tooling library is trending',
          bodyPreview: 'Developers are discussing a new AI tooling library.',
          publishedAt: new Date('2026-06-23T08:00:00.000Z'),
          observedAt: new Date('2026-06-23T08:01:00.000Z'),
          score: 2.4,
          whyImportant: ['Fresh item in the current monitoring window'],
        },
      ],
    };
  }
}

class EmptyEvidenceSelector implements BriefingEvidenceSelectorPort {
  async select(): ReturnType<BriefingEvidenceSelectorPort['select']> {
    return {
      rankingPolicyVersion: 'story_ranking_v1',
      sourceWindow: {
        windowId: 'workspace:empty',
        startedAt: new Date('2026-06-23T08:00:00.000Z'),
        endedAt: new Date('2026-06-23T08:00:01.000Z'),
        selectedFeedItemIds: [],
        storyClusterIds: [],
      },
      clusters: [],
      selectedEvidence: [],
    };
  }
}

class ValidBriefingModel implements BriefingModelPort {
  route(): BriefingModelRoute {
    return {
      provider: 'fake',
      model: 'fake-model',
      promptVersion: 'briefing.prompt.test.v1',
      schemaVersion: 'briefing.artifact.v1',
    };
  }

  estimate(): BriefingModelEstimate {
    return {
      inputTokens: 20,
      outputTokens: 10,
      estimatedCostUsd: 0,
    };
  }

  async generate(
    input: BriefingModelInput,
    route: BriefingModelRoute,
  ): Promise<ProviderBriefingAttempt> {
    const draft =
      input.evidence.selectedEvidence.length === 0
        ? noSignalDraft(route)
        : selectedEvidenceDraft(route);

    return { route, draft };
  }

  validateRawProviderResponse(): BriefingModelValidationResult {
    return { ok: true };
  }

  classifyError(error: unknown): BriefingModelFailure {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return {
      kind: message.toLowerCase().includes('citation')
        ? 'citation_validation_failed'
        : 'unknown',
      retryable: false,
      message,
    };
  }
}

class InvalidCitationBriefingModel implements BriefingModelPort {
  route(): BriefingModelRoute {
    return {
      provider: 'fake',
      model: 'fake-model',
      promptVersion: 'briefing.prompt.test.v1',
      schemaVersion: 'briefing.artifact.v1',
    };
  }

  estimate(): BriefingModelEstimate {
    return {
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    };
  }

  async generate(
    input: BriefingModelInput,
    route: BriefingModelRoute,
  ): Promise<ProviderBriefingAttempt> {
    void input;

    return {
      route,
      draft: {
        headline: 'Invalid citation briefing',
        executiveSummary:
          'This draft cites evidence outside the selected window.',
        topStories: [
          {
            storyClusterId: 'story:ai-tooling',
            title: 'Invalid story',
            summary: 'Invalid citation.',
            topicIds: ['topic-ai', 'topic-github'],
            providerKeys: ['reddit'],
            citationIds: ['c1'],
          },
        ],
        topicHighlights: [],
        repeatedSignals: [],
        risksAndUnknowns: [],
        citationMap: [
          {
            citationId: 'c1',
            feedItemId: 'feed-outside-window',
            sourceItemId: 'source-outside',
            providerKey: 'reddit',
            field: 'title',
          },
        ],
        qualityFlags: [],
        confidence: {
          level: 'low',
          score: 0.2,
          rationale: 'Invalid citation fixture.',
        },
        lineage: {
          promptVersion: route.promptVersion,
          schemaVersion: route.schemaVersion,
          modelVersion: route.model,
          providerVersion: route.provider,
          rulesVersion: 'briefing.rules.test.v1',
          evalDatasetVersion: 'briefing.eval.test.v1',
        },
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          estimatedCostUsd: 0,
        },
      } satisfies GeneratedBriefingDraft,
    };
  }

  validateRawProviderResponse(): BriefingModelValidationResult {
    return { ok: true };
  }

  classifyError(error: unknown): BriefingModelFailure {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return {
      kind: message.toLowerCase().includes('citation')
        ? 'citation_validation_failed'
        : 'unknown',
      retryable: false,
      message,
    };
  }
}

const selectedEvidenceDraft = (
  route: BriefingModelRoute,
): GeneratedBriefingDraft => ({
  headline: 'Workspace AI tooling briefing',
  executiveSummary:
    'AI tooling discussion is repeating across monitored sources.',
  topStories: [
    {
      storyClusterId: 'story:ai-tooling',
      title: 'AI tooling library is trending',
      summary:
        'Developers are discussing a new AI tooling library across Reddit and GitHub.',
      topicIds: ['topic-ai', 'topic-github'],
      providerKeys: ['reddit', 'github'],
      citationIds: ['c1'],
    },
  ],
  topicHighlights: [
    {
      topicId: 'topic-ai',
      title: 'Developer attention is rising',
      summary:
        'The selected Reddit evidence points to fresh AI tooling interest.',
      citationIds: ['c1'],
    },
  ],
  repeatedSignals: [
    {
      storyClusterId: 'story:ai-tooling',
      title: 'AI tooling library is trending',
      topicIds: ['topic-ai', 'topic-github'],
      citationIds: ['c1'],
    },
  ],
  risksAndUnknowns: [],
  citationMap: [
    {
      citationId: 'c1',
      feedItemId: 'feed-reddit',
      sourceItemId: 'source-reddit',
      providerKey: 'reddit',
      field: 'title',
    },
  ],
  qualityFlags: [],
  confidence: {
    level: 'medium',
    score: 0.72,
    rationale: 'Evidence is clustered across two providers.',
  },
  lineage: {
    promptVersion: route.promptVersion,
    schemaVersion: route.schemaVersion,
    modelVersion: route.model,
    providerVersion: route.provider,
    rulesVersion: 'briefing.rules.test.v1',
    evalDatasetVersion: 'briefing.eval.test.v1',
  },
  usage: {
    inputTokens: 20,
    outputTokens: 10,
    estimatedCostUsd: 0,
  },
});

const noSignalDraft = (route: BriefingModelRoute): GeneratedBriefingDraft => ({
  headline: 'No new workspace signals',
  executiveSummary:
    'No eligible evidence items were selected for this summary scope.',
  topStories: [],
  topicHighlights: [],
  repeatedSignals: [],
  risksAndUnknowns: [
    {
      description: 'No source evidence was available in the selected window.',
      reason: 'insufficient_evidence',
    },
  ],
  citationMap: [],
  qualityFlags: ['no_signal', 'limited_sources'],
  confidence: {
    level: 'none',
    score: 0,
    rationale: 'No selected evidence.',
  },
  lineage: {
    promptVersion: route.promptVersion,
    schemaVersion: route.schemaVersion,
    modelVersion: route.model,
    providerVersion: route.provider,
    rulesVersion: 'briefing.rules.test.v1',
    evalDatasetVersion: 'briefing.eval.test.v1',
  },
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
  },
  noSignalReason: 'No eligible evidence items selected for this summary scope.',
});

const tenant = tenantId('tenant-1');
const workspace = workspaceId('workspace-1');

const createRequestedJob = async (jobs: BriefingJobRepositoryPort) => {
  await jobs.save(
    BriefingJob.request({
      id: 'briefing-job-1',
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: 'workspace' },
      idempotencyKey: 'briefing-1',
      requestedAt: new Date('2026-06-23T07:59:00.000Z'),
    }),
  );
};

const createUseCase = (params: {
  readonly jobs: BriefingJobRepositoryPort;
  readonly artifacts: BriefingArtifactRepositoryPort;
  readonly evidenceSelector: BriefingEvidenceSelectorPort;
  readonly model?: BriefingModelPort;
  readonly events?: FakeSummaryEventPublisher;
  readonly contextProvider?: BriefingContextProviderPort;
}) =>
  new ExecuteBriefingJobUseCase(
    params.jobs,
    params.artifacts,
    new FakeBriefingPolicyRepository(),
    params.evidenceSelector,
    params.model ?? new ValidBriefingModel(),
    params.events ?? new FakeSummaryEventPublisher(),
    new SequenceIdGenerator(),
    new FixedClock(new Date('2026-06-23T08:31:00.000Z')),
    params.contextProvider,
  );

describe('ExecuteBriefingJobUseCase', () => {
  it('generates and stores a workspace briefing from selected evidence', async () => {
    const jobs = new FakeBriefingJobRepository();
    const artifacts = new FakeBriefingArtifactRepository();
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
      briefingJobId: 'briefing-job-1',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        briefingJobId: 'briefing-job-1',
        status: 'completed',
        briefingId: 'briefing-id-1',
      },
    });
    expect(artifacts.all()[0]?.toSnapshot()).toMatchObject({
      briefingId: 'briefing-id-1',
      scope: { type: 'workspace' },
      repeatedSignals: [
        expect.objectContaining({
          storyClusterId: 'story:ai-tooling',
          topicIds: ['topic-ai', 'topic-github'],
        }),
      ],
    });
    expect(events.all()[0]).toMatchObject({
      eventType: 'briefing.ready',
      payload: {
        briefingJobId: 'briefing-job-1',
        briefingId: 'briefing-id-1',
        status: 'completed',
      },
    } satisfies Partial<EventEnvelope<Readonly<Record<string, unknown>>>>);
  });

  it('stores a no-signal briefing when no evidence is selected', async () => {
    const jobs = new FakeBriefingJobRepository();
    const artifacts = new FakeBriefingArtifactRepository();
    await createRequestedJob(jobs);
    const useCase = createUseCase({
      jobs,
      artifacts,
      evidenceSelector: new EmptyEvidenceSelector(),
    });

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      briefingJobId: 'briefing-job-1',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        briefingJobId: 'briefing-job-1',
        status: 'no_signal',
        briefingId: 'briefing-id-1',
      },
    });
    expect(artifacts.all()[0]?.toSnapshot()).toMatchObject({
      qualityFlags: ['no_signal', 'limited_sources'],
      noSignalReason:
        'No eligible evidence items selected for this summary scope.',
    });
  });

  it('marks the briefing degraded when optional context is unavailable', async () => {
    const jobs = new FakeBriefingJobRepository();
    const artifacts = new FakeBriefingArtifactRepository();
    await createRequestedJob(jobs);
    const useCase = createUseCase({
      jobs,
      artifacts,
      evidenceSelector: new SelectedEvidenceSelector(),
      contextProvider: new FailingBriefingContextProvider(),
    });

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      briefingJobId: 'briefing-job-1',
    });

    expect(result.ok).toBe(true);
    expect(artifacts.all()[0]?.toSnapshot()).toMatchObject({
      qualityFlags: ['context_unavailable'],
      risksAndUnknowns: [
        expect.objectContaining({
          reason: 'provider_outage',
        }),
      ],
    });
  });

  it('fails the job when the model cites outside selected feed evidence', async () => {
    const jobs = new FakeBriefingJobRepository();
    const artifacts = new FakeBriefingArtifactRepository();
    await createRequestedJob(jobs);
    const useCase = createUseCase({
      jobs,
      artifacts,
      evidenceSelector: new SelectedEvidenceSelector(),
      model: new InvalidCitationBriefingModel(),
    });

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      briefingJobId: 'briefing-job-1',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'external.dependency_unavailable',
        details: {
          kind: 'citation_validation_failed',
        },
      }),
    });
    expect(artifacts.all()).toHaveLength(0);
    await expect(
      jobs.findById({
        tenantId: tenant,
        workspaceId: workspace,
        briefingJobId: 'briefing-job-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        toSnapshot: expect.any(Function),
      }),
    );
  });
});

class FakeBriefingJobRepository implements BriefingJobRepositoryPort {
  private readonly jobsById = new Map<string, BriefingJob>();
  private readonly jobsByIdempotencyKey = new Map<string, BriefingJob>();

  async save(job: BriefingJob): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobsById.set(snapshot.id, job);
    this.jobsByIdempotencyKey.set(snapshot.idempotencyKey, job);
  }

  async findById(
    params: Parameters<BriefingJobRepositoryPort['findById']>[0],
  ): Promise<BriefingJob | null> {
    const job = this.jobsById.get(params.briefingJobId);
    return job?.toSnapshot().tenantId === params.tenantId &&
      job.toSnapshot().workspaceId === params.workspaceId
      ? job
      : null;
  }

  async findByIdempotencyKey(
    params: Parameters<BriefingJobRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<BriefingJob | null> {
    const job = this.jobsByIdempotencyKey.get(params.idempotencyKey);
    return job?.toSnapshot().tenantId === params.tenantId &&
      job.toSnapshot().workspaceId === params.workspaceId
      ? job
      : null;
  }

  async findRequested(
    params: Parameters<BriefingJobRepositoryPort['findRequested']>[0],
  ): Promise<readonly BriefingJob[]> {
    return [...this.jobsById.values()]
      .filter((job) => {
        const snapshot = job.toSnapshot();
        return (
          snapshot.status === 'requested' &&
          (params.tenantId === undefined ||
            snapshot.tenantId === params.tenantId) &&
          (params.workspaceId === undefined ||
            snapshot.workspaceId === params.workspaceId)
        );
      })
      .slice(0, params.limit);
  }

  async claimForExecution(
    params: Parameters<BriefingJobRepositoryPort['claimForExecution']>[0],
  ): ReturnType<BriefingJobRepositoryPort['claimForExecution']> {
    const job = await this.findById(params);
    if (job === null) {
      return null;
    }

    const snapshot = job.toSnapshot();
    if (snapshot.status !== 'requested' && snapshot.status !== 'failed') {
      return null;
    }

    const executableJob =
      snapshot.status === 'failed'
        ? job.retry({ requestedAt: params.requestedAt })
        : job;
    const runningJob = executableJob.start({ startedAt: params.startedAt });
    await this.save(runningJob);

    return runningJob;
  }
}

class FakeBriefingArtifactRepository implements BriefingArtifactRepositoryPort {
  private readonly artifactsById = new Map<string, BriefingArtifact>();

  async save(artifact: BriefingArtifact): Promise<void> {
    this.artifactsById.set(artifact.toSnapshot().briefingId, artifact);
  }

  async list(
    params: Parameters<BriefingArtifactRepositoryPort['list']>[0],
  ): ReturnType<BriefingArtifactRepositoryPort['list']> {
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
    params: Parameters<BriefingArtifactRepositoryPort['findById']>[0],
  ): Promise<BriefingArtifact | null> {
    const artifact = this.artifactsById.get(params.briefingId);
    return artifact?.toSnapshot().tenantId === params.tenantId &&
      artifact.toSnapshot().workspaceId === params.workspaceId
      ? artifact
      : null;
  }

  all(): readonly BriefingArtifact[] {
    return [...this.artifactsById.values()];
  }
}

class FakeBriefingPolicyRepository implements BriefingPolicyRepositoryPort {
  async save(_policy: BriefingPolicy): Promise<void> {
    return undefined;
  }

  async findByScope(): Promise<BriefingPolicy | null> {
    return null;
  }
}

class FailingBriefingContextProvider implements BriefingContextProviderPort {
  async buildContext(): ReturnType<
    BriefingContextProviderPort['buildContext']
  > {
    throw new Error('context provider unavailable');
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
