import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SourceTarget } from '../../../domain';
import type { SourceTargetRepositoryPort } from '../../../ports';
import type { PrismaSubscriptionsClient } from './prisma-subscriptions-client';
import { sourceTargetFromPrisma } from './prisma-subscriptions-records';

export class PrismaSourceTargetRepository implements SourceTargetRepositoryPort {
  constructor(private readonly prisma: PrismaSubscriptionsClient) {}

  async save(target: SourceTarget): Promise<void> {
    const snapshot = target.toSnapshot();

    await withPrismaWriteRetry(() => this.prisma.sourceTarget.upsert({
      where: { id: snapshot.id },
      update: {
        providerKey: snapshot.providerKey,
        targetKind: snapshot.targetKind,
        targetValue: snapshot.targetValue,
        normalizedKey: snapshot.normalizedKey,
        config: snapshot.config,
        updatedAt: snapshot.updatedAt,
      },
      create: {
        id: snapshot.id,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        providerKey: snapshot.providerKey,
        targetKind: snapshot.targetKind,
        targetValue: snapshot.targetValue,
        normalizedKey: snapshot.normalizedKey,
        config: snapshot.config,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      },
    }));
  }

  async findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    sourceTargetId: string;
  }): Promise<SourceTarget | null> {
    const record = await this.prisma.sourceTarget.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.sourceTargetId,
      },
    });

    return record === null ? null : sourceTargetFromPrisma(record);
  }

  async findByNormalizedKey(
    query: Parameters<SourceTargetRepositoryPort['findByNormalizedKey']>[0],
  ): Promise<SourceTarget | null> {
    const record = await this.prisma.sourceTarget.findFirst({
      where: {
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        providerKey: query.providerKey,
        normalizedKey: query.normalizedKey,
      },
    });

    return record === null ? null : sourceTargetFromPrisma(record);
  }
}
