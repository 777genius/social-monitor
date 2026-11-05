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
  readonly forks_24h?: unknown;
  readonly forks_48h?: unknown;
  readonly forks_7d?: unknown;
  readonly forks_30d?: unknown;
  readonly forks_90d?: unknown;
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
    this.client =
      options.client ?? new BigQuery({ projectId: options.projectId });
    this.location = options.location ?? 'US';
    this.maximumBytesBilled =
      options.maximumBytesBilled ?? defaultMaximumBytesBilled;
    this.timeoutMs = positiveIntegerOrFallback(
      options.timeoutMs,
      defaultTimeoutMs,
    );
    this.jobTimeoutMs = positiveIntegerOrFallback(
      options.jobTimeoutMs,
      defaultJobTimeoutMs,
    );
  }

  async findTrendingRepositories(
    query: GitHubRepoRadarQuery,
  ): Promise<readonly GitHubRepoRadarCandidate[]> {
    const [job] = await this.client.createQueryJob({
      query: trendSql,
      location: this.location,
      maximumBytesBilled: this.maximumBytesBilled,
      jobTimeoutMs: this.jobTimeoutMs,
      params: {
        startTableSuffix: dayTableSuffix(
          daysBefore(query.checkedAt, largestWindowDays(query.windows)),
        ),
        endTableSuffix: dayTableSuffix(query.checkedAt),
        checkedAt: query.checkedAt.toISOString(),
        query: query.query.toLocaleLowerCase('en-US'),
        limit: query.limit,
      },
    });
    const [rows] = await job.getQueryResults({ timeoutMs: this.timeoutMs });

    return (rows as readonly BigQueryRow[])
      .map((row, index) => rowToCandidate(row, index + 1, query.windows))
      .filter(
        (candidate): candidate is GitHubRepoRadarCandidate =>
          candidate !== null,
      )
      .slice(0, query.limit);
  }
}

const trendSql = `
WITH events AS (
  SELECT
    repo.name AS full_name,
    created_at,
    type
  FROM \`githubarchive.day.20*\`
  WHERE
    _TABLE_SUFFIX BETWEEN @startTableSuffix AND @endTableSuffix
    AND type IN ('WatchEvent', 'ForkEvent')
    AND repo.name IS NOT NULL
),
aggregated AS (
  SELECT
    full_name,
    COUNTIF(type = 'WatchEvent' AND created_at >= TIMESTAMP_SUB(TIMESTAMP(@checkedAt), INTERVAL 1 DAY)) AS stars_24h,
    COUNTIF(type = 'WatchEvent' AND created_at >= TIMESTAMP_SUB(TIMESTAMP(@checkedAt), INTERVAL 2 DAY)) AS stars_48h,
    COUNTIF(type = 'WatchEvent' AND created_at >= TIMESTAMP_SUB(TIMESTAMP(@checkedAt), INTERVAL 7 DAY)) AS stars_7d,
    COUNTIF(type = 'WatchEvent' AND created_at >= TIMESTAMP_SUB(TIMESTAMP(@checkedAt), INTERVAL 30 DAY)) AS stars_30d,
    COUNTIF(type = 'WatchEvent' AND created_at >= TIMESTAMP_SUB(TIMESTAMP(@checkedAt), INTERVAL 90 DAY)) AS stars_90d,
    COUNTIF(type = 'ForkEvent' AND created_at >= TIMESTAMP_SUB(TIMESTAMP(@checkedAt), INTERVAL 1 DAY)) AS forks_24h,
    COUNTIF(type = 'ForkEvent' AND created_at >= TIMESTAMP_SUB(TIMESTAMP(@checkedAt), INTERVAL 2 DAY)) AS forks_48h,
    COUNTIF(type = 'ForkEvent' AND created_at >= TIMESTAMP_SUB(TIMESTAMP(@checkedAt), INTERVAL 7 DAY)) AS forks_7d,
    COUNTIF(type = 'ForkEvent' AND created_at >= TIMESTAMP_SUB(TIMESTAMP(@checkedAt), INTERVAL 30 DAY)) AS forks_30d,
    COUNTIF(type = 'ForkEvent' AND created_at >= TIMESTAMP_SUB(TIMESTAMP(@checkedAt), INTERVAL 90 DAY)) AS forks_90d
  FROM events
  GROUP BY full_name
)
SELECT full_name, stars_24h, stars_48h, stars_7d, stars_30d, stars_90d,
  forks_24h, forks_48h, forks_7d, forks_30d, forks_90d
FROM aggregated
WHERE
  (@query = '' OR LOWER(full_name) LIKE CONCAT('%', @query, '%'))
  AND (stars_24h > 0 OR stars_48h > 0 OR stars_7d > 0 OR stars_30d > 0 OR stars_90d > 0
    OR forks_24h > 0 OR forks_48h > 0 OR forks_7d > 0 OR forks_30d > 0 OR forks_90d > 0)
ORDER BY GREATEST(stars_24h, forks_24h / 2.0) DESC,
  GREATEST(stars_48h, forks_48h / 2.0) DESC,
  GREATEST(stars_7d, forks_7d / 2.0) DESC,
  GREATEST(stars_30d, forks_30d / 2.0) DESC,
  GREATEST(stars_90d, forks_90d / 2.0) DESC,
  full_name ASC
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
    forks24h: readInteger(row.forks_24h),
    forks48h: readInteger(row.forks_48h),
    forks7d: readInteger(row.forks_7d),
    forks30d: readInteger(row.forks_30d),
    forks90d: readInteger(row.forks_90d),
    rank,
    primaryWindow: primaryWindow(
      {
        stars24h: readInteger(row.stars_24h),
        stars48h: readInteger(row.stars_48h),
        stars7d: readInteger(row.stars_7d),
        stars30d: readInteger(row.stars_30d),
        stars90d: readInteger(row.stars_90d),
        forks24h: readInteger(row.forks_24h),
        forks48h: readInteger(row.forks_48h),
        forks7d: readInteger(row.forks_7d),
        forks30d: readInteger(row.forks_30d),
        forks90d: readInteger(row.forks_90d),
      },
      windows,
    ),
  };

  return candidate;
};

const primaryWindow = (
  scores: Pick<
    GitHubRepoRadarCandidate,
    | 'stars24h'
    | 'stars48h'
    | 'stars7d'
    | 'stars30d'
    | 'stars90d'
    | 'forks24h'
    | 'forks48h'
    | 'forks7d'
    | 'forks30d'
    | 'forks90d'
  >,
  windows: readonly GitHubRepositoryTrendWindow[],
): GitHubRepositoryTrendWindow => {
  const candidates = [
    ['24h', Math.max(scores.stars24h, scores.forks24h / 2)],
    ['48h', Math.max(scores.stars48h, scores.forks48h / 2)],
    ['7d', Math.max(scores.stars7d, scores.forks7d / 2)],
    ['30d', Math.max(scores.stars30d, scores.forks30d / 2)],
    ['90d', Math.max(scores.stars90d, scores.forks90d / 2)],
  ] satisfies readonly (readonly [GitHubRepositoryTrendWindow, number])[];
  const filtered = candidates.filter(([window]) => windows.includes(window));

  return filtered.reduce(
    (best, current) =>
      trendVelocity(current) > trendVelocity(best) ? current : best,
    filtered[0] ?? ['24h', scores.stars24h],
  )[0];
};

const trendVelocity = ([window, value]: readonly [
  GitHubRepositoryTrendWindow,
  number,
]): number => value / windowDays(window);

const largestWindowDays = (
  windows: readonly GitHubRepositoryTrendWindow[],
): number =>
  Math.max(
    ...(windows.length === 0 ? (['24h'] as const) : windows).map(windowDays),
  );

const windowDays = (window: GitHubRepositoryTrendWindow): number => {
  switch (window) {
    case '24h':
      return 1;
    case '48h':
      return 2;
    case '7d':
      return 7;
    case '30d':
      return 30;
    case '90d':
      return 90;
  }
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
  typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;

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

const positiveIntegerOrFallback = (
  value: number | undefined,
  fallback: number,
): number =>
  value === undefined || !Number.isInteger(value) || value < 1
    ? fallback
    : value;
