import { FixedClock, type IdGenerator, correlationId, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { RealtimeEvent } from '../../domain';
import type {
  ListRealtimeEventsQuery,
  ListRealtimeEventsResult,
  RealtimeEventRepositoryPort,
} from '../../ports';
import { RecordRealtimeEventUseCase } from '../record-realtime-event/record-realtime-event.use-case';
import { ListRealtimeEventsUseCase } from './list-realtime-events.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `realtime-event-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class FakeRealtimeEvents implements RealtimeEventRepositoryPort {
  private readonly events = new Map<string, RealtimeEvent[]>();

  async nextSequence(params: Parameters<RealtimeEventRepositoryPort['nextSequence']>[0]): Promise<number> {
    return (this.events.get(scopeKey(params))?.length ?? 0) + 1;
  }

  async append(event: RealtimeEvent): Promise<void> {
    const snapshot = event.toSnapshot();
    const key = scopeKey(snapshot);

    this.events.set(key, [...(this.events.get(key) ?? []), event]);
  }

  async list(query: ListRealtimeEventsQuery): Promise<ListRealtimeEventsResult> {
    if (query.cursor === 'not-base64-json') {
      return {
        events: [],
        resyncRequired: true,
      };
    }

    return {
      events: this.events.get(scopeKey(query)) ?? [],
      nextCursor: undefined,
      resyncRequired: false,
    };
  }
}

describe('ListRealtimeEventsUseCase', () => {
  it('lists tenant-scoped realtime events and signals resync for invalid cursor', async () => {
    const repository = new FakeRealtimeEvents();
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const recorder = new RecordRealtimeEventUseCase(
      repository,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    );
    const list = new ListRealtimeEventsUseCase(repository);

    await recorder.execute({
      tenantId: tenant,
      workspaceId: workspace,
      channel: 'topic:topic-1:summary-status',
      eventType: 'summary.status.changed.v1',
      resourceType: 'summary',
      resourceId: 'summary-1',
      correlationId: correlationId('correlation-1'),
      payload: { status: 'no_signal' },
    });

    const result = await list.execute({
      tenantId: tenant,
      workspaceId: workspace,
      channel: 'topic:topic-1:summary-status',
      limit: 20,
    });
    const invalidCursor = await list.execute({
      tenantId: tenant,
      workspaceId: workspace,
      channel: 'topic:topic-1:summary-status',
      limit: 20,
      cursor: 'not-base64-json',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        events: [
          expect.objectContaining({
            id: 'realtime-event-1',
            protocolVersion: 1,
            eventType: 'summary.status.changed.v1',
            sequence: 1,
            payload: { status: 'no_signal' },
          }),
        ],
        nextCursor: undefined,
        resyncRequired: false,
      },
    });
    expect(invalidCursor).toEqual({
      ok: true,
      value: {
        events: [],
        nextCursor: undefined,
        resyncRequired: true,
      },
    });
  });
});

const scopeKey = (params: { readonly tenantId: string; readonly workspaceId: string; readonly channel: string }): string =>
  `${params.tenantId}:${params.workspaceId}:${params.channel}`;
