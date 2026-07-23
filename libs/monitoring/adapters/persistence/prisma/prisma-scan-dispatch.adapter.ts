import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';

import type { ScanJobStatus } from '../../../domain';
import type { ScanDispatchPort } from '../../../ports';
import type { PrismaMonitoringClient } from './prisma-monitoring-client';

type PrismaScanDispatchClient = Pick<
  PrismaMonitoringClient,
  '$transaction' | 'scanJob' | 'outboxEvent'
>;

export class PrismaScanDispatchAdapter implements ScanDispatchPort {
  constructor(private readonly prisma: PrismaScanDispatchClient) {}

  async storeEnqueuedScan(
    params: Parameters<ScanDispatchPort['storeEnqueuedScan']>[0],
  ): Promise<void> {
    const snapshot = params.job.toSnapshot();
    const status = scanJobStatusToPrisma(snapshot.status);

    await withPrismaWriteRetry(() =>
      this.prisma.$transaction(
        async (transaction) => {
          await transaction.scanJob.upsert({
            where: { id: snapshot.id },
            update: {
              status,
              idempotencyKey: snapshot.idempotencyKey,
              requestedAt: snapshot.requestedAt,
              enqueuedAt: snapshot.enqueuedAt ?? null,
              completedAt: snapshot.completedAt ?? null,
              failureReason: snapshot.failureReason ?? null,
              failureMetadata: snapshot.failureMetadata ?? null,
              executionMetadata: snapshot.executionMetadata ?? null,
            },
            create: {
              id: snapshot.id,
              tenantId: snapshot.tenantId,
              workspaceId: snapshot.workspaceId,
              sourceBindingId: snapshot.sourceBindingId,
              scanPolicyId: snapshot.scanPolicyId,
              status,
              idempotencyKey: snapshot.idempotencyKey,
              requestedAt: snapshot.requestedAt,
              enqueuedAt: snapshot.enqueuedAt ?? null,
              completedAt: snapshot.completedAt ?? null,
              failureReason: snapshot.failureReason ?? null,
              failureMetadata: snapshot.failureMetadata ?? null,
              executionMetadata: snapshot.executionMetadata ?? null,
            },
          });

          if (params.event !== undefined) {
            await transaction.outboxEvent.create({
              data: {
                id: params.event.eventId,
                tenantId: params.event.tenantId ?? null,
                workspaceId: params.event.workspaceId ?? null,
                messageKind: 'EVENT',
                eventType: params.event.eventType,
                schemaVersion: params.event.schemaVersion,
                payload: params.event.payload,
                correlationId: params.event.correlationId,
                causationId: params.event.causationId ?? null,
              },
            });
          }

          await transaction.outboxEvent.create({
            data: {
              id: params.command.scanJobId,
              tenantId: params.command.tenantId,
              workspaceId: params.command.workspaceId,
              messageKind: 'COMMAND',
              eventType: 'ingestion.scan.execute',
              schemaVersion: 1,
              payload: scanCommandPayload(params.command),
              correlationId: params.command.correlationId,
              causationId: params.command.causationId,
            },
          });
        },
        { isolationLevel: 'Serializable' },
      ),
    );
  }
}

const scanJobStatusToPrisma = (
  status: ScanJobStatus,
): 'REQUESTED' | 'ENQUEUED' | 'SUCCEEDED' | 'FAILED' => {
  switch (status) {
    case 'requested':
      return 'REQUESTED';
    case 'enqueued':
      return 'ENQUEUED';
    case 'succeeded':
      return 'SUCCEEDED';
    case 'failed':
      return 'FAILED';
  }
};

const scanCommandPayload = (
  command: Parameters<ScanDispatchPort['storeEnqueuedScan']>[0]['command'],
): Readonly<Record<string, unknown>> => ({
  tenantId: command.tenantId,
  workspaceId: command.workspaceId,
  scanJobId: command.scanJobId,
  interestId: command.interestId,
  sourceBindingId: command.sourceBindingId,
  scanPolicyId: command.scanPolicyId,
  providerKey: command.providerKey,
  sourceQuery: command.sourceQuery,
  retryBudget: command.retryBudget,
});
