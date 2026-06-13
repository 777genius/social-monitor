import {
  DomainError,
  type EventEnvelope,
  FixedClock,
  type IdGenerator,
  ok,
  type Result,
  tenantId,
  type TenantId,
  workspaceId,
  type WorkspaceId,
} from '@social-monitor/shared-kernel';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue';

import { ProjectSummaryReadyEventUseCase } from '../libs/delivery/features/project-summary-ready-event/project-summary-ready-event.use-case';
import type { SummaryReadyProjectionPayload } from '../libs/delivery/features/project-summary-ready-event/project-summary-ready-event.command';
import { ListRealtimeEventsUseCase } from '../libs/delivery/features/list-realtime-events/list-realtime-events.use-case';
import { RecordRealtimeEventUseCase } from '../libs/delivery/features/record-realtime-event/record-realtime-event.use-case';
import { InMemoryRealtimeEventRepository } from '../libs/delivery/adapters/persistence/in-memory-realtime-event.repository';
import { InMemoryFeedItemReadRepository } from '../libs/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { ListFeedItemsUseCase } from '../libs/feed/features/list-feed-items/list-feed-items.use-case';
import { InMemoryScanAttemptRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '../libs/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { InMemoryScanLeaseAdapter } from '../libs/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { FakeSourceProvider } from '../libs/ingestion/adapters/source/fake-source.provider';
import { InMemorySourceProviderRegistry } from '../libs/ingestion/adapters/source/in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '../libs/ingestion/adapters/source/registry-source-fetcher.adapter';
import { sourceReadinessProfiles } from '../libs/ingestion/adapters/source/source-readiness-profiles';
import { ExecuteScanUseCase } from '../libs/ingestion/features/execute-scan/execute-scan.use-case';
import type { ExecuteScanCommand } from '../libs/ingestion/features/execute-scan/execute-scan.command';
import type {
  ReportScanFailedCommand,
  ReportScanSucceededCommand,
  ScanExecutionReporterPort,
  SourceQuery,
} from '../libs/ingestion/ports';
import { InMemoryFeedProjectionAdapter } from '../apps/ingestion-worker/src/adapters/feed/in-memory-feed-projection.adapter';
import { BindSourceUseCase } from '../libs/monitoring/features/bind-source/bind-source.use-case';
import { CreateTopicUseCase } from '../libs/monitoring/features/create-topic/create-topic.use-case';
import { GetScanStatusUseCase } from '../libs/monitoring/features/get-scan-status/get-scan-status.use-case';
import { RecordScanExecutionUseCase } from '../libs/monitoring/features/record-scan-execution/record-scan-execution.use-case';
import { RequestScanUseCase } from '../libs/monitoring/features/request-scan/request-scan.use-case';
import { SetScanPolicyUseCase } from '../libs/monitoring/features/set-scan-policy/set-scan-policy.use-case';
import { InMemoryIdempotencyAdapter } from '../libs/monitoring/adapters/idempotency/in-memory-idempotency.adapter';
import { InMemoryOutboxAdapter } from '../libs/monitoring/adapters/messaging/in-memory-outbox.adapter';
import { InMemoryScanJobRepository } from '../libs/monitoring/adapters/persistence/in-memory-scan-job.repository';
import { InMemoryScanPolicyRepository } from '../libs/monitoring/adapters/persistence/in-memory-scan-policy.repository';
import { InMemorySourceBindingRepository } from '../libs/monitoring/adapters/persistence/in-memory-source-binding.repository';
import { InMemoryTopicRepository } from '../libs/monitoring/adapters/persistence/in-memory-topic.repository';
import { InMemoryScanQueueAdapter } from '../libs/monitoring/adapters/queue/in-memory-scan-queue.adapter';
import { FakeSourceCatalogAdapter } from '../libs/monitoring/adapters/source-catalog/fake-source-catalog.adapter';
import type {
  ReserveManualScanRequestQuotaResult,
  ScanRequestQuotaPort,
  SourceBindingConfig,
  SourceBindingConfigProtectorPort,
} from '../libs/monitoring/ports';
import { FeedSummaryEvidenceSelector } from '../libs/summary/adapters/evidence/feed-summary-evidence.selector';
import { FeedSummaryFreshnessProbe } from '../libs/summary/adapters/evidence/feed-summary-freshness.probe';
import { InMemorySummaryEventPublisher } from '../libs/summary/adapters/messaging/in-memory-summary-event-publisher';
import { DeterministicSummaryModelAdapter } from '../libs/summary/adapters/model/deterministic-summary-model.adapter';
import { InMemorySummaryArtifactRepository } from '../libs/summary/adapters/persistence/in-memory-summary-artifact.repository';
import { InMemorySummaryFeedbackRepository } from '../libs/summary/adapters/persistence/in-memory-summary-feedback.repository';
import { InMemorySummaryJobRepository } from '../libs/summary/adapters/persistence/in-memory-summary-job.repository';
import { ExecuteSummaryJobUseCase } from '../libs/summary/features/execute-summary-job/execute-summary-job.use-case';
import { GetSummaryUseCase } from '../libs/summary/features/get-summary/get-summary.use-case';
import { RecordSummaryFeedbackUseCase } from '../libs/summary/features/record-summary-feedback/record-summary-feedback.use-case';
import { RequestSummaryUseCase } from '../libs/summary/features/request-summary/request-summary.use-case';
import type { ReserveSummaryJobQuotaResult, SummaryQuotaPort } from '../libs/summary/ports';

type QueuedScanPayload = Omit<ExecuteScanCommand, 'correlationId' | 'causationId'>;

const fixedNow = new Date('2026-06-06T00:00:00.000Z');
const tenant = tenantId('tenant-mvp-core-loop-smoke');
const workspace = workspaceId('workspace-mvp-core-loop-smoke');
const correlation = 'mvp-core-loop-correlation';

async function main(): Promise<void> {
  const ids = new SequenceIdGenerator('mvp-core');
  const clock = new FixedClock(fixedNow);
  const topics = new InMemoryTopicRepository();
  const bindings = new InMemorySourceBindingRepository();
  const scanPolicies = new InMemoryScanPolicyRepository();
  const scanJobs = new InMemoryScanJobRepository();
  const outbox = new InMemoryOutboxAdapter();
  const idempotency = new InMemoryIdempotencyAdapter();
  const queuePublisher = new InMemoryQueuePublisher();
  const scanQueue = new InMemoryScanQueueAdapter(queuePublisher, new InMemoryMetricsRecorder());
  const feedItems = new InMemoryFeedItemReadRepository();
  const summaryJobs = new InMemorySummaryJobRepository();
  const summaryArtifacts = new InMemorySummaryArtifactRepository();
  const summaryFeedback = new InMemorySummaryFeedbackRepository();
  const summaryEvents = new InMemorySummaryEventPublisher();
  const realtimeEvents = new InMemoryRealtimeEventRepository();

  const topic = unwrap(
    await new CreateTopicUseCase(topics, outbox, idempotency, ids, clock).execute({
      tenantId: tenant,
      workspaceId: workspace,
      name: 'AI Infrastructure',
      query: 'monitoring',
      idempotencyKey: 'topic:create:ai-infrastructure',
      correlationId: correlation,
    }),
    'create topic',
  );
  assert(topic.created, 'topic should be created on first command');

  const sourceBinding = unwrap(
    await new BindSourceUseCase(
      topics,
      bindings,
      new FakeSourceCatalogAdapter(),
      outbox,
      idempotency,
      new PassThroughConfigProtector(),
      ids,
      clock,
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      topicId: topic.topicId,
      providerKey: 'fake-source',
      config: {
        mode: 'search',
        query: 'monitoring',
      },
      idempotencyKey: 'source:bind:fake-source',
      correlationId: correlation,
    }),
    'bind source',
  );
  assert(sourceBinding.created, 'source binding should be created on first command');

  const scanPolicy = unwrap(
    await new SetScanPolicyUseCase(bindings, scanPolicies, outbox, idempotency, ids, clock).execute({
      tenantId: tenant,
      workspaceId: workspace,
      sourceBindingId: sourceBinding.sourceBindingId,
      intervalSeconds: 900,
      freshnessSeconds: 3600,
      retryBudget: 2,
      idempotencyKey: 'scan-policy:set:fake-source',
      correlationId: correlation,
    }),
    'set scan policy',
  );
  assert(scanPolicy.created, 'scan policy should be created on first command');

  const requestedScan = unwrap(
    await new RequestScanUseCase(
      bindings,
      scanPolicies,
      scanJobs,
      scanQueue,
      outbox,
      idempotency,
      new AllowingScanRequestQuota(),
      ids,
      clock,
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      sourceBindingId: sourceBinding.sourceBindingId,
      idempotencyKey: 'scan:request:manual',
      correlationId: correlation,
    }),
    'request scan',
  );
  assert(requestedScan.created, 'scan request should create a job');
  assert(requestedScan.status === 'enqueued', `expected enqueued scan job, got ${requestedScan.status}`);

  const queuedScan = queuePublisher.all()[0];
  assert(queuedScan !== undefined, 'scan request must enqueue ingestion command');
  assert(queuedScan.commandType === 'ingestion.scan.execute', 'unexpected queued command type');
  assert(typeof queuedScan.causationId === 'string', 'queued scan causationId is required');
  assertQueuedScanPayload(queuedScan.payload);

  const sourceRegistry = new InMemorySourceProviderRegistry([new FakeSourceProvider()], sourceReadinessProfiles);
  const executeScanResult = unwrap(
    await new ExecuteScanUseCase(
      new RegistrySourceFetcherAdapter(sourceRegistry),
      new InMemorySourceItemRepository(),
      new InMemoryFeedProjectionAdapter(feedItems),
      new InMemoryScanAttemptRepository(),
      new InMemoryScanCursorRepository(),
      new MonitoringScanExecutionReporter(new RecordScanExecutionUseCase(scanJobs)),
      new InMemoryScanFailureQueueAdapter(new InMemoryMetricsRecorder()),
      new InMemoryScanLeaseAdapter(),
      ids,
      clock,
    ).execute({
      ...queuedScan.payload,
      correlationId: queuedScan.correlationId,
      causationId: queuedScan.causationId,
      retryBudget: 2,
    }),
    'execute scan',
  );
  assert(executeScanResult.fetched === 2, `expected 2 fetched items, got ${executeScanResult.fetched}`);
  assert(executeScanResult.inserted === 2, `expected 2 inserted items, got ${executeScanResult.inserted}`);
  assert(executeScanResult.projected === 2, `expected 2 projected feed items, got ${executeScanResult.projected}`);

  const scanStatus = unwrap(
    await new GetScanStatusUseCase(scanJobs).execute({
      tenantId: tenant,
      workspaceId: workspace,
      scanJobId: requestedScan.scanJobId,
    }),
    'get scan status',
  );
  assert(scanStatus.status === 'succeeded', `expected succeeded scan job, got ${scanStatus.status}`);

  const feedPage = unwrap(
    await new ListFeedItemsUseCase(feedItems).execute({
      tenantId: tenant,
      workspaceId: workspace,
      topicId: topic.topicId,
      limit: 10,
    }),
    'list feed items',
  );
  assert(feedPage.items.length === 2, `expected 2 feed items, got ${feedPage.items.length}`);
  assert(
    feedPage.items.every((item) => item.sourceBindingId === sourceBinding.sourceBindingId),
    'feed items must keep source binding provenance',
  );
  assert(
    feedPage.items.every((item) => item.canonicalUrl.startsWith('https://example.test/source/')),
    'feed items must expose canonical source URLs',
  );

  const summaryJob = unwrap(
    await new RequestSummaryUseCase(summaryJobs, new AllowingSummaryQuota(), ids, clock).execute({
      tenantId: tenant,
      workspaceId: workspace,
      topicId: topic.topicId,
      idempotencyKey: 'summary:request:topic',
      correlationId: correlation,
    }),
    'request summary',
  );
  assert(summaryJob.created, 'summary request should create a job');

  const summaryExecution = unwrap(
    await new ExecuteSummaryJobUseCase(
      summaryJobs,
      summaryArtifacts,
      new FeedSummaryEvidenceSelector(feedItems),
      new DeterministicSummaryModelAdapter(),
      summaryEvents,
      ids,
      clock,
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: summaryJob.summaryJobId,
      maxEvidenceItems: 20,
    }),
    'execute summary',
  );
  assert(summaryExecution.status === 'completed', `expected completed summary, got ${summaryExecution.status}`);
  assert(summaryExecution.summaryId !== undefined, 'completed summary must return summaryId');

  const summary = unwrap(
    await new GetSummaryUseCase(summaryArtifacts, new FeedSummaryFreshnessProbe(feedItems, clock)).execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryId: summaryExecution.summaryId,
    }),
    'get summary',
  );
  assert(summary.citations.length === 2, `expected 2 summary citations, got ${summary.citations.length}`);
  assert(summary.qualityFlags.includes('limited_sources'), 'deterministic MVP summary should flag limited_sources');
  assert(summary.freshness.status === 'fresh', `expected fresh summary, got ${summary.freshness.status}`);

  const firstCitation = summary.citations[0];
  assert(firstCitation !== undefined, 'summary should expose at least one citation for feedback evidence');
  const recordedFeedback = unwrap(
    await new RecordSummaryFeedbackUseCase(summaryArtifacts, summaryFeedback, ids, clock).execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryId: summaryExecution.summaryId,
      idempotencyKey: 'summary-feedback:bad-citation',
      submittedBy: 'beta-user-1',
      rating: 2,
      category: 'bad_citation',
      citationId: firstCitation.citationId,
      comment: 'Citation needs review before beta expansion.',
      correlationId: correlation,
    }),
    'record summary feedback',
  );
  assert(recordedFeedback.created, 'summary feedback should be created');
  assert(recordedFeedback.triageOwner === 'summary-owner', 'bad_citation feedback should route to summary owner');
  assert(recordedFeedback.evidence.feedItemId === firstCitation.feedItemId, 'feedback must preserve citation feed evidence');
  assert(recordedFeedback.eligibleForEvalFixture, 'bad_citation feedback should be eligible for eval fixture review');

  const summaryReadyEvent = summaryEvents.all()[0];
  assertSummaryReadyEvent(summaryReadyEvent);
  const realtimeProjection = unwrap(
    await new ProjectSummaryReadyEventUseCase(
      new RecordRealtimeEventUseCase(realtimeEvents, ids, clock),
    ).execute({
      event: summaryReadyEvent,
    }),
    'project summary ready event',
  );
  assert(
    realtimeProjection.channel === `topic:${topic.topicId}:summary-status`,
    `unexpected realtime channel ${realtimeProjection.channel}`,
  );

  const realtimePage = unwrap(
    await new ListRealtimeEventsUseCase(realtimeEvents).execute({
      tenantId: tenant,
      workspaceId: workspace,
      channel: realtimeProjection.channel,
      limit: 10,
    }),
    'list realtime events',
  );
  assert(!realtimePage.resyncRequired, 'fresh realtime page must not require resync');
  assert(realtimePage.events.length === 1, `expected 1 realtime event, got ${realtimePage.events.length}`);
  assert(realtimePage.events[0]?.resourceId === summaryExecution.summaryId, 'realtime event must target summary');
  assert(realtimePage.events[0]?.sequence === realtimeProjection.sequence, 'realtime sequence mismatch');

  console.log('MVP core loop and feedback smoke OK');
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

class PassThroughConfigProtector implements SourceBindingConfigProtectorPort {
  async protect(config: SourceBindingConfig): Promise<SourceBindingConfig> {
    return config;
  }
}

class AllowingScanRequestQuota implements ScanRequestQuotaPort {
  async reserveManualScanRequest(): Promise<Result<ReserveManualScanRequestQuotaResult, DomainError>> {
    return ok({
      remaining: 999,
      resetAt: '2026-06-06T01:00:00.000Z',
    });
  }
}

class AllowingSummaryQuota implements SummaryQuotaPort {
  async reserveSummaryJob(): Promise<Result<ReserveSummaryJobQuotaResult, DomainError>> {
    return ok({
      remaining: 999,
      resetAt: '2026-06-06T01:00:00.000Z',
    });
  }
}

class MonitoringScanExecutionReporter implements ScanExecutionReporterPort {
  constructor(private readonly recordScanExecution: RecordScanExecutionUseCase) {}

  async reportSucceeded(command: ReportScanSucceededCommand): Promise<void> {
    unwrap(
      await this.recordScanExecution.execute({
        ...command,
        status: 'succeeded',
      }),
      'record successful scan execution',
    );
  }

  async reportFailed(command: ReportScanFailedCommand): Promise<void> {
    unwrap(
      await this.recordScanExecution.execute({
        ...command,
        status: 'failed',
        failureReason: command.failureReason,
      }),
      'record failed scan execution',
    );
  }
}

function unwrap<TValue, TError>(result: Result<TValue, TError>, label: string): TValue {
  if (result.ok) {
    return result.value;
  }

  throw result.error instanceof Error ? result.error : new Error(`${label} failed`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertQueuedScanPayload(payload: Readonly<Record<string, unknown>>): asserts payload is QueuedScanPayload {
  assert(isTenantId(payload.tenantId), 'queued scan tenantId must be a string');
  assert(isWorkspaceId(payload.workspaceId), 'queued scan workspaceId must be a string');
  assert(typeof payload.scanJobId === 'string' && payload.scanJobId.length > 0, 'queued scanJobId is required');
  assert(typeof payload.topicId === 'string' && payload.topicId.length > 0, 'queued topicId is required');
  assert(
    typeof payload.sourceBindingId === 'string' && payload.sourceBindingId.length > 0,
    'queued sourceBindingId is required',
  );
  assert(typeof payload.scanPolicyId === 'string' && payload.scanPolicyId.length > 0, 'queued scanPolicyId is required');
  assert(typeof payload.providerKey === 'string' && payload.providerKey === 'fake-source', 'providerKey mismatch');
  assertSourceQuery(payload.sourceQuery);
}

function assertSourceQuery(value: unknown): asserts value is SourceQuery {
  assert(value !== null && typeof value === 'object', 'sourceQuery must be an object');
  const record = value as Readonly<Record<string, unknown>>;
  assert(
    record.mode === 'search' || record.mode === 'listing' || record.mode === 'thread' || record.mode === 'url',
    'sourceQuery mode is invalid',
  );
  assert(typeof record.query === 'string' && record.query.length > 0, 'sourceQuery query is required');
}

function assertSummaryReadyEvent(
  event: EventEnvelope<Readonly<Record<string, unknown>>> | undefined,
): asserts event is EventEnvelope<SummaryReadyProjectionPayload> {
  assert(event !== undefined, 'summary execution must publish summary.ready event');
  assert(event.eventType === 'summary.ready', `unexpected summary event type ${event.eventType}`);
  const payload = event.payload;

  assert(typeof payload.summaryJobId === 'string' && payload.summaryJobId.length > 0, 'summaryJobId is required');
  assert(typeof payload.summaryId === 'string' && payload.summaryId.length > 0, 'summaryId is required');
  assert(isTenantId(payload.tenantId), 'summary event tenantId must be a string');
  assert(isWorkspaceId(payload.workspaceId), 'summary event workspaceId must be a string');
  assert(typeof payload.topicId === 'string' && payload.topicId.length > 0, 'summary event topicId is required');
  assert(payload.status === 'completed' || payload.status === 'no_signal', 'summary event status is invalid');
}

function isTenantId(value: unknown): value is TenantId {
  return typeof value === 'string' && value.length > 0;
}

function isWorkspaceId(value: unknown): value is WorkspaceId {
  return typeof value === 'string' && value.length > 0;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
