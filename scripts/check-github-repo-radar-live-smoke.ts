import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { CryptoIdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { InMemoryFeedProjectionAdapter } from '../apps/ingestion-worker/src/adapters/feed/in-memory-feed-projection.adapter';
import { InMemoryScanLeaseAdapter } from '../libs/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemoryGitHubRepositoryTrendHistoryRepository } from '../libs/ingestion/adapters/persistence/in-memory-github-repository-trend-history.repository';
import { InMemoryScanAttemptRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '../libs/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { CircuitBreakerSourceFetcherAdapter } from '../libs/ingestion/adapters/source/circuit-breaker-source-fetcher.adapter';
import { BigQueryGitHubRepoRadarClient } from '../libs/ingestion/adapters/source/github-repo-radar/bigquery-github-repo-radar-client';
import { GitHubRepositoryTrendMetadataProjectionAdapter } from '../libs/ingestion/adapters/source/github-repo-radar/github-repository-trend-metadata-projection.adapter';
import { GitHubRepositoryLiveVerifierAdapter } from '../libs/ingestion/adapters/source/github-repo-radar/github-repository-live-verifier.adapter';
import { GitHubRepoRadarSourceProvider } from '../libs/ingestion/adapters/source/github-repo-radar/github-repo-radar-source.provider';
import { HttpGitHubClient } from '../libs/ingestion/adapters/source/github/http-github-client';
import { InMemorySourceProviderRegistry } from '../libs/ingestion/adapters/source/in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '../libs/ingestion/adapters/source/registry-source-fetcher.adapter';
import { sourceReadinessProfiles } from '../libs/ingestion/adapters/source/source-readiness-profiles';
import { GITHUB_REPO_RADAR_PROVIDER_KEY, parseGitHubRepositoryTrendMetadata } from '../libs/ingestion/domain';
import { ExecuteScanUseCase } from '../libs/ingestion/features/execute-scan/execute-scan.use-case';
import type {
  ReportScanFailedCommand,
  ReportScanSucceededCommand,
  ScanExecutionReporterPort,
  SourceConfigReaderPort,
  SourceRuntimeConfig,
} from '../libs/ingestion/ports';
import { FeedSummaryEvidenceSelector } from '../libs/summary/adapters/evidence/feed-summary-evidence.selector';
import { DeterministicSummaryModelAdapter } from '../libs/summary/adapters/model/deterministic-summary-model.adapter';
import type { SummaryModelBudget, SummaryModelInput, SummaryModelPolicy } from '../libs/summary/ports';

const enabledEnv = 'GITHUB_REPO_RADAR_LIVE_SMOKE';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

class LiveSmokeScanExecutionReporter implements ScanExecutionReporterPort {
  succeeded: ReportScanSucceededCommand | undefined;
  failed: ReportScanFailedCommand | undefined;

  async reportSucceeded(command: ReportScanSucceededCommand): Promise<void> {
    this.succeeded = command;
  }

  async reportFailed(command: ReportScanFailedCommand): Promise<void> {
    this.failed = command;
  }
}

class StaticSourceConfigReader implements SourceConfigReaderPort {
  constructor(private readonly config: SourceRuntimeConfig) {}

  async readConfig(): Promise<SourceRuntimeConfig> {
    return this.config;
  }
}

const main = async (): Promise<void> => {
  if (process.env[enabledEnv] !== '1') {
    console.log(`GitHub repo radar live smoke skipped: set ${enabledEnv}=1 to enable BigQuery + GitHub REST proof.`);
    return;
  }

  const clock = { now: () => new Date() };
  const tenant = tenantId('tenant-github-repo-radar-live-smoke');
  const workspace = workspaceId('workspace-github-repo-radar-live-smoke');
  const topicId = 'topic-github-repo-radar-live-smoke';
  const sourceBindingId = 'binding-github-repo-radar-live-smoke';
  const scanJobId = 'scan-github-repo-radar-live-smoke';
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
    clock,
  );
  const query = readOptionalEnv('GITHUB_REPO_RADAR_QUERY') ?? 'agents';
  const maxItems = readPositiveIntegerEnv('GITHUB_REPO_RADAR_MAX_ITEMS', 1, 1, 5);
  const config: Record<string, string | number | readonly string[]> = {
    topics: readCsvEnv('GITHUB_REPO_RADAR_TOPICS', ['ai', 'agents']),
    languages: readCsvEnv('GITHUB_REPO_RADAR_LANGUAGES', ['TypeScript']),
    windows: readCsvEnv('GITHUB_REPO_RADAR_WINDOWS', ['24h', '48h']),
    minStars: readPositiveIntegerEnv('GITHUB_REPO_RADAR_MIN_STARS', 100, 0, 1_000_000),
    maxItems,
    maxCandidates: readPositiveIntegerEnv('GITHUB_REPO_RADAR_MAX_CANDIDATES', 25, maxItems, 100),
    userAgent: readOptionalEnv('GITHUB_REPO_RADAR_USER_AGENT') ?? 'social-monitor-mvp-repo-radar-live-smoke/0.1',
  };
  const accessToken = readOptionalEnv('GITHUB_ACCESS_TOKEN');

  if (accessToken !== undefined) {
    config.accessToken = accessToken;
  }

  const sourceConfig = config satisfies SourceRuntimeConfig;
  const registry = new InMemorySourceProviderRegistry([provider], sourceReadinessProfiles);
  const feedItems = new InMemoryFeedItemReadRepository();
  const sourceItems = new InMemorySourceItemRepository();
  const scanAttempts = new InMemoryScanAttemptRepository();
  const scanCursors = new InMemoryScanCursorRepository();
  const scanExecutionReporter = new LiveSmokeScanExecutionReporter();
  const scanFailures = new InMemoryScanFailureQueueAdapter(new InMemoryMetricsRecorder());
  const scanLeases = new InMemoryScanLeaseAdapter();
  const trendHistory = new InMemoryGitHubRepositoryTrendHistoryRepository();
  const executeScan = new ExecuteScanUseCase(
    new CircuitBreakerSourceFetcherAdapter(
      new RegistrySourceFetcherAdapter(registry, new StaticSourceConfigReader(sourceConfig)),
      clock,
      { failureThreshold: 3, cooldownSeconds: 60 },
    ),
    sourceItems,
    new InMemoryFeedProjectionAdapter(feedItems),
    scanAttempts,
    scanCursors,
    scanExecutionReporter,
    scanFailures,
    scanLeases,
    new CryptoIdGenerator(),
    clock,
    new GitHubRepositoryTrendMetadataProjectionAdapter(trendHistory),
  );
  const result = await executeScan.execute({
    tenantId: tenant,
    workspaceId: workspace,
    scanJobId,
    topicId,
    sourceBindingId,
    scanPolicyId: 'policy-github-repo-radar-live-smoke',
    providerKey: GITHUB_REPO_RADAR_PROVIDER_KEY,
    sourceQuery: { mode: 'search', query },
    correlationId: 'corr-github-repo-radar-live-smoke',
    causationId: 'cause-github-repo-radar-live-smoke',
  });

  if (!result.ok) {
    throw result.error;
  }

  assert(result.value.fetched > 0, 'GitHub repo radar live e2e must fetch at least one verified repository');
  assert(result.value.inserted > 0, 'GitHub repo radar live e2e must persist at least one source item');
  assert(result.value.projected > 0, 'GitHub repo radar live e2e must project at least one feed item');
  assert(scanExecutionReporter.succeeded !== undefined, 'GitHub repo radar live e2e must report scan success');
  assert(scanExecutionReporter.failed === undefined, 'GitHub repo radar live e2e must not report scan failure');

  const feed = await feedItems.list({ tenantId: tenant, workspaceId: workspace, topicId, limit: 10 });
  assert(feed.items.length > 0, 'GitHub repo radar live e2e must expose feed items');

  const first = feed.items[0]?.toSnapshot();
  const metadata = parseGitHubRepositoryTrendMetadata(first?.providerMetadata);

  assert(first !== undefined, 'GitHub repo radar live e2e feed item is required');
  assert(metadata !== null, 'GitHub repo radar live smoke item must include typed repository trend metadata');
  assert(
    first.sourceItemId.startsWith(`${sourceBindingId}:github-repo-radar:${metadata.repository.fullName}:`),
    'source item id must include the repository full name and checked-at cursor',
  );
  assert(first.canonicalUrl === metadata.repository.url, 'canonical URL must match verified GitHub repository URL');
  assert(metadata.trend.source === 'gh_archive_bigquery_plus_github_live', 'live smoke must not use fixture source');

  const history = trendHistory.all();
  assert(history.length > 0, 'GitHub repo radar live e2e must persist trend history');
  assert(history[0]?.stars48h === metadata.trend.stars48h, 'trend history must keep the live 48h star delta');

  const evidence = await new FeedSummaryEvidenceSelector(feedItems, clock).select({
    tenantId: tenant,
    workspaceId: workspace,
    topicId,
    maxItems: 5,
  });
  const summaryModel = new DeterministicSummaryModelAdapter();
  const modelPolicy: SummaryModelPolicy = {
    preferredProvider: 'deterministic-local',
    maxInputTokens: 10_000,
    maxOutputTokens: 2_000,
    maxEstimatedCostUsd: 1,
  };
  const budget: SummaryModelBudget = {
    remainingTokens: 10_000,
    remainingCostUsd: 1,
  };
  const summaryInput: SummaryModelInput = {
    tenantId: tenant,
    workspaceId: workspace,
    topicId,
    evidence,
    policy: {
      format: 'executive_brief',
      tone: 'neutral',
      language: 'en',
      maxKeyPoints: 3,
      includeRisks: true,
      includeSourceHighlights: true,
      rulesVersion: 'summary.rules.github-repo-radar.live-smoke.v1',
    },
    requestedAt: clock.now(),
  };
  const route = summaryModel.route(summaryInput, modelPolicy, budget);
  const attempt = await summaryModel.summarize(summaryInput, route);
  const expectedHighlight = `${metadata.repository.fullName}: ${metadata.trend.totalStars} stars, +${metadata.trend.stars48h} in 48h`;
  const summaryHighlightObserved = attempt.draft.sourceHighlights.some((highlight) => highlight.includes(expectedHighlight));

  assert(
    summaryHighlightObserved,
    `summary source highlights must include live repo trend evidence: ${JSON.stringify(attempt.draft.sourceHighlights)}`,
  );

  const signals = [
    {
      signalId: 'github-repo-radar-gh-archive-query',
      evidence: {
        summary: 'GH Archive BigQuery query returned bounded repository trend candidates.',
        repositoryCount: result.value.fetched,
        windowsObserved: config.windows,
        maxBytesBilledConfigured: readOptionalEnv('GITHUB_REPO_RADAR_BIGQUERY_MAX_BYTES') ?? '5000000000',
        queryBounded: true,
      },
    },
    {
      signalId: 'github-repo-radar-live-verification',
      evidence: {
        summary: 'GitHub REST live verification returned canonical repository metadata.',
        verifiedRepositoryCount: result.value.fetched,
        canonicalUrlsObserved: feed.items.every((item) => item.toSnapshot().canonicalUrl.startsWith('https://github.com/')),
        repositoryMetadataObserved: metadata.repository.fullName.length > 0 && metadata.trend.totalStars > 0,
      },
    },
    {
      signalId: 'github-repo-radar-live-smoke',
      evidence: {
        summary: 'Live repo radar scan fetched, persisted, projected and summarized repository trend evidence.',
        fetched: result.value.fetched,
        inserted: result.value.inserted,
        projected: result.value.projected,
        sourceNotFixture: metadata.trend.source === 'gh_archive_bigquery_plus_github_live',
        summaryHighlightObserved,
      },
    },
  ] as const;

  console.log(
    JSON.stringify({
      status: 'passed',
      providerKey: GITHUB_REPO_RADAR_PROVIDER_KEY,
      e2e: 'scan_to_feed_to_history_to_summary',
      signals,
      repository: metadata.repository.fullName,
      totalStars: metadata.trend.totalStars,
      stars24h: metadata.trend.stars24h,
      stars48h: metadata.trend.stars48h,
      stars7d: metadata.trend.stars7d,
      primaryWindow: metadata.trend.primaryWindow,
      fetched: result.value.fetched,
      inserted: result.value.inserted,
      projected: result.value.projected,
      historyRecords: history.length,
      summaryHighlights: attempt.draft.sourceHighlights.length,
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
