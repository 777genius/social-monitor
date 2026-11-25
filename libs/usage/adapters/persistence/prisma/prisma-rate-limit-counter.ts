import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';

import type {
  IncrementRateLimitCounterCommand,
  IncrementRateLimitCounterResult,
  RateLimitCounterPort,
} from '../../../ports';
import type { PrismaUsageClient } from './prisma-usage-client';

export class PrismaRateLimitCounter implements RateLimitCounterPort {
  constructor(private readonly prisma: PrismaUsageClient) {}

  async increment(command: IncrementRateLimitCounterCommand): Promise<IncrementRateLimitCounterResult> {
    return withPrismaWriteRetry(async () => {
      await this.prisma.rateLimitBucket.deleteMany({
        where: { windowEndsAt: { lte: command.windowStartedAt } },
      });

      const record = await this.prisma.rateLimitBucket.upsert({
        where: { bucketKey: command.bucketKey },
        update: {
          windowStartedAt: command.windowStartedAt,
          windowEndsAt: command.windowEndsAt,
          count: { increment: 1 },
        },
        create: {
          bucketKey: command.bucketKey,
          windowStartedAt: command.windowStartedAt,
          windowEndsAt: command.windowEndsAt,
          count: 1,
        },
      });

      return { count: record.count };
    });
  }
}
