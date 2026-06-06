import { FixedClock } from '@social-monitor/shared-kernel';

import type {
  IncrementRateLimitCounterCommand,
  IncrementRateLimitCounterResult,
  RateLimitCounterPort,
} from '../../ports';
import { CheckPublicApiRateLimitUseCase } from './check-public-api-rate-limit.use-case';

class FakeRateLimitCounter implements RateLimitCounterPort {
  private readonly countersByBucket = new Map<string, number>();

  async increment(command: IncrementRateLimitCounterCommand): Promise<IncrementRateLimitCounterResult> {
    const count = (this.countersByBucket.get(command.bucketKey) ?? 0) + 1;

    this.countersByBucket.set(command.bucketKey, count);

    return {
      count,
    };
  }
}

describe('CheckPublicApiRateLimitUseCase', () => {
  it('allows requests within limit and rejects overflow in the same window', async () => {
    const useCase = new CheckPublicApiRateLimitUseCase(
      new FakeRateLimitCounter(),
      new FixedClock(new Date('2026-06-06T12:00:05.000Z')),
    );
    const command = {
      subjectKey: 'api-key-1',
      operation: 'webhook_endpoints.manage',
      limit: 2,
      windowSeconds: 60,
    };

    await expect(useCase.execute(command)).resolves.toEqual({
      ok: true,
      value: {
        allowed: true,
        limit: 2,
        remaining: 1,
        resetAt: '2026-06-06T12:01:00.000Z',
      },
    });
    await expect(useCase.execute(command)).resolves.toEqual({
      ok: true,
      value: {
        allowed: true,
        limit: 2,
        remaining: 0,
        resetAt: '2026-06-06T12:01:00.000Z',
      },
    });
    await expect(useCase.execute(command)).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'operation.rate_limited',
        details: expect.objectContaining({
          retryAfterSeconds: 55,
        }),
      }),
    });
  });

  it('keeps different operations in separate buckets', async () => {
    const useCase = new CheckPublicApiRateLimitUseCase(
      new FakeRateLimitCounter(),
      new FixedClock(new Date('2026-06-06T12:00:05.000Z')),
    );

    await expect(useCase.execute({
      subjectKey: 'api-key-1',
      operation: 'webhook_endpoints.manage',
      limit: 1,
      windowSeconds: 60,
    })).resolves.toEqual(expect.objectContaining({
      ok: true,
    }));
    await expect(useCase.execute({
      subjectKey: 'api-key-1',
      operation: 'delivery_status.read',
      limit: 1,
      windowSeconds: 60,
    })).resolves.toEqual(expect.objectContaining({
      ok: true,
    }));
  });
});
