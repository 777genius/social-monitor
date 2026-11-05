import type { ReaderSummaryReadyProjection } from '../../application/contracts/reader-summary-ready-projection-store';
import { readerSummaryReadyFixture } from '../../test-support/reader-summary-ready.fixture';
import { ProjectReaderSummaryReadyEventUseCase } from './project-reader-summary-ready-event.use-case';

describe('ProjectReaderSummaryReadyEventUseCase', () => {
  it('maps the domain event to the minimal authorized durable projection contract', async () => {
    const project = jest.fn(async (projection: ReaderSummaryReadyProjection) => ({
      realtimeEventId: 'fixture-projection', channel: projection.channel, sequence: 1, duplicate: false,
    }));
    const useCase = new ProjectReaderSummaryReadyEventUseCase({ project });
    const event = readerSummaryReadyFixture();
    expect(await useCase.execute({ event })).toMatchObject({ ok: true, value: { duplicate: false } });
    expect(project).toHaveBeenCalledWith({
      sourceEventId: event.eventId, protocolVersion: 1, eventType: 'reader_summary.status.changed.v1',
      tenantId: event.tenantId, workspaceId: event.workspaceId,
      resourceType: 'workspace', resourceId: event.workspaceId,
      channel: `workspace:${event.workspaceId}:summary-status`,
      occurredAt: event.occurredAt, correlationId: event.correlationId,
      payload: { readerSummaryId: event.payload.readerSummaryId, readerSummaryJobId: event.payload.readerSummaryJobId,
        status: 'completed', scope: { type: 'workspace' }, period: {
          ...event.payload.period, startedAt: event.payload.period.startedAt.toISOString(),
          endedAt: event.payload.period.endedAt.toISOString(),
        } },
    });
  });

  it('returns a typed validation failure without calling persistence for an invalid direct command', async () => {
    const project = jest.fn();
    const useCase = new ProjectReaderSummaryReadyEventUseCase({ project });
    expect(await useCase.execute({ event: { ...readerSummaryReadyFixture(), schemaVersion: 2 } }))
      .toMatchObject({ ok: false, error: { code: 'validation.failed' } });
    expect(project).not.toHaveBeenCalled();
  });
});
