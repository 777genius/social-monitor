import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import {
  SOURCE_BINDING_STATUS_CHANGE_SCOPE,
  type SourceBindingStatusChange,
  type SourceBindingStatusChangeCommitPort,
} from '../../../application/contracts/source-binding-status-change-commit';
import {
  decideSourceBindingStatusChange,
  replaySourceBindingStatusReceipt,
  sourceBindingStatusChangedEvent,
  validateSourceBindingStatusChange,
} from '../../../application/source-binding-status-change-decision';
import type { ChangeSourceBindingStatusResult } from '../../../features/change-source-binding-status/change-source-binding-status.result';
import type { PrismaMonitoringClient } from './prisma-monitoring-client';
import { sourceBindingFromPrisma, sourceBindingStatusToPrisma } from './prisma-monitoring-records';

type StatusChangeTransaction = Pick<PrismaMonitoringClient,
  'sourceBinding' | 'sourceCatalogEntry' | 'outboxEvent' | 'idempotencyKey'>;

export type PrismaSourceBindingStatusChangeClient = {
  $transaction<T>(work: (transaction: StatusChangeTransaction) => Promise<T>,
    options: { readonly isolationLevel: 'Serializable' }): Promise<T>;
};

export class PrismaSourceBindingStatusChangeStore implements SourceBindingStatusChangeCommitPort {
  constructor(private readonly prisma: PrismaSourceBindingStatusChangeClient) {}

  async change(params: SourceBindingStatusChange):
    Promise<Result<ChangeSourceBindingStatusResult, DomainError | Error>> {
    const invalid = validateSourceBindingStatusChange(params);
    if (invalid) return err(invalid);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await withPrismaWriteRetry(() => this.prisma.$transaction(
          (tx) => changeStatus(tx, params), { isolationLevel: 'Serializable' },
        ));
        return ok(result);
      } catch (error) {
        if (isScopedStatusReceiptCollision(error)) {
          if (attempt < 2) continue;
          return err(new DomainError('operation.conflict', 'Source binding status contention could not be resolved'));
        }
        return err(error instanceof Error ? error : new Error('Source binding status change failed'));
      }
    }
    return err(new DomainError('operation.conflict', 'Source binding status contention could not be resolved'));
  }
}

const changeStatus = async (
  tx: StatusChangeTransaction,
  params: SourceBindingStatusChange,
): Promise<ChangeSourceBindingStatusResult> => {
  const command = params.command;
  const scope = { tenantId: command.tenantId, workspaceId: command.workspaceId };
  const receiptIdentity = {
    ...scope, scope: SOURCE_BINDING_STATUS_CHANGE_SCOPE, key: command.idempotencyKey,
  };
  const receipt = await tx.idempotencyKey.upsert({
    where: { tenantId_workspaceId_scope_key: receiptIdentity },
    update: { expiresAt: null },
    create: { ...receiptIdentity, id: params.receiptId, requestHash: null,
      responsePayload: null, responseStatus: null, expiresAt: null },
  });
  if (receipt.responsePayload !== null && receipt.responsePayload !== undefined) {
    const replay = replaySourceBindingStatusReceipt(receipt.responsePayload);
    if (!replay.ok) throw replay.error;
    return replay.value;
  }

  const record = await tx.sourceBinding.findFirst({
    where: { ...scope, interestId: command.interestId,
      id: command.sourceBindingId, deletedAt: null },
  });
  if (record === null) {
    throw new DomainError('resource.not_found', 'Source binding not found for interest', {
      interestId: command.interestId, sourceBindingId: command.sourceBindingId,
    });
  }
  const catalog = await tx.sourceCatalogEntry.findUnique({ where: { id: record.sourceCatalogEntryId } });
  if (catalog === null) {
    throw new DomainError('validation.failed', 'Source catalog entry is missing for persisted source binding', {
      sourceBindingId: record.id, sourceCatalogEntryId: record.sourceCatalogEntryId,
    });
  }
  const binding = sourceBindingFromPrisma(record, catalog);
  const enabledCount = command.status === 'enabled' && record.status !== 'ENABLED' &&
      params.maxEnabledSourcesPerInterest !== undefined
    ? await tx.sourceBinding.count({
        where: { ...scope, interestId: command.interestId, deletedAt: null, status: 'ENABLED' },
      })
    : 0;
  const decision = decideSourceBindingStatusChange({
    binding, desired: command.status,
    enabledCount, maximum: params.maxEnabledSourcesPerInterest,
  });
  // Throw rather than returning err: a rejected transition must also roll
  // back the newly reserved receipt and any concurrent partial writes.
  if (!decision.ok) throw decision.error;

  if (decision.value.result.changed) {
    const changed = await tx.sourceBinding.updateMany({
      where: { ...scope, interestId: command.interestId, id: command.sourceBindingId,
        status: record.status, deletedAt: null },
      data: { status: sourceBindingStatusToPrisma(command.status) },
    });
    if (changed.count !== 1) {
      throw new DomainError('operation.conflict', 'Source binding changed concurrently');
    }

    const event = sourceBindingStatusChangedEvent(params, binding, decision.value.updated);
    await tx.outboxEvent.create({ data: {
      id: event.eventId, ...scope, messageKind: 'EVENT',
      eventType: event.eventType, schemaVersion: event.schemaVersion,
      payload: event.payload, createdAt: event.occurredAt,
      correlationId: event.correlationId, causationId: event.causationId ?? null,
    } });
  }

  await tx.idempotencyKey.upsert({
    where: { tenantId_workspaceId_scope_key: receiptIdentity },
    update: { responsePayload: decision.value.result, responseStatus: 200, expiresAt: null },
    create: { ...receiptIdentity, id: receipt.id, requestHash: null,
      responsePayload: decision.value.result, responseStatus: 200, expiresAt: null },
  });
  return decision.value.result;
};

const isScopedStatusReceiptCollision = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'P2002') return false;
  const meta = (error as { meta?: {
    target?: unknown; driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } };
  } }).meta;
  const target = meta?.target ?? meta?.driverAdapterError?.cause?.constraint?.fields;
  if (typeof target === 'string') return target === 'idempotency_keys_tenant_id_workspace_id_scope_key_key';
  if (!Array.isArray(target) || !target.every((field) => typeof field === 'string')) return false;
  const fields = target.map((field: string) => field.replaceAll('_', '').toLowerCase()).sort().join(',');
  return fields === 'key,scope,tenantid,workspaceid';
};
