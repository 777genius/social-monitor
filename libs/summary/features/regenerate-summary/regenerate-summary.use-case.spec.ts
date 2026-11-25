import { DomainError, FixedClock, type IdGenerator, ok, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { SummaryArtifact, type SummaryJob } from '../../domain';
import type {
  ListSummaryArtifactsQuery,
  ListSummaryArtifactsResult,
  SummaryArtifactRepositoryPort,
  SummaryJobRepositoryPort,
  SummaryQuotaPort,
} from '../../ports';
import { RegenerateSummaryUseCase } from './regenerate-summary.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `summary-job-${this.nextId}`;
    this.nextId += 1;
    return id;
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

class FakeSummaryJobs implements SummaryJobRepositoryPort {
  private readonly jobsById = new Map<string, SummaryJob>();
  private readonly jobsByIdempotencyKey = new Map<string, SummaryJob>();

  async save(job: SummaryJob): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobsById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, job);
    this.jobsByIdempotencyKey.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.idempotencyKey}`, job);
  }

  async findById(params: Parameters<SummaryJobRepositoryPort['findById']>[0]): Promise<SummaryJob | null> {
    return this.jobsById.get(`${params.tenantId}:${params.workspaceId}:${params.summaryJobId}`) ?? null;
  }

  async findByIdempotencyKey(
    params: Parameters<SummaryJobRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<SummaryJob | null> {
    return this.jobsByIdempotencyKey.get(`${params.tenantId}:${params.workspaceId}:${params.idempotencyKey}`) ?? null;
  }

  async findRequested(): Promise<readonly SummaryJob[]> {
    return [];
  }
}

class AllowingSummaryQuota implements SummaryQuotaPort {
  async reserveSummaryJob(): ReturnType<SummaryQuotaPort['reserveSummaryJob']> {
    return ok({
      remaining: 59,
      resetAt: '2026-06-06T01:00:00.000Z',
    });
  }
}

class DenyingSummaryQuota implements SummaryQuotaPort {
  async reserveSummaryJob(): ReturnType<SummaryQuotaPort['reserveSummaryJob']> {
    return {
      ok: false,
      error: new DomainError('operation.quota_exceeded', 'Usage quota exceeded'),
    };
  }
}

describe('RegenerateSummaryUseCase', () => {
  it('creates regeneration summary job idempotently from an existing summary', async () => {
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const summaries = new FakeSummaryArtifacts();
    await summaries.save(createSummary({ tenantId: tenant, workspaceId: workspace }));
    const useCase = new RegenerateSummaryUseCase(
      summaries,
      new FakeSummaryJobs(),
      new AllowingSummaryQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    );
    const command = {
      tenantId: tenant,
      workspaceId: workspace,
      summaryId: 'summary-1',
      idempotencyKey: 'regen-1',
      correlationId: 'request-1',
    };

    const first = await useCase.execute(command);
    const second = await useCase.execute(command);

    expect(first).toEqual({
      ok: true,
      value: {
        summaryJobId: 'summary-job-1',
        status: 'requested',
        created: true,
      },
    });
    expect(second).toEqual({
      ok: true,
      value: {
        summaryJobId: 'summary-job-1',
        status: 'requested',
        created: false,
      },
    });
  });

  it('checks quota before creating a regeneration summary job', async () => {
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const summaries = new FakeSummaryArtifacts();
    const summaryJobs = new FakeSummaryJobs();
    await summaries.save(createSummary({ tenantId: tenant, workspaceId: workspace }));
    const useCase = new RegenerateSummaryUseCase(
      summaries,
      summaryJobs,
      new DenyingSummaryQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryId: 'summary-1',
      idempotencyKey: 'regen-1',
      correlationId: 'request-1',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'operation.quota_exceeded',
      }),
    });
    await expect(summaryJobs.findByIdempotencyKey({
      tenantId: tenant,
      workspaceId: workspace,
      idempotencyKey: 'regenerate:summary-1:regen-1',
    })).resolves.toBeNull();
  });
});

const createSummary = (params: {
  readonly tenantId: ReturnType<typeof tenantId>;
  readonly workspaceId: ReturnType<typeof workspaceId>;
}): SummaryArtifact =>
  SummaryArtifact.create({
    schemaVersion: 'summary.artifact.v1',
    summaryId: 'summary-1',
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    interestId: 'interest-1',
    sourceWindow: {
      windowId: 'window-1',
      startedAt: new Date('2026-06-06T00:00:00.000Z'),
      endedAt: new Date('2026-06-06T00:01:00.000Z'),
      selectedFeedItemIds: [],
    },
    headline: 'No reliable signal yet',
    executiveSummary: 'No eligible evidence items were available.',
    keyPoints: [],
    risksAndUnknowns: [{ description: 'Insufficient evidence.', reason: 'insufficient_evidence' }],
    sourceHighlights: [],
    citationMap: [],
    qualityFlags: ['no_signal'],
    confidence: {
      level: 'none',
      score: 0,
      rationale: 'No evidence was selected for this interest window.',
    },
    lineage: {
      promptVersion: 'prompt-v1',
      schemaVersion: 'summary.artifact.v1',
      modelVersion: 'model-v1',
      providerVersion: 'provider-v1',
      rulesVersion: 'rules-v1',
      evalDatasetVersion: 'eval-v1',
    },
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    },
    noSignalReason: 'No eligible evidence items selected for this interest.',
  });
