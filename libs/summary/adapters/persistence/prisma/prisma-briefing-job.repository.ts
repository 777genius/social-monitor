import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { BriefingJob } from '../../../domain';
import type { BriefingJobRepositoryPort } from '../../../ports';
import type { PrismaSummaryClient } from './prisma-summary-client';
import {
  briefingJobFromPrisma,
  briefingJobStatusToPrisma,
  briefingScopeToPrisma,
} from './prisma-briefing-records';

export class PrismaBriefingJobRepository implements BriefingJobRepositoryPort {
  constructor(private readonly prisma: PrismaSummaryClient) {}

  async save(job: BriefingJob): Promise<void> {
    const snapshot = job.toSnapshot();
    const status = briefingJobStatusToPrisma(snapshot.status);
    const scopeFields = briefingScopeToPrisma(snapshot.scope);

    await withPrismaWriteRetry(() => this.prisma.briefingJob.upsert({
      where: { id: snapshot.id },
      update: {
        ...scopeFields,
        status,
        idempotencyKey: snapshot.idempotencyKey,
        userId: snapshot.userId ?? null,
        subscriptionId: snapshot.subscriptionId ?? null,
        requestedAt: snapshot.requestedAt,
        startedAt: snapshot.startedAt ?? null,
        completedAt: snapshot.completedAt ?? null,
        failedAt: snapshot.failedAt ?? null,
        briefingArtifactId: snapshot.briefingId ?? null,
        failureReason: snapshot.failureReason ?? null,
      },
      create: {
        id: snapshot.id,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        ...scopeFields,
        userId: snapshot.userId ?? null,
        subscriptionId: snapshot.subscriptionId ?? null,
        status,
        idempotencyKey: snapshot.idempotencyKey,
        requestedAt: snapshot.requestedAt,
        startedAt: snapshot.startedAt ?? null,
        completedAt: snapshot.completedAt ?? null,
        failedAt: snapshot.failedAt ?? null,
        briefingArtifactId: snapshot.briefingId ?? null,
        failureReason: snapshot.failureReason ?? null,
      },
    }));
  }

  async findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    briefingJobId: string;
  }): Promise<BriefingJob | null> {
    const record = await this.prisma.briefingJob.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.briefingJobId,
      },
    });

    return record === null ? null : briefingJobFromPrisma(record);
  }

  async findByIdempotencyKey(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    idempotencyKey: string;
  }): Promise<BriefingJob | null> {
    const record = await this.prisma.briefingJob.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        idempotencyKey: params.idempotencyKey,
      },
    });

    return record === null ? null : briefingJobFromPrisma(record);
  }

  async findRequested(
    params: Parameters<BriefingJobRepositoryPort['findRequested']>[0],
  ): Promise<readonly BriefingJob[]> {
    const records = await this.prisma.briefingJob.findMany({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        status: 'REQUESTED',
      },
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      take: params.limit,
    });

    return records.map((record) => briefingJobFromPrisma(record));
  }

  async claimForExecution(
    params: Parameters<BriefingJobRepositoryPort['claimForExecution']>[0],
  ): Promise<BriefingJob | null> {
    const record = await this.prisma.briefingJob.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.briefingJobId,
        status: { in: ['REQUESTED', 'FAILED'] },
      },
    });

    if (record === null) {
      return null;
    }

    const update = await withPrismaWriteRetry(() => this.prisma.briefingJob.updateMany({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.briefingJobId,
        status: record.status,
      },
      data: {
        status: 'RUNNING',
        requestedAt: record.status === 'FAILED' ? params.requestedAt : record.requestedAt,
        startedAt: params.startedAt,
        completedAt: null,
        failedAt: null,
        briefingArtifactId: null,
        failureReason: null,
      },
    }));

    if (update.count !== 1) {
      return null;
    }

    return this.findById(params);
  }
}
