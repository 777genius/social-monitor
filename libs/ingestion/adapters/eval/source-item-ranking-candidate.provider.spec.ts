import { SourceItemRankingCandidateProvider } from './source-item-ranking-candidate.provider';

describe('SourceItemRankingCandidateProvider', () => {
  it('uses relevance-first source ranking for frozen eval candidates', async () => {
    const provider = new SourceItemRankingCandidateProvider();

    const result = await provider.rankCandidates({
      evalCase: {
        caseId: 'case-1',
        topic: 'AI coding agent reliability',
        sourceKeys: ['reddit'],
        rankingMode: 'relevance',
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
            candidateId: 'viral-off-topic',
            providerKey: 'reddit',
            externalId: 'reddit:viral',
            canonicalUrl: 'https://example.com/viral',
            title: 'Viral startup launch',
            body: 'Huge launch thread with unrelated AI chatter.',
            publishedAt: new Date('2026-07-04T00:00:00.000Z'),
            metadata: {
              score: 10_000,
              numComments: 2_000,
            },
          },
          {
            candidateId: 'low-engagement-relevant',
            providerKey: 'reddit',
            externalId: 'reddit:relevant',
            canonicalUrl: 'https://example.com/relevant',
            title: 'AI coding agent production reliability',
            body: 'Small thread about coding agent reliability in production.',
            publishedAt: new Date('2026-07-04T00:00:00.000Z'),
            metadata: {
              score: 2,
              numComments: 1,
            },
          },
        ],
        labels: [],
      },
    });

    expect(result.rankedCandidateIds).toEqual([
      'low-engagement-relevant',
      'viral-off-topic',
    ]);
    expect(result.metadata).toEqual(expect.objectContaining({
      rankingMode: 'relevance',
      queryCount: 1,
      topBreakdowns: expect.arrayContaining([
        expect.objectContaining({
          candidateId: 'low-engagement-relevant',
          reasonCodes: expect.arrayContaining(['query_token_match']),
        }),
      ]),
    }));
  });
});
