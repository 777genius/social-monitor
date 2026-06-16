import { tenantId, type TenantId, workspaceId, type WorkspaceId } from '@social-monitor/shared-kernel';

import { SummaryArtifact, SummaryFeedback } from '../../domain';
import type {
  FindSummaryFeedbackByIdempotencyKeyQuery,
  ListSummaryArtifactsQuery,
  ListSummaryArtifactsResult,
  ListSummaryFeedbackQuery as RepositoryListSummaryFeedbackQuery,
  ListSummaryFeedbackResult as RepositoryListSummaryFeedbackResult,
  SummaryArtifactRepositoryPort,
  SummaryFeedbackRepositoryPort,
} from '../../ports';
import { ListSummaryFeedbackUseCase } from './list-summary-feedback.use-case';

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

        return (
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          (query.topicId === undefined || snapshot.topicId === query.topicId)
        );
      }),
      nextCursor: undefined,
    };
  }

  async findById(params: Parameters<SummaryArtifactRepositoryPort['findById']>[0]): Promise<SummaryArtifact | null> {
    return this.artifacts.get(`${params.tenantId}:${params.workspaceId}:${params.summaryId}`) ?? null;
  }
}

class FakeSummaryFeedback implements SummaryFeedbackRepositoryPort {
  private readonly feedback = new Map<string, SummaryFeedback>();

  async save(feedback: SummaryFeedback): Promise<void> {
    const snapshot = feedback.toSnapshot();
    this.feedback.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, feedback);
  }

  async findByIdempotencyKey(query: FindSummaryFeedbackByIdempotencyKeyQuery): Promise<SummaryFeedback | null> {
    return [...this.feedback.values()].find((feedback) => {
      const snapshot = feedback.toSnapshot();

      return (
        snapshot.tenantId === query.tenantId &&
        snapshot.workspaceId === query.workspaceId &&
        snapshot.idempotencyKey === query.idempotencyKey
      );
    }) ?? null;
  }

  async list(query: RepositoryListSummaryFeedbackQuery): Promise<RepositoryListSummaryFeedbackResult> {
    const offset = decodeCursor(query.cursor);
    const allItems = [...this.feedback.values()]
      .filter((feedback) => {
        const snapshot = feedback.toSnapshot();

        return (
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          snapshot.summaryId === query.summaryId
        );
      })
      .sort((left, right) => right.toSnapshot().createdAt.getTime() - left.toSnapshot().createdAt.getTime());
    const items = allItems.slice(offset, offset + query.limit);
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor: nextOffset < allItems.length ? encodeCursor(nextOffset) : undefined,
    };
  }
}

describe('ListSummaryFeedbackUseCase', () => {
  it('lists feedback for one summary in tenant/workspace scope with cursor pagination', async () => {
    const tenant = tenantId('tenant-feedback-list');
    const workspace = workspaceId('workspace-feedback-list');
    const summaries = new FakeSummaryArtifacts();
    const feedback = new FakeSummaryFeedback();
    await summaries.save(createSummary({ tenantId: tenant, workspaceId: workspace, summaryId: 'summary-1' }));
    await summaries.save(createSummary({ tenantId: tenant, workspaceId: workspace, summaryId: 'summary-2' }));
    await feedback.save(createFeedback({
      id: 'feedback-older',
      tenantId: tenant,
      workspaceId: workspace,
      summaryId: 'summary-1',
      createdAt: new Date('2026-06-06T10:00:00.000Z'),
    }));
    await feedback.save(createFeedback({
      id: 'feedback-newer',
      tenantId: tenant,
      workspaceId: workspace,
      summaryId: 'summary-1',
      createdAt: new Date('2026-06-06T11:00:00.000Z'),
    }));
    await feedback.save(createFeedback({
      id: 'feedback-other-summary',
      tenantId: tenant,
      workspaceId: workspace,
      summaryId: 'summary-2',
      createdAt: new Date('2026-06-06T12:00:00.000Z'),
    }));
    await feedback.save(createFeedback({
      id: 'feedback-other-tenant',
      tenantId: tenantId('tenant-other-feedback-list'),
      workspaceId: workspace,
      summaryId: 'summary-1',
      createdAt: new Date('2026-06-06T13:00:00.000Z'),
    }));
    const useCase = new ListSummaryFeedbackUseCase(summaries, feedback);

    const firstPage = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryId: 'summary-1',
      limit: 1,
    });

    expect(firstPage).toEqual({
      ok: true,
      value: {
        items: [
          expect.objectContaining({
            feedbackId: 'feedback-newer',
            summaryId: 'summary-1',
            category: 'wrong_fact',
            triageOwner: 'summary-owner',
            evidence: expect.objectContaining({ summaryId: 'summary-1' }),
            createdAt: '2026-06-06T11:00:00.000Z',
          }),
        ],
        nextCursor: expect.any(String),
      },
    });

    const cursor = firstPage.ok ? firstPage.value.nextCursor : undefined;
    const secondPage = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryId: 'summary-1',
      limit: 1,
      cursor,
    });

    expect(secondPage).toEqual({
      ok: true,
      value: {
        items: [
          expect.objectContaining({
            feedbackId: 'feedback-older',
            summaryId: 'summary-1',
            createdAt: '2026-06-06T10:00:00.000Z',
          }),
        ],
        nextCursor: undefined,
      },
    });
  });

  it('rejects invalid limits and unknown summaries', async () => {
    const tenant = tenantId('tenant-feedback-list-validation');
    const workspace = workspaceId('workspace-feedback-list-validation');
    const summaries = new FakeSummaryArtifacts();
    const feedback = new FakeSummaryFeedback();
    const useCase = new ListSummaryFeedbackUseCase(summaries, feedback);

    await expect(useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryId: 'summary-missing',
      limit: 0,
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'validation.failed' }),
    });

    await expect(useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryId: 'summary-missing',
      limit: 20,
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'resource.not_found' }),
    });
  });
});

const createSummary = (params: {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly summaryId: string;
}): SummaryArtifact =>
  SummaryArtifact.create({
    schemaVersion: 'summary.artifact.v1',
    summaryId: params.summaryId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    topicId: 'topic-feedback-list',
    sourceWindow: {
      windowId: `${params.summaryId}-window`,
      startedAt: new Date('2026-06-06T09:00:00.000Z'),
      endedAt: new Date('2026-06-06T09:05:00.000Z'),
      selectedFeedItemIds: ['feed-item-1'],
    },
    headline: 'Feedback list summary',
    executiveSummary: 'Summary with cited evidence.',
    keyPoints: [{ claim: 'A cited claim exists.', citationIds: ['c1'] }],
    risksAndUnknowns: [],
    sourceHighlights: [],
    citationMap: [{
      citationId: 'c1',
      feedItemId: 'feed-item-1',
      sourceItemId: 'source-item-1',
      field: 'title',
    }],
    qualityFlags: [],
    confidence: {
      level: 'medium',
      score: 0.65,
      rationale: 'Enough test evidence exists.',
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
      inputTokens: 10,
      outputTokens: 20,
      estimatedCostUsd: 0,
    },
  });

const createFeedback = (params: {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly summaryId: string;
  readonly createdAt: Date;
}): SummaryFeedback =>
  SummaryFeedback.record({
    id: params.id,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    summaryId: params.summaryId,
    topicId: 'topic-feedback-list',
    idempotencyKey: `${params.id}-idempotency`,
    submittedBy: 'actor-feedback-list',
    rating: 2,
    category: 'wrong_fact',
    comment: 'Claim is not supported by the cited item.',
    evidence: {
      summaryId: params.summaryId,
      topicId: 'topic-feedback-list',
      citationId: 'c1',
      feedItemId: 'feed-item-1',
      sourceItemId: 'source-item-1',
    },
    triageOwner: 'summary-owner',
    eligibleForEvalFixture: true,
    createdAt: params.createdAt,
  });

const encodeCursor = (offset: number): string => Buffer.from(JSON.stringify({ offset })).toString('base64url');

const decodeCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 0;
  }

  const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset: number };

  return parsed.offset;
};
