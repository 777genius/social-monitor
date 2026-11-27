import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client, type Pool } from 'pg';
import { OutboxDispatcher, type EventPublisherPort, type OutboxStorePort } from '@social-monitor/platform-events';
import { PrismaOutboxStoreAdapter, type PrismaEventOutboxClient } from '@social-monitor/platform-events/adapters/prisma';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

type Fixture = {
  readonly database: Pool;
  readonly adminUrl: string;
  readonly first: PrismaEventOutboxClient;
  readonly second: PrismaEventOutboxClient;
  readonly event: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly payload: object;
    readonly occurredAt: Date;
  };
  readonly project: EventPublisherPort['publish'];
};

/** Runs only inside the existing disposable reader-delivery PostgreSQL fixture. */
export async function checkEventOutboxPostgresRecovery(f: Fixture): Promise<void> {
  const first = new PrismaOutboxStoreAdapter(f.first);
  const second = new PrismaOutboxStoreAdapter(f.second);
  const clock = new SystemClock();
  const ids = new CryptoIdGenerator();
  const created: string[] = [];
  let seedOrdinal = 0;
  const seed = async (options: {
    kind?: 'EVENT' | 'COMMAND'; status?: 'PENDING' | 'FAILED'; attempts?: number; future?: boolean;
  } = {}): Promise<string> => {
    const id = randomUUID();
    const ordinal = ++seedOrdinal;
    created.push(id);
    await f.database.query(`INSERT INTO outbox_events
      (id, tenant_id, workspace_id, message_kind, event_type, schema_version,
       payload, status, correlation_id, causation_id, created_at, available_at, publish_attempts)
      VALUES ($1,$2,$3,$4,'reader_summary.ready',1,$5,$6,'relay-recovery-fixture','fixture-cause',$7,
        CASE WHEN $8::boolean THEN clock_timestamp() + INTERVAL '1 minute'
          ELSE TIMESTAMPTZ '2000-01-01 00:00:00+00' + $9 * INTERVAL '1 millisecond' END,$10)`,
    [id, f.event.tenantId, f.event.workspaceId, options.kind ?? 'EVENT',
      JSON.stringify(f.event.payload), options.status ?? 'PENDING', f.event.occurredAt,
      options.future ?? false, ordinal, options.attempts ?? 0]);
    return id;
  };
  const reset = async () => {
    await f.database.query('DELETE FROM outbox_events WHERE id = ANY($1::uuid[])', [created]);
    created.length = 0;
  };
  const claim = (store: PrismaOutboxStoreAdapter, owner: string, limit = 10, duration = 30_000) => {
    const now = clock.now();
    return store.claimPending({ limit, now, leaseOwner: owner, leasedUntil: new Date(now.getTime() + duration) });
  };
  const expire = async (targets: readonly string[]) => {
    await f.database.query(`UPDATE outbox_events SET leased_until = clock_timestamp() - INTERVAL '1 second'
      WHERE id = ANY($1::uuid[])`, [targets]);
  };
  const state = async (id: string) => (await f.database.query<{
    status: string; publish_attempts: number; lease_owner: string | null; last_error: string | null;
  }>('SELECT status, publish_attempts, lease_owner, last_error FROM outbox_events WHERE id=$1', [id])).rows[0]!;
  const dispatch = (store: OutboxStorePort, publish: EventPublisherPort['publish']) =>
    new OutboxDispatcher(store, { publish }, ids, clock);

  try {
    const pending = await Promise.all(Array.from({ length: 8 }, () => seed()));
    const historical = await seed({ status: 'FAILED', attempts: 1 });
    const command = await seed({ kind: 'COMMAND' });
    const future = await seed({ future: true });
    const [left, right] = await Promise.all([claim(first, 'relay-a', 4), claim(second, 'relay-b', 4)]);
    assert.equal(left.length, 4);
    assert.equal(right.length, 4);
    const claimedIds = [...left, ...right].map(row => row.id);
    assert.equal(new Set(claimedIds).size, 8, 'concurrent relays must own disjoint rows');
    assert.deepEqual([...claimedIds].sort(), [...pending].sort());
    assert(!claimedIds.includes(historical) && !claimedIds.includes(command) && !claimedIds.includes(future));
    assert([...left, ...right].every(row => row.publishAttempts === 0), 'claiming does not start all attempts');
    for (const record of [...left, ...right]) {
      assert.equal(record.event.tenantId, f.event.tenantId);
      assert.equal(record.event.workspaceId, f.event.workspaceId);
      assert.equal(record.event.occurredAt.getTime(), f.event.occurredAt.getTime());
      assert.equal(record.event.causationId, 'fixture-cause');
      assert.deepEqual(record.event.payload, f.event.payload);
    }

    const owned = { id: left[0]!.id, leaseOwner: 'relay-a' };
    assert.equal(await first.recordAttempt(owned), 1);
    await expire([owned.id]);
    const replacement = await claim(second, 'replacement', 1);
    assert.equal(replacement[0]?.id, owned.id);
    assert.equal(replacement[0]?.publishAttempts, 1);
    await assert.rejects(first.recordAttempt(owned), /ownership was lost/);
    await assert.rejects(first.markPublished({ ...owned, publishedAt: clock.now() }), /ownership was lost/);
    await assert.rejects(first.markFailed({ ...owned, failedAt: clock.now(), availableAt: clock.now(),
      reason: 'late failure', terminal: true }), /ownership was lost/);
    const renewalTime = clock.now();
    assert.equal(await first.renewClaims({ ids: [owned.id], leaseOwner: 'relay-a', now: renewalTime,
      leasedUntil: new Date(renewalTime.getTime() + 30_000) }), false);
    assert.equal((await state(owned.id)).lease_owner, 'replacement');
    await second.markPublished({ id: owned.id, leaseOwner: 'replacement', publishedAt: clock.now() });
    assert.equal((await state(historical)).status, 'FAILED');
    assert.equal((await state(command)).publish_attempts, 0);
    await reset();

    // A locked oldest row must not stop independent work behind it.
    const lockedId = await seed();
    const nextId = await seed();
    const locker = new Client({ connectionString: f.adminUrl });
    await locker.connect();
    try {
      await locker.query('BEGIN');
      await locker.query('SELECT id FROM outbox_events WHERE id=$1 FOR UPDATE', [lockedId]);
      const skipped = await claim(first, 'skip-locked', 2);
      assert.deepEqual(skipped.map(row => row.id), [nextId]);
      await locker.query('ROLLBACK');
      assert.deepEqual((await claim(second, 'released-lock', 1)).map(row => row.id), [lockedId]);
    } finally {
      await locker.query('ROLLBACK');
      await locker.end();
    }
    await reset();

    // The lease predicate must run after acquiring a row lock, not before waiting.
    const delayedId = await seed();
    await claim(first, 'delayed-owner', 1, 500);
    const delayedLocker = new Client({ connectionString: f.adminUrl });
    await delayedLocker.connect();
    let delayedOutcome: Promise<unknown> | undefined;
    try {
      await delayedLocker.query('BEGIN');
      await delayedLocker.query('SELECT id FROM outbox_events WHERE id=$1 FOR UPDATE', [delayedId]);
      let settled = false;
      const write = first.markPublished({ id: delayedId, leaseOwner: 'delayed-owner', publishedAt: clock.now() });
      const outcome = write.then(
        () => { settled = true; return { success: true }; },
        error => { settled = true; return { error }; },
      );
      delayedOutcome = outcome;
      await f.database.query('SELECT pg_sleep(0.6)');
      assert.equal(settled, false, 'fenced settlement must await the locked row');
      await delayedLocker.query('ROLLBACK');
      const result = await outcome;
      assert('error' in result, 'expired owner must not settle');
      assert.match(String(result.error), /ownership was lost/);
      assert.equal((await state(delayedId)).status, 'PENDING');
    } finally {
      await delayedLocker.query('ROLLBACK');
      await delayedOutcome;
      await delayedLocker.end();
    }
    await reset();

    // Future retry is durable and progresses once eligible, with the same event ID.
    const retryId = await seed();
    let unavailable = true;
    const sent: string[] = [];
    const relay = new OutboxDispatcher(first, { publish: async event => {
      sent.push(event.eventId);
      if (unavailable) throw new Error('synthetic broker outage');
    } }, ids, clock, { retryBaseMs: 1_000, retryMaxMs: 1_000 });
    assert.deepEqual(await relay.dispatchBatch(1), { published: 0, retrying: 1, failed: 0 });
    assert.deepEqual(await relay.dispatchBatch(1), { published: 0, retrying: 0, failed: 0 });
    assert.equal((await state(retryId)).status, 'PENDING');
    unavailable = false;
    await waitUntilDue(f.database, retryId);
    assert.deepEqual(await relay.dispatchBatch(1), { published: 1, retrying: 0, failed: 0 });
    assert.deepEqual(sent, [retryId, retryId]);
    assert.equal((await state(retryId)).publish_attempts, 2);
    await reset();

    const exhausted = await seed({ attempts: 10 });
    let extraSends = 0;
    assert.deepEqual(await dispatch(first, async () => { extraSends += 1; }).dispatchBatch(1),
      { published: 0, retrying: 0, failed: 1 });
    assert.equal(extraSends, 0, 'crashed final attempt must not acquire extra retry budget');
    assert.equal((await state(exhausted)).publish_attempts, 10);
    assert.equal((await state(exhausted)).status, 'FAILED');
    await reset();

    // Simulate ACK received but no durable settlement; the production consumer's
    // transactional inbox absorbs the second publication after lease expiry.
    const ackId = await seed();
    let failAcknowledgement = true;
    let publications = 0;
    const uncertain = proxyStore(first, {
      markPublished: async params => {
        if (failAcknowledgement) { failAcknowledgement = false; throw new Error('synthetic lost ACK write'); }
        await first.markPublished(params);
      },
    });
    const publish = async (event: Parameters<EventPublisherPort['publish']>[0]) => {
      publications += 1;
      await f.project(event);
    };
    await assert.rejects(dispatch(uncertain, publish).dispatchBatch(1), /lost ACK write/);
    assert.equal((await state(ackId)).status, 'PENDING');
    await expire([ackId]);
    assert.deepEqual(await dispatch(second, publish).dispatchBatch(1), { published: 1, retrying: 0, failed: 0 });
    assert.equal(publications, 2);
    const effective = (await f.database.query<{ inbox: number; projections: number }>(`
      SELECT (SELECT count(*)::int FROM inbox_records WHERE event_id=$1) AS inbox,
        (SELECT count(*)::int FROM realtime_events WHERE id IN
          (SELECT id FROM inbox_records WHERE event_id=$1)) AS projections`, [ackId])).rows[0];
    assert.deepEqual(effective, { inbox: 1, projections: 1 });
    assert.equal((await state(ackId)).publish_attempts, 2);
    await reset();

    // A deterministic PostgreSQL row error must not poison every sibling in
    // the same page. The new subset proof excludes the uncertain first row.
    const interrupted = await seed();
    const untouched = await seed();
    const admitted: string[] = [];
    await f.database.query(`CREATE FUNCTION fixture_reject_event_settlement()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.id = '${interrupted}'::uuid AND NEW.status = 'PUBLISHED' THEN
          RAISE EXCEPTION 'synthetic row settlement failed';
        END IF;
        RETURN NEW;
      END; $$;
      CREATE TRIGGER fixture_reject_event_settlement BEFORE UPDATE ON outbox_events
      FOR EACH ROW EXECUTE FUNCTION fixture_reject_event_settlement();`);
    try {
      await assert.rejects(dispatch(first, async event => { admitted.push(event.eventId); }).dispatchBatch(2),
        /synthetic row settlement failed/);
      assert.deepEqual(admitted, [interrupted, untouched]);
      assert.equal((await state(interrupted)).status, 'PENDING');
      assert.equal((await state(interrupted)).publish_attempts, 1);
      assert.equal((await state(untouched)).status, 'PUBLISHED');
      assert.equal((await state(untouched)).publish_attempts, 1);
    } finally {
      await f.database.query(`DROP TRIGGER fixture_reject_event_settlement ON outbox_events;
        DROP FUNCTION fixture_reject_event_settlement();`);
    }
    await expire([interrupted]);
    assert.deepEqual(await dispatch(second, async () => undefined).dispatchBatch(2),
      { published: 1, retrying: 0, failed: 0 });
    await reset();

    // If the database cannot prove the remaining subset, no further send starts.
    const unavailableFirst = await seed();
    const unavailableSecond = await seed();
    let forbiddenSends = 0;
    const unavailableStore = proxyStore(first, {
      recordAttempt: async () => { throw new Error('synthetic start storage unavailable'); },
      renewClaims: async () => { throw new Error('synthetic renewal storage unavailable'); },
    });
    await assert.rejects(dispatch(unavailableStore, async () => { forbiddenSends += 1; }).dispatchBatch(2),
      /start storage unavailable/);
    assert.equal(forbiddenSends, 0);
    assert.equal((await state(unavailableFirst)).publish_attempts, 0);
    assert.equal((await state(unavailableSecond)).publish_attempts, 0);
    await expire([unavailableFirst, unavailableSecond]);
    assert.deepEqual(await dispatch(second, async () => undefined).dispatchBatch(2),
      { published: 2, retrying: 0, failed: 0 });
    await reset();

    // Slow confirms retain the whole batch through real PostgreSQL renewals.
    await seed();
    await seed();
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    let finish!: () => void;
    const release = new Promise<void>(resolve => { finish = resolve; });
    let count = 0;
    const slow = new OutboxDispatcher(first, { publish: async () => {
      count += 1;
      if (count === 1) { entered(); await release; }
    } }, ids, clock, { leaseMs: 600 });
    const work = slow.dispatchBatch(2);
    // Observe rejection immediately while the deliberately delayed publisher waits.
    const outcome = work.then(value => ({ value }), error => ({ error }));
    await Promise.race([started, work.then(() => { throw new Error('Slow fixture completed without publishing'); })]);
    try {
      await new Promise<void>(resolve => setTimeout(resolve, 850));
      assert.equal((await claim(second, 'competing-relay', 2)).length, 0);
    } finally {
      finish();
      await outcome;
    }
    const result = await outcome;
    if ('error' in result) throw result.error;
    assert.deepEqual(result.value, { published: 2, retrying: 0, failed: 0 });
    assert.equal(count, 2);
  } finally {
    await reset();
  }
}

function proxyStore(store: OutboxStorePort, overrides: Partial<OutboxStorePort>): OutboxStorePort {
  return {
    claimPending: params => store.claimPending(params),
    renewClaims: params => store.renewClaims(params),
    recordAttempt: params => store.recordAttempt(params),
    markPublished: params => store.markPublished(params),
    markFailed: params => store.markFailed(params),
    ...overrides,
  };
}

async function waitUntilDue(database: Pool, id: string): Promise<void> {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const result = await database.query<{ due: boolean }>(
      'SELECT available_at <= clock_timestamp() AS due FROM outbox_events WHERE id=$1', [id]);
    if (result.rows[0]?.due) return;
    await new Promise<void>(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Synthetic event retry did not become eligible within the fixture deadline');
}
