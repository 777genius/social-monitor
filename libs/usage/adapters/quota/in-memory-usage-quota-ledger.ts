import type {
  ReserveUsageQuotaCommand,
  ReserveUsageQuotaResult,
  UsageQuotaLedgerPort,
} from '../../ports';

type QuotaRecord = {
  readonly windowEndsAt: Date;
  consumed: number;
};

export class InMemoryUsageQuotaLedger implements UsageQuotaLedgerPort {
  private readonly recordsByBucket = new Map<string, QuotaRecord>();

  async reserve(command: ReserveUsageQuotaCommand): Promise<ReserveUsageQuotaResult> {
    this.deleteExpired(command.windowStartedAt);
    const bucketKey = [
      command.tenantId,
      command.workspaceId,
      command.subjectKey,
      command.operation,
      command.windowStartedAt.toISOString(),
    ].join(':');
    const existing = this.recordsByBucket.get(bucketKey);
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

    this.recordsByBucket.set(bucketKey, {
      windowEndsAt: command.windowEndsAt,
      consumed: next,
    });

    return {
      allowed: true,
      consumed: next,
      remaining: Math.max(command.limit - next, 0),
    };
  }

  private deleteExpired(now: Date): void {
    for (const [bucketKey, record] of this.recordsByBucket.entries()) {
      if (record.windowEndsAt <= now) {
        this.recordsByBucket.delete(bucketKey);
      }
    }
  }
}
