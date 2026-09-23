import { FixedClock, type IdGenerator, causationId, correlationId, eventId, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { InMemoryRealtimeEventRepository } from './in-memory-realtime-event.repository';
import { InMemorySummaryReadyProjectionStore } from './in-memory-summary-ready-projection.store';
import type { RealtimeEvent } from '../../domain';
import { RecordRealtimeEventUseCase } from '../../features/record-realtime-event/record-realtime-event.use-case';
import type { ProjectSummaryReadyEventCommand } from '../../features/project-summary-ready-event/project-summary-ready-event.command';
import { ProjectSummaryReadyEventUseCase } from '../../features/project-summary-ready-event/project-summary-ready-event.use-case';

class SequenceIds implements IdGenerator {
  private next = 1;
  generate(): string { return `realtime-event-${this.next++}`; }
}

function fixture() {
  const events = new InMemoryRealtimeEventRepository();
  const ids = new SequenceIds();
  const published: RealtimeEvent[] = [];
  const fanout = { publish: jest.fn(async (event: RealtimeEvent) => { published.push(event); }) };
  const useCase = new ProjectSummaryReadyEventUseCase(new InMemorySummaryReadyProjectionStore(events), fanout);
  const event: ProjectSummaryReadyEventCommand['event'] = {
    eventId: eventId('summary-ready-event-1'), eventType: 'summary.ready', schemaVersion: 1,
    occurredAt: new Date('2026-06-06T00:00:00.000Z'), tenantId: tenantId('tenant-1'),
    workspaceId: workspaceId('workspace-1'), correlationId: correlationId('correlation-1'),
    causationId: causationId('summary-job-1'),
    payload: { tenantId: tenantId('tenant-1'), workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-1', summaryJobId: 'summary-job-1', summaryId: 'summary-1', status: 'no_signal' },
  };
  const list = () => events.list({ tenantId: event.tenantId, workspaceId: event.workspaceId,
    channel: 'interest:interest-1:summary-status', limit: 20 });
  return { events, ids, fanout, published, useCase, event, list };
}

describe('ProjectSummaryReadyEventUseCase', () => {
  it('projects concurrent duplicates once and republishes their stable identity', async () => {
    const { useCase, event, list, published } = fixture();
    const [first, second] = await Promise.all([useCase.execute({ event }), useCase.execute({ event })]);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ ok: true, value: { realtimeEventId: expect.stringMatching(/^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/), sequence: 1 } });
    expect((await list()).events).toHaveLength(1);
    expect(published.map(item => item.toSnapshot().id)).toEqual([first.ok && first.value.realtimeEventId, first.ok && first.value.realtimeEventId]);
    expect(published.map(item => item.toSnapshot().sequence)).toEqual([1, 1]);
    expect((await list()).events[0]?.toSnapshot()).toMatchObject({ eventType: 'summary.status.changed.v1',
      resourceType: 'summary', resourceId: 'summary-1', payload: { summaryJobId: 'summary-job-1',
        tenantId: tenantId('tenant-1'), workspaceId: workspaceId('workspace-1'), status: 'no_signal' } });
  });

  it('retries after append fails and does not remember a false marker', async () => {
    const { events, useCase, event, list } = fixture();
    jest.spyOn(events, 'append').mockRejectedValueOnce(new Error('fixture failed before append'));
    expect((await useCase.execute({ event })).ok).toBe(false);
    expect(await useCase.execute({ event })).toMatchObject({ ok: true, value: { sequence: 1 } });
    expect((await list()).events).toHaveLength(1);
  });

  it('recovers the committed identity on redelivery after fanout loss', async () => {
    const { useCase, event, fanout, list } = fixture();
    fanout.publish.mockRejectedValueOnce(new Error('fixture fanout failure'));
    const first = await useCase.execute({ event });
    const replay = await useCase.execute({ event });
    expect(replay).toEqual(first);
    expect((await list()).events).toHaveLength(1);
    expect(fanout.publish).toHaveBeenCalledTimes(2);
    expect(fanout.publish.mock.calls[0]?.[0].toSnapshot().id).toBe(fanout.publish.mock.calls[1]?.[0].toSnapshot().id);
  });

  it('rejects reused identity with changed tenant, workspace, or payload', async () => {
    const { useCase, event, list, fanout } = fixture();
    expect((await useCase.execute({ event })).ok).toBe(true);
    const changes = [
      { ...event, tenantId: tenantId('tenant-2'), payload: { ...event.payload, tenantId: tenantId('tenant-2') } },
      { ...event, workspaceId: workspaceId('workspace-2'), payload: { ...event.payload, workspaceId: workspaceId('workspace-2') } },
      { ...event, payload: { ...event.payload, status: 'completed' as const } },
      { ...event, payload: { ...event.payload, userId: 'different-user' } },
      { ...event, causationId: causationId('different-job') },
    ];
    for (const changed of changes) {
      expect(await useCase.execute({ event: changed })).toMatchObject({ ok: false, error: { code: 'validation.failed' } });
    }
    expect((await list()).events).toHaveLength(1);
    expect(fanout.publish).toHaveBeenCalledTimes(1);
  });

  it('serializes distinct events on one channel and leaves ordinary record behavior intact', async () => {
    const { useCase, event, list, events, ids } = fixture();
    const second = { ...event, eventId: eventId('summary-ready-event-2') };
    const results = await Promise.all([useCase.execute({ event }), useCase.execute({ event: second })]);
    expect(results.map(result => result.ok && result.value.sequence)).toEqual([1, 2]);
    expect(results.every(result => result.ok)).toBe(true);
    if (!results[0]?.ok || !results[1]?.ok) throw new Error('fixture projection failed');
    expect(results[0].value.realtimeEventId).not.toBe(results[1].value.realtimeEventId);
    expect(await useCase.execute({ event: second })).toEqual(results[1]);
    expect((await list()).events.map(item => item.toSnapshot().id)).toEqual([
      results[0].value.realtimeEventId, results[1].value.realtimeEventId,
    ]);
    expect((await list()).events).toHaveLength(2);
    const record = new RecordRealtimeEventUseCase(events, ids, new FixedClock(event.occurredAt));
    expect(await record.execute({ tenantId: event.tenantId, workspaceId: event.workspaceId,
      channel: 'interest:interest-1:summary-status', eventType: 'other.v1', resourceType: 'summary',
      resourceId: 'summary-3', correlationId: event.correlationId, payload: {} }))
      .toMatchObject({ ok: true, value: { sequence: 3 } });
  });

});
