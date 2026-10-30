import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPrismaPgRuntimeConnection, resolvePostgresRuntimePoolConfig, runWithSystemDatabaseAccess,
  type PrismaPgRuntimeClientConstructor } from '@social-monitor/platform-persistence';
import { loadPrismaRuntimeClient } from '@social-monitor/platform-persistence/prisma-runtime-client';
import {
  causationId, correlationId, DomainError, eventId, redactSensitiveText,
  tenantId, workspaceId, type TenantId, type WorkspaceId,
} from '@social-monitor/shared-kernel';
import { Interest, type InterestCreatedEvent } from '@social-monitor/monitoring/domain';
import type { InterestCreationCommitPort } from '@social-monitor/monitoring/application/contracts/interest-creation-commit';
import { PrismaInterestCreationStore, type PrismaInterestCreationClient,
  type PrismaInterestCreationTransaction } from '@social-monitor/monitoring/adapters/persistence/prisma/prisma-interest-creation.store';

type Input = Parameters<InterestCreationCommitPort['commit']>[0];
type Outcome = Awaited<ReturnType<InterestCreationCommitPort['commit']>>;
type Transaction = PrismaInterestCreationTransaction;
type Scope = { readonly tenantId: TenantId; readonly workspaceId: WorkspaceId };
type InterestRow = { readonly id: string; readonly name: string; readonly status: string; readonly deletedAt: Date | null };
type ReceiptRow = { readonly key: string; readonly responsePayload: unknown; readonly responseStatus: number | null };
type EventRow = { readonly id: string; readonly createdAt: Date; readonly payload: {
  readonly interestId: string; readonly tenantId: string; readonly workspaceId: string; readonly name: string;
} };

type ProofClient = PrismaInterestCreationClient & {
  $disconnect(): Promise<void>;
  $queryRawUnsafe<T>(sql: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(sql: string, ...values: unknown[]): Promise<number>;
};

const targetUrl = process.env.INTEREST_CREATION_TEST_DATABASE_URL;
if (targetUrl === undefined) throw new Error('INTEREST_CREATION_TEST_DATABASE_URL must explicitly name a local test database');
const target = new URL(targetUrl);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    !/^architecture_reliability_test_[a-z0-9_]+$/u.test(decodeURIComponent(target.pathname.slice(1)))) {
  throw new Error('Interest creation checks require a local architecture_reliability_test_* database');
}

void main(targetUrl).catch((error: unknown) => {
  console.error(redactSensitiveText(error instanceof Error ? error.message : 'Interest creation PostgreSQL check failed'));
  process.exitCode = 1;
});

async function main(url: string): Promise<void> {
  // This standalone two-contender proof uses the existing two-connection API
  // budget; it does not expand the delivery-service production pool budget.
  const config = resolvePostgresRuntimePoolConfig({
    DATABASE_URL: url, POSTGRES_RUNTIME_PROCESS: 'api-gateway',
    POSTGRES_RUNTIME_POOL_MIN: '0', POSTGRES_RUNTIME_POOL_MAX: '2',
  });
  const PrismaClient = loadPrismaRuntimeClient<PrismaPgRuntimeClientConstructor<ProofClient>>();
  const runtime = await createPrismaPgRuntimeConnection(config, PrismaClient, (lease) => lease);
  const prisma = runtime.client;
  const query = <T>(sql: string, values: readonly unknown[] = []): Promise<T[]> =>
    runWithSystemDatabaseAccess('Interest creation scoped fixture reads', () => prisma.$queryRawUnsafe<T[]>(sql, ...values));
  const execute = (sql: string, values: readonly unknown[] = []): Promise<number> =>
    runWithSystemDatabaseAccess('Interest creation scoped fixture writes', () => prisma.$executeRawUnsafe(sql, ...values));
  const store = new PrismaInterestCreationStore(prisma);
  const tenantIds = [tenantId(randomUUID()), tenantId(randomUUID())];
  const scopes: Scope[] = [];
  const now = new Date('2026-10-30T12:00:00.000Z');

  const createScope = async (tenant = tenantIds[0]!): Promise<Scope> => {
    const scope = { tenantId: tenant, workspaceId: workspaceId(randomUUID()) };
    await execute(`INSERT INTO workspaces (id,tenant_id,slug,name,updated_at)
      VALUES ($1,$2,$3,'Interest creation fixture',now())`, [scope.workspaceId, tenant, `interest-${scope.workspaceId}`]);
    scopes.push(scope);
    return scope;
  };
  const input = (scope: Scope, name: string, key: string, maxInterestsPerWorkspace?: number): Input => {
    const interest = Interest.create({ id: randomUUID(), ...scope, name, query: 'isolated fixture query', createdAt: now });
    const snapshot = interest.toSnapshot();
    const event: InterestCreatedEvent = {
      eventId: eventId(randomUUID()), eventType: 'monitoring.interest.created', schemaVersion: 1,
      occurredAt: now, ...scope, correlationId: correlationId(randomUUID()), causationId: causationId(key),
      payload: { interestId: snapshot.id, ...scope, name: snapshot.name, query: snapshot.query },
    };
    return { interest, event, idempotencyKey: key, receiptId: randomUUID(), maxInterestsPerWorkspace };
  };
  const interests = (scope: Scope): Promise<InterestRow[]> => query<InterestRow>(`SELECT id,name,status::text AS status,deleted_at AS "deletedAt"
    FROM interests WHERE tenant_id=$1 AND workspace_id=$2 ORDER BY name`, [scope.tenantId, scope.workspaceId]);
  const events = (scope: Scope): Promise<EventRow[]> => query<EventRow>(`SELECT id,created_at AS "createdAt",payload FROM outbox_events
    WHERE tenant_id=$1 AND workspace_id=$2 AND event_type='monitoring.interest.created' ORDER BY id`, [scope.tenantId, scope.workspaceId]);
  const receipts = (scope: Scope): Promise<ReceiptRow[]> => query<ReceiptRow>(`SELECT key,response_payload AS "responsePayload",response_status AS "responseStatus"
    FROM idempotency_keys WHERE tenant_id=$1 AND workspace_id=$2 AND scope='monitoring.create-interest' ORDER BY key`, [scope.tenantId, scope.workspaceId]);
  const wrapped = (transform: (tx: Transaction) => Transaction): PrismaInterestCreationClient => {
    const transaction: PrismaInterestCreationClient['$transaction'] = (work, options) =>
      prisma.$transaction((tx) => work(transform(tx)), options);
    return new Proxy(prisma, { get: (object, property, receiver) =>
      property === '$transaction' ? transaction : Reflect.get(object, property, receiver) });
  };
  const assertCounts = async (scope: Scope, expected: readonly [number, number, number]) => {
    const savedInterests = await interests(scope);
    const savedEvents = await events(scope);
    const savedReceipts = await receipts(scope);
    assert.deepEqual([savedInterests.length, savedEvents.length, savedReceipts.length], expected,
      'Interest, created-event and completed-receipt counts must agree');
    for (const event of savedEvents) {
      const interest = savedInterests.find((row) => row.id === event.payload.interestId);
      assert(interest, 'Every created event must reference its committed aggregate');
      assert.equal(event.payload.name, interest.name);
      assert.equal(event.payload.tenantId, scope.tenantId);
      assert.equal(event.payload.workspaceId, scope.workspaceId);
      assert.deepEqual(event.createdAt, now, 'Prepared event time must survive transaction retries and relay reconstruction');
    }
    for (const receipt of savedReceipts) {
      assert.notEqual(receipt.responsePayload, null, 'Empty receipt reservation must not commit');
      assert.equal(receipt.responseStatus, 200);
      assert(typeof receipt.responsePayload === 'object' && receipt.responsePayload !== null);
      const payload = receipt.responsePayload as Record<string, unknown>;
      assert.equal(typeof payload.created, 'boolean');
      assert(savedInterests.some((row) => row.id === payload.interestId), 'A completed receipt must reference its committed aggregate');
    }
  };

  try {
    for (const tenant of tenantIds) {
      await execute(`INSERT INTO tenants (id,slug,name,updated_at) VALUES ($1,$2,'Interest creation fixture',now())`, [tenant, `interest-${tenant}`]);
    }

    // Receipt reservation must precede both aggregate/event writes, but a failed
    // later phase must roll all three back in the real PostgreSQL transaction.
    const eventScope = await createScope();
    const eventInput = input(eventScope, 'Event failure fixture', 'event-fault');
    let eventFaultReached = false;
    const eventFailure = new PrismaInterestCreationStore(wrapped((tx) => ({
      ...tx,
      outboxEvent: { ...tx.outboxEvent, create: async () => {
        eventFaultReached = true;
        const written = await tx.interest.findFirst({ where: {
          ...eventScope, id: eventInput.interest.toSnapshot().id, deletedAt: null,
        } });
        assert(written, 'Event failure injection must follow the aggregate write');
        throw new Error('Fixture event-write failure');
      } },
    })));
    await expectInjectedFailure(eventFailure, eventInput, 'Fixture event-write failure');
    assert(eventFaultReached);
    await assertCounts(eventScope, [0, 0, 0]);
    successful(await store.commit(eventInput));
    await assertCounts(eventScope, [1, 1, 1]);

    const receiptScope = await createScope();
    const receiptInput = input(receiptScope, 'Receipt failure fixture', 'receipt-fault');
    let eventWritten = false;
    let receiptFaultReached = false;
    const receiptFailure = new PrismaInterestCreationStore(wrapped((tx) => ({
      ...tx,
      outboxEvent: { ...tx.outboxEvent, create: async (args) => {
        const result = await tx.outboxEvent.create(args); eventWritten = true; return result;
      } },
      idempotencyKey: { ...tx.idempotencyKey, upsert: async (args) => {
        if (args.update.responsePayload !== undefined) {
          assert(eventWritten, 'Final receipt failure must follow a successful event insert');
          receiptFaultReached = true;
          throw new Error('Fixture receipt-write failure');
        }
        return tx.idempotencyKey.upsert(args);
      } },
    })));
    await expectInjectedFailure(receiptFailure, receiptInput, 'Fixture receipt-write failure');
    assert(receiptFaultReached);
    await assertCounts(receiptScope, [0, 0, 0]);
    successful(await store.commit(receiptInput));
    await assertCounts(receiptScope, [1, 1, 1]);

    const keyScope = await createScope();
    const keyGate = twoPartyGate();
    const keyStore = new PrismaInterestCreationStore(wrapped((tx) => ({ ...tx,
      idempotencyKey: { ...tx.idempotencyKey, upsert: async (args) => {
        // Gate before reservation: gating after it deadlocks on the unique key.
        if (args.create.key === 'shared-key') await keyGate();
        return tx.idempotencyKey.upsert(args);
      } },
    })));
    const keyInputs = [input(keyScope, 'Same key alpha', 'shared-key'), input(keyScope, 'Same key beta', 'shared-key')];
    const keyResults = (await Promise.all(keyInputs.map((command) => keyStore.commit(command)))).map(successful);
    assert.equal(keyResults[0]!.interestId, keyResults[1]!.interestId, 'Concurrent same-key commands must share the first committed identity');
    assert.equal(keyResults.filter((result) => result.created).length, 1);
    await assertCounts(keyScope, [1, 1, 1]);
    const originalReceipt = await receipts(keyScope);
    const replay = successful(await new PrismaInterestCreationStore(prisma).commit(input(keyScope, 'Replay changed name', 'shared-key')));
    assert.deepEqual(replay, { interestId: keyResults[0]!.interestId, created: false });
    await assertCounts(keyScope, [1, 1, 1]);
    assert.deepEqual(await receipts(keyScope), originalReceipt, 'Completed receipt must remain immutable after replay');

    const nameScope = await createScope();
    const nameGate = twoPartyGate();
    const nameStore = new PrismaInterestCreationStore(wrapped((tx) => ({ ...tx,
      interest: { ...tx.interest, findFirst: async (args) => {
        const result = await tx.interest.findFirst(args);
        if (args.where.name === 'Shared exact name') await nameGate();
        return result;
      } },
    })));
    const names = (await Promise.all([
      nameStore.commit(input(nameScope, 'Shared exact name', 'name-key-a')),
      nameStore.commit(input(nameScope, 'Shared exact name', 'name-key-b')),
    ])).map(successful);
    assert.equal(names[0]!.interestId, names[1]!.interestId);
    assert.equal(names.filter((result) => result.created).length, 1);
    await assertCounts(nameScope, [1, 1, 2]);

    const quotaScope = await createScope();
    successful(await store.commit(input(quotaScope, 'Existing slot', 'existing-slot', 2)));
    const quotaGate = twoPartyGate();
    const quotaStore = new PrismaInterestCreationStore(wrapped((tx) => ({ ...tx,
      interest: { ...tx.interest, count: async (args) => {
        const result = await tx.interest.count(args); await quotaGate(); return result;
      } },
    })));
    const quota = await Promise.all([
      quotaStore.commit(input(quotaScope, 'Last slot alpha', 'slot-a', 2)),
      quotaStore.commit(input(quotaScope, 'Last slot beta', 'slot-b', 2)),
    ]);
    assert.equal(quota.filter((result) => result.ok).length, 1, 'Exactly one contender may consume the last capacity slot');
    const rejected = quota.find((result) => !result.ok)!;
    domainFailure(rejected, 'operation.quota_exceeded');
    await assertCounts(quotaScope, [2, 2, 2]);

    const archiveScope = await createScope();
    const archived = successful(await store.commit(input(archiveScope, 'Exact Case Topic', 'archive-original', 1)));
    await execute(`UPDATE interests SET status='ARCHIVED',deleted_at=$1
      WHERE id=$2 AND tenant_id=$3 AND workspace_id=$4`, [now, archived.interestId, archiveScope.tenantId, archiveScope.workspaceId]);
    domainFailure(await store.commit(input(archiveScope, 'Exact Case Topic', 'archive-conflict', 1)), 'operation.conflict');
    await assertCounts(archiveScope, [1, 1, 1]);
    const lower = successful(await store.commit(input(archiveScope, 'exact case topic', 'case-sensitive', 1)));
    assert.notEqual(lower.interestId, archived.interestId, 'Distinct-case names must match durable unique-key semantics');
    const trimmed = successful(await store.commit(input(archiveScope, '  exact case topic  ', 'trimmed-duplicate', 1)));
    assert.deepEqual(trimmed, { interestId: lower.interestId, created: false });
    await assertCounts(archiveScope, [2, 2, 3]);
    const archivedRow = (await interests(archiveScope)).find((row) => row.id === archived.interestId)!;
    assert.equal(archivedRow.status, 'ARCHIVED');
    assert(archivedRow.deletedAt, 'An archived name must never be resurrected');

    const scopeA = await createScope();
    const scopeB = await createScope();
    const scopeC = await createScope(tenantIds[1]!);
    const scopedResults = [];
    for (const scope of [scopeA, scopeB, scopeC]) {
      scopedResults.push(successful(await store.commit(input(scope, 'Scoped same name', 'scoped-same-key', 1))));
      await assertCounts(scope, [1, 1, 1]);
    }
    assert.equal(new Set(scopedResults.map((result) => result.interestId)).size, 3, 'Receipt/name/capacity scope must include tenant and workspace');

    console.log('Interest creation PostgreSQL checks OK: event/receipt rollback, same-key and same-name contention, last-slot capacity, immutable replay, tenant/workspace, archive and exact-case semantics');
  } finally {
    try {
      for (const scope of scopes) {
        await execute('DELETE FROM outbox_events WHERE tenant_id=$1 AND workspace_id=$2', [scope.tenantId, scope.workspaceId]);
        await execute("DELETE FROM idempotency_keys WHERE tenant_id=$1 AND workspace_id=$2 AND scope='monitoring.create-interest'", [scope.tenantId, scope.workspaceId]);
        await execute('DELETE FROM interests WHERE tenant_id=$1 AND workspace_id=$2', [scope.tenantId, scope.workspaceId]);
        await execute('DELETE FROM workspaces WHERE id=$1 AND tenant_id=$2', [scope.workspaceId, scope.tenantId]);
      }
      for (const tenant of tenantIds) await execute('DELETE FROM tenants WHERE id=$1', [tenant]);
    } finally {
      await runtime.close();
    }
  }
}

function successful(result: Outcome) {
  if (!result.ok) throw result.error;
  return result.value;
}

function domainFailure(result: Outcome, code: string): void {
  assert(!result.ok, `Expected ${code}`);
  assert(result.error instanceof DomainError,
    `Expected domain ${code}; received ${redactSensitiveText(result.error.message)} ${errorCodes(result.error)}`);
  assert.equal(result.error.code, code);
}

async function expectInjectedFailure(store: InterestCreationCommitPort, command: Input, message: string): Promise<void> {
  const outcome = await store.commit(command).then((result) => result.ok ? null : result.error, (error: unknown) => error);
  assert(outcome instanceof Error, 'Injected write failure must prevent command success');
  assert.match(outcome.message, new RegExp(message));
}

function twoPartyGate(): () => Promise<void> {
  let reads = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  return async () => { if (++reads >= 2) release(); await ready; };
}

function errorCodes(error: unknown): string {
  const chain = [];
  let value = error;
  for (let depth = 0; depth < 3 && typeof value === 'object' && value !== null; depth += 1) {
    const record = value as Record<string, unknown>;
    chain.push(Object.fromEntries(['name', 'code', 'kind', 'originalCode'].map((key) =>
      [key, typeof record[key] === 'string' ? record[key] : undefined])));
    value = record.cause;
  }
  return JSON.stringify(chain);
}
