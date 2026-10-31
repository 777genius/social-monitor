import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { InMemoryIdempotencyAdapter } from '@social-monitor/monitoring/adapters/idempotency/in-memory-idempotency.adapter';
import { InMemoryOutboxAdapter } from '@social-monitor/monitoring/adapters/messaging/in-memory-outbox.adapter';
import { InMemoryInterestCreationState, monitoringReceiptKey } from '@social-monitor/monitoring/adapters/persistence/in-memory-interest-creation-state';
import { InMemoryInterestRepository } from '@social-monitor/monitoring/adapters/persistence/in-memory-interest.repository';
import { InMemorySourceBindingCreationStore } from '@social-monitor/monitoring/adapters/persistence/in-memory-source-binding-creation.store';
import { InMemorySourceBindingRepository } from '@social-monitor/monitoring/adapters/persistence/in-memory-source-binding.repository';
import { Interest } from '@social-monitor/monitoring/domain';
import type {
  SourceBindingConfig, SourceBindingConfigProtectorPort,
  SourceBindingConfigValidationResult, SourceCatalogPort, SourceCapabilityProfile,
} from '@social-monitor/monitoring/ports';
import { BIND_SOURCE_CREATION_SCOPE } from '@social-monitor/monitoring/application/contracts/source-binding-creation-commit';
import { BindSourceUseCase } from '@social-monitor/monitoring/features/bind-source/bind-source.use-case';

const tenant = tenantId('tenant-test');
const workspace = workspaceId('workspace-test');
const time = new Date('2026-10-31T00:00:00.000Z');

class SequenceIdGenerator implements IdGenerator {
  private index = 1;
  generate(): string { return `00000000-0000-7000-8000-${(this.index++).toString().padStart(12, '0')}`; }
}

class FakeConfigProtector implements SourceBindingConfigProtectorPort {
  readonly configs: SourceBindingConfig[] = [];
  async protect(config: SourceBindingConfig): Promise<SourceBindingConfig> {
    this.configs.push(config);
    return { ...config, apiToken: { encrypted: true, ciphertext: 'encrypted-token' } };
  }
  async unprotect(config: SourceBindingConfig): Promise<SourceBindingConfig> { return config; }
}

const profile = (providerKey: string): SourceCapabilityProfile => ({
  providerKey, version: 1, productionSafe: true, supportsCursor: true,
});

class Catalog implements SourceCatalogPort {
  constructor(
    private readonly profiles: Readonly<Record<string, SourceCapabilityProfile>>,
    private readonly invalid?: string,
  ) {}
  async getCapability(providerKey: string): Promise<SourceCapabilityProfile | null> {
    return this.profiles[providerKey] ?? null;
  }
  async validateBindingConfig(_providerKey: string, config: SourceBindingConfig):
    Promise<SourceBindingConfigValidationResult> {
    void _providerKey;
    if (this.invalid) return { ok: false, reason: this.invalid };
    const channel = config.channel;
    return typeof channel === 'string'
      ? { ok: true, configIdentity: { field: 'channel', value: channel } }
      : { ok: true };
  }
}

const command = (providerKey = 'rss', idempotencyKey = 'bind-1',
  config: SourceBindingConfig = { query: 'openai monitoring' }) => ({
  tenantId: tenant, workspaceId: workspace, interestId: 'interest-1',
  providerKey, config, idempotencyKey, correlationId: 'correlation-1',
});

const fixture = async (params: {
  readonly profiles?: Readonly<Record<string, SourceCapabilityProfile>>;
  readonly invalid?: string;
  readonly limit?: number;
} = {}) => {
  const state = new InMemoryInterestCreationState();
  const interests = new InMemoryInterestRepository(state);
  await interests.save(Interest.create({
    id: 'interest-1', tenantId: tenant, workspaceId: workspace,
    name: 'AI Monitoring', query: 'openai monitoring', createdAt: time,
  }));
  const bindings = new InMemorySourceBindingRepository(state);
  const idempotency = new InMemoryIdempotencyAdapter(state);
  const outbox = new InMemoryOutboxAdapter(state);
  const protector = new FakeConfigProtector();
  const catalog = new Catalog(params.profiles ?? { rss: profile('rss') }, params.invalid);
  const useCase = new BindSourceUseCase(
    interests, new InMemorySourceBindingCreationStore(state), catalog,
    idempotency, protector, new SequenceIdGenerator(), new FixedClock(time),
    params.limit === undefined ? {} : { maxEnabledSourcesPerInterest: params.limit },
  );
  return { state, interests, bindings, outbox, idempotency, protector, useCase };
};

describe('BindSourceUseCase', () => {
  it('atomically publishes a protected source binding, event and scoped receipt', async () => {
    const f = await fixture();
    const result = await f.useCase.execute(command('rss', 'bind-1', {
      query: 'openai monitoring', apiToken: 'raw-secret',
    }));
    expect(result).toMatchObject({ ok: true, value: { created: true, sourceBindingId: expect.any(String) } });
    if (!result.ok) throw result.error;
    expect(f.outbox.all()).toHaveLength(1);
    expect(f.protector.configs).toEqual([{ query: 'openai monitoring', apiToken: 'raw-secret' }]);
    const binding = await f.bindings.findById({
      tenantId: tenant, workspaceId: workspace, sourceBindingId: result.value.sourceBindingId,
    });
    expect(binding?.toSnapshot().config).toEqual({
      query: 'openai monitoring', apiToken: { encrypted: true, ciphertext: 'encrypted-token' },
    });
    expect(JSON.stringify(binding?.toSnapshot())).not.toContain('raw-secret');
    expect(await f.idempotency.get({
      tenantId: tenant, workspaceId: workspace, scope: BIND_SOURCE_CREATION_SCOPE, key: 'bind-1',
    })).toMatchObject({ value: result.value });
  });

  it('rejects unavailable providers without writing a binding, event or receipt', async () => {
    const f = await fixture();
    const result = await f.useCase.execute(command('unsafe-provider'));
    expect(result).toMatchObject({ ok: false, error: { code: 'validation.failed' } });
    expect(f.outbox.all()).toHaveLength(0);
    expect((await f.bindings.listByInterest({ tenantId: tenant, workspaceId: workspace,
      interestId: 'interest-1', limit: 10 })).sourceBindings).toHaveLength(0);
    expect(f.state.receipts.size).toBe(0);
  });

  it('rejects invalid config before encrypting or publishing anything', async () => {
    const f = await fixture({ invalid: 'Feed URL must not target private networks' });
    const result = await f.useCase.execute(command('rss', 'bad', { feedUrl: 'http://127.0.0.1/' }));
    expect(result).toMatchObject({ ok: false, error: { code: 'validation.failed' } });
    expect(f.protector.configs).toHaveLength(0);
    expect(f.outbox.all()).toHaveLength(0);
  });

  it('enforces capacity across distinct canonical providers and preserves the first result', async () => {
    const f = await fixture({ limit: 1, profiles: {
      rss: profile('rss'), github: profile('github'),
    } });
    const first = await f.useCase.execute(command('rss'));
    const second = await f.useCase.execute(command('github', 'bind-2'));
    expect(first).toMatchObject({ ok: true, value: { created: true } });
    expect(second).toMatchObject({ ok: false, error: { code: 'operation.quota_exceeded' } });
    expect(f.outbox.all()).toHaveLength(1);
    expect(f.state.receipts.size).toBe(1);
  });

  it('deduplicates provider aliases using canonical identity and replays the original receipt', async () => {
    const f = await fixture({ profiles: {
      github: profile('github-repos'),
      'github-repos': profile('github-repos'),
    } });
    const original = await f.useCase.execute(command('github', 'first-key'));
    const alias = await f.useCase.execute(command('github-repos', 'second-key'));
    const replay = await f.useCase.execute(command('github', 'first-key'));
    expect(original).toMatchObject({ ok: true, value: { created: true } });
    expect(alias).toMatchObject({ ok: true, value: { created: false } });
    expect(replay).toEqual(alias);
    if (original.ok && alias.ok) expect(alias.value.sourceBindingId).toBe(original.value.sourceBindingId);
    expect(f.outbox.all()).toHaveLength(1);
    expect(f.state.receipts.size).toBe(2);
  });

  it('allows distinct identities for one canonical provider but not duplicate channel identities', async () => {
    const f = await fixture({ profiles: { telegram: profile('telegram') } });
    const one = await f.useCase.execute(command('telegram', 'one', { channel: 'first-channel' }));
    const two = await f.useCase.execute(command('telegram', 'two', { channel: 'second-channel' }));
    const duplicate = await f.useCase.execute(command('telegram', 'three', { channel: 'first-channel' }));
    expect(one).toMatchObject({ ok: true, value: { created: true } });
    expect(two).toMatchObject({ ok: true, value: { created: true } });
    expect(duplicate).toMatchObject({ ok: true, value: { created: false } });
    if (one.ok && duplicate.ok) expect(duplicate.value.sourceBindingId).toBe(one.value.sourceBindingId);
    expect(f.outbox.all()).toHaveLength(2);
  });

  it('rejects invalid cached receipts rather than trusting malformed idempotency results', async () => {
    const f = await fixture();
    f.state.receipts.set(monitoringReceiptKey({
      tenantId: tenant, workspaceId: workspace, scope: BIND_SOURCE_CREATION_SCOPE, key: 'bind-1',
    }), { created: true });
    await expect(f.useCase.execute(command())).resolves.toMatchObject({
      ok: false, error: { code: 'operation.conflict' },
    });
    expect(f.outbox.all()).toHaveLength(0);
  });
});
