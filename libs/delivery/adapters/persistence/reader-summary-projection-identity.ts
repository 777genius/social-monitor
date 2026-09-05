import { DomainError } from '@social-monitor/shared-kernel';
import type { ReaderSummaryReadyProjection } from '../../application/contracts/reader-summary-ready-projection-store';
import type { RealtimeEventProps } from '../../domain/entities/realtime-event';

export function assertSameReaderSummaryProjection(existing: RealtimeEventProps, incoming: ReaderSummaryReadyProjection): void {
  if (existing.tenantId !== incoming.tenantId || existing.workspaceId !== incoming.workspaceId ||
      existing.eventType !== incoming.eventType || existing.channel !== incoming.channel ||
      existing.resourceType !== incoming.resourceType || existing.resourceId !== incoming.resourceId ||
      existing.occurredAt.getTime() !== incoming.occurredAt.getTime() ||
      existing.correlationId !== incoming.correlationId ||
      canonical(existing.payload) !== canonical(incoming.payload)) {
    throw new DomainError('validation.failed', 'Reader summary event identity was reused with a different projection');
  }
}
function canonical(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return JSON.stringify(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]));
  }
  return JSON.stringify(value);
}
