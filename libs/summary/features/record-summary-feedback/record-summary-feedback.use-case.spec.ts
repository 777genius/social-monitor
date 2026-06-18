import {
  FixedClock,
  type IdGenerator,
  tenantId,
  type TenantId,
  workspaceId,
  type WorkspaceId,
} from '@social-monitor/shared-kernel';

import { SummaryArtifact, type SummaryFeedback } from '../../domain';
import type {
  ListSummaryArtifactsQuery,
  ListSummaryArtifactsResult,
  ListSummaryFeedbackQuery,
  ListSummaryFeedbackResult,
  SummaryArtifactRepositoryPort,
  SummaryFeedbackRepositoryPort,
} from '../../ports';
import { RecordSummaryFeedbackUseCase } from './record-summary-feedback.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `feedback-${this.nextId}`;
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

class FakeSummaryFeedback implements SummaryFeedbackRepositoryPort {
  private readonly feedbackByIdempotencyKey = new Map<string, SummaryFeedback>();

  async save(feedback: SummaryFeedback): Promise<void> {
    const snapshot = feedback.toSnapshot();
    this.feedbackByIdempotencyKey.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.idempotencyKey}`,
      feedback,
    );
  }

  async findByIdempotencyKey(
    query: Parameters<SummaryFeedbackRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<SummaryFeedback | null> {
    return this.feedbackByIdempotencyKey.get(
      `${query.tenantId}:${query.workspaceId}:${query.idempotencyKey}`,
    ) ?? null;
  }

  async list(query: ListSummaryFeedbackQuery): Promise<ListSummaryFeedbackResult> {
    return {
      items: [...this.feedbackByIdempotencyKey.values()].filter((feedback) => {
        const snapshot = feedback.toSnapshot();

        return (
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          snapshot.summaryId === query.summaryId
        );
      }),
      nextCursor: undefined,
    };
  }

  all(): readonly SummaryFeedback[] {
    return [...this.feedbackByIdempotencyKey.values()];
  }
}

describe('RecordSummaryFeedbackUseCase', () => {
  it('records classified feedback with citation evidence and eval eligibility idempotently', async () => {
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const summaries = new FakeSummaryArtifacts();
    const feedback = new FakeSummaryFeedback();
    await summaries.save(makeSummary({ tenantId: tenant, workspaceId: workspace }));
    const useCase = new RecordSummaryFeedbackUseCase(
      summaries,
      feedback,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:10:00.000Z')),
    );
    const command = {
      tenantId: tenant,
      workspaceId: workspace,
      summaryId: 'summary-1',
      idempotencyKey: 'feedback-key-1',
      submittedBy: 'beta-user-1',
      rating: 2,
      category: 'bad_citation',
      citationId: 'citation-1',
      comment: 'Citation points to the wrong claim.',
      correlationId: 'request-1',
    } as const;

    const first = await useCase.execute(command);
    const duplicate = await useCase.execute(command);

    if (!first.ok) {
      throw first.error;
    }

    expect(first).toEqual({
      ok: true,
      value: {
        feedbackId: 'feedback-1',
        created: true,
        category: 'bad_citation',
        triageOwner: 'summary-owner',
        evidence: {
          summaryId: 'summary-1',
          topicId: 'topic-1',
          citationId: 'citation-1',
          feedItemId: 'feed-1',
          sourceItemId: 'source-1',
        },
        eligibleForEvalFixture: true,
        createdAt: '2026-06-06T00:10:00.000Z',
      },
    });
    expect(duplicate).toEqual({
      ok: true,
      value: {
        ...first.value,
        created: false,
      },
    });
    expect(feedback.all()).toHaveLength(1);
  });

  it('rejects feedback for citations outside the summary artifact', async () => {
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const summaries = new FakeSummaryArtifacts();
    await summaries.save(makeSummary({ tenantId: tenant, workspaceId: workspace }));
    const result = await new RecordSummaryFeedbackUseCase(
      summaries,
      new FakeSummaryFeedback(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:10:00.000Z')),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryId: 'summary-1',
      idempotencyKey: 'feedback-key-1',
      submittedBy: 'beta-user-1',
      rating: 2,
      category: 'bad_citation',
      citationId: 'citation-missing',
      correlationId: 'request-1',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
      }),
    });
  });

  it('requires source request feedback to include requested source evidence', async () => {
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const summaries = new FakeSummaryArtifacts();
    await summaries.save(makeSummary({ tenantId: tenant, workspaceId: workspace }));
    const result = await new RecordSummaryFeedbackUseCase(
      summaries,
      new FakeSummaryFeedback(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:10:00.000Z')),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryId: 'summary-1',
      idempotencyKey: 'feedback-key-1',
      submittedBy: 'beta-user-1',
      rating: 3,
      category: 'source_request',
      correlationId: 'request-1',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
      }),
    });
  });

  it('does not record feedback across tenant boundaries', async () => {
    const summaries = new FakeSummaryArtifacts();
    await summaries.save(makeSummary({
      tenantId: tenantId('tenant-2'),
      workspaceId: workspaceId('workspace-1'),
    }));
    const result = await new RecordSummaryFeedbackUseCase(
      summaries,
      new FakeSummaryFeedback(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:10:00.000Z')),
    ).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      summaryId: 'summary-1',
      idempotencyKey: 'feedback-key-1',
      submittedBy: 'beta-user-1',
      rating: 4,
      category: 'low_relevance',
      correlationId: 'request-1',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'resource.not_found',
      }),
    });
  });
});

const makeSummary = (params: {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
}): SummaryArtifact =>
  SummaryArtifact.create({
    schemaVersion: 'summary.artifact.v1',
    summaryId: 'summary-1',
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    topicId: 'topic-1',
    sourceWindow: {
      windowId: 'window-1',
      startedAt: new Date('2026-06-06T00:00:00.000Z'),
      endedAt: new Date('2026-06-06T00:01:00.000Z'),
      selectedFeedItemIds: ['feed-1'],
    },
    headline: 'Important update',
    executiveSummary: 'A concise cited summary.',
    keyPoints: [{ claim: 'A cited claim.', citationIds: ['citation-1'] }],
    risksAndUnknowns: [],
    sourceHighlights: ['feed-1'],
    citationMap: [
      {
        citationId: 'citation-1',
        feedItemId: 'feed-1',
        sourceItemId: 'source-1',
        field: 'title',
      },
    ],
    qualityFlags: ['limited_sources'],
    confidence: {
      level: 'medium',
      score: 0.65,
      rationale: 'One credible source was available.',
    },
    lineage: {
      promptVersion: 'summary.prompt.test.v1',
      schemaVersion: 'summary.artifact.v1',
      modelVersion: 'model-test',
      providerVersion: 'provider-test',
      rulesVersion: 'rules-test',
      evalDatasetVersion: 'eval-test',
    },
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      estimatedCostUsd: 0.01,
    },
  });
