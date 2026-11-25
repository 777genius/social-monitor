import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { DeliveryAttempt } from '../../domain';
import { InMemoryDeliveryAttemptRepository } from './in-memory-delivery-attempt.repository';

const now = new Date('2026-10-31T00:00:00.000Z');
const at = (ms: number) => new Date(now.getTime() + ms);
const scope = {
  tenantId: tenantId('tenant-test'), workspaceId: workspaceId('workspace-test'),
  deliveryAttemptId: 'attempt-test',
};

const setup = async () => {
  const repo = new InMemoryDeliveryAttemptRepository();
  await repo.save(DeliveryAttempt.queue({
    id: scope.deliveryAttemptId, ...scope, idempotencyKey: 'stable',
    channel: 'webhook', recipientKey: 'webhook-recipient', resourceType: 'digest',
    resourceId: 'digest-test', queuedAt: now, maxRetries: 2,
  }));
  const created = await repo.workflow.dispatch({
    ...scope, commandId: 'dispatch-1', correlationId: 'correlation-1',
    now, recoverBefore: now,
  });
  expect(created?.enqueued).toBe(true);
  return repo.workflow;
};

describe('in-memory command outbox ownership parity', () => {
  it('extends only matching live claims and rejects stale owners', async () => {
    const store = await setup();
    const claimed = await store.claimPending({
      limit: 1, now, leaseOwner: 'owner-A', leasedUntil: at(300),
    });
    expect(claimed).toHaveLength(1);
    const id = claimed[0]!.id;
    expect(await store.renewClaims({ ids: [id], leaseOwner: 'owner-B',
      now: at(100), leasedUntil: at(400) })).toBe(false);
    expect(await store.renewClaims({ ids: [id], leaseOwner: 'owner-A',
      now: at(100), leasedUntil: at(400) })).toBe(true);
    await store.markPublished({ id, leaseOwner: 'owner-A', publishedAt: at(350) });
    await expect(store.markPublished({ id, leaseOwner: 'owner-A', publishedAt: at(360) }))
      .rejects.toThrow('ownership was lost');
  });

  it('does not settle an expired lease and allows another relay to reclaim', async () => {
    const store = await setup();
    const [claim] = await store.claimPending({ limit: 1, now,
      leaseOwner: 'owner-A', leasedUntil: at(300) });
    expect(claim).toBeDefined();
    await expect(store.markFailed({
      id: claim!.id, leaseOwner: 'owner-A', commandType: 'delivery.attempt.send',
      availableAt: at(500), failedAt: at(301), lastError: 'offline', terminal: false,
    })).rejects.toThrow('ownership was lost');
    const reowned = await store.claimPending({ limit: 1, now: at(301),
      leaseOwner: 'owner-B', leasedUntil: at(600) });
    expect(reowned).toHaveLength(1);
    expect(await store.renewClaims({ ids: [claim!.id], leaseOwner: 'owner-A',
      now: at(302), leasedUntil: at(800) })).toBe(false);
    await store.markPublished({ id: claim!.id, leaseOwner: 'owner-B', publishedAt: at(400) });
  });
});
