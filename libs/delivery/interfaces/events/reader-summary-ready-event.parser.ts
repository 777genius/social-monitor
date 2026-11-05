import { correlationId, eventId, tenantId, workspaceId, DomainError } from '@social-monitor/shared-kernel';
import { assertReaderSummaryCadence } from '@social-monitor/summary/domain/value-objects/reader-summary-period';
import { assertReaderSummaryReadyProjection, type ReaderSummaryReadyProjectionEvent } from '../../domain/reader-summary-ready-projection';

export function parseReaderSummaryReadyEvent(event: Readonly<Record<string, unknown>>): ReaderSummaryReadyProjectionEvent {
  if (event.eventType !== 'reader_summary.ready' || event.schemaVersion !== 1) invalid('eventType/schemaVersion');
  const payload = object(event.payload, 'payload');
  const scope = object(payload.scope, 'scope');
  const period = object(payload.period, 'period');
  if (scope.type !== 'workspace' && scope.type !== 'interest') invalid('scope.type');
  if (scope.type === 'workspace' && scope.interestId !== undefined) invalid('scope.interestId');
  if (payload.status !== 'completed' && payload.status !== 'no_signal') invalid('status');
  const cadence = string(period.cadence, 'cadence');
  try { assertReaderSummaryCadence(cadence); } catch { invalid('cadence'); }
  const parsed: ReaderSummaryReadyProjectionEvent = {
    eventId: eventId(string(event.eventId, 'eventId')),
    eventType: 'reader_summary.ready', schemaVersion: 1,
    occurredAt: date(event.occurredAt, 'occurredAt'),
    tenantId: tenantId(string(event.tenantId, 'tenantId')),
    workspaceId: workspaceId(string(event.workspaceId, 'workspaceId')),
    correlationId: correlationId(string(event.correlationId, 'correlationId')),
    payload: {
      readerSummaryId: string(payload.readerSummaryId, 'readerSummaryId'),
      readerSummaryJobId: string(payload.readerSummaryJobId, 'readerSummaryJobId'),
      tenantId: tenantId(string(payload.tenantId, 'payload.tenantId')),
      workspaceId: workspaceId(string(payload.workspaceId, 'payload.workspaceId')),
      status: payload.status,
      scope: scope.type === 'workspace' ? { type: 'workspace' }
        : { type: 'interest', interestId: string(scope.interestId, 'interestId') },
      period: {
        cadence,
        startedAt: date(period.startedAt, 'period.startedAt'),
        endedAt: date(period.endedAt, 'period.endedAt'),
        timezone: string(period.timezone, 'timezone'),
        periodKey: string(period.periodKey, 'periodKey'),
      },
    },
  };
  assertReaderSummaryReadyProjection(parsed);
  return parsed;
}
function invalid(field: string): never {
  throw new DomainError('validation.failed', `Invalid reader_summary.ready field: ${field}`);
}
function object(value: unknown, field: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(field);
  return value as Readonly<Record<string, unknown>>;
}
function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 300) invalid(field);
  return value;
}
function date(value: unknown, field: string): Date {
  // JSON timestamps must be canonical UTC instants, never locale-dependent dates.
  const parsed = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  if (parsed === null || Number.isNaN(parsed.getTime()) ||
      (typeof value === 'string' && parsed.toISOString() !== value)) invalid(field);
  return parsed;
}
