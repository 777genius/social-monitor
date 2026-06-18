import { withPrismaWriteRetry } from './write-retry';

describe('withPrismaWriteRetry', () => {
  it('retries retryable Prisma write conflicts', async () => {
    const sleeps: number[] = [];
    let attempts = 0;

    const result = await withPrismaWriteRetry(async () => {
      attempts += 1;

      if (attempts < 3) {
        throw { code: 'P2034' };
      }

      return 'saved';
    }, {
      maxAttempts: 3,
      baseDelayMs: 10,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    });

    expect(result).toBe('saved');
    expect(attempts).toBe(3);
    expect(sleeps).toEqual([10, 20]);
  });

  it('does not retry non-retryable Prisma errors', async () => {
    let attempts = 0;

    await expect(withPrismaWriteRetry(async () => {
      attempts += 1;
      throw { code: 'P2002' };
    }, {
      sleep: async () => undefined,
    })).rejects.toMatchObject({ code: 'P2002' });

    expect(attempts).toBe(1);
  });

  it('stops after the configured retry budget', async () => {
    let attempts = 0;

    await expect(withPrismaWriteRetry(async () => {
      attempts += 1;
      throw { code: 'P2034' };
    }, {
      maxAttempts: 2,
      sleep: async () => undefined,
    })).rejects.toMatchObject({ code: 'P2034' });

    expect(attempts).toBe(2);
  });
});
