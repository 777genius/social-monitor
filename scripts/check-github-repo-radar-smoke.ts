import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemoryFeedProjectionAdapter } from '../apps/ingestion-worker/src/adapters/feed/in-memory-feed-projection.adapter';
import { InMemoryScanLeaseAdapter } from '../libs/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemoryGitHubRepositoryTrendHistoryRepository } from '../libs/ingestion/adapters/persistence/in-memory-github-repository-trend-history.repository';
import { InMemoryScanAttemptRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '../libs/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { CircuitBreakerSourceFetcherAdapter } from '../libs/ingestion/adapters/source/circuit-breaker-source-fetcher.adapter';
import { FixtureGitHubRepoRadarClient } from '../libs/ingestion/adapters/source/github-repo-radar/fixture-github-repo-radar-client';
import { FixtureGitHubRepositoryLiveVerifier } from '../libs/ingestion/adapters/source/github-repo-radar/fixture-github-repository-live-verifier';
import { GitHubRepoRadarSourceProvider } from '../libs/ingestion/adapters/source/github-repo-radar/github-repo-radar-source.provider';
import { GitHubRepositoryTrendMetadataProjectionAdapter } from '../libs/ingestion/adapters/source/github-repo-radar/github-repository-trend-metadata-projection.adapter';
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
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { FeedSummaryEvidenceSelector } from '../libs/summary/adapters/evidence/feed-summary-evidence.selector';
import { DeterministicSummaryModelAdapter } from '../libs/summary/adapters/model/deterministic-summary-model.adapter';
import type { SummaryModelBudget, SummaryModelInput, SummaryModelPolicy } from '../libs/summary/ports';
import { CryptoIdGenerator, FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

class SmokeScanExecutionReporter implements ScanExecutionReporterPort {
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
  async readConfig(): Promise<SourceRuntimeConfig> {
    return {
      fixtureMode: true,
      topics: ['ai', 'agents'],
      languages: ['TypeScript'],
      minStars: 100,
      maxItems: 1,
      maxCandidates: 5,
    };
  }
}

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const run = async (): Promise<void> => {
  const tenant = tenantId('tenant-github-repo-radar-smoke');
  const workspace = workspaceId('workspace-github-repo-radar-smoke');
  const interestId = 'topic-agent-tooling';
  const clock = new FixedClock(new Date('2026-06-23T12:00:00.000Z'));
  const provider = new GitHubRepoRadarSourceProvider(
    new FixtureGitHubRepoRadarClient(),
    new FixtureGitHubRepositoryLiveVerifier(),
    clock,
  );
  const registry = new InMemorySourceProviderRegistry([provider], sourceReadinessProfiles);
  const feedItems = new InMemoryFeedItemReadRepository();
  const sourceItems = new InMemorySourceItemRepository();
  const scanAttempts = new InMemoryScanAttemptRepository();
  const scanCursors = new InMemoryScanCursorRepository();
  const scanExecutionReporter = new SmokeScanExecutionReporter();
  const scanFailures = new InMemoryScanFailureQueueAdapter(new InMemoryMetricsRecorder());
  const scanLeases = new InMemoryScanLeaseAdapter();
  const trendHistory = new InMemoryGitHubRepositoryTrendHistoryRepository();
  const executeScan = new ExecuteScanUseCase(
    new CircuitBreakerSourceFetcherAdapter(
      new RegistrySourceFetcherAdapter(registry, new StaticSourceConfigReader()),
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
    scanJobId: 'scan-github-repo-radar-smoke',
    interestId,
    sourceBindingId: 'binding-github-repo-radar-smoke',
    scanPolicyId: 'policy-github-repo-radar-smoke',
    providerKey: GITHUB_REPO_RADAR_PROVIDER_KEY,
    sourceQuery: { mode: 'search', query: 'agents' },
    correlationId: 'corr-github-repo-radar-smoke',
    causationId: 'cause-github-repo-radar-smoke',
  });

  if (!result.ok) {
    throw result.error;
  }

  assert(result.value.fetched === 1, `expected one repo radar item, got ${result.value.fetched}`);
  assert(result.value.inserted === 1, `expected one inserted repo radar item, got ${result.value.inserted}`);
  assert(result.value.projected === 1, `expected one projected repo radar feed item, got ${result.value.projected}`);
  assert(scanExecutionReporter.succeeded !== undefined, 'repo radar scan success report is required');
  assert(scanExecutionReporter.failed === undefined, 'repo radar smoke must not report scan failure');

  const feed = await feedItems.list({ tenantId: tenant, workspaceId: workspace, interestId, limit: 10 });
  assert(feed.items.length === 1, `expected one repo radar feed item, got ${feed.items.length}`);

  const feedSnapshot = feed.items[0]?.toSnapshot();
  const metadata = parseGitHubRepositoryTrendMetadata(feedSnapshot?.providerMetadata);
  if (metadata === null) {
    throw new Error('feed item must expose GitHub repository trend providerMetadata');
  }

  assert(metadata.repository.fullName === 'openai/codex', `unexpected repo radar result ${metadata.repository.fullName}`);
  assert(metadata.trend.stars48h === 360, `unexpected 48h stars delta ${metadata.trend.stars48h}`);

  const history = trendHistory.all();
  assert(history.length === 1, `expected one trend history record, got ${history.length}`);
  assert(history[0]?.repositoryFullName === 'openai/codex', 'trend history must keep repository full name');

  const evidence = await new FeedSummaryEvidenceSelector(feedItems, clock).select({
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
      rulesVersion: 'summary.rules.github-repo-radar.smoke.v1',
    },
    requestedAt: clock.now(),
  };
  const route = summaryModel.route(summaryInput, modelPolicy, budget);
  const attempt = await summaryModel.summarize(summaryInput, route);

  assert(
    attempt.draft.sourceHighlights.some((highlight) => highlight.includes('openai/codex: 54000 stars, +360 in 48h')),
    `summary source highlights must include repo trend evidence: ${JSON.stringify(attempt.draft.sourceHighlights)}`,
  );

  console.log('GitHub repo radar smoke OK');
};

void run().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
