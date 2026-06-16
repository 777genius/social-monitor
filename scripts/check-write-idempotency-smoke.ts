import {
  DomainError,
  FixedClock,
  type IdGenerator,
  ok,
  type Result,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue';

import { InMemoryDeliveryAttemptRepository } from '../libs/delivery/adapters/persistence/in-memory-delivery-attempt.repository';
import { QueueDeliveryAttemptUseCase } from '../libs/delivery/features/queue-delivery-attempt/queue-delivery-attempt.use-case';
import { InMemoryIdempotencyAdapter } from '../libs/monitoring/adapters/idempotency/in-memory-idempotency.adapter';
import { InMemoryOutboxAdapter } from '../libs/monitoring/adapters/messaging/in-memory-outbox.adapter';
import { InMemoryScanJobRepository } from '../libs/monitoring/adapters/persistence/in-memory-scan-job.repository';
import { InMemoryScanPolicyRepository } from '../libs/monitoring/adapters/persistence/in-memory-scan-policy.repository';
import { InMemorySourceBindingRepository } from '../libs/monitoring/adapters/persistence/in-memory-source-binding.repository';
import { InMemoryTopicRepository } from '../libs/monitoring/adapters/persistence/in-memory-topic.repository';
import { InMemoryScanQueueAdapter } from '../libs/monitoring/adapters/queue/in-memory-scan-queue.adapter';
import { FakeSourceCatalogAdapter } from '../libs/monitoring/adapters/source-catalog/fake-source-catalog.adapter';
import { BindSourceUseCase } from '../libs/monitoring/features/bind-source/bind-source.use-case';
import { CreateTopicUseCase } from '../libs/monitoring/features/create-topic/create-topic.use-case';
import { RequestScanUseCase } from '../libs/monitoring/features/request-scan/request-scan.use-case';
import { SetScanPolicyUseCase } from '../libs/monitoring/features/set-scan-policy/set-scan-policy.use-case';
import type {
  ReserveManualScanRequestQuotaResult,
  ScanRequestQuotaPort,
  SourceBindingConfig,
  SourceBindingConfigProtectorPort,
} from '../libs/monitoring/ports';
import { InMemorySummaryJobQueueAdapter } from '../libs/summary/adapters/messaging/in-memory-summary-job-queue.adapter';
import { InMemorySummaryJobRepository } from '../libs/summary/adapters/persistence/in-memory-summary-job.repository';
import { RequestSummaryUseCase } from '../libs/summary/features/request-summary/request-summary.use-case';
import type { ReserveSummaryJobQuotaResult, SummaryQuotaPort } from '../libs/summary/ports';

const clock = new FixedClock(new Date('2026-06-16T00:00:00.000Z'));
const tenant = tenantId('tenant-write-idempotency-smoke');
const workspace = workspaceId('workspace-write-idempotency-smoke');
const correlation = 'write-idempotency-smoke';

async function main(): Promise<void> {
  await proveMonitoringWriteIdempotency();
  await proveSummaryRequestIdempotency();
  await proveDeliveryQueueIdempotency();

  console.log('Write path idempotency smoke OK');
}

async function proveMonitoringWriteIdempotency(): Promise<void> {
  const ids = new SequenceIdGenerator('write-idempotency-monitoring');
  const topics = new InMemoryTopicRepository();
  const bindings = new InMemorySourceBindingRepository();
  const scanPolicies = new InMemoryScanPolicyRepository();
  const scanJobs = new InMemoryScanJobRepository();
  const idempotency = new InMemoryIdempotencyAdapter();
  const outbox = new InMemoryOutboxAdapter();
  const queuePublisher = new InMemoryQueuePublisher();
  const scanQueue = new InMemoryScanQueueAdapter(queuePublisher, new InMemoryMetricsRecorder());
  const quota = new CountingScanQuota();

  const createTopic = new CreateTopicUseCase(topics, outbox, idempotency, ids, clock);
  const firstTopic = unwrap(await createTopic.execute({
    tenantId: tenant,
    workspaceId: workspace,
    name: 'Idempotent Monitoring',
    query: 'reliable social monitoring',
    idempotencyKey: 'topic:create:idempotent-monitoring',
    correlationId: correlation,
  }), 'create topic first attempt');
  const duplicateTopic = unwrap(await createTopic.execute({
    tenantId: tenant,
    workspaceId: workspace,
    name: 'Idempotent Monitoring',
    query: 'reliable social monitoring',
    idempotencyKey: 'topic:create:idempotent-monitoring',
    correlationId: correlation,
  }), 'create topic duplicate');
  assert(firstTopic.created, 'first topic command must create');
  assert(!duplicateTopic.created, 'duplicate topic command must not create');
  assert(firstTopic.topicId === duplicateTopic.topicId, 'duplicate topic command must return same topic id');
  assert(outbox.all().length === 1, 'duplicate topic command must not append another outbox event');

  const bindSource = new BindSourceUseCase(
    topics,
    bindings,
    new FakeSourceCatalogAdapter(),
    outbox,
    idempotency,
    new PassThroughConfigProtector(),
    ids,
    clock,
  );
  const firstBinding = unwrap(await bindSource.execute({
    tenantId: tenant,
    workspaceId: workspace,
    topicId: firstTopic.topicId,
    providerKey: 'fake-source',
    config: { mode: 'search', query: 'reliable social monitoring' },
    idempotencyKey: 'source:bind:fake-source:idempotent-monitoring',
    correlationId: correlation,
  }), 'bind source first attempt');
  const duplicateBinding = unwrap(await bindSource.execute({
    tenantId: tenant,
    workspaceId: workspace,
    topicId: firstTopic.topicId,
    providerKey: 'fake-source',
    config: { mode: 'search', query: 'reliable social monitoring' },
    idempotencyKey: 'source:bind:fake-source:idempotent-monitoring',
    correlationId: correlation,
  }), 'bind source duplicate');
  assert(firstBinding.created, 'first source bind command must create');
  assert(!duplicateBinding.created, 'duplicate source bind command must not create');
  assert(
    firstBinding.sourceBindingId === duplicateBinding.sourceBindingId,
    'duplicate source bind command must return same binding id',
  );
  assert(outbox.all().length === 2, 'duplicate source bind command must not append another outbox event');

  const setScanPolicy = new SetScanPolicyUseCase(bindings, scanPolicies, outbox, idempotency, ids, clock);
  const firstPolicy = unwrap(await setScanPolicy.execute({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: firstBinding.sourceBindingId,
    intervalSeconds: 900,
    freshnessSeconds: 3600,
    retryBudget: 2,
    idempotencyKey: 'scan-policy:set:fake-source:idempotent-monitoring',
    correlationId: correlation,
  }), 'set scan policy first attempt');
  const duplicatePolicy = unwrap(await setScanPolicy.execute({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: firstBinding.sourceBindingId,
    intervalSeconds: 900,
    freshnessSeconds: 3600,
    retryBudget: 2,
    idempotencyKey: 'scan-policy:set:fake-source:idempotent-monitoring',
    correlationId: correlation,
  }), 'set scan policy duplicate');
  assert(firstPolicy.created, 'first scan policy command must create');
  assert(!duplicatePolicy.created, 'duplicate scan policy command must not create');
  assert(firstPolicy.scanPolicyId === duplicatePolicy.scanPolicyId, 'duplicate scan policy must return same policy id');
  assert(outbox.all().length === 3, 'duplicate scan policy command must not append another outbox event');

  const requestScan = new RequestScanUseCase(
    bindings,
    scanPolicies,
    scanJobs,
    scanQueue,
    outbox,
    idempotency,
    quota,
    ids,
    clock,
  );
  const firstScan = unwrap(await requestScan.execute({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: firstBinding.sourceBindingId,
    idempotencyKey: 'scan:request:fake-source:idempotent-monitoring',
    correlationId: correlation,
  }), 'request scan first attempt');
  const duplicateScan = unwrap(await requestScan.execute({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: firstBinding.sourceBindingId,
    idempotencyKey: 'scan:request:fake-source:idempotent-monitoring',
    correlationId: correlation,
  }), 'request scan duplicate');
  assert(firstScan.created, 'first scan request must create');
  assert(!duplicateScan.created, 'duplicate scan request must not create');
  assert(firstScan.scanJobId === duplicateScan.scanJobId, 'duplicate scan request must return same scan job id');
  assert(queuePublisher.all().length === 1, 'duplicate scan request must not enqueue another scan command');
  assert(quota.reservations === 1, 'duplicate scan request must not reserve quota twice');
  assert(outbox.all().length === 4, 'duplicate scan request must not append another outbox event');
}

async function proveSummaryRequestIdempotency(): Promise<void> {
  const ids = new SequenceIdGenerator('write-idempotency-summary');
  const summaryJobs = new InMemorySummaryJobRepository();
  const queuePublisher = new InMemoryQueuePublisher();
  const summaryQueue = new InMemorySummaryJobQueueAdapter(queuePublisher, new InMemoryMetricsRecorder());
  const quota = new CountingSummaryQuota();
  const requestSummary = new RequestSummaryUseCase(summaryJobs, summaryQueue, quota, ids, clock);

  const first = unwrap(await requestSummary.execute({
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'topic-idempotent-summary',
    idempotencyKey: 'summary:request:idempotent-topic',
    correlationId: correlation,
  }), 'request summary first attempt');
  const duplicate = unwrap(await requestSummary.execute({
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'topic-idempotent-summary',
    idempotencyKey: 'summary:request:idempotent-topic',
    correlationId: correlation,
  }), 'request summary duplicate');

  assert(first.created, 'first summary request must create');
  assert(!duplicate.created, 'duplicate summary request must not create');
  assert(first.summaryJobId === duplicate.summaryJobId, 'duplicate summary request must return same job id');
  assert(queuePublisher.all().length === 1, 'duplicate summary request must not enqueue another summary job');
  assert(quota.reservations === 1, 'duplicate summary request must not reserve quota twice');
}

async function proveDeliveryQueueIdempotency(): Promise<void> {
  const ids = new SequenceIdGenerator('write-idempotency-delivery');
  const deliveryAttempts = new InMemoryDeliveryAttemptRepository();
  const queueDelivery = new QueueDeliveryAttemptUseCase(deliveryAttempts, ids, clock);

  const first = unwrap(await queueDelivery.execute({
    tenantId: tenant,
    workspaceId: workspace,
    idempotencyKey: 'delivery:queue:digest:idempotent-user',
    channel: 'in_app',
    recipientKey: 'user:idempotent-user',
    resourceType: 'digest',
    resourceId: 'digest-idempotency-smoke',
  }), 'queue delivery first attempt');
  const duplicate = unwrap(await queueDelivery.execute({
    tenantId: tenant,
    workspaceId: workspace,
    idempotencyKey: 'delivery:queue:digest:idempotent-user',
    channel: 'in_app',
    recipientKey: 'user:idempotent-user',
    resourceType: 'digest',
    resourceId: 'digest-idempotency-smoke',
  }), 'queue delivery duplicate');
  const queued = await deliveryAttempts.findQueued({ tenantId: tenant, workspaceId: workspace, limit: 10 });

  assert(first.created, 'first delivery queue command must create');
  assert(!duplicate.created, 'duplicate delivery queue command must not create');
  assert(
    first.deliveryAttemptId === duplicate.deliveryAttemptId,
    'duplicate delivery queue command must return same attempt id',
  );
  assert(queued.length === 1, 'duplicate delivery queue command must not create another queued attempt');
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

  async unprotect(config: SourceBindingConfig): Promise<SourceBindingConfig> {
    return config;
  }
}

class CountingScanQuota implements ScanRequestQuotaPort {
  reservations = 0;

  async reserveManualScanRequest(): Promise<Result<ReserveManualScanRequestQuotaResult, DomainError>> {
    this.reservations += 1;

    return ok({
      remaining: 999,
      resetAt: '2026-06-16T01:00:00.000Z',
    });
  }
}

class CountingSummaryQuota implements SummaryQuotaPort {
  reservations = 0;

  async reserveSummaryJob(): Promise<Result<ReserveSummaryJobQuotaResult, DomainError>> {
    this.reservations += 1;

    return ok({
      remaining: 999,
      resetAt: '2026-06-16T01:00:00.000Z',
    });
  }
}

const unwrap = <TValue>(result: { readonly ok: true; readonly value: TValue } | { readonly ok: false; readonly error: Error }, label: string): TValue => {
  if (!result.ok) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }

  return result.value;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
