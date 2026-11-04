import { FixedClock, ok, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { InMemoryIdempotencyAdapter } from '@social-monitor/monitoring/adapters/idempotency/in-memory-idempotency.adapter';
import { InMemoryOutboxAdapter } from '@social-monitor/monitoring/adapters/messaging/in-memory-outbox.adapter';
import { InMemoryScanJobRepository } from '@social-monitor/monitoring/adapters/persistence/in-memory-scan-job.repository';
import { InMemoryScanPolicyRepository } from '@social-monitor/monitoring/adapters/persistence/in-memory-scan-policy.repository';
import { InMemorySourceBindingRepository } from '@social-monitor/monitoring/adapters/persistence/in-memory-source-binding.repository';
import { PrismaScanJobRepository } from '@social-monitor/monitoring/adapters/persistence/prisma/prisma-scan-job.repository';
import { PrismaScanDispatchAdapter } from '@social-monitor/monitoring/adapters/persistence/prisma/prisma-scan-dispatch.adapter';
import { DirectScanDispatchAdapter } from '@social-monitor/monitoring/adapters/queue/direct-scan-dispatch.adapter';
import { InMemoryScanQueueAdapter } from '@social-monitor/monitoring/adapters/queue/in-memory-scan-queue.adapter';
import { ScanPolicy, SourceBinding } from '@social-monitor/monitoring/domain';
import { RequestScanUseCase } from '@social-monitor/monitoring/features/request-scan/request-scan.use-case';
import { FakePrismaMonitoringClient } from '../../../scripts/lib/scan-dispatch-prisma.fixture';

const scope = { tenantId: tenantId('sandbox-tenant'), workspaceId: workspaceId('sandbox-workspace') };
const now = new Date('2026-06-16T03:00:00Z');

describe('required scan dispatch recovery', () => {
  it.each(['local', 'job', 'event', 'command'] as const)(
    'rolls back after %s write failure and lets the same idempotency key succeed', async (failure) => {
      const bindings = new InMemorySourceBindingRepository();
      const policies = new InMemoryScanPolicyRepository();
      await bindings.save(SourceBinding.create({ ...scope, id: 'binding', interestId: 'interest',
        providerKey: 'fake-source', capabilityProfileVersion: 1, config: {}, createdAt: now }));
      await policies.save(ScanPolicy.create({ ...scope, id: 'policy', sourceBindingId: 'binding',
        intervalSeconds: 300, freshnessSeconds: 900, retryBudget: 2, nextRunAt: now, createdAt: now }));
      const prisma = new FakePrismaMonitoringClient();
      const localJobs = new InMemoryScanJobRepository();
      const jobs = failure === 'local' ? localJobs : new PrismaScanJobRepository(prisma);
      const publisher = new InMemoryQueuePublisher();
      const queue = new InMemoryScanQueueAdapter(publisher, new InMemoryMetricsRecorder());
      const outbox = new InMemoryOutboxAdapter();
      const dispatch = failure === 'local'
        ? new DirectScanDispatchAdapter(localJobs, queue, outbox)
        : new PrismaScanDispatchAdapter(prisma);
      if (failure === 'local') {
        const enqueue = queue.enqueue.bind(queue);
        jest.spyOn(queue, 'enqueue').mockImplementationOnce(async (command) => {
          await enqueue(command);
          throw new Error('Synthetic dispatch failure after local queue write');
        });
      } else prisma.failAfterWrite = failure;
      let nextId = 0;
      const reserve = jest.fn(async () => ok({ remaining: 10, resetAt: now.toISOString() }));
      const request = new RequestScanUseCase(bindings, policies, jobs, queue, dispatch,
        new InMemoryIdempotencyAdapter(), { reserveManualScanRequest: reserve },
        { generate: () => `sandbox-scan-${++nextId}` }, new FixedClock(now));
      const command = { ...scope, sourceBindingId: 'binding', idempotencyKey: 'same-request', correlationId: 'sandbox' };

      await expect(request.execute(command)).rejects.toThrow('Synthetic dispatch failure');
      expect(await jobs.findByIdempotencyKey(command)).toBeNull();
      expect(prisma.scanJobs.size).toBe(0);
      expect(prisma.outboxEvents.size).toBe(0);
      expect(outbox.all()).toEqual([]);
      expect(publisher.all()).toEqual([]);

      const recovered = await request.execute(command);
      expect(recovered).toMatchObject({ ok: true, value: { status: 'enqueued', created: true } });
      const replay = await request.execute(command);
      expect(replay).toMatchObject({ ok: true, value: { status: 'enqueued', created: false,
        requestDecision: { decision: 'idempotent_replay' } } });
      expect((await jobs.findByIdempotencyKey(command))?.toSnapshot().status).toBe('enqueued');
      expect(failure === 'local' ? publisher.all().length
        : [...prisma.outboxEvents.values()].filter((row) => row.messageKind === 'COMMAND').length).toBe(1);
      expect(failure === 'local' ? outbox.all().length
        : [...prisma.outboxEvents.values()].filter((row) => row.messageKind === 'EVENT').length).toBe(1);
      // Quota is outside dispatch's transaction; failed work is not refunded.
      expect(reserve).toHaveBeenCalledTimes(2);
    },
  );
});
