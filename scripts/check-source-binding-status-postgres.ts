import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import {
  createPrismaPgRuntimeConnection, resolvePostgresRuntimePoolConfig, runWithSystemDatabaseAccess,
  type PrismaPgRuntimeClientConstructor,
} from '@social-monitor/platform-persistence';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import { redactSensitiveText, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import {
  PrismaSourceBindingStatusChangeStore,
  type PrismaSourceBindingStatusChangeClient,
} from '@social-monitor/monitoring/adapters/persistence/prisma/prisma-source-binding-status-change.store';
import type { SourceBindingStatusChange } from '@social-monitor/monitoring/application/contracts/source-binding-status-change-commit';

type ProofClient = PrismaSourceBindingStatusChangeClient & {
  $queryRawUnsafe<T>(sql: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(sql: string, ...values: unknown[]): Promise<number>;
  $disconnect(): Promise<void>;
};

const url = process.env.SOURCE_BINDING_STATUS_TEST_DATABASE_URL;
if (!url) throw new Error('SOURCE_BINDING_STATUS_TEST_DATABASE_URL must be explicitly supplied');
const target = new URL(url);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    !/^architecture_reliability_test_[a-z0-9_]+$/u.test(decodeURIComponent(target.pathname.slice(1)))) {
  throw new Error('Source binding status SQL checks require a local disposable architecture_reliability_test_* database');
}

void run(url).catch((error: unknown) => {
  console.error(redactSensitiveText(error instanceof Error ? error.message : 'Source status PostgreSQL check failed'));
  process.exitCode = 1;
});

async function run(targetUrl: string): Promise<void> {
  const config = resolvePostgresRuntimePoolConfig({
    DATABASE_URL: targetUrl, POSTGRES_RUNTIME_PROCESS: 'api-gateway',
    POSTGRES_RUNTIME_POOL_MIN: '0', POSTGRES_RUNTIME_POOL_MAX: '2',
  });
  const constructor = loadPrismaRuntimeClient<PrismaPgRuntimeClientConstructor<ProofClient>>();
  const runtime = await createPrismaPgRuntimeConnection(config, constructor, (lease) => lease);
  const prisma = runtime.client;
  const query = <T>(sql: string, values: readonly unknown[] = []): Promise<T[]> =>
    runWithSystemDatabaseAccess('source status scoped fixture reads', () =>
      prisma.$queryRawUnsafe<T[]>(sql, ...values));
  const execute = (sql: string, values: readonly unknown[] = []): Promise<number> =>
    runWithSystemDatabaseAccess('source status scoped fixture writes', () =>
      prisma.$executeRawUnsafe(sql, ...values));
  const store = new PrismaSourceBindingStatusChangeStore(prisma);
  const tenant = tenantId(randomUUID());
  const workspace = workspaceId(randomUUID());
  const catalogId = randomUUID();
  const catalogKey = `fixture-status-${catalogId}`;
  const interestIds: string[] = [];
  const bindingIds: string[] = [];
  const now = new Date('2026-10-31T00:00:00Z');

  const addInterest = async (name: string) => {
    const id = randomUUID();
    await execute(`INSERT INTO interests (id,tenant_id,workspace_id,name,query,status,created_at,updated_at)
      VALUES ($1,$2,$3,$4,'source status fixture','ENABLED',$5,$5)`,
    [id, tenant, workspace, name, now]);
    interestIds.push(id);
    return id;
  };
  const addBinding = async (interestId: string, status: 'ENABLED' | 'PAUSED') => {
    const id = randomUUID();
    await execute(`INSERT INTO source_bindings
      (id,tenant_id,workspace_id,interest_id,source_catalog_entry_id,capability_profile_version,status,config,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,1,$6,'{}'::jsonb,$7,$7)`,
    [id, tenant, workspace, interestId, catalogId, status, now]);
    bindingIds.push(id);
    return id;
  };
  const statusOf = async (id: string) => (await query<{ status: string }>(
    `SELECT status::text AS status FROM source_bindings WHERE id=$1 AND tenant_id=$2 AND workspace_id=$3`,
    [id, tenant, workspace]))[0]?.status;
  const eventCount = async (interestId: string) => Number((await query<{ count: bigint }>(
    `SELECT COUNT(*)::bigint AS count FROM outbox_events WHERE tenant_id=$1 AND workspace_id=$2
      AND event_type='monitoring.source-binding.status-changed' AND payload->>'interestId'=$3`,
    [tenant, workspace, interestId]))[0]!.count);
  const receiptCount = async () => Number((await query<{ count: bigint }>(
    `SELECT COUNT(*)::bigint AS count FROM idempotency_keys WHERE tenant_id=$1 AND workspace_id=$2
      AND scope='monitoring.change-source-binding-status'`, [tenant, workspace]))[0]!.count);
  const command = (interestId: string, sourceBindingId: string,
    status: 'enabled' | 'paused', key: string): SourceBindingStatusChange => ({
    command: { tenantId: tenant, workspaceId: workspace, interestId, sourceBindingId,
      status, idempotencyKey: key, correlationId: `status-${key}` },
    eventId: randomUUID(), receiptId: randomUUID(), occurredAt: now,
    maxEnabledSourcesPerInterest: 1,
  });

  try {
    await execute(`INSERT INTO tenants (id,slug,name,updated_at)
      VALUES ($1,$2,'Status transaction test',now())`, [tenant, `status-${tenant}`]);
    await execute(`INSERT INTO workspaces (id,tenant_id,slug,name,updated_at)
      VALUES ($1,$2,$3,'Status transaction test',now())`,
    [workspace, tenant, `status-${workspace}`]);
    await execute(`INSERT INTO source_catalog_entries
      (id,provider_key,display_name,acquisition_mode,readiness,updated_at)
      VALUES ($1,$2,'Status transaction test','api','ready',now())`, [catalogId, catalogKey]);

    const firstInterest = await addInterest('Status quota topic');
    const old = await addBinding(firstInterest, 'PAUSED');
    await addBinding(firstInterest, 'ENABLED');
    const overCapacity = await store.change(command(firstInterest, old, 'enabled', 'old-resume-over-capacity'));
    assert(!overCapacity.ok && overCapacity.error.code === 'operation.quota_exceeded',
      'A resumed binding must respect the full enabled count');
    assert.equal(await statusOf(old), 'PAUSED');
    assert.equal(await eventCount(firstInterest), 0);
    assert.equal(await receiptCount(), 0, 'Rejected status must not persist a receipt reservation');

    const secondInterest = await addInterest('Status rollback topic');
    const active = await addBinding(secondInterest, 'ENABLED');
    const source = prisma as PrismaSourceBindingStatusChangeClient;
    const rejectedEvent = new PrismaSourceBindingStatusChangeStore({
      $transaction: (work, options) => source.$transaction((tx) => work({
        ...tx,
        outboxEvent: { ...tx.outboxEvent,
          create: async () => { throw new Error('Fixture status event insert failure'); },
        },
      }), options),
    });
    const failing = await rejectedEvent.change(command(secondInterest, active, 'paused', 'fail-after-update'));
    assert(!failing.ok && /Fixture status event insert failure/.test(failing.error.message));
    assert.equal(await statusOf(active), 'ENABLED', 'Status update must roll back with failed event insert');
    assert.equal(await eventCount(secondInterest), 0);
    assert.equal(await receiptCount(), 0);

    const paused = await store.change(command(secondInterest, active, 'paused', 'pause-once'));
    assert(paused.ok && paused.value.changed);
    assert.equal(await statusOf(active), 'PAUSED');
    assert.equal(await eventCount(secondInterest), 1);
    assert.equal(await receiptCount(), 1);
    const replay = await store.change(command(secondInterest, active, 'enabled', 'pause-once'));
    assert(replay.ok && !replay.value.changed && replay.value.status === 'paused');
    assert.equal(await statusOf(active), 'PAUSED', 'Idempotent replay must not reverse first committed status');
    assert.equal(await eventCount(secondInterest), 1);
    assert.equal(await receiptCount(), 1);

    const raceInterest = await addInterest('Concurrent status topic');
    const one = await addBinding(raceInterest, 'PAUSED');
    const two = await addBinding(raceInterest, 'PAUSED');
    const contenders = await Promise.all([
      store.change(command(raceInterest, one, 'enabled', 'resume-one')),
      store.change(command(raceInterest, two, 'enabled', 'resume-two')),
    ]);
    assert.equal(contenders.filter((result) => result.ok).length, 1,
      'Serializable predicate locking must accept only one of two competing resumes');
    assert(contenders.some((result) => !result.ok &&
      result.error.code === 'operation.quota_exceeded'));
    const enabled = await query<{ count: bigint }>(`SELECT COUNT(*)::bigint AS count FROM source_bindings
      WHERE tenant_id=$1 AND workspace_id=$2 AND interest_id=$3 AND status='ENABLED'`,
      [tenant, workspace, raceInterest]);
    assert.equal(enabled[0]!.count, 1n, 'No over-capacity source after concurrent commits');
    assert.equal(await eventCount(raceInterest), 1, 'One event for one admitted resume');

    console.log('Source binding status PostgreSQL OK: resume quota, rollback, receipt replay, competing resumes');
  } finally {
    try {
      await execute('DELETE FROM outbox_events WHERE tenant_id=$1 AND workspace_id=$2', [tenant, workspace]);
      await execute('DELETE FROM idempotency_keys WHERE tenant_id=$1 AND workspace_id=$2', [tenant, workspace]);
      await execute('DELETE FROM source_bindings WHERE tenant_id=$1 AND workspace_id=$2', [tenant, workspace]);
      for (const id of interestIds) {
        await execute('DELETE FROM interests WHERE id=$1 AND tenant_id=$2 AND workspace_id=$3', [id, tenant, workspace]);
      }
      await execute('DELETE FROM source_catalog_entries WHERE id=$1', [catalogId]);
      await execute('DELETE FROM workspaces WHERE id=$1 AND tenant_id=$2', [workspace, tenant]);
      await execute('DELETE FROM tenants WHERE id=$1', [tenant]);
    } finally {
      await runtime.close();
    }
  }
}
