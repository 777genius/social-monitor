import { EventEmitter } from 'node:events';
import { Pool, type PoolConfig } from 'pg';
import { closeReaderValuePostgresFixture } from './reader-value-postgres-fixture-cleanup';

// Exercise installed pg-pool behavior while controlling physical disconnect
// acknowledgement. Pool.end() resolves before this callback is released.
class DelayedWireClient extends EventEmitter {
  _queryable = true;
  _ending = false;
  disconnect: (() => void) | undefined;
  connect(callback: () => void): void { callback(); }
  end(callback: () => void): void {
    this._ending = true;
    this.disconnect = callback;
  }
}

async function idlePool() {
  const pool = new Pool({ Client: DelayedWireClient, min: 0, max: 1 } as unknown as PoolConfig);
  const wire = await pool.connect();
  wire.release();
  return { pool, wire: wire as unknown as DelayedWireClient };
}

async function settlePromises() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

describe('reader-value PostgreSQL fixture cleanup', () => {
  it('releases the Prisma lease and physically removes owned clients before strict DDL and success', async () => {
    const runtime = await idlePool();
    const setup = await idlePool();
    const admin = new Pool({ min: 0, max: 1 });
    const trace: string[] = [];
    const query = jest.spyOn(admin, 'query').mockResolvedValue({ rows: [], rowCount: 0 });
    const run = closeReaderValuePostgresFixture({
      runtimeConnection: { onApplicationShutdown: async () => { trace.push('prisma-shutdown'); } },
      runtime: runtime.pool, setup: setup.pool, admin, databaseName: 'reader_value_test_fixture',
      databaseCreated: true, createdRoles: ['fixture_owner', 'fixture_runtime'],
    }).then(() => { trace.push('success'); });
    await settlePromises();
    expect(runtime.pool.totalCount).toBe(0);
    expect(runtime.wire.disconnect).toBeDefined();
    expect(setup.wire.disconnect).toBeUndefined();
    expect(trace).toEqual(['prisma-shutdown']);
    runtime.wire.disconnect!();
    await settlePromises();
    expect(setup.pool.totalCount).toBe(0);
    expect(setup.wire.disconnect).toBeDefined();
    expect(query).not.toHaveBeenCalled();
    setup.wire.disconnect!();
    await run;
    expect(query.mock.calls).toEqual([['DROP DATABASE "reader_value_test_fixture"'],
      ['DROP ROLE "fixture_runtime"'], ['DROP ROLE "fixture_owner"']]);
    expect(trace).toEqual(['prisma-shutdown', 'success']);
    expect(runtime.pool.listenerCount('remove')).toBe(0);
    expect(setup.pool.listenerCount('remove')).toBe(0);
    expect(admin.ended).toBe(true);
  });

  it('fails visibly on a genuine remaining backend and still closes the admin pool', async () => {
    const admin = new Pool({ min: 0, max: 1 });
    const remainingBackend = Object.assign(new Error('database remains in use'), { code: '55006' });
    const query = jest.spyOn(admin, 'query').mockRejectedValue(remainingBackend);
    await expect(closeReaderValuePostgresFixture({ admin, databaseName: 'reader_value_test_fixture',
      databaseCreated: true, createdRoles: ['fixture_runtime'],
    })).rejects.toBe(remainingBackend);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith('DROP DATABASE "reader_value_test_fixture"');
    expect(admin.ended).toBe(true);
  });
});
