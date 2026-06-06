import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { SummaryJob, type SummaryArtifact } from '../../domain';
import type {
  ProviderSummaryAttempt,
  SummaryArtifactRepositoryPort,
  SummaryEvidenceSelection,
  SummaryEvidenceSelectorPort,
  SummaryJobRepositoryPort,
  SummaryModelBudget,
  SummaryModelEstimate,
  SummaryModelFailure,
  SummaryModelInput,
  SummaryModelPolicy,
  SummaryModelPort,
  SummaryModelRoute,
  SummaryModelValidationResult,
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
}

class FakeSummaryArtifacts implements SummaryArtifactRepositoryPort {
  private readonly artifacts = new Map<string, SummaryArtifact>();

  async save(artifact: SummaryArtifact): Promise<void> {
    const snapshot = artifact.toSnapshot();
    this.artifacts.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.summaryId}`, artifact);
  }

  async findById(
    params: Parameters<SummaryArtifactRepositoryPort['findById']>[0],
  ): Promise<SummaryArtifact | null> {
    return this.artifacts.get(`${params.tenantId}:${params.workspaceId}:${params.summaryId}`) ?? null;
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

describe('ExecuteSummaryJobUseCase', () => {
  it('creates a validated no-signal artifact when no evidence exists', async () => {
    const jobs = new FakeSummaryJobs();
    const artifacts = new FakeSummaryArtifacts();
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
      new EmptyEvidenceSelector(),
      new NoSignalSummaryModel(),
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
  });
});
