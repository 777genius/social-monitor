import { randomUUID } from 'node:crypto';

import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { CryptoIdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { Pool } from 'pg';

import { PrismaIngestionWorkerConnection } from '../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection';
import { PrismaFeedItemReadRepository } from '../libs/feed/adapters/persistence/prisma/prisma-feed-item-read.repository';
import { PrismaFeedProjectionAdapter } from '../libs/feed/adapters/persistence/prisma/prisma-feed-projection.adapter';
import { PrismaGitHubRepositoryTrendHistoryRepository } from '../libs/ingestion/adapters/persistence/prisma/prisma-github-repository-trend-history.repository';
import { PrismaScanAttemptRepository } from '../libs/ingestion/adapters/persistence/prisma/prisma-scan-attempt.repository';
import { PrismaScanCursorRepository } from '../libs/ingestion/adapters/persistence/prisma/prisma-scan-cursor.repository';
import { PrismaScanFailureQueueAdapter } from '../libs/ingestion/adapters/persistence/prisma/prisma-scan-failure-queue.adapter';
import { PrismaScanLeaseAdapter } from '../libs/ingestion/adapters/persistence/prisma/prisma-scan-lease.adapter';
import { PrismaSourceItemRepository } from '../libs/ingestion/adapters/persistence/prisma/prisma-source-item.repository';
import { CircuitBreakerSourceFetcherAdapter } from '../libs/ingestion/adapters/source/circuit-breaker-source-fetcher.adapter';
import { BigQueryGitHubRepoRadarClient } from '../libs/ingestion/adapters/source/github-repo-radar/bigquery-github-repo-radar-client';
import { GitHubRepositoryTrendMetadataProjectionAdapter } from '../libs/ingestion/adapters/source/github-repo-radar/github-repository-trend-metadata-projection.adapter';
import { GitHubRepositoryLiveVerifierAdapter } from '../libs/ingestion/adapters/source/github-repo-radar/github-repository-live-verifier.adapter';
import { GitHubRepoRadarSourceProvider } from '../libs/ingestion/adapters/source/github-repo-radar/github-repo-radar-source.provider';
import { PublicHttpGhArchiveGitHubRepoRadarClient } from '../libs/ingestion/adapters/source/github-repo-radar/public-http-gh-archive-github-repo-radar-client';
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
  SourceReadinessFreshnessGuard,
  SourceRuntimeConfig,
} from '../libs/ingestion/ports';
import { FeedSummaryEvidenceSelector } from '../libs/summary/adapters/evidence/feed-summary-evidence.selector';
import { DeterministicSummaryModelAdapter } from '../libs/summary/adapters/model/deterministic-summary-model.adapter';
import type { SummaryModelBudget, SummaryModelInput, SummaryModelPolicy } from '../libs/summary/ports';
import { writeLiveEvidenceArtifactAtomically } from './lib/live-evidence-artifact';
import { classifyProviderFailures } from './lib/provider-failure-classification';

const enabledEnv = 'GITHUB_REPO_RADAR_PRISMA_LIVE_E2E';
const defaultDatabaseUrl = 'postgresql://social_monitor:social_monitor_local_password@127.0.0.1:5432/social_monitor';
const liveArtifactFormat = 'source-live-provider-evidence-v1';
const liveEvidencePathEnv = 'GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH';
const environmentIdEnv = 'SOURCE_LIVE_ENVIRONMENT_ID';
const imageDigestEnv = 'BACKEND_IMAGE_DIGEST';
const commitShaEnv = 'BACKEND_GIT_COMMIT_SHA';
const operatorEnv = 'SOURCE_LIVE_OPERATOR';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

class LivePrismaScanExecutionReporter implements ScanExecutionReporterPort {
  readonly succeeded: ReportScanSucceededCommand[] = [];
  readonly failed: ReportScanFailedCommand[] = [];

  async reportSucceeded(command: ReportScanSucceededCommand): Promise<void> {
    this.succeeded.push(command);
  }

  async reportFailed(command: ReportScanFailedCommand): Promise<void> {
    this.failed.push(command);
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
    console.log(`GitHub repo radar Prisma live e2e skipped: set ${enabledEnv}=1 to enable BigQuery + GitHub REST + Postgres proof.`);
    return;
  }

  const databaseUrl = readOptionalEnv('DATABASE_URL') ?? defaultDatabaseUrl;
  const connection = new PrismaIngestionWorkerConnection(databaseUrl);
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const ids = new CryptoIdGenerator();
    const scanRuns = readPositiveIntegerEnv('GITHUB_REPO_RADAR_SCAN_RUNS', 2, 1, 3);
    const baseCheckedAt = new Date(Date.now() - (scanRuns - 1) * 60_000);
    let currentClockNow = baseCheckedAt;
    const clock = { now: () => new Date(currentClockNow.getTime()) };
    const tenant = tenantId(readOptionalEnv('GITHUB_REPO_RADAR_TENANT_ID') ?? randomUUID());
    const workspace = workspaceId(readOptionalEnv('GITHUB_REPO_RADAR_WORKSPACE_ID') ?? randomUUID());
    const interestId = readOptionalEnv('GITHUB_REPO_RADAR_TOPIC_ID') ?? randomUUID();
    const sourceBindingId = readOptionalEnv('GITHUB_REPO_RADAR_SOURCE_BINDING_ID') ?? randomUUID();
    const scanPolicyId = readOptionalEnv('GITHUB_REPO_RADAR_SCAN_POLICY_ID') ?? randomUUID();
    const radarClientMode = readOptionalEnv('GITHUB_REPO_RADAR_CLIENT') === 'public-gharchive-http'
      ? 'public-gharchive-http'
      : 'bigquery';
    const expectedTrendSource = radarClientMode === 'public-gharchive-http'
      ? 'gh_archive_public_http_plus_github_live'
      : 'gh_archive_bigquery_plus_github_live';
    const radarClient = radarClientMode === 'public-gharchive-http'
      ? new PublicHttpGhArchiveGitHubRepoRadarClient({
        timeoutMs: readPositiveIntegerEnv('GITHUB_REPO_RADAR_PUBLIC_HTTP_TIMEOUT_MS', 30_000, 1_000, 120_000),
        maxArchiveHours: readPositiveIntegerEnv('GITHUB_REPO_RADAR_PUBLIC_HTTP_MAX_ARCHIVE_HOURS', 24, 1, 48),
      })
      : new BigQueryGitHubRepoRadarClient({
        projectId: firstEnv('GITHUB_REPO_RADAR_BIGQUERY_PROJECT_ID', 'GOOGLE_CLOUD_PROJECT', 'GCLOUD_PROJECT'),
        location: readOptionalEnv('GITHUB_REPO_RADAR_BIGQUERY_LOCATION') ?? 'US',
        maximumBytesBilled: readOptionalEnv('GITHUB_REPO_RADAR_BIGQUERY_MAX_BYTES') ?? '5000000000',
        timeoutMs: readPositiveIntegerEnv('GITHUB_REPO_RADAR_BIGQUERY_TIMEOUT_MS', 30_000, 1_000, 120_000),
        jobTimeoutMs: readPositiveIntegerEnv('GITHUB_REPO_RADAR_BIGQUERY_JOB_TIMEOUT_MS', 60_000, 1_000, 180_000),
      });
    const provider = new GitHubRepoRadarSourceProvider(
      radarClient,
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
      userAgent: readOptionalEnv('GITHUB_REPO_RADAR_USER_AGENT') ?? 'social-monitor-mvp-repo-radar-prisma-live-e2e/0.1',
      trendSource: expectedTrendSource,
    };
    const accessToken = readOptionalEnv('GITHUB_ACCESS_TOKEN');

    if (accessToken !== undefined) {
      config.accessToken = accessToken;
    }

    const sourceConfig = config satisfies SourceRuntimeConfig;
    const registry = new InMemorySourceProviderRegistry([provider], sourceReadinessProfiles);
    const sourceItems = new PrismaSourceItemRepository(connection);
    const feedRead = new PrismaFeedItemReadRepository(connection);
    const reporter = new LivePrismaScanExecutionReporter();
    const executeScan = new ExecuteScanUseCase(
      new CircuitBreakerSourceFetcherAdapter(
        new RegistrySourceFetcherAdapter(registry, new StaticSourceConfigReader(sourceConfig)),
        clock,
        { failureThreshold: 3, cooldownSeconds: 60 },
      ),
      sourceItems,
      new PrismaFeedProjectionAdapter(connection, ids),
      new PrismaScanAttemptRepository(connection),
      new PrismaScanCursorRepository(connection, ids),
      reporter,
      new PrismaScanFailureQueueAdapter(connection, new InMemoryMetricsRecorder(), ids),
      new PrismaScanLeaseAdapter(connection, ids),
      ids,
      clock,
      new GitHubRepositoryTrendMetadataProjectionAdapter(
        new PrismaGitHubRepositoryTrendHistoryRepository(connection, ids),
      ),
    );

    const scanResults: Array<{
      readonly scanJobId: string;
      readonly fetched: number;
      readonly inserted: number;
      readonly projected: number;
    }> = [];
    const scanJobIds: string[] = [];

    for (let runIndex = 0; runIndex < scanRuns; runIndex += 1) {
      currentClockNow = new Date(baseCheckedAt.getTime() + runIndex * 60_000);
      const scanJobId = randomUUID();
      const result = await executeScan.execute({
        tenantId: tenant,
        workspaceId: workspace,
        scanJobId,
        interestId,
        sourceBindingId,
        scanPolicyId,
        providerKey: GITHUB_REPO_RADAR_PROVIDER_KEY,
        sourceQuery: { mode: 'search', query },
        correlationId: `corr-github-repo-radar-prisma-live-e2e-${scanJobId}`,
        causationId: `cause-github-repo-radar-prisma-live-e2e-${scanJobId}`,
      });

      if (!result.ok) {
        throw result.error;
      }

      assert(result.value.fetched > 0, 'Prisma live e2e must fetch at least one verified GitHub repository');
      assert(result.value.inserted > 0, 'Prisma live e2e must insert source items into Postgres');
      assert(result.value.projected > 0, 'Prisma live e2e must project feed items into Postgres');

      scanResults.push({
        scanJobId,
        fetched: result.value.fetched,
        inserted: result.value.inserted,
        projected: result.value.projected,
      });
      scanJobIds.push(scanJobId);
    }

    assert(reporter.succeeded.length === scanRuns, `expected ${scanRuns} scan successes, got ${reporter.succeeded.length}`);
    assert(reporter.failed.length === 0, `Prisma live e2e must not report scan failures: ${JSON.stringify(reporter.failed)}`);

    const feed = await feedRead.list({ tenantId: tenant, workspaceId: workspace, interestId, limit: 10 });
    assert(feed.items.length > 0, 'Prisma live e2e must read persisted feed items from Postgres');

    const feedSnapshot = feed.items[0]?.toSnapshot();
    const metadata = parseGitHubRepositoryTrendMetadata(feedSnapshot?.providerMetadata);
    assert(feedSnapshot !== undefined, 'Prisma live e2e feed snapshot is required');
    assert(metadata !== null, 'Prisma live e2e feed metadata must be typed repository trend metadata');
    assert(metadata.trend.source === expectedTrendSource, 'Prisma live e2e must not use fixture trend data');
    assert(metadata.trend.stars48h > 0, 'Prisma live e2e must persist a non-zero 48h GitHub star delta');

    const sqlEvidence = await readSqlEvidence(pool, {
      tenantId: tenant,
      workspaceId: workspace,
      interestId,
      sourceBindingId,
      scanJobIds,
    });

    assert(sqlEvidence.sourceItemCount >= scanRuns, `expected at least ${scanRuns} source_items rows, got ${sqlEvidence.sourceItemCount}`);
    assert(sqlEvidence.feedItemCount >= 1, `expected at least one feed_items row, got ${sqlEvidence.feedItemCount}`);
    assert(sqlEvidence.trendCandidateCount >= scanRuns, `expected at least ${scanRuns} trend candidate rows, got ${sqlEvidence.trendCandidateCount}`);
    assert(sqlEvidence.trendSnapshotCount >= scanRuns, `expected at least ${scanRuns} trend snapshot rows, got ${sqlEvidence.trendSnapshotCount}`);
    assert(sqlEvidence.trendResultCount >= scanRuns, `expected at least ${scanRuns} trend result rows, got ${sqlEvidence.trendResultCount}`);
    assert(sqlEvidence.cursorCount === 1, `expected one cursor checkpoint row, got ${sqlEvidence.cursorCount}`);
    assert(sqlEvidence.scanAttemptCount === scanRuns, `expected ${scanRuns} scan attempts, got ${sqlEvidence.scanAttemptCount}`);
    assert(
      sqlEvidence.scanAttemptStatuses.every((status) => status === 'SUCCEEDED'),
      `expected all scan attempts to succeed, got ${sqlEvidence.scanAttemptStatuses.join(', ')}`,
    );
    assert(
      sqlEvidence.sourceProviderItemIds.some((providerItemId) =>
        providerItemId.startsWith(`github-repo-radar:${metadata.repository.fullName}:`),
      ),
      'source_items provider_item_id must include repository full name',
    );
    assert(
      sqlEvidence.feedProviderMetadataList.some((feedMetadata) =>
        feedMetadata.kind === 'github_repository_trend' &&
        feedMetadata.trend?.stars48h === metadata.trend.stars48h
      ),
      'feed_items provider_metadata must keep 48h star delta',
    );
    assert(sqlEvidence.trendCandidateStars48hValues.includes(metadata.trend.stars48h), 'trend candidate must keep 48h star delta');
    assert(sqlEvidence.trendSnapshotStars48hValues.includes(metadata.trend.stars48h), 'trend snapshot must keep 48h star delta');
    assert(
      sqlEvidence.trendResultMetadataList.some((resultMetadata) => resultMetadata.trend?.stars48h === metadata.trend.stars48h),
      'trend result metadata must keep 48h star delta',
    );

    const evidence = await new FeedSummaryEvidenceSelector(feedRead, clock).select({
      tenantId: tenant,
      workspaceId: workspace,
      interestId,
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
      interestId,
      evidence,
      policy: {
        format: 'executive_brief',
        tone: 'neutral',
        language: 'en',
        maxKeyPoints: 3,
        includeRisks: true,
        includeSourceHighlights: true,
        rulesVersion: 'summary.rules.github-repo-radar.prisma-live-e2e.v1',
      },
      requestedAt: clock.now(),
    };
    const route = summaryModel.route(summaryInput, modelPolicy, budget);
    const attempt = await summaryModel.summarize(summaryInput, route);
    const expectedHighlight = `${metadata.repository.fullName}: ${metadata.trend.totalStars} stars, +${metadata.trend.stars48h} in 48h`;
    const summaryHighlightObserved = attempt.draft.sourceHighlights.some((highlight) => highlight.includes(expectedHighlight));

    assert(
      summaryHighlightObserved,
      `summary source highlights must include persisted repo trend evidence: ${JSON.stringify(attempt.draft.sourceHighlights)}`,
    );

    const observedAt = clock.now().toISOString();
    const signals = [
      {
        signalId: 'github-repo-radar-gh-archive-query',
        status: 'passed',
        observedAt,
        evidence: {
          summary: radarClientMode === 'public-gharchive-http'
            ? 'Public GH Archive hourly HTTP archives returned bounded repository trend candidates.'
            : 'GH Archive BigQuery query returned bounded repository trend candidates.',
          accessMode: radarClientMode,
          repositoryCount: sumScanResults(scanResults, 'fetched'),
          windowsObserved: config.windows,
          maxBytesBilledConfigured: radarClientMode === 'bigquery'
            ? readOptionalEnv('GITHUB_REPO_RADAR_BIGQUERY_MAX_BYTES') ?? '5000000000'
            : `public-http-hourly-archive-cap:${readPositiveIntegerEnv('GITHUB_REPO_RADAR_PUBLIC_HTTP_MAX_ARCHIVE_HOURS', 24, 1, 48)}h`,
          queryBounded: true,
        },
        metrics: {
          fetched: sumScanResults(scanResults, 'fetched'),
          maxCandidates: config.maxCandidates,
          publicArchiveHours: radarClientMode === 'public-gharchive-http'
            ? readPositiveIntegerEnv('GITHUB_REPO_RADAR_PUBLIC_HTTP_MAX_ARCHIVE_HOURS', 24, 1, 48)
            : undefined,
        },
      },
      {
        signalId: 'github-repo-radar-live-verification',
        status: 'passed',
        observedAt,
        evidence: {
          summary: 'GitHub REST live verification returned canonical repository metadata.',
          verifiedRepositoryCount: sumScanResults(scanResults, 'fetched'),
          canonicalUrlsObserved: feed.items.every((item) => item.toSnapshot().canonicalUrl.startsWith('https://github.com/')),
          repositoryMetadataObserved: metadata.repository.fullName.length > 0 && metadata.trend.totalStars > 0,
        },
        metrics: {
          verifiedRepositoryCount: sumScanResults(scanResults, 'fetched'),
        },
      },
      {
        signalId: 'github-repo-radar-live-smoke',
        status: 'passed',
        observedAt,
        evidence: {
          summary: 'Live repo radar scan fetched, inserted, projected and summarized repository trend evidence.',
          fetched: sumScanResults(scanResults, 'fetched'),
          inserted: sumScanResults(scanResults, 'inserted'),
          projected: sumScanResults(scanResults, 'projected'),
          sourceNotFixture: metadata.trend.source === expectedTrendSource,
          summaryHighlightObserved,
        },
        metrics: {
          summaryHighlights: attempt.draft.sourceHighlights.length,
        },
      },
      {
        signalId: 'github-repo-radar-prisma-live-e2e',
        status: 'passed',
        observedAt,
        evidence: {
          summary: 'Postgres persisted repo radar source items, feed items, trend history and cursor state across repeated scans.',
          scanRuns,
          sourceItemCount: sqlEvidence.sourceItemCount,
          feedItemCount: sqlEvidence.feedItemCount,
          trendResultCount: sqlEvidence.trendResultCount,
          cursorCount: sqlEvidence.cursorCount,
          noDuplicateCursor: sqlEvidence.cursorCount === 1,
        },
        metrics: {
          trendCandidates: sqlEvidence.trendCandidateCount,
          trendSnapshots: sqlEvidence.trendSnapshotCount,
          trendResults: sqlEvidence.trendResultCount,
          scanAttempts: sqlEvidence.scanAttemptCount,
        },
      },
      {
        signalId: 'github-repo-radar-provider-failure-classification',
        status: 'passed',
        observedAt,
        evidence: classifyProviderFailures('GitHub Repo Radar', (error) => provider.classifyError(error), [
          {
            label: 'auth_failed',
            error: new Error('401 credential permission denied by GitHub live verifier'),
            expectedKind: 'auth_failed',
            expectedRetryable: false,
          },
          {
            label: 'rate_limit',
            error: new Error('BigQuery quota exceeded and GitHub API rate limit reached'),
            expectedKind: 'rate_limited',
            expectedRetryable: true,
          },
          {
            label: 'upstream_unavailable',
            error: new Error('GH Archive BigQuery upstream unavailable'),
            expectedKind: 'unavailable',
            expectedRetryable: true,
          },
        ]),
        metrics: {
          classifiedFailureCount: 3,
        },
      },
    ] as const;
    const output = {
      status: 'passed',
      providerKey: GITHUB_REPO_RADAR_PROVIDER_KEY,
      e2e: radarClientMode === 'public-gharchive-http'
        ? 'live_public_gharchive_http_github_to_prisma_postgres_to_feed_to_summary_repeated_scans'
        : 'live_bigquery_github_to_prisma_postgres_to_feed_to_summary_repeated_scans',
      signals,
      database: databaseKind(databaseUrl),
      scanRuns,
      tenantId: tenant,
      workspaceId: workspace,
      interestId,
      sourceBindingId,
      scanJobIds,
      repository: metadata.repository.fullName,
      totalStars: metadata.trend.totalStars,
      stars24h: metadata.trend.stars24h,
      stars48h: metadata.trend.stars48h,
      primaryWindow: metadata.trend.primaryWindow,
      trendSource: metadata.trend.source,
      fetched: sumScanResults(scanResults, 'fetched'),
      inserted: sumScanResults(scanResults, 'inserted'),
      projected: sumScanResults(scanResults, 'projected'),
      sourceItems: sqlEvidence.sourceItemCount,
      feedItems: sqlEvidence.feedItemCount,
      trendCandidates: sqlEvidence.trendCandidateCount,
      trendSnapshots: sqlEvidence.trendSnapshotCount,
      trendResults: sqlEvidence.trendResultCount,
      scanAttempts: sqlEvidence.scanAttemptCount,
      summaryHighlights: attempt.draft.sourceHighlights.length,
    };

    writeGitHubRepoRadarLiveEvidenceArtifactIfRequested({
      sampledAt: new Date().toISOString(),
      collectionMethod: radarClientMode === 'public-gharchive-http'
        ? 'Live GitHub repo radar provider scan with public GH Archive hourly HTTP archives, GitHub REST verifier and Postgres persistence.'
        : 'Live GitHub repo radar provider scan with GH Archive BigQuery, GitHub REST verifier and Postgres persistence.',
      signals,
    });

    console.log(JSON.stringify(output));
  } finally {
    await connection.close();
    await pool.end();
  }
};

type SqlEvidenceScope = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly interestId: string;
  readonly sourceBindingId: string;
  readonly scanJobIds: readonly string[];
};

type SqlMetadata = Record<string, unknown> & {
  readonly kind?: unknown;
  readonly trend?: {
    readonly stars48h?: unknown;
  };
};

type SqlEvidence = {
  readonly sourceItemCount: number;
  readonly sourceProviderItemIds: readonly string[];
  readonly feedItemCount: number;
  readonly feedProviderMetadataList: readonly SqlMetadata[];
  readonly trendCandidateCount: number;
  readonly trendCandidateStars48hValues: readonly number[];
  readonly trendSnapshotCount: number;
  readonly trendSnapshotStars48hValues: readonly number[];
  readonly trendResultCount: number;
  readonly trendResultMetadataList: readonly SqlMetadata[];
  readonly cursorCount: number;
  readonly scanAttemptCount: number;
  readonly scanAttemptStatuses: readonly string[];
};

const readSqlEvidence = async (pool: Pool, scope: SqlEvidenceScope): Promise<SqlEvidence> => {
  const sourceItems = await pool.query<{
    readonly provider_item_id: string;
    readonly metadata: SqlMetadata;
  }>(
    `SELECT provider_item_id, metadata
     FROM source_items
     WHERE tenant_id = $1 AND workspace_id = $2 AND source_binding_id = $3 AND provider_key = $4
     ORDER BY created_at DESC`,
    [scope.tenantId, scope.workspaceId, scope.sourceBindingId, GITHUB_REPO_RADAR_PROVIDER_KEY],
  );
  const feedItems = await pool.query<{
    readonly provider_metadata: SqlMetadata;
  }>(
    `SELECT provider_metadata
     FROM feed_items
     WHERE tenant_id = $1 AND workspace_id = $2 AND topic_id = $3 AND provider_key = $4
     ORDER BY created_at DESC`,
    [scope.tenantId, scope.workspaceId, scope.interestId, GITHUB_REPO_RADAR_PROVIDER_KEY],
  );
  const candidates = await pool.query<{ readonly stars_48h: number }>(
    `SELECT stars_48h
     FROM github_repository_trend_candidates
     WHERE tenant_id = $1 AND workspace_id = $2 AND source_binding_id = $3
     ORDER BY observed_at DESC`,
    [scope.tenantId, scope.workspaceId, scope.sourceBindingId],
  );
  const snapshots = await pool.query<{ readonly stars_48h: number }>(
    `SELECT stars_48h
     FROM github_repository_trend_snapshots
     WHERE tenant_id = $1 AND workspace_id = $2
     ORDER BY checked_at DESC`,
    [scope.tenantId, scope.workspaceId],
  );
  const results = await pool.query<{ readonly metadata: SqlMetadata }>(
    `SELECT metadata
     FROM github_repository_trend_results
     WHERE tenant_id = $1 AND workspace_id = $2 AND source_binding_id = $3
     ORDER BY checked_at DESC`,
    [scope.tenantId, scope.workspaceId, scope.sourceBindingId],
  );
  const cursors = await pool.query(
    `SELECT id
     FROM cursor_checkpoints
     WHERE tenant_id = $1 AND workspace_id = $2 AND source_binding_id = $3`,
    [scope.tenantId, scope.workspaceId, scope.sourceBindingId],
  );
  const attempts = await pool.query<{ readonly status: string }>(
    `SELECT status
     FROM scan_attempts
     WHERE tenant_id = $1 AND workspace_id = $2 AND scan_job_id = ANY($3::uuid[])
     ORDER BY started_at ASC`,
    [scope.tenantId, scope.workspaceId, scope.scanJobIds],
  );

  return {
    sourceItemCount: sourceItems.rowCount ?? 0,
    sourceProviderItemIds: sourceItems.rows.map((row) => row.provider_item_id),
    feedItemCount: feedItems.rowCount ?? 0,
    feedProviderMetadataList: feedItems.rows.map((row) => row.provider_metadata),
    trendCandidateCount: candidates.rowCount ?? 0,
    trendCandidateStars48hValues: candidates.rows.map((row) => row.stars_48h),
    trendSnapshotCount: snapshots.rowCount ?? 0,
    trendSnapshotStars48hValues: snapshots.rows.map((row) => row.stars_48h),
    trendResultCount: results.rowCount ?? 0,
    trendResultMetadataList: results.rows.map((row) => row.metadata),
    cursorCount: cursors.rowCount ?? 0,
    scanAttemptCount: attempts.rowCount ?? 0,
    scanAttemptStatuses: attempts.rows.map((row) => row.status),
  };
};

const sumScanResults = (
  results: ReadonlyArray<{ readonly fetched: number; readonly inserted: number; readonly projected: number }>,
  field: 'fetched' | 'inserted' | 'projected',
): number => results.reduce((total, result) => total + result[field], 0);

const databaseKind = (databaseUrl: string): string => {
  try {
    const url = new URL(databaseUrl);
    return `${url.protocol.replace(':', '')}:${url.hostname}:${url.port || 'default'}/${url.pathname.replace(/^\//, '')}`;
  } catch {
    return 'postgresql:unparseable';
  }
};

const writeGitHubRepoRadarLiveEvidenceArtifactIfRequested = (input: {
  readonly sampledAt: string;
  readonly collectionMethod: string;
  readonly signals: ReadonlyArray<{
    readonly signalId: string;
    readonly status: 'passed';
    readonly observedAt: string;
    readonly evidence: Record<string, unknown>;
    readonly metrics: Record<string, unknown>;
  }>;
}): void => {
  const evidencePath = readOptionalEnv(liveEvidencePathEnv);
  if (evidencePath === undefined) {
    return;
  }

  const artifact = {
    schemaVersion: 1,
    format: liveArtifactFormat,
    artifactId: 'github-repo-radar-live-evidence-v1',
    environmentId: requiredEvidenceEnv(environmentIdEnv),
    imageDigest: requiredEvidenceEnv(imageDigestEnv),
    commitSha: requiredCommitShaEvidenceEnv(commitShaEnv),
    operator: requiredEvidenceEnv(operatorEnv),
    sampledAt: input.sampledAt,
    provenance: {
      evidenceKind: 'live_network',
      collectionMethod: input.collectionMethod,
      runner: 'scripts/check-github-repo-radar-prisma-live-e2e.ts',
      fixtureOnly: false,
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadsIncluded: false,
      credentialValuesIncluded: false,
      privateNetworkUrlsIncluded: false,
    },
    providerResults: [
      {
        providerKey: GITHUB_REPO_RADAR_PROVIDER_KEY,
        status: 'passed',
        freshnessGuard: freshnessGuardForProvider(GITHUB_REPO_RADAR_PROVIDER_KEY),
        signalResults: input.signals,
      },
    ],
  };

  writeLiveEvidenceArtifactAtomically(
    evidencePath,
    `${JSON.stringify(artifact, null, 2)}\n`,
    liveEvidencePathEnv,
  );
};

const requiredEvidenceEnv = (key: string): string => {
  const value = readOptionalEnv(key);
  if (value === undefined) {
    throw new Error(`${key} is required when ${liveEvidencePathEnv} is set`);
  }

  return value;
};

const requiredCommitShaEvidenceEnv = (key: string): string => {
  const value = requiredEvidenceEnv(key);
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`${key} must be a full 40-character lowercase git commit SHA`);
  }

  return value;
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

const freshnessGuardForProvider = (providerKey: string): SourceReadinessFreshnessGuard => {
  const profile = sourceReadinessProfiles.find((candidate) => candidate.providerKey === providerKey);
  assert(profile !== undefined, `${providerKey}: missing source readiness profile`);
  return profile.freshnessGuard;
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
