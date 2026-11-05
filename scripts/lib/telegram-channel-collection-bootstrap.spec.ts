import { FixedClock, type IdGenerator } from '@social-monitor/shared-kernel';
import { Interest, SourceBinding } from '@social-monitor/monitoring/domain';
import { InMemoryIdempotencyAdapter } from '@social-monitor/monitoring/adapters/idempotency/in-memory-idempotency.adapter';
import { InMemoryOutboxAdapter } from '@social-monitor/monitoring/adapters/messaging/in-memory-outbox.adapter';
import { InMemoryInterestCreationState } from '@social-monitor/monitoring/adapters/persistence/in-memory-interest-creation-state';
import { InMemoryInterestRepository } from '@social-monitor/monitoring/adapters/persistence/in-memory-interest.repository';
import { InMemorySourceBindingRepository } from '@social-monitor/monitoring/adapters/persistence/in-memory-source-binding.repository';
import { InMemorySourceBindingCreationStore } from '@social-monitor/monitoring/adapters/persistence/in-memory-source-binding-creation.store';
import { InMemoryScanPolicyRepository } from '@social-monitor/monitoring/adapters/persistence/in-memory-scan-policy.repository';
import { AesGcmSourceBindingConfigProtector } from '@social-monitor/monitoring/adapters/security/aes-gcm-source-binding-config-protector';
import { FakeSourceCatalogAdapter } from '@social-monitor/monitoring/adapters/source-catalog/fake-source-catalog.adapter';
import { BindSourceUseCase } from '@social-monitor/monitoring/features/bind-source/bind-source.use-case';
import { SetScanPolicyUseCase } from '@social-monitor/monitoring/features/set-scan-policy/set-scan-policy.use-case';
import { resolveTelegramCollectionTarget } from './telegram-channel-collection-bootstrap';
import {
  parseTelegramCollectionArgs, telegramCollectionConfig, telegramCollectionPolicy, telegramCollectionScope,
} from './telegram-channel-collection-contract';

const now = new Date('2026-10-18T12:00:00Z');
const setup = async (withInterest = true) => {
  const creationState = new InMemoryInterestCreationState();
  const interests = new InMemoryInterestRepository(creationState);
  if (withInterest) await interests.save(Interest.create({
    ...telegramCollectionScope, id: telegramCollectionScope.interestId, name: 'Synthetic interest', query: 'synthetic query', createdAt: now,
  }));
  const bindings = new InMemorySourceBindingRepository(creationState);
  const policies = new InMemoryScanPolicyRepository();
  const outbox = new InMemoryOutboxAdapter(creationState);
  const idempotency = new InMemoryIdempotencyAdapter(creationState);
  let counter = 0;
  const ids: IdGenerator = { generate: () => `synthetic-${++counter}` };
  const clock = new FixedClock(now);
  let catalogReady = false;
  const catalog = { inspect: async () => catalogReady, ensure: jest.fn(async () => { catalogReady = true; }) };
  const protector = new AesGcmSourceBindingConfigProtector(Buffer.alloc(32, 1), 'synthetic-test-key');
  return {
    interests, bindings, policies, outbox, catalog,
    bootstrap: {
      bindSource: new BindSourceUseCase(interests, new InMemorySourceBindingCreationStore(creationState),
        new FakeSourceCatalogAdapter({ includeFixtureProviders: false }),
        idempotency, protector, ids, clock),
      setPolicy: new SetScanPolicyUseCase(bindings, policies, outbox, idempotency, ids, clock),
    },
  };
};

describe('fixed Telegram collection admission and bootstrap', () => {
  it('defaults to inspect and accepts only the exact authorized optional scope', () => {
    expect(parseTelegramCollectionArgs([])).toBe('inspect');
    expect(parseTelegramCollectionArgs(['--bootstrap', '--channel', 'hiaimediaen', '--tenant-id', telegramCollectionScope.tenantId,
      '--workspace-id', telegramCollectionScope.workspaceId, '--interest-id', telegramCollectionScope.interestId])).toBe('bootstrap');
  });
  it.each([
    ['--unknown'], ['--bootstrap', '--collect'], ['--collect', '--collect'], ['--channel', 'another_channel'],
    ['--channel', '@hiaimediaen'], ['--channel', 'https://t.me/hiaimediaen'], ['--channel'],
    ['--tenant-id', 'another-tenant'], ['--workspace-id', 'another-workspace'], ['--interest-id', 'another-interest'],
    ['--channel', 'hiaimediaen', '--channel', 'hiaimediaen'], ['--collect=true'], ['--max-pages', '20'],
  ].map((args) => ({ args })))('rejects unexpected mode/channel/scope before effects: %j', ({ args }) => {
    expect(() => parseTelegramCollectionArgs(args)).toThrow('invalid_arguments');
  });
  it('inspect performs no bootstrap writes and reports the absent binding', async () => {
    const services = await setup();
    await expect(resolveTelegramCollectionTarget('inspect', services)).resolves.toMatchObject({ catalogReady: false, target: undefined });
    expect(services.catalog.ensure).not.toHaveBeenCalled();
    expect(services.outbox.all()).toHaveLength(0);
    await expect(resolveTelegramCollectionTarget('collect', services)).rejects.toMatchObject({ code: 'not_bootstrapped' });
  });
  it('requires the preexisting interest and never creates it', async () => {
    const services = await setup(false);
    await expect(resolveTelegramCollectionTarget('bootstrap', services)).rejects.toMatchObject({ code: 'interest_missing' });
    expect(services.catalog.ensure).not.toHaveBeenCalled();
    expect(services.outbox.all()).toHaveLength(0);
    await expect(services.interests.findById(telegramCollectionScope)).resolves.toBeNull();
  });
  it('bootstraps exactly one enabled binding and hourly policy through normal use cases, then reuses both', async () => {
    const services = await setup();
    const first = await resolveTelegramCollectionTarget('bootstrap', services);
    const repeated = await resolveTelegramCollectionTarget('bootstrap', services);
    expect(repeated).toEqual(first);
    expect(first.target).toBeDefined();
    const binding = await services.bindings.findById({ ...telegramCollectionScope, sourceBindingId: first.sourceBindingId! });
    expect(binding?.toSnapshot()).toMatchObject({ ...telegramCollectionScope, providerKey: 'telegram', status: 'enabled', config: telegramCollectionConfig });
    const policy = await services.policies.findBySourceBinding({ ...telegramCollectionScope, sourceBindingId: first.sourceBindingId! });
    expect(policy?.toSnapshot()).toMatchObject({ ...telegramCollectionPolicy, id: first.scanPolicyId });
    expect(services.outbox.all().map((event) => event.eventType)).toEqual(['monitoring.source-binding.enabled', 'monitoring.scan-policy.set']);
  });
  it.each(['paused', 'budget', 'channel_alias_conflict', 'historical_window'])('protects an existing binding with a %s mismatch', async (mismatch) => {
    const services = await setup();
    let binding = SourceBinding.create({ ...telegramCollectionScope, id: 'protected-binding', providerKey: 'telegram',
      capabilityProfileVersion: 1, config: telegramCollectionConfig, createdAt: now });
    if (mismatch === 'paused') binding = binding.pause();
    if (mismatch === 'budget') binding = binding.reconfigure({ ...telegramCollectionConfig, maxPages: 20 });
    if (mismatch === 'channel_alias_conflict') binding = binding.reconfigure({ ...telegramCollectionConfig, channel: 'another_channel', query: 'hiaimediaen' });
    if (mismatch === 'historical_window') binding = binding.reconfigure({ ...telegramCollectionConfig, targetPublishedWindow: { startInclusive: 'synthetic' } });
    await services.bindings.save(binding);
    const prior = binding.toSnapshot();
    await expect(resolveTelegramCollectionTarget('bootstrap', services)).rejects.toMatchObject({ code: 'binding_conflict' });
    expect((await services.bindings.findById({ ...telegramCollectionScope, sourceBindingId: prior.id }))?.toSnapshot()).toEqual(prior);
    expect(services.catalog.ensure).not.toHaveBeenCalled();
    expect(services.outbox.all()).toHaveLength(0);
  });
  it('refuses to overwrite a changed policy or its next scheduled run', async () => {
    const services = await setup();
    const first = await resolveTelegramCollectionTarget('bootstrap', services);
    const policy = await services.policies.findBySourceBinding({ ...telegramCollectionScope, sourceBindingId: first.sourceBindingId! });
    const changed = policy!.reconfigure({ intervalSeconds: 7200, freshnessSeconds: 7200, retryBudget: 0, nextRunAt: new Date('2026-10-19T00:00:00Z') });
    await services.policies.save(changed);
    await expect(resolveTelegramCollectionTarget('bootstrap', services)).rejects.toMatchObject({ code: 'policy_conflict' });
    expect((await services.policies.findBySourceBinding({ ...telegramCollectionScope, sourceBindingId: first.sourceBindingId! }))?.toSnapshot()).toEqual(changed.toSnapshot());
    expect(services.outbox.all()).toHaveLength(2);
  });
});
