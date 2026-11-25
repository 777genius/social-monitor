import type { Pool } from 'pg';

type DisconnectablePrismaClient = {
  $disconnect(): Promise<void>;
};

export type PoolCleanupState = {
  poolEnded: boolean;
  inFlight: Promise<void> | undefined;
  poolEndPending: Promise<void> | undefined;
  onPoolEnded: (() => void) | undefined;
};

export type RuntimeCleanupState = PoolCleanupState & {
  prismaDisconnected: boolean;
  prismaDisconnectPending: Promise<void> | undefined;
};

const POSTGRES_RUNTIME_CLEANUP_RETRY_LIMIT = 3;
export const POSTGRES_RUNTIME_CLEANUP_OPERATION_TIMEOUT_MS = 5_000;

class PostgresRuntimeCleanupTimeoutError extends Error {}

export function createPoolCleanupState(
  onPoolEnded?: () => void,
): PoolCleanupState {
  return {
    poolEnded: false,
    inFlight: undefined,
    poolEndPending: undefined,
    onPoolEnded,
  };
}

export function createRuntimeCleanupState(
  onPoolEnded?: () => void,
): RuntimeCleanupState {
  return {
    ...createPoolCleanupState(onPoolEnded),
    prismaDisconnected: false,
    prismaDisconnectPending: undefined,
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
      await withCleanupWatchdog(
        startPoolEnd(pool, cleanup),
        'PostgreSQL pool shutdown',
      );
      return;
    } catch (error) {
      poolEndError = error;
      if (error instanceof PostgresRuntimeCleanupTimeoutError) {
        break;
      }
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
  let disconnectTimedOut = false;
  let poolEndTimedOut = false;

  for (
    let attempt = 1;
    attempt <= POSTGRES_RUNTIME_CLEANUP_RETRY_LIMIT;
    attempt += 1
  ) {
    if (!cleanup.prismaDisconnected && !disconnectTimedOut) {
      try {
        await withCleanupWatchdog(
          startPrismaDisconnect(client, cleanup),
          'Prisma client disconnect',
        );
        disconnectError = undefined;
      } catch (error) {
        disconnectError = error;
        disconnectTimedOut =
          error instanceof PostgresRuntimeCleanupTimeoutError;
      }
    }
    if (!cleanup.poolEnded && !poolEndTimedOut) {
      try {
        await withCleanupWatchdog(
          startPoolEnd(pool, cleanup),
          'PostgreSQL pool shutdown',
        );
        poolEndError = undefined;
      } catch (error) {
        poolEndError = error;
        poolEndTimedOut = error instanceof PostgresRuntimeCleanupTimeoutError;
      }
    }
    if (cleanup.prismaDisconnected && cleanup.poolEnded) {
      return;
    }
    if (
      (cleanup.prismaDisconnected || disconnectTimedOut) &&
      (cleanup.poolEnded || poolEndTimedOut)
    ) {
      break;
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

function startPrismaDisconnect(
  client: DisconnectablePrismaClient,
  cleanup: RuntimeCleanupState,
): Promise<void> {
  const existing = cleanup.prismaDisconnectPending;
  if (existing !== undefined) {
    return existing;
  }

  let operation: Promise<void>;
  try {
    operation = client.$disconnect();
  } catch (error) {
    operation = Promise.reject(error);
  }
  const pending = operation.then(
    () => {
      cleanup.prismaDisconnected = true;
      cleanup.prismaDisconnectPending = undefined;
    },
    (error: unknown) => {
      cleanup.prismaDisconnectPending = undefined;
      throw error;
    },
  );
  cleanup.prismaDisconnectPending = pending;
  return pending;
}

function startPoolEnd(pool: Pool, cleanup: PoolCleanupState): Promise<void> {
  const existing = cleanup.poolEndPending;
  if (existing !== undefined) {
    return existing;
  }

  let operation: Promise<void>;
  try {
    operation = pool.end();
  } catch (error) {
    operation = Promise.reject(error);
  }
  const pending = operation.then(
    () => {
      cleanup.poolEnded = true;
      cleanup.poolEndPending = undefined;
      cleanup.onPoolEnded?.();
    },
    (error: unknown) => {
      cleanup.poolEndPending = undefined;
      throw error;
    },
  );
  cleanup.poolEndPending = pending;
  return pending;
}

function withCleanupWatchdog<TValue>(
  operation: Promise<TValue>,
  operationName: string,
): Promise<TValue> {
  return new Promise<TValue>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(
        new PostgresRuntimeCleanupTimeoutError(
          `${operationName} timed out after ${POSTGRES_RUNTIME_CLEANUP_OPERATION_TIMEOUT_MS}ms`,
        ),
      );
    }, POSTGRES_RUNTIME_CLEANUP_OPERATION_TIMEOUT_MS);
    timer.unref();

    void operation.then(
      (value) => {
        clearTimeout(timer);
        if (settled) {
          return;
        }
        settled = true;
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        if (settled) {
          return;
        }
        settled = true;
        reject(error);
      },
    );
  });
}
