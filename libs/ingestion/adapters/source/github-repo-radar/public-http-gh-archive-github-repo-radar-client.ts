import { gunzipSync } from 'node:zlib';

import type { GitHubRepositoryTrendWindow } from '../../../domain';
import type {
  GitHubRepoRadarCandidate,
  GitHubRepoRadarClientPort,
  GitHubRepoRadarQuery,
} from './github-repo-radar-client.port';

export type PublicHttpGhArchiveGitHubRepoRadarClientOptions = {
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchArchive;
  readonly timeoutMs?: number;
  readonly maxArchiveHours?: number;
};

type FetchArchive = (
  input: string,
  init: {
    readonly headers: Readonly<Record<string, string>>;
    readonly signal: AbortSignal;
  },
) => Promise<ArchiveResponse>;

type ArchiveResponse = {
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

type GitHubArchiveEvent = {
  readonly type?: unknown;
  readonly repo?: {
    readonly name?: unknown;
  };
  readonly created_at?: unknown;
};

type RepoCounts = {
  stars24h: number;
  stars48h: number;
  stars7d: number;
  stars30d: number;
  stars90d: number;
  forks24h: number;
  forks48h: number;
  forks7d: number;
  forks30d: number;
  forks90d: number;
};

const defaultBaseUrl = 'https://data.gharchive.org';
const defaultTimeoutMs = 30_000;
const defaultMaxArchiveHours = 24;

export class PublicHttpGhArchiveGitHubRepoRadarClient implements GitHubRepoRadarClientPort {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchArchive;
  private readonly timeoutMs: number;
  private readonly maxArchiveHours: number;

  constructor(options: PublicHttpGhArchiveGitHubRepoRadarClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? defaultBaseUrl).replace(/\/+$/u, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = positiveIntegerOrFallback(options.timeoutMs, defaultTimeoutMs);
    this.maxArchiveHours = positiveIntegerOrFallback(
      options.maxArchiveHours,
      defaultMaxArchiveHours,
    );
  }

  async findTrendingRepositories(
    query: GitHubRepoRadarQuery,
  ): Promise<readonly GitHubRepoRadarCandidate[]> {
    const requiredHours = largestWindowHours(query.windows);
    if (requiredHours > this.maxArchiveHours) {
      throw new Error(
        `Public GH Archive HTTP repo radar supports up to ${this.maxArchiveHours}h windows; use BigQuery for ${requiredHours}h windows.`,
      );
    }

    const counts = new Map<string, RepoCounts>();
    const hours = completedArchiveHours(query.checkedAt, requiredHours);
    for (const hour of hours) {
      await this.readArchiveHour(hour, query, counts);
    }

    return [...counts.entries()]
      .filter(([fullName]) => matchesQuery(fullName, query.query))
      .sort(([, left], [, right]) => compareCounts(left, right))
      .slice(0, query.limit)
      .map(([fullName, repoCounts], index) => ({
        fullName,
        ...repoCounts,
        rank: index + 1,
        primaryWindow: primaryWindow(repoCounts, query.windows),
      }));
  }

  private async readArchiveHour(
    hour: Date,
    query: GitHubRepoRadarQuery,
    counts: Map<string, RepoCounts>,
  ): Promise<void> {
    const response = await this.fetchImpl(archiveUrl(this.baseUrl, hour), {
      headers: { accept: 'application/gzip,application/octet-stream' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      if (response.status === 404) {
        return;
      }
      throw new Error(`GH Archive HTTP request failed with ${response.status}`);
    }

    const compressed = Buffer.from(await response.arrayBuffer());
    const lines = gunzipSync(compressed).toString('utf8').split('\n');
    for (const line of lines) {
      if (line.trim().length === 0) {
        continue;
      }

      const event = parseEvent(line);
      const fullName = readRepositoryName(event);
      const createdAt = readDate(event?.created_at);
      if (fullName === undefined || createdAt === undefined) {
        continue;
      }

      const record = counts.get(fullName) ?? {
        stars24h: 0,
        stars48h: 0,
        stars7d: 0,
        stars30d: 0,
        stars90d: 0,
        forks24h: 0,
        forks48h: 0,
        forks7d: 0,
        forks30d: 0,
        forks90d: 0,
      };
      incrementWindows(record, createdAt, query.checkedAt, event?.type);
      counts.set(fullName, record);
    }
  }
}

const parseEvent = (line: string): GitHubArchiveEvent | undefined => {
  try {
    const parsed: unknown = JSON.parse(line);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as GitHubArchiveEvent)
      : undefined;
  } catch {
    return undefined;
  }
};

const readRepositoryName = (event: GitHubArchiveEvent | undefined): string | undefined => {
  if (event?.type !== 'WatchEvent' && event?.type !== 'ForkEvent') {
    return undefined;
  }
  const name = event.repo?.name;

  return typeof name === 'string' && name.trim().length > 0
    ? name.trim()
    : undefined;
};

const readDate = (value: unknown): Date | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const incrementWindows = (
  record: RepoCounts,
  eventAt: Date,
  checkedAt: Date,
  eventType: unknown,
): void => {
  const prefix = eventType === 'ForkEvent' ? 'forks' : 'stars';
  if (eventAt >= hoursBefore(checkedAt, 24)) record[`${prefix}24h`] += 1;
  if (eventAt >= hoursBefore(checkedAt, 48)) record[`${prefix}48h`] += 1;
  if (eventAt >= hoursBefore(checkedAt, 24 * 7)) record[`${prefix}7d`] += 1;
  if (eventAt >= hoursBefore(checkedAt, 24 * 30)) record[`${prefix}30d`] += 1;
  if (eventAt >= hoursBefore(checkedAt, 24 * 90)) record[`${prefix}90d`] += 1;
};

const compareCounts = (left: RepoCounts, right: RepoCounts): number =>
  windowSignal(right.stars24h, right.forks24h) -
    windowSignal(left.stars24h, left.forks24h) ||
  windowSignal(right.stars48h, right.forks48h) -
    windowSignal(left.stars48h, left.forks48h) ||
  windowSignal(right.stars7d, right.forks7d) -
    windowSignal(left.stars7d, left.forks7d) ||
  windowSignal(right.stars30d, right.forks30d) -
    windowSignal(left.stars30d, left.forks30d) ||
  windowSignal(right.stars90d, right.forks90d) -
    windowSignal(left.stars90d, left.forks90d);

const windowSignal = (stars: number, forks: number): number =>
  Math.max(stars, forks / 2);

const matchesQuery = (fullName: string, query: string): boolean => {
  const normalizedQuery = query.trim().toLocaleLowerCase('en-US');

  return normalizedQuery.length === 0 ||
    fullName.toLocaleLowerCase('en-US').includes(normalizedQuery);
};

const primaryWindow = (
  scores: RepoCounts,
  windows: readonly GitHubRepositoryTrendWindow[],
): GitHubRepositoryTrendWindow => {
  const candidates = [
    ['24h', windowSignal(scores.stars24h, scores.forks24h)],
    ['48h', windowSignal(scores.stars48h, scores.forks48h)],
    ['7d', windowSignal(scores.stars7d, scores.forks7d)],
    ['30d', windowSignal(scores.stars30d, scores.forks30d)],
    ['90d', windowSignal(scores.stars90d, scores.forks90d)],
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
]): number => value / windowHours(window);

const largestWindowHours = (
  windows: readonly GitHubRepositoryTrendWindow[],
): number =>
  Math.max(
    ...(windows.length === 0 ? (['24h'] as const) : windows).map(windowHours),
  );

const windowHours = (window: GitHubRepositoryTrendWindow): number => {
  switch (window) {
    case '24h':
      return 24;
    case '48h':
      return 48;
    case '7d':
      return 24 * 7;
    case '30d':
      return 24 * 30;
    case '90d':
      return 24 * 90;
  }
};

const completedArchiveHours = (checkedAt: Date, hours: number): readonly Date[] => {
  const end = floorUtcHour(hoursBefore(checkedAt, 1));

  return Array.from({ length: hours }, (_, index) =>
    hoursBefore(end, hours - index - 1),
  );
};

const archiveUrl = (baseUrl: string, date: Date): string =>
  `${baseUrl}/${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}-${date.getUTCHours()}.json.gz`;

const floorUtcHour = (date: Date): Date =>
  new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
  ));

const hoursBefore = (date: Date, hours: number): Date =>
  new Date(date.getTime() - hours * 60 * 60 * 1000);

const positiveIntegerOrFallback = (
  value: number | undefined,
  fallback: number,
): number =>
  value === undefined || !Number.isInteger(value) || value < 1
    ? fallback
    : value;
