import { tenantId, type TenantId, workspaceId, type WorkspaceId } from '@social-monitor/shared-kernel';

import { SummaryArtifact } from '../../domain';
import type {
  ListSummaryArtifactsQuery,
  ListSummaryArtifactsResult,
  SummaryArtifactRepositoryPort,
  SummaryFreshness,
  SummaryFreshnessPort,
} from '../../ports';
import { ListSummariesUseCase } from './list-summaries.use-case';

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
          (query.interestId === undefined || snapshot.interestId === query.interestId)
        );
      }),
      nextCursor: undefined,
    };
  }

  async findById(): Promise<SummaryArtifact | null> {
    return null;
  }
}

class FakeFreshness implements SummaryFreshnessPort {
  async evaluate(): Promise<SummaryFreshness> {
    return {
      status: 'fresh',
      checkedAt: new Date('2026-06-06T00:02:00.000Z'),
    };
  }
}

describe('ListSummariesUseCase', () => {
  it('lists summaries in tenant/workspace scope and supports interest filter', async () => {
    const repository = new FakeSummaryArtifacts();
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    await repository.save(createSummary({ summaryId: 'summary-1', interestId: 'interest-1', tenantId: tenant, workspaceId: workspace }));
    await repository.save(createSummary({ summaryId: 'summary-2', interestId: 'interest-2', tenantId: tenant, workspaceId: workspace }));
    await repository.save(
      createSummary({
        summaryId: 'summary-other-tenant',
        interestId: 'interest-1',
        tenantId: tenantId('tenant-2'),
        workspaceId: workspace,
      }),
    );
    const useCase = new ListSummariesUseCase(repository, new FakeFreshness());

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      interestId: 'interest-1',
      limit: 20,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          expect.objectContaining({
            summaryId: 'summary-1',
            interestId: 'interest-1',
            freshness: {
              status: 'fresh',
              checkedAt: '2026-06-06T00:02:00.000Z',
            },
          }),
        ],
        nextCursor: undefined,
      },
    });
  });
});

const createSummary = (params: {
  readonly summaryId: string;
  readonly interestId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
}): SummaryArtifact =>
  SummaryArtifact.create({
    schemaVersion: 'summary.artifact.v1',
    summaryId: params.summaryId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    interestId: params.interestId,
    sourceWindow: {
      windowId: `${params.summaryId}-window`,
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
      promptVersion: 'summary.prompt.test.v1',
      schemaVersion: 'summary.artifact.v1',
      modelVersion: 'model-test',
      providerVersion: 'provider-test',
      rulesVersion: 'rules-test',
      evalDatasetVersion: 'eval-test',
    },
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    },
    noSignalReason: 'No eligible evidence items selected for this interest.',
  });
