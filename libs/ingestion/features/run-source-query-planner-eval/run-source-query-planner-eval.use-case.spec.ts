import { DomainError } from '@social-monitor/shared-kernel';

import type {
  EvalDatasetRepositoryPort,
  RankingEvalDataset,
  SourceQueryPlannerPort,
} from '../../ports';
import type { SourceQueryPlan, SourceQueryPlannerIntent } from '../../domain';
import { RunSourceQueryPlannerEvalUseCase } from './run-source-query-planner-eval.use-case';

describe('RunSourceQueryPlannerEvalUseCase', () => {
  it('compares baseline and experiment query plans on frozen candidates', async () => {
    const useCase = new RunSourceQueryPlannerEvalUseCase(
      new FakeDatasetRepository(dataset()),
      new FakePlanner(),
    );

    const result = await useCase.execute();

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.blockingPassed).toBe(true);
    expect(result.ok && result.value.caseResults[0]).toEqual(
      expect.objectContaining({
        decision: 'improved',
        deltas: expect.objectContaining({
          mustHaveRecallAt20: 1,
        }),
      }),
    );
  });

  it('rejects a requested dataset version mismatch', async () => {
    const useCase = new RunSourceQueryPlannerEvalUseCase(
      new FakeDatasetRepository(dataset()),
      new FakePlanner(),
    );

    const result = await useCase.execute({ datasetVersion: 'other-v1' });

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error).toBeInstanceOf(DomainError);
    expect(result.ok ? undefined : result.error.message).toBe(
      'Query planner eval dataset version mismatch',
    );
  });
});

class FakeDatasetRepository implements EvalDatasetRepositoryPort {
  constructor(private readonly response: RankingEvalDataset) {}

  async loadDataset(): Promise<RankingEvalDataset> {
    return this.response;
  }
}

class FakePlanner implements SourceQueryPlannerPort {
  async compilePlan(params: {
    readonly intent: SourceQueryPlannerIntent;
  }): Promise<SourceQueryPlan> {
    return {
      plannerId: 'fake-experiment',
      intent: params.intent,
      lanes: [
        {
          laneId: 'x-twitter:account_posts:from-openai',
          sourceKey: 'x-twitter',
          kind: 'account_posts',
          operation: 'account_feed',
          query: 'from:OpenAI',
          priority: 95,
          maxItems: 10,
          reason: 'official account lane',
        },
      ],
      warnings: [],
    };
  }
}

const dataset = (): RankingEvalDataset => ({
  schemaVersion: 1,
  datasetVersion: 'query-planner-test-v1',
  generatedBy: 'test',
  labelingPolicy: 'test labels',
  cases: [
    {
      caseId: 'case-1',
      topic: 'OpenAI Codex CLI release MCP',
      sourceKeys: ['x-twitter'],
      queryPlannerIntent: {
        topic: 'OpenAI Codex CLI release MCP',
        sourceKeys: ['x-twitter'],
        handles: [{ handle: 'OpenAI', sourceKey: 'x-twitter' }],
      },
      queryLanes: [],
      candidates: [
        {
          candidateId: 'official-terse',
          providerKey: 'x-twitter',
          externalId: 'x-twitter:official',
          canonicalUrl: 'https://x.com/OpenAI/status/1',
          title: 'X post by @OpenAI: local tool mode ships',
          body: 'Local tool mode is live today.',
          authorHandle: 'OpenAI',
          publishedAt: new Date('2026-07-04T00:00:00.000Z'),
        },
      ],
      labels: [
        {
          candidateId: 'official-terse',
          relevance: 3,
          usefulness: 3,
          authority: 2,
          novelty: 2,
          confidence: 0.9,
          mustHave: true,
          officialSignal: true,
        },
      ],
    },
  ],
});
