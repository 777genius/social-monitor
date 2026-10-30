import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import { INTEREST_CREATION_SCOPE, type InterestCreationCommit, type InterestCreationCommitPort,
  type InterestCreationResult } from '../../../application/contracts/interest-creation-commit';
import { decideInterestCreation, replayInterestCreation, validateInterestCreationCommit } from '../../../application/interest-creation-decision';
import type { PrismaMonitoringClient } from './prisma-monitoring-client';

export type PrismaInterestCreationTransaction = Pick<PrismaMonitoringClient, 'interest' | 'outboxEvent' | 'idempotencyKey'>;
export type PrismaInterestCreationClient = {
  $transaction<T>(work: (transaction: PrismaInterestCreationTransaction) => Promise<T>,
    options: { readonly isolationLevel: 'Serializable' }): Promise<T>;
};

export class PrismaInterestCreationStore implements InterestCreationCommitPort {
  constructor(private readonly prisma: PrismaInterestCreationClient) {}

  async commit(params: InterestCreationCommit): Promise<Result<InterestCreationResult, DomainError | Error>> {
    const invalid = validateInterestCreationCommit(params);
    if (invalid) return err(invalid);
    // PostgreSQL may report a unique-name race as P2002 instead of a
    // serialization conflict. Resolve only these known scoped constraints in a
    // fresh transaction; arbitrary uniqueness failures are never success.
    for (let resolution = 0; resolution < 3; resolution++) {
      try {
        const result = await withPrismaWriteRetry(() => this.prisma.$transaction(
          (transaction) => commitInterestCreation(transaction, params), { isolationLevel: 'Serializable' },
        ));
        return ok(result);
      } catch (error) {
        if (isScopedCreationUniquenessConflict(error)) {
          if (resolution < 2) continue;
          return err(new DomainError('operation.conflict', 'Interest creation contention could not be resolved'));
        }
        return err(error instanceof Error ? error : new Error('Interest creation commit failed'));
      }
    }
    return err(new DomainError('operation.conflict', 'Interest creation contention could not be resolved'));
  }
}

const commitInterestCreation = async (transaction: PrismaInterestCreationTransaction,
  params: InterestCreationCommit): Promise<InterestCreationResult> => {
  const interest = params.interest.toSnapshot();
  const scope = { tenantId: interest.tenantId, workspaceId: interest.workspaceId };
  const receiptIdentity = { ...scope, scope: INTEREST_CREATION_SCOPE, key: params.idempotencyKey };
  const receipt = await transaction.idempotencyKey.upsert({
    where: { tenantId_workspaceId_scope_key: receiptIdentity },
    update: { expiresAt: null },
    create: { ...receiptIdentity, id: params.receiptId, requestHash: null,
      responsePayload: null, responseStatus: null, expiresAt: null },
  });
  if (receipt.responsePayload !== null && receipt.responsePayload !== undefined) {
    const replay = replayInterestCreation(receipt.responsePayload);
    if (!replay.ok) throw replay.error;
    return replay.value;
  }
  const existing = await transaction.interest.findFirst({ where: { ...scope, name: interest.name } });
  const decision = decideInterestCreation({
    candidateId: interest.id,
    existing: existing ? { id: existing.id, archived: existing.deletedAt != null || existing.status === 'ARCHIVED' } : undefined,
    activeCount: existing || params.maxInterestsPerWorkspace === undefined ? 0 :
      await transaction.interest.count({ where: { ...scope, deletedAt: null } }),
    maximum: params.maxInterestsPerWorkspace,
  });
  // Throwing inside the callback is essential: returning err here would commit
  // the incomplete receipt reservation instead of rolling back all writes.
  if (!decision.ok) throw decision.error;
  if (decision.value.created) {
    await transaction.interest.create({ data: interest });
    await transaction.outboxEvent.create({ data: {
      id: params.event.eventId, ...scope, messageKind: 'EVENT', eventType: params.event.eventType,
      schemaVersion: params.event.schemaVersion, payload: params.event.payload,
      createdAt: params.event.occurredAt,
      correlationId: params.event.correlationId, causationId: params.event.causationId ?? null,
    } });
  }
  await transaction.idempotencyKey.upsert({
    where: { tenantId_workspaceId_scope_key: receiptIdentity },
    update: { responsePayload: decision.value, responseStatus: 200, expiresAt: null },
    create: { ...receiptIdentity, id: receipt.id, requestHash: null,
      responsePayload: decision.value, responseStatus: 200, expiresAt: null },
  });
  return decision.value;
};

const isScopedCreationUniquenessConflict = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'P2002') return false;
  const meta = (error as { meta?: { target?: unknown; driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } } } }).meta;
  const target = meta?.target ?? meta?.driverAdapterError?.cause?.constraint?.fields;
  if (typeof target === 'string') return [
    'interests_tenant_id_workspace_id_name_key', 'idempotency_keys_tenant_id_workspace_id_scope_key_key',
  ].includes(target);
  if (!Array.isArray(target) || !target.every((field) => typeof field === 'string')) return false;
  const fields = target.map((field: string) => field.replaceAll('_', '').toLowerCase()).sort().join(',');
  return fields === 'name,tenantid,workspaceid' || fields === 'key,scope,tenantid,workspaceid';
};
