import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client as PgClient } from 'pg';
import { CryptoIdGenerator, redactSensitiveResponseText } from '@social-monitor/shared-kernel';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import { defaultPostgresRuntimePoolConfig, PostgresRuntimePoolRegistry, type PrismaPgRuntimeClientConstructor } from '@social-monitor/platform-persistence';
import { RabbitMqEventPublisher } from '@social-monitor/platform-events/adapters/rabbitmq';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { PrismaDeliveryConnection } from '@social-monitor/delivery/adapters/persistence/prisma/prisma-delivery-connection';
import { PrismaReaderSummaryReadyProjectionStore } from '@social-monitor/delivery/adapters/persistence/prisma/prisma-reader-summary-ready-projection.store';
import { ProjectReaderSummaryReadyEventUseCase } from '@social-monitor/delivery/features/project-reader-summary-ready-event/project-reader-summary-ready-event.use-case';
import { ProjectReaderSummaryReadyEventHandler } from '@social-monitor/delivery/interfaces/events/project-reader-summary-ready-event.handler';
import { withReaderDeliveryPostgresFixture } from './lib/reader-summary-ready-delivery-postgres-fixture';
import { seedRecoveryPostgres, protectRecoveryPostgres } from './lib/reader-summary-ready-recovery-postgres-fixture';
import { readyRecoveryData } from './lib/reader-summary-ready-recovery-data';
import { recoveryPersistence, type RecoveryDatabase } from './lib/reader-summary-ready-recovery-persistence';
import { validateRecoveryEvidence } from './lib/reader-summary-ready-recovery-evidence';
import { bytesSha256, canonicalSha256, type RecoveryManifest } from './lib/reader-summary-ready-recovery-manifest';
import { createRecoveryEvidenceFilesystemTestHarness } from './lib/reader-summary-recovery-evidence-secure-file';
import { recoveryReceipts } from './lib/reader-summary-ready-recovery-receipts';
import { runReadyRecovery } from './lib/reader-summary-ready-recovery-run';

export async function main(): Promise<void> {
  assert.equal(process.env.NODE_ENV, 'test', 'Native recovery gate requires NODE_ENV=test');
  // Secure receipt harness keeps all production filesystem guards; use a private
  // TMPDIR under a non-writable-by-others ancestor, not the shared /tmp directory.
  const directory = mkdtempSync(join(tmpdir(), 'reader-recovery-pg-'));
  const files = createRecoveryEvidenceFilesystemTestHarness(directory);
  try { await withReaderDeliveryPostgresFixture(async ({ runtimeUrl, database }) => {
    const data = readyRecoveryData(4), { manifest, clock } = data;
    await seedRecoveryPostgres(database, data.snapshots);
    const protectedFixture = await protectRecoveryPostgres(database, runtimeUrl);
    const close: (() => Promise<void>)[] = [protectedFixture.cleanup];
    try {
      const Client = loadPrismaRuntimeClient<PrismaPgRuntimeClientConstructor<RecoveryDatabase>>();
      const config = defaultPostgresRuntimePoolConfig(protectedFixture.recoveryUrl, 'event-relay');
      const first = await new PostgresRuntimePoolRegistry().acquire(config, Client); close.push(() => first.close());
      const second = await new PostgresRuntimePoolRegistry().acquire(config, Client); close.push(() => second.close());
      const persistence = recoveryPersistence(first.client, clock), peer = recoveryPersistence(second.client, clock);
      const delivery = await PrismaDeliveryConnection.create(defaultPostgresRuntimePoolConfig(runtimeUrl, 'delivery-service'));
      close.push(() => delivery.close());
      const runtime = new WorkerRuntime({ serviceName: 'reader-recovery-postgres-fixture' }); runtime.onModuleInit();
      close.push(() => runtime.onApplicationShutdown('fixture complete'));
      const handler = new ProjectReaderSummaryReadyEventHandler(new ProjectReaderSummaryReadyEventUseCase(
        new PrismaReaderSummaryReadyProjectionStore(delivery, new CryptoIdGenerator())), new InMemoryMetricsRecorder(), runtime);
      const entry = manifest.events[0]!, race = manifest.events[1]!, failure = manifest.events[2]!, rest = manifest.events[3]!;
      const immutable = async () => (await database.query(`SELECT
        (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM reader_summary_publications p) AS publications,
        (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.publication_id) FROM reader_summary_weekly_publication_evidence e) AS evidence`)).rows[0];
      const before = canonicalSha256(await immutable());
      const systemRole = decodeURIComponent(new URL(runtimeUrl).username).replace(/_runtime$/, '_system');
      await database.query('BEGIN');
      try {
        await database.query(`SET LOCAL ROLE "${systemRole}"; SELECT set_config('social_monitor.system_access','true',true)`);
        await database.query("UPDATE reader_summary_artifacts SET status='SUPERSEDED' WHERE id=$1", [entry.readerSummaryId]);
        await database.query('COMMIT');
      } catch (error) { await database.query('ROLLBACK'); throw error; }
      const [superseded] = await persistence.read([entry]);
      assert.equal(superseded!.publication!.readerSummaryArtifact.status, 'SUPERSEDED');
      assert.equal(await validateRecoveryEvidence(entry, superseded!), null);
      await assert.rejects(database.query("UPDATE reader_summary_artifacts SET headline='tampered' WHERE id=$1", [entry.readerSummaryId]), /immutable/);
      await assert.rejects(database.query("UPDATE reader_summary_publications SET exact_proof='{}' WHERE id=$1", [superseded!.publication!.id]), /immutable/);
      await assert.rejects(database.query("DELETE FROM reader_summary_weekly_publication_evidence WHERE publication_id=$1", [superseded!.publication!.id]), /immutable/);

      // Native microseconds survive a valid transition; a one-microsecond write
      // invisible to JS Date invalidates xmin CAS and cannot be acknowledged.
      await database.query("UPDATE outbox_events SET available_at='2026-09-04T00:00:00.000123Z' WHERE id=$1", [race.eventId]);
      const [initial] = await persistence.read([race]);
      const started = await persistence.transition(initial!.row, 'start');
      assert.equal((await database.query("SELECT to_char(available_at,'US') AS micros FROM outbox_events WHERE id=$1", [race.eventId])).rows[0].micros, '000123');
      await database.query("UPDATE outbox_events SET available_at=available_at+interval '1 microsecond' WHERE id=$1", [race.eventId]);
      const [changed] = await persistence.read([race]);
      assert.equal(changed!.row.availableAt.getTime(), started.availableAt.getTime());
      assert.notEqual(changed!.row.rowVersion, started.rowVersion);
      await assert.rejects(persistence.transition(started, 'published'), /outbox_concurrent_mutation/);
      const races = await Promise.allSettled([persistence.transition(changed!.row, 'start'), peer.transition(changed!.row, 'start')]);
      assert.equal(races.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal((await persistence.read([race]))[0]!.row.publishAttempts, 2);
      await persistence.transition((await persistence.read([race]))[0]!.row, 'failed');

      let sends = 0, cancelled = false, envelope: Record<string, unknown>;
      const publisher = new RabbitMqEventPublisher({
        assertExchange: async () => undefined, assertQueue: async () => undefined, bindQueue: async () => undefined,
        publish: async (_exchange, _routing, bytes, options) => {
          assert(!cancelled); assert.equal(options.mandatory, true); sends += 1;
          envelope = JSON.parse(bytes.toString()) as Record<string, unknown>; return true;
        },
        // Broker outcome is synthetic; consumer inbox/projection is the actual
        // parser, handler, use case and Prisma transaction on native PostgreSQL.
        waitForConfirms: async () => { await handler.handle(envelope); },
      }, { exchange: 'social-monitor.events', mandatory: true });
      const run = (selected: RecoveryManifest) => {
        const bytes = Buffer.from(JSON.stringify(selected));
        return runReadyRecovery({ bytes, reviewedSha256: bytesSha256(bytes), deployedSha: selected.deployedSourceSha,
          apply: true, clock, persistence, publisher, cancelPendingPublishes: () => { cancelled = true; },
          receipts: (m, b) => recoveryReceipts(m, b, files), sleep: ms => new Promise(resolve => setTimeout(resolve, ms)) });
      };
      await run({ ...manifest, events: [entry] });
      const [consumed] = await persistence.read([entry]);
      assert.equal(consumed!.row.status, 'PUBLISHED');
      assert.equal(consumed!.row.publishAttempts, 1);
      assert.equal(await validateRecoveryEvidence(entry, consumed!), consumed!.inbox!.id);
      assert.equal((await handler.handle(envelope!)).duplicate, true);
      await assert.rejects(handler.handle({ ...envelope!, workspaceId: data.id(903),
        payload: { ...(envelope!.payload as object), workspaceId: data.id(903) } }));
      // Fresh registry/client proves retained evidence across a connection restart.
      await second.close();
      const restarted = await new PostgresRuntimePoolRegistry().acquire(config, Client); close.push(() => restarted.close());
      const [retained] = await recoveryPersistence(restarted.client, clock).read([entry]);
      assert.equal(await validateRecoveryEvidence(entry, retained!), consumed!.inbox!.id);
      await assert.rejects(run({ ...manifest, events: [entry] }), /apply_precondition_failed/);
      assert.equal(sends, 1);

      await database.query(`CREATE FUNCTION recovery_fixture_fail_ack() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.id::text=TG_ARGV[0] AND NEW.status='PUBLISHED' THEN RAISE EXCEPTION 'synthetic DB acknowledgement failure'; END IF;
        RETURN NEW; END $$;
        CREATE TRIGGER recovery_fixture_fail_ack BEFORE UPDATE ON outbox_events FOR EACH ROW
        EXECUTE FUNCTION recovery_fixture_fail_ack('${failure.eventId}');`);
      const failManifest = { ...manifest, operationId: data.id(601), events: [failure, rest] };
      await assert.rejects(run(failManifest), /synthetic DB acknowledgement failure/);
      assert.equal(sends, 2);
      const receipt = JSON.parse(readFileSync(join(directory, 'reader-summary-ready-recovery', failManifest.operationId,
        `${failure.eventId}.uncertain.json`), 'utf8')) as object;
      assert.equal((receipt as { confirmed: boolean }).confirmed, true);
      assert.equal((receipt as { acknowledged: boolean }).acknowledged, false);
      const [uncertain, untouched] = await persistence.read([failure, rest]);
      assert.equal(uncertain!.row.status, 'FAILED'); assert.equal(uncertain!.row.publishAttempts, 1);
      assert(uncertain!.inbox); assert.equal(untouched!.row.publishAttempts, 0); assert.equal(untouched!.inbox, null);
      await assert.rejects(run(failManifest), /apply_precondition_failed/);
      await assert.rejects(run({ ...failManifest, operationId: data.id(602) }), /apply_precondition_failed/);
      assert.equal(sends, 2); assert.equal(canonicalSha256(await immutable()), before);

      const rls = new PgClient({ connectionString: runtimeUrl }); await rls.connect();
      try {
        const roles = (await rls.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
        assert.deepEqual(roles, { rolsuper: false, rolbypassrls: false });
        await rls.query('BEGIN');
        for (const [tenant, workspace, visible] of [[entry.tenantId, entry.workspaceId, true],
          [entry.tenantId, data.id(901), false], [data.id(900), data.id(901), false]] as const) {
          await rls.query("SELECT set_config('social_monitor.tenant_id',$1,true),set_config('social_monitor.workspace_id',$2,true),set_config('social_monitor.system_access','true',true)", [tenant, workspace]);
          // Even a forged system setting cannot grant the delivery role capability.
          for (const table of ['outbox_events', 'reader_summary_artifacts', 'reader_summary_jobs', 'reader_summary_publications',
            'reader_summary_weekly_publication_evidence', 'realtime_events']) {
            const rows = await rls.query(`SELECT tenant_id FROM "${table}" WHERE tenant_id=$1 AND workspace_id=$2`, [entry.tenantId, entry.workspaceId]);
            assert.equal(rows.rows.length > 0, visible, `${table} scoped visibility`);
          }
          const inbox = await rls.query('SELECT id FROM inbox_records WHERE tenant_id=$1', [entry.tenantId]);
          assert.equal(inbox.rows.length > 0, tenant === entry.tenantId, 'inbox uses the canonical tenant-only policy');
        }
      } finally { await rls.query('ROLLBACK'); await rls.end(); }
      console.log('Reader recovery native PostgreSQL PASS: immutable supersession, microsecond xmin CAS, concurrent writers, durable consumer, confirm/DB uncertainty, no resend, RLS');
    } finally {
      await closeRecoveryFixture(close);
    }
  }); } finally { rmSync(directory, { recursive: true, force: true }); }
}
async function closeRecoveryFixture(close: (() => Promise<void>)[]): Promise<void> {
  const errors: unknown[] = [];
  for (const cleanup of close.reverse()) { try { await cleanup(); } catch (error) { errors.push(error); } }
  if (errors.length) throw new AggregateError(errors, 'Recovery fixture cleanup failed');
}
if (require.main === module) void main().catch(error => {
  console.error(redactSensitiveResponseText(error instanceof Error ? error.message : 'Reader recovery PostgreSQL fixture failed'));
  process.exitCode = 1;
});
