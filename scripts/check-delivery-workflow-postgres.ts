import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type { PrismaDeliveryWorkflowClient } from '@social-monitor/delivery/adapters/persistence/prisma/prisma-delivery-workflow-client';
import { PrismaDeliveryWorkflowStore } from '@social-monitor/delivery/adapters/persistence/prisma/prisma-delivery-workflow.store';
import type { PrismaDeliveryClient } from '@social-monitor/delivery/adapters/persistence/prisma/prisma-delivery-client';
import { PrismaDeliveryAttemptRepository } from '@social-monitor/delivery/adapters/persistence/prisma/prisma-delivery-attempt.repository';
import { SendDeliveryAttemptUseCase } from '@social-monitor/delivery/features/send-delivery-attempt/send-delivery-attempt.use-case';
import { DeliveryTestClock, deferredDelivery, allowDelivery } from '../test/support/delivery-workflow';

// This executable only accepts an explicitly supplied local test database. All
// fixtures belong to fresh random scope; cleanup never touches unrelated rows.
const targetUrl = process.env.DELIVERY_WORKFLOW_TEST_DATABASE_URL;
if (targetUrl === undefined) throw new Error('DELIVERY_WORKFLOW_TEST_DATABASE_URL must explicitly name a local test database');
const target = new URL(targetUrl);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || !/test|sandbox/.test(target.pathname)) {
  throw new Error('Delivery workflow SQL checks require a local test/sandbox database');
}

void main(targetUrl).catch((error: unknown) => { console.error(error); process.exitCode = 1; });

async function main(url: string): Promise<void> {
  const pool = new Pool({ connectionString: url, min: 0, max: 6, statement_timeout: 10_000 });
  const PrismaClient = loadPrismaRuntimeClient<new (options: { adapter: PrismaPg }) => PrismaDeliveryWorkflowClient & PrismaDeliveryClient & { $disconnect(): Promise<void> }>();
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const store = new PrismaDeliveryWorkflowStore(prisma);
  const repository = new PrismaDeliveryAttemptRepository(prisma);
  const tenant = tenantId(randomUUID());
  const workspace = workspaceId(randomUUID());
  const clock = new DeliveryTestClock();
  const ids = { generate: randomUUID };
  const scope = { tenantId: tenant, workspaceId: workspace };
  const ownedScope = (deliveryAttemptId: string) => ({ ...scope, deliveryAttemptId });
  const dispatch = (deliveryAttemptId: string, commandId = randomUUID()) => ({
    ...ownedScope(deliveryAttemptId), commandId, correlationId: `delivery-test:${randomUUID()}`,
    now: clock.now(), recoverBefore: new Date(clock.now().getTime() - 300_000),
  });
  const createAttempt = async () => {
    const id = randomUUID();
    await pool.query(`INSERT INTO delivery_attempts
      (id,tenant_id,workspace_id,idempotency_key,channel,recipient_key,resource_type,resource_id,state,queued_at,max_retries,updated_at)
      VALUES ($1,$2,$3,$4,'webhook','fixture-endpoint','digest','fixture-digest','QUEUED',$5,3,$5)`,
    [id, tenant, workspace, `fixture:${id}`, clock.now()]);
    return id;
  };
  const read = async (id: string) => (await pool.query(`SELECT * FROM delivery_attempts
    WHERE id=$1 AND tenant_id=$2 AND workspace_id=$3`, [id, tenant, workspace])).rows[0] as Record<string, unknown>;
  const commandRows = async (id: string) => (await pool.query(`SELECT id FROM outbox_events
    WHERE tenant_id=$1 AND workspace_id=$2 AND message_kind='COMMAND' AND event_type='delivery.attempt.send'
      AND payload->>'deliveryAttemptId'=$3`, [tenant, workspace, id])).rows as { id: string }[];
  try {
    await pool.query(`INSERT INTO tenants (id,slug,name,updated_at) VALUES ($1,$2,'Delivery workflow test',now())`, [tenant, `delivery-${tenant}`]);
    await pool.query(`INSERT INTO workspaces (id,tenant_id,slug,name,updated_at) VALUES ($1,$2,$3,'Delivery workflow test',now())`, [workspace, tenant, `delivery-${workspace}`]);

    const raced = await createAttempt();
    const dispatches = await Promise.all([store.dispatch(dispatch(raced)), store.dispatch(dispatch(raced))]);
    assert.equal(dispatches.filter((result) => result?.enqueued).length, 1, 'concurrent dispatch must commit one intent');
    const commands = await commandRows(raced);
    assert.equal(commands.length, 1, 'one assembling transition must have exactly one outbox command');
    assert.equal((await read(raced)).state, 'ASSEMBLING');

    const entered = deferredDelivery<void>();
    const release = deferredDelivery<{ accepted: true }>();
    let calls = 0;
    const sender = new SendDeliveryAttemptUseCase(store, [{ channel: 'webhook', send: async () => {
      calls += 1; entered.resolve(); return release.promise;
    } }], allowDelivery, clock, ids);
    const command = { ...ownedScope(raced), dispatchCommandId: commands[0]!.id, content: { body: 'fixture' } };
    const first = sender.execute(command);
    const second = sender.execute(command);
    await entered.promise;
    const duplicate = await Promise.race([first, second]);
    assert(duplicate.ok, 'duplicate claim must acknowledge the existing owner');
    assert.equal(calls, 1, 'simultaneous Prisma claims must call provider once');
    release.resolve({ accepted: true });
    const results = await Promise.all([first, second]);
    assert(results.every((result) => result.ok));
    assert.equal((await read(raced)).state, 'DELIVERED');
    await sender.execute(command);
    assert.equal(calls, 1, 'delivered replay must not send again');

    const rollback = await createAttempt();
    const failingStore = new PrismaDeliveryWorkflowStore({
      $transaction: (work, options) => prisma.$transaction((tx) => work({
        deliveryAttempt: tx.deliveryAttempt,
        outboxEvent: { create: async () => { throw new Error('Test outbox insert failure'); } },
      }), options),
    });
    await assert.rejects(failingStore.dispatch(dispatch(rollback)), /Test outbox insert failure/);
    assert.equal((await read(rollback)).state, 'QUEUED', 'failed outbox insert must roll back assembling');
    assert.equal((await commandRows(rollback)).length, 0);

    const abandoned = await createAttempt();
    const firstToken = randomUUID();
    const claim = { ...ownedScope(abandoned), token: firstToken, now: clock.now(),
      expiresAt: new Date(clock.now().getTime() + 100), recoverBefore: clock.now() };
    assert((await store.claim(claim))?.claimed);
    await store.startSending({ ...ownedScope(abandoned), token: firstToken, now: clock.now() });
    clock.advance(101);
    const expired = await repository.findQueued({ ...scope, limit: 100,
      recovery: { now: clock.now(), recoverBefore: new Date(clock.now().getTime() - 300_000) } });
    assert(expired.some((attempt) => attempt.toSnapshot().id === abandoned), 'polling must include expired sending ownership');
    const secondToken = randomUUID();
    assert((await store.claim({ ...claim, token: secondToken, now: clock.now(),
      expiresAt: new Date(clock.now().getTime() + 100) }))?.claimed);
    assert(await store.renew({ ...ownedScope(abandoned), token: secondToken, now: clock.now(),
      expiresAt: new Date(clock.now().getTime() + 1_000) }));
    clock.advance(150);
    const renewed = await repository.findQueued({ ...scope, limit: 100,
      recovery: { now: clock.now(), recoverBefore: new Date(clock.now().getTime() - 300_000) } });
    assert(!renewed.some((attempt) => attempt.toSnapshot().id === abandoned), 'polling must not recover a renewed owner');
    assert.equal(await store.settle({ ...ownedScope(abandoned), token: firstToken, now: clock.now(), outcome: { kind: 'delivered' } }), null);
    assert.equal(await store.startSending({ ...ownedScope(abandoned), workspaceId: workspaceId(randomUUID()), token: secondToken, now: clock.now() }), null);
    await store.startSending({ ...ownedScope(abandoned), token: secondToken, now: clock.now() });
    assert(await store.settle({ ...ownedScope(abandoned), token: secondToken, now: clock.now(), outcome: { kind: 'delivered' } }));
    assert.equal((await read(abandoned)).retry_count, 1);

    const generation = await createAttempt();
    const older = dispatch(generation);
    await store.dispatch(older);
    clock.advance(300_001);
    const newer = dispatch(generation);
    assert((await store.dispatch(newer))?.enqueued);
    assert.equal((await store.claim({ ...ownedScope(generation), dispatchCommandId: older.commandId, token: randomUUID(),
      now: clock.now(), expiresAt: new Date(clock.now().getTime() + 300_000), recoverBefore: clock.now() }))?.claimed, false);
    assert.equal((await read(generation)).dispatch_command_id, newer.commandId);

    for (const legacy of [false, true]) {
      const retrying = await createAttempt();
      const generationId = randomUUID();
      if (!legacy) await store.dispatch(dispatch(retrying, generationId));
      let retries = 0;
      const retrySender = new SendDeliveryAttemptUseCase(store, [{ channel: 'webhook', send: async () => {
        retries += 1; return { accepted: false, retryable: true, reason: 'Test provider 429' };
      } }], allowDelivery, clock, ids);
      const queueCommand = { ...ownedScope(retrying), dispatchCommandId: generationId, content: { body: 'fixture' } };
      await retrySender.execute(queueCommand);
      await retrySender.execute({ ...queueCommand, dispatchCommandId: undefined });
      await retrySender.execute(queueCommand);
      assert.equal(retries, 2, 'manual retry must not erase the consumed generation fence');
      assert.equal((await read(retrying)).dispatch_command_id, generationId,
        'legacy queue execution must adopt its incoming generation and direct retries must retain it');
    }

    console.log('Delivery workflow PostgreSQL checks OK: dispatch atomicity/concurrency, provider claim/replay, rollback, expired ownership/renewal, stale settlement, workspace scope, stale command and manual-retry generation fencing');
  } finally {
    try {
      await pool.query('DELETE FROM outbox_events WHERE tenant_id=$1 AND workspace_id=$2', [tenant, workspace]);
      await pool.query('DELETE FROM delivery_attempts WHERE tenant_id=$1 AND workspace_id=$2', [tenant, workspace]);
      await pool.query('DELETE FROM workspaces WHERE id=$1 AND tenant_id=$2', [workspace, tenant]);
      await pool.query('DELETE FROM tenants WHERE id=$1', [tenant]);
    } finally {
      await prisma.$disconnect();
      await pool.end();
    }
  }
}
