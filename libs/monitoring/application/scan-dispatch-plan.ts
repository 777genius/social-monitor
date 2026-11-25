import { causationId, correlationId, eventId } from '@social-monitor/shared-kernel';
import { ScanJob, type ScanRequestedEvent } from '../domain';
import type { EnqueueScanCommand, ScanDispatchPort } from '../ports';

// One construction boundary keeps persisted identity, executable intent and the
// optional manual-request event aligned before the dispatch adapter commits them.
export const prepareScanDispatch = (params: {
  readonly command: EnqueueScanCommand;
  readonly idempotencyKey: string;
  readonly requestedAt: Date;
  readonly requestedEventId?: string;
}): Parameters<ScanDispatchPort['storeEnqueuedScan']>[0] => {
  const { command, requestedAt } = params;
  const job = ScanJob.request({
    id: command.scanJobId,
    tenantId: command.tenantId,
    workspaceId: command.workspaceId,
    sourceBindingId: command.sourceBindingId,
    scanPolicyId: command.scanPolicyId,
    idempotencyKey: params.idempotencyKey,
    requestedAt,
  }).markEnqueued({ enqueuedAt: requestedAt });
  if (params.requestedEventId === undefined) return { job, command };

  const event: ScanRequestedEvent = {
    eventId: eventId(params.requestedEventId),
    eventType: 'monitoring.scan.requested',
    schemaVersion: 1,
    occurredAt: requestedAt,
    tenantId: command.tenantId,
    workspaceId: command.workspaceId,
    correlationId: correlationId(command.correlationId),
    causationId: causationId(command.causationId),
    payload: {
      scanJobId: command.scanJobId,
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
      scanPolicyId: command.scanPolicyId,
      providerKey: command.providerKey,
    },
  };
  return { job, command, event };
};
