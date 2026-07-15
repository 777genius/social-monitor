import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, type PoolConfig } from 'pg';

import {
  samePostgresRuntimePoolConfig,
  toPostgresPoolConfig,
  validatePostgresRuntimePoolConfig,
  type PostgresRuntimePoolConfig,
} from './postgres-runtime-pool-config';
import {
  createPoolCleanupState,
  createRuntimeCleanupState,
  disconnectAndEndWithBoundedRetry,
  endPoolWithBoundedRetry,
  type PoolCleanupState,
  type RuntimeCleanupState,
} from './postgres-runtime-pool-cleanup';
import { guardRootClientDuringInteractiveTransaction } from './postgres-runtime-pool-transaction-guard';

export {
  bindPostgresRuntimeProcessIdentity,
  defaultPostgresRuntimePoolConfig,
  POSTGRES_RUNTIME_APPLICATION_NAME_PREFIX,
  POSTGRES_RUNTIME_POOL_CONNECTION_TIMEOUT_MS,
  POSTGRES_RUNTIME_POOL_IDLE_TIMEOUT_MS,
  POSTGRES_RUNTIME_POOL_MIN_ENV,
  POSTGRES_RUNTIME_PROCESS_ENV,
  resolvePostgresRuntimePoolConfig,
  type PostgresRuntimePoolConfig,
} from './postgres-runtime-pool-config';

export type PrismaPgRuntimeClient = {
  $disconnect(): Promise<void>;
  $queryRawUnsafe?<T>(query: string): Promise<T>;
};

export type PrismaPgRuntimeClientConstructor<
  TClient extends PrismaPgRuntimeClient,
> = new (args: { readonly adapter: PrismaPg }) => TClient;

export type PrismaPgRuntimeConnectionLease<
  TClient extends PrismaPgRuntimeClient,
> = {
  readonly client: TClient;
  close(): Promise<void>;
};

export type PostgresRuntimePoolDiagnostics = {
  readonly poolInstances: 0 | 1;
  readonly prismaClientInstances: 0 | 1;
  readonly activeConnectionLeases: number;
  readonly closing: boolean;
};

type RuntimeState = {
  readonly config: PostgresRuntimePoolConfig;
  readonly pool: Pool;
  readonly client: PrismaPgRuntimeClient;
  readonly clientConstructor: PrismaPgRuntimeClientConstructor<PrismaPgRuntimeClient>;
  activeConnectionLeases: number;
  closing: RuntimeCleanupState | undefined;
};

type PartialConstructionState = {
  readonly config: PostgresRuntimePoolConfig;
  readonly pool: Pool;
  readonly clientConstructor: PrismaPgRuntimeClientConstructor<PrismaPgRuntimeClient>;
  cleanup: PoolCleanupState | undefined;
};

type PostgresRuntimePoolRegistryDependencies = {
  readonly createPool: (config: PoolConfig) => Pool;
  readonly createAdapter: (pool: Pool) => PrismaPg;
};

const defaultDependencies: PostgresRuntimePoolRegistryDependencies = {
  createPool: (config) => new Pool(config),
  createAdapter: (pool) =>
    new PrismaPg(pool, { disposeExternalPool: false }),
};

export class PostgresRuntimePoolRegistry {
  private state: RuntimeState | undefined;
  private partialConstruction: PartialConstructionState | undefined;

  constructor(
    private readonly dependencies: PostgresRuntimePoolRegistryDependencies =
      defaultDependencies,
  ) {}

  async acquire<TClient extends PrismaPgRuntimeClient>(
    configInput: PostgresRuntimePoolConfig,
    Client: PrismaPgRuntimeClientConstructor<TClient>,
  ): Promise<PrismaPgRuntimeConnectionLease<TClient>> {
    const config = validatePostgresRuntimePoolConfig(configInput);
    await this.recoverPartialConstruction();
    const state = this.state;

    if (state !== undefined) {
      if (state.closing !== undefined) {
        if (state.closing.inFlight !== undefined) {
          throw new Error('PostgreSQL runtime pool is closing');
        }
        try {
          await this.finishRuntimeCleanup(state);
        } catch (error) {
          if (this.state === state) {
            throw error;
          }
        }
        return this.acquire(config, Client);
      }
      this.assertCompatibleOwner(state, config, Client);
      state.activeConnectionLeases += 1;
      return this.createLease(state, state.client as TClient);
    }

    const pool = this.dependencies.createPool(toPostgresPoolConfig(config));
    const partialConstruction: PartialConstructionState = {
      config,
      pool,
      clientConstructor:
        Client as PrismaPgRuntimeClientConstructor<PrismaPgRuntimeClient>,
      cleanup: undefined,
    };
    this.partialConstruction = partialConstruction;

    try {
      const adapter = this.dependencies.createAdapter(pool);
      const rawClient = new Client({ adapter });
      const client = guardRootClientDuringInteractiveTransaction(rawClient);
      const nextState: RuntimeState = {
        config,
        pool,
        client,
        clientConstructor: partialConstruction.clientConstructor,
        activeConnectionLeases: 1,
        closing: undefined,
      };
      this.state = nextState;
      this.partialConstruction = undefined;
      return this.createLease(nextState, client);
    } catch (constructionError) {
      const cleanup = createPoolCleanupState();
      partialConstruction.cleanup = cleanup;
      try {
        await this.finishPartialConstructionCleanup(partialConstruction);
      } catch (cleanupError) {
        throw new AggregateError(
          [constructionError, cleanupError],
          'Prisma runtime construction and PostgreSQL pool cleanup both failed',
        );
      }
      throw constructionError;
    }
  }

  async create<TClient extends PrismaPgRuntimeClient, TConnection>(
    config: PostgresRuntimePoolConfig,
    Client: PrismaPgRuntimeClientConstructor<TClient>,
    construct: (
      lease: PrismaPgRuntimeConnectionLease<TClient>,
    ) => TConnection | Promise<TConnection>,
  ): Promise<TConnection> {
    const lease = await this.acquire(config, Client);
    try {
      return await construct(lease);
    } catch (constructionError) {
      try {
        await lease.close();
      } catch (cleanupError) {
        throw new AggregateError(
          [constructionError, cleanupError],
          'Prisma connection wrapper construction and lease cleanup both failed',
        );
      }
      throw constructionError;
    }
  }

  diagnostics(): PostgresRuntimePoolDiagnostics {
    const partialConstruction = this.partialConstruction;
    if (partialConstruction !== undefined) {
      return {
        poolInstances: 1,
        prismaClientInstances: 0,
        activeConnectionLeases: 0,
        closing: partialConstruction.cleanup !== undefined,
      };
    }

    const state = this.state;
    return state === undefined
      ? {
          poolInstances: 0,
          prismaClientInstances: 0,
          activeConnectionLeases: 0,
          closing: false,
        }
      : {
          poolInstances: 1,
          prismaClientInstances: 1,
          activeConnectionLeases: state.activeConnectionLeases,
          closing: state.closing !== undefined,
        };
  }

  async probeConnectivity(): Promise<void> {
    const state = this.state;
    if (
      state === undefined ||
      state.activeConnectionLeases < 1 ||
      state.closing !== undefined
    ) {
      throw new Error('PostgreSQL runtime pool is not ready');
    }
    const query = state.client.$queryRawUnsafe;
    if (query === undefined) {
      throw new Error('PostgreSQL runtime Prisma client cannot probe readiness');
    }
    const rows = await query.call(
      state.client,
      'SELECT 1::integer AS readiness_probe',
    );
    if (!Array.isArray(rows) || rows.length !== 1) {
      throw new Error('PostgreSQL runtime readiness query returned no row');
    }
  }

  async teardownForTests(): Promise<void> {
    const partialConstruction = this.partialConstruction;
    if (partialConstruction !== undefined) {
      if (partialConstruction.cleanup?.inFlight !== undefined) {
        await partialConstruction.cleanup.inFlight;
      } else {
        await this.finishPartialConstructionCleanup(partialConstruction);
      }
    }

    const state = this.state;
    if (state === undefined) {
      return;
    }

    const leakedLeases = state.activeConnectionLeases;
    state.activeConnectionLeases = 0;
    state.closing ??= createRuntimeCleanupState();

    let cleanupError: unknown;
    try {
      await this.finishRuntimeCleanup(state);
    } catch (error) {
      cleanupError = error;
    }

    const leakError =
      leakedLeases === 0
        ? undefined
        : new Error(
            `PostgreSQL runtime test teardown found ${leakedLeases} unreleased lease(s)`,
          );
    if (cleanupError !== undefined && leakError !== undefined) {
      throw new AggregateError(
        [leakError, cleanupError],
        'PostgreSQL runtime test teardown found leaks and cleanup failed',
      );
    }
    if (cleanupError !== undefined) {
      throw cleanupError;
    }
    if (leakError !== undefined) {
      throw leakError;
    }
  }

  private async recoverPartialConstruction(): Promise<void> {
    const partialConstruction = this.partialConstruction;
    if (partialConstruction === undefined) {
      return;
    }
    if (partialConstruction.cleanup?.inFlight !== undefined) {
      throw new Error(
        'PostgreSQL runtime pool construction cleanup is still in progress',
      );
    }
    await this.finishPartialConstructionCleanup(partialConstruction);
  }

  private assertCompatibleOwner<TClient extends PrismaPgRuntimeClient>(
    state: RuntimeState,
    config: PostgresRuntimePoolConfig,
    Client: PrismaPgRuntimeClientConstructor<TClient>,
  ): void {
    if (state.closing !== undefined) {
      throw new Error('PostgreSQL runtime pool is closing');
    }
    if (!samePostgresRuntimePoolConfig(state.config, config)) {
      throw new Error(
        'PostgreSQL runtime pool URL and options must be identical within one process',
      );
    }
    if (state.clientConstructor !== Client) {
      throw new Error(
        'PostgreSQL runtime must use one generated Prisma client constructor per process',
      );
    }
  }

  private createLease<TClient extends PrismaPgRuntimeClient>(
    state: RuntimeState,
    client: TClient,
  ): PrismaPgRuntimeConnectionLease<TClient> {
    let closePromise: Promise<void> | undefined;

    return {
      client,
      close: (): Promise<void> => {
        closePromise ??= Promise.resolve().then(() => this.release(state));
        return closePromise;
      },
    };
  }

  private async release(state: RuntimeState): Promise<void> {
    if (this.state !== state) {
      return;
    }

    state.activeConnectionLeases -= 1;
    if (state.activeConnectionLeases > 0) {
      return;
    }
    if (state.activeConnectionLeases < 0) {
      throw new Error('PostgreSQL runtime pool lease count became negative');
    }

    state.closing ??= createRuntimeCleanupState();
    await this.finishRuntimeCleanup(state);
  }

  private async finishPartialConstructionCleanup(
    partialConstruction: PartialConstructionState,
  ): Promise<void> {
    const cleanup = partialConstruction.cleanup ?? createPoolCleanupState();
    partialConstruction.cleanup = cleanup;
    cleanup.inFlight ??= endPoolWithBoundedRetry(
      partialConstruction.pool,
      cleanup,
    );
    const inFlight = cleanup.inFlight;
    try {
      await inFlight;
    } finally {
      if (cleanup.inFlight === inFlight) {
        cleanup.inFlight = undefined;
      }
      if (
        cleanup.poolEnded &&
        this.partialConstruction === partialConstruction
      ) {
        this.partialConstruction = undefined;
      }
    }
  }

  private async finishRuntimeCleanup(state: RuntimeState): Promise<void> {
    const cleanup = state.closing ?? createRuntimeCleanupState();
    state.closing = cleanup;
    cleanup.inFlight ??= disconnectAndEndWithBoundedRetry(
      state.client,
      state.pool,
      cleanup,
    );
    const inFlight = cleanup.inFlight;
    try {
      await inFlight;
    } finally {
      if (cleanup.inFlight === inFlight) {
        cleanup.inFlight = undefined;
      }
      // A closed external pg.Pool is the no-double-pool boundary. A Prisma
      // disconnect error is still reported, but it cannot retain registry
      // ownership after the transport has been closed.
      if (cleanup.poolEnded && this.state === state) {
        this.state = undefined;
      }
    }
  }
}

const GLOBAL_REGISTRY_PROPERTY =
  '__socialMonitorPostgresRuntimePoolRegistryV3__' as const;
type PostgresRuntimePoolGlobal = {
  [GLOBAL_REGISTRY_PROPERTY]?: PostgresRuntimePoolRegistry;
};
const runtimeGlobal = globalThis as typeof globalThis & PostgresRuntimePoolGlobal;
const runtimePoolRegistry =
  runtimeGlobal[GLOBAL_REGISTRY_PROPERTY] ?? new PostgresRuntimePoolRegistry();
runtimeGlobal[GLOBAL_REGISTRY_PROPERTY] = runtimePoolRegistry;

export function acquirePrismaPgRuntimeConnection<
  TClient extends PrismaPgRuntimeClient,
>(
  config: PostgresRuntimePoolConfig,
  Client: PrismaPgRuntimeClientConstructor<TClient>,
): Promise<PrismaPgRuntimeConnectionLease<TClient>> {
  return runtimePoolRegistry.acquire(config, Client);
}

export async function createPrismaPgRuntimeConnection<
  TClient extends PrismaPgRuntimeClient,
  TConnection,
>(
  config: PostgresRuntimePoolConfig,
  Client: PrismaPgRuntimeClientConstructor<TClient>,
  construct: (
    lease: PrismaPgRuntimeConnectionLease<TClient>,
  ) => TConnection | Promise<TConnection>,
): Promise<TConnection> {
  return runtimePoolRegistry.create(config, Client, construct);
}

export function getPostgresRuntimePoolDiagnostics(): PostgresRuntimePoolDiagnostics {
  return runtimePoolRegistry.diagnostics();
}

/** Exercises the already-owned bounded Prisma/pg runtime without a second pool. */
export function probePostgresRuntimePoolConnectivity(): Promise<void> {
  return runtimePoolRegistry.probeConnectivity();
}

export function teardownPostgresRuntimePoolForTests(): Promise<void> {
  return runtimePoolRegistry.teardownForTests();
}
