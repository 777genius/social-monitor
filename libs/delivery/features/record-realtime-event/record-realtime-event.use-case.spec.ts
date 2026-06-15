import {
  correlationId,
  FixedClock,
  type IdGenerator,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import type { RealtimeEvent } from '../../domain';
import {
  RealtimeEventSequenceConflictError,
  type ListRealtimeEventsQuery,
  type ListRealtimeEventsResult,
  type RealtimeEventRepositoryPort,
} from '../../ports';
import { RecordRealtimeEventUseCase } from './record-realtime-event.use-case';

class FixedIdGenerator implements IdGenerator {
  generate(): string {
    return 'realtime-event-1';
  }
}

class FakeRealtimeEvents implements RealtimeEventRepositoryPort {
  readonly events: RealtimeEvent[] = [];

  async nextSequence(): Promise<number> {
    return 42;
  }

  async append(event: RealtimeEvent): Promise<void> {
    this.events.push(event);
  }

  async list(_query: ListRealtimeEventsQuery): Promise<ListRealtimeEventsResult> {
    return {
      events: this.events,
      nextCursor: undefined,
      resyncRequired: false,
    };
  }
}

class SequenceConflictOnceRealtimeEvents implements RealtimeEventRepositoryPort {
  readonly events: RealtimeEvent[] = [];
  private nextSequenceCalls = 0;
  private appendCalls = 0;

  async nextSequence(): Promise<number> {
    this.nextSequenceCalls += 1;
    return this.nextSequenceCalls;
  }

  async append(event: RealtimeEvent): Promise<void> {
    this.appendCalls += 1;

    if (this.appendCalls === 1) {
      throw new RealtimeEventSequenceConflictError();
    }

    this.events.push(event);
  }

  async list(_query: ListRealtimeEventsQuery): Promise<ListRealtimeEventsResult> {
    return {
      events: this.events,
      nextCursor: undefined,
      resyncRequired: false,
    };
  }
}

describe('RecordRealtimeEventUseCase', () => {
  it('records an append-only realtime event with a replay cursor', async () => {
    const realtimeEvents = new FakeRealtimeEvents();

    const result = await new RecordRealtimeEventUseCase(
      realtimeEvents,
      new FixedIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    ).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      channel: 'workspace:workspace-1',
      eventType: 'summary.ready.v1',
      resourceType: 'summary',
      resourceId: 'summary-1',
      correlationId: correlationId('corr-1'),
      payload: { summaryId: 'summary-1' },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        eventId: 'realtime-event-1',
        sequence: 42,
        replayCursor: Buffer.from(JSON.stringify({ afterSequence: 42 })).toString('base64url'),
      },
    });
    expect(realtimeEvents.events[0]?.toSnapshot()).toMatchObject({
      id: 'realtime-event-1',
      sequence: 42,
      occurredAt: new Date('2026-06-06T00:00:00.000Z'),
      payload: { summaryId: 'summary-1' },
    });
  });

  it('retries append when persistence reports a realtime sequence conflict', async () => {
    const realtimeEvents = new SequenceConflictOnceRealtimeEvents();

    const result = await new RecordRealtimeEventUseCase(
      realtimeEvents,
      new FixedIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    ).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      channel: 'workspace:workspace-1',
      eventType: 'summary.ready.v1',
      resourceType: 'summary',
      resourceId: 'summary-1',
      correlationId: correlationId('corr-1'),
      payload: { summaryId: 'summary-1' },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        eventId: 'realtime-event-1',
        sequence: 2,
        replayCursor: Buffer.from(JSON.stringify({ afterSequence: 2 })).toString('base64url'),
      },
    });
    expect(realtimeEvents.events).toHaveLength(1);
    expect(realtimeEvents.events[0]?.toSnapshot().sequence).toBe(2);
  });

  it('rejects blank realtime channels before appending', async () => {
    const realtimeEvents = new FakeRealtimeEvents();

    await expect(new RecordRealtimeEventUseCase(
      realtimeEvents,
      new FixedIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    ).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      channel: ' ',
      eventType: 'summary.ready.v1',
      resourceType: 'summary',
      resourceId: 'summary-1',
      correlationId: correlationId('corr-1'),
      payload: {},
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
      }),
    });
    expect(realtimeEvents.events).toHaveLength(0);
  });
});
