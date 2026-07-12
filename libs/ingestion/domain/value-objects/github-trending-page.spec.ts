import type { JsonObject } from '@social-monitor/shared-kernel';

import {
  githubTrendingPageRepositoryMetadata,
  parseGitHubTrendingPageRepositoryMetadata,
} from './github-trending-page';

describe('GitHub Trending page repository metadata', () => {
  it('keeps each source-list appearance with its own rank and scope', () => {
    const capturedAt = new Date('2026-07-12T09:00:00.000Z');
    const metadata = githubTrendingPageRepositoryMetadata({
      repository: {
        fullName: 'example/scoped-repository',
        url: 'https://github.com/example/scoped-repository',
        totalStars: 4200,
      },
      trending: {
        rank: 2,
        starsGained: 90,
        window: 'daily',
        checkedAt: capturedAt,
        capturedAt,
        scope: { spokenLanguage: 'en' },
        appearances: [
          {
            rank: 2,
            starsGained: 90,
            window: 'daily',
            capturedAt,
            scope: { spokenLanguage: 'en' },
          },
          {
            rank: 1,
            starsGained: 80,
            window: 'daily',
            capturedAt,
            scope: {
              programmingLanguage: 'TypeScript',
              spokenLanguage: 'en',
            },
          },
        ],
        source: 'github_trending_html',
      },
    });

    expect(parseGitHubTrendingPageRepositoryMetadata(metadata)).toMatchObject({
      trending: {
        rank: 2,
        capturedAt: capturedAt.toISOString(),
        scope: { spokenLanguage: 'en' },
        appearances: [
          {
            rank: 2,
            scope: { spokenLanguage: 'en' },
          },
          {
            rank: 1,
            scope: {
              programmingLanguage: 'TypeScript',
              spokenLanguage: 'en',
            },
          },
        ],
      },
    });
  });

  it('parses legacy metadata by synthesizing its captured snapshot appearance', () => {
    const legacyMetadata: JsonObject = {
      kind: 'github_trending_page_repository',
      repository: {
        fullName: 'example/legacy-repository',
        url: 'https://github.com/example/legacy-repository',
        totalStars: 1200,
        forksCount: 12,
      },
      trending: {
        rank: 4,
        starsGained: 32,
        window: 'weekly',
        checkedAt: '2026-07-05T09:00:00.000Z',
        source: 'github_trending_html',
      },
    };

    expect(
      parseGitHubTrendingPageRepositoryMetadata(legacyMetadata),
    ).toMatchObject({
      trending: {
        rank: 4,
        starsGained: 32,
        window: 'weekly',
        checkedAt: '2026-07-05T09:00:00.000Z',
        capturedAt: '2026-07-05T09:00:00.000Z',
        scope: {},
        appearances: [
          {
            rank: 4,
            starsGained: 32,
            window: 'weekly',
            capturedAt: '2026-07-05T09:00:00.000Z',
            scope: {},
          },
        ],
      },
    });
  });
});
