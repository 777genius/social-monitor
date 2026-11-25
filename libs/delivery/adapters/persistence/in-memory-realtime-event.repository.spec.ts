import { correlationId, FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { RecordRealtimeEventUseCase } from '../../features/record-realtime-event/record-realtime-event.use-case';
import { InMemoryRealtimeEventRepository } from './in-memory-realtime-event.repository';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `realtime-event-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

describe('InMemoryRealtimeEventRepository', () => {
  it('uses absolute sequence cursors and requires resync when the replay window was trimmed', async () => {
    const repository = new InMemoryRealtimeEventRepository();
    const recorder = new RecordRealtimeEventUseCase(
      repository,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    );
    const tenant = tenantId('tenant-realtime-window');
    const workspace = workspaceId('workspace-realtime-window');
    const channel = 'interest:interest-realtime-window:summary-status';
    let firstCursor = '';
    let latestCursor = '';

    for (let index = 1; index <= 105; index += 1) {
      const result = await recorder.execute({
        tenantId: tenant,
        workspaceId: workspace,
        channel,
        eventType: 'summary.status.changed.v1',
        resourceType: 'summary',
        resourceId: `summary-${index}`,
        correlationId: correlationId(`corr-${index}`),
        payload: { sequence: index },
      });

      if (!result.ok) {
        throw result.error;
      }

      if (index === 1) {
        firstCursor = result.value.replayCursor;
      }

      latestCursor = result.value.replayCursor;
    }

    await expect(repository.nextSequence({ tenantId: tenant, workspaceId: workspace, channel })).resolves.toBe(106);
    await expect(repository.list({
      tenantId: tenant,
      workspaceId: workspace,
      channel,
      limit: 20,
      cursor: firstCursor,
    })).resolves.toEqual({
      events: [],
      resyncRequired: true,
    });

    const currentSnapshot = await repository.list({
      tenantId: tenant,
      workspaceId: workspace,
      channel,
      limit: 5,
    });
    expect(currentSnapshot.resyncRequired).toBe(false);
    expect(currentSnapshot.events[0]?.toSnapshot().sequence).toBe(6);
    expect(currentSnapshot.nextCursor).toEqual(expect.any(String));

    await expect(repository.list({
      tenantId: tenant,
      workspaceId: workspace,
      channel,
      limit: 20,
      cursor: latestCursor,
    })).resolves.toEqual({
      events: [],
      nextCursor: undefined,
      resyncRequired: false,
    });
  });
});
