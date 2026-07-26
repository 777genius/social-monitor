import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import type {
  QueueCommandEnvelope,
  QueuePublisherPort,
} from '@social-monitor/platform-queue';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import {
  causationId,
  correlationId,
  eventId,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import { InMemoryOutboxAdapter } from '../messaging/in-memory-outbox.adapter';
import { InMemoryScanJobRepository } from '../persistence/in-memory-scan-job.repository';
import { ScanJob } from '../../domain';
import { DirectScanDispatchAdapter } from './direct-scan-dispatch.adapter';
import { InMemoryScanQueueAdapter } from './in-memory-scan-queue.adapter';

const tenant = tenantId('00000000-0000-7000-8000-000000000010');
const workspace = workspaceId('00000000-0000-7000-8000-000000000011');
const scanJobId = '00000000-0000-7000-8000-000000000012';
const requestedAt = new Date('2026-07-23T12:00:00.000Z');

const requestedJob = ScanJob.request({
  id: scanJobId,
  tenantId: tenant,
  workspaceId: workspace,
  sourceBindingId: '00000000-0000-7000-8000-000000000013',
  scanPolicyId: '00000000-0000-7000-8000-000000000014',
  idempotencyKey: 'request-1',
  requestedAt,
});
const enqueuedJob = requestedJob.markEnqueued({ enqueuedAt: requestedAt });
const command = {
  tenantId: tenant,
  workspaceId: workspace,
  scanJobId,
  interestId: '00000000-0000-7000-8000-000000000015',
  sourceBindingId: '00000000-0000-7000-8000-000000000013',
  scanPolicyId: '00000000-0000-7000-8000-000000000014',
  providerKey: 'reddit',
  sourceQuery: { mode: 'search' as const, query: 'reliable systems' },
  retryBudget: 3,
  correlationId: 'correlation-1',
  causationId: 'request-1',
};
const event = {
  eventId: eventId('00000000-0000-7000-8000-000000000016'),
  eventType: 'monitoring.scan.requested',
  schemaVersion: 1,
  occurredAt: requestedAt,
  tenantId: tenant,
  workspaceId: workspace,
  correlationId: correlationId('correlation-1'),
  causationId: causationId('request-1'),
  payload: { scanJobId },
};

class PartiallyFailingQueuePublisher extends InMemoryQueuePublisher {
  override async publish<
    TPayload extends Readonly<Record<string, unknown>>,
  >(queuedCommand: QueueCommandEnvelope<TPayload>): Promise<void> {
    await super.publish(queuedCommand);
    throw new Error('injected queue failure');
  }
}

class ToggleFailBeforeQueuePublisher extends InMemoryQueuePublisher {
  failBeforePublish = false;

  override async publish<
    TPayload extends Readonly<Record<string, unknown>>,
  >(queuedCommand: QueueCommandEnvelope<TPayload>): Promise<void> {
    if (this.failBeforePublish) {
      throw new Error('injected queue failure before write');
    }
    await super.publish(queuedCommand);
  }
}

class RollbackFailingQueuePublisher extends PartiallyFailingQueuePublisher {
  override rollbackToCheckpoint(): void {
    throw new Error('injected queue rollback failure');
  }
}

class PartiallyFailingOutbox extends InMemoryOutboxAdapter {
  override async append(
    appendedEvent: Parameters<InMemoryOutboxAdapter['append']>[0],
  ): Promise<void> {
    await super.append(appendedEvent);
    throw new Error('injected outbox failure');
  }
}

class ToggleFailBeforeOutbox extends InMemoryOutboxAdapter {
  failBeforeAppend = false;

  override async append(
    appendedEvent: Parameters<InMemoryOutboxAdapter['append']>[0],
  ): Promise<void> {
    if (this.failBeforeAppend) {
      throw new Error('injected outbox failure before write');
    }
    await super.append(appendedEvent);
  }
}

class RollbackFailingOutbox extends PartiallyFailingOutbox {
  override async rollbackAppend(): Promise<void> {
    throw new Error('injected outbox rollback failure');
  }
}

class ToggleFailingScanJobRepository extends InMemoryScanJobRepository {
  failAfterSave = false;

  override async save(job: ScanJob): Promise<void> {
    await super.save(job);
    if (this.failAfterSave) {
      throw new Error('injected job failure');
    }
  }
}

describe('DirectScanDispatchAdapter', () => {
  it('fails fast when the queue cannot compensate a partial publication', () => {
    const publisher: QueuePublisherPort = {
      publish: async () => undefined,
    };
    const queue = new InMemoryScanQueueAdapter(
      publisher,
      new InMemoryMetricsRecorder(),
    );

    expect(
      () =>
        new DirectScanDispatchAdapter(
          new InMemoryScanJobRepository(),
          queue,
          new InMemoryOutboxAdapter(),
        ),
    ).toThrow('does not support direct dispatch rollback');
  });

  it('stores the same job, event and command intent as durable dispatch', async () => {
    const jobs = new InMemoryScanJobRepository();
    const outbox = new InMemoryOutboxAdapter();
    const publisher = new InMemoryQueuePublisher();
    const queue = new InMemoryScanQueueAdapter(
      publisher,
      new InMemoryMetricsRecorder(),
    );
    const adapter = new DirectScanDispatchAdapter(jobs, queue, outbox);

    await adapter.storeEnqueuedScan({
      job: enqueuedJob,
      command,
      event,
    });

    await expect(
      jobs.findById({ tenantId: tenant, workspaceId: workspace, scanJobId }),
    ).resolves.toEqual(enqueuedJob);
    expect(outbox.all()).toEqual([event]);
    expect(publisher.all()).toEqual([
      expect.objectContaining({
        commandId: scanJobId,
        commandType: 'ingestion.scan.execute',
      }),
    ]);
  });

  it('rolls back a partially published command, event and job together', async () => {
    const jobs = new InMemoryScanJobRepository();
    const outbox = new InMemoryOutboxAdapter();
    const publisher = new PartiallyFailingQueuePublisher();
    const queue = new InMemoryScanQueueAdapter(
      publisher,
      new InMemoryMetricsRecorder(),
    );
    const adapter = new DirectScanDispatchAdapter(jobs, queue, outbox);

    await expect(
      adapter.storeEnqueuedScan({ job: enqueuedJob, command, event }),
    ).rejects.toThrow('injected queue failure');

    await expect(
      jobs.findById({ tenantId: tenant, workspaceId: workspace, scanJobId }),
    ).resolves.toBeNull();
    expect(outbox.all()).toEqual([]);
    expect(publisher.all()).toEqual([]);
  });

  it('preserves a pre-existing command when enqueue fails before writing', async () => {
    const jobs = new InMemoryScanJobRepository();
    const outbox = new InMemoryOutboxAdapter();
    const publisher = new ToggleFailBeforeQueuePublisher();
    const queue = new InMemoryScanQueueAdapter(
      publisher,
      new InMemoryMetricsRecorder(),
    );
    await queue.enqueue(command);
    publisher.failBeforePublish = true;
    const adapter = new DirectScanDispatchAdapter(jobs, queue, outbox);

    await expect(
      adapter.storeEnqueuedScan({ job: enqueuedJob, command, event }),
    ).rejects.toThrow('injected queue failure before write');

    expect(publisher.all()).toHaveLength(1);
    expect(outbox.all()).toEqual([]);
    await expect(
      jobs.findById({ tenantId: tenant, workspaceId: workspace, scanJobId }),
    ).resolves.toBeNull();
  });

  it('rolls back a partial event append before queue publication', async () => {
    const jobs = new InMemoryScanJobRepository();
    const outbox = new PartiallyFailingOutbox();
    const publisher = new InMemoryQueuePublisher();
    const queue = new InMemoryScanQueueAdapter(
      publisher,
      new InMemoryMetricsRecorder(),
    );
    const adapter = new DirectScanDispatchAdapter(jobs, queue, outbox);

    await expect(
      adapter.storeEnqueuedScan({ job: enqueuedJob, command, event }),
    ).rejects.toThrow('injected outbox failure');

    await expect(
      jobs.findById({ tenantId: tenant, workspaceId: workspace, scanJobId }),
    ).resolves.toBeNull();
    expect(outbox.all()).toEqual([]);
    expect(publisher.all()).toEqual([]);
  });

  it('preserves a pre-existing event when append fails before writing', async () => {
    const jobs = new InMemoryScanJobRepository();
    const outbox = new ToggleFailBeforeOutbox();
    await outbox.append(event);
    outbox.failBeforeAppend = true;
    const publisher = new InMemoryQueuePublisher();
    const queue = new InMemoryScanQueueAdapter(
      publisher,
      new InMemoryMetricsRecorder(),
    );
    const adapter = new DirectScanDispatchAdapter(jobs, queue, outbox);

    await expect(
      adapter.storeEnqueuedScan({ job: enqueuedJob, command, event }),
    ).rejects.toThrow('injected outbox failure before write');

    expect(outbox.all()).toEqual([event]);
    expect(publisher.all()).toEqual([]);
    await expect(
      jobs.findById({ tenantId: tenant, workspaceId: workspace, scanJobId }),
    ).resolves.toBeNull();
  });

  it('preserves upstream records when a published command cannot be rolled back', async () => {
    const jobs = new InMemoryScanJobRepository();
    const outbox = new InMemoryOutboxAdapter();
    const publisher = new RollbackFailingQueuePublisher();
    const queue = new InMemoryScanQueueAdapter(
      publisher,
      new InMemoryMetricsRecorder(),
    );
    const adapter = new DirectScanDispatchAdapter(jobs, queue, outbox);

    await expect(
      adapter.storeEnqueuedScan({ job: enqueuedJob, command, event }),
    ).rejects.toThrow('queue command rollback failed');

    expect(publisher.all()).toHaveLength(1);
    expect(outbox.all()).toEqual([event]);
    await expect(
      jobs.findById({ tenantId: tenant, workspaceId: workspace, scanJobId }),
    ).resolves.toEqual(enqueuedJob);
  });

  it('preserves the job when a partial event cannot be rolled back', async () => {
    const jobs = new InMemoryScanJobRepository();
    const outbox = new RollbackFailingOutbox();
    const publisher = new InMemoryQueuePublisher();
    const queue = new InMemoryScanQueueAdapter(
      publisher,
      new InMemoryMetricsRecorder(),
    );
    const adapter = new DirectScanDispatchAdapter(jobs, queue, outbox);

    await expect(
      adapter.storeEnqueuedScan({ job: enqueuedJob, command, event }),
    ).rejects.toThrow('outbox event rollback failed');

    expect(outbox.all()).toEqual([event]);
    expect(publisher.all()).toEqual([]);
    await expect(
      jobs.findById({ tenantId: tenant, workspaceId: workspace, scanJobId }),
    ).resolves.toEqual(enqueuedJob);
  });

  it('restores the previous job after a partial job write', async () => {
    const jobs = new ToggleFailingScanJobRepository();
    await jobs.save(requestedJob);
    jobs.failAfterSave = true;
    const outbox = new InMemoryOutboxAdapter();
    const publisher = new InMemoryQueuePublisher();
    const queue = new InMemoryScanQueueAdapter(
      publisher,
      new InMemoryMetricsRecorder(),
    );
    const adapter = new DirectScanDispatchAdapter(jobs, queue, outbox);

    await expect(
      adapter.storeEnqueuedScan({ job: enqueuedJob, command, event }),
    ).rejects.toThrow('injected job failure');

    await expect(
      jobs.findById({ tenantId: tenant, workspaceId: workspace, scanJobId }),
    ).resolves.toEqual(requestedJob);
    expect(outbox.all()).toEqual([]);
    expect(publisher.all()).toEqual([]);
  });
});
