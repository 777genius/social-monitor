import {
  POSTGRES_RUNTIME_POOL_LIMITS,
  type PostgresRuntimeProcessId,
} from './postgres-runtime-pool-budget';
import {
  defaultPostgresRuntimePoolConfig,
  resolvePostgresRuntimePoolConfig,
  toPostgresPoolConfig,
} from './postgres-runtime-pool-config';
import {
  PostgresRuntimePoolRegistry,
  type PrismaPgRuntimeClient,
} from './postgres-runtime-pool';

type PoolDependencies = NonNullable<
  ConstructorParameters<typeof PostgresRuntimePoolRegistry>[0]
>;
type Pool = ReturnType<PoolDependencies['createPool']>;
type PoolConfig = Parameters<PoolDependencies['createPool']>[0];
type Adapter = ReturnType<PoolDependencies['createAdapter']>;

const databaseUrl = 'postgresql://timezone-test@runtime.invalid/social_monitor';
const processIds = Object.keys(
  POSTGRES_RUNTIME_POOL_LIMITS,
) as PostgresRuntimeProcessId[];

// Red on dee89140: emitted pool config and pg startup parameters omit UTC.
// These offline checks do not replace the retained Prisma/PG18 transport proof.
describe('PostgreSQL runtime startup timezone', () => {
  it.each(processIds)(
    '%s emits UTC before queries while preserving every pool field',
    (processId) => {
      const defaults = defaultPostgresRuntimePoolConfig(databaseUrl, processId);
      const custom = resolvePostgresRuntimePoolConfig({
        DATABASE_URL: `${databaseUrl}?connection_limit=99&pool_timeout=120`,
        POSTGRES_RUNTIME_PROCESS: processId,
        POSTGRES_RUNTIME_POOL_MIN: '0',
        POSTGRES_RUNTIME_POOL_MAX: String(POSTGRES_RUNTIME_POOL_LIMITS[processId]),
        POSTGRES_RUNTIME_POOL_CONNECTION_TIMEOUT_MS: '7500',
        POSTGRES_RUNTIME_POOL_IDLE_TIMEOUT_MS: '25000',
      });

      for (const config of [defaults, custom]) {
        const poolConfig = toPostgresPoolConfig(config);
        expect(poolConfig).toEqual({
          application_name: `social-monitor/runtime/${processId}`,
          options: '-c timezone=UTC',
          connectionString: config.connectionString,
          min: 0,
          max: POSTGRES_RUNTIME_POOL_LIMITS[processId],
          connectionTimeoutMillis: config.connectionTimeoutMillis,
          idleTimeoutMillis: config.idleTimeoutMillis,
        });
      }
    },
  );

  it('keeps startup options immutable and ignores extra caller options', () => {
    const config = {
      ...defaultPostgresRuntimePoolConfig(databaseUrl, 'daily-runner'),
      options: '-c timezone=Europe/Berlin',
    };
    const poolConfig = toPostgresPoolConfig(config);

    expect(Object.isFrozen(poolConfig)).toBe(true);
    expect(Reflect.set(poolConfig, 'options', '-c timezone=Europe/Berlin'))
      .toBe(false);
    expect(poolConfig.options).toBe('-c timezone=UTC');
  });

  it.each(processIds)(
    '%s reuses UTC config for shared Prisma ownership and replacement pools',
    async (processId) => {
      const config = defaultPostgresRuntimePoolConfig(databaseUrl, processId);
      const firstPool = {
        end: jest.fn().mockResolvedValue(undefined),
      } as unknown as Pool;
      const replacementPool = {
        end: jest.fn().mockResolvedValue(undefined),
      } as unknown as Pool;
      const createPool = jest.fn<Pool, [PoolConfig]>()
        .mockReturnValueOnce(firstPool)
        .mockReturnValueOnce(replacementPool);
      const createAdapter = jest.fn<Adapter, [Pool]>(() => ({}) as Adapter);
      class FakePrismaClient implements PrismaPgRuntimeClient {
        $disconnect = jest.fn().mockResolvedValue(undefined);
      }
      const registry = new PostgresRuntimePoolRegistry({
        createPool,
        createAdapter,
      });
      const first = await registry.acquire(config, FakePrismaClient);
      const shared = await registry.acquire(config, FakePrismaClient);
      expect(first.client).toBe(shared.client);
      expect(createPool).toHaveBeenCalledTimes(1);
      await first.close();
      expect(firstPool.end).not.toHaveBeenCalled();
      await shared.close();
      expect(firstPool.end).toHaveBeenCalledTimes(1);

      const replacement = await registry.acquire(config, FakePrismaClient);
      try {
        expect(replacement.client).not.toBe(first.client);
        expect(createPool).toHaveBeenCalledTimes(2);
        expect(createAdapter).toHaveBeenNthCalledWith(1, firstPool);
        expect(createAdapter).toHaveBeenNthCalledWith(2, replacementPool);
        for (const [emitted] of createPool.mock.calls) {
          expect(emitted).toEqual(toPostgresPoolConfig(config));
          expect(emitted.options).toBe('-c timezone=UTC');
        }
      } finally {
        await replacement.close();
      }
      expect(firstPool.end).toHaveBeenCalledTimes(1);
      expect(replacementPool.end).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['options=-c%20timezone%3DEurope%2FBerlin', 'options'],
    ['options=', 'options'],
    ['%4fPTIONS=-c%20timezone%3DUTC', 'options'],
    ['connection_limit=99&OPTIONS=first&%6fptions=second', 'options'],
    ['application_name=override', 'application_name'],
    ['%41pPlIcAtIoN_NaMe=override', 'application_name'],
    ['fallback_application_name=override', 'fallback_application_name'],
    ['fallback_%41pplication_name=override', 'fallback_application_name'],
  ])('still rejects reserved URL parameter %s', (query, parameter) => {
    const connectionString = `${databaseUrl}?${query}`;
    const message = `DATABASE_URL must not set reserved PostgreSQL runtime parameter ${parameter}`;
    expect(() => defaultPostgresRuntimePoolConfig(connectionString, 'api-gateway'))
      .toThrow(message);
    expect(() => resolvePostgresRuntimePoolConfig({
      DATABASE_URL: connectionString,
      POSTGRES_RUNTIME_PROCESS: 'api-gateway',
      POSTGRES_RUNTIME_POOL_MIN: '0',
      POSTGRES_RUNTIME_POOL_MAX: '2',
    })).toThrow(message);
  });
});
