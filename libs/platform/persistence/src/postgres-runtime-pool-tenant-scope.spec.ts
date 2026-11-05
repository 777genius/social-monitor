import {
  runWithSystemDatabaseAccess,
  runWithTenantDatabaseAccess,
} from './database-access-context';
import { guardRootClientDuringInteractiveTransaction } from './postgres-runtime-pool-transaction-guard';

const tenantOne = '11111111-1111-4111-8111-111111111111';
const workspaceOne = '22222222-2222-4222-8222-222222222222';
const tenantTwo = '33333333-3333-4333-8333-333333333333';
const implicitTransactionOptions = { maxWait: 30_000, timeout: 300_000 };

describe('PostgreSQL runtime tenant scope', () => {
  it('sets transaction-local scope and timeout options before an inferred tenant operation', async () => {
    const fake = fakePrismaClient();
    const client = guardRootClientDuringInteractiveTransaction(fake.client);

    await client.scanJob.findMany({
      where: { tenantId: tenantOne, workspaceId: workspaceOne },
    });

    expect(fake.calls).toEqual([
      ['transaction', implicitTransactionOptions],
      ['set_config', tenantOne, workspaceOne, 'false'],
      ['scanJob.findMany'],
    ]);
  });

  it('fails closed when a protected query has no scope', () => {
    const fake = fakePrismaClient();
    const client = guardRootClientDuringInteractiveTransaction(fake.client);

    expect(() => client.scanJob.findMany({ where: { status: 'ENQUEUED' } }))
      .toThrow('Tenant database access is required for Prisma model scanJob');
    expect(fake.calls).toEqual([]);
  });

  it('rejects query arguments that conflict with request scope', () => {
    const fake = fakePrismaClient();
    const client = guardRootClientDuringInteractiveTransaction(fake.client);

    expect(() =>
      runWithTenantDatabaseAccess(
        { tenantId: tenantOne, workspaceId: workspaceOne },
        () =>
          client.scanJob.findMany({
            where: { tenantId: tenantTwo, workspaceId: workspaceOne },
          }),
      ),
    ).toThrow('Prisma operation conflicts with database access scope');
    expect(fake.calls).toEqual([]);
  });

  it('configures an interactive transaction once and prevents scope changes', async () => {
    const fake = fakePrismaClient();
    const client = guardRootClientDuringInteractiveTransaction(fake.client);

    await expect(
      client.$transaction(async (transaction) => {
        await transaction.scanJob.findMany({
          where: { tenantId: tenantOne, workspaceId: workspaceOne },
        });
        await transaction.feedItem.count({
          where: { tenantId: tenantOne, workspaceId: workspaceOne },
        });
        await transaction.scanJob.findMany({
          where: { tenantId: tenantTwo, workspaceId: workspaceOne },
        });
      }),
    ).rejects.toThrow('A Prisma transaction cannot cross tenant scope');

    expect(fake.calls).toEqual([
      ['transaction'],
      ['set_config', tenantOne, workspaceOne, 'false'],
      ['scanJob.findMany'],
      ['feedItem.count'],
    ]);
  });

  it('preserves explicit interactive transaction caller options unchanged', async () => {
    const fake = fakePrismaClient();
    const client = guardRootClientDuringInteractiveTransaction(fake.client);
    const explicitTransactionOptions = {
      isolationLevel: 'Serializable',
      maxWait: 1_234,
      timeout: 5_678,
    } as const;

    await client.$transaction(async (transaction) => {
      await transaction.scanJob.findMany({
        where: { tenantId: tenantOne, workspaceId: workspaceOne },
      });
    }, explicitTransactionOptions);

    expect(fake.calls).toEqual([
      ['transaction', explicitTransactionOptions],
      ['set_config', tenantOne, workspaceOne, 'false'],
      ['scanJob.findMany'],
    ]);
    expect(fake.calls[0]?.[1]).toBe(explicitTransactionOptions);
  });

  it('allows an exact read-only prologue before configuring interactive transaction scope', async () => {
    const fake = fakePrismaClient();
    const client = guardRootClientDuringInteractiveTransaction(fake.client);

    await runWithTenantDatabaseAccess(
      { tenantId: tenantOne, workspaceId: workspaceOne },
      () => client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe('SET TRANSACTION READ ONLY, DEFERRABLE');
        await transaction.scanJob.findMany({
          where: { tenantId: tenantOne, workspaceId: workspaceOne },
        });
      }),
    );

    expect(fake.calls).toEqual([
      ['transaction'],
      ['raw', 'SET TRANSACTION READ ONLY, DEFERRABLE'],
      ['set_config', tenantOne, workspaceOne, 'false'],
      ['scanJob.findMany'],
    ]);
  });

  // Regression: READ WRITE arrives after the first guard SELECT under default readonly.
  it('dispatches exact tenant READ WRITE first, then configures system_access false', async () => {
    const fake = fakePrismaClient();
    const client = guardRootClientDuringInteractiveTransaction(fake.client);
    await runWithTenantDatabaseAccess({ tenantId: tenantOne, workspaceId: workspaceOne }, () =>
      client.$transaction(async tx => {
        expect(typeof tx.sourceCatalogEntry.findMany).toBe('function');
        expect(typeof tx.$executeRawUnsafe).toBe('function');
        expect(fake.calls).toEqual([['transaction']]);
        await tx.$executeRawUnsafe('  set transaction  read write  ');
        await tx.scanJob.findMany({ where: { tenantId: tenantOne, workspaceId: workspaceOne } });
      }));
    expect(fake.calls).toEqual([['transaction'], ['raw', '  set transaction  read write  '],
      ['set_config', tenantOne, workspaceOne, 'false'], ['scanJob.findMany']]);
  });

  // Regression: system context, options, multistatement or postconfigured SQL bypasses scope.
  it('does not bypass GUCs for system or altered or postconfigured READ WRITE', async () => {
    for (const args of [ ['SET TRANSACTION READ WRITE;', []], ['SET TRANSACTION READ WRITE', [1]],
      ['SET TRANSACTION READ WRITE; COMMIT', []], ['SET TRANSACTION READ WRITE, DEFERRABLE', []] ] as const) {
      const fake = fakePrismaClient(); const client = guardRootClientDuringInteractiveTransaction(fake.client);
      await runWithTenantDatabaseAccess({ tenantId: tenantOne, workspaceId: workspaceOne }, () =>
        client.$transaction(tx => tx.$executeRawUnsafe(args[0], ...args[1])));
      expect(fake.calls[1]).toEqual(['set_config', tenantOne, workspaceOne, 'false']);
    }
    const fake = fakePrismaClient(); const client = guardRootClientDuringInteractiveTransaction(fake.client);
    await runWithSystemDatabaseAccess('synthetic control', () => client.$transaction(tx => tx.$executeRawUnsafe('SET TRANSACTION READ WRITE')));
    expect(fake.calls[1]).toEqual(['set_config', '', '', 'true']);
    const configured = fakePrismaClient(); const guarded = guardRootClientDuringInteractiveTransaction(configured.client);
    await runWithTenantDatabaseAccess({ tenantId: tenantOne, workspaceId: workspaceOne }, () => guarded.$transaction(async tx => {
      await tx.$executeRawUnsafe('SELECT 1');
      expect(() => tx.$executeRawUnsafe('SET TRANSACTION READ WRITE'))
        .toThrow('READ WRITE must be the first transaction action');
    }));
    expect(configured.calls).toEqual([['transaction'], ['set_config', tenantOne, workspaceOne, 'false'], ['raw', 'SELECT 1']]);
  });

  it('keeps explicit READ ONLY intent before and after fallback scope configuration', async () => {
    const fake = fakePrismaClient();
    const client = guardRootClientDuringInteractiveTransaction(fake.client);

    await runWithTenantDatabaseAccess(
      { tenantId: tenantOne, workspaceId: workspaceOne },
      () => client.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY, DEFERRABLE');
        expect(() => tx.$executeRawUnsafe('SET TRANSACTION READ WRITE'))
          .toThrow('READ WRITE must be the first transaction action');
        expect(fake.calls).toEqual([
          ['transaction'], ['raw', 'SET TRANSACTION READ ONLY, DEFERRABLE'],
        ]);
        await tx.scanJob.findMany({
          where: { tenantId: tenantOne, workspaceId: workspaceOne },
        });
        expect(() => tx.$executeRawUnsafe('SET TRANSACTION READ WRITE'))
          .toThrow('READ WRITE must be the first transaction action');
      }),
    );

    expect(fake.calls).toEqual([
      ['transaction'], ['raw', 'SET TRANSACTION READ ONLY, DEFERRABLE'],
      ['set_config', tenantOne, workspaceOne, 'false'], ['scanJob.findMany'],
    ]);
  });

  it('consumes an actual shared-model action without adding tenant configuration', async () => {
    const fake = fakePrismaClient();
    const client = guardRootClientDuringInteractiveTransaction(fake.client);

    await client.$transaction(async tx => {
      await tx.sourceCatalogEntry.findMany({ where: { enabled: true } });
      runWithTenantDatabaseAccess(
        { tenantId: tenantOne, workspaceId: workspaceOne },
        () => {
          expect(() => tx.$executeRawUnsafe('SET TRANSACTION READ WRITE'))
            .toThrow('READ WRITE must be the first transaction action');
        },
      );
    });

    expect(fake.calls).toEqual([['transaction'], ['sourceCatalogEntry.findMany']]);
  });

  it('rejects READ WRITE after a protected model action', async () => {
    const fake = fakePrismaClient();
    const client = guardRootClientDuringInteractiveTransaction(fake.client);

    await runWithTenantDatabaseAccess(
      { tenantId: tenantOne, workspaceId: workspaceOne },
      () => client.$transaction(async tx => {
        await tx.scanJob.findMany({
          where: { tenantId: tenantOne, workspaceId: workspaceOne },
        });
        expect(() => tx.$executeRawUnsafe('SET TRANSACTION READ WRITE'))
          .toThrow('READ WRITE must be the first transaction action');
      }),
    );

    expect(fake.calls).toEqual([
      ['transaction'], ['set_config', tenantOne, workspaceOne, 'false'],
      ['scanJob.findMany'],
    ]);
  });

  it('consumes unscoped raw dispatch before a later tenant prologue', async () => {
    const fake = fakePrismaClient();
    const client = guardRootClientDuringInteractiveTransaction(fake.client);

    await client.$transaction(async tx => {
      await tx.$executeRawUnsafe('SELECT 1');
      runWithTenantDatabaseAccess(
        { tenantId: tenantOne, workspaceId: workspaceOne },
        () => {
          expect(() => tx.$executeRawUnsafe('SET TRANSACTION READ WRITE'))
            .toThrow('READ WRITE must be the first transaction action');
        },
      );
    });

    expect(fake.calls).toEqual([['transaction'], ['raw', 'SELECT 1']]);
  });

  it.each(['read-only', 'read-write', 'shared', 'protected'] as const)(
    'consumes the initial %s action while pending and after delegate failure',
    async initialAction => {
      const failure = new Error('synthetic first delegate failure');
      let rejectFirst!: (reason: Error) => void;
      const pending = new Promise<number>((_resolve, reject) => {
        rejectFirst = reject;
      });
      const fake = fakePrismaClient(() => pending);
      const client = guardRootClientDuringInteractiveTransaction(fake.client);

      await runWithTenantDatabaseAccess(
        { tenantId: tenantOne, workspaceId: workspaceOne },
        () => client.$transaction(async tx => {
          const first = initialAction === 'shared'
            ? tx.sourceCatalogEntry.findMany({ where: { enabled: true } })
            : initialAction === 'protected'
              ? tx.scanJob.findMany({
                where: { tenantId: tenantOne, workspaceId: workspaceOne },
              })
              : tx.$executeRawUnsafe(initialAction === 'read-only'
                ? 'SET TRANSACTION READ ONLY, DEFERRABLE'
                : 'SET TRANSACTION READ WRITE');
          const expectedCalls = initialAction === 'shared'
            ? [['transaction'], ['sourceCatalogEntry.findMany']]
            : initialAction === 'protected'
              ? [['transaction'], ['set_config', tenantOne, workspaceOne, 'false']]
              : [['transaction'], ['raw', initialAction === 'read-only'
                ? 'SET TRANSACTION READ ONLY, DEFERRABLE'
                : 'SET TRANSACTION READ WRITE']];
          // No await between the first dispatch and this concurrent attempt.
          expect(fake.calls).toEqual(expectedCalls);
          expect(() => tx.$executeRawUnsafe('SET TRANSACTION READ WRITE'))
            .toThrow('READ WRITE must be the first transaction action');
          expect(fake.calls).toEqual(expectedCalls);

          const rejected = expect(first).rejects.toBe(failure);
          rejectFirst(failure);
          await rejected;
          expect(() => tx.$executeRawUnsafe('SET TRANSACTION READ WRITE'))
            .toThrow('READ WRITE must be the first transaction action');
          expect(fake.calls).toEqual(expectedCalls);
        }),
      );
    },
  );

  it('uses explicit system access and timeout options for cross-tenant worker operations', async () => {
    const fake = fakePrismaClient();
    const client = guardRootClientDuringInteractiveTransaction(fake.client);

    await runWithSystemDatabaseAccess('outbox relay lease', () =>
      client.outboxEvent.findMany({ where: { status: 'PENDING' } }),
    );

    expect(fake.calls).toEqual([
      ['transaction', implicitTransactionOptions],
      ['set_config', '', '', 'true'],
      ['outboxEvent.findMany'],
    ]);
  });

  it('keeps shared reference tables available without tenant scope', async () => {
    const fake = fakePrismaClient();
    const client = guardRootClientDuringInteractiveTransaction(fake.client);

    await client.sourceCatalogEntry.findMany({ where: { enabled: true } });

    expect(fake.calls).toEqual([['sourceCatalogEntry.findMany']]);
  });

  it('still rejects the root client inside an interactive transaction', async () => {
    const fake = fakePrismaClient();
    const client = guardRootClientDuringInteractiveTransaction(fake.client);

    await expect(
      client.$transaction(async () =>
        client.scanJob.findMany({
          where: { tenantId: tenantOne, workspaceId: workspaceOne },
        }),
      ),
    ).rejects.toThrow('Root Prisma client cannot be used');
  });
});

type FakeDelegate = {
  findMany(args: unknown): Promise<readonly unknown[]>;
  count(args: unknown): Promise<number>;
};

type FakeTransaction = {
  readonly scanJob: FakeDelegate;
  readonly feedItem: FakeDelegate;
  readonly outboxEvent: FakeDelegate;
  readonly sourceCatalogEntry: FakeDelegate;
  $executeRawUnsafe(
    query: string,
    ...values: readonly unknown[]
  ): Promise<number>;
};

type FakeTransactionOptions = {
  readonly isolationLevel?: string;
  readonly maxWait?: number;
  readonly timeout?: number;
};

type FakeClient = FakeTransaction & {
  $transaction<T>(
    operation: (transaction: FakeTransaction) => Promise<T>,
    options?: FakeTransactionOptions,
  ): Promise<T>;
};

function fakePrismaClient(onAction?: () => Promise<unknown>): {
  readonly calls: unknown[][];
  readonly client: FakeClient;
} {
  const calls: unknown[][] = [];
  const delegate = (name: string): FakeDelegate => ({
    async findMany(): Promise<readonly unknown[]> {
      calls.push([`${name}.findMany`]);
      await onAction?.();
      return [];
    },
    async count(): Promise<number> {
      calls.push([`${name}.count`]);
      await onAction?.();
      return 0;
    },
  });
  const transaction: FakeTransaction = {
    scanJob: delegate('scanJob'),
    feedItem: delegate('feedItem'),
    outboxEvent: delegate('outboxEvent'),
    sourceCatalogEntry: delegate('sourceCatalogEntry'),
    async $executeRawUnsafe(query, ...values): Promise<number> {
      calls.push(query.includes("set_config('social_monitor.tenant_id'")
        ? ['set_config', ...values] : ['raw', query, ...values]);
      await onAction?.();
      return 1;
    },
  };
  const client: FakeClient = {
    ...transaction,
    async $transaction<T>(
      operation: (scoped: FakeTransaction) => Promise<T>,
      options?: FakeTransactionOptions,
    ): Promise<T> {
      calls.push(
        options === undefined ? ['transaction'] : ['transaction', options],
      );
      return operation(transaction);
    },
  };
  return { calls, client };
}
