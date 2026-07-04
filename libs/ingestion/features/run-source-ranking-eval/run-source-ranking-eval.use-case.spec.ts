import { DomainError } from '@social-monitor/shared-kernel';

import type {
  EvalDatasetRepositoryPort,
  RankingCandidateProviderPort,
  RankingEvalDataset,
} from '../../ports';
import { RunSourceRankingEvalUseCase } from './run-source-ranking-eval.use-case';

describe('RunSourceRankingEvalUseCase', () => {
  it('runs ranking candidates against a frozen dataset and returns blocking metrics', async () => {
    const useCase = new RunSourceRankingEvalUseCase(
      new FakeDatasetRepository(dataset()),
      new FakeCandidateProvider(['must-have', 'community']),
    );

    const result = await useCase.execute();

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        datasetVersion: 'source-ranking-test-v1',
        blockingPassed: true,
      }),
    );
    expect(result.ok && result.value.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metricId: 'precisionAt10',
          passed: true,
        }),
        expect.objectContaining({
          metricId: 'mustHaveRecallAt20',
          passed: true,
        }),
      ]),
    );
    expect(result.ok && result.value.caseResults[0]?.rankingMetadata).toEqual({
      rankingMode: 'test',
      topBreakdowns: [
        {
          candidateId: 'must-have',
          totalScore: 1,
          reasonCodes: ['query_token_match'],
        },
      ],
    });
  });

  it('rejects a requested dataset version mismatch', async () => {
    const useCase = new RunSourceRankingEvalUseCase(
      new FakeDatasetRepository(dataset()),
      new FakeCandidateProvider(['must-have']),
    );

    const result = await useCase.execute({ datasetVersion: 'other-v1' });

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error).toBeInstanceOf(DomainError);
    expect(result.ok ? undefined : result.error.message).toBe(
      'Ranking eval dataset version mismatch',
    );
  });
});

class FakeDatasetRepository implements EvalDatasetRepositoryPort {
  constructor(private readonly response: RankingEvalDataset) {}

  async loadDataset(): Promise<RankingEvalDataset> {
    return this.response;
  }
}

class FakeCandidateProvider implements RankingCandidateProviderPort {
  constructor(private readonly rankedCandidateIds: readonly string[]) {}

  async rankCandidates(): Promise<{
    readonly rankingId: string;
    readonly rankedCandidateIds: readonly string[];
    readonly metadata: {
      readonly rankingMode: string;
      readonly topBreakdowns: readonly {
        readonly candidateId: string;
        readonly totalScore: number;
        readonly reasonCodes: readonly string[];
      }[];
    };
  }> {
    return {
      rankingId: 'fake-ranking',
      rankedCandidateIds: this.rankedCandidateIds,
      metadata: {
        rankingMode: 'test',
        topBreakdowns: [
          {
            candidateId: this.rankedCandidateIds[0] ?? 'none',
            totalScore: 1,
            reasonCodes: ['query_token_match'],
          },
        ],
      },
    };
  }
}

const dataset = (): RankingEvalDataset => ({
  schemaVersion: 1,
  datasetVersion: 'source-ranking-test-v1',
  generatedBy: 'test',
  labelingPolicy: 'test labels',
  qualityGates: {
    minPrecisionAt10: 1,
    minNdcgAt20: 1,
    minMustHaveRecallAt20: 1,
    maxDuplicateRateAt20: 0,
    minSourceDiversityAt20: 1,
    minOfficialCommunityCoverageAt20: 1,
    maxViralOffTopicAt10: 0,
    maxLowConfidenceLabelRate: 0,
  },
  cases: [
    {
      caseId: 'case-1',
      topic: 'AI coding agent reliability',
      sourceKeys: ['reddit'],
      queryLanes: [
        {
          laneId: 'general',
          sourceKey: 'reddit',
          operation: 'search',
          query: 'AI coding agent reliability',
          maxItems: 10,
        },
      ],
      candidates: [
        {
          candidateId: 'must-have',
          providerKey: 'reddit',
          externalId: 'reddit:must-have',
          canonicalUrl: 'https://example.com/must-have',
          title: 'AI coding agent reliability',
          body: 'Important reliability item',
          publishedAt: new Date('2026-07-04T00:00:00.000Z'),
        },
        {
          candidateId: 'community',
          providerKey: 'reddit',
          externalId: 'reddit:community',
          canonicalUrl: 'https://example.com/community',
          title: 'AI coding agent community report',
          body: 'Useful community signal',
          publishedAt: new Date('2026-07-04T00:00:00.000Z'),
        },
      ],
      labels: [
        {
          candidateId: 'must-have',
          relevance: 3,
          usefulness: 3,
          authority: 1,
          novelty: 2,
          confidence: 0.9,
          mustHave: true,
          communitySignal: true,
        },
        {
          candidateId: 'community',
          relevance: 3,
          usefulness: 3,
          authority: 1,
          novelty: 1,
          confidence: 0.9,
          communitySignal: true,
        },
      ],
    },
  ],
});
