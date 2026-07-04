import {
  evaluateRankingEvalCase,
  evaluateRankingEvalSuite,
  type CandidateLabel,
  type RankingEvalCandidate,
  type RankingEvalCase,
} from './source-ranking-eval-policy';

describe('source ranking eval policy', () => {
  it('computes deterministic retrieval ranking metrics from frozen labels', () => {
    const result = evaluateRankingEvalCase({
      evalCase: evalCase({
        sourceKeys: ['reddit', 'x-twitter'],
        labels: [
          label('official', {
            relevance: 3,
            usefulness: 3,
            authority: 2,
            mustHave: true,
            officialSignal: true,
          }),
          label('community', {
            relevance: 3,
            usefulness: 2,
            communitySignal: true,
          }),
          label('duplicate', {
            relevance: 3,
            usefulness: 1,
            duplicateOf: 'community',
          }),
          label('viral', {
            relevance: 0,
            usefulness: 0,
            viralOffTopic: true,
          }),
        ],
      }),
      rankedCandidateIds: ['official', 'community', 'duplicate', 'viral'],
    });

    expect(result.metrics.precisionAt10).toBe(0.75);
    expect(result.metrics.mustHaveRecallAt20).toBe(1);
    expect(result.metrics.duplicateRateAt20).toBe(0.25);
    expect(result.metrics.sourceDiversityAt20).toBe(1);
    expect(result.metrics.officialCommunityCoverageAt20).toBe(1);
    expect(result.metrics.viralOffTopicAt10).toBe(1);
    expect(result.missingMustHaveCandidateIds).toEqual([]);
    expect(result.metrics.ndcgAt20).toBeGreaterThan(0.9);
  });

  it('surfaces missing must-have candidates and failed suite gates', () => {
    const caseResult = evaluateRankingEvalCase({
      evalCase: evalCase({
        labels: [
          label('must-have', { relevance: 3, mustHave: true }),
          label('off-topic', { relevance: 0, viralOffTopic: true }),
        ],
      }),
      rankedCandidateIds: ['off-topic'],
    });
    const suiteResult = evaluateRankingEvalSuite({
      datasetVersion: 'test-v1',
      caseResults: [caseResult],
      qualityGates: {
        minPrecisionAt10: 0.7,
        minNdcgAt20: 0.8,
        minMustHaveRecallAt20: 1,
        maxDuplicateRateAt20: 0,
        minSourceDiversityAt20: 1,
        minOfficialCommunityCoverageAt20: 1,
        maxViralOffTopicAt10: 0,
        maxLowConfidenceLabelRate: 0,
      },
    });

    expect(caseResult.missingMustHaveCandidateIds).toEqual(['must-have']);
    expect(suiteResult.blockingPassed).toBe(false);
    expect(suiteResult.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metricId: 'mustHaveRecallAt20',
          value: 0,
          passed: false,
        }),
        expect.objectContaining({
          metricId: 'viralOffTopicAt10',
          value: 1,
          passed: false,
        }),
      ]),
    );
  });

  it('treats single-source cases as fully source-covered', () => {
    const result = evaluateRankingEvalCase({
      evalCase: evalCase({
        sourceKeys: ['reddit'],
        labels: [label('reddit-item', { relevance: 3 })],
      }),
      rankedCandidateIds: ['reddit-item'],
    });

    expect(result.metrics.sourceDiversityAt20).toBe(1);
  });
});

const evalCase = (params: {
  readonly sourceKeys?: readonly string[];
  readonly labels: readonly CandidateLabel[];
}): RankingEvalCase => ({
  caseId: 'case-1',
  topic: 'AI coding agent reliability',
  sourceKeys: params.sourceKeys ?? ['reddit'],
  queryLanes: [
    {
      laneId: 'general',
      sourceKey: params.sourceKeys?.[0] ?? 'reddit',
      operation: 'search',
      query: 'AI coding agent reliability',
      maxItems: 10,
    },
  ],
  candidates: params.labels.map((entry, index) =>
    candidate(entry.candidateId, index % 2 === 0 ? 'reddit' : 'x-twitter'),
  ),
  labels: params.labels,
});

const candidate = (
  candidateId: string,
  providerKey: string,
): RankingEvalCandidate => ({
  candidateId,
  providerKey,
  externalId: `${providerKey}:${candidateId}`,
  canonicalUrl: `https://example.com/${candidateId}`,
  title: candidateId,
  body: 'AI coding agent reliability',
  publishedAt: new Date('2026-07-04T00:00:00.000Z'),
});

const label = (
  candidateId: string,
  overrides: Partial<CandidateLabel>,
): CandidateLabel => ({
  candidateId,
  relevance: 2,
  usefulness: 2,
  authority: 1,
  novelty: 1,
  confidence: 0.9,
  ...overrides,
});
