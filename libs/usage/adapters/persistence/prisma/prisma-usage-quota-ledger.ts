import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';

import type {
  ReserveUsageQuotaCommand,
  ReserveUsageQuotaResult,
  UsageQuotaLedgerPort,
} from '../../../ports';
import type { PrismaUsageClient } from './prisma-usage-client';

export class PrismaUsageQuotaLedger implements UsageQuotaLedgerPort {
  constructor(private readonly prisma: PrismaUsageClient) {}

  async reserve(command: ReserveUsageQuotaCommand): Promise<ReserveUsageQuotaResult> {
    const bucketKey = quotaBucketKey(command);

    return withPrismaWriteRetry(() => this.prisma.$transaction(async (prisma) => {
      await prisma.usageQuotaBucket.deleteMany({
        where: { windowEndsAt: { lte: command.windowStartedAt } },
      });

      const existing = await prisma.usageQuotaBucket.findUnique({
        where: { bucketKey },
      });
      const current = existing?.windowEndsAt.getTime() === command.windowEndsAt.getTime()
        ? existing.consumed
        : 0;
      const next = current + command.amount;

      if (next > command.limit) {
        return {
          allowed: false,
          consumed: current,
          remaining: Math.max(command.limit - current, 0),
        };
      }

      const saved = await prisma.usageQuotaBucket.upsert({
        where: { bucketKey },
        update: {
          windowEndsAt: command.windowEndsAt,
          consumed: next,
          limit: command.limit,
        },
        create: {
          bucketKey,
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          subjectKey: command.subjectKey,
          operation: command.operation,
          windowStartedAt: command.windowStartedAt,
          windowEndsAt: command.windowEndsAt,
          consumed: next,
          limit: command.limit,
        },
      });

      return {
        allowed: true,
        consumed: saved.consumed,
        remaining: Math.max(command.limit - saved.consumed, 0),
      };
    }, { isolationLevel: 'Serializable' }));
  }
}

const quotaBucketKey = (command: ReserveUsageQuotaCommand): string =>
  [
    command.tenantId,
    command.workspaceId,
    command.subjectKey,
    command.operation,
    command.windowStartedAt.toISOString(),
  ].join(':');
