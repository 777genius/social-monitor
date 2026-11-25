import {
  buildBaselineSourceQueryPlan,
  evaluateSourceQueryPlannerCase,
  evaluateSourceQueryPlannerSuite,
} from './source-query-plan-eval-policy';
import type { SourceQueryPlan } from './source-query-plan';
import type { RankingEvalCase } from './source-ranking-eval-policy';

describe('source query plan eval policy', () => {
  it('shows experiment recall improvement for account and community lanes', () => {
    const evalCase = makeCase();
    const baselinePlan = buildBaselineSourceQueryPlan({
      topic: evalCase.topic,
      sourceKeys: evalCase.sourceKeys,
      maxItemsPerLane: 10,
    });
    const experimentPlan: SourceQueryPlan = {
      plannerId: 'experiment',
      intent: {
        topic: evalCase.topic,
        sourceKeys: evalCase.sourceKeys,
      },
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
        {
          laneId: 'reddit:community_listing:claudeai-top',
          sourceKey: 'reddit',
          kind: 'community_listing',
          operation: 'listing',
          query: 'ClaudeAI:top',
          priority: 88,
          maxItems: 10,
          reason: 'community listing',
        },
      ],
      warnings: [],
    };

    const result = evaluateSourceQueryPlannerCase({
      evalCase,
      baselinePlan,
      experimentPlan,
    });

    expect(result.baseline.mustHaveRecallAt20).toBe(0);
    expect(result.experiment.mustHaveRecallAt20).toBe(1);
    expect(result.deltas.mustHaveRecallAt20).toBe(1);
    expect(result.decision).toBe('improved');
  });

  it('fails suite gates when experiment regresses', () => {
    const caseResult = evaluateSourceQueryPlannerCase({
      evalCase: makeCase(),
      baselinePlan: {
        plannerId: 'baseline',
        intent: { topic: 'AI coding agent reliability', sourceKeys: ['reddit'] },
        lanes: [
          {
            laneId: 'reddit:community_listing:claudeai-top',
            sourceKey: 'reddit',
            kind: 'community_listing',
            operation: 'listing',
            query: 'ClaudeAI:top',
            priority: 88,
            maxItems: 10,
            reason: 'community listing',
          },
        ],
        warnings: [],
      },
      experimentPlan: {
        plannerId: 'experiment',
        intent: { topic: 'AI coding agent reliability', sourceKeys: ['reddit'] },
        lanes: [],
        warnings: [],
      },
    });
    const suite = evaluateSourceQueryPlannerSuite({
      datasetVersion: 'test-v1',
      caseResults: [caseResult],
      qualityGates: {
        minExperimentMustHaveRecallAt20: 1,
        minExperimentRelevantRecallAt20: 1,
        minExperimentOfficialCommunityCoverageAt20: 1,
        minImprovedCaseCount: 1,
        maxRegressedCaseCount: 0,
      },
    });

    expect(caseResult.decision).toBe('regressed');
    expect(suite.blockingPassed).toBe(false);
    expect(suite.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metricId: 'regressedCaseCount',
          value: 1,
          passed: false,
        }),
      ]),
    );
  });
});

const makeCase = (): RankingEvalCase => ({
  caseId: 'case-1',
  topic: 'AI coding agent reliability',
  sourceKeys: ['x-twitter', 'reddit'],
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
    {
      candidateId: 'community-terse',
      providerKey: 'reddit',
      externalId: 'reddit:community',
      canonicalUrl: 'https://www.reddit.com/r/ClaudeAI/comments/incident',
      title: 'Incident report: local tool mode fix landed',
      body: 'Maintainers share logs and mitigation steps.',
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
    {
      candidateId: 'community-terse',
      relevance: 3,
      usefulness: 3,
      authority: 1,
      novelty: 2,
      confidence: 0.9,
      mustHave: true,
      communitySignal: true,
    },
  ],
});
