import type { IdGenerator, TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { IdempotencyPort, IdempotencyRecord } from '../../../ports';
import type { PrismaMonitoringClient } from '../../persistence/prisma/prisma-monitoring-client';

export class PrismaIdempotencyAdapter implements IdempotencyPort {
  constructor(
    private readonly prisma: PrismaMonitoringClient,
    private readonly idGenerator: IdGenerator,
  ) {}

  async get<TValue>(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    scope: string;
    key: string;
  }): Promise<IdempotencyRecord<TValue> | null> {
    const record = await this.prisma.idempotencyKey.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        scope: params.scope,
        key: params.key,
      },
    });

    if (record === null || record.responsePayload === null || record.responsePayload === undefined) {
      return null;
    }

    return { value: record.responsePayload as TValue };
  }

  async set<TValue>(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    scope: string;
    key: string;
    value: TValue;
  }): Promise<void> {
    await this.prisma.idempotencyKey.upsert({
      where: {
        tenantId_workspaceId_scope_key: {
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          scope: params.scope,
          key: params.key,
        },
      },
      update: {
        responsePayload: params.value,
        responseStatus: 200,
        expiresAt: null,
      },
      create: {
        id: this.idGenerator.generate(),
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        scope: params.scope,
        key: params.key,
        requestHash: null,
        responsePayload: params.value,
        responseStatus: 200,
        expiresAt: null,
      },
    });
  }
}
