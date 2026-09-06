import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';

import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, type PoolConfig } from 'pg';
import { PrismaFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/prisma/prisma-feed-item-read.repository';
import type { PrismaFeedClient } from '@social-monitor/feed/adapters/persistence/prisma/prisma-feed-client';
import {
  currentDatabaseAccess,
  defaultPostgresRuntimePoolConfig,
  PostgresRuntimePoolRegistry,
  runWithTenantDatabaseAccess,
  type PrismaPgRuntimeClientConstructor,
} from '@social-monitor/platform-persistence';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { CountReaderSummaryCollectedFeedItemsQuery } from '@social-monitor/summary/ports';
import { PrismaReaderSummaryProviderCollectionHealthReader } from '@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-provider-collection-health.reader';
import { FeedReaderSummaryCoverageCounter } from '@social-monitor/summary/adapters/evidence/feed-reader-summary-coverage.counter';

const scope = {
  tenantId: tenantId('11111111-1111-4111-8111-111111111111'),
  workspaceId: workspaceId('22222222-2222-4222-8222-222222222222'),
};
const query: CountReaderSummaryCollectedFeedItemsQuery = {
  ...scope,
  scope: { type: 'workspace' },
  period: {
    cadence: 'daily',
    periodKey: 'daily:2026-09-01T00:00:00.000Z:2026-09-02T00:00:00.000Z:UTC',
    startedAt: new Date('2026-09-01T00:00:00Z'),
    endedAt: new Date('2026-09-02T00:00:00Z'),
    timezone: 'UTC',
  },
};
type RuntimeClient = PrismaFeedClient & {
  $disconnect(): Promise<void>;
  $queryRaw<T>(query: TemplateStringsArray, ...values: readonly unknown[]): Promise<T>;
  $executeRawUnsafe(query: string): Promise<number>;
};
type Statement = { readonly text: string; readonly values: readonly unknown[] };

// Adapted from R1's actual installed-pg/Prisma strict-process harness. Only the
// wire client is fake: it has no socket, URL lookup, provider or database access.
class NoNetworkClient extends EventEmitter {
  readonly _queryable = true;
  readonly _ending = false;
  static statements: Statement[] = [];
  static rejectConfiguration = false;

  connect(callback: (error?: Error) => void): void {
    queueMicrotask(() => callback());
  }

  async query(statement: Statement) {
    NoNetworkClient.statements.push(statement);
    if (statement.text.includes('set_config') && NoNetworkClient.rejectConfiguration) {
      throw new Error('TEST scope configuration failed');
    }
    if (statement.text === 'SELECT sandbox_failure') {
      throw new Error('TEST statement failed');
    }
    return { command: '', rowCount: 0, rows: [], fields: [] };
  }

  end(callback?: () => void): void {
    this.emit('end');
    callback?.();
  }
}

async function verify(): Promise<void> {
  const config = {
    ...defaultPostgresRuntimePoolConfig(
      'postgresql://no-network.invalid/coverage_rejection_test', 'api-gateway',
    ),
    connectionTimeoutMillis: 100,
  };
  const pool = new Pool({
    min: 0,
    max: 2,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    Client: NoNetworkClient,
  } as unknown as PoolConfig);
  const registry = new PostgresRuntimePoolRegistry({
    createPool: () => pool,
    createAdapter: (ownedPool) => new PrismaPg(ownedPool, { disposeExternalPool: false }),
  });
  const Client = loadPrismaRuntimeClient<PrismaPgRuntimeClientConstructor<RuntimeClient>>();
  const lease = await registry.acquire(config, Client);
  const counter = new FeedReaderSummaryCoverageCounter(
    new PrismaFeedItemReadRepository(lease.client),
    new PrismaReaderSummaryProviderCollectionHealthReader(lease.client),
  );
  // pg timeouts are unref'ed; this substitutes for the real sockets' liveness.
  const keepAlive = setInterval(() => undefined, 1000);
  let releases = 0;
  pool.on('release', () => { releases += 1; });
  try {
    const held = await Promise.all([pool.connect(), pool.connect()]);
    const acquisitionErrors: unknown[] = [];
    const connect = pool.connect.bind(pool);
    // Record original pg error identities, then return their rejections intact.
    pool.connect = (() => connect().catch((error: unknown) => {
      acquisitionErrors.push(error);
      throw error;
    })) as typeof pool.connect;
    try {
      const results = await runWithTenantDatabaseAccess(scope, () =>
        Promise.allSettled(Array.from({ length: 7 }, () =>
          counter.countCollectedFeedItemCoverage(query))),
      );
      assert.equal(results.length, 7);
      for (const result of results) {
        assert.equal(result.status, 'rejected');
        if (result.status !== 'rejected') throw new Error('Expected caller failure');
        assert(acquisitionErrors.includes(result.reason));
        assert.match((result.reason as Error).message, /timeout exceeded when trying to connect/);
        assert.match((result.reason as Error).stack ?? '', /pg-pool/);
      }
      // The rejected join may precede the other seven timeouts. Keep both slots
      // held until every losing branch can reject under strict Node as well.
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(acquisitionErrors.length, 14, 'exactly one health and feed request per call');
      assert.equal(pool.waitingCount, 0);
      assert.equal(pool.totalCount, 2);
      assert.equal(releases, 0);
      assert.equal(NoNetworkClient.statements.length, 0);
    } finally {
      held.forEach((connection) => connection.release());
    }

    // The same bounded runtime recovers and still scopes both successful reads.
    const coverage = await runWithTenantDatabaseAccess(scope, () =>
      counter.countCollectedFeedItemCoverage(query));
    assert.deepEqual(coverage, {
      collectedFeedItemCount: 0,
      lowRelevanceFeedItemCount: 0,
      mutedFeedItemCount: 0,
      userRatedFeedItemCount: 0,
      providerBreakdown: [],
      topicBreakdown: [],
      queryBreakdown: [],
    });
    assert.equal(releases, 4);
    assert.equal(pool.idleCount, 2);
    assertScopes(2);
    const sql = NoNetworkClient.statements.map(({ text }) => text);
    assert.equal(sql.filter((text) => text === 'BEGIN').length, 2);
    assert.equal(sql.filter((text) => text === 'COMMIT').length, 2);
    assert.equal(sql.filter((text) => text.includes('latest_binding_scans')).length, 1);
    assert.equal(sql.filter((text) => text.includes('"public"."feed_items"')).length, 1);

    // Preserve R1's scope/rollback/release invariants on this recovered pool.
    for (const stage of ['configuration', 'statement', 'callback'] as const) {
      NoNetworkClient.statements = [];
      NoNetworkClient.rejectConfiguration = stage === 'configuration';
      const before: number = releases;
      const callbackError = new Error('TEST callback failed');
      let callbacks = 0;
      await assert.rejects(runWithTenantDatabaseAccess(scope, () => {
        if (stage !== 'callback') return lease.client.$executeRawUnsafe('SELECT sandbox_failure');
        assert(lease.client.$transaction);
        return lease.client.$transaction(async (transaction) => {
          callbacks += 1;
          assert(transaction.$executeRawUnsafe);
          await transaction.$executeRawUnsafe('SELECT sandbox_success');
          await transaction.$executeRawUnsafe('SELECT sandbox_success');
          throw callbackError;
        }, { isolationLevel: 'Serializable', maxWait: 1234, timeout: 5678 });
      }), (error: unknown) => stage === 'callback' ? error === callbackError :
        error instanceof Error && error.message.includes(
          stage === 'configuration' ? 'TEST scope configuration failed' : 'TEST statement failed'));
      assert.equal(callbacks, stage === 'callback' ? 1 : 0);
      assertScopes(1);
      assert.deepEqual(NoNetworkClient.statements.map(({ text }) =>
        text.includes('set_config') ? 'scope' : text),
      stage === 'callback'
        ? ['BEGIN', 'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE', 'scope',
          'SELECT sandbox_success', 'SELECT sandbox_success', 'ROLLBACK']
        : stage === 'configuration' ? ['BEGIN', 'scope', 'ROLLBACK']
          : ['BEGIN', 'scope', 'SELECT sandbox_failure', 'ROLLBACK']);
      assert.equal(releases, before + 1);
      assert.equal(pool.idleCount, pool.totalCount);
      assert.equal(pool.waitingCount, 0);
    }
    assert.equal(currentDatabaseAccess(), undefined);
    await lease.close();
    await lease.close();
    assert.deepEqual(registry.diagnostics(), {
      poolInstances: 0, prismaClientInstances: 0, activeConnectionLeases: 0, closing: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    process.stdout.write('verified pressure\n');
  } finally {
    clearInterval(keepAlive);
    await lease.close();
  }
}

function assertScopes(count: number): void {
  const configurations = NoNetworkClient.statements.filter(({ text }) => text.includes('set_config'));
  assert.equal(configurations.length, count);
  for (const statement of configurations) {
    assert.deepEqual(statement.values, [scope.tenantId, scope.workspaceId, 'false']);
    assert.match(statement.text, /set_config\('social_monitor.tenant_id', \$1, true\)/);
    assert.match(statement.text, /set_config\('social_monitor.workspace_id', \$2, true\)/);
    assert.match(statement.text, /set_config\('social_monitor.system_access', \$3, true\)/);
  }
}

if (require.main === module) {
  void verify().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
} else {
  describe('coverage under actual installed-pg/Prisma pool pressure', () => {
    it('returns acquisition errors, recovers and preserves scoped rollback under strict Node', () => {
      const output = execFileSync(process.execPath, [
        '--unhandled-rejections=strict',
        '--max-old-space-size=4096',
        '-r', 'ts-node/register/transpile-only',
        '-r', 'tsconfig-paths/register',
        __filename,
      ], {
        cwd: process.cwd(),
        env: { ...process.env, TS_NODE_PROJECT: 'test/tsconfig.jest.json' },
        encoding: 'utf8',
        timeout: 20_000,
      });
      expect(output.trim()).toBe('verified pressure');
    }, 25_000);
  });
}
