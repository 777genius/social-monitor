import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SummaryJob } from '../../../domain';
import type { SummaryJobRepositoryPort } from '../../../ports';
import type { PrismaSummaryClient } from './prisma-summary-client';
import { summaryJobFromPrisma, summaryJobStatusToPrisma } from './prisma-summary-records';

export class PrismaSummaryJobRepository implements SummaryJobRepositoryPort {
  constructor(private readonly prisma: PrismaSummaryClient) {}

  async save(job: SummaryJob): Promise<void> {
    const snapshot = job.toSnapshot();
    const status = summaryJobStatusToPrisma(snapshot.status);

    await this.prisma.summaryJob.upsert({
      where: { id: snapshot.id },
      update: {
        status,
        idempotencyKey: snapshot.idempotencyKey,
        requestedAt: snapshot.requestedAt,
        startedAt: snapshot.startedAt ?? null,
        completedAt: snapshot.completedAt ?? null,
        failedAt: snapshot.failedAt ?? null,
        summaryArtifactId: snapshot.summaryId ?? null,
        failureReason: snapshot.failureReason ?? null,
      },
      create: {
        id: snapshot.id,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        topicId: snapshot.topicId,
        status,
        idempotencyKey: snapshot.idempotencyKey,
        requestedAt: snapshot.requestedAt,
        startedAt: snapshot.startedAt ?? null,
        completedAt: snapshot.completedAt ?? null,
        failedAt: snapshot.failedAt ?? null,
        summaryArtifactId: snapshot.summaryId ?? null,
        failureReason: snapshot.failureReason ?? null,
      },
    });
  }

  async findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    summaryJobId: string;
  }): Promise<SummaryJob | null> {
    const record = await this.prisma.summaryJob.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.summaryJobId,
      },
    });

    return record === null ? null : summaryJobFromPrisma(record);
  }

  async findByIdempotencyKey(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    idempotencyKey: string;
  }): Promise<SummaryJob | null> {
    const record = await this.prisma.summaryJob.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        idempotencyKey: params.idempotencyKey,
      },
    });

    return record === null ? null : summaryJobFromPrisma(record);
  }

  async findRequested(params: Parameters<SummaryJobRepositoryPort['findRequested']>[0]): Promise<readonly SummaryJob[]> {
    const records = await this.prisma.summaryJob.findMany({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        status: 'REQUESTED',
      },
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      take: params.limit,
    });

    return records.map((record) => summaryJobFromPrisma(record));
  }
}
