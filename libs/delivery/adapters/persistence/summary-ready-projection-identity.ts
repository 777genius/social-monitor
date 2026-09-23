import { createHash } from 'node:crypto';
import { DomainError } from '@social-monitor/shared-kernel';
import { SUMMARY_READY_CONSUMER, type SummaryReadyProjection } from '../../application/contracts/summary-ready-projection-store';
import type { RealtimeEventProps } from '../../domain/entities/realtime-event';

export function summaryReadyReplayId(projection: SummaryReadyProjection): string {
  const hex = createHash('sha256').update(JSON.stringify([
    SUMMARY_READY_CONSUMER, projection.sourceEventId, projection.sourceIdentityHash,
  ])).digest('hex');
  // RFC 9562 version 8: a deterministic, consumer-scoped UUID. Its identity
  // commits the full source fingerprint without changing the public payload.
  const variant = ((parseInt(hex[16]!, 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function assertSameSummaryReadyProjection(existing: RealtimeEventProps, incoming: SummaryReadyProjection): void {
  if (existing.id !== summaryReadyReplayId(incoming) ||
      existing.tenantId !== incoming.tenantId || existing.workspaceId !== incoming.workspaceId ||
      existing.protocolVersion !== incoming.protocolVersion || existing.eventType !== incoming.eventType ||
      existing.channel !== incoming.channel || existing.resourceType !== incoming.resourceType ||
      existing.resourceId !== incoming.resourceId || existing.occurredAt.getTime() !== incoming.occurredAt.getTime() ||
      existing.correlationId !== incoming.correlationId || canonical(existing.payload) !== canonical(incoming.payload)) {
    throw new DomainError('validation.failed', 'Summary ready event identity was reused with a different projection');
  }
}

function canonical(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return JSON.stringify(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]));
  }
  return JSON.stringify(value);
}
