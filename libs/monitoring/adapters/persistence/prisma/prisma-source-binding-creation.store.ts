import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import {
  BIND_SOURCE_CREATION_SCOPE,
  type SourceBindingCreationCommit,
  type SourceBindingCreationCommitPort,
} from '../../../application/contracts/source-binding-creation-commit';
import {
  decideSourceBindingCreation,
  replaySourceBindingReceipt,
  validateSourceBindingCreationCommit,
} from '../../../application/source-binding-creation-decision';
import type { BindSourceResult } from '../../../features/bind-source/bind-source.result';
import type { PrismaMonitoringClient } from './prisma-monitoring-client';
import { sourceBindingStatusToPrisma } from './prisma-monitoring-records';

type SourceBindingCreationTx = Pick<
  PrismaMonitoringClient,
  'interest' | 'sourceCatalogEntry' | 'sourceBinding' | 'outboxEvent' | 'idempotencyKey'
>;

export type PrismaSourceBindingCreationClient = {
  $transaction<T>(work: (transaction: SourceBindingCreationTx) => Promise<T>,
    options: { readonly isolationLevel: 'Serializable' }): Promise<T>;
};

export class PrismaSourceBindingCreationStore implements SourceBindingCreationCommitPort {
  constructor(private readonly prisma: PrismaSourceBindingCreationClient) {}

  async commit(params: SourceBindingCreationCommit): Promise<Result<BindSourceResult, DomainError | Error>> {
    const invalid = validateSourceBindingCreationCommit(params);
    if (invalid) return err(invalid);

    // PostgreSQL can report the scoped receipt race as uniqueness rather than
    // serialization contention. Only re-run known receipt collisions.
    for (let resolution = 0; resolution < 3; resolution++) {
      try {
        const result = await withPrismaWriteRetry(() => this.prisma.$transaction(
          (tx) => commitSourceBindingCreation(tx, params), { isolationLevel: 'Serializable' },
        ));
        return ok(result);
      } catch (error) {
        if (isScopedReceiptUniquenessConflict(error)) {
          if (resolution < 2) continue;
          return err(new DomainError('operation.conflict', 'Source binding creation contention could not be resolved'));
        }
        return err(error instanceof Error ? error : new Error('Source binding creation commit failed'));
      }
    }
    return err(new DomainError('operation.conflict', 'Source binding creation contention could not be resolved'));
  }
}

const commitSourceBindingCreation = async (tx: SourceBindingCreationTx,
  params: SourceBindingCreationCommit): Promise<BindSourceResult> => {
  const binding = params.binding.toSnapshot();
  const scope = { tenantId: binding.tenantId, workspaceId: binding.workspaceId };
  const receiptIdentity = { ...scope, scope: BIND_SOURCE_CREATION_SCOPE, key: params.idempotencyKey };
  const receipt = await tx.idempotencyKey.upsert({
    where: { tenantId_workspaceId_scope_key: receiptIdentity },
    update: { expiresAt: null },
    create: { ...receiptIdentity, id: params.receiptId, requestHash: null,
      responsePayload: null, responseStatus: null, expiresAt: null },
  });
  if (receipt.responsePayload !== null && receipt.responsePayload !== undefined) {
    const replay = replaySourceBindingReceipt(receipt.responsePayload);
    if (!replay.ok) throw replay.error;
    return replay.value;
  }

  const interest = await tx.interest.findFirst({
    where: { ...scope, id: binding.interestId, deletedAt: null },
  });
  if (interest === null || interest.status === 'ARCHIVED') {
    throw new DomainError('resource.not_found', 'Interest not found', { interestId: binding.interestId });
  }
  const catalog = await tx.sourceCatalogEntry.findUnique({ where: { providerKey: binding.providerKey } });
  if (catalog === null) {
    throw new DomainError('validation.failed', 'Source catalog entry is missing for source binding provider', {
      providerKey: binding.providerKey,
    });
  }
  const current = await tx.sourceBinding.findFirst({
    where: { ...scope, interestId: binding.interestId, sourceCatalogEntryId: catalog.id,
      deletedAt: null,
      ...(params.configIdentity === undefined ? {} : {
        config: { path: [params.configIdentity.field], equals: params.configIdentity.value },
      }),
    },
  });
  const enabledCount = current !== null || params.maxEnabledSourcesPerInterest === undefined
    ? 0
    : await tx.sourceBinding.count({
        where: { ...scope, interestId: binding.interestId, deletedAt: null, status: 'ENABLED' },
      });
  const decision = decideSourceBindingCreation({
    candidateId: binding.id, existingId: current?.id,
    enabledCount, maximum: params.maxEnabledSourcesPerInterest,
  });
  // Throw inside a Serializable transaction or the reservation/partial state
  // would be committed on rejection.
  if (!decision.ok) throw decision.error;

  if (decision.value.created) {
    await tx.sourceBinding.create({ data: {
      id: binding.id, ...scope, interestId: binding.interestId,
      sourceCatalogEntryId: catalog.id,
      capabilityProfileVersion: binding.capabilityProfileVersion,
      status: sourceBindingStatusToPrisma(binding.status),
      config: binding.config,
    } });
    await tx.outboxEvent.create({ data: {
      id: params.event.eventId, ...scope, messageKind: 'EVENT',
      eventType: params.event.eventType, schemaVersion: params.event.schemaVersion,
      payload: params.event.payload, createdAt: params.event.occurredAt,
      correlationId: params.event.correlationId, causationId: params.event.causationId ?? null,
    } });
  }
  await tx.idempotencyKey.upsert({
    where: { tenantId_workspaceId_scope_key: receiptIdentity },
    update: { responsePayload: decision.value, responseStatus: 200, expiresAt: null },
    create: { ...receiptIdentity, id: receipt.id, requestHash: null,
      responsePayload: decision.value, responseStatus: 200, expiresAt: null },
  });
  return decision.value;
};

const isScopedReceiptUniquenessConflict = (error: unknown): boolean => {
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
