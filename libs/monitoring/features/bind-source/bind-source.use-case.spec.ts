import { FixedClock, ok, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { SourceBindingCreationCommit } from '../../application/contracts/source-binding-creation-commit';
import { Interest } from '../../domain';
import type {
  IdempotencyPort,
  InterestRepositoryPort,
  SourceBindingConfigProtectorPort,
  SourceCatalogPort,
} from '../../ports';
import { BindSourceUseCase } from './bind-source.use-case';

const tenant = tenantId('tenant-feature-test');
const workspace = workspaceId('workspace-feature-test');
const now = new Date('2026-10-31T00:00:00.000Z');
const command = {
  tenantId: tenant, workspaceId: workspace, interestId: 'interest-1',
  providerKey: 'github', config: { channel: 'raw-name', apiToken: 'raw-secret' },
  idempotencyKey: 'bind-request-1', correlationId: 'correlation-1',
};
const makeUseCase = () => {
  const interest = Interest.create({
    id: 'interest-1', tenantId: tenant, workspaceId: workspace,
    name: 'Test topic', query: 'Test topic query', createdAt: now,
  });
  const interests: InterestRepositoryPort = {
    save: async () => undefined,
    findByName: async () => null,
    findById: async () => interest,
    list: async () => ({ interests: [interest] }),
  };
  const commit = jest.fn(async (params: SourceBindingCreationCommit) =>
    ok({ sourceBindingId: params.binding.toSnapshot().id, created: true }));
  const get = jest.fn(async () => null);
  const idempotency: Pick<IdempotencyPort, 'get'> = { get };
  const sourceCatalog: SourceCatalogPort = {
    getCapability: jest.fn(async () => ({
      providerKey: 'github-issues', version: 1, productionSafe: true, supportsCursor: true,
    })),
    validateBindingConfig: jest.fn(async () => ({
      ok: true as const, normalizedConfig: { channel: 'canonical-channel' },
      configIdentity: { field: 'channel', value: 'canonical-channel' },
    })),
  };
  const protector: SourceBindingConfigProtectorPort = {
    protect: jest.fn(async (config) => ({
      ...config, apiToken: { encrypted: true, ciphertext: 'synthetic-ciphertext' },
    })),
    unprotect: async (config) => config,
  };
  let sequence = 0;
  const useCase = new BindSourceUseCase(
    interests, { commit }, sourceCatalog, idempotency, protector,
    { generate: () => `synthetic-id-${++sequence}` }, new FixedClock(now),
    { maxEnabledSourcesPerInterest: 3 },
  );
  return { useCase, interests, commit, get, sourceCatalog, protector };
};

describe('BindSourceUseCase application boundary', () => {
  it('delegates one protected canonical binding, event and receipt to the atomic port', async () => {
    const f = makeUseCase();
    const result = await f.useCase.execute(command);
    expect(result).toEqual({ ok: true, value: { sourceBindingId: 'synthetic-id-1', created: true } });
    expect(f.commit).toHaveBeenCalledTimes(1);
    const params = f.commit.mock.calls[0]![0];
    expect(params).toMatchObject({
      idempotencyKey: command.idempotencyKey,
      receiptId: 'synthetic-id-3',
      maxEnabledSourcesPerInterest: 3,
      configIdentity: { field: 'channel', value: 'canonical-channel' },
      event: { eventType: 'monitoring.source-binding.enabled',
        tenantId: tenant, workspaceId: workspace,
        payload: { sourceBindingId: 'synthetic-id-1', providerKey: 'github-issues' } },
    });
    expect(params.binding.toSnapshot().providerKey).toBe('github-issues');
    expect(params.binding.toSnapshot().config).toEqual({
      channel: 'canonical-channel',
      apiToken: { encrypted: true, ciphertext: 'synthetic-ciphertext' },
    });
    expect(JSON.stringify(params.binding.toSnapshot())).not.toContain('raw-secret');
    expect(f.protector.protect).toHaveBeenCalledWith({ channel: 'canonical-channel' });
  });

  it('replays a completed idempotency receipt before any validation or new publication', async () => {
    const f = makeUseCase();
    f.get.mockResolvedValueOnce({ value: { sourceBindingId: 'existing-source', created: true } } as never);
    await expect(f.useCase.execute(command)).resolves.toEqual({
      ok: true, value: { sourceBindingId: 'existing-source', created: false },
    });
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.sourceCatalog.getCapability).not.toHaveBeenCalled();
  });

  it('rejects unavailable provider without calling the commit port', async () => {
    const f = makeUseCase();
    jest.mocked(f.sourceCatalog.getCapability).mockResolvedValueOnce(null);
    await expect(f.useCase.execute(command)).resolves.toMatchObject({
      ok: false, error: { code: 'validation.failed' },
    });
    expect(f.commit).not.toHaveBeenCalled();
  });

  it('rejects a missing interest without creating an event or a receipt', async () => {
    const f = makeUseCase();
    jest.spyOn(f.interests, 'findById').mockResolvedValueOnce(null);
    await expect(f.useCase.execute(command)).resolves.toMatchObject({
      ok: false, error: { code: 'resource.not_found' },
    });
    expect(f.commit).not.toHaveBeenCalled();
  });
});
