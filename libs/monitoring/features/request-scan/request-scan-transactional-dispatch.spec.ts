import {
  FixedClock,
  ok,
  tenantId,
  workspaceId,
  type IdGenerator,
} from '@social-monitor/shared-kernel';

import { InMemoryIdempotencyAdapter } from '../../adapters/idempotency/in-memory-idempotency.adapter';
import { InMemoryOutboxAdapter } from '../../adapters/messaging/in-memory-outbox.adapter';
import { InMemoryScanJobRepository } from '../../adapters/persistence/in-memory-scan-job.repository';
import { InMemoryScanPolicyRepository } from '../../adapters/persistence/in-memory-scan-policy.repository';
import { InMemorySourceBindingRepository } from '../../adapters/persistence/in-memory-source-binding.repository';
import { ScanPolicy, SourceBinding } from '../../domain';
import type {
  ScanDispatchPort,
  ScanQueuePort,
  ScanRequestQuotaPort,
} from '../../ports';
import { RequestScanUseCase } from './request-scan.use-case';

class SequenceIdGenerator implements IdGenerator {
  private next = 1;

  generate(): string {
    const id = `00000000-0000-7000-8000-${this.next
      .toString()
      .padStart(12, '0')}`;
    this.next += 1;
    return id;
  }
}

class RecordingScanDispatch implements ScanDispatchPort {
  readonly calls: Array<
    Parameters<ScanDispatchPort['storeEnqueuedScan']>[0]
  > = [];

  async storeEnqueuedScan(
    params: Parameters<ScanDispatchPort['storeEnqueuedScan']>[0],
  ): Promise<void> {
    this.calls.push(params);
  }
}

class RecordingDirectQueue implements ScanQueuePort {
  readonly commands: Array<Parameters<ScanQueuePort['enqueue']>[0]> = [];

  async canAccept(): Promise<boolean> {
    return true;
  }

  async enqueue(
    command: Parameters<ScanQueuePort['enqueue']>[0],
  ): Promise<void> {
    this.commands.push(command);
  }
}

const allowingQuota: ScanRequestQuotaPort = {
  reserveManualScanRequest: async () =>
    ok({
      remaining: 9,
      resetAt: '2026-07-23T13:00:00.000Z',
    }),
};

describe('RequestScanUseCase transactional dispatch', () => {
  it('uses the atomic dispatch port without direct queue or outbox writes', async () => {
    const tenant = tenantId('00000000-0000-7000-8000-000000000010');
    const workspace = workspaceId(
      '00000000-0000-7000-8000-000000000011',
    );
    const now = new Date('2026-07-23T12:00:00.000Z');
    const bindings = new InMemorySourceBindingRepository();
    const policies = new InMemoryScanPolicyRepository();
    const jobs = new InMemoryScanJobRepository();
    const directQueue = new RecordingDirectQueue();
    const directOutbox = new InMemoryOutboxAdapter();
    const dispatch = new RecordingScanDispatch();
    await bindings.save(
      SourceBinding.create({
        id: '00000000-0000-7000-8000-000000000012',
        tenantId: tenant,
        workspaceId: workspace,
        interestId: '00000000-0000-7000-8000-000000000013',
        providerKey: 'reddit',
        capabilityProfileVersion: 1,
        config: { query: 'reliable systems' },
        createdAt: now,
      }),
    );
    await policies.save(
      ScanPolicy.create({
        id: '00000000-0000-7000-8000-000000000014',
        tenantId: tenant,
        workspaceId: workspace,
        sourceBindingId: '00000000-0000-7000-8000-000000000012',
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
        nextRunAt: now,
        createdAt: now,
      }),
    );
    const useCase = new RequestScanUseCase(
      bindings,
      policies,
      jobs,
      directQueue,
      directOutbox,
      new InMemoryIdempotencyAdapter(),
      allowingQuota,
      new SequenceIdGenerator(),
      new FixedClock(now),
      dispatch,
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      sourceBindingId: '00000000-0000-7000-8000-000000000012',
      idempotencyKey: 'request-1',
      correlationId: 'correlation-1',
    });

    expect(result.ok).toBe(true);
    expect(dispatch.calls).toHaveLength(1);
    expect(dispatch.calls[0]?.job.toSnapshot().status).toBe('enqueued');
    expect(dispatch.calls[0]?.event?.eventType).toBe(
      'monitoring.scan.requested',
    );
    expect(directQueue.commands).toEqual([]);
    expect(directOutbox.all()).toEqual([]);
  });
});
