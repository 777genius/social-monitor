import { InMemoryIdempotencyAdapter as FakeIdempotency } from '@social-monitor/monitoring/adapters/idempotency/in-memory-idempotency.adapter';
import { InMemorySourceBindingRepository as FakeSourceBindings } from '@social-monitor/monitoring/adapters/persistence/in-memory-source-binding.repository';
import { InMemoryScanPolicyRepository as FakeScanPolicies } from '@social-monitor/monitoring/adapters/persistence/in-memory-scan-policy.repository';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryScanJobRepository as FakeScanJobs } from '@social-monitor/monitoring/adapters/persistence/in-memory-scan-job.repository';
import { InMemoryOutboxAdapter as FakeOutbox } from '@social-monitor/monitoring/adapters/messaging/in-memory-outbox.adapter';
import { InMemoryScanQueueAdapter } from '@social-monitor/monitoring/adapters/queue/in-memory-scan-queue.adapter';
import { DirectScanDispatchAdapter } from '@social-monitor/monitoring/adapters/queue/direct-scan-dispatch.adapter';
import { DomainError, type FixedClock, type IdGenerator, ok, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { ScanPolicy, SourceBinding } from '@social-monitor/monitoring/domain';
import type {
  IdempotencyPort,
  OutboxPort,
  ScanPolicyRepositoryPort,
  ScanRequestQuotaPort,
  ScanQueuePort,
  SourceBindingRepositoryPort,
} from '@social-monitor/monitoring/ports';
import { RequestScanUseCase } from '@social-monitor/monitoring/features/request-scan/request-scan.use-case';

export class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `00000000-0000-7000-8000-${this.nextId.toString().padStart(12, '0')}`;
    this.nextId += 1;
    return id;
  }
}

export class FakeScanQueue extends InMemoryScanQueueAdapter {
  constructor() { super(new InMemoryQueuePublisher(), new InMemoryMetricsRecorder()); }
  get commands() { return this.all().map((command) => ({ ...command.payload,
    correlationId: command.correlationId, causationId: command.causationId })); }
}

export class BackpressuredScanQueue extends FakeScanQueue {
  override async canAccept(): Promise<boolean> { return false; }
}

export class AllowingScanRequestQuota implements ScanRequestQuotaPort {
  reservationCount = 0;

  async reserveManualScanRequest(): ReturnType<ScanRequestQuotaPort['reserveManualScanRequest']> {
    this.reservationCount += 1;

    return ok({
      remaining: 59,
      resetAt: '2026-06-05T01:00:00.000Z',
    });
  }
}

export class DenyingScanRequestQuota implements ScanRequestQuotaPort {
  async reserveManualScanRequest(): ReturnType<ScanRequestQuotaPort['reserveManualScanRequest']> {
    return {
      ok: false,
      error: new DomainError('operation.quota_exceeded', 'Usage quota exceeded'),
    };
  }
}

export const makeBinding = (providerKey = 'fake-source') =>
  SourceBinding.create({
    id: 'binding-1',
    tenantId: tenantId('tenant-1'),
    workspaceId: workspaceId('workspace-1'),
    interestId: 'interest-1',
    providerKey,
    capabilityProfileVersion: 1,
    config: {},
    createdAt: new Date('2026-06-05T00:00:00.000Z'),
  });

export const makePolicy = () =>
  ScanPolicy.create({
    id: 'policy-1',
    tenantId: tenantId('tenant-1'),
    workspaceId: workspaceId('workspace-1'),
    sourceBindingId: 'binding-1',
    intervalSeconds: 300,
    freshnessSeconds: 900,
    retryBudget: 3,
    nextRunAt: new Date('2026-06-05T00:00:00.000Z'),
    createdAt: new Date('2026-06-05T00:00:00.000Z'),
  });

export const createRequestScanUseCase = (
  bindings: SourceBindingRepositoryPort, policies: ScanPolicyRepositoryPort,
  jobs: FakeScanJobs, queue: ScanQueuePort, outbox: OutboxPort,
  idempotency: IdempotencyPort, quota: ScanRequestQuotaPort,
  ids: IdGenerator, clock: FixedClock,
) => new RequestScanUseCase(bindings, policies, jobs, queue,
  new DirectScanDispatchAdapter(jobs, queue, outbox), idempotency, quota, ids, clock);

export { FakeIdempotency, FakeSourceBindings, FakeScanPolicies, FakeScanJobs, FakeOutbox };
