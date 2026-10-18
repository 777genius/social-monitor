import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { InMemoryIdempotencyAdapter } from '../../adapters/idempotency/in-memory-idempotency.adapter';
import { InMemoryOutboxAdapter } from '../../adapters/messaging/in-memory-outbox.adapter';
import { InMemoryInterestRepository } from '../../adapters/persistence/in-memory-interest.repository';
import { InMemorySourceBindingRepository } from '../../adapters/persistence/in-memory-source-binding.repository';
import { AesGcmSourceBindingConfigProtector } from '../../adapters/security/aes-gcm-source-binding-config-protector';
import { FakeSourceCatalogAdapter } from '../../adapters/source-catalog/fake-source-catalog.adapter';
import { Interest } from '../../domain';
import type { SourceBindingConfig } from '../../ports';
import { BindSourceUseCase } from '../../features/bind-source/bind-source.use-case';

const scope = { tenantId: tenantId('tenant-1'), workspaceId: workspaceId('workspace-1'), interestId: 'interest-1' };
const now = new Date('2026-10-18T00:00:00.000Z');

const setup = async () => {
  const interests = new InMemoryInterestRepository();
  const bindings = new InMemorySourceBindingRepository();
  const outbox = new InMemoryOutboxAdapter();
  let sequence = 0;
  const ids: IdGenerator = { generate: () => `binding-identity-${++sequence}` };
  const useCase = new BindSourceUseCase(
    interests, bindings, new FakeSourceCatalogAdapter(), outbox, new InMemoryIdempotencyAdapter(),
    new AesGcmSourceBindingConfigProtector(Buffer.alloc(32, 1), 'synthetic-test-key'), ids,
    new FixedClock(now), { maxEnabledSourcesPerInterest: 2 },
  );
  const addInterest = async (targetScope = scope) => interests.save(Interest.create({
    id: targetScope.interestId, tenantId: targetScope.tenantId, workspaceId: targetScope.workspaceId,
    name: 'Synthetic channel monitoring', query: 'synthetic', createdAt: now,
  }));
  await addInterest();
  const bind = (config: SourceBindingConfig, key: string, targetScope = scope, providerKey = 'telegram') =>
    useCase.execute({ ...targetScope, providerKey, config, idempotencyKey: key, correlationId: 'synthetic-correlation' });
  return { bindings, outbox, addInterest, bind };
};

describe('BindSourceUseCase source identity', () => {
  it('keeps different channels separate and reuses the same normalized channel after capacity is reached', async () => {
    const { bindings, outbox, bind } = await setup();
    const first = await bind({ channel: '@First_Channel', maxItems: 10 }, 'first');
    const second = await bind({ url: 'https://t.me/s/Second_Channel/' }, 'second');
    const duplicate = await bind({ query: 'https://t.me/s/FIRST_channel' }, 'alias');
    const third = await bind({ channel: '@third_channel' }, 'third');

    expect(first).toMatchObject({ ok: true, value: { created: true } });
    expect(second).toMatchObject({ ok: true, value: { created: true } });
    if (!first.ok || !second.ok) throw new Error('Expected successful channel bindings');
    expect(second.value.sourceBindingId).not.toBe(first.value.sourceBindingId);
    expect(duplicate).toEqual({ ok: true, value: { ...first.value, created: false } });
    expect(third).toMatchObject({ ok: false, error: { code: 'operation.quota_exceeded' } });
    expect(outbox.all()).toHaveLength(2);

    const stored = await bindings.listByInterest({ ...scope, limit: 100 });
    expect(stored.sourceBindings.map((binding) => binding.toSnapshot().config)).toEqual(expect.arrayContaining([
      { channel: 'first_channel', maxItems: 10 },
      { channel: 'second_channel', url: 'https://t.me/second_channel' },
    ]));
    expect(stored.sourceBindings).toHaveLength(2);
    await expect(bind({ channel: '@SECOND_CHANNEL' }, 'second-alias')).resolves.toEqual({
      ok: true, value: { ...second.value, created: false },
    });
  });

  it('never reuses a channel binding across tenant, workspace or interest scope', async () => {
    const { bindings, addInterest, bind } = await setup();
    const scopes = [
      scope,
      { ...scope, tenantId: tenantId('tenant-2') },
      { ...scope, workspaceId: workspaceId('workspace-2') },
      { ...scope, interestId: 'interest-2' },
    ];
    const bindingIds = new Set<string>();
    for (const targetScope of scopes) {
      await addInterest(targetScope);
      const result = await bind({ channel: '@same_channel' }, `same-key-${targetScope.interestId}`, targetScope);
      expect(result).toMatchObject({ ok: true, value: { created: true } });
      if (!result.ok) throw new Error('Expected a scoped binding');
      bindingIds.add(result.value.sourceBindingId);
      const stored = await bindings.findByInterestAndProvider({
        ...targetScope, providerKey: 'telegram', configIdentity: { field: 'channel', value: 'same_channel' },
      });
      expect(stored?.toSnapshot()).toMatchObject({ ...targetScope, id: result.value.sourceBindingId });
    }
    expect(bindingIds.size).toBe(scopes.length);
  });

  it('preserves provider-level deduplication when a provider supplies no config identity', async () => {
    const { bindings, outbox, bind } = await setup();
    const first = await bind({ query: 'first query' }, 'first', scope, 'fake-source');
    const second = await bind({ query: 'second query' }, 'second', scope, 'fake-source');
    if (!first.ok) throw new Error('Expected the fixture provider to bind');
    expect(second).toEqual({ ok: true, value: { ...first.value, created: false } });
    expect(outbox.all()).toHaveLength(1);
    const stored = await bindings.listByInterest({ ...scope, limit: 100 });
    expect(stored.sourceBindings).toHaveLength(1);
    expect(stored.sourceBindings[0]?.toSnapshot().config).toEqual({ query: 'first query' });
  });
});
