import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client as PgClient } from 'pg';
import { CryptoIdGenerator, FixedClock, redactSensitiveResponseText, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { defaultPostgresRuntimePoolConfig, runWithTenantDatabaseAccess, PostgresRuntimePoolRegistry, type PrismaPgRuntimeClientConstructor } from '@social-monitor/platform-persistence';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { PrismaOutboxStoreAdapter, type PrismaEventStoreClient } from '@social-monitor/platform-events/adapters/prisma';
import { OutboxDispatcher } from '@social-monitor/platform-events';
import { PrismaDeliveryConnection } from '@social-monitor/delivery/adapters/persistence/prisma/prisma-delivery-connection';
import { PrismaRealtimeEventRepository } from '@social-monitor/delivery/adapters/persistence/prisma/prisma-realtime-event.repository';
import { PrismaReaderSummaryReadyProjectionStore } from '@social-monitor/delivery/adapters/persistence/prisma/prisma-reader-summary-ready-projection.store';
import type { PrismaReaderSummaryProjectionClient } from '@social-monitor/delivery/adapters/persistence/prisma/prisma-reader-summary-projection-client';
import { ProjectReaderSummaryReadyEventUseCase } from '@social-monitor/delivery/features/project-reader-summary-ready-event/project-reader-summary-ready-event.use-case';
import { ProjectReaderSummaryReadyEventHandler } from '@social-monitor/delivery/interfaces/events/project-reader-summary-ready-event.handler';
import { readerSummaryReadyFixture } from '@social-monitor/delivery/test-support/reader-summary-ready.fixture';
import { withReaderDeliveryPostgresFixture } from './lib/reader-summary-ready-delivery-postgres-fixture';

async function main(): Promise<void> {
  await withReaderDeliveryPostgresFixture(async ({ runtimeUrl, adminUrl, database }) => {
    const config = defaultPostgresRuntimePoolConfig(runtimeUrl, 'delivery-service');
    const delivery = await PrismaDeliveryConnection.create(config);
    // Separate registries model separate worker processes, retaining the real
    // max=1 pool per worker. Sharing one registry would serialize the race and
    // reject the distinct admin URL before exercising the outbox adapter.
    const Client = loadPrismaRuntimeClient<PrismaPgRuntimeClientConstructor<
      PrismaReaderSummaryProjectionClient & PrismaEventStoreClient & { $disconnect(): Promise<void> }
    >>();
    const peer = await new PostgresRuntimePoolRegistry().acquire(config, Client);
    const events = await new PostgresRuntimePoolRegistry().acquire(defaultPostgresRuntimePoolConfig(adminUrl, 'event-relay'), Client);
    const runtime = new WorkerRuntime({ serviceName: 'reader-delivery-postgres-fixture' });
    runtime.onModuleInit();
    const metrics = new InMemoryMetricsRecorder();
    const makeHandler = (client: PrismaReaderSummaryProjectionClient) => new ProjectReaderSummaryReadyEventHandler(
      new ProjectReaderSummaryReadyEventUseCase(new PrismaReaderSummaryReadyProjectionStore(client, new CryptoIdGenerator())), metrics, runtime);
    const base = readerSummaryReadyFixture();
    const input = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    const assertCounts = async (expected: number) => {
      const result = await database.query<{ projections: number; inbox: number }>(
        'SELECT (SELECT count(*)::int FROM realtime_events) AS projections, (SELECT count(*)::int FROM inbox_records) AS inbox');
      assert.deepEqual(result.rows[0], { projections: expected, inbox: expected });
    };
    try {
      // Two real transactions race on the same durable consumer/event identity.
      const racing = synchronizedFirstReads([delivery, peer.client]);
      const first = await Promise.all(racing.map(client => makeHandler(client).handle(input)));
      assert.equal(first.filter(result => !result.duplicate).length, 1);
      assert.equal(first[0]?.realtimeEventId, first[1]?.realtimeEventId);
      await assertCounts(1);

      // Simulate process loss after COMMIT, before broker ACK, with a fresh
      // connection and handler. The replacement reads the committed inbox.
      const restarted = await new PostgresRuntimePoolRegistry().acquire(config, Client);
      try { assert.equal((await makeHandler(restarted.client).handle(input)).duplicate, true); }
      finally { await restarted.close(); }
      await assertCounts(1);

      // Force actual transaction rollback after both inserts but before COMMIT.
      let failBeforeCommit = true;
      const interrupted: PrismaReaderSummaryProjectionClient = {
        $transaction: (work, options) => delivery.$transaction(async tx => {
          const result = await work(tx);
          if (failBeforeCommit) { failBeforeCommit = false; throw new Error('fixture crash before commit'); }
          return result;
        }, options),
      };
      const next = { ...input, eventId: randomUUID() };
      await assert.rejects(makeHandler(interrupted).handle(next), /fixture crash before commit/);
      await assertCounts(1);
      assert.equal((await makeHandler(delivery).handle(next)).sequence, 2);
      await assertCounts(2);

      // Distinct publications contend on the same scoped channel sequence.
      const different = await Promise.all(synchronizedFirstReads([delivery, peer.client])
        .map(client => makeHandler(client).handle({ ...input, eventId: randomUUID() })));
      assert.deepEqual(different.map(result => result.sequence).sort(), [3, 4]);
      await assertCounts(4);

      const repository = new PrismaRealtimeEventRepository(delivery);
      const channel = `workspace:${base.workspaceId}:summary-status`;
      const read = (tenant: string, workspace: string) => runWithTenantDatabaseAccess({ tenantId: tenant, workspaceId: workspace },
        () => repository.list({ tenantId: tenantId(tenant), workspaceId: workspaceId(workspace), channel, limit: 10 }));
      assert.equal((await read(base.payload.tenantId, base.payload.workspaceId)).events.length, 4);
      assert.equal((await read(randomUUID(), randomUUID())).events.length, 0);
      assert.equal((await read(base.payload.tenantId, randomUUID())).events.length, 0);
      // The ORM guard rejects a forged query before SQL. Separately prove
      // database RLS with raw SQL, keeping the same target rows for every scope.
      await assert.rejects(async () => runWithTenantDatabaseAccess(
        { tenantId: randomUUID(), workspaceId: randomUUID() },
        () => repository.list({ ...base.payload, channel, limit: 10 }),
      ), /Prisma operation conflicts with database access scope/);
      const rls = new PgClient({ connectionString: runtimeUrl });
      await rls.connect();
      try {
        await rls.query('BEGIN');
        const visible = async (tenant: string, workspace: string) => {
          await rls.query("SELECT set_config('social_monitor.tenant_id',$1,true), set_config('social_monitor.workspace_id',$2,true), set_config('social_monitor.system_access','false',true)",
            [tenant, workspace]);
          return (await rls.query('SELECT id FROM realtime_events WHERE tenant_id=$1 AND workspace_id=$2 AND channel=$3',
            [base.payload.tenantId, base.payload.workspaceId, channel])).rows.length;
        };
        assert.equal(await visible(base.payload.tenantId, base.payload.workspaceId), 4);
        assert.equal(await visible(base.payload.tenantId, randomUUID()), 0);
        assert.equal(await visible(randomUUID(), randomUUID()), 0);
      } finally {
        await rls.query('ROLLBACK');
        await rls.end();
      }

      const foreignWorkspace = randomUUID();
      await assert.rejects(makeHandler(delivery).handle({ ...input, workspaceId: foreignWorkspace,
        payload: { ...base.payload, workspaceId: foreignWorkspace } }));
      await assert.rejects(makeHandler(delivery).handle({ ...input, tenantId: randomUUID() }));
      await assert.rejects(makeHandler(delivery).handle({ ...input, schemaVersion: 2 }));
      await assertCounts(4);

      const outboxId = randomUUID();
      await database.query(`INSERT INTO outbox_events
        (id, tenant_id, workspace_id, event_type, schema_version, payload, correlation_id)
        VALUES ($1, $2, $3, 'reader_summary.ready', 1, $4, 'fixture')`,
        [outboxId, base.tenantId, base.workspaceId, JSON.stringify(base.payload)]);
      const outbox = new PrismaOutboxStoreAdapter(events.client, new FixedClock(base.occurredAt));
      const result = await new OutboxDispatcher(outbox, { publish: async () => {
        throw new Error('NO_ROUTE access_token=fixture-token\n' + 'x'.repeat(600));
      } }).dispatchBatch(1);
      assert.deepEqual(result, { published: 0, failed: 1 });
      const row = (await database.query('SELECT status, publish_attempts, last_error FROM outbox_events WHERE id=$1', [outboxId])).rows[0];
      assert.equal(row.status, 'FAILED');
      assert.equal(row.publish_attempts, 1);
      assert.match(row.last_error, /NO_ROUTE access_token=\[REDACTED\]/);
      assert(!row.last_error.includes('fixture-token') && row.last_error.length <= 500);
      // Counter describes recorded starts, never historical total sends.
      await outbox.recordAttempt(outboxId);
      assert.equal((await database.query('SELECT publish_attempts FROM outbox_events WHERE id=$1', [outboxId])).rows[0].publish_attempts, 2);
      await outbox.markPublished(outboxId);
      assert.equal((await database.query('SELECT last_error FROM outbox_events WHERE id=$1', [outboxId])).rows[0].last_error, null);
      console.log('Reader summary delivery PostgreSQL fixture OK: atomic rollback, concurrent dedupe, restart replay, RLS isolation, diagnostics');
    } finally {
      await runtime.onApplicationShutdown('fixture complete');
      await delivery.close();
      await peer.close();
      await events.close();
    }
  });
}
// Both initial inbox reads complete before either transaction may write. Retry
// attempts pass through, so the test forces a real overlapping snapshot race.
function synchronizedFirstReads(clients: readonly PrismaReaderSummaryProjectionClient[]): PrismaReaderSummaryProjectionClient[] {
  let arrivals = 0;
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  return clients.map(client => {
    let firstRead = true;
    return { $transaction: (work, options) => client.$transaction(tx => work({ realtimeEvent: tx.realtimeEvent,
      inboxRecord: { create: args => tx.inboxRecord.create(args), findUnique: async args => {
        const record = await tx.inboxRecord.findUnique(args);
        if (firstRead) {
          firstRead = false;
          arrivals += 1;
          if (arrivals === clients.length) release();
          await barrier;
        }
        return record;
      } },
    }), options) };
  });
}

void main().catch(error => {
  console.error(redactSensitiveResponseText(error instanceof Error ? error.message : 'Reader delivery PostgreSQL fixture failed'));
  process.exitCode = 1;
});
