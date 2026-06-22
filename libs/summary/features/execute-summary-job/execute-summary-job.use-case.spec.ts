import { type EventEnvelope, FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { SummaryJob, type SummaryArtifact, type SummaryPolicy } from '../../domain';
import type {
  ListSummaryArtifactsQuery,
  ListSummaryArtifactsResult,
  ProviderSummaryAttempt,
  SummaryArtifactRepositoryPort,
  SummaryMemoryContext,
  SummaryMemoryPort,
  SummaryEvidenceSelection,
  SummaryEvidenceSelectorPort,
  SummaryEventPublisherPort,
  SummaryJobRepositoryPort,
  SummaryModelBudget,
  SummaryModelEstimate,
  SummaryModelFailure,
  SummaryModelInput,
  SummaryModelPolicy,
  SummaryModelPort,
  SummaryModelRoute,
  SummaryModelValidationResult,
  SummaryPolicyRepositoryPort,
  UserSummaryPreferenceReaderPort,
} from '../../ports';
import { ExecuteSummaryJobUseCase } from './execute-summary-job.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `summary-artifact-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class FakeSummaryJobs implements SummaryJobRepositoryPort {
  private readonly jobs = new Map<string, SummaryJob>();

  async save(job: SummaryJob): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobs.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, job);
  }

  async findById(params: Parameters<SummaryJobRepositoryPort['findById']>[0]): Promise<SummaryJob | null> {
    return this.jobs.get(`${params.tenantId}:${params.workspaceId}:${params.summaryJobId}`) ?? null;
  }

  async findByIdempotencyKey(): Promise<SummaryJob | null> {
    return null;
  }

  async findRequested(): Promise<readonly SummaryJob[]> {
    return [];
  }
}

class FakeSummaryArtifacts implements SummaryArtifactRepositoryPort {
  private readonly artifacts = new Map<string, SummaryArtifact>();

  async save(artifact: SummaryArtifact): Promise<void> {
    const snapshot = artifact.toSnapshot();
    this.artifacts.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.summaryId}`, artifact);
  }

  async list(query: ListSummaryArtifactsQuery): Promise<ListSummaryArtifactsResult> {
    return {
      items: [...this.artifacts.values()].filter((artifact) => {
        const snapshot = artifact.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      }),
      nextCursor: undefined,
    };
  }

  async findById(
    params: Parameters<SummaryArtifactRepositoryPort['findById']>[0],
  ): Promise<SummaryArtifact | null> {
    return this.artifacts.get(`${params.tenantId}:${params.workspaceId}:${params.summaryId}`) ?? null;
  }
}

class FakeSummaryPolicies implements SummaryPolicyRepositoryPort {
  async save(policy: SummaryPolicy): Promise<void> {
    void policy;
  }

  async findByTopic(): Promise<SummaryPolicy | null> {
    return null;
  }
}

class FakeUserSummaryPreferenceReader implements UserSummaryPreferenceReaderPort {
  async findEffectivePreference(): Promise<null> {
    return null;
  }
}

class EmptyEvidenceSelector implements SummaryEvidenceSelectorPort {
  async select(params: Parameters<SummaryEvidenceSelectorPort['select']>[0]): Promise<SummaryEvidenceSelection> {
    return {
      sourceWindow: {
        windowId: `${params.topicId}:empty`,
        startedAt: new Date('2026-06-06T00:00:00.000Z'),
        endedAt: new Date('2026-06-06T00:00:01.000Z'),
        selectedFeedItemIds: [],
      },
      items: [],
    };
  }
}

class SelectedEvidenceSelector implements SummaryEvidenceSelectorPort {
  async select(params: Parameters<SummaryEvidenceSelectorPort['select']>[0]): Promise<SummaryEvidenceSelection> {
    void params;

    return {
      sourceWindow: {
        windowId: 'topic-1:selected',
        startedAt: new Date('2026-06-06T00:00:00.000Z'),
        endedAt: new Date('2026-06-06T00:00:01.000Z'),
        selectedFeedItemIds: ['feed-1'],
      },
      items: [
        {
          feedItemId: 'feed-1',
          sourceItemId: 'source-1',
          sourceBindingId: 'binding-1',
          providerKey: 'rss',
          title: 'Selected source',
          bodyPreview: 'Selected body',
          canonicalUrl: 'https://example.test/source-1',
          observedAt: new Date('2026-06-06T00:00:00.000Z'),
        },
      ],
    };
  }
}

class NoSignalSummaryModel implements SummaryModelPort {
  route(input: SummaryModelInput, policy: SummaryModelPolicy, budget: SummaryModelBudget): SummaryModelRoute {
    void input;
    void policy;
    void budget;

    return {
      provider: 'fake',
      model: 'fake-model',
      promptVersion: 'summary.prompt.test.v1',
      schemaVersion: 'summary.artifact.v1',
    };
  }

  estimate(input: SummaryModelInput, route: SummaryModelRoute): SummaryModelEstimate {
    void input;
    void route;

    return {
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    };
  }

  async summarize(input: SummaryModelInput, route: SummaryModelRoute): Promise<ProviderSummaryAttempt> {
    void input;

    return {
      route,
      draft: {
        headline: 'No reliable signal yet',
        executiveSummary: 'No eligible evidence items were available for this topic window.',
        keyPoints: [],
        risksAndUnknowns: [
          {
            description: 'Insufficient evidence.',
            reason: 'insufficient_evidence',
          },
        ],
        sourceHighlights: [],
        citationMap: [],
        qualityFlags: ['no_signal'],
        confidence: {
          level: 'none',
          score: 0,
          rationale: 'No evidence was selected for this topic window.',
        },
        lineage: {
          promptVersion: route.promptVersion,
          schemaVersion: route.schemaVersion,
          modelVersion: route.model,
          providerVersion: route.provider,
          rulesVersion: 'summary.rules.test.v1',
          evalDatasetVersion: 'summary.eval.test.v1',
        },
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
        },
        noSignalReason: 'No eligible evidence items selected for this topic.',
      },
    };
  }

  validateRawProviderResponse(attempt: ProviderSummaryAttempt): SummaryModelValidationResult {
    void attempt;

    return { ok: true };
  }

  classifyError(error: unknown): SummaryModelFailure {
    return {
      kind: 'unknown',
      retryable: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

class CapturingSummaryModel extends NoSignalSummaryModel {
  readonly routedInputs: SummaryModelInput[] = [];

  override route(input: SummaryModelInput, policy: SummaryModelPolicy, budget: SummaryModelBudget): SummaryModelRoute {
    this.routedInputs.push(input);

    return super.route(input, policy, budget);
  }
}

class CapturingSummaryMemory implements SummaryMemoryPort {
  readonly buildQueries: Parameters<SummaryMemoryPort['buildContext']>[0][] = [];

  constructor(private readonly context: SummaryMemoryContext) {}

  async buildContext(query: Parameters<SummaryMemoryPort['buildContext']>[0]): Promise<SummaryMemoryContext> {
    this.buildQueries.push(query);

    return this.context;
  }

  async recordSummaryFeedback(): Promise<Awaited<ReturnType<SummaryMemoryPort['recordSummaryFeedback']>>> {
    return {
      status: 'skipped',
      diagnostics: { reason: 'not-used-in-summary-job' },
    };
  }
}

class InvalidCitationSummaryModel extends NoSignalSummaryModel {
  override async summarize(input: SummaryModelInput, route: SummaryModelRoute): Promise<ProviderSummaryAttempt> {
    void input;

    return {
      route,
      draft: {
        headline: 'Invalid citation summary',
        executiveSummary: 'This draft cites a feed item outside the selected evidence window.',
        keyPoints: [{ claim: 'Invalid claim', citationIds: ['c1'] }],
        risksAndUnknowns: [{ description: 'Invalid risk citation.', citationIds: ['c1'] }],
        sourceHighlights: ['Invalid highlight'],
        citationMap: [
          {
            citationId: 'c1',
            feedItemId: 'feed-outside-window',
            sourceItemId: 'source-1',
            providerKey: 'rss',
            field: 'title',
          },
        ],
        qualityFlags: [],
        confidence: {
          level: 'low',
          score: 0.25,
          rationale: 'Invalid citation fixture.',
        },
        lineage: {
          promptVersion: route.promptVersion,
          schemaVersion: route.schemaVersion,
          modelVersion: route.model,
          providerVersion: route.provider,
          rulesVersion: 'summary.rules.test.v1',
          evalDatasetVersion: 'summary.eval.test.v1',
        },
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          estimatedCostUsd: 0,
        },
      },
    };
  }

  override classifyError(error: unknown): SummaryModelFailure {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return {
      kind: message.toLowerCase().includes('citation') ? 'citation_validation_failed' : 'unknown',
      retryable: false,
      message,
    };
  }
}

class InvalidRawResponseSummaryModel extends NoSignalSummaryModel {
  override validateRawProviderResponse(): SummaryModelValidationResult {
    return {
      ok: false,
      failure: {
        kind: 'invalid_schema',
        retryable: false,
        message: 'Provider response failed schema validation',
      },
    };
  }
}

class TransientFailureSummaryModel extends NoSignalSummaryModel {
  private attemptCount = 0;

  override async summarize(input: SummaryModelInput, route: SummaryModelRoute): Promise<ProviderSummaryAttempt> {
    this.attemptCount += 1;

    if (this.attemptCount === 1) {
      throw new Error('Transient provider unavailable');
    }

    return super.summarize(input, route);
  }

  override classifyError(error: unknown): SummaryModelFailure {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return {
      kind: 'provider_unavailable',
      retryable: true,
      message,
    };
  }
}

class FakeSummaryEvents implements SummaryEventPublisherPort {
  readonly events: EventEnvelope<Readonly<Record<string, unknown>>>[] = [];

  async publish(event: EventEnvelope<Readonly<Record<string, unknown>>>): Promise<void> {
    this.events.push(event);
  }
}

describe('ExecuteSummaryJobUseCase', () => {
  it('creates a validated no-signal artifact when no evidence exists', async () => {
    const jobs = new FakeSummaryJobs();
    const artifacts = new FakeSummaryArtifacts();
    const events = new FakeSummaryEvents();
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    await jobs.save(
      SummaryJob.request({
        id: 'summary-job-1',
        tenantId: tenant,
        workspaceId: workspace,
        topicId: 'topic-1',
        idempotencyKey: 'summary-request-1',
        requestedAt: new Date('2026-06-06T00:00:00.000Z'),
      }),
    );
    const useCase = new ExecuteSummaryJobUseCase(
      jobs,
      artifacts,
      new FakeSummaryPolicies(),
      new FakeUserSummaryPreferenceReader(),
      new EmptyEvidenceSelector(),
      new NoSignalSummaryModel(),
      events,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:02.000Z')),
    );

    const first = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: 'summary-job-1',
    });
    const second = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: 'summary-job-1',
    });

    expect(first).toEqual({
      ok: true,
      value: {
        summaryJobId: 'summary-job-1',
        status: 'no_signal',
        summaryId: 'summary-artifact-1',
      },
    });
    expect(second).toEqual(first);
    await expect(
      artifacts.findById({
        tenantId: tenant,
        workspaceId: workspace,
        summaryId: 'summary-artifact-1',
      }),
    ).resolves.not.toBeNull();
    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({
      eventType: 'summary.ready',
      schemaVersion: 1,
      payload: {
        summaryJobId: 'summary-job-1',
        summaryId: 'summary-artifact-1',
        status: 'no_signal',
      },
    });
  });

  it('fails the job without publishing when provider citations point outside selected evidence', async () => {
    const jobs = new FakeSummaryJobs();
    const artifacts = new FakeSummaryArtifacts();
    const events = new FakeSummaryEvents();
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    await jobs.save(
      SummaryJob.request({
        id: 'summary-job-invalid-citation',
        tenantId: tenant,
        workspaceId: workspace,
        topicId: 'topic-1',
        idempotencyKey: 'summary-request-invalid-citation',
        requestedAt: new Date('2026-06-06T00:00:00.000Z'),
      }),
    );
    const useCase = new ExecuteSummaryJobUseCase(
      jobs,
      artifacts,
      new FakeSummaryPolicies(),
      new FakeUserSummaryPreferenceReader(),
      new SelectedEvidenceSelector(),
      new InvalidCitationSummaryModel(),
      events,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:02.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: 'summary-job-invalid-citation',
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
    await expect(
      artifacts.list({
        tenantId: tenant,
        workspaceId: workspace,
        limit: 10,
      }),
    ).resolves.toEqual({
      items: [],
      nextCursor: undefined,
    });
    expect(events.events).toHaveLength(0);
    expect((await jobs.findById({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: 'summary-job-invalid-citation',
    }))?.toSnapshot()).toMatchObject({
      status: 'failed',
      failureReason: 'Summary citation validation failed: citation c1 references unselected feed item',
    });
  });

  it('passes memory context into the summary model without owning memo-stack details', async () => {
    const jobs = new FakeSummaryJobs();
    const artifacts = new FakeSummaryArtifacts();
    const events = new FakeSummaryEvents();
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const model = new CapturingSummaryModel();
    const memory = new CapturingSummaryMemory({
      status: 'available',
      renderedText: 'Memory: prioritize auth and security regressions.',
      diagnostics: {
        vector_status: 'ok',
        graph_status: 'ok',
        query_decomposition_derived_query_count: 2,
      },
      retrievedAt: new Date('2026-06-06T00:00:01.000Z'),
    });
    await jobs.save(
      SummaryJob.request({
        id: 'summary-job-memory',
        tenantId: tenant,
        workspaceId: workspace,
        topicId: 'topic-1',
        idempotencyKey: 'summary-request-memory',
        requestedAt: new Date('2026-06-06T00:00:00.000Z'),
        userId: 'user-1',
        subscriptionId: 'subscription-1',
      }),
    );
    const useCase = new ExecuteSummaryJobUseCase(
      jobs,
      artifacts,
      new FakeSummaryPolicies(),
      new FakeUserSummaryPreferenceReader(),
      new SelectedEvidenceSelector(),
      model,
      events,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:02.000Z')),
      memory,
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: 'summary-job-memory',
    });

    expect(result.ok).toBe(true);
    expect(memory.buildQueries).toHaveLength(1);
    expect(memory.buildQueries[0]).toMatchObject({
      tenantId: tenant,
      workspaceId: workspace,
      topicId: 'topic-1',
      userId: 'user-1',
      subscriptionId: 'subscription-1',
    });
    expect(memory.buildQueries[0]?.evidence.items).toHaveLength(1);
    expect(model.routedInputs[0]?.memoryContext).toMatchObject({
      status: 'available',
      renderedText: 'Memory: prioritize auth and security regressions.',
      diagnostics: {
        vector_status: 'ok',
        graph_status: 'ok',
        query_decomposition_derived_query_count: 2,
      },
    });
  });

  it('fails the job without throwing when provider response validation fails', async () => {
    const jobs = new FakeSummaryJobs();
    const artifacts = new FakeSummaryArtifacts();
    const events = new FakeSummaryEvents();
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    await jobs.save(
      SummaryJob.request({
        id: 'summary-job-invalid-provider-schema',
        tenantId: tenant,
        workspaceId: workspace,
        topicId: 'topic-1',
        idempotencyKey: 'summary-request-invalid-provider-schema',
        requestedAt: new Date('2026-06-06T00:00:00.000Z'),
      }),
    );
    const useCase = new ExecuteSummaryJobUseCase(
      jobs,
      artifacts,
      new FakeSummaryPolicies(),
      new FakeUserSummaryPreferenceReader(),
      new EmptyEvidenceSelector(),
      new InvalidRawResponseSummaryModel(),
      events,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:02.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: 'summary-job-invalid-provider-schema',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'external.dependency_unavailable',
        details: {
          kind: 'invalid_schema',
        },
      }),
    });
    await expect(artifacts.list({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 10,
    })).resolves.toEqual({
      items: [],
      nextCursor: undefined,
    });
    expect(events.events).toHaveLength(0);
    expect((await jobs.findById({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: 'summary-job-invalid-provider-schema',
    }))?.toSnapshot()).toMatchObject({
      status: 'failed',
      failureReason: 'Provider response failed schema validation',
    });
  });

  it('retries a failed job with the same job id and clears the failure state on success', async () => {
    const jobs = new FakeSummaryJobs();
    const artifacts = new FakeSummaryArtifacts();
    const events = new FakeSummaryEvents();
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    await jobs.save(
      SummaryJob.request({
        id: 'summary-job-transient',
        tenantId: tenant,
        workspaceId: workspace,
        topicId: 'topic-1',
        idempotencyKey: 'summary-request-transient',
        requestedAt: new Date('2026-06-06T00:00:00.000Z'),
      }),
    );
    const useCase = new ExecuteSummaryJobUseCase(
      jobs,
      artifacts,
      new FakeSummaryPolicies(),
      new FakeUserSummaryPreferenceReader(),
      new EmptyEvidenceSelector(),
      new TransientFailureSummaryModel(),
      events,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:02.000Z')),
    );

    const first = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: 'summary-job-transient',
    });
    const failedSnapshot = (await jobs.findById({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: 'summary-job-transient',
    }))?.toSnapshot();
    const second = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: 'summary-job-transient',
    });
    const completedSnapshot = (await jobs.findById({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: 'summary-job-transient',
    }))?.toSnapshot();

    expect(first).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'external.dependency_unavailable',
        details: {
          kind: 'provider_unavailable',
        },
      }),
    });
    expect(failedSnapshot).toMatchObject({
      status: 'failed',
      failureReason: 'Transient provider unavailable',
    });
    expect(second).toEqual({
      ok: true,
      value: {
        summaryJobId: 'summary-job-transient',
        status: 'no_signal',
        summaryId: 'summary-artifact-1',
      },
    });
    expect(completedSnapshot).toMatchObject({
      status: 'no_signal',
      summaryId: 'summary-artifact-1',
    });
    expect(completedSnapshot?.failureReason).toBeUndefined();
    expect(completedSnapshot?.failedAt).toBeUndefined();
    expect(events.events).toHaveLength(1);
    await expect(artifacts.findById({
      tenantId: tenant,
      workspaceId: workspace,
      summaryId: 'summary-artifact-1',
    })).resolves.not.toBeNull();
  });
});
