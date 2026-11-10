import {
  formatRepositoryTrendHighlight,
  formatWhyImportant,
} from './deterministic-summary-source-highlights';

describe('deterministic summary source-highlights projection', () => {
  it('keeps memory preference first and de-duplicates reasons without losing original wording', () => {
    expect(formatWhyImportant([
      '  Strong source signal  ',
      'Matches memory preference',
      'Fresh in the monitoring window',
      'Strong source signal',
      '  ',
    ])).toBe('Matches memory preference; Strong source signal; Fresh in the monitoring window');
    expect(formatWhyImportant(['  '])).toBeUndefined();
  });

  it('preserves GitHub Trending window, rank and growth output', () => {
    expect(formatRepositoryTrendHighlight({
      kind: 'github_trending_page_repository',
      repository: { fullName: 'example/agents', totalStars: 123 },
      trending: { starsGained: 17, window: 'weekly', rank: 2 },
    })).toBe('example/agents: #2 on GitHub Trending weekly, 123 stars, +17');
  });

  it('uses the existing seven-day fallback for repository trends', () => {
    expect(formatRepositoryTrendHighlight({
      kind: 'github_repository_trend',
      repository: { fullName: 'example/agents' },
      trend: { totalStars: 123, stars7d: 7 },
    })).toBe('example/agents: 123 stars, +7 in 7d');
  });

  it('rejects incomplete, nonfinite and malformed metadata rather than fabricating signals', () => {
    expect(formatRepositoryTrendHighlight({
      kind: 'github_trending_page_repository',
      repository: { fullName: 'example/agents', totalStars: 123 },
      trending: { starsGained: 17 },
    })).toBeUndefined();
    expect(formatRepositoryTrendHighlight({
      kind: 'github_repository_trend',
      repository: { fullName: 'example/agents' },
      trend: { totalStars: Number.POSITIVE_INFINITY, stars48h: 20 },
    })).toBeUndefined();
    expect(formatRepositoryTrendHighlight(['not-a-metadata-record'])).toBeUndefined();
  });
});
