import type { Pool } from 'pg';

type DisconnectablePrismaClient = {
  $disconnect(): Promise<void>;
};

export type PoolCleanupState = {
  poolEnded: boolean;
  inFlight: Promise<void> | undefined;
};

export type RuntimeCleanupState = PoolCleanupState & {
  prismaDisconnected: boolean;
};

const POSTGRES_RUNTIME_CLEANUP_RETRY_LIMIT = 3;

export function createPoolCleanupState(): PoolCleanupState {
  return {
    poolEnded: false,
    inFlight: undefined,
  };
}

export function createRuntimeCleanupState(): RuntimeCleanupState {
  return {
    ...createPoolCleanupState(),
    prismaDisconnected: false,
  };
}

export async function endPoolWithBoundedRetry(
  pool: Pool,
  cleanup: PoolCleanupState,
): Promise<void> {
  let poolEndError: unknown;
  for (
    let attempt = 1;
    attempt <= POSTGRES_RUNTIME_CLEANUP_RETRY_LIMIT;
    attempt += 1
  ) {
    try {
      await pool.end();
      cleanup.poolEnded = true;
      return;
    } catch (error) {
      poolEndError = error;
    }
  }
  throw poolEndError;
}

export async function disconnectAndEndWithBoundedRetry(
  client: DisconnectablePrismaClient,
  pool: Pool,
  cleanup: RuntimeCleanupState,
): Promise<void> {
  let disconnectError: unknown;
  let poolEndError: unknown;

  for (
    let attempt = 1;
    attempt <= POSTGRES_RUNTIME_CLEANUP_RETRY_LIMIT;
    attempt += 1
  ) {
    if (!cleanup.prismaDisconnected) {
      try {
        await client.$disconnect();
        cleanup.prismaDisconnected = true;
        disconnectError = undefined;
      } catch (error) {
        disconnectError = error;
      }
    }
    if (!cleanup.poolEnded) {
      try {
        await pool.end();
        cleanup.poolEnded = true;
        poolEndError = undefined;
      } catch (error) {
        poolEndError = error;
      }
    }
    if (cleanup.prismaDisconnected && cleanup.poolEnded) {
      return;
    }
  }

  if (disconnectError !== undefined && poolEndError !== undefined) {
    throw new AggregateError(
      [disconnectError, poolEndError],
      'Prisma disconnect and PostgreSQL pool shutdown both failed after bounded retry',
    );
  }
  if (disconnectError !== undefined) {
    throw disconnectError;
  }
  if (poolEndError !== undefined) {
    throw poolEndError;
  }
}
