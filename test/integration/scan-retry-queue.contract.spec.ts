import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { CryptoIdGenerator, FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { InMemoryScanFailureQueueAdapter } from '@social-monitor/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { PrismaScanFailureQueueAdapter } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-failure-queue.adapter';
import type { PrismaScanFailureQueueEntryRecord } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-ingestion-records';
import type { RetryScanCommand, ScanRetryQueuePort, ScanFailureInspectionPort, ScanFailureQueuePort } from '@social-monitor/ingestion/ports';

import { createScanFailureQueueFixture } from '../../scripts/support/scan-failure-queue-fixture';

const scope = {
  tenantId: tenantId('00000000-0000-7000-8000-000000000101'),
  workspaceId: workspaceId('00000000-0000-7000-8000-000000000102'),
};
const command: RetryScanCommand = {
  ...scope, scanJobId: '00000000-0000-7000-8000-000000000103',
  interestId: 'topic-sandbox', sourceBindingId: 'binding-sandbox', scanPolicyId: 'policy-sandbox',
  providerKey: 'fake-source', sourceQuery: { mode: 'search', query: 'sandbox retries' },
  correlationId: 'correlation-sandbox', causationId: 'causation-sandbox',
  attemptNumber: 1, nextAttemptNumber: 2, retryBudget: 3, failureReason: 'Provider unavailable',
};
type Queue = ScanRetryQueuePort & ScanFailureInspectionPort & ScanFailureQueuePort;
const factories: Record<string, () => Queue> = {
  'in-memory': () => new InMemoryScanFailureQueueAdapter(new InMemoryMetricsRecorder()),
  prisma: () => {
    const records: PrismaScanFailureQueueEntryRecord[] = [];
    const scanFailureQueueEntry = createScanFailureQueueFixture(records, new FixedClock(new Date(0)));
    return new PrismaScanFailureQueueAdapter({ scanFailureQueueEntry }, new InMemoryMetricsRecorder(), new CryptoIdGenerator());
  },
};
const claim = (queue: ScanRetryQueuePort, milliseconds = 0) => queue.claimRetries({
  now: new Date(milliseconds), limit: 5, visibilityTimeoutSeconds: 300,
});

describe.each(Object.entries(factories))('%s acknowledged scan retry contract', (_, create) => {
  it('keeps a claimed row durable and unavailable until acknowledged', async () => {
    const queue = create();
    await queue.enqueueRetry(command);
    const deliveries = await claim(queue);
    expect(deliveries.map((delivery) => delivery.command)).toEqual([command]);
    expect(await claim(queue, 1000)).toHaveLength(0);
    await deliveries[0]!.ack();
    expect(await claim(queue, 300_001)).toHaveLength(0);
  });

  it('releases work on shutdown and preserves explicit dead letters', async () => {
    const queue = create();
    await queue.enqueueRetry(command);
    const first = (await claim(queue))[0]!;
    await first.nack({ requeue: true });
    const replacement = (await claim(queue, 1000))[0]!;
    expect(replacement.command).toEqual(command);
    await replacement.nack({ requeue: false });
    expect(await claim(queue, 300_001)).toHaveLength(0);
    expect(await queue.listDeadLetters({ ...scope, limit: 5 })).toMatchObject([
      { scanJobId: command.scanJobId, tenantId: command.tenantId, workspaceId: command.workspaceId,
        failureReason: command.failureReason, attemptNumber: command.attemptNumber },
    ]);
    expect(await queue.listDeadLetters({ ...scope, tenantId: tenantId('00000000-0000-7000-8000-000000000999'), limit: 5 })).toEqual([]);
  });

  it('recovers an expired claim and fences stale acknowledgement, release, and renewal', async () => {
    const queue = create();
    await queue.enqueueRetry(command);
    const stale = (await claim(queue))[0]!;
    const current = (await claim(queue, 300_000))[0]!;
    expect(current.command).toEqual(command);
    expect(await stale.renew(new Date(300_001))).toBe(false);
    await stale.ack();
    await stale.nack({ requeue: true });
    await stale.nack({ requeue: false });
    expect(await claim(queue, 300_002)).toHaveLength(0);
    await current.nack({ requeue: true });
    expect(await claim(queue, 300_003)).toHaveLength(1);
    expect(await queue.listDeadLetters({ ...scope, limit: 5 })).toEqual([]);
  });

  it('extends a healthy owner beyond the original expiration', async () => {
    const queue = create();
    await queue.enqueueRetry(command);
    const owner = (await claim(queue))[0]!;
    expect(await owner.renew(new Date(240_000))).toBe(true);
    expect(await claim(queue, 300_001)).toHaveLength(0);
    expect(await owner.renew(new Date(540_000))).toBe(false);
    expect(await claim(queue, 540_000)).toHaveLength(1);
  });

  it('gives simultaneous claimants only one owner', async () => {
    const queue = create();
    await queue.enqueueRetry(command);
    const batches = await Promise.all([claim(queue), claim(queue)]);
    expect(batches.flat()).toHaveLength(1);
  });

  it('records each failure command idempotently during redelivery', async () => {
    const queue = create();
    await queue.enqueueRetry(command);
    await queue.enqueueRetry(command);
    expect(await claim(queue)).toHaveLength(1);
    await queue.deadLetter(command);
    await queue.deadLetter(command);
    expect(await queue.listDeadLetters({ ...scope, limit: 5 })).toHaveLength(1);
  });
});
