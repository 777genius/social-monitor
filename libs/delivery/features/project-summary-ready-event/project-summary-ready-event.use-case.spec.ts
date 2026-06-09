import {
  FixedClock,
  type IdGenerator,
  causationId,
  correlationId,
  eventId,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import type { RealtimeEvent } from '../../domain';
import type {
  ListRealtimeEventsQuery,
  ListRealtimeEventsResult,
  RealtimeEventRepositoryPort,
} from '../../ports';
import { RecordRealtimeEventUseCase } from '../record-realtime-event/record-realtime-event.use-case';
import { ProjectSummaryReadyEventUseCase } from './project-summary-ready-event.use-case';

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
    return {
      events: this.events.get(scopeKey(query)) ?? [],
      nextCursor: undefined,
      resyncRequired: false,
    };
  }
}

describe('ProjectSummaryReadyEventUseCase', () => {
  it('projects summary.ready into a topic summary status realtime event', async () => {
    const repository = new FakeRealtimeEvents();
    const result = await new ProjectSummaryReadyEventUseCase(
      new RecordRealtimeEventUseCase(
        repository,
        new SequenceIdGenerator(),
        new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
      ),
    ).execute({
      event: {
        eventId: eventId('summary-ready-event-1'),
        eventType: 'summary.ready',
        schemaVersion: 1,
        occurredAt: new Date('2026-06-06T00:00:00.000Z'),
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        correlationId: correlationId('correlation-1'),
        causationId: causationId('summary-job-1'),
        payload: {
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          topicId: 'topic-1',
          summaryJobId: 'summary-job-1',
          summaryId: 'summary-1',
          status: 'no_signal',
        },
      },
    });
    const replay = await repository.list({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      channel: 'topic:topic-1:summary-status',
      limit: 20,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        realtimeEventId: 'realtime-event-1',
        channel: 'topic:topic-1:summary-status',
        sequence: 1,
      },
    });
    expect(replay.events[0]?.toSnapshot()).toMatchObject({
      eventType: 'summary.status.changed.v1',
      resourceType: 'summary',
      resourceId: 'summary-1',
      payload: {
        summaryJobId: 'summary-job-1',
        summaryId: 'summary-1',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        topicId: 'topic-1',
        status: 'no_signal',
      },
    });
  });
});

const scopeKey = (params: { readonly tenantId: string; readonly workspaceId: string; readonly channel: string }): string =>
  `${params.tenantId}:${params.workspaceId}:${params.channel}`;
