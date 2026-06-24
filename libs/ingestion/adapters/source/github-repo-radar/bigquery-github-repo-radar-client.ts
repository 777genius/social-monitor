import { BigQuery } from '@google-cloud/bigquery';

import type { GitHubRepositoryTrendWindow } from '../../../domain';
import type {
  GitHubRepoRadarCandidate,
  GitHubRepoRadarClientPort,
  GitHubRepoRadarQuery,
} from './github-repo-radar-client.port';

export type BigQueryGitHubRepoRadarClientOptions = {
  readonly projectId?: string;
  readonly location?: string;
  readonly maximumBytesBilled?: string;
  readonly timeoutMs?: number;
  readonly jobTimeoutMs?: number;
  readonly client?: Pick<BigQuery, 'createQueryJob'>;
};

type BigQueryRow = {
  readonly full_name?: unknown;
  readonly stars_24h?: unknown;
  readonly stars_48h?: unknown;
  readonly stars_7d?: unknown;
  readonly stars_30d?: unknown;
  readonly stars_90d?: unknown;
};

const defaultMaximumBytesBilled = '5000000000';
const defaultTimeoutMs = 30_000;
const defaultJobTimeoutMs = 60_000;

export class BigQueryGitHubRepoRadarClient implements GitHubRepoRadarClientPort {
  private readonly client: Pick<BigQuery, 'createQueryJob'>;
  private readonly location: string;
  private readonly maximumBytesBilled: string;
  private readonly timeoutMs: number;
  private readonly jobTimeoutMs: number;

  constructor(options: BigQueryGitHubRepoRadarClientOptions = {}) {
    this.client = options.client ?? new BigQuery({ projectId: options.projectId });
    this.location = options.location ?? 'US';
    this.maximumBytesBilled = options.maximumBytesBilled ?? defaultMaximumBytesBilled;
    this.timeoutMs = positiveIntegerOrFallback(options.timeoutMs, defaultTimeoutMs);
    this.jobTimeoutMs = positiveIntegerOrFallback(options.jobTimeoutMs, defaultJobTimeoutMs);
  }

  async findTrendingRepositories(query: GitHubRepoRadarQuery): Promise<readonly GitHubRepoRadarCandidate[]> {
    const [job] = await this.client.createQueryJob({
      query: trendSql,
      location: this.location,
      maximumBytesBilled: this.maximumBytesBilled,
      jobTimeoutMs: this.jobTimeoutMs,
      params: {
        startTableSuffix: dayTableSuffix(daysBefore(query.checkedAt, 2)),
        endTableSuffix: dayTableSuffix(query.checkedAt),
        checkedAt: query.checkedAt.toISOString(),
        query: query.query.toLocaleLowerCase('en-US'),
        limit: query.limit,
      },
    });
    const [rows] = await job.getQueryResults({ timeoutMs: this.timeoutMs });

    return (rows as readonly BigQueryRow[])
      .map((row, index) => rowToCandidate(row, index + 1, query.windows))
      .filter((candidate): candidate is GitHubRepoRadarCandidate => candidate !== null)
      .slice(0, query.limit);
  }
}

const trendSql = `
WITH events AS (
  SELECT
    repo.name AS full_name,
    created_at
  FROM \`githubarchive.day.20*\`
  WHERE
    _TABLE_SUFFIX BETWEEN @startTableSuffix AND @endTableSuffix
    AND type = 'WatchEvent'
    AND repo.name IS NOT NULL
),
aggregated AS (
  SELECT
    full_name,
    COUNTIF(created_at >= TIMESTAMP_SUB(TIMESTAMP(@checkedAt), INTERVAL 1 DAY)) AS stars_24h,
    COUNTIF(created_at >= TIMESTAMP_SUB(TIMESTAMP(@checkedAt), INTERVAL 2 DAY)) AS stars_48h,
    0 AS stars_7d,
    0 AS stars_30d,
    0 AS stars_90d
  FROM events
  GROUP BY full_name
)
SELECT full_name, stars_24h, stars_48h, stars_7d, stars_30d, stars_90d
FROM aggregated
WHERE
  (@query = '' OR LOWER(full_name) LIKE CONCAT('%', @query, '%'))
  AND stars_48h > 0
ORDER BY stars_24h DESC, stars_48h DESC, full_name ASC
LIMIT @limit
`;

const rowToCandidate = (
  row: BigQueryRow,
  rank: number,
  windows: readonly GitHubRepositoryTrendWindow[],
): GitHubRepoRadarCandidate | null => {
  const fullName = readString(row.full_name);

  if (fullName === undefined) {
    return null;
  }

  const candidate = {
    fullName,
    stars24h: readInteger(row.stars_24h),
    stars48h: readInteger(row.stars_48h),
    stars7d: readInteger(row.stars_7d),
    stars30d: readInteger(row.stars_30d),
    stars90d: readInteger(row.stars_90d),
    rank,
    primaryWindow: primaryWindow({
      stars24h: readInteger(row.stars_24h),
      stars48h: readInteger(row.stars_48h),
      stars7d: readInteger(row.stars_7d),
      stars30d: readInteger(row.stars_30d),
      stars90d: readInteger(row.stars_90d),
    }, windows),
  };

  return candidate;
};

const primaryWindow = (
  scores: Pick<GitHubRepoRadarCandidate, 'stars24h' | 'stars48h' | 'stars7d' | 'stars30d' | 'stars90d'>,
  windows: readonly GitHubRepositoryTrendWindow[],
): GitHubRepositoryTrendWindow => {
  const candidates = [
    ['24h', scores.stars24h],
    ['48h', scores.stars48h],
    ['7d', scores.stars7d],
    ['30d', scores.stars30d],
    ['90d', scores.stars90d],
  ] satisfies readonly (readonly [GitHubRepositoryTrendWindow, number])[];
  const filtered = candidates.filter(([window]) => windows.includes(window));

  return filtered.reduce(
    (best, current) => current[1] > best[1] ? current : best,
    filtered[0] ?? ['24h', scores.stars24h],
  )[0];
};

const dayTableSuffix = (date: Date): string =>
  [
    String(date.getUTCFullYear()).slice(2),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('');

const daysBefore = (date: Date, days: number): Date =>
  new Date(date.getTime() - days * 24 * 60 * 60 * 1000);

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const readInteger = (value: unknown): number => {
  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  if (typeof value === 'string' && /^\d+$/u.test(value)) {
    return Number(value);
  }

  return 0;
};

const positiveIntegerOrFallback = (value: number | undefined, fallback: number): number =>
  value === undefined || !Number.isInteger(value) || value < 1 ? fallback : value;
