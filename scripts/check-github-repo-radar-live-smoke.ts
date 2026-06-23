import { BigQueryGitHubRepoRadarClient } from '../libs/ingestion/adapters/source/github-repo-radar/bigquery-github-repo-radar-client';
import { GitHubRepositoryLiveVerifierAdapter } from '../libs/ingestion/adapters/source/github-repo-radar/github-repository-live-verifier.adapter';
import { GitHubRepoRadarSourceProvider } from '../libs/ingestion/adapters/source/github-repo-radar/github-repo-radar-source.provider';
import { HttpGitHubClient } from '../libs/ingestion/adapters/source/github/http-github-client';
import { GITHUB_REPO_RADAR_PROVIDER_KEY, parseGitHubRepositoryTrendMetadata } from '../libs/ingestion/domain';
import type { SourceRuntimeConfig } from '../libs/ingestion/ports';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

const enabledEnv = 'GITHUB_REPO_RADAR_LIVE_SMOKE';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const main = async (): Promise<void> => {
  if (process.env[enabledEnv] !== '1') {
    console.log(`GitHub repo radar live smoke skipped: set ${enabledEnv}=1 to enable BigQuery + GitHub REST proof.`);
    return;
  }

  const provider = new GitHubRepoRadarSourceProvider(
    new BigQueryGitHubRepoRadarClient({
      projectId: firstEnv('GITHUB_REPO_RADAR_BIGQUERY_PROJECT_ID', 'GOOGLE_CLOUD_PROJECT', 'GCLOUD_PROJECT'),
      location: readOptionalEnv('GITHUB_REPO_RADAR_BIGQUERY_LOCATION') ?? 'US',
      maximumBytesBilled: readOptionalEnv('GITHUB_REPO_RADAR_BIGQUERY_MAX_BYTES') ?? '5000000000',
      timeoutMs: readPositiveIntegerEnv('GITHUB_REPO_RADAR_BIGQUERY_TIMEOUT_MS', 30_000, 1_000, 120_000),
      jobTimeoutMs: readPositiveIntegerEnv('GITHUB_REPO_RADAR_BIGQUERY_JOB_TIMEOUT_MS', 60_000, 1_000, 180_000),
    }),
    new GitHubRepositoryLiveVerifierAdapter(
      new HttpGitHubClient(readPositiveIntegerEnv('GITHUB_REPO_RADAR_GITHUB_TIMEOUT_MS', 10_000, 1_000, 60_000)),
    ),
    { now: () => new Date() },
  );
  const query = readOptionalEnv('GITHUB_REPO_RADAR_QUERY') ?? 'agents';
  const maxItems = readPositiveIntegerEnv('GITHUB_REPO_RADAR_MAX_ITEMS', 1, 1, 5);
  const config: Record<string, string | number | readonly string[]> = {
    topics: readCsvEnv('GITHUB_REPO_RADAR_TOPICS', ['ai', 'agents']),
    languages: readCsvEnv('GITHUB_REPO_RADAR_LANGUAGES', ['TypeScript']),
    windows: readCsvEnv('GITHUB_REPO_RADAR_WINDOWS', ['24h', '7d', '30d']),
    minStars: readPositiveIntegerEnv('GITHUB_REPO_RADAR_MIN_STARS', 100, 0, 1_000_000),
    maxItems,
    maxCandidates: readPositiveIntegerEnv('GITHUB_REPO_RADAR_MAX_CANDIDATES', 25, maxItems, 100),
    userAgent: readOptionalEnv('GITHUB_REPO_RADAR_USER_AGENT') ?? 'social-monitor-mvp-repo-radar-live-smoke/0.1',
  };
  const accessToken = readOptionalEnv('GITHUB_ACCESS_TOKEN');

  if (accessToken !== undefined) {
    config.accessToken = accessToken;
  }

  const context = {
    tenantId: tenantId('tenant-github-repo-radar-live-smoke'),
    workspaceId: workspaceId('workspace-github-repo-radar-live-smoke'),
    sourceBindingId: 'binding-github-repo-radar-live-smoke',
    scanJobId: 'scan-github-repo-radar-live-smoke',
    correlationId: 'corr-github-repo-radar-live-smoke',
    config: config satisfies SourceRuntimeConfig,
  };

  const plan = provider.planScan({ mode: 'search', query }, context);
  const result = await provider.scan(plan, context);

  assert(result.items.length > 0, 'GitHub repo radar live smoke must return at least one verified repository');

  const first = result.items[0];
  const metadata = parseGitHubRepositoryTrendMetadata(first?.metadata);

  assert(first !== undefined, 'GitHub repo radar live smoke item is required');
  assert(metadata !== null, 'GitHub repo radar live smoke item must include typed repository trend metadata');
  assert(first.externalId === metadata.repository.fullName, 'external id must be the repository full name');
  assert(first.canonicalUrl === metadata.repository.url, 'canonical URL must match verified GitHub repository URL');
  assert(metadata.trend.source === 'gh_archive_bigquery_plus_github_live', 'live smoke must not use fixture source');

  console.log(
    JSON.stringify({
      status: 'passed',
      providerKey: GITHUB_REPO_RADAR_PROVIDER_KEY,
      repository: metadata.repository.fullName,
      totalStars: metadata.trend.totalStars,
      stars24h: metadata.trend.stars24h,
      stars7d: metadata.trend.stars7d,
      primaryWindow: metadata.trend.primaryWindow,
      warnings: result.warnings.length,
      nextCursor: result.nextCursor,
    }),
  );
};

const readOptionalEnv = (key: string): string | undefined => {
  const value = process.env[key]?.trim();

  return value === undefined || value.length === 0 ? undefined : value;
};

const firstEnv = (...keys: readonly string[]): string | undefined => {
  for (const key of keys) {
    const value = readOptionalEnv(key);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
};

const readCsvEnv = (key: string, fallback: readonly string[]): readonly string[] => {
  const raw = readOptionalEnv(key);
  if (raw === undefined) {
    return fallback;
  }

  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return values.length === 0 ? fallback : values;
};

const readPositiveIntegerEnv = (
  key: string,
  fallback: number,
  min: number,
  max: number,
): number => {
  const raw = readOptionalEnv(key);
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return fallback;
  }

  return parsed;
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
