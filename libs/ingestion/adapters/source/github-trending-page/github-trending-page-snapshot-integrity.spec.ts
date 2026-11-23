import { normalizeRepository } from './github-trending-page-source-mapping';
import { assertGitHubTrendingSnapshotBatchIntegrity } from '../../../domain/value-objects/github-trending-page';

describe('GitHub Trending snapshot identity', () => {
  const at = new Date('2026-11-11T12:00:00.000Z');
  const item = normalizeRepository({
    repository: { fullName: 'Example/MixedCase', url: 'https://github.com/Example/MixedCase',
      totalStars: 100, forksCount: 1, starsGained: 10, rank: 1 },
    window: 'daily', scanJobId: 'synthetic-scan', fetchStartedAt: at, checkedAt: at,
    snapshotContentHash: 'a'.repeat(64), source: 'fixture_github_trending_html',
  });
  const valid = { ...item, ingestedAt: at };
  const check = (externalId: string) => assertGitHubTrendingSnapshotBatchIntegrity({
    providerKey: 'github-trending-page', items: [{ ...valid, externalId }],
  });

  it('accepts canonical IDs produced for mixed-case names', () => {
    expect(item.externalId).toBe('github-trending-page:daily:synthetic-scan:example/mixedcase');
    expect(() => check(item.externalId)).not.toThrow();
  });
  it('keeps accepting historical IDs preserving original case', () => {
    expect(() => check('github-trending-page:daily:synthetic-scan:Example/MixedCase')).not.toThrow();
  });
  it('rejects a different repository identity', () => {
    expect(() => check('github-trending-page:daily:synthetic-scan:other/repo')).toThrow();
  });
});
