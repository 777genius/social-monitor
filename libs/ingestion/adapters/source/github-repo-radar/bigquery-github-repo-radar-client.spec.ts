import { BigQueryGitHubRepoRadarClient } from './bigquery-github-repo-radar-client';

describe('BigQueryGitHubRepoRadarClient', () => {
  it('queries real GH Archive windows and maps long-window deltas without zeroing them', async () => {
    const bigQuery = new FakeBigQueryClient([
      {
        full_name: 'langchain-ai/langgraph',
        stars_24h: '119',
        stars_48h: '120',
        stars_7d: '520',
        stars_30d: '1400',
        stars_90d: '2700',
        forks_24h: '240',
        forks_48h: '242',
        forks_7d: '600',
        forks_30d: '1500',
        forks_90d: '2800',
      },
      {
        full_name: 'acme/slow-burn',
        stars_24h: 0,
        stars_48h: 0,
        stars_7d: 70,
        stars_30d: 120,
        stars_90d: 180,
        forks_24h: 0,
        forks_48h: 0,
        forks_7d: 20,
        forks_30d: 30,
        forks_90d: 40,
      },
    ]);
    const client = new BigQueryGitHubRepoRadarClient({
      client: bigQuery as never,
      location: 'EU',
      maximumBytesBilled: '123456789',
      timeoutMs: 789,
      jobTimeoutMs: 456,
    });

    const candidates = await client.findTrendingRepositories({
      query: 'agents',
      topics: [],
      languages: [],
      windows: ['24h', '48h', '7d', '30d', '90d'],
      minStars: 0,
      limit: 2,
      checkedAt: new Date('2026-06-24T12:00:00.000Z'),
      source: 'gh_archive_bigquery_plus_github_live',
    });

    expect(bigQuery.lastQueryJob).toMatchObject({
      location: 'EU',
      maximumBytesBilled: '123456789',
      jobTimeoutMs: 456,
      params: {
        checkedAt: '2026-06-24T12:00:00.000Z',
        endTableSuffix: '260624',
        limit: 2,
        query: 'agents',
        startTableSuffix: '260326',
      },
    });
    expect(bigQuery.lastQueryJob?.query).toContain('INTERVAL 7 DAY');
    expect(bigQuery.lastQueryJob?.query).toContain('INTERVAL 30 DAY');
    expect(bigQuery.lastQueryJob?.query).toContain('INTERVAL 90 DAY');
    expect(bigQuery.lastQueryJob?.query).not.toContain('0 AS stars_7d');
    expect(bigQuery.lastQueryJob?.query).toContain(
      'GREATEST(stars_24h, forks_24h / 2.0) DESC',
    );
    expect(bigQuery.lastQueryJob?.query).toContain('OR forks_24h > 0');

    expect(bigQuery.lastTimeoutMs).toBe(789);
    expect(candidates).toEqual([
      {
        fullName: 'langchain-ai/langgraph',
        stars24h: 119,
        stars48h: 120,
        stars7d: 520,
        stars30d: 1400,
        stars90d: 2700,
        forks24h: 240,
        forks48h: 242,
        forks7d: 600,
        forks30d: 1500,
        forks90d: 2800,
        rank: 1,
        primaryWindow: '24h',
      },
      {
        fullName: 'acme/slow-burn',
        stars24h: 0,
        stars48h: 0,
        stars7d: 70,
        stars30d: 120,
        stars90d: 180,
        forks24h: 0,
        forks48h: 0,
        forks7d: 20,
        forks30d: 30,
        forks90d: 40,
        rank: 2,
        primaryWindow: '7d',
      },
    ]);
  });

  it('uses the largest requested window for GH Archive table range and primary window scoring', async () => {
    const bigQuery = new FakeBigQueryClient([
      {
        full_name: 'acme/monthly-signal',
        stars_24h: 50,
        stars_48h: 60,
        stars_7d: 100,
        stars_30d: 300,
        stars_90d: 900,
        forks_24h: 0,
        forks_48h: 0,
        forks_7d: 0,
        forks_30d: 0,
        forks_90d: 0,
      },
    ]);
    const client = new BigQueryGitHubRepoRadarClient({
      client: bigQuery as never,
    });

    const candidates = await client.findTrendingRepositories({
      query: '',
      topics: [],
      languages: [],
      windows: ['30d'],
      minStars: 0,
      limit: 1,
      checkedAt: new Date('2026-06-24T12:00:00.000Z'),
      source: 'gh_archive_bigquery_plus_github_live',
    });

    expect(bigQuery.lastQueryJob?.params).toMatchObject({
      startTableSuffix: '260525',
      endTableSuffix: '260624',
    });
    expect(candidates[0]?.primaryWindow).toBe('30d');
  });
});

type FakeBigQueryRow = Readonly<Record<string, unknown>>;
type QueryJobOptions = {
  readonly query: string;
  readonly location: string;
  readonly maximumBytesBilled: string;
  readonly jobTimeoutMs: number;
  readonly params: Readonly<Record<string, unknown>>;
};

class FakeBigQueryClient {
  lastQueryJob?: QueryJobOptions;
  lastTimeoutMs?: number;

  constructor(private readonly rows: readonly FakeBigQueryRow[]) {}

  async createQueryJob(
    options: QueryJobOptions,
  ): Promise<readonly [FakeBigQueryJob]> {
    this.lastQueryJob = options;
    return [
      new FakeBigQueryJob(this.rows, (timeoutMs) => {
        this.lastTimeoutMs = timeoutMs;
      }),
    ];
  }
}

class FakeBigQueryJob {
  constructor(
    private readonly rows: readonly FakeBigQueryRow[],
    private readonly recordTimeout: (timeoutMs: number | undefined) => void,
  ) {}

  async getQueryResults(options: {
    readonly timeoutMs?: number;
  }): Promise<readonly [readonly FakeBigQueryRow[]]> {
    this.recordTimeout(options.timeoutMs);
    return [this.rows];
  }
}
