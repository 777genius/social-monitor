import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

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
import { DeterministicSummaryModelAdapter } from '@social-monitor/summary/adapters/model/deterministic-summary-model.adapter';
import { InMemorySummaryEventPublisher } from '@social-monitor/summary/adapters/messaging/in-memory-summary-event-publisher';
import { InMemorySummaryJobQueueAdapter } from '@social-monitor/summary/adapters/messaging/in-memory-summary-job-queue.adapter';
import { NoopUserSummaryPreferenceReader } from '@social-monitor/summary/adapters/preferences/noop-user-summary-preference.reader';
import { InMemorySummaryArtifactRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-artifact.repository';
import { InMemorySummaryJobRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-job.repository';
import { InMemorySummaryPolicyRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-policy.repository';
import { FeedSummaryEvidenceSelector } from '@social-monitor/summary/adapters/evidence/feed-summary-evidence.selector';
import { ExecuteSummaryJobUseCase } from '@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case';
import { RequestSummaryUseCase } from '@social-monitor/summary/features/request-summary/request-summary.use-case';
import type {
  ReserveSummaryJobQuotaResult,
  SummaryQuotaPort,
} from '@social-monitor/summary/ports';

import { InMemoryFeedProjectionAdapter } from '../apps/ingestion-worker/src/adapters/feed/in-memory-feed-projection.adapter';
import { InMemoryScanLeaseAdapter } from '../libs/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemoryScanAttemptRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '../libs/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { GitHubSourceProvider } from '../libs/ingestion/adapters/source/github/github-source.provider';
import { HttpGitHubClient } from '../libs/ingestion/adapters/source/github/http-github-client';
import { InMemorySourceProviderRegistry } from '../libs/ingestion/adapters/source/in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '../libs/ingestion/adapters/source/registry-source-fetcher.adapter';
import { sourceReadinessProfiles } from '../libs/ingestion/adapters/source/source-readiness-profiles';
import { ExecuteScanUseCase } from '../libs/ingestion/features/execute-scan/execute-scan.use-case';
import type {
  ReportScanFailedCommand,
  ReportScanSucceededCommand,
  ScanExecutionReporterPort,
  SourceConfigReaderPort,
  SourceRuntimeConfig,
} from '../libs/ingestion/ports';

const timeoutMs = 10_000;
const githubQuery = process.env.GITHUB_LIVE_SUMMARY_QUERY?.trim() || 'repo:microsoft/TypeScript is:issue';
const maxItems = readPositiveIntegerEnv('GITHUB_LIVE_SUMMARY_MAX_ITEMS', 2, 1, 5);
const sampledAt = new Date('2026-06-21T00:00:00.000Z');
const evidencePath = readOptionalEnv('GITHUB_LIVE_SUMMARY_EVIDENCE_PATH');

class StaticSourceConfigReader implements SourceConfigReaderPort {
  async readConfig(): Promise<SourceRuntimeConfig> {
    const config: Record<string, string | number> = {
      maxItems,
      userAgent: 'social-monitor-mvp-live-summary-smoke/0.1',
    };
    const accessToken = readOptionalEnv('GITHUB_ACCESS_TOKEN');

    if (accessToken !== undefined) {
      config.accessToken = accessToken;
    }

    return config;
  }
}

class CapturingScanExecutionReporter implements ScanExecutionReporterPort {
  succeeded: ReportScanSucceededCommand | undefined;
  failed: ReportScanFailedCommand | undefined;

  async reportSucceeded(command: ReportScanSucceededCommand): Promise<void> {
    this.succeeded = command;
  }

  async reportFailed(command: ReportScanFailedCommand): Promise<void> {
    this.failed = command;
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
  const tenant = tenantId('tenant-github-live-summary-smoke');
  const workspace = workspaceId('workspace-github-live-summary-smoke');
  const topicId = 'topic-github-live-summary-smoke';
  const sourceBindingId = 'github-live-summary-binding';
  const metrics = new InMemoryMetricsRecorder();
  const feedItems = new InMemoryFeedItemReadRepository();
  const sourceItems = new InMemorySourceItemRepository();
  const scanReporter = new CapturingScanExecutionReporter();
  const clock = new FixedClock(sampledAt);
  const ids = new SequenceIdGenerator('github-live-summary');

  const executeScan = new ExecuteScanUseCase(
    new RegistrySourceFetcherAdapter(
      new InMemorySourceProviderRegistry(
        [new GitHubSourceProvider(new HttpGitHubClient(timeoutMs))],
        sourceReadinessProfiles,
      ),
      new StaticSourceConfigReader(),
    ),
    sourceItems,
    new InMemoryFeedProjectionAdapter(feedItems),
    new InMemoryScanAttemptRepository(),
    new InMemoryScanCursorRepository(),
    scanReporter,
    new InMemoryScanFailureQueueAdapter(metrics),
    new InMemoryScanLeaseAdapter(),
    ids,
    clock,
  );

  const scan = unwrap(
    await executeScan.execute({
      tenantId: tenant,
      workspaceId: workspace,
      scanJobId: 'scan-github-live-summary-smoke',
      topicId,
      sourceBindingId,
      scanPolicyId: 'github-live-summary-policy',
      providerKey: 'github',
      sourceQuery: { mode: 'search', query: githubQuery },
      correlationId: 'corr-github-live-summary-smoke',
      causationId: 'manual-live-github-summary-smoke',
      retryBudget: 1,
    }),
    'execute live GitHub scan',
  );

  assert(scan.fetched > 0, 'live GitHub scan must fetch at least one issue');
  assert(scan.inserted > 0, 'live GitHub scan must insert at least one source item');
  assert(scan.projected > 0, 'live GitHub scan must project at least one feed item');
  assert(scanReporter.succeeded !== undefined, 'live GitHub scan must report success');
  assert(scanReporter.failed === undefined, 'live GitHub scan must not report failure');

  const feed = await feedItems.list({
    tenantId: tenant,
    workspaceId: workspace,
    topicId,
    limit: 10,
  });
  assert(feed.items.length > 0, 'live GitHub scan must produce feed items for summary evidence');

  const summaryJobs = new InMemorySummaryJobRepository();
  const summaryArtifacts = new InMemorySummaryArtifactRepository();
  const summaryEvents = new InMemorySummaryEventPublisher();
  const summaryQueue = new InMemorySummaryJobQueueAdapter(new InMemoryQueuePublisher(), metrics);
  const summaryIds = new SequenceIdGenerator('github-live-summary-job');
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
      idempotencyKey: 'github-live-summary-idempotency-key',
      correlationId: 'corr-github-live-summary-smoke',
    }),
    'request live GitHub summary',
  );

  assert(request.created, 'live GitHub summary request must create a summary job');
  assert(summaryQueue.all().length === 1, 'live GitHub summary request must enqueue one job');

  const executeSummary = new ExecuteSummaryJobUseCase(
    summaryJobs,
    summaryArtifacts,
    new InMemorySummaryPolicyRepository(),
    new NoopUserSummaryPreferenceReader(),
    new FeedSummaryEvidenceSelector(feedItems, clock),
    new DeterministicSummaryModelAdapter(),
    summaryEvents,
    summaryIds,
    clock,
  );
  const summary = unwrap(
    await executeSummary.execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: request.summaryJobId,
      maxEvidenceItems: maxItems,
    }),
    'execute live GitHub summary',
  );

  assert(summary.status === 'completed', `live GitHub summary must complete, got ${summary.status}`);
  assert(summary.summaryId !== undefined, 'live GitHub summary must produce summary id');
  const summaryId = summary.summaryId;
  const artifact = await summaryArtifacts.findById({
    tenantId: tenant,
    workspaceId: workspace,
    summaryId,
  });
  assert(artifact !== null, 'live GitHub summary artifact must be persisted');
  const artifactSnapshot = artifact.toSnapshot();
  assert(artifactSnapshot.citationMap.length > 0, 'live GitHub summary must include citations');
  assert(
    artifactSnapshot.sourceWindow.selectedFeedItemIds.length === feed.items.length,
    'live GitHub summary source window must reference selected feed items',
  );
  assert(
    summaryEvents.all().some((event) => event.eventType === 'summary.ready'),
    'live GitHub summary must publish summary.ready',
  );

  writeOptionalEvidenceArtifact({
    scan,
    feedItemCount: feed.items.length,
    summaryStatus: summary.status,
    summaryReadyPublished: summaryEvents.all().some((event) => event.eventType === 'summary.ready'),
    citationCount: artifactSnapshot.citationMap.length,
    selectedFeedItemCount: artifactSnapshot.sourceWindow.selectedFeedItemIds.length,
  });

  console.log([
    'GitHub live summary smoke OK',
    `Query: ${githubQuery}`,
    `Auth mode: ${readOptionalEnv('GITHUB_ACCESS_TOKEN') === undefined ? 'anonymous' : 'token_redacted'}`,
    `Fetched: ${scan.fetched}`,
    `Feed items: ${feed.items.length}`,
    `Summary id: ${summary.summaryId}`,
    `Headline: ${artifactSnapshot.headline}`,
  ].join('\n'));
};

function writeOptionalEvidenceArtifact(input: {
  scan: { fetched: number; inserted: number; projected: number };
  feedItemCount: number;
  summaryStatus: string;
  summaryReadyPublished: boolean;
  citationCount: number;
  selectedFeedItemCount: number;
}): void {
  if (evidencePath === undefined) {
    return;
  }

  const target = validateEvidenceJsonPath(evidencePath, 'GITHUB_LIVE_SUMMARY_EVIDENCE_PATH');
  const generatedAt = new Date().toISOString();
  const authMode = readOptionalEnv('GITHUB_ACCESS_TOKEN') === undefined ? 'anonymous' : 'token_redacted';
  const artifact = {
    schemaVersion: 1,
    artifactId: 'github-live-summary-smoke-evidence-v1',
    format: 'github-live-summary-smoke-evidence-v1',
    scope: 'backend-only',
    frontendPolicy: 'deferred_contract_only',
    generatedAt,
    sampledAt: generatedAt,
    provenance: {
      commitSha: readOptionalEnv('BACKEND_GIT_COMMIT_SHA') ?? null,
      imageDigest: readOptionalEnv('BACKEND_IMAGE_DIGEST') ?? null,
      environmentId: readOptionalEnv('SOURCE_LIVE_ENVIRONMENT_ID') ?? null,
      operator: readOptionalEnv('SOURCE_LIVE_OPERATOR') ?? null,
    },
    provider: {
      providerKey: 'github',
      authMode,
      accessTokenIncluded: false,
    },
    query: {
      mode: 'search',
      sha256: sha256(githubQuery),
      defaultQuery: githubQuery === 'repo:microsoft/TypeScript is:issue',
      maxItems,
      rawQueryIncluded: false,
    },
    signals: [
      {
        signalId: 'github-live-api-to-summary-smoke',
        status: 'passed',
        observedAt: generatedAt,
        evidence: {
          liveApiFetchedItems: input.scan.fetched,
          feedProjectionInsertedItems: input.feedItemCount,
          summaryCompleted: input.summaryStatus === 'completed',
          citationCount: input.citationCount,
          summaryReadyPublished: input.summaryReadyPublished,
        },
      },
    ],
    metrics: {
      fetched: input.scan.fetched,
      inserted: input.scan.inserted,
      projected: input.scan.projected,
      feedItems: input.feedItemCount,
      selectedFeedItems: input.selectedFeedItemCount,
      citationCount: input.citationCount,
    },
    redaction: {
      rawProviderPayloadIncluded: false,
      rawFeedItemTextIncluded: false,
      rawSummaryTextIncluded: false,
      accessTokenIncluded: false,
      tokenValuesIncluded: false,
    },
  };

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
  chmodSync(target, 0o600);
}

function validateEvidenceJsonPath(path: string, label: string): string {
  if (!isAbsolute(path)) {
    throw new Error(`${label} must be an absolute JSON file path`);
  }
  const resolvedPath = resolve(path);
  if (!resolvedPath.endsWith('.json')) {
    throw new Error(`${label} must end with .json`);
  }
  if (isInsideWorkspace(resolvedPath)) {
    throw new Error(`${label} must not write release evidence into the git workspace`);
  }
  if (isFixtureLikePath(resolvedPath)) {
    throw new Error(`${label} must not point to fixture or example paths`);
  }

  return resolvedPath;
}

function isInsideWorkspace(path: string): boolean {
  const workspace = resolve(process.cwd());
  const relativePath = relative(workspace, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function isFixtureLikePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/').toLowerCase();
  return ['/fixtures/', '.example.', '-examples', '_examples'].some((fragment) => normalized.includes(fragment));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function unwrap<TValue, TError>(result: Result<TValue, TError>, label: string): TValue {
  if (result.ok) {
    return result.value;
  }

  throw result.error instanceof Error ? result.error : new Error(`${label} failed`);
}

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();

  return value === undefined || value.length === 0 ? undefined : value;
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

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
