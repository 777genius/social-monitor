import { gzipSync } from 'node:zlib';

import { PublicHttpGhArchiveGitHubRepoRadarClient } from './public-http-gh-archive-github-repo-radar-client';

describe('PublicHttpGhArchiveGitHubRepoRadarClient', () => {
  it('downloads hourly GH Archive files and aggregates WatchEvent repository candidates', async () => {
    const fetcher = new FakeArchiveFetcher({
      'https://data.gharchive.org/2026-06-24-10.json.gz': archive([
        watch('langchain-ai/langgraph', '2026-06-24T10:15:00Z'),
        watch('openai/codex', '2026-06-24T10:20:00Z'),
        push('ignored/repo', '2026-06-24T10:30:00Z'),
      ]),
      'https://data.gharchive.org/2026-06-24-11.json.gz': archive([
        watch('langchain-ai/langgraph', '2026-06-24T11:15:00Z'),
        watch('langchain-ai/langgraph', '2026-06-24T11:45:00Z'),
        watch('openai/codex', '2026-06-24T11:50:00Z'),
      ]),
    });
    const client = new PublicHttpGhArchiveGitHubRepoRadarClient({
      fetchImpl: fetcher.fetch,
      maxArchiveHours: 24,
    });

    const candidates = await client.findTrendingRepositories({
      query: 'langgraph',
      topics: [],
      languages: [],
      windows: ['24h'],
      minStars: 0,
      limit: 5,
      checkedAt: new Date('2026-06-24T12:30:00.000Z'),
      source: 'gh_archive_public_http_plus_github_live',
    });

    expect(fetcher.urls).toHaveLength(24);
    expect(fetcher.urls).toContain('https://data.gharchive.org/2026-06-24-10.json.gz');
    expect(fetcher.urls).toContain('https://data.gharchive.org/2026-06-24-11.json.gz');
    expect(candidates).toEqual([
      {
        fullName: 'langchain-ai/langgraph',
        stars24h: 3,
        stars48h: 3,
        stars7d: 3,
        stars30d: 3,
        stars90d: 3,
        forks24h: 0,
        forks48h: 0,
        forks7d: 0,
        forks30d: 0,
        forks90d: 0,
        rank: 1,
        primaryWindow: '24h',
      },
    ]);
  });

  it('keeps fork-only repositories eligible for bounded radar ordering', async () => {
    const fetcher = new FakeArchiveFetcher({
      'https://data.gharchive.org/2026-06-24-11.json.gz': archive([
        watch('stars-only/repo', '2026-06-24T11:10:00Z'),
        fork('forks-only/repo', '2026-06-24T11:15:00Z'),
        fork('forks-only/repo', '2026-06-24T11:20:00Z'),
        fork('forks-only/repo', '2026-06-24T11:25:00Z'),
      ]),
    });
    const client = new PublicHttpGhArchiveGitHubRepoRadarClient({
      fetchImpl: fetcher.fetch,
      maxArchiveHours: 24,
    });

    const candidates = await client.findTrendingRepositories({
      query: '',
      topics: [],
      languages: [],
      windows: ['24h'],
      minStars: 0,
      limit: 1,
      checkedAt: new Date('2026-06-24T12:30:00.000Z'),
      source: 'gh_archive_public_http_plus_github_live',
    });

    expect(candidates).toEqual([expect.objectContaining({
      fullName: 'forks-only/repo',
      stars24h: 0,
      forks24h: 3,
      primaryWindow: '24h',
    })]);
  });

  it('skips not-yet-published hourly archives and requires BigQuery for longer windows', async () => {
    const fetcher = new FakeArchiveFetcher({});
    const client = new PublicHttpGhArchiveGitHubRepoRadarClient({
      fetchImpl: fetcher.fetch,
      maxArchiveHours: 24,
    });

    await expect(client.findTrendingRepositories({
      query: '',
      topics: [],
      languages: [],
      windows: ['48h'],
      minStars: 0,
      limit: 1,
      checkedAt: new Date('2026-06-24T12:30:00.000Z'),
      source: 'gh_archive_public_http_plus_github_live',
    })).rejects.toThrow('use BigQuery for 48h windows');

    await expect(client.findTrendingRepositories({
      query: '',
      topics: [],
      languages: [],
      windows: ['24h'],
      minStars: 0,
      limit: 1,
      checkedAt: new Date('2026-06-24T13:30:00.000Z'),
      source: 'gh_archive_public_http_plus_github_live',
    })).resolves.toEqual([]);
  });
});

const watch = (repo: string, createdAt: string): Record<string, unknown> => ({
  type: 'WatchEvent',
  repo: { name: repo },
  created_at: createdAt,
});

const fork = (repo: string, createdAt: string): Record<string, unknown> => ({
  type: 'ForkEvent',
  repo: { name: repo },
  created_at: createdAt,
});

const push = (repo: string, createdAt: string): Record<string, unknown> => ({
  type: 'PushEvent',
  repo: { name: repo },
  created_at: createdAt,
});

const archive = (events: readonly Record<string, unknown>[]): Buffer =>
  gzipSync(`${events.map((event) => JSON.stringify(event)).join('\n')}\n`);

class FakeArchiveFetcher {
  readonly urls: string[] = [];

  constructor(private readonly archives: Readonly<Record<string, Buffer>>) {}

  readonly fetch = async (url: string): Promise<{
    readonly ok: boolean;
    readonly status: number;
    arrayBuffer(): Promise<ArrayBuffer>;
  }> => {
    this.urls.push(url);
    const archive = this.archives[url];
    if (archive === undefined) {
      return {
        ok: false,
        status: 404,
        async arrayBuffer() {
          return new ArrayBuffer(0);
        },
      };
    }

    return {
      ok: true,
      status: 200,
      async arrayBuffer() {
        return archive.buffer.slice(
          archive.byteOffset,
          archive.byteOffset + archive.byteLength,
        ) as ArrayBuffer;
      },
    };
  };
}
