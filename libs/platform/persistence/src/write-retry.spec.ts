import { withPrismaWriteRetry } from './write-retry';

describe('withPrismaWriteRetry', () => {
  it.each(['40001', '40P01'])('retries P2010 SQLSTATE %s at most three times', async (sqlState) => {
    for (const error of [
      { code: 'P2010', meta: { code: sqlState } },
      { code: 'P2010', meta: { driverAdapterError: {
        cause: { originalCode: sqlState },
      } } },
    ]) {
      const operation = jest.fn().mockRejectedValue(error);
      const sleep = jest.fn().mockResolvedValue(undefined);
      await expect(withPrismaWriteRetry(operation, { sleep })).rejects.toBe(error);
      expect(operation).toHaveBeenCalledTimes(3);
      expect(sleep.mock.calls).toEqual([[25], [50]]);
    }
  });

  it.each([
    { code: 'P2010', meta: { code: '57014' } },
    { code: 'P2010', meta: { driverAdapterError: { cause: { originalCode: '57014' } } } },
    { code: 'P2010', meta: { code: '23505' } },
    { code: 'P2028' },
    { code: '08006' },
    { code: 'P2010', message: '40001' },
    { code: 'P2002', meta: { code: '40001' } },
  ])('does not retry cancellation, unknown outcomes or unrelated metadata: %j', async (error) => {
    const operation = jest.fn().mockRejectedValue(error);
    await expect(withPrismaWriteRetry(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

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

  it('retries PostgreSQL serialization and deadlock SQLSTATE conflicts', async () => {
    const errors = [{ code: '40001' }, { cause: { code: '40P01' } }];
    let attempts = 0;

    const result = await withPrismaWriteRetry(async () => {
      const error = errors[attempts];
      attempts += 1;

      if (error !== undefined) {
        throw error;
      }

      return 'committed';
    }, {
      maxAttempts: 3,
      sleep: async () => undefined,
    });

    expect(result).toBe('committed');
    expect(attempts).toBe(3);
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
