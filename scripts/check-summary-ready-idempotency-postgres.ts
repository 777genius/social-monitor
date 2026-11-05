import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import { defaultPostgresRuntimePoolConfig, PostgresRuntimePoolRegistry, type PrismaPgRuntimeClientConstructor } from '@social-monitor/platform-persistence';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { redactSensitiveResponseText } from '@social-monitor/shared-kernel';
import { PrismaDeliveryConnection } from '@social-monitor/delivery/adapters/persistence/prisma/prisma-delivery-connection';
import { PrismaSummaryReadyProjectionStore } from '@social-monitor/delivery/adapters/persistence/prisma/prisma-summary-ready-projection.store';
import type { PrismaReaderSummaryProjectionClient } from '@social-monitor/delivery/adapters/persistence/prisma/prisma-reader-summary-projection-client';
import { ProjectSummaryReadyEventUseCase } from '@social-monitor/delivery/features/project-summary-ready-event/project-summary-ready-event.use-case';
import { ProjectSummaryReadyEventHandler } from '@social-monitor/delivery/interfaces/events/project-summary-ready-event.handler';
import { withReaderDeliveryPostgresFixture } from './lib/reader-summary-ready-delivery-postgres-fixture';

async function main(): Promise<void> {
  await withReaderDeliveryPostgresFixture(async ({ runtimeUrl, database }) => {
    const cleanup: Array<() => Promise<void>> = [];
    const errors: unknown[] = [];
    try {
      const config = defaultPostgresRuntimePoolConfig(runtimeUrl, 'delivery-service');
      const delivery = await PrismaDeliveryConnection.create(config);
      cleanup.push(() => delivery.close());
      const Client = loadPrismaRuntimeClient<PrismaPgRuntimeClientConstructor<
        PrismaReaderSummaryProjectionClient & { $disconnect(): Promise<void> }
      >>();
      const peer = await new PostgresRuntimePoolRegistry().acquire(config, Client);
      cleanup.push(() => peer.close());
      const runtime = new WorkerRuntime({ serviceName: 'summary-delivery-postgres-fixture' });
      cleanup.push(() => runtime.onApplicationShutdown('fixture complete'));
      runtime.onModuleInit();
      const metrics = new InMemoryMetricsRecorder();
      const published: Array<{ id: string; sequence: number }> = [];
      const makeHandler = (client: PrismaReaderSummaryProjectionClient) => new ProjectSummaryReadyEventHandler(
        new ProjectSummaryReadyEventUseCase(new PrismaSummaryReadyProjectionStore(client),
          { publish: async event => { const { id, sequence } = event.toSnapshot(); published.push({ id, sequence }); } }), metrics, runtime);
      const tenant = randomUUID();
      const workspace = randomUUID();
      const source = { eventId: randomUUID(), eventType: 'summary.ready', schemaVersion: 1,
        occurredAt: '2026-09-23T00:00:00.000Z', tenantId: tenant, workspaceId: workspace,
        correlationId: 'fixture-correlation', causationId: 'fixture-job',
        payload: { tenantId: tenant, workspaceId: workspace, interestId: 'fixture-interest',
          summaryJobId: 'fixture-job', summaryId: 'fixture-summary', status: 'completed' } };
      const counts = async (expected: number) => {
        const result = await database.query<{ events: number; inbox: number }>(
          'SELECT (SELECT count(*)::int FROM realtime_events) AS events, (SELECT count(*)::int FROM inbox_records) AS inbox');
        assert.deepEqual(result.rows[0], { events: expected, inbox: expected });
      };
      const concurrent = await Promise.all(synchronizedFirstReads([delivery, peer.client])
        .map(client => makeHandler(client).handle(source)));
      assert.equal(concurrent[0]?.realtimeEventId, concurrent[1]?.realtimeEventId);
      assert.deepEqual(concurrent.map(item => item.sequence), [1, 1]);
      await counts(1);

      const restarted = await new PostgresRuntimePoolRegistry().acquire(config, Client);
      cleanup.push(() => restarted.close());
      assert.deepEqual(await makeHandler(restarted.client).handle(source), concurrent[0]);
      assert.equal(published.length, 3);
      assert(published.every(item => item.id === concurrent[0]?.realtimeEventId && item.sequence === 1));
      await counts(1);

      let failBeforeCommit = true;
      const interrupted: PrismaReaderSummaryProjectionClient = { $transaction: (work, options) =>
        delivery.$transaction(async tx => {
          const result = await work(tx);
          if (failBeforeCommit) { failBeforeCommit = false; throw new Error('fixture crash before commit'); }
          return result;
        }, options) };
      const next = { ...source, eventId: randomUUID() };
      await assert.rejects(makeHandler(interrupted).handle(next), /fixture crash before commit/);
      await counts(1);
      assert.equal((await makeHandler(delivery).handle(next)).sequence, 2);
      await counts(2);

      const distinctSources = [{ ...source, eventId: randomUUID() }, { ...source, eventId: randomUUID() }];
      const distinct = await Promise.all(synchronizedFirstReads([delivery, peer.client])
        .map((client, index) => makeHandler(client).handle(distinctSources[index]!)));
      assert.deepEqual(distinct.map(item => item.sequence).sort(), [3, 4]);
      assert.notEqual(distinct[0]?.realtimeEventId, distinct[1]?.realtimeEventId);
      assert.notEqual(distinct[0]?.realtimeEventId, concurrent[0]?.realtimeEventId);
      assert.notEqual(distinct[1]?.realtimeEventId, concurrent[0]?.realtimeEventId);
      assert.deepEqual(await makeHandler(delivery).handle(distinctSources[0]!), distinct[0]);
      assert.deepEqual(await makeHandler(delivery).handle(distinctSources[1]!), distinct[1]);
      await counts(4);

      for (const changed of [
        { ...source, tenantId: randomUUID(), payload: { ...source.payload, tenantId: randomUUID() } },
        { ...source, workspaceId: randomUUID(), payload: { ...source.payload, workspaceId: randomUUID() } },
        { ...source, payload: { ...source.payload, status: 'no_signal' } },
        { ...source, payload: { ...source.payload, userId: 'different-user' } },
        { ...source, causationId: 'different-job' },
      ]) {
        // Keep envelope and payload scope aligned so the store, not parser,
        // proves identity collision handling.
        const aligned = { ...changed, tenantId: changed.payload.tenantId, workspaceId: changed.payload.workspaceId };
        await assert.rejects(makeHandler(delivery).handle(aligned), error => {
          assert(error instanceof Error);
          assert(!error.message.includes(concurrent[0]!.realtimeEventId));
          assert(!error.message.includes(source.payload.summaryId));
          return true;
        });
      }
      await counts(4);
    } catch (error) {
      errors.push(error);
    }
    const closed = await Promise.allSettled(cleanup.reverse().map(close => Promise.resolve().then(close)));
    for (const result of closed) if (result.status === 'rejected') errors.push(result.reason);
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'Summary ready PostgreSQL assertions and cleanup failed');
  });
  console.log('Summary ready PostgreSQL fixture OK: concurrent dedupe, rollback/retry, redelivery, scope collision, sequence contention');
}

function synchronizedFirstReads(clients: readonly PrismaReaderSummaryProjectionClient[]): PrismaReaderSummaryProjectionClient[] {
  let arrivals = 0;
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  return clients.map((client): PrismaReaderSummaryProjectionClient => {
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
  const describe = (failure: unknown): string => failure instanceof AggregateError
    ? [failure.message, ...failure.errors.map(describe)].join('\n')
    : failure instanceof Error ? failure.message : 'Summary ready PostgreSQL fixture failed';
  console.error(redactSensitiveResponseText(describe(error)));
  process.exitCode = 1;
});
