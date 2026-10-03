import {
  CommitAckClient,
  CommitAckWire,
  commitAckPool,
} from './postgres-runtime-pool-commit-ack.spec-support';
import {
  directPoolOptions,
  readSource,
  runtimeSourceFiles,
} from './postgres-runtime-pool-budget-test-source';

describe('socketless COMMIT acknowledgement pool bounds', () => {
  it('keeps the synthetic constructor reachable only from its exact test consumers', () => {
    const helper = 'libs/platform/persistence/src/postgres-runtime-pool-commit-ack.spec-support.ts';
    const consumers = [...runtimeSourceFiles('apps'), ...runtimeSourceFiles('libs'), ...runtimeSourceFiles('scripts'), ...runtimeSourceFiles('prisma')]
      .filter((path) => path !== helper && path !== 'libs/platform/persistence/src/postgres-runtime-pool-budget-test-inventory.ts')
      .filter((path) => readSource(path).includes('postgres-runtime-pool-commit-ack.spec-support'))
      .sort();
    expect(consumers).toEqual([
      'libs/platform/persistence/src/commit-ack-wiring.spec.ts',
      'libs/platform/persistence/src/commit-ack.spec.ts',
      'libs/platform/persistence/src/postgres-runtime-pool-budget.spec.ts',
      'libs/platform/persistence/src/postgres-runtime-pool-commit-ack-bounds.spec.ts',
    ]);
  });

  it.each([undefined, 1, 2] as const)('bounds actual synthetic leases for max=%s', async (maximum) => {
    const pool = commitAckPool(maximum);
    const acquire = () => pool.connect();
    const held: Array<Awaited<ReturnType<typeof acquire>>> = [];
    try {
      // Check before acquisition so a wrong Client fails without opening a socket.
      expect(Reflect.get(pool.options, 'Client')).toBe(CommitAckClient);
      expect(pool.options.min).toBe(0);
      expect(pool.options.max).toBe(maximum ?? 1);
      for (let index = 0; index < (maximum ?? 1); index += 1) {
        const client = await acquire();
        held.push(client);
        expect(client).toBeInstanceOf(CommitAckClient);
        expect(Reflect.get(client, 'wire')).toBeInstanceOf(CommitAckWire);
      }
      const next = acquire();
      expect(pool.totalCount).toBe(maximum ?? 1);
      expect(pool.waitingCount).toBe(1);
      const released = held.shift();
      released?.release();
      const reacquired = await next;
      held.push(reacquired);
      expect(reacquired).toBe(released);
      expect(pool.totalCount).toBe(maximum ?? 1);
      expect(pool.waitingCount).toBe(0);
    } finally {
      for (const client of held) client.release();
      await pool.end();
    }
  });

  it.each([0, -1, 3, 1.5, NaN, Infinity])('rejects unbounded or unsupported max=%s before construction', (maximum) => {
    expect(() => commitAckPool(maximum as 1)).toThrow(RangeError);
  });

  it('retains independent native constructor bounds without executing native helpers', () => {
    for (const path of [
      'scripts/lib/reader-summary-first-publication-pg18-crash.spec-support.ts',
      'scripts/lib/reader-summary-first-publication-pg18.spec-support.ts',
    ]) {
      const options = directPoolOptions(readSource(path));
      expect(options).toHaveLength(1);
      // These baseline constructors omit min; installed pg-pool defaults it to 0.
      for (const option of options) {
        expect(/\bmin:\s*([^,\s}]+)/.exec(option)?.[1] ?? '0').toBe('0');
        expect(option).not.toContain('...');
      }
    }
  });
});
