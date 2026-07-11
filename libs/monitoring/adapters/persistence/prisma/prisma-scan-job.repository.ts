import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { ScanJob, ScanJobStatus } from '../../../domain';
import type {
  ListScanJobsBySourceBindingResult,
  ListScanJobsBySourceBindingWindowResult,
  ScanJobHistoryReadPort,
  ScanJobRepositoryPort,
} from '../../../ports';
import type { PrismaMonitoringClient } from './prisma-monitoring-client';
import {
  scanJobFromPrisma,
  scanJobStatusToPrisma,
} from './prisma-monitoring-records';

const ACTIVE_SCAN_JOB_STATUSES = ['REQUESTED', 'ENQUEUED'] as const;

export class PrismaScanJobRepository
  implements ScanJobRepositoryPort, ScanJobHistoryReadPort
{
  constructor(private readonly prisma: PrismaMonitoringClient) {}

  async save(job: ScanJob): Promise<void> {
    const snapshot = job.toSnapshot();
    const status = scanJobStatusToPrisma(snapshot.status);

    await withPrismaWriteRetry(() =>
      this.prisma.scanJob.upsert({
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
      }),
    );
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

  async listBySourceBinding(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    sourceBindingId: string;
    limit: number;
    cursor?: string;
    statuses?: readonly ScanJobStatus[];
  }): Promise<ListScanJobsBySourceBindingResult> {
    const records = await this.prisma.scanJob.findMany({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        sourceBindingId: params.sourceBindingId,
        ...(params.statuses === undefined
          ? {}
          : { status: { in: params.statuses.map(scanJobStatusToPrisma) } }),
      },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      ...(params.cursor === undefined
        ? {}
        : {
            cursor: { id: params.cursor },
            skip: 1,
          }),
    });
    const page = records.slice(0, params.limit);
    const next = records[params.limit];

    return {
      scanJobs: page.map(scanJobFromPrisma),
      nextCursor: next?.id,
    };
  }

  async listBySourceBindingWindow(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    sourceBindingId: string;
    windowStartedAt: Date;
    windowEndedAt: Date;
    limit: number;
  }): Promise<ListScanJobsBySourceBindingWindowResult> {
    const records = await this.prisma.scanJob.findMany({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        sourceBindingId: params.sourceBindingId,
        requestedAt: {
          gte: params.windowStartedAt,
          lt: params.windowEndedAt,
        },
      },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
    });
    const page = records.slice(0, params.limit);

    return {
      scanJobs: page.map(scanJobFromPrisma),
      truncated: records.length > params.limit,
    };
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
