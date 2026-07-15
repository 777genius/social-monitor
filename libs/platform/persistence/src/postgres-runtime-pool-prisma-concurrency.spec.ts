import {
  PostgresRuntimePoolRegistry,
  defaultPostgresRuntimePoolConfig,
  type PrismaPgRuntimeClient,
  type PrismaPgRuntimeClientConstructor,
} from './postgres-runtime-pool';
import { loadPrismaRuntimeClient } from './prisma-runtime-client';

type QueryRow = { readonly backend_pid: number };

type QueryingPrismaClient = PrismaPgRuntimeClient & {
  $queryRaw<T>(query: TemplateStringsArray): Promise<T>;
  $transaction<T>(
    operation: (transaction: QueryingTransactionClient) => Promise<T>,
  ): Promise<T>;
};

type QueryingTransactionClient = {
  $queryRaw<T>(query: TemplateStringsArray): Promise<T>;
};

const databaseUrl = process.env.POSTGRES_POOL_PRISMA_TEST_DATABASE_URL?.trim();
const describeWithPostgres =
  databaseUrl === undefined || databaseUrl.length === 0
    ? describe.skip
    : describe;
const GeneratedPrismaClient = loadPrismaRuntimeClient<
  PrismaPgRuntimeClientConstructor<QueryingPrismaClient>
>();

describeWithPostgres('real Prisma query concurrency through the bounded pg Pool', () => {
  jest.setTimeout(30_000);

  it('max=2 serves an independent Prisma query while one transaction is held', async () => {
    const registry = new PostgresRuntimePoolRegistry();
    const lease = await registry.acquire(
      defaultPostgresRuntimePoolConfig(requiredDatabaseUrl(), 'api-gateway'),
      GeneratedPrismaClient,
    );
    const held = holdTransaction(lease.client);

    try {
      const heldBackendPid = await held.started;
      const rows = await lease.client.$queryRaw<QueryRow[]>`
        SELECT pg_backend_pid()::integer AS backend_pid
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0]?.backend_pid).not.toBe(heldBackendPid);
    } finally {
      held.release();
      await held.finished;
      await lease.close();
    }
  });

  it('max=2 queues a third Prisma query until one of two held transactions releases', async () => {
    const registry = new PostgresRuntimePoolRegistry();
    const lease = await registry.acquire(
      defaultPostgresRuntimePoolConfig(requiredDatabaseUrl(), 'api-gateway'),
      GeneratedPrismaClient,
    );
    const first = holdTransaction(lease.client);
    const second = holdTransaction(lease.client);

    try {
      const backendPids = await Promise.all([first.started, second.started]);
      expect(new Set(backendPids).size).toBe(2);

      let independentQueryFinished = false;
      const independentQuery = lease.client
        .$queryRaw<QueryRow[]>`
          SELECT pg_backend_pid()::integer AS backend_pid
        `
        .then((rows) => {
          independentQueryFinished = true;
          return rows;
        });
      await waitFor(75);
      expect(independentQueryFinished).toBe(false);

      first.release();
      const rows = await independentQuery;
      expect(rows).toHaveLength(1);
      expect(independentQueryFinished).toBe(true);
    } finally {
      first.release();
      second.release();
      await Promise.allSettled([first.finished, second.finished]);
      await lease.close();
    }
  });

  it('max=1 queues an independent Prisma query behind a held transaction', async () => {
    const registry = new PostgresRuntimePoolRegistry();
    const lease = await registry.acquire(
      defaultPostgresRuntimePoolConfig(
        requiredDatabaseUrl(),
        'delivery-service',
      ),
      GeneratedPrismaClient,
    );
    const held = holdTransaction(lease.client);

    try {
      await held.started;
      let independentQueryFinished = false;
      const independentQuery = lease.client
        .$queryRaw<QueryRow[]>`
          SELECT pg_backend_pid()::integer AS backend_pid
        `
        .then((rows) => {
          independentQueryFinished = true;
          return rows;
        });
      await waitFor(75);
      expect(independentQueryFinished).toBe(false);

      held.release();
      await expect(independentQuery).resolves.toHaveLength(1);
    } finally {
      held.release();
      await held.finished;
      await lease.close();
    }
  });
});

function holdTransaction(client: QueryingPrismaClient): {
  readonly started: Promise<number>;
  readonly finished: Promise<void>;
  release(): void;
} {
  const started = deferred<number>();
  const release = deferred<void>();
  const finished = client.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<QueryRow[]>`
      SELECT pg_backend_pid()::integer AS backend_pid
    `;
    const backendPid = rows[0]?.backend_pid;
    if (backendPid === undefined) {
      throw new Error('held transaction did not return a backend PID');
    }
    started.resolve(backendPid);
    await release.promise;
  });
  void finished.catch((error: unknown) => started.reject(error));
  return {
    started: started.promise,
    finished,
    release: () => release.resolve(),
  };
}

function requiredDatabaseUrl(): string {
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error('POSTGRES_POOL_PRISMA_TEST_DATABASE_URL is required');
  }
  return databaseUrl;
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value?: T): void;
  reject(error: unknown): void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  let rejectPromise: ((error: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: (value?: T) => resolvePromise?.(value as T),
    reject: (error: unknown) => rejectPromise?.(error),
  };
}

function waitFor(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
