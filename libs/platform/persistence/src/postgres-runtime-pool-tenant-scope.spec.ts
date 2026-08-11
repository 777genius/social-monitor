import {
  runWithSystemDatabaseAccess,
  runWithTenantDatabaseAccess,
} from './database-access-context';
import { guardRootClientDuringInteractiveTransaction } from './postgres-runtime-pool-transaction-guard';

const tenantOne = '11111111-1111-4111-8111-111111111111';
const workspaceOne = '22222222-2222-4222-8222-222222222222';
const tenantTwo = '33333333-3333-4333-8333-333333333333';

describe('PostgreSQL runtime tenant scope', () => {
  it('sets transaction-local scope before an inferred tenant operation', async () => {
    const fake = fakePrismaClient();
    const client = guardRootClientDuringInteractiveTransaction(fake.client);

    await client.scanJob.findMany({
      where: { tenantId: tenantOne, workspaceId: workspaceOne },
    });

    expect(fake.calls).toEqual([
      ['transaction'],
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

  it('uses explicit system access for cross-tenant worker operations', async () => {
    const fake = fakePrismaClient();
    const client = guardRootClientDuringInteractiveTransaction(fake.client);

    await runWithSystemDatabaseAccess('outbox relay lease', () =>
      client.outboxEvent.findMany({ where: { status: 'PENDING' } }),
    );

    expect(fake.calls).toEqual([
      ['transaction'],
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

type FakeClient = FakeTransaction & {
  $transaction<T>(
    operation: (transaction: FakeTransaction) => Promise<T>,
  ): Promise<T>;
};

function fakePrismaClient(): {
  readonly calls: unknown[][];
  readonly client: FakeClient;
} {
  const calls: unknown[][] = [];
  const delegate = (name: string): FakeDelegate => ({
    async findMany(): Promise<readonly unknown[]> {
      calls.push([`${name}.findMany`]);
      return [];
    },
    async count(): Promise<number> {
      calls.push([`${name}.count`]);
      return 0;
    },
  });
  const transaction: FakeTransaction = {
    scanJob: delegate('scanJob'),
    feedItem: delegate('feedItem'),
    outboxEvent: delegate('outboxEvent'),
    sourceCatalogEntry: delegate('sourceCatalogEntry'),
    async $executeRawUnsafe(_query, ...values): Promise<number> {
      calls.push(['set_config', ...values]);
      return 1;
    },
  };
  const client: FakeClient = {
    ...transaction,
    async $transaction<T>(
      operation: (scoped: FakeTransaction) => Promise<T>,
    ): Promise<T> {
      calls.push(['transaction']);
      return operation(transaction);
    },
  };
  return { calls, client };
}
