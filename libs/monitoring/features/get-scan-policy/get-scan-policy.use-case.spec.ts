import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { ScanPolicy, SourceBinding, type ScanPolicyProps, type SourceBindingProps } from '../../domain';
import type {
  ListSourceBindingsQuery,
  ListSourceBindingsResult,
  ScanPolicyRepositoryPort,
  SourceBindingRepositoryPort,
} from '../../ports';
import { GetScanPolicyUseCase } from './get-scan-policy.use-case';

describe('GetScanPolicyUseCase', () => {
  it('returns scan policy metadata for an existing source binding', async () => {
    const bindings = new FakeSourceBindings();
    const policies = new FakeScanPolicies();
    bindings.add(makeBinding());
    await policies.save(makePolicy());

    await expect(new GetScanPolicyUseCase(bindings, policies).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
    })).resolves.toEqual({
      ok: true,
      value: {
        id: 'scan-policy-1',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
        nextRunAt: '2026-06-05T00:05:00.000Z',
        createdAt: '2026-06-05T00:00:00.000Z',
        cadence: {
          providerKey: 'fake-source',
          minimumIntervalSeconds: 60,
          configuredIntervalSeconds: 300,
          configuredFreshnessSeconds: 900,
          effectiveIntervalSeconds: 300,
          effectiveFreshnessSeconds: 900,
          providerMinimumIntervalEnforced: false,
        },
      },
    });
  });

  it('reports effective cadence when a legacy policy is below provider minimums', async () => {
    const bindings = new FakeSourceBindings();
    const policies = new FakeScanPolicies();
    bindings.add(makeBinding({ providerKey: 'reddit' }));
    await policies.save(makePolicy({
      intervalSeconds: 60,
      freshnessSeconds: 60,
    }));

    await expect(new GetScanPolicyUseCase(bindings, policies).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
    })).resolves.toEqual({
      ok: true,
      value: expect.objectContaining({
        intervalSeconds: 60,
        freshnessSeconds: 60,
        cadence: {
          providerKey: 'reddit',
          minimumIntervalSeconds: 900,
          configuredIntervalSeconds: 60,
          configuredFreshnessSeconds: 60,
          effectiveIntervalSeconds: 900,
          effectiveFreshnessSeconds: 900,
          providerMinimumIntervalEnforced: true,
        },
      }),
    });
  });

  it('rejects missing source binding before exposing policy state', async () => {
    await expect(new GetScanPolicyUseCase(new FakeSourceBindings(), new FakeScanPolicies()).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'missing-binding',
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'resource.not_found',
      }),
    });
  });
});

const makeBinding = (
  overrides: Partial<Omit<SourceBindingProps, 'status'>> = {},
): SourceBinding => SourceBinding.create({
  id: 'binding-1',
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  interestId: 'interest-1',
  providerKey: 'fake-source',
  capabilityProfileVersion: 1,
  config: {},
  createdAt: new Date('2026-06-05T00:00:00.000Z'),
  ...overrides,
});

const makePolicy = (overrides: Partial<ScanPolicyProps> = {}): ScanPolicy => ScanPolicy.create({
  id: 'scan-policy-1',
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  sourceBindingId: 'binding-1',
  intervalSeconds: 300,
  freshnessSeconds: 900,
  retryBudget: 3,
  nextRunAt: new Date('2026-06-05T00:05:00.000Z'),
  createdAt: new Date('2026-06-05T00:00:00.000Z'),
  ...overrides,
});

class FakeSourceBindings implements SourceBindingRepositoryPort {
  private readonly bindings = new Map<string, SourceBinding>();

  add(binding: SourceBinding): void {
    const snapshot = binding.toSnapshot();

    this.bindings.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, binding);
  }

  async save(binding: SourceBinding): Promise<void> {
    this.add(binding);
  }

  async findByInterestAndProvider(): Promise<SourceBinding | null> {
    return null;
  }

  async findById(params: Parameters<SourceBindingRepositoryPort['findById']>[0]): Promise<SourceBinding | null> {
    return this.bindings.get(`${params.tenantId}:${params.workspaceId}:${params.sourceBindingId}`) ?? null;
  }

  async listByInterest(query: ListSourceBindingsQuery): Promise<ListSourceBindingsResult> {
    return {
      sourceBindings: [...this.bindings.values()].filter((binding) => {
        const snapshot = binding.toSnapshot();

        return (
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          snapshot.interestId === query.interestId
        );
      }),
      nextCursor: undefined,
    };
  }
}

class FakeScanPolicies implements ScanPolicyRepositoryPort {
  private readonly policies = new Map<string, ScanPolicy>();

  async save(policy: ScanPolicy): Promise<void> {
    const snapshot = policy.toSnapshot();

    this.policies.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.sourceBindingId}`, policy);
  }

  async findDue(): Promise<readonly ScanPolicy[]> {
    return [];
  }

  async findBySourceBinding(
    params: Parameters<ScanPolicyRepositoryPort['findBySourceBinding']>[0],
  ): Promise<ScanPolicy | null> {
    return this.policies.get(`${params.tenantId}:${params.workspaceId}:${params.sourceBindingId}`) ?? null;
  }
}
