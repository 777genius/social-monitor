import { correlationId, eventId, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type { ReaderSummaryReadyEvent } from '@social-monitor/summary/domain/events/reader-summary-ready.event';
import { buildReaderSummaryPeriod } from '@social-monitor/summary/domain/value-objects/reader-summary-period';

export function readerSummaryReadyFixture(): ReaderSummaryReadyEvent {
  return {
    eventId: eventId('00000000-0000-4000-8000-000000009001'),
    eventType: 'reader_summary.ready', schemaVersion: 1,
    occurredAt: new Date('2026-09-04T00:02:00.000Z'),
    tenantId: tenantId('00000000-0000-4000-8000-000000009002'),
    workspaceId: workspaceId('00000000-0000-4000-8000-000000009003'),
    correlationId: correlationId('reader-delivery-fixture'),
    payload: {
      tenantId: tenantId('00000000-0000-4000-8000-000000009002'),
      workspaceId: workspaceId('00000000-0000-4000-8000-000000009003'),
      readerSummaryId: '00000000-0000-4000-8000-000000009004',
      readerSummaryJobId: '00000000-0000-4000-8000-000000009005',
      scope: { type: 'workspace' }, status: 'completed',
      period: buildReaderSummaryPeriod({ cadence: 'daily', timezone: 'UTC',
        startedAt: new Date('2026-09-03T00:00:00.000Z'), endedAt: new Date('2026-09-04T00:00:00.000Z') }),
    },
  };
}
