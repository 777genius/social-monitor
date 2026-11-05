import { DomainError, type EventEnvelope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';
import { assertReaderSummaryPeriod, type ReaderSummaryPeriod } from '@social-monitor/summary/domain/value-objects/reader-summary-period';
import type { ReaderSummaryScope } from '@social-monitor/summary/domain/value-objects/reader-summary-scope';

export type ReaderSummaryReadyProjectionPayload = {
  readonly readerSummaryId: string;
  readonly readerSummaryJobId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly status: 'completed' | 'no_signal';
  readonly scope: ReaderSummaryScope;
  readonly period: ReaderSummaryPeriod;
};
export type ReaderSummaryReadyProjectionEvent = EventEnvelope<ReaderSummaryReadyProjectionPayload>;

export function assertReaderSummaryReadyProjection(event: ReaderSummaryReadyProjectionEvent): void {
  const payload = event.payload;
  if (event.eventType !== 'reader_summary.ready' || event.schemaVersion !== 1 ||
      event.tenantId !== payload.tenantId || event.workspaceId !== payload.workspaceId ||
      !payload.tenantId || !payload.workspaceId ||
      !event.eventId || !event.correlationId || Number.isNaN(event.occurredAt.getTime()) ||
      !payload.readerSummaryId.trim() || !payload.readerSummaryJobId.trim() ||
      !['completed', 'no_signal'].includes(payload.status) ||
      !['workspace', 'interest'].includes(payload.scope.type) ||
      (payload.scope.type === 'interest' && !payload.scope.interestId.trim())) {
    throw new DomainError('validation.failed', 'Invalid reader_summary.ready identity, scope or status');
  }
  try {
    assertReaderSummaryPeriod(payload.period);
  } catch {
    throw new DomainError('validation.failed', 'Invalid reader_summary.ready period');
  }
}
