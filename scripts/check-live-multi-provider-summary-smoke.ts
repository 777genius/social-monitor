import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import {
  FixedClock,
  type DomainError,
  type IdGenerator,
  ok,
  type Result,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';
import { FeedSummaryEvidenceSelector } from '@social-monitor/summary/adapters/evidence/feed-summary-evidence.selector';
import { DeterministicSummaryModelAdapter } from '@social-monitor/summary/adapters/model/deterministic-summary-model.adapter';
import {
  OpenAiResponsesSummaryModelAdapter,
  resolveOpenAiResponsesSummaryModelOptions,
} from '@social-monitor/summary/adapters/model/openai-responses-summary-model.adapter';
import { InMemorySummaryEventPublisher } from '@social-monitor/summary/adapters/messaging/in-memory-summary-event-publisher';
import { InMemorySummaryJobQueueAdapter } from '@social-monitor/summary/adapters/messaging/in-memory-summary-job-queue.adapter';
import { NoopUserSummaryPreferenceReader } from '@social-monitor/summary/adapters/preferences/noop-user-summary-preference.reader';
import { InMemorySummaryArtifactRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-artifact.repository';
import { InMemorySummaryJobRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-job.repository';
import { InMemorySummaryPolicyRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-policy.repository';
import { SummaryPolicy } from '@social-monitor/summary/domain';
import { ExecuteSummaryJobUseCase } from '@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case';
import { RequestSummaryUseCase } from '@social-monitor/summary/features/request-summary/request-summary.use-case';
import type {
  ReserveSummaryJobQuotaResult,
  SummaryModelPort,
  SummaryQuotaPort,
} from '@social-monitor/summary/ports';
import { parse as parseDotenv } from 'dotenv';

import { InMemoryFeedProjectionAdapter } from '../apps/ingestion-worker/src/adapters/feed/in-memory-feed-projection.adapter';
import { InMemoryScanLeaseAdapter } from '../libs/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemoryScanAttemptRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '../libs/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { GITHUB_ISSUES_PROVIDER_KEY, GitHubSourceProvider } from '../libs/ingestion/adapters/source/github/github-source.provider';
import { HttpGitHubClient } from '../libs/ingestion/adapters/source/github/http-github-client';
import { HackerNewsSourceProvider } from '../libs/ingestion/adapters/source/hacker-news/hacker-news-source.provider';
import { HttpHackerNewsClient } from '../libs/ingestion/adapters/source/hacker-news/http-hacker-news-client';
import { InMemorySourceProviderRegistry } from '../libs/ingestion/adapters/source/in-memory-source-provider.registry';
import { RedditAppOnlyTokenProvider } from '../libs/ingestion/adapters/source/reddit/app-only-reddit-token-provider';
import { HttpRedditClient, redditListings } from '../libs/ingestion/adapters/source/reddit/http-reddit-client';
import type { RedditPostListing } from '../libs/ingestion/adapters/source/reddit/reddit-client.port';
import { RedditSourceProvider } from '../libs/ingestion/adapters/source/reddit/reddit-source.provider';
import { HttpRssClient } from '../libs/ingestion/adapters/source/rss/http-rss-client';
import { RssSourceProvider } from '../libs/ingestion/adapters/source/rss/rss-source.provider';
import { RegistrySourceFetcherAdapter } from '../libs/ingestion/adapters/source/registry-source-fetcher.adapter';
import { sourceReadinessProfiles } from '../libs/ingestion/adapters/source/source-readiness-profiles';
import { ExecuteScanUseCase } from '../libs/ingestion/features/execute-scan/execute-scan.use-case';
import type {
  FetchSourceItemsCommand,
  FetchSourceItemsResult,
  ReportScanFailedCommand,
  ReportScanSucceededCommand,
  ScanExecutionReporterPort,
  SourceConfigReaderPort,
  SourceFetcherPort,
  SourceQuery,
  SourceRuntimeConfig,
} from '../libs/ingestion/ports';
import { writeLiveEvidenceArtifactAtomically } from './lib/live-evidence-artifact';

type LiveProviderKey = 'reddit' | 'github-issues' | 'hacker-news' | 'rss';

type ScanTarget = {
  readonly providerKey: LiveProviderKey;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly sourceQuery: SourceQuery;
  readonly config: SourceRuntimeConfig;
};

type ScanMetrics = {
  readonly providerKey: LiveProviderKey;
  readonly fetched: number;
  readonly inserted: number;
  readonly projected: number;
  readonly skippedDuplicates: number;
};

const timeoutMs = readPositiveIntegerEnv('LIVE_MULTI_PROVIDER_TIMEOUT_MS', 12_000, 1_000, 60_000);
const maxItemsPerProvider = readPositiveIntegerEnv('LIVE_MULTI_PROVIDER_MAX_ITEMS_PER_PROVIDER', 2, 1, 5);
const maxEvidenceItems = readPositiveIntegerEnv('LIVE_MULTI_PROVIDER_SUMMARY_MAX_EVIDENCE_ITEMS', 12, 4, 50);
const maxSummaryKeyPoints = readPositiveIntegerEnv('LIVE_MULTI_PROVIDER_SUMMARY_MAX_KEY_POINTS', 10, 1, 10);
const allowEmptyTargets = readBooleanEnv('LIVE_MULTI_PROVIDER_ALLOW_EMPTY_TARGETS', false);
const sampledAt = new Date('2026-06-21T00:00:00.000Z');
const evidencePathEnv = 'LIVE_MULTI_PROVIDER_SUMMARY_EVIDENCE_PATH';
const summaryModelMode = readSummaryModelMode();

class StaticSourceConfigReader implements SourceConfigReaderPort {
  constructor(private readonly configsBySourceBinding: ReadonlyMap<string, SourceRuntimeConfig>) {}

  async readConfig(params: { readonly sourceBindingId: string }): Promise<SourceRuntimeConfig | null> {
    return this.configsBySourceBinding.get(params.sourceBindingId) ?? null;
  }
}

class LimitedSourceFetcher implements SourceFetcherPort {
  constructor(
    private readonly delegate: SourceFetcherPort,
    private readonly maxItemsByProvider: ReadonlyMap<string, number>,
  ) {}

  async fetch(command: FetchSourceItemsCommand): Promise<FetchSourceItemsResult> {
    const result = await this.delegate.fetch(command);
    const maxItems = this.maxItemsByProvider.get(command.providerKey);

    if (maxItems === undefined || result.items.length <= maxItems) {
      return result;
    }

    return {
      items: result.items.slice(0, maxItems),
      nextCursor: result.nextCursor,
    };
  }
}

class CapturingScanExecutionReporter implements ScanExecutionReporterPort {
  readonly succeeded: ReportScanSucceededCommand[] = [];
  readonly failed: ReportScanFailedCommand[] = [];

  async reportSucceeded(command: ReportScanSucceededCommand): Promise<void> {
    this.succeeded.push(command);
  }

  async reportFailed(command: ReportScanFailedCommand): Promise<void> {
    this.failed.push(command);
  }
}

class AllowingSummaryQuota implements SummaryQuotaPort {
  async reserveSummaryJob(): Promise<Result<ReserveSummaryJobQuotaResult, DomainError>> {
    return ok({
      remaining: 999,
      resetAt: '2026-06-21T01:00:00.000Z',
    });
  }
}

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  constructor(private readonly prefix: string) {}

  generate(): string {
    const id = `${this.prefix}-${this.nextId}`;
    this.nextId += 1;

    return id;
  }
}

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const main = async (): Promise<void> => {
  loadRedditAppOAuthEnvIfPresent();
  const redditTokenProvider = RedditAppOnlyTokenProvider.fromEnvironment(process.env);
  assert(
    redditTokenProvider !== null,
    'Live multi-provider smoke requires Reddit app-only OAuth env: REDDIT_APP_CLIENT_ID/REDDIT_APP_CLIENT_SECRET',
  );

  const tenant = tenantId('tenant-live-multi-provider-summary-smoke');
  const workspace = workspaceId('workspace-live-multi-provider-summary-smoke');
  const topicId = 'topic-live-multi-provider-summary-smoke';
  const metrics = new InMemoryMetricsRecorder();
  const feedItems = new InMemoryFeedItemReadRepository();
  const sourceItems = new InMemorySourceItemRepository();
  const scanReporter = new CapturingScanExecutionReporter();
  const clock = new FixedClock(sampledAt);
  const scanIds = new SequenceIdGenerator('live-multi-provider-source-item');
  const targets = buildScanTargets();
  const targetBySourceBinding = new Map(targets.map((target) => [target.sourceBindingId, target]));
  const sourceFetcher = new LimitedSourceFetcher(
    new RegistrySourceFetcherAdapter(
      new InMemorySourceProviderRegistry([
        new RedditSourceProvider(new HttpRedditClient('https://oauth.reddit.com', timeoutMs), redditTokenProvider),
        new GitHubSourceProvider(new HttpGitHubClient(timeoutMs)),
        new HackerNewsSourceProvider(new HttpHackerNewsClient(timeoutMs)),
        new RssSourceProvider(new HttpRssClient(timeoutMs)),
      ], sourceReadinessProfiles),
      new StaticSourceConfigReader(new Map(targets.map((target) => [target.sourceBindingId, target.config]))),
    ),
    new Map(targets.map((target) => [target.providerKey, maxItemsPerProvider])),
  );
  const executeScan = new ExecuteScanUseCase(
    sourceFetcher,
    sourceItems,
    new InMemoryFeedProjectionAdapter(feedItems),
    new InMemoryScanAttemptRepository(),
    new InMemoryScanCursorRepository(),
    scanReporter,
    new InMemoryScanFailureQueueAdapter(metrics),
    new InMemoryScanLeaseAdapter(),
    scanIds,
    clock,
  );

  const scanMetrics: ScanMetrics[] = [];
  for (const target of targets) {
    const result = unwrap(
      await executeScan.execute({
        tenantId: tenant,
        workspaceId: workspace,
        scanJobId: `scan-live-multi-provider-${target.providerKey}`,
        topicId,
        sourceBindingId: target.sourceBindingId,
        scanPolicyId: target.scanPolicyId,
        providerKey: target.providerKey,
        sourceQuery: target.sourceQuery,
        correlationId: 'corr-live-multi-provider-summary-smoke',
        causationId: 'manual-live-multi-provider-summary-smoke',
        retryBudget: 1,
      }),
      `execute live ${target.providerKey} scan`,
    );

    if (!allowEmptyTargets) {
      assert(result.fetched > 0, `${target.providerKey} live scan must fetch at least one item`);
      assert(result.inserted > 0, `${target.providerKey} live scan must insert at least one source item`);
      assert(result.projected > 0, `${target.providerKey} live scan must project at least one feed item`);
    }
    scanMetrics.push({
      providerKey: target.providerKey,
      fetched: result.fetched,
      inserted: result.inserted,
      projected: result.projected,
      skippedDuplicates: result.skippedDuplicates,
    });
  }

  assert(scanReporter.failed.length === 0, 'live multi-provider scans must not report failures');
  assert(scanReporter.succeeded.length === targets.length, 'live multi-provider scans must report every success');

  const feed = await feedItems.list({
    tenantId: tenant,
    workspaceId: workspace,
    topicId,
    limit: 100,
  });
  const feedSnapshots = feed.items.map((item) => item.toSnapshot());
  assert(feedSnapshots.length >= targets.length, 'live multi-provider scans must produce aggregated feed items');
  const feedProviderKeys = new Set(feedSnapshots.map((item) => targetBySourceBinding.get(item.sourceBindingId)?.providerKey));
  for (const target of targets) {
    assert(feedProviderKeys.has(target.providerKey), `aggregated feed must include ${target.providerKey}`);
  }

  const summaryJobs = new InMemorySummaryJobRepository();
  const summaryArtifacts = new InMemorySummaryArtifactRepository();
  const summaryEvents = new InMemorySummaryEventPublisher();
  const summaryQueue = new InMemorySummaryJobQueueAdapter(new InMemoryQueuePublisher(), metrics);
  const summaryPolicies = new InMemorySummaryPolicyRepository();
  const summaryIds = new SequenceIdGenerator('live-multi-provider-summary');
  const summaryModel = buildSummaryModel();
  await summaryPolicies.save(SummaryPolicy.create({
    id: 'summary-policy-live-multi-provider-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    topicId,
    language: 'auto',
    format: 'bullet_digest',
    tone: 'analytical',
    maxKeyPoints: maxSummaryKeyPoints,
    includeRisks: true,
    includeSourceHighlights: true,
    customInstructions: 'Compare signals across Reddit, GitHub, Hacker News and RSS for the selected monitoring topic.',
    createdAt: sampledAt,
    updatedAt: sampledAt,
  }));

  const requestSummary = new RequestSummaryUseCase(
    summaryJobs,
    summaryQueue,
    new AllowingSummaryQuota(),
    summaryIds,
    clock,
  );
  const request = unwrap(
    await requestSummary.execute({
      tenantId: tenant,
      workspaceId: workspace,
      topicId,
      idempotencyKey: 'live-multi-provider-summary-idempotency-key',
      correlationId: 'corr-live-multi-provider-summary-smoke',
    }),
    'request live multi-provider summary',
  );

  assert(request.created, 'live multi-provider summary request must create a job');
  assert(summaryQueue.all().length === 1, 'live multi-provider summary request must enqueue one job');

  const executeSummary = new ExecuteSummaryJobUseCase(
    summaryJobs,
    summaryArtifacts,
    summaryPolicies,
    new NoopUserSummaryPreferenceReader(),
    new FeedSummaryEvidenceSelector(feedItems, clock),
    summaryModel,
    summaryEvents,
    summaryIds,
    clock,
  );
  const summary = unwrap(
    await executeSummary.execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: request.summaryJobId,
      maxEvidenceItems,
    }),
    'execute live multi-provider summary',
  );

  assert(summary.status === 'completed', `live multi-provider summary must complete, got ${summary.status}`);
  assert(summary.summaryId !== undefined, 'live multi-provider summary must produce a summary id');

  const artifact = await summaryArtifacts.findById({
    tenantId: tenant,
    workspaceId: workspace,
    summaryId: summary.summaryId,
  });
  assert(artifact !== null, 'live multi-provider summary artifact must be persisted');

  const artifactSnapshot = artifact.toSnapshot();
  const feedById = new Map(feedSnapshots.map((item) => [item.id, item]));
  const selectedProviders = new Set(
    artifactSnapshot.sourceWindow.selectedFeedItemIds
      .map((feedItemId) => feedById.get(feedItemId))
      .map((item) => item === undefined ? undefined : targetBySourceBinding.get(item.sourceBindingId)?.providerKey)
      .filter((providerKey): providerKey is LiveProviderKey => providerKey !== undefined),
  );

  for (const target of targets) {
    assert(selectedProviders.has(target.providerKey), `summary evidence window must include ${target.providerKey}`);
  }

  const citedProviders = new Set(artifactSnapshot.citationMap.map((citation) => citation.providerKey));
  const requiredProviderKeys = new Set(targets.map((target) => target.providerKey));
  for (const target of targets) {
    assert(citedProviders.has(target.providerKey), `summary citation map must include ${target.providerKey}`);
  }

  assert(
    artifactSnapshot.citationMap.length >= requiredProviderKeys.size,
    'live multi-provider summary must cite at least one item per unique provider',
  );
  assert(
    summaryEvents.all().some((event) => event.eventType === 'summary.ready'),
    'live multi-provider summary must publish summary.ready',
  );

  writeOptionalEvidenceArtifact({
    scanMetrics,
    feedItemCount: feedSnapshots.length,
    selectedFeedItemCount: artifactSnapshot.sourceWindow.selectedFeedItemIds.length,
    selectedProviders: [...selectedProviders].sort(),
    citedProviders: [...citedProviders].sort(),
    citationCount: artifactSnapshot.citationMap.length,
    summaryStatus: summary.status,
    summaryReadyPublished: summaryEvents.all().some((event) => event.eventType === 'summary.ready'),
    summaryModelProvider: artifactSnapshot.lineage.providerVersion,
    summaryModelVersion: artifactSnapshot.lineage.modelVersion,
    summaryEstimatedCostUsd: artifactSnapshot.usage.estimatedCostUsd,
    summaryQualityFlags: artifactSnapshot.qualityFlags,
    targets,
  });

  console.log([
    'Live multi-provider summary smoke OK',
    `Providers: ${targets.map((target) => target.providerKey).join(', ')}`,
    `Items per provider cap: ${maxItemsPerProvider}`,
    `Feed items: ${feedSnapshots.length}`,
    `Selected feed items: ${artifactSnapshot.sourceWindow.selectedFeedItemIds.length}`,
    `Selected providers: ${[...selectedProviders].sort().join(', ')}`,
    `Citations: ${artifactSnapshot.citationMap.length}`,
    `Summary model: ${artifactSnapshot.lineage.providerVersion}/${artifactSnapshot.lineage.modelVersion}`,
    `Summary id: ${summary.summaryId}`,
    `Headline: ${artifactSnapshot.headline}`,
  ].join('\n'));
};

const buildSummaryModel = (): SummaryModelPort => {
  if (summaryModelMode === 'deterministic') {
    return new DeterministicSummaryModelAdapter();
  }

  return new OpenAiResponsesSummaryModelAdapter(
    resolveOpenAiResponsesSummaryModelOptions(process.env, { requireApiKey: true }),
  );
};

const buildScanTargets = (): readonly ScanTarget[] => {
  const userAgent = readOptionalEnv('LIVE_MULTI_PROVIDER_USER_AGENT')
    ?? 'social-monitor-mvp-live-multi-provider-summary/0.1';
  const subreddits = readCsvEnv('LIVE_MULTI_PROVIDER_REDDIT_SUBREDDITS')
    ?? [readOptionalEnv('LIVE_MULTI_PROVIDER_REDDIT_SUBREDDIT') ?? 'programming'];
  const redditListing = readRedditListing(readOptionalEnv('LIVE_MULTI_PROVIDER_REDDIT_LISTING') ?? 'hot');
  const redditTopTime = readOptionalEnv('LIVE_MULTI_PROVIDER_REDDIT_TOP_TIME') ?? 'week';
  const redditMinScore = readOptionalPositiveIntegerEnv('LIVE_MULTI_PROVIDER_REDDIT_MIN_SCORE');
  const githubQuery = readOptionalEnv('LIVE_MULTI_PROVIDER_GITHUB_QUERY') ?? 'repo:microsoft/TypeScript is:issue';
  const hackerNewsQuery = readOptionalEnv('LIVE_MULTI_PROVIDER_HN_QUERY') ?? 'monitoring';
  const rssFeedUrl = readOptionalEnv('LIVE_MULTI_PROVIDER_RSS_URL') ?? 'https://hnrss.org/frontpage';
  const githubAccessToken = readOptionalEnv('GITHUB_ACCESS_TOKEN');

  return [
    ...subreddits.map((subreddit, index): ScanTarget => ({
      providerKey: 'reddit',
      sourceBindingId: `source-binding-live-multi-provider-reddit-${index + 1}-${safeIdPart(subreddit)}`,
      scanPolicyId: `scan-policy-live-multi-provider-reddit-${index + 1}-${safeIdPart(subreddit)}`,
      sourceQuery: { mode: 'listing', query: `${subreddit}:${redditListing}` },
      config: {
        subreddit,
        listing: redditListing,
        ...(redditListing === 'top' ? { topTime: redditTopTime } : {}),
        ...(redditMinScore === undefined ? {} : { minScore: redditMinScore }),
        maxItems: maxItemsPerProvider,
        userAgent,
      },
    })),
    {
      providerKey: GITHUB_ISSUES_PROVIDER_KEY,
      sourceBindingId: 'source-binding-live-multi-provider-github',
      scanPolicyId: 'scan-policy-live-multi-provider-github',
      sourceQuery: { mode: 'search', query: githubQuery },
      config: {
        maxItems: maxItemsPerProvider,
        userAgent,
        ...(githubAccessToken === undefined ? {} : { accessToken: githubAccessToken }),
      },
    },
    {
      providerKey: 'hacker-news',
      sourceBindingId: 'source-binding-live-multi-provider-hacker-news',
      scanPolicyId: 'scan-policy-live-multi-provider-hacker-news',
      sourceQuery: { mode: 'search', query: hackerNewsQuery },
      config: {},
    },
    {
      providerKey: 'rss',
      sourceBindingId: 'source-binding-live-multi-provider-rss',
      scanPolicyId: 'scan-policy-live-multi-provider-rss',
      sourceQuery: { mode: 'url', query: rssFeedUrl },
      config: {},
    },
  ];
};

const writeOptionalEvidenceArtifact = (input: {
  readonly scanMetrics: readonly ScanMetrics[];
  readonly feedItemCount: number;
  readonly selectedFeedItemCount: number;
  readonly selectedProviders: readonly LiveProviderKey[];
  readonly citedProviders: readonly string[];
  readonly citationCount: number;
  readonly summaryStatus: string;
  readonly summaryReadyPublished: boolean;
  readonly summaryModelProvider: string;
  readonly summaryModelVersion: string;
  readonly summaryEstimatedCostUsd: number;
  readonly summaryQualityFlags: readonly string[];
  readonly targets: readonly ScanTarget[];
}): void => {
  const evidencePath = readOptionalEnv(evidencePathEnv);
  if (evidencePath === undefined) {
    return;
  }

  const generatedAt = new Date().toISOString();
  const artifact = {
    schemaVersion: 1,
    artifactId: 'live-multi-provider-summary-smoke-evidence-v1',
    format: 'live-multi-provider-summary-smoke-evidence-v1',
    scope: 'backend-only',
    frontendPolicy: 'deferred_contract_only',
    generatedAt,
    sampledAt: generatedAt,
    provenance: {
      commitSha: readOptionalEnv('BACKEND_GIT_COMMIT_SHA') ?? null,
      imageDigest: readOptionalEnv('BACKEND_IMAGE_DIGEST') ?? null,
      environmentId: readOptionalEnv('SOURCE_LIVE_ENVIRONMENT_ID') ?? null,
      operator: readOptionalEnv('SOURCE_LIVE_OPERATOR') ?? null,
      runner: 'scripts/check-live-multi-provider-summary-smoke.ts',
      fixtureOnly: false,
    },
    providers: input.targets.map((target) => ({
      providerKey: target.providerKey,
      sourceBindingId: target.sourceBindingId,
      queryMode: target.sourceQuery.mode,
      querySha256: sha256(target.sourceQuery.query),
      rawQueryIncluded: false,
      authMode: target.providerKey === 'reddit'
        ? 'app_only_oauth'
        : target.providerKey === GITHUB_ISSUES_PROVIDER_KEY && readOptionalEnv('GITHUB_ACCESS_TOKEN') !== undefined
          ? 'token_redacted'
          : 'public_or_anonymous',
    })),
    signals: [
      {
        signalId: 'live-multi-provider-scan-to-summary',
        status: 'passed',
        observedAt: generatedAt,
        evidence: {
          requiredProviderCount: input.targets.length,
          feedItemCount: input.feedItemCount,
          selectedFeedItemCount: input.selectedFeedItemCount,
          selectedProviders: input.selectedProviders,
          citedProviders: input.citedProviders,
          citationCount: input.citationCount,
          summaryCompleted: input.summaryStatus === 'completed',
          summaryReadyPublished: input.summaryReadyPublished,
          summaryModelProvider: input.summaryModelProvider,
          summaryModelVersion: input.summaryModelVersion,
          summaryEstimatedCostUsd: input.summaryEstimatedCostUsd,
          summaryQualityFlags: input.summaryQualityFlags,
        },
      },
    ],
    metrics: {
      scans: input.scanMetrics,
      feedItems: input.feedItemCount,
      selectedFeedItems: input.selectedFeedItemCount,
      citedProviders: input.citedProviders,
      citations: input.citationCount,
      summaryModelProvider: input.summaryModelProvider,
      summaryModelVersion: input.summaryModelVersion,
      summaryEstimatedCostUsd: input.summaryEstimatedCostUsd,
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadIncluded: false,
      rawFeedItemTextIncluded: false,
      rawSummaryTextIncluded: false,
      rawQueryIncluded: false,
      tokenValuesIncluded: false,
    },
  };

  writeLiveEvidenceArtifactAtomically(evidencePath, `${JSON.stringify(artifact, null, 2)}\n`, evidencePathEnv);
};

const loadRedditAppOAuthEnvIfPresent = (): void => {
  if (hasRedditAppCredentials()) {
    return;
  }

  const envPath = readOptionalEnv('SOCIAL_MONITOR_REDDIT_APP_ENV_PATH')
    ?? join(homedir(), '.config', 'social-monitor', 'reddit-app-oauth.env');
  if (!existsSync(envPath)) {
    return;
  }

  const parsed = parseDotenv(readFileSync(envPath));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

const hasRedditAppCredentials = (): boolean =>
  readOptionalEnv('REDDIT_APP_CLIENT_ID') !== undefined && readOptionalEnv('REDDIT_APP_CLIENT_SECRET') !== undefined;

const readRedditListing = (value: string): RedditPostListing => {
  if (!redditListings.includes(value as RedditPostListing)) {
    throw new Error(`Unsupported LIVE_MULTI_PROVIDER_REDDIT_LISTING: ${value}`);
  }

  return value as RedditPostListing;
};

function readSummaryModelMode(): 'deterministic' | 'openai-responses' {
  const value = readOptionalEnv('LIVE_MULTI_PROVIDER_SUMMARY_MODEL') ?? 'deterministic';
  if (value === 'deterministic' || value === 'openai-responses') {
    return value;
  }

  throw new Error('LIVE_MULTI_PROVIDER_SUMMARY_MODEL must be "deterministic" or "openai-responses"');
}

const unwrap = <TValue, TError>(result: Result<TValue, TError>, label: string): TValue => {
  if (result.ok) {
    return result.value;
  }

  throw result.error instanceof Error ? result.error : new Error(`${label} failed`);
};

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();

  return value === undefined || value.length === 0 ? undefined : value;
}

function readCsvEnv(name: string): readonly string[] | undefined {
  const value = readOptionalEnv(name);
  if (value === undefined) {
    return undefined;
  }

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return items.length === 0 ? undefined : items;
}

function readPositiveIntegerEnv(name: string, fallback: number, min: number, max: number): number {
  const value = readOptionalEnv(name);
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }

  return parsed;
}

function readOptionalPositiveIntegerEnv(name: string): number | undefined {
  const value = readOptionalEnv(name);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return parsed;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = readOptionalEnv(name);
  if (value === undefined) {
    return fallback;
  }

  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }

  throw new Error(`${name} must be true or false`);
}

function safeIdPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'target';
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
