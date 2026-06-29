import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { Interest } from '../../../domain';
import type { ArchiveInterestParams, ListInterestsQuery, ListInterestsResult, InterestRepositoryPort } from '../../../ports';
import { encodeOffsetCursor, parseOffsetCursor } from '../offset-pagination';
import type { PrismaMonitoringClient } from './prisma-monitoring-client';
import { interestFromPrisma } from './prisma-monitoring-records';

export class PrismaInterestRepository implements InterestRepositoryPort {
  constructor(private readonly prisma: PrismaMonitoringClient) {}

  async save(interest: Interest): Promise<void> {
    const snapshot = interest.toSnapshot();

    await withPrismaWriteRetry(() => this.prisma.interest.upsert({
      where: { id: snapshot.id },
      update: {
        name: snapshot.name,
        query: snapshot.query,
        status: 'ENABLED',
        deletedAt: null,
      },
      create: {
        id: snapshot.id,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        name: snapshot.name,
        query: snapshot.query,
      },
    }));
  }

  async archive(params: ArchiveInterestParams): Promise<void> {
    await withPrismaWriteRetry(() => this.prisma.interest.updateMany({
      where: {
        id: params.interestId,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        deletedAt: null,
      },
      data: {
        status: 'ARCHIVED',
        deletedAt: params.archivedAt,
      },
    }));
  }

  async findByName(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    name: string;
  }): Promise<Interest | null> {
    const record = await this.prisma.interest.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        name: params.name.trim(),
        deletedAt: null,
      },
    });

    return record === null ? null : interestFromPrisma(record);
  }

  async findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    interestId: string;
  }): Promise<Interest | null> {
    const record = await this.prisma.interest.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.interestId,
        deletedAt: null,
      },
    });

    return record === null ? null : interestFromPrisma(record);
  }

  async list(query: ListInterestsQuery): Promise<ListInterestsResult> {
    const offset = parseOffsetCursor(query.cursor);
    const limit = Math.max(1, Math.min(query.limit, 100));
    const records = await this.prisma.interest.findMany({
      where: {
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: offset,
      take: limit + 1,
    });
    const interests = records.slice(0, limit).map(interestFromPrisma);
    const nextOffset = offset + interests.length;

    return {
      interests,
      nextCursor: records.length > limit ? encodeOffsetCursor(nextOffset) : undefined,
    };
  }
}
