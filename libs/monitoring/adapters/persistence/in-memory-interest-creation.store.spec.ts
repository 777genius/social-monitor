import { causationId, correlationId, CryptoIdGenerator, eventId, FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { INTEREST_CREATION_SCOPE, type InterestCreationCommit } from '../../application/contracts/interest-creation-commit';
import { Interest } from '../../domain';
import { CreateInterestUseCase } from '../../features/create-interest/create-interest.use-case';
import { InMemoryIdempotencyAdapter } from '../idempotency/in-memory-idempotency.adapter';
import { InMemoryOutboxAdapter } from '../messaging/in-memory-outbox.adapter';
import { InMemoryInterestRepository } from './in-memory-interest.repository';
import { InMemoryInterestCreationState, monitoringReceiptKey } from './in-memory-interest-creation-state';
import { InMemoryInterestCreationStore } from './in-memory-interest-creation.store';

const ids = new CryptoIdGenerator();
const scope = { tenantId: tenantId(ids.generate()), workspaceId: workspaceId(ids.generate()) };
const prepared = (name = 'Monitoring', key = ids.generate(), options: Partial<{
  tenantId: typeof scope.tenantId; workspaceId: typeof scope.workspaceId; interestId: string;
  eventId: string; receiptId: string; query: string; maximum: number;
}> = {}): InterestCreationCommit => {
  const interest = Interest.create({ ...scope, tenantId: options.tenantId ?? scope.tenantId,
    workspaceId: options.workspaceId ?? scope.workspaceId, id: options.interestId ?? ids.generate(),
    name, query: options.query ?? 'Original query', createdAt: new Date('2026-10-30T12:00:00Z') });
  const snapshot = interest.toSnapshot();
  return { interest, idempotencyKey: key, receiptId: options.receiptId ?? ids.generate(),
    maxInterestsPerWorkspace: options.maximum,
    event: { eventId: eventId(options.eventId ?? ids.generate()), eventType: 'monitoring.interest.created', schemaVersion: 1,
      occurredAt: snapshot.createdAt, tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId,
      correlationId: correlationId('creation-test'), causationId: causationId(key),
      payload: { interestId: snapshot.id, tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId,
        name: snapshot.name, query: snapshot.query },
    },
  };
};
const fixture = () => {
  const state = new InMemoryInterestCreationState();
  return { state, store: new InMemoryInterestCreationStore(state),
    interests: new InMemoryInterestRepository(state), outbox: new InMemoryOutboxAdapter(state),
    receipts: new InMemoryIdempotencyAdapter(state) };
};

describe('in-memory atomic interest creation', () => {
  it('publishes aggregate, event and scoped receipt together to existing readers', async () => {
    const context = fixture();
    const input = prepared();
    expect((await context.store.commit(input)).ok).toBe(true);
    const snapshot = input.interest.toSnapshot();
    expect(await context.interests.findById({ ...scope, interestId: snapshot.id })).toBe(input.interest);
    expect(context.outbox.all()).toEqual([input.event]);
    expect(await context.receipts.get({ ...scope, scope: INTEREST_CREATION_SCOPE, key: input.idempotencyKey })).toEqual({
      value: { interestId: snapshot.id, created: true },
    });
  });

  it('preserves first-key-wins for concurrent different names', async () => {
    const context = fixture();
    const first = prepared('First topic', 'shared-key');
    const second = prepared('Second topic', 'shared-key');
    const results = await Promise.all([context.store.commit(first), context.store.commit(second)]);
    expect(results).toEqual([
      { ok: true, value: { interestId: first.interest.toSnapshot().id, created: true } },
      { ok: true, value: { interestId: first.interest.toSnapshot().id, created: false } },
    ]);
    expect(context.state.interests.size).toBe(1);
    expect(context.state.receipts.size).toBe(1);
    expect(context.outbox.all()).toEqual([first.event]);
  });

  it('records both receipts for concurrent same-name commands without changing the query', async () => {
    const context = fixture();
    const first = prepared();
    const second = prepared(' Monitoring ', 'another-key', { query: 'Changed query', maximum: 1 });
    const results = await Promise.all([context.store.commit(first), context.store.commit(second)]);
    expect(results[1]).toEqual({ ok: true, value: { interestId: first.interest.toSnapshot().id, created: false } });
    expect(context.state.receipts.size).toBe(2);
    expect(context.outbox.all()).toHaveLength(1);
    expect((await context.interests.findByName({ ...scope, name: 'Monitoring' }))?.toSnapshot().query).toBe('Original query');
  });

  it('admits one contender for the last slot without retaining a rejected receipt', async () => {
    const context = fixture();
    const results = await Promise.all(['First topic', 'Second topic'].map((name) =>
      context.store.commit(prepared(name, name, { maximum: 1 }))));
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({ error: { code: 'operation.quota_exceeded' } });
    expect(context.state.interests.size).toBe(1);
    expect(context.state.receipts.size).toBe(1);
    expect(context.outbox.all()).toHaveLength(1);
  });

  it('retains archived names for new keys but replays the original receipt', async () => {
    const context = fixture();
    const input = prepared();
    await context.store.commit(input);
    await context.interests.archive({ ...scope, interestId: input.interest.toSnapshot().id, archivedAt: new Date() });
    expect(await context.interests.findByName({ ...scope, name: 'Monitoring' })).toBeNull();
    expect((await context.interests.list({ ...scope, limit: 10 })).interests).toEqual([]);
    expect(await context.store.commit(prepared('Monitoring'))).toMatchObject({ ok: false, error: { code: 'operation.conflict' } });
    expect(await context.store.commit(input)).toEqual({ ok: true, value: { interestId: input.interest.toSnapshot().id, created: false } });
    expect(context.state.receipts.size).toBe(1);
    expect(context.outbox.all()).toHaveLength(1);
  });

  it('uses exact-case names and frees a previous active name on rename', async () => {
    const context = fixture();
    const input = prepared('Monitoring');
    await context.store.commit(input);
    expect((await context.store.commit(prepared('monitoring'))).ok).toBe(true);
    expect(await context.interests.findByName({ ...scope, name: 'MONITORING' })).toBeNull();
    await context.interests.save(input.interest.updateDetails({ name: 'Renamed topic', query: 'Renamed query' }));
    expect((await context.store.commit(prepared('Monitoring'))).ok).toBe(true);
    expect(context.state.interests.size).toBe(3);
  });

  it('separates tenant and workspace receipts, names and capacity', async () => {
    const context = fixture();
    const inputs = [prepared('Monitoring', 'same-key', { maximum: 1 }),
      prepared('Monitoring', 'same-key', { tenantId: tenantId(ids.generate()), maximum: 1 }),
      prepared('Monitoring', 'same-key', { workspaceId: workspaceId(ids.generate()), maximum: 1 })];
    expect((await Promise.all(inputs.map((input) => context.store.commit(input)))).every((result) => result.ok)).toBe(true);
    expect(context.state.interests.size).toBe(3);
    expect(context.state.receipts.size).toBe(3);
  });

  it('publishes no partial effects if preparation of the commit fails', async () => {
    const context = fixture();
    jest.spyOn(context.state, 'publish').mockImplementationOnce(() => { throw new Error('Commit preparation unavailable'); });
    expect((await context.store.commit(prepared())).ok).toBe(false);
    expect(context.state.interests.size).toBe(0);
    expect(context.state.receipts.size).toBe(0);
    expect(context.outbox.all()).toHaveLength(0);
  });

  it.each(['interestId', 'eventId', 'receiptId'] as const)('rejects unexpected %s collisions without modifying prior work', async (field) => {
    const context = fixture();
    const first = prepared();
    await context.store.commit(first);
    const value = field === 'interestId' ? first.interest.toSnapshot().id : field === 'eventId' ? first.event.eventId : first.receiptId;
    expect((await context.store.commit(prepared('Other topic', 'other-key', { [field]: value }))).ok).toBe(false);
    expect(context.state.interests.size).toBe(1);
    expect(context.state.receipts.size).toBe(1);
    expect(context.outbox.all()).toEqual([first.event]);
  });

  it('completes a legacy null receipt through the use case using its existing identity', async () => {
    const context = fixture();
    const input = prepared();
    const receiptKey = monitoringReceiptKey({ ...scope, scope: INTEREST_CREATION_SCOPE, key: input.idempotencyKey });
    context.state.receipts.set(receiptKey, null);
    const existingId = ids.generate();
    context.state.receiptIds.set(existingId, receiptKey);
    const useCase = new CreateInterestUseCase(context.store, context.receipts, ids, new FixedClock(new Date('2026-10-30T12:00:00Z')));
    expect((await useCase.execute({ ...scope, name: 'Monitoring', query: 'Original query',
      idempotencyKey: input.idempotencyKey, correlationId: 'creation-test' })).ok).toBe(true);
    expect(context.state.receiptIds.size).toBe(1);
    expect(context.state.receiptIds.get(existingId)).toBe(receiptKey);
    expect(context.state.receiptIds.has(input.receiptId)).toBe(false);
  });
});
