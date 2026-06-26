import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';

import type {
  ListScanSchedulerDecisionsBySourceBindingWindowQuery,
  ListScanSchedulerDecisionsBySourceBindingWindowResult,
  RecordScanSchedulerDecisionsCommand,
  ScanSchedulerDecisionHistoryPort,
} from '../../../ports';
import type { PrismaMonitoringClient } from './prisma-monitoring-client';
import { scanSchedulerDecisionFromPrisma } from './prisma-monitoring-records';

export class PrismaScanSchedulerDecisionHistoryRepository implements ScanSchedulerDecisionHistoryPort {
  constructor(private readonly prisma: PrismaMonitoringClient) {}

  async recordBatch(command: RecordScanSchedulerDecisionsCommand): Promise<void> {
    await withPrismaWriteRetry(async () => {
      for (const record of command.records) {
        await this.prisma.scanSchedulerDecision.upsert({
          where: {
            tenantId_workspaceId_decisionKey: {
              tenantId: record.tenantId,
              workspaceId: record.workspaceId,
              decisionKey: record.decisionKey,
            },
          },
          update: {
            providerKey: record.providerKey ?? null,
            decision: record.decision,
            reason: record.reason,
            scanJobId: record.scanJobId ?? null,
            policyDueAt: record.policyDueAt,
            evaluatedAt: record.evaluatedAt,
            nextRunAt: record.nextRunAt,
            configuredIntervalSeconds: record.configuredIntervalSeconds,
            effectiveIntervalSeconds: record.effectiveIntervalSeconds ?? null,
            freshnessSeconds: record.freshnessSeconds ?? null,
            providerMinimumIntervalEnforced: record.providerMinimumIntervalEnforced ?? null,
            backoffUntil: record.backoffUntil ?? null,
            correlationId: record.correlationId ?? null,
            causationId: record.causationId ?? null,
          },
          create: {
            id: record.id,
            tenantId: record.tenantId,
            workspaceId: record.workspaceId,
            decisionKey: record.decisionKey,
            scanPolicyId: record.scanPolicyId,
            sourceBindingId: record.sourceBindingId,
            providerKey: record.providerKey ?? null,
            decision: record.decision,
            reason: record.reason,
            scanJobId: record.scanJobId ?? null,
            policyDueAt: record.policyDueAt,
            evaluatedAt: record.evaluatedAt,
            nextRunAt: record.nextRunAt,
            configuredIntervalSeconds: record.configuredIntervalSeconds,
            effectiveIntervalSeconds: record.effectiveIntervalSeconds ?? null,
            freshnessSeconds: record.freshnessSeconds ?? null,
            providerMinimumIntervalEnforced: record.providerMinimumIntervalEnforced ?? null,
            backoffUntil: record.backoffUntil ?? null,
            correlationId: record.correlationId ?? null,
            causationId: record.causationId ?? null,
          },
        });
      }
    });
  }

  async listBySourceBindingWindow(
    query: ListScanSchedulerDecisionsBySourceBindingWindowQuery,
  ): Promise<ListScanSchedulerDecisionsBySourceBindingWindowResult> {
    const records = await this.prisma.scanSchedulerDecision.findMany({
      where: {
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        sourceBindingId: query.sourceBindingId,
        evaluatedAt: {
          gte: query.windowStartedAt,
          lt: query.windowEndedAt,
        },
      },
      orderBy: [
        { evaluatedAt: 'desc' },
        { id: 'desc' },
      ],
      take: query.limit + 1,
    });
    const page = records.slice(0, query.limit);

    return {
      records: page.map(scanSchedulerDecisionFromPrisma),
      truncated: records.length > query.limit,
    };
  }
}
