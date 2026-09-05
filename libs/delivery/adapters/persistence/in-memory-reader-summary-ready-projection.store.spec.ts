import { CryptoIdGenerator, workspaceId } from '@social-monitor/shared-kernel';
import { InMemoryRealtimeEventRepository } from './in-memory-realtime-event.repository';
import { InMemoryReaderSummaryReadyProjectionStore } from './in-memory-reader-summary-ready-projection.store';
import { readerSummaryReadyFixture } from '../../test-support/reader-summary-ready.fixture';
import { ProjectReaderSummaryReadyEventUseCase } from '../../features/project-reader-summary-ready-event/project-reader-summary-ready-event.use-case';

function fixture() {
  const events = new InMemoryRealtimeEventRepository();
  return { events, useCase: new ProjectReaderSummaryReadyEventUseCase(
    new InMemoryReaderSummaryReadyProjectionStore(events, new CryptoIdGenerator())) };
}

describe('ReaderSummary ready projection', () => {
  it.each(['completed', 'no_signal'] as const)('records minimal workspace %s state in the existing replay repository', async status => {
    const { events, useCase } = fixture();
    const base = readerSummaryReadyFixture();
    const result = await useCase.execute({ event: { ...base, payload: { ...base.payload, status } } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    const replay = await events.list({ ...base.payload, channel: result.value.channel, limit: 10 });
    expect(replay.events).toHaveLength(1);
    const snapshot = replay.events[0]?.toSnapshot();
    expect(snapshot).toMatchObject({ resourceType: 'workspace', resourceId: base.workspaceId,
      eventType: 'reader_summary.status.changed.v1', sequence: 1,
      payload: { readerSummaryId: base.payload.readerSummaryId, status, scope: { type: 'workspace' } } });
    expect(Object.keys(snapshot?.payload ?? {}).sort()).toEqual(['period', 'readerSummaryId', 'readerSummaryJobId', 'scope', 'status']);
    expect((await events.list({ ...base.payload, workspaceId: workspaceId('00000000-0000-4000-8000-000000009099'),
      channel: result.value.channel, limit: 10 })).events).toHaveLength(0);
  });

  it('uses the authorized interest summary-status lane and consumes concurrent duplicates once', async () => {
    const { events, useCase } = fixture();
    const base = readerSummaryReadyFixture();
    const event = { ...base, payload: { ...base.payload, scope: { type: 'interest' as const, interestId: 'fixture-interest' } } };
    const results = await Promise.all([useCase.execute({ event }), useCase.execute({ event })]);
    expect(results.map(result => result.ok && result.value.duplicate)).toEqual([false, true]);
    const replay = await events.list({ ...base.payload, channel: 'interest:fixture-interest:summary-status', limit: 10 });
    expect(replay.events).toHaveLength(1);
    expect(replay.events[0]?.toSnapshot().resourceType).toBe('interest');
  });

  it('rejects event id reuse with different workspace or status', async () => {
    const { useCase } = fixture();
    const event = readerSummaryReadyFixture();
    expect((await useCase.execute({ event })).ok).toBe(true);
    const otherWorkspace = workspaceId('00000000-0000-4000-8000-000000009099');
    for (const changed of [
      { ...event, workspaceId: otherWorkspace, payload: { ...event.payload, workspaceId: otherWorkspace } },
      { ...event, payload: { ...event.payload, status: 'no_signal' as const } },
    ]) {
      expect(await useCase.execute({ event: changed })).toMatchObject({ ok: false, error: { code: 'validation.failed' } });
    }
  });

  it('validates direct application calls before persistence', async () => {
    const project = jest.fn();
    const useCase = new ProjectReaderSummaryReadyEventUseCase({ project });
    const event = readerSummaryReadyFixture();
    expect(await useCase.execute({ event: { ...event, workspaceId: workspaceId('different') } }))
      .toMatchObject({ ok: false, error: { code: 'validation.failed' } });
    expect(project).not.toHaveBeenCalled();
  });

  it('retries after a failed append without remembering a false processed marker', async () => {
    const { events, useCase } = fixture();
    const event = readerSummaryReadyFixture();
    jest.spyOn(events, 'append').mockRejectedValueOnce(new Error('fixture failed before append'));
    expect((await useCase.execute({ event })).ok).toBe(false);
    expect(await useCase.execute({ event })).toMatchObject({ ok: true, value: { duplicate: false, sequence: 1 } });
  });
});
