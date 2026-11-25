import { causationId, correlationId, eventId, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { SourceBindingCreationCommit } from '../../application/contracts/source-binding-creation-commit';
import { Interest, SourceBinding } from '../../domain';
import { InMemoryIdempotencyAdapter } from '../idempotency/in-memory-idempotency.adapter';
import { InMemoryOutboxAdapter } from '../messaging/in-memory-outbox.adapter';
import { InMemoryInterestRepository } from './in-memory-interest.repository';
import { InMemorySourceBindingRepository } from './in-memory-source-binding.repository';
import { InMemoryInterestCreationState, monitoringReceiptKey } from './in-memory-interest-creation-state';
import { InMemorySourceBindingCreationStore } from './in-memory-source-binding-creation.store';

const scope = { tenantId: tenantId('tenant-memory'), workspaceId: workspaceId('workspace-memory') };
const at = new Date('2026-10-31T00:00:00Z');
let sequence = 1;
const id = () => `source-binding-${sequence++}`;
const prepared = (channel = 'first_channel', key = 'first-key', options: Partial<{
  tenantId: typeof scope.tenantId;
  workspaceId: typeof scope.workspaceId;
  interestId: string;
  maximum: number;
  configIdentity: boolean;
}> = {}): SourceBindingCreationCommit => {
  const snapshot = { ...scope, tenantId: options.tenantId ?? scope.tenantId,
    workspaceId: options.workspaceId ?? scope.workspaceId,
    interestId: options.interestId ?? 'interest-1' };
  const binding = SourceBinding.create({
    ...snapshot, id: id(), providerKey: 'telegram', capabilityProfileVersion: 1,
    config: { channel }, createdAt: at,
  });
  const sourceBindingId = binding.toSnapshot().id;
  return {
    binding, idempotencyKey: key, receiptId: id(),
    ...(options.maximum === undefined ? {} : { maxEnabledSourcesPerInterest: options.maximum }),
    configIdentity: options.configIdentity === false ? undefined : { field: 'channel', value: channel },
    event: {
      ...snapshot, eventId: eventId(id()), eventType: 'monitoring.source-binding.enabled',
      schemaVersion: 1, occurredAt: at,
      correlationId: correlationId('monitoring-memory'), causationId: causationId(key),
      payload: { ...snapshot, sourceBindingId, providerKey: 'telegram',
        capabilityProfileVersion: 1 },
    },
  };
};
const setup = async () => {
  const state = new InMemoryInterestCreationState();
  const interests = new InMemoryInterestRepository(state);
  await interests.save(Interest.create({ ...scope, id: 'interest-1',
    name: 'Test topic', query: 'Monitoring test', createdAt: at }));
  return {
    state, interests,
    store: new InMemorySourceBindingCreationStore(state),
    bindings: new InMemorySourceBindingRepository(state),
    outbox: new InMemoryOutboxAdapter(state),
    receipts: new InMemoryIdempotencyAdapter(state),
  };
};

describe('memory atomic source-binding creation', () => {
  beforeEach(() => { sequence = 1; });

  it('publishes binding, event and receipt together to existing readers', async () => {
    const f = await setup(), p = prepared();
    expect(await f.store.commit(p)).toEqual({
      ok: true, value: { sourceBindingId: p.binding.toSnapshot().id, created: true },
    });
    expect(await f.bindings.findById({ ...scope, sourceBindingId: p.binding.toSnapshot().id })).toBe(p.binding);
    expect(f.outbox.all()).toEqual([p.event]);
    expect(await f.receipts.get({ ...scope, scope: 'monitoring.bind-source', key: p.idempotencyKey }))
      .toEqual({ value: { sourceBindingId: p.binding.toSnapshot().id, created: true } });
  });

  it('honors first-key-wins during concurrent calls with different channels', async () => {
    const f = await setup();
    const original = prepared('first_channel', 'same-key');
    const alternate = prepared('second_channel', 'same-key');
    const results = await Promise.all([f.store.commit(original), f.store.commit(alternate)]);
    expect(results).toEqual([
      { ok: true, value: { sourceBindingId: original.binding.toSnapshot().id, created: true } },
      { ok: true, value: { sourceBindingId: original.binding.toSnapshot().id, created: false } },
    ]);
    expect(f.state.sourceBindingsById.size).toBe(1);
    expect(f.outbox.all()).toEqual([original.event]);
  });

  it('deduplicates canonical channel identity before applying a reached capacity', async () => {
    const f = await setup();
    const original = prepared('first_channel', 'original', { maximum: 1 });
    const duplicate = prepared('first_channel', 'another-key', { maximum: 1 });
    expect((await f.store.commit(original)).ok).toBe(true);
    expect(await f.store.commit(duplicate)).toEqual({
      ok: true, value: { sourceBindingId: original.binding.toSnapshot().id, created: false },
    });
    expect(f.outbox.all()).toHaveLength(1);
    expect(f.state.receipts.size).toBe(2);
  });

  it('allows only one contender for the last enabled slot', async () => {
    const f = await setup();
    const results = await Promise.all([
      f.store.commit(prepared('first_channel', 'first', { maximum: 1 })),
      f.store.commit(prepared('second_channel', 'second', { maximum: 1 })),
    ]);
    expect(results.filter(x => x.ok)).toHaveLength(1);
    expect(results.find(x => !x.ok)).toMatchObject({ error: { code: 'operation.quota_exceeded' } });
    expect(f.state.sourceBindingsById.size).toBe(1);
    expect(f.state.receipts.size).toBe(1);
    expect(f.outbox.all()).toHaveLength(1);
  });

  it('isolates two tenants and workspaces even with identical provider, channel and key', async () => {
    const f = await setup();
    const secondTenant = { ...scope, tenantId: tenantId('other-tenant') };
    const secondWorkspace = { ...scope, workspaceId: workspaceId('other-workspace') };
    await f.interests.save(Interest.create({ ...secondTenant, id: 'interest-1', name: 'Other tenant', query: 'Other', createdAt: at }));
    await f.interests.save(Interest.create({ ...secondWorkspace, id: 'interest-1', name: 'Other workspace', query: 'Other', createdAt: at }));
    const results = await Promise.all([
      f.store.commit(prepared()),
      f.store.commit(prepared('first_channel', 'first-key', { tenantId: secondTenant.tenantId })),
      f.store.commit(prepared('first_channel', 'first-key', { workspaceId: secondWorkspace.workspaceId })),
    ]);
    expect(results.every(x => x.ok && x.value.created)).toBe(true);
    expect(f.state.sourceBindingsById.size).toBe(3);
    expect(f.outbox.all()).toHaveLength(3);
  });

  it('returns a not-found error for a removed interest without retaining receipt', async () => {
    const f = await setup();
    await f.interests.archive({ ...scope, interestId: 'interest-1', archivedAt: at });
    expect(await f.store.commit(prepared())).toMatchObject({
      ok: false, error: { code: 'resource.not_found' },
    });
    expect(f.state.receipts.size).toBe(0);
    expect(f.outbox.all()).toHaveLength(0);
  });

  it('retains no partial side effects when memory publication throws', async () => {
    const f = await setup();
    jest.spyOn(f.state, 'publish').mockImplementationOnce(() => { throw new Error('Commit failed'); });
    expect((await f.store.commit(prepared())).ok).toBe(false);
    expect(f.state.sourceBindingsById.size).toBe(0);
    expect(f.state.receipts.size).toBe(0);
    expect(f.outbox.all()).toHaveLength(0);
  });

  it('rejects a malformed receipt and aggregate identity collision without writing new events', async () => {
    const f = await setup();
    const first = prepared();
    expect((await f.store.commit(first)).ok).toBe(true);
    const different = prepared('second_channel', 'second-key');
    const duplicateId = SourceBinding.create({
      ...different.binding.toSnapshot(), id: first.binding.toSnapshot().id,
    });
    expect((await f.store.commit({ ...different, binding: duplicateId,
      event: { ...different.event, payload: { ...different.event.payload,
        sourceBindingId: duplicateId.toSnapshot().id } } })).ok).toBe(false);
    const key = monitoringReceiptKey({ ...scope, scope: 'monitoring.bind-source', key: 'bad-key' });
    f.state.receipts.set(key, { invalid: true });
    expect(await f.store.commit(prepared('third_channel', 'bad-key'))).toMatchObject({
      ok: false, error: { code: 'operation.conflict' },
    });
    expect(f.outbox.all()).toEqual([first.event]);
  });
});
