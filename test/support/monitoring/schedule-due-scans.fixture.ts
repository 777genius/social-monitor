import { InMemorySourceBindingRepository as FakeSourceBindings } from '@social-monitor/monitoring/adapters/persistence/in-memory-source-binding.repository';
import { InMemoryScanPolicyRepository as FakeScanPolicies } from '@social-monitor/monitoring/adapters/persistence/in-memory-scan-policy.repository';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryScanJobRepository as FakeScanJobs } from '@social-monitor/monitoring/adapters/persistence/in-memory-scan-job.repository';
import { InMemoryOutboxAdapter as FakeOutbox } from '@social-monitor/monitoring/adapters/messaging/in-memory-outbox.adapter';
import { InMemoryScanQueueAdapter } from '@social-monitor/monitoring/adapters/queue/in-memory-scan-queue.adapter';
import { DirectScanDispatchAdapter } from '@social-monitor/monitoring/adapters/queue/direct-scan-dispatch.adapter';
import {
  type FixedClock,
  type IdGenerator,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import { ScanPolicy, SourceBinding } from '@social-monitor/monitoring/domain';
import type {
  ScanPolicyRepositoryPort,
  ScanQueuePort,
  ScanSchedulerDecisionHistoryPort,
  ScanSchedulerDecisionRecord,
  SourceBindingRepositoryPort,
} from '@social-monitor/monitoring/ports';
import { ScheduleDueScansUseCase } from '@social-monitor/monitoring/features/schedule-due-scans/schedule-due-scans.use-case';

export class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `scan-job-${this.nextId}`;
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

export class FakeSchedulerDecisionHistory implements ScanSchedulerDecisionHistoryPort {
  readonly records: ScanSchedulerDecisionRecord[] = [];

  async recordBatch(
    command: Parameters<ScanSchedulerDecisionHistoryPort['recordBatch']>[0],
  ): Promise<void> {
    this.records.push(...command.records);
  }

  async listBySourceBindingWindow(): ReturnType<
    ScanSchedulerDecisionHistoryPort['listBySourceBindingWindow']
  > {
    return { records: this.records, truncated: false };
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
    nextRunAt: new Date('2026-06-05T12:00:00.000Z'),
    createdAt: new Date('2026-06-05T00:00:00.000Z'),
  });

export const noSkippedByReason = () => ({
  active_scan: 0,
  duplicate_window: 0,
  fresh_success: 0,
  provider_failure_backoff: 0,
  queue_backpressure: 0,
  rate_limit_backoff: 0,
  source_unavailable: 0,
});

export const skippedByReason = (
  reason: keyof ReturnType<typeof noSkippedByReason>,
) => ({
  ...noSkippedByReason(),
  [reason]: 1,
});

export const createScheduleDueScansUseCase = (
  bindings: SourceBindingRepositoryPort, policies: ScanPolicyRepositoryPort,
  jobs: FakeScanJobs, queue: ScanQueuePort, ids: IdGenerator, clock: FixedClock,
  decisions?: ScanSchedulerDecisionHistoryPort,
) => new ScheduleDueScansUseCase(bindings, policies, jobs, queue,
  new DirectScanDispatchAdapter(jobs, queue, new FakeOutbox()), ids, clock, decisions);

export { FakeSourceBindings, FakeScanPolicies, FakeScanJobs, FakeOutbox };
