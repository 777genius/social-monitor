import { type Clock, DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { RateLimitCounterPort } from '../../ports';
import type { CheckPublicApiRateLimitCommand } from './check-public-api-rate-limit.command';
import type { CheckPublicApiRateLimitResult } from './check-public-api-rate-limit.result';

type CheckPublicApiRateLimitFailure = DomainError;

export class CheckPublicApiRateLimitUseCase {
  constructor(
    private readonly counters: RateLimitCounterPort,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: CheckPublicApiRateLimitCommand,
  ): Promise<Result<CheckPublicApiRateLimitResult, CheckPublicApiRateLimitFailure>> {
    if (command.subjectKey.trim().length === 0 || command.operation.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Rate limit subject and operation must be non-empty'));
    }

    if (!Number.isInteger(command.limit) || command.limit < 1 || command.limit > 10_000) {
      return err(new DomainError('validation.failed', 'Rate limit must be between 1 and 10000'));
    }

    if (!Number.isInteger(command.windowSeconds) || command.windowSeconds < 1 || command.windowSeconds > 86_400) {
      return err(new DomainError('validation.failed', 'Rate limit window must be between 1 and 86400 seconds'));
    }

    const now = this.clock.now();
    const windowStartedAt = floorToWindow(now, command.windowSeconds);
    const windowEndsAt = new Date(windowStartedAt.getTime() + command.windowSeconds * 1000);
    const count = await this.counters.increment({
      bucketKey: `${command.subjectKey}:${command.operation}:${windowStartedAt.toISOString()}`,
      windowStartedAt,
      windowEndsAt,
    });
    const remaining = Math.max(command.limit - count.count, 0);

    if (count.count > command.limit) {
      return err(new DomainError('operation.rate_limited', 'Public API rate limit exceeded', {
        operation: command.operation,
        limit: command.limit,
        remaining,
        resetAt: windowEndsAt.toISOString(),
        retryAfterSeconds: Math.max(Math.ceil((windowEndsAt.getTime() - now.getTime()) / 1000), 1),
      }));
    }

    return ok({
      allowed: true,
      limit: command.limit,
      remaining,
      resetAt: windowEndsAt.toISOString(),
    });
  }
}

const floorToWindow = (date: Date, windowSeconds: number): Date => {
  const windowMilliseconds = windowSeconds * 1000;

  return new Date(Math.floor(date.getTime() / windowMilliseconds) * windowMilliseconds);
};
