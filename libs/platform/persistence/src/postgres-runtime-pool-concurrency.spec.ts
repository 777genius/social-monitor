import { EventEmitter } from 'node:events';

import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, type PoolConfig } from 'pg';

import type { PostgresRuntimeProcessId } from './postgres-runtime-pool-budget';
import {
  PostgresRuntimePoolRegistry,
  defaultPostgresRuntimePoolConfig,
  type PrismaPgRuntimeClient,
  type PrismaPgRuntimeClientConstructor,
} from './postgres-runtime-pool';
import { loadPrismaRuntimeClient } from './prisma-runtime-client';

describe('deterministic pg Pool admission beneath the generated Prisma client', () => {
  it.each([
    'api-gateway',
    'ingestion-worker',
    'intelligence-worker',
  ] satisfies readonly PostgresRuntimeProcessId[])(
    '%s admits a second low-level client while the first is held',
    async (processId) => {
      const fixture = createSharedRuntime(processId);
      const firstOwner = await fixture.registry.acquire(
        fixture.config,
        GeneratedPrismaClient,
      );
      const secondOwner = await fixture.registry.acquire(
        fixture.config,
        GeneratedPrismaClient,
      );

      expect(firstOwner.client).toBe(secondOwner.client);
      expect(typeof firstOwner.client.$disconnect).toBe('function');
      expect(
        typeof (firstOwner.client as { $transaction?: unknown }).$transaction,
      ).toBe('function');
      expect(fixture.registry.diagnostics()).toMatchObject({
        poolInstances: 1,
        prismaClientInstances: 1,
        activeConnectionLeases: 2,
      });
      const transaction = await fixture.pool.connect();
      const independentRead = await fixture.pool.connect();

      expect(fixture.pool.totalCount).toBe(2);
      expect(fixture.pool.waitingCount).toBe(0);

      independentRead.release();
      transaction.release();
      await firstOwner.close();
      await secondOwner.close();

      expect(fixture.registry.diagnostics()).toMatchObject({
        poolInstances: 0,
        prismaClientInstances: 0,
        activeConnectionLeases: 0,
      });
      expect(NoNetworkPgClient.endCount).toBe(2);
    },
  );

  it('queues only the third low-level acquisition and resumes it on release', async () => {
    const fixture = createSharedRuntime('api-gateway');
    const owner = await fixture.registry.acquire(
      fixture.config,
      GeneratedPrismaClient,
    );
    const first = await fixture.pool.connect();
    const second = await fixture.pool.connect();
    let thirdAcquired = false;
    const thirdPromise = fixture.pool.connect().then((client) => {
      thirdAcquired = true;
      return client;
    });

    await flushPromises();
    expect(thirdAcquired).toBe(false);
    expect(fixture.pool.totalCount).toBe(2);
    expect(fixture.pool.waitingCount).toBe(1);

    first.release();
    const third = await thirdPromise;
    expect(thirdAcquired).toBe(true);
    expect(fixture.pool.waitingCount).toBe(0);

    third.release();
    second.release();
    await owner.close();
    expect(NoNetworkPgClient.endCount).toBe(2);
  });

  it.each([
    'delivery-service',
    'event-relay',
  ] satisfies readonly PostgresRuntimeProcessId[])(
    '%s serializes a second low-level acquisition at max=1',
    async (processId) => {
      const fixture = createSharedRuntime(processId);
      const owner = await fixture.registry.acquire(
        fixture.config,
        GeneratedPrismaClient,
      );
      const first = await fixture.pool.connect();
      let secondAcquired = false;
      const secondPromise = fixture.pool.connect().then((client) => {
        secondAcquired = true;
        return client;
      });

      await flushPromises();
      expect(secondAcquired).toBe(false);
      expect(fixture.pool.waitingCount).toBe(1);

      first.release();
      const second = await secondPromise;
      expect(secondAcquired).toBe(true);
      second.release();
      await owner.close();
      expect(NoNetworkPgClient.endCount).toBe(1);
    },
  );
});

type SharedRuntimeFixture = {
  readonly config: ReturnType<typeof defaultPostgresRuntimePoolConfig>;
  readonly pool: Pool;
  readonly registry: PostgresRuntimePoolRegistry;
};

function createSharedRuntime(
  processId: PostgresRuntimeProcessId,
): SharedRuntimeFixture {
  NoNetworkPgClient.endCount = 0;
  const config = defaultPostgresRuntimePoolConfig(
    'postgresql://no-network.invalid/social_monitor',
    processId,
  );
  let pool: Pool | undefined;
  const registry = new PostgresRuntimePoolRegistry({
    createPool: (poolConfig) => {
      pool = new Pool({
        ...poolConfig,
        Client: NoNetworkPgClient,
      } as unknown as PoolConfig);
      return pool;
    },
    createAdapter: (runtimePool) =>
      new PrismaPg(runtimePool, { disposeExternalPool: false }),
  });
  // The registry constructs lazily on its first acquisition. The accessor
  // keeps the fixture honest without creating a second Pool in test code.
  return {
    config,
    get pool(): Pool {
      if (pool === undefined) {
        throw new Error('Shared runtime pool has not been acquired yet');
      }
      return pool;
    },
    registry,
  };
}

const GeneratedPrismaClient = loadPrismaRuntimeClient<
  PrismaPgRuntimeClientConstructor<PrismaPgRuntimeClient>
>();

class NoNetworkPgClient extends EventEmitter {
  static endCount = 0;
  readonly _queryable = true;
  readonly _ending = false;

  connect(callback: (error?: Error) => void): void {
    queueMicrotask(() => callback());
  }

  end(callback?: () => void): void {
    NoNetworkPgClient.endCount += 1;
    this.emit('end');
    callback?.();
  }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
