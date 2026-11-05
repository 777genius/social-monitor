import { Query, types, type Pool, type PoolClient, type QueryConfig } from 'pg';

import {
  guardPostgresPoolCommitAcknowledgements,
  PostgresCommitAcknowledgementError,
} from './postgres-runtime-pool-commit-ack';
import {
  commitAckPool,
  type CommitAckClient,
} from './postgres-runtime-pool-commit-ack.spec-support';

// These tests use real pg Pool/Client/Query/Result processing, with synthetic
// protocol events replacing the socket. No SQL or database is executed.
describe('owned pg COMMIT acknowledgements', () => {
  let pool: Pool;
  let client: PoolClient & CommitAckClient;

  beforeEach(async () => {
    pool = guardPostgresPoolCommitAcknowledgements(commitAckPool());
    client = await pool.connect() as PoolClient & CommitAckClient;
  });

  afterEach(async () => {
    client.release();
    await pool.end();
  });

  it('rejects an adapter-shaped COMMIT acknowledged as ROLLBACK', async () => {
    const config = { text: 'COMMIT', values: [], rowMode: 'array' as const, types };
    const pending = client.query(config);
    client.wire.complete('ROLLBACK');
    const error = await pending.catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(PostgresCommitAcknowledgementError);
    expect(error).toMatchObject({ code: 'POSTGRES_COMMIT_ACKNOWLEDGED_ROLLBACK' });
    expect(error).not.toHaveProperty('severity');
    expect(client.wire.queries).toEqual(['COMMIT']);
  });

  it.each(['COMMIT', ' commit ; ', 'COMMIT WORK', 'COMMIT TRANSACTION;'])(
    'accepts the actual COMMIT tag for %s', async (text) => {
      const pending = client.query(text);
      client.wire.complete('COMMIT');
      await expect(pending).resolves.toMatchObject({
        command: 'COMMIT', rowCount: null, rows: [], fields: [],
      });
      expect(client.wire.queries).toEqual([text]);
    },
  );

  it('preserves a raw failure and allows savepoint recovery followed by COMMIT', async () => {
    const savepoint = client.query('SAVEPOINT recovery');
    client.wire.complete('SAVEPOINT');
    await expect(savepoint).resolves.toHaveProperty('command', 'SAVEPOINT');
    const rawError = new Error('synthetic query failure');
    const failed = client.query('SELECT synthetic_failure');
    client.wire.fail(rawError);
    await expect(failed).rejects.toBe(rawError);
    const recovered = client.query('ROLLBACK TO SAVEPOINT recovery');
    client.wire.complete('ROLLBACK');
    await expect(recovered).resolves.toHaveProperty('command', 'ROLLBACK');
    const committed = client.query('COMMIT');
    client.wire.complete('COMMIT');
    await expect(committed).resolves.toHaveProperty('command', 'COMMIT');
    expect(client.wire.queries).toEqual([
      'SAVEPOINT recovery', 'SELECT synthetic_failure',
      'ROLLBACK TO SAVEPOINT recovery', 'COMMIT',
    ]);
  });

  it('propagates original COMMIT transport rejection by identity', async () => {
    const rawError = new Error('synthetic transport error');
    const pending = client.query('COMMIT');
    client.wire.fail(rawError);
    await expect(pending).rejects.toBe(rawError);
  });

  it.each([
    'ROLLBACK', 'ROLLBACK TO SAVEPOINT recovery', "SELECT 'COMMIT'",
    '/* COMMIT */ ROLLBACK', 'COMMIT; ROLLBACK', 'COMMIT PREPARED synthetic',
  ])('forwards non-owned query %s unchanged', async (text) => {
    const pending = client.query(text);
    client.wire.complete('ROLLBACK');
    await expect(pending).resolves.toHaveProperty('command', 'ROLLBACK');
    expect(client.wire.queries).toEqual([text]);
  });

  it('forwards multi-statement result arrays without interpreting batch SQL', async () => {
    const pending = client.query('ROLLBACK; COMMIT');
    client.wire.complete('ROLLBACK', 'COMMIT');
    await expect(pending).resolves.toEqual([
      expect.objectContaining({ command: 'ROLLBACK' }),
      expect.objectContaining({ command: 'COMMIT' }),
    ]);
  });

  it('deliberately rejects a rollback tag in a result array for standalone COMMIT', async () => {
    const pending = client.query('COMMIT');
    client.wire.complete('COMMIT', 'ROLLBACK');
    await expect(pending).rejects.toBeInstanceOf(PostgresCommitAcknowledgementError);
  });

  it('preserves accepted result arrays for standalone COMMIT', async () => {
    const pending = client.query('COMMIT');
    client.wire.complete('COMMIT', 'COMMIT');
    await expect(pending).resolves.toEqual([
      expect.objectContaining({ command: 'COMMIT' }),
      expect.objectContaining({ command: 'COMMIT' }),
    ]);
  });

  it.each(['text', 'text-values', 'config', 'config-values', 'embedded', 'embedded-values'])(
    'keeps %s callback return/result semantics and reports rollback acknowledgement',
    (overload) => {
      const callback = jest.fn();
      const config = { text: 'COMMIT', values: [], rowMode: 'array', callback };
      const args = overload === 'text' ? ['COMMIT', callback]
        : overload === 'text-values' ? ['COMMIT', [], callback]
        : overload === 'config' ? [config, callback]
        : overload === 'config-values' ? [config, [], callback]
        : overload === 'embedded-values' ? [config, []]
        : [config];
      const returned: unknown = Reflect.apply(client.query, client, args);
      expect(returned).toBeUndefined();
      client.wire.complete('ROLLBACK');
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.any(PostgresCommitAcknowledgementError),
        expect.objectContaining({ command: 'ROLLBACK', rowCount: null, rows: [] }),
      );
      // Do not leave an embedded callback wrapped on the reusable caller config.
      if (overload.startsWith('embedded')) expect(config.callback).toBe(callback);
    },
  );

  it('preserves callback success, this binding, and result identity', () => {
    const callback = jest.fn();
    client.query('COMMIT', callback);
    client.wire.complete('COMMIT');
    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({ command: 'COMMIT' }));
    const callbackThis = callback.mock.contexts[0];
    const result = callback.mock.calls[0]?.[1];
    expect(callbackThis).toBeInstanceOf(Query);
    expect(callbackThis._results).toBe(result);
  });

  it('preserves original callback errors and pg callback precedence', () => {
    const embedded = jest.fn();
    const second = jest.fn();
    const third = jest.fn();
    const rawError = new Error('synthetic callback error');
    Reflect.apply(client.query, client, [
      { text: 'COMMIT', callback: embedded }, second, third,
    ]);
    client.wire.fail(rawError);
    expect(third).toHaveBeenCalledWith(rawError);
    expect(third.mock.calls[0]).toHaveLength(1);
    expect(embedded).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('forwards query options and the original method receiver', async () => {
    const unguarded = commitAckPool();
    const forward = jest.fn();
    unguarded.on('connect', (physical) => {
      const original = physical.query;
      physical.query = function (this: PoolClient, ...args: unknown[]): unknown {
        forward(this, ...args);
        return Reflect.apply(original, this, args);
      } as PoolClient['query'];
    });
    guardPostgresPoolCommitAcknowledgements(unguarded);
    const physical = await unguarded.connect() as PoolClient & CommitAckClient;
    try {
      const config = { text: 'COMMIT', values: [], rowMode: 'array' as const, types };
      const pending = physical.query(config);
      physical.wire.complete('COMMIT');
      await expect(pending).resolves.toHaveProperty('rowAsArray', true);
      expect(forward).toHaveBeenCalledWith(physical, config);
      expect(forward.mock.calls[0]?.[1]).toBe(config);
    } finally {
      physical.release();
      await unguarded.end();
    }
  });

  it('retains submittable Query identity, listeners, and queued cancellation', async () => {
    const first = new Query('SELECT synthetic');
    const end = jest.fn();
    first.on('end', end);
    expect(client.query(first)).toBe(first);
    const queued = new Query('COMMIT');
    expect(client.query(queued)).toBe(queued);
    // pg removes queued cancellation without opening a cancellation socket.
    (client as typeof client & {
      cancel(client: PoolClient, query: Query): void;
    }).cancel(client, queued);
    client.wire.complete('SELECT 0');
    await Promise.resolve();
    expect(end).toHaveBeenCalledTimes(1);
    expect(first.listenerCount('end')).toBe(1);
    expect(client.wire.queries).toEqual(['SELECT synthetic']);
  });

  it('forwards invalid query arrays to pg validation', async () => {
    const pending = client.query(['COMMIT'] as unknown as QueryConfig);
    await expect(pending).rejects.toThrow('A query must have either text or a name');
    expect(client.wire.queries).toEqual([]);
  });

  it('isolates concurrent acknowledgements on separate physical clients', async () => {
    const concurrentPool = guardPostgresPoolCommitAcknowledgements(commitAckPool(2));
    const first = await concurrentPool.connect() as PoolClient & CommitAckClient;
    const second = await concurrentPool.connect() as PoolClient & CommitAckClient;
    try {
      expect(first).not.toBe(second);
      const failed = first.query('COMMIT');
      const succeeded = second.query('COMMIT');
      second.wire.complete('COMMIT');
      first.wire.complete('ROLLBACK');
      await expect(failed).rejects.toBeInstanceOf(PostgresCommitAcknowledgementError);
      await expect(succeeded).resolves.toHaveProperty('command', 'COMMIT');
      expect(concurrentPool.totalCount).toBe(2);
    } finally {
      first.release();
      second.release();
      await concurrentPool.end();
    }
  });

  it('retains the lease and query wrapper through waiting callback reacquisition', async () => {
    const originalQuery = client.query;
    const listenerCount = client.listenerCount('error');
    const waiting = new Promise<PoolClient>((resolve, reject) => {
      pool.connect((error, acquired, release) => {
        if (error !== undefined || acquired === undefined) {
          reject(error ?? new Error('Missing synthetic lease'));
        } else {
          expect(release).toBe(acquired.release);
          resolve(acquired);
        }
      });
    });
    expect(pool.waitingCount).toBe(1);
    const rolledBack = client.query('COMMIT');
    client.wire.complete('ROLLBACK');
    await expect(rolledBack).rejects.toBeInstanceOf(PostgresCommitAcknowledgementError);
    expect(client.listenerCount('error')).toBe(listenerCount);
    client.release();
    client = await waiting as PoolClient & CommitAckClient;
    expect(client.query).toBe(originalQuery);
    expect(pool.totalCount).toBe(1);
    expect(pool.waitingCount).toBe(0);
    const committed = client.query('COMMIT');
    client.wire.complete('COMMIT');
    await expect(committed).resolves.toHaveProperty('command', 'COMMIT');
  });
});
