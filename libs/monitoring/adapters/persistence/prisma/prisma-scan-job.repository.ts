import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { ScanJob } from '../../../domain';
import type { ScanJobRepositoryPort } from '../../../ports';
import type { PrismaMonitoringClient } from './prisma-monitoring-client';
import { scanJobFromPrisma, scanJobStatusToPrisma } from './prisma-monitoring-records';

const ACTIVE_SCAN_JOB_STATUSES = ['REQUESTED', 'ENQUEUED'] as const;

export class PrismaScanJobRepository implements ScanJobRepositoryPort {
  constructor(private readonly prisma: PrismaMonitoringClient) {}

  async save(job: ScanJob): Promise<void> {
    const snapshot = job.toSnapshot();
    const status = scanJobStatusToPrisma(snapshot.status);

    await withPrismaWriteRetry(() => this.prisma.scanJob.upsert({
      where: { id: snapshot.id },
      update: {
        status,
        idempotencyKey: snapshot.idempotencyKey,
        requestedAt: snapshot.requestedAt,
        enqueuedAt: snapshot.enqueuedAt ?? null,
        completedAt: snapshot.completedAt ?? null,
        failureReason: snapshot.failureReason ?? null,
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
      },
    }));
  }

  async findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    scanJobId: string;
  }): Promise<ScanJob | null> {
    const record = await this.prisma.scanJob.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.scanJobId,
      },
    });

    return record === null ? null : scanJobFromPrisma(record);
  }

  async findActiveBySourceBinding(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    sourceBindingId: string;
  }): Promise<ScanJob | null> {
    const record = await this.prisma.scanJob.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        sourceBindingId: params.sourceBindingId,
        status: { in: ACTIVE_SCAN_JOB_STATUSES },
      },
      orderBy: { requestedAt: 'asc' },
    });

    return record === null ? null : scanJobFromPrisma(record);
  }

  async findLatestBySourceBinding(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    sourceBindingId: string;
  }): Promise<ScanJob | null> {
    const record = await this.prisma.scanJob.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        sourceBindingId: params.sourceBindingId,
      },
      orderBy: { requestedAt: 'desc' },
    });

    return record === null ? null : scanJobFromPrisma(record);
  }

  async findByIdempotencyKey(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    idempotencyKey: string;
  }): Promise<ScanJob | null> {
    const record = await this.prisma.scanJob.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        idempotencyKey: params.idempotencyKey,
      },
    });

    return record === null ? null : scanJobFromPrisma(record);
  }
}
