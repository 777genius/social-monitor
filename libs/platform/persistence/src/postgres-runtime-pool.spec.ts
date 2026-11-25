import type { PrismaPg } from '@prisma/adapter-pg';
import { Client, type Pool } from 'pg';

import { runWithTenantDatabaseAccess } from './database-access-context';
import {
  POSTGRES_RUNTIME_POOL_CONNECTION_TIMEOUT_MS,
  POSTGRES_RUNTIME_POOL_IDLE_TIMEOUT_MS,
  PostgresRuntimePoolRegistry,
  acquirePrismaPgRuntimeConnection,
  bindPostgresRuntimeProcessIdentity,
  defaultPostgresRuntimePoolConfig,
  getPostgresRuntimePoolDiagnostics,
  resolvePostgresRuntimePoolConfig,
  teardownPostgresRuntimePoolForTests,
  type PrismaPgRuntimeClient,
} from './postgres-runtime-pool';
import { toPostgresPoolConfig } from './postgres-runtime-pool-config';

describe('Postgres runtime pool configuration', () => {
  const databaseUrl = 'postgresql://runtime.invalid/social_monitor';
  const apiEnv = {
    DATABASE_URL: databaseUrl,
    POSTGRES_RUNTIME_PROCESS: 'api-gateway',
    POSTGRES_RUNTIME_POOL_MIN: '0',
    POSTGRES_RUNTIME_POOL_MAX: '2',
  };

  it('uses explicit per-process pool maxima', () => {
    expect(resolvePostgresRuntimePoolConfig(apiEnv)).toEqual({
      processId: 'api-gateway',
      connectionString: databaseUrl,
      min: 0,
      max: 2,
      connectionTimeoutMillis: POSTGRES_RUNTIME_POOL_CONNECTION_TIMEOUT_MS,
      idleTimeoutMillis: POSTGRES_RUNTIME_POOL_IDLE_TIMEOUT_MS,
    });
    expect(
      resolvePostgresRuntimePoolConfig({
        ...apiEnv,
        POSTGRES_RUNTIME_PROCESS: 'delivery-service',
        POSTGRES_RUNTIME_POOL_MAX: '1',
      }).max,
    ).toBe(1);
  });

  it('accepts an explicit maximum only when it equals the process budget', () => {
    expect(
      resolvePostgresRuntimePoolConfig({
        ...apiEnv,
        POSTGRES_RUNTIME_POOL_MAX: '2',
        POSTGRES_RUNTIME_POOL_CONNECTION_TIMEOUT_MS: '7500',
        POSTGRES_RUNTIME_POOL_IDLE_TIMEOUT_MS: '25000',
      }),
    ).toEqual({
      processId: 'api-gateway',
      connectionString: databaseUrl,
      min: 0,
      max: 2,
      connectionTimeoutMillis: 7_500,
      idleTimeoutMillis: 25_000,
    });
  });

  it.each(
    [
      [
        'missing database URL',
        {
          POSTGRES_RUNTIME_PROCESS: 'api-gateway',
          POSTGRES_RUNTIME_POOL_MIN: '0',
          POSTGRES_RUNTIME_POOL_MAX: '2',
        },
        'DATABASE_URL',
      ],
      [
        'missing process identity',
        {
          DATABASE_URL: databaseUrl,
          POSTGRES_RUNTIME_POOL_MIN: '0',
          POSTGRES_RUNTIME_POOL_MAX: '2',
        },
        'POSTGRES_RUNTIME_PROCESS',
      ],
      [
        'unknown process identity',
        { ...apiEnv, POSTGRES_RUNTIME_PROCESS: 'unknown' },
        'POSTGRES_RUNTIME_PROCESS',
      ],
      [
        'missing explicit pool minimum',
        { ...apiEnv, POSTGRES_RUNTIME_POOL_MIN: undefined },
        'POSTGRES_RUNTIME_POOL_MIN',
      ],
      [
        'a nonzero pool minimum',
        { ...apiEnv, POSTGRES_RUNTIME_POOL_MIN: '1' },
        'POSTGRES_RUNTIME_POOL_MIN',
      ],
      [
        'missing explicit pool maximum',
        { ...apiEnv, POSTGRES_RUNTIME_POOL_MAX: undefined },
        'POSTGRES_RUNTIME_POOL_MAX',
      ],
      [
        'an API maximum below its budget',
        { ...apiEnv, POSTGRES_RUNTIME_POOL_MAX: '1' },
        'POSTGRES_RUNTIME_POOL_MAX',
      ],
      [
        'a delivery maximum above its budget',
        {
          ...apiEnv,
          POSTGRES_RUNTIME_PROCESS: 'delivery-service',
          POSTGRES_RUNTIME_POOL_MAX: '2',
        },
        'POSTGRES_RUNTIME_POOL_MAX',
      ],
      [
        'a decimal maximum',
        { ...apiEnv, POSTGRES_RUNTIME_POOL_MAX: '2.0' },
        'POSTGRES_RUNTIME_POOL_MAX',
      ],
      [
        'a zero connection timeout',
        { ...apiEnv, POSTGRES_RUNTIME_POOL_CONNECTION_TIMEOUT_MS: '0' },
        'POSTGRES_RUNTIME_POOL_CONNECTION_TIMEOUT_MS',
      ],
      [
        'an unbounded idle timeout',
        { ...apiEnv, POSTGRES_RUNTIME_POOL_IDLE_TIMEOUT_MS: '0' },
        'POSTGRES_RUNTIME_POOL_IDLE_TIMEOUT_MS',
      ],
      [
        'a non-PostgreSQL URL',
        { ...apiEnv, DATABASE_URL: 'https://runtime.invalid/database' },
        'DATABASE_URL',
      ],
      [
        'an application_name URL override',
        {
          ...apiEnv,
          DATABASE_URL: `${databaseUrl}?application_name=spoofed-runtime`,
        },
        'application_name',
      ],
      [
        'a case-variant application_name URL override',
        {
          ...apiEnv,
          DATABASE_URL: `${databaseUrl}?ApPlIcAtIoN_NaMe=spoofed-runtime`,
        },
        'application_name',
      ],
      [
        'a percent-encoded application_name URL override',
        {
          ...apiEnv,
          DATABASE_URL: `${databaseUrl}?%61pplication_name=spoofed-runtime`,
        },
        'application_name',
      ],
      [
        'a fallback_application_name URL override',
        {
          ...apiEnv,
          DATABASE_URL: `${databaseUrl}?fallback_application_name=spoofed-runtime`,
        },
        'fallback_application_name',
      ],
      [
        'a percent-encoded case-variant fallback_application_name URL override',
        {
          ...apiEnv,
          DATABASE_URL: `${databaseUrl}?fallback_%41pplication_name=spoofed-runtime`,
        },
        'fallback_application_name',
      ],
      [
        'an options URL override',
        {
          ...apiEnv,
          DATABASE_URL: `${databaseUrl}?options=-c%20application_name%3Dspoofed-runtime`,
        },
        'options',
      ],
      [
        'a percent-encoded case-variant options URL override',
        {
          ...apiEnv,
          DATABASE_URL: `${databaseUrl}?%4fPTIONS=benign-looking-value`,
        },
        'options',
      ],
      [
        'duplicate reserved URL overrides',
        {
          ...apiEnv,
          DATABASE_URL: `${databaseUrl}?connection_limit=99&OPTIONS=first&%6fptions=second`,
        },
        'options',
      ],
    ] satisfies readonly [string, NodeJS.ProcessEnv, string][],
  )(
    'fails closed for %s',
    (_name, env, settingName) => {
      expect(() => resolvePostgresRuntimePoolConfig(env)).toThrow(settingName);
    },
  );

  it('requires an explicit entrypoint identity and rejects a conflicting identity', () => {
    const env: NodeJS.ProcessEnv = {};
    expect(() =>
      bindPostgresRuntimeProcessIdentity(env, 'ingestion-worker'),
    ).toThrow('explicitly configured');
    env.POSTGRES_RUNTIME_PROCESS = 'ingestion-worker';
    bindPostgresRuntimeProcessIdentity(env, 'ingestion-worker');
    expect(env.POSTGRES_RUNTIME_PROCESS).toBe('ingestion-worker');
    expect(() =>
      bindPostgresRuntimeProcessIdentity(env, 'api-gateway'),
    ).toThrow('must be api-gateway');
  });

  it.each(['', 'benign-looking-value', '-c%20search_path%3Dpublic'])(
    'rejects every options value without exposing the URL (%s)',
    (value) => {
      const secretUrl = `${databaseUrl}?%4fPTIONS=${value}&token=raw-password`;
      let validationError: unknown;

      try {
        defaultPostgresRuntimePoolConfig(secretUrl, 'api-gateway');
      } catch (error) {
        validationError = error;
      }

      expect(validationError).toBeInstanceOf(Error);
      expect((validationError as Error).message).toBe(
        'DATABASE_URL must not set reserved PostgreSQL runtime parameter options',
      );
      expect((validationError as Error).message).not.toContain('raw-password');
      expect((validationError as Error).message).not.toContain(databaseUrl);
    },
  );

  it('guards the runtime application name against actual pg ConnectionParameters precedence', () => {
    const desiredApplicationName = 'social-monitor/runtime/api-gateway';
    const unsafeUrl =
      'postgresql://review-user@runtime.invalid/social_monitor?application_name=spoofed-runtime';
    const unsafeClient = new Client({
      application_name: desiredApplicationName,
      connectionString: unsafeUrl,
    }) as Client & {
      readonly connectionParameters: {
        readonly application_name?: string;
      };
    };

    expect(unsafeClient.connectionParameters.application_name).toBe(
      'spoofed-runtime',
    );
    expect(() =>
      defaultPostgresRuntimePoolConfig(unsafeUrl, 'api-gateway'),
    ).toThrow('application_name');

    const safeClient = new Client(
      toPostgresPoolConfig(
        defaultPostgresRuntimePoolConfig(
          'postgresql://review-user@runtime.invalid/social_monitor?connection_limit=99&pool_timeout=120',
          'api-gateway',
        ),
      ),
    ) as Client & {
      readonly connectionParameters: {
        readonly application_name?: string;
      };
    };
    expect(safeClient.connectionParameters.application_name).toBe(
      desiredApplicationName,
    );
  });
});

describe('global Postgres runtime registry isolation', () => {
  afterEach(async () => {
    await teardownPostgresRuntimePoolForTests();
  });

  it('survives an isolated module reload without creating another owner', async () => {
    const config = defaultPostgresRuntimePoolConfig(
      'postgresql://runtime.invalid/social_monitor',
      'api-gateway',
    );
    class FakePrismaClient implements PrismaPgRuntimeClient {
      $disconnect = jest.fn().mockResolvedValue(undefined);
    }
    const lease = await acquirePrismaPgRuntimeConnection(
      config,
      FakePrismaClient,
    );
    let reloaded:
      | {
          readonly getPostgresRuntimePoolDiagnostics: typeof getPostgresRuntimePoolDiagnostics;
          readonly acquirePrismaPgRuntimeConnection: typeof acquirePrismaPgRuntimeConnection;
        }
      | undefined;

    await jest.isolateModulesAsync(async () => {
      reloaded = await import('./postgres-runtime-pool');
    });

    if (reloaded === undefined) {
      throw new Error('Isolated module reload did not complete');
    }
    const reloadedModule = reloaded;
    expect(reloadedModule.getPostgresRuntimePoolDiagnostics()).toEqual(
      getPostgresRuntimePoolDiagnostics(),
    );
    const reloadedLease = await reloadedModule.acquirePrismaPgRuntimeConnection(
      config,
      FakePrismaClient,
    );
    expect(reloadedLease.client).toBe(lease.client);
    expect(reloadedModule.getPostgresRuntimePoolDiagnostics()).toMatchObject({
      poolInstances: 1,
      prismaClientInstances: 1,
      activeConnectionLeases: 2,
    });

    await reloadedLease.close();
    await lease.close();
  });
});

describe('PostgresRuntimePoolRegistry lifecycle and ownership', () => {
  const config = defaultPostgresRuntimePoolConfig(
    'postgresql://runtime.invalid/social_monitor',
    'api-gateway',
  );

  it('shares one Prisma/pg runtime and awaits idempotent disconnect and pool end', async () => {
    const disconnect = deferred<void>();
    const poolEnd = deferred<void>();
    const events: string[] = [];
    const pool = poolWithEnd(async () => {
      events.push('pool-end');
      await poolEnd.promise;
    });

    class FakePrismaClient implements PrismaPgRuntimeClient {
      async $disconnect(): Promise<void> {
        events.push('prisma-disconnect');
        await disconnect.promise;
      }
    }

    const registry = registryWith(pool);
    const first = await registry.acquire(config, FakePrismaClient);
    const second = await registry.acquire(config, FakePrismaClient);

    expect(first.client).toBe(second.client);
    expect(registry.diagnostics()).toEqual({
      poolInstances: 1,
      prismaClientInstances: 1,
      activeConnectionLeases: 2,
      closing: false,
    });

    const firstClose = first.close();
    expect(first.close()).toBe(firstClose);
    await firstClose;
    expect(events).toEqual([]);

    const lastClose = second.close();
    expect(second.close()).toBe(lastClose);
    await flushPromises();
    expect(events).toEqual(['prisma-disconnect']);

    disconnect.resolve();
    await flushPromises();
    expect(events).toEqual(['prisma-disconnect', 'pool-end']);

    let closed = false;
    void lastClose.then(() => {
      closed = true;
    });
    await flushPromises();
    expect(closed).toBe(false);

    poolEnd.resolve();
    await lastClose;
    expect(pool.end).toHaveBeenCalledTimes(1);
    expect(registry.diagnostics().poolInstances).toBe(0);
  });

  it('fails closed for URL/options and generated-client constructor mismatches', async () => {
    const pool = poolWithEnd(async () => undefined);
    class FirstClient implements PrismaPgRuntimeClient {
      $disconnect = jest.fn().mockResolvedValue(undefined);
    }
    class SecondClient implements PrismaPgRuntimeClient {
      $disconnect = jest.fn().mockResolvedValue(undefined);
    }
    const registry = registryWith(pool);
    const lease = await registry.acquire(config, FirstClient);

    await expect(
      registry.acquire(
        { ...config, idleTimeoutMillis: config.idleTimeoutMillis + 1 },
        FirstClient,
      ),
    ).rejects.toThrow('URL and options must be identical');
    await expect(registry.acquire(config, SecondClient)).rejects.toThrow(
      'one generated Prisma client constructor',
    );

    await lease.close();
  });

  it('never includes a PostgreSQL URL or password in ownership validation errors', async () => {
    const secretConfig = defaultPostgresRuntimePoolConfig(
      'postgresql://runtime-user:raw-password@runtime.invalid/social_monitor',
      'api-gateway',
    );
    const otherSecretConfig = defaultPostgresRuntimePoolConfig(
      'postgresql://runtime-user:password@other.invalid/social_monitor',
      'api-gateway',
    );
    class FakePrismaClient implements PrismaPgRuntimeClient {
      $disconnect = jest.fn().mockResolvedValue(undefined);
    }
    const registry = registryWith(poolWithEnd(async () => undefined));
    const lease = await registry.acquire(secretConfig, FakePrismaClient);

    let validationError: unknown;
    try {
      await registry.acquire(otherSecretConfig, FakePrismaClient);
    } catch (error) {
      validationError = error;
    }
    const message =
      validationError instanceof Error ? validationError.message : '';
    expect(message).toContain('URL and options must be identical');
    expect(message).not.toContain('raw-password');
    expect(message).not.toContain('password');
    expect(message).not.toContain('postgresql://');

    await lease.close();
  });

  it('keeps ownership while failed construction awaits pool cleanup', async () => {
    const firstPoolEnd = deferred<void>();
    const firstPool = poolWithEnd(() => firstPoolEnd.promise);
    const secondPool = poolWithEnd(async () => undefined);
    const pools = [firstPool, secondPool];
    let adapterAttempts = 0;
    const registry = new PostgresRuntimePoolRegistry({
      createPool: () => pools.shift() as Pool,
      createAdapter: () => {
        adapterAttempts += 1;
        if (adapterAttempts === 1) {
          throw new Error('adapter construction failed');
        }
        return {} as PrismaPg;
      },
    });
    class FakePrismaClient implements PrismaPgRuntimeClient {
      $disconnect = jest.fn().mockResolvedValue(undefined);
    }

    const failedAcquisition = registry.acquire(config, FakePrismaClient);
    await flushPromises();
    expect(registry.diagnostics()).toEqual({
      poolInstances: 1,
      prismaClientInstances: 0,
      activeConnectionLeases: 0,
      closing: true,
    });
    await expect(registry.acquire(config, FakePrismaClient)).rejects.toThrow(
      'cleanup is still in progress',
    );

    let rejected = false;
    void failedAcquisition.catch(() => {
      rejected = true;
    });
    await flushPromises();
    expect(rejected).toBe(false);

    firstPoolEnd.resolve();
    await expect(failedAcquisition).rejects.toThrow(
      'adapter construction failed',
    );
    const replacement = await registry.acquire(config, FakePrismaClient);
    expect(firstPool.end).toHaveBeenCalledTimes(1);
    await replacement.close();
  });

  it('recovers failed partial construction cleanup before allocating a replacement', async () => {
    const events: string[] = [];
    let firstPoolEndAttempts = 0;
    const firstPool = poolWithEnd(async () => {
      firstPoolEndAttempts += 1;
      events.push(`first-end-${firstPoolEndAttempts}`);
      if (firstPoolEndAttempts <= 3) {
        throw new Error('partial pool end failed');
      }
    });
    const secondPool = poolWithEnd(async () => undefined);
    const pools = [firstPool, secondPool];
    let adapterAttempts = 0;
    const createPool = jest.fn(() => {
      events.push(`create-pool-${3 - pools.length}`);
      return pools.shift() as Pool;
    });
    const registry = new PostgresRuntimePoolRegistry({
      createPool,
      createAdapter: () => {
        adapterAttempts += 1;
        if (adapterAttempts === 1) {
          throw new Error('adapter construction failed');
        }
        return {} as PrismaPg;
      },
    });
    class FakePrismaClient implements PrismaPgRuntimeClient {
      $disconnect = jest.fn().mockResolvedValue(undefined);
    }

    await expect(registry.acquire(config, FakePrismaClient)).rejects.toThrow(
      'construction and PostgreSQL pool cleanup both failed',
    );
    expect(firstPool.end).toHaveBeenCalledTimes(3);
    expect(createPool).toHaveBeenCalledTimes(1);

    const replacement = await registry.acquire(config, FakePrismaClient);
    expect(firstPool.end).toHaveBeenCalledTimes(4);
    expect(createPool).toHaveBeenCalledTimes(2);
    expect(events.indexOf('first-end-4')).toBeLessThan(
      events.indexOf('create-pool-2'),
    );
    await replacement.close();
  });

  it('awaits lease cleanup when connection-wrapper construction fails', async () => {
    const poolEnd = deferred<void>();
    const pool = poolWithEnd(() => poolEnd.promise);
    class FakePrismaClient implements PrismaPgRuntimeClient {
      $disconnect = jest.fn().mockResolvedValue(undefined);
    }
    const registry = registryWith(pool);

    const failedConstruction = registry.create(
      config,
      FakePrismaClient,
      () => {
        throw new Error('wrapper construction failed');
      },
    );
    await flushPromises();
    expect(registry.diagnostics()).toEqual({
      poolInstances: 1,
      prismaClientInstances: 1,
      activeConnectionLeases: 0,
      closing: true,
    });
    await expect(registry.acquire(config, FakePrismaClient)).rejects.toThrow(
      'pool is closing',
    );

    let rejected = false;
    void failedConstruction.catch(() => {
      rejected = true;
    });
    await flushPromises();
    expect(rejected).toBe(false);

    poolEnd.resolve();
    await expect(failedConstruction).rejects.toThrow(
      'wrapper construction failed',
    );
    expect(registry.diagnostics().poolInstances).toBe(0);
  });

  it('recovers transient cleanup failures within a bounded retry without a second pool', async () => {
    let poolEndAttempts = 0;
    const pool = poolWithEnd(async () => {
      poolEndAttempts += 1;
      if (poolEndAttempts === 1) {
        throw new Error('transient pool end failure');
      }
    });
    let disconnectAttempts = 0;
    class FakePrismaClient implements PrismaPgRuntimeClient {
      async $disconnect(): Promise<void> {
        disconnectAttempts += 1;
        if (disconnectAttempts === 1) {
          throw new Error('transient disconnect failure');
        }
      }
    }
    const registry = registryWith(pool);
    const lease = await registry.acquire(config, FakePrismaClient);

    await expect(lease.close()).resolves.toBeUndefined();
    expect(disconnectAttempts).toBe(2);
    expect(pool.end).toHaveBeenCalledTimes(2);
    expect(registry.diagnostics()).toEqual({
      poolInstances: 0,
      prismaClientInstances: 0,
      activeConnectionLeases: 0,
      closing: false,
    });
  });

  it('times out a never-resolving Prisma disconnect and still closes the pg Pool', async () => {
    jest.useFakeTimers();
    try {
      const pool = poolWithEnd(async () => undefined);
      class NeverDisconnectingPrismaClient implements PrismaPgRuntimeClient {
        $disconnect = jest.fn(() => new Promise<void>(() => undefined));
      }
      const registry = registryWith(pool);
      const lease = await registry.acquire(
        config,
        NeverDisconnectingPrismaClient,
      );

      const close = lease.close();
      const rejection = expect(close).rejects.toThrow(
        'Prisma client disconnect timed out',
      );
      await jest.runOnlyPendingTimersAsync();
      await rejection;
      expect(pool.end).toHaveBeenCalledTimes(1);
      expect(registry.diagnostics().poolInstances).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('times out a never-resolving pg Pool shutdown instead of hanging cleanup', async () => {
    jest.useFakeTimers();
    try {
      const pool = poolWithEnd(() => new Promise<void>(() => undefined));
      class FakePrismaClient implements PrismaPgRuntimeClient {
        $disconnect = jest.fn().mockResolvedValue(undefined);
      }
      const registry = registryWith(pool);
      const lease = await registry.acquire(config, FakePrismaClient);

      const close = lease.close();
      const rejection = expect(close).rejects.toThrow(
        'PostgreSQL pool shutdown timed out',
      );
      await jest.runOnlyPendingTimersAsync();
      await rejection;
      expect(pool.end).toHaveBeenCalledTimes(1);
      expect(registry.diagnostics()).toMatchObject({
        poolInstances: 1,
        activeConnectionLeases: 0,
        closing: true,
      });
      await expect(registry.acquire(config, FakePrismaClient)).rejects.toThrow(
        'pool is closing',
      );
      await expect(registry.acquire(config, FakePrismaClient)).rejects.toThrow(
        'pool is closing',
      );
      expect(pool.end).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('retains one timed-out pool end until late settlement, then creates one replacement', async () => {
    jest.useFakeTimers();
    try {
      const firstPoolEnd = deferred<void>();
      const firstPool = poolWithEnd(() => firstPoolEnd.promise);
      const secondPool = poolWithEnd(async () => undefined);
      const pools = [firstPool, secondPool];
      const createPool = jest.fn(() => pools.shift() as Pool);
      class FakePrismaClient implements PrismaPgRuntimeClient {
        $disconnect = jest.fn().mockResolvedValue(undefined);
      }
      const registry = new PostgresRuntimePoolRegistry({
        createPool,
        createAdapter: () => ({}) as PrismaPg,
      });
      const firstLease = await registry.acquire(config, FakePrismaClient);

      const close = firstLease.close();
      const rejection = expect(close).rejects.toThrow(
        'PostgreSQL pool shutdown timed out',
      );
      await jest.runOnlyPendingTimersAsync();
      await rejection;

      await expect(registry.acquire(config, FakePrismaClient)).rejects.toThrow(
        'pool is closing',
      );
      expect(firstPool.end).toHaveBeenCalledTimes(1);
      expect(createPool).toHaveBeenCalledTimes(1);

      firstPoolEnd.resolve();
      await flushPromises();
      expect(registry.diagnostics().poolInstances).toBe(0);

      const [firstReplacement, secondReplacement] = await Promise.all([
        registry.acquire(config, FakePrismaClient),
        registry.acquire(config, FakePrismaClient),
      ]);
      expect(firstReplacement.client).toBe(secondReplacement.client);
      expect(createPool).toHaveBeenCalledTimes(2);

      await firstReplacement.close();
      await secondReplacement.close();
      expect(secondPool.end).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not retain poisoned ownership when Prisma disconnect fails after the pool closes', async () => {
    const firstPool = poolWithEnd(async () => undefined);
    const secondPool = poolWithEnd(async () => undefined);
    const pools = [firstPool, secondPool];
    const createPool = jest.fn(() => pools.shift() as Pool);
    let clientInstances = 0;
    class FakePrismaClient implements PrismaPgRuntimeClient {
      private readonly instance = ++clientInstances;

      async $disconnect(): Promise<void> {
        if (this.instance === 1) {
          throw new Error('disconnect stayed failed');
        }
      }
    }
    const registry = new PostgresRuntimePoolRegistry({
      createPool,
      createAdapter: () => ({}) as PrismaPg,
    });
    const firstLease = await registry.acquire(config, FakePrismaClient);

    await expect(firstLease.close()).rejects.toThrow('disconnect stayed failed');
    expect(firstPool.end).toHaveBeenCalledTimes(1);
    expect(registry.diagnostics().poolInstances).toBe(0);

    const replacement = await registry.acquire(config, FakePrismaClient);
    expect(createPool).toHaveBeenCalledTimes(2);
    await replacement.close();
    expect(secondPool.end).toHaveBeenCalledTimes(1);
  });

  it('retries failed cleanup on reacquire before constructing one replacement pool', async () => {
    let firstPoolEndAttempts = 0;
    const firstPool = poolWithEnd(async () => {
      firstPoolEndAttempts += 1;
      if (firstPoolEndAttempts <= 3) {
        throw new Error('pool end failed');
      }
    });
    const secondPool = poolWithEnd(async () => undefined);
    const pools = [firstPool, secondPool];
    const createPool = jest.fn(() => pools.shift() as Pool);
    const registry = new PostgresRuntimePoolRegistry({
      createPool,
      createAdapter: () => ({}) as PrismaPg,
    });
    class FakePrismaClient implements PrismaPgRuntimeClient {
      $disconnect = jest.fn().mockResolvedValue(undefined);
    }
    const firstLease = await registry.acquire(config, FakePrismaClient);

    await expect(firstLease.close()).rejects.toThrow('pool end failed');
    expect(firstPool.end).toHaveBeenCalledTimes(3);
    expect(registry.diagnostics()).toEqual({
      poolInstances: 1,
      prismaClientInstances: 1,
      activeConnectionLeases: 0,
      closing: true,
    });

    const replacement = await registry.acquire(config, FakePrismaClient);
    expect(firstPool.end).toHaveBeenCalledTimes(4);
    expect(createPool).toHaveBeenCalledTimes(2);
    expect(registry.diagnostics()).toMatchObject({
      poolInstances: 1,
      prismaClientInstances: 1,
      activeConnectionLeases: 1,
      closing: false,
    });
    await replacement.close();
    expect(secondPool.end).toHaveBeenCalledTimes(1);
  });

  it('cleans leaked test state but rejects teardown so leaks stay visible', async () => {
    const pool = poolWithEnd(async () => undefined);
    class FakePrismaClient implements PrismaPgRuntimeClient {
      $disconnect = jest.fn().mockResolvedValue(undefined);
    }
    const registry = registryWith(pool);
    await registry.acquire(config, FakePrismaClient);

    await expect(registry.teardownForTests()).rejects.toThrow(
      '1 unreleased lease',
    );
    expect(registry.diagnostics().poolInstances).toBe(0);
  });

  it('runs readiness through the owned Prisma client without allocating another pool', async () => {
    const pool = poolWithEnd(async () => undefined);
    const createPool = jest.fn(() => pool);
    const query = jest.fn().mockResolvedValue([{ readiness_probe: 1 }]);
    class FakePrismaClient implements PrismaPgRuntimeClient {
      $disconnect = jest.fn().mockResolvedValue(undefined);
      $queryRawUnsafe = query;
    }
    const registry = new PostgresRuntimePoolRegistry({
      createPool,
      createAdapter: () => ({}) as PrismaPg,
    });
    const lease = await registry.acquire(config, FakePrismaClient);

    await expect(registry.probeConnectivity()).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith('SELECT 1::integer AS readiness_probe');
    expect(createPool).toHaveBeenCalledTimes(1);

    await lease.close();
    await expect(registry.probeConnectivity()).rejects.toThrow('not ready');
  });

  it('rejects root-client operations from an interactive transaction', async () => {
    type TransactionClient = {
      readonly record: { findMany(): Promise<readonly string[]> };
      readonly $executeRawUnsafe: jest.Mock<Promise<number>>;
    };
    class FakePrismaClient implements PrismaPgRuntimeClient {
      readonly record = {
        findMany: jest.fn().mockResolvedValue(['root']),
      };
      readonly transactionClient: TransactionClient = {
        record: { findMany: jest.fn().mockResolvedValue(['transaction']) },
        $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      };

      $disconnect = jest.fn().mockResolvedValue(undefined);
      $transaction<TValue>(
        operation: (client: TransactionClient) => Promise<TValue>,
      ): Promise<TValue> {
        return operation(this.transactionClient);
      }
    }
    const registry = registryWith(poolWithEnd(async () => undefined));
    const lease = await registry.acquire(config, FakePrismaClient);

    await expect(
      runWithTenantDatabaseAccess(
        {
          tenantId: '11111111-1111-4111-8111-111111111111',
          workspaceId: '22222222-2222-4222-8222-222222222222',
        },
        () =>
          lease.client.$transaction(async (transaction) => {
            await expect(transaction.record.findMany()).resolves.toEqual([
              'transaction',
            ]);
            return lease.client.record.findMany();
          }),
      ),
    ).rejects.toThrow('Root Prisma client cannot be used');

    await lease.close();
  });
});

function registryWith(pool: Pool): PostgresRuntimePoolRegistry {
  return new PostgresRuntimePoolRegistry({
    createPool: () => pool,
    createAdapter: () => ({}) as PrismaPg,
  });
}

function poolWithEnd(end: () => Promise<void>): Pool {
  return { end: jest.fn(end) } as unknown as Pool;
}

type Deferred<T> = {
  readonly promise: Promise<T>;
  resolve(value?: T): void;
};

function deferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T | PromiseLike<T>) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value?: T): void {
      resolvePromise?.(value as T);
    },
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
