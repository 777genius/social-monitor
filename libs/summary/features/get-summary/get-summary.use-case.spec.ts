import { tenantId, type TenantId, workspaceId, type WorkspaceId } from '@social-monitor/shared-kernel';

import { SummaryArtifact } from '../../domain';
import type {
  ListSummaryArtifactsQuery,
  ListSummaryArtifactsResult,
  SummaryArtifactRepositoryPort,
} from '../../ports';
import { GetSummaryUseCase } from './get-summary.use-case';

class FakeSummaryArtifacts implements SummaryArtifactRepositoryPort {
  private readonly artifacts = new Map<string, SummaryArtifact>();

  async save(artifact: SummaryArtifact): Promise<void> {
    const snapshot = artifact.toSnapshot();
    this.artifacts.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.summaryId}`, artifact);
  }

  async list(_query: ListSummaryArtifactsQuery): Promise<ListSummaryArtifactsResult> {
    return {
      items: [...this.artifacts.values()],
      nextCursor: undefined,
    };
  }

  async findById(params: Parameters<SummaryArtifactRepositoryPort['findById']>[0]): Promise<SummaryArtifact | null> {
    return this.artifacts.get(`${params.tenantId}:${params.workspaceId}:${params.summaryId}`) ?? null;
  }
}

describe('GetSummaryUseCase', () => {
  it('returns a scoped summary artifact with citation labels', async () => {
    const summaries = new FakeSummaryArtifacts();
    await summaries.save(makeSummary({
      summaryId: 'summary-1',
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
    }));

    const result = await new GetSummaryUseCase(summaries).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      summaryId: 'summary-1',
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        summaryId: 'summary-1',
        sourceWindow: expect.objectContaining({
          startedAt: '2026-06-06T00:00:00.000Z',
          endedAt: '2026-06-06T00:01:00.000Z',
        }),
        citations: [
          {
            citationId: 'citation-1',
            label: '[1]',
            feedItemId: 'feed-1',
            sourceItemId: 'source-1',
            field: 'title',
          },
        ],
      }),
    });
  });

  it('does not return summaries outside tenant scope', async () => {
    const summaries = new FakeSummaryArtifacts();
    await summaries.save(makeSummary({
      summaryId: 'summary-1',
      tenantId: tenantId('tenant-2'),
      workspaceId: workspaceId('workspace-1'),
    }));

    await expect(new GetSummaryUseCase(summaries).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      summaryId: 'summary-1',
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'resource.not_found',
      }),
    });
  });

  it('rejects blank summary ids before repository lookup', async () => {
    await expect(new GetSummaryUseCase(new FakeSummaryArtifacts()).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      summaryId: '',
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
      }),
    });
  });
});

const makeSummary = (params: {
  readonly summaryId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
}): SummaryArtifact => SummaryArtifact.create({
  schemaVersion: 'summary.artifact.v1',
  summaryId: params.summaryId,
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
