import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { InMemoryIdempotencyAdapter } from '../../../libs/monitoring/adapters/idempotency/in-memory-idempotency.adapter';
import { InMemoryOutboxAdapter } from '../../../libs/monitoring/adapters/messaging/in-memory-outbox.adapter';
import { InMemoryInterestCreationState, monitoringReceiptKey } from '../../../libs/monitoring/adapters/persistence/in-memory-interest-creation-state';
import { InMemorySourceBindingRepository } from '../../../libs/monitoring/adapters/persistence/in-memory-source-binding.repository';
import { InMemorySourceBindingStatusChangeStore } from '../../../libs/monitoring/adapters/persistence/in-memory-source-binding-status-change.store';
import { SOURCE_BINDING_STATUS_CHANGE_SCOPE } from '../../../libs/monitoring/application/contracts/source-binding-status-change-commit';
import { SourceBinding } from '../../../libs/monitoring/domain';
import { ChangeSourceBindingStatusUseCase } from '../../../libs/monitoring/features/change-source-binding-status/change-source-binding-status.use-case';

const tenant = tenantId('tenant-1');
const workspace = workspaceId('workspace-1');
const instant = new Date('2026-10-31T00:00:00Z');
const scope = { tenantId: tenant, workspaceId: workspace, interestId: 'interest-1' };

const fixture = () => {
  const state = new InMemoryInterestCreationState();
  const bindings = new InMemorySourceBindingRepository(state);
  const outbox = new InMemoryOutboxAdapter(state);
  const receipts = new InMemoryIdempotencyAdapter(state);
  let index = 0;
  const ids = { generate: () => `synthetic-source-status-${++index}` };
  const useCase = (limit = 2) => new ChangeSourceBindingStatusUseCase(
    new InMemorySourceBindingStatusChangeStore(state), ids, new FixedClock(instant),
    { maxEnabledSourcesPerInterest: limit },
  );
  const add = async (id: string, providerKey = id, enabled = true) => {
    let binding = SourceBinding.create({
      id, ...scope, providerKey, capabilityProfileVersion: 1, config: {}, createdAt: instant,
    });
    if (!enabled) binding = binding.pause();
    await bindings.save(binding);
  };
  const change = (id: string, status: 'enabled' | 'paused', idempotencyKey: string, interestId = scope.interestId) =>
    ({ ...scope, interestId, sourceBindingId: id, status, idempotencyKey, correlationId: 'test-correlation' });
  const stored = async (id: string) => (await bindings.findById({
    tenantId: tenant, workspaceId: workspace, sourceBindingId: id,
  }))?.toSnapshot();
  return { state, bindings, outbox, receipts, useCase, add, change, stored };
};

describe('atomic source-binding pause/resume and quota parity', () => {
  it('commits pause and resume with one event and one receipt per actual change', async () => {
    const f = fixture();
    await f.add('one');
    const useCase = f.useCase();
    const paused = await useCase.execute(f.change('one', 'paused', 'pause-1'));
    expect(paused).toMatchObject({ ok: true, value: { status: 'paused', changed: true } });
    expect((await f.stored('one'))?.status).toBe('paused');
    expect(f.outbox.all()).toHaveLength(1);
    const resumed = await useCase.execute(f.change('one', 'enabled', 'resume-1'));
    expect(resumed).toMatchObject({ ok: true, value: { status: 'enabled', changed: true } });
    expect((await f.stored('one'))?.status).toBe('enabled');
    expect(f.outbox.all().map((event) => event.eventType)).toEqual([
      'monitoring.source-binding.status-changed', 'monitoring.source-binding.status-changed',
    ]);
    const replay = await useCase.execute(f.change('one', 'enabled', 'resume-1'));
    expect(replay).toMatchObject({ ok: true, value: { status: 'enabled', changed: false } });
    expect(f.outbox.all()).toHaveLength(2);
    expect(f.state.receipts.size).toBe(2);
  });

  it('rejects resuming a paused source after capacity is filled by a replacement', async () => {
    const f = fixture();
    await f.add('old', 'provider-old', false);
    await f.add('other', 'provider-other');
    await f.add('replacement', 'provider-replacement');
    const result = await f.useCase(2).execute(f.change('old', 'enabled', 'resume-over-capacity'));
    expect(result).toMatchObject({ ok: false, error: { code: 'operation.quota_exceeded' } });
    expect((await f.stored('old'))?.status).toBe('paused');
    expect(f.outbox.all()).toHaveLength(0);
    expect(f.state.receipts.size).toBe(0);
  });

  it('allows only one concurrent resume when just one enabled slot remains', async () => {
    const f = fixture();
    await f.add('one', 'provider-one', false);
    await f.add('two', 'provider-two', false);
    const useCase = f.useCase(1);
    const attempts = await Promise.all([
      useCase.execute(f.change('one', 'enabled', 'resume-one')),
      useCase.execute(f.change('two', 'enabled', 'resume-two')),
    ]);
    expect(attempts.filter((r) => r.ok)).toHaveLength(1);
    expect(attempts.filter((r) => !r.ok)).toHaveLength(1);
    expect(attempts.find((r) => !r.ok)).toMatchObject({
      ok: false, error: { code: 'operation.quota_exceeded' },
    });
    expect([await f.stored('one'), await f.stored('two')].filter((s) => s?.status === 'enabled')).toHaveLength(1);
    expect(f.outbox.all()).toHaveLength(1);
    expect(f.state.receipts.size).toBe(1);
  });

  it('rejects another interest or workspace without any event/receipt mutation', async () => {
    const f = fixture();
    await f.add('one');
    const wrongInterest = await f.useCase().execute(f.change('one', 'paused', 'wrong', 'other-interest'));
    expect(wrongInterest).toMatchObject({ ok: false, error: { code: 'resource.not_found' } });
    const wrongWorkspace = await f.useCase().execute({
      ...f.change('one', 'paused', 'wrong-workspace'), workspaceId: workspaceId('workspace-2'),
    });
    expect(wrongWorkspace).toMatchObject({ ok: false, error: { code: 'resource.not_found' } });
    expect((await f.stored('one'))?.status).toBe('enabled');
    expect(f.outbox.all()).toHaveLength(0);
    expect(f.state.receipts.size).toBe(0);
  });

  it('fails closed on corrupted receipt while preserving its source state and event history', async () => {
    const f = fixture();
    await f.add('one');
    f.state.receipts.set(monitoringReceiptKey({
      tenantId: tenant, workspaceId: workspace,
      scope: SOURCE_BINDING_STATUS_CHANGE_SCOPE, key: 'pause-corrupt',
    }), { sourceBindingId: 'one', status: 'invalid', changed: true });
    await expect(f.useCase().execute(f.change('one', 'paused', 'pause-corrupt'))).resolves.toMatchObject({
      ok: false, error: { code: 'operation.conflict' },
    });
    expect((await f.stored('one'))?.status).toBe('enabled');
    expect(f.outbox.all()).toHaveLength(0);
  });
});
