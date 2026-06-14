import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { ScanPolicy } from '../../../domain';
import type { ScanPolicyRepositoryPort } from '../../../ports';
import type { PrismaMonitoringClient } from './prisma-monitoring-client';
import { scanPolicyFromPrisma } from './prisma-monitoring-records';

export class PrismaScanPolicyRepository implements ScanPolicyRepositoryPort {
  constructor(private readonly prisma: PrismaMonitoringClient) {}

  async save(policy: ScanPolicy): Promise<void> {
    const snapshot = policy.toSnapshot();

    await this.prisma.scanPolicy.upsert({
      where: { id: snapshot.id },
      update: {
        intervalSeconds: snapshot.intervalSeconds,
        freshnessSeconds: snapshot.freshnessSeconds,
        retryBudget: snapshot.retryBudget,
        nextRunAt: snapshot.nextRunAt,
      },
      create: {
        id: snapshot.id,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        sourceBindingId: snapshot.sourceBindingId,
        intervalSeconds: snapshot.intervalSeconds,
        freshnessSeconds: snapshot.freshnessSeconds,
        retryBudget: snapshot.retryBudget,
        nextRunAt: snapshot.nextRunAt,
      },
    });
  }

  async findDue(params: {
    tenantId?: TenantId;
    workspaceId?: WorkspaceId;
    now: Date;
    limit: number;
  }): Promise<readonly ScanPolicy[]> {
    const records = await this.prisma.scanPolicy.findMany({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        nextRunAt: { lte: params.now },
      },
      orderBy: { nextRunAt: 'asc' },
      take: params.limit,
    });

    return records.map((record) => scanPolicyFromPrisma(record));
  }

  async findBySourceBinding(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    sourceBindingId: string;
  }): Promise<ScanPolicy | null> {
    const record = await this.prisma.scanPolicy.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        sourceBindingId: params.sourceBindingId,
      },
    });

    return record === null ? null : scanPolicyFromPrisma(record);
  }
}
