import type {
  IncrementRateLimitCounterCommand,
  IncrementRateLimitCounterResult,
  RateLimitCounterPort,
} from '../../ports';

type CounterRecord = {
  readonly windowEndsAt: Date;
  count: number;
};

export class InMemoryRateLimitCounter implements RateLimitCounterPort {
  private readonly countersByBucket = new Map<string, CounterRecord>();

  async increment(command: IncrementRateLimitCounterCommand): Promise<IncrementRateLimitCounterResult> {
    this.deleteExpired(command.windowStartedAt);
    const existing = this.countersByBucket.get(command.bucketKey);

    if (existing !== undefined && existing.windowEndsAt.getTime() === command.windowEndsAt.getTime()) {
      existing.count += 1;

      return {
        count: existing.count,
      };
    }

    this.countersByBucket.set(command.bucketKey, {
      windowEndsAt: command.windowEndsAt,
      count: 1,
    });

    return {
      count: 1,
    };
  }

  private deleteExpired(now: Date): void {
    for (const [bucketKey, record] of this.countersByBucket.entries()) {
      if (record.windowEndsAt <= now) {
        this.countersByBucket.delete(bucketKey);
      }
    }
  }
}
