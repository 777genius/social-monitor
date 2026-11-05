import { planRetrievesCandidate } from './source-query-plan-candidate-matching';
import type { RankingEvalCandidate } from './source-ranking-eval-policy';

const baseCandidate: RankingEvalCandidate = {
  candidateId: 'candidate-1',
  providerKey: 'x-twitter',
  externalId: 'x-twitter:post-1',
  canonicalUrl: 'https://x.com/someone/status/1',
  title: 'AI agents improve developer tooling',
  body: 'A source post about reliable agents',
  publishedAt: new Date('2026-07-07T12:00:00Z'),
};

const matches = (
  operation: string,
  query: string,
  candidate: RankingEvalCandidate = baseCandidate,
): boolean => planRetrievesCandidate({
  plannerId: 'test',
  intent: { topic: query, sourceKeys: [candidate.providerKey] },
  lanes: [{
    laneId: 'lane-1', sourceKey: candidate.providerKey, kind: 'test',
    operation, query, priority: 1, maxItems: 10, reason: 'test',
  }],
  warnings: [],
}, candidate);

describe('source query lane candidate matching', () => {
  it('does not match missing identities in account and listing lanes', () => {
    expect(matches('account_feed', 'from:', baseCandidate)).toBe(false);
    expect(matches('listing', '', {
      ...baseCandidate, providerKey: 'reddit',
      canonicalUrl: 'https://example.test/no-subreddit',
    })).toBe(false);
  });

  it('requires a whole @mention in post text rather than a bare name or author', () => {
    expect(matches('mention_search', '@OpenAI', {
      ...baseCandidate, body: 'Following @OpenAI.', title: 'News',
    })).toBe(true);
    expect(matches('mention_search', '@OpenAI', {
      ...baseCandidate, body: 'Following @OpenAIR.', title: 'News',
    })).toBe(false);
    expect(matches('mention_search', '@OpenAI', {
      ...baseCandidate, body: 'Following OpenAI.', title: 'News', authorHandle: 'OpenAI',
    })).toBe(false);
  });

  it('ignores stopwords in low-signal fallback and normalizes Unicode canonically', () => {
    expect(matches('search', 'the AI', {
      ...baseCandidate, title: 'The latest release', body: 'Tooling',
    })).toBe(false);
    expect(matches('search', 'the AI', {
      ...baseCandidate, title: 'AI tools', body: 'Tooling',
    })).toBe(true);
    expect(matches('search', 'the', {
      ...baseCandidate, title: 'The latest', body: 'Tools',
    })).toBe(false);
    expect(matches('search', 'café', {
      ...baseCandidate, title: 'Le cafe\u0301', body: '',
    })).toBe(true);
    expect(matches('search', 'प्रौद्योगिकी', {
      ...baseCandidate, title: 'नई प्रौद्योगिकी', body: '',
    })).toBe(true);
  });

  it('handles Unicode terms and low-signal queries without substring false hits', () => {
    expect(matches('search', 'машинное обучение', {
      ...baseCandidate, title: 'Новости: машинное обучение',
    })).toBe(true);
    expect(matches('search', 'AI', {
      ...baseCandidate, title: 'AI', body: 'Tools',
    })).toBe(true);
    expect(matches('search', 'AI', {
      ...baseCandidate, title: 'Airplane', body: 'Tools',
    })).toBe(false);
  });
});
