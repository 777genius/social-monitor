import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { SourceBinding, type ScanPolicy } from '../../domain';
import type {
  IdempotencyPort,
  ListSourceBindingsQuery,
  ListSourceBindingsResult,
  OutboxPort,
  ScanPolicyRepositoryPort,
  SourceBindingRepositoryPort,
} from '../../ports';
import type { SetScanPolicyResult } from './set-scan-policy.result';
import { SetScanPolicyUseCase } from './set-scan-policy.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `00000000-0000-7000-8000-${this.nextId.toString().padStart(12, '0')}`;
    this.nextId += 1;
    return id;
  }
}

class FakeSourceBindings implements SourceBindingRepositoryPort {
  private readonly bindings = new Map<string, SourceBinding>();

  add(binding: SourceBinding): void {
    const snapshot = binding.toSnapshot();
    this.bindings.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, binding);
  }

  async save(binding: SourceBinding): Promise<void> {
    this.add(binding);
  }

  async findByTopicAndProvider(): Promise<SourceBinding | null> {
    return null;
  }

  async findById(params: Parameters<SourceBindingRepositoryPort['findById']>[0]): Promise<SourceBinding | null> {
    return this.bindings.get(`${params.tenantId}:${params.workspaceId}:${params.sourceBindingId}`) ?? null;
  }

  async listByTopic(query: ListSourceBindingsQuery): Promise<ListSourceBindingsResult> {
    return {
      sourceBindings: [...this.bindings.values()].filter((binding) => {
        const snapshot = binding.toSnapshot();

        return (
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          snapshot.topicId === query.topicId
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

class FakeOutbox implements OutboxPort {
  readonly events: unknown[] = [];

  async append(event: Parameters<OutboxPort['append']>[0]): Promise<void> {
    this.events.push(event);
  }
}

class FakeIdempotency implements IdempotencyPort {
  private readonly records = new Map<string, SetScanPolicyResult>();

  async get<TValue>(params: Parameters<IdempotencyPort['get']>[0]) {
    const value = this.records.get(this.key(params));
    return value === undefined ? null : { value: value as TValue };
  }

  async set<TValue>(params: Parameters<IdempotencyPort['set']>[0] & { value: TValue }): Promise<void> {
    this.records.set(this.key(params), params.value as SetScanPolicyResult);
  }

  private key(params: { tenantId: string; workspaceId: string; scope: string; key: string }): string {
    return `${params.tenantId}:${params.workspaceId}:${params.scope}:${params.key}`;
  }
}

const makeBinding = (providerKey = 'fake-source') =>
  SourceBinding.create({
    id: 'binding-1',
    tenantId: tenantId('tenant-1'),
    workspaceId: workspaceId('workspace-1'),
    topicId: 'topic-1',
    providerKey,
    capabilityProfileVersion: 1,
    config: {},
    createdAt: new Date('2026-06-05T00:00:00.000Z'),
  });

describe('SetScanPolicyUseCase', () => {
  it('sets scan policy for a source binding and appends an event', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const outbox = new FakeOutbox();
    const useCase = new SetScanPolicyUseCase(
      bindings,
      new FakeScanPolicies(),
      outbox,
      new FakeIdempotency(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      intervalSeconds: 300,
      freshnessSeconds: 900,
      retryBudget: 3,
      idempotencyKey: 'scan-policy-1',
      correlationId: 'correlation-1',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.created).toBe(true);
    expect(result.ok && result.value.updated).toBe(false);
    expect(outbox.events).toHaveLength(1);
  });

  it('updates an existing scan policy when timing changes', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const policies = new FakeScanPolicies();
    const outbox = new FakeOutbox();
    const idempotency = new FakeIdempotency();
    const ids = new SequenceIdGenerator();

    const created = await new SetScanPolicyUseCase(
      bindings,
      policies,
      outbox,
      idempotency,
      ids,
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    ).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      intervalSeconds: 3600,
      freshnessSeconds: 7200,
      retryBudget: 3,
      idempotencyKey: 'scan-policy-create',
      correlationId: 'correlation-1',
    });
    expect(created.ok && created.value.created).toBe(true);

    const updated = await new SetScanPolicyUseCase(
      bindings,
      policies,
      outbox,
      idempotency,
      ids,
      new FixedClock(new Date('2026-06-05T01:00:00.000Z')),
    ).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      intervalSeconds: 28800,
      freshnessSeconds: 28800,
      retryBudget: 5,
      idempotencyKey: 'scan-policy-update',
      correlationId: 'correlation-2',
    });

    expect(updated).toEqual({
      ok: true,
      value: {
        scanPolicyId: created.ok ? created.value.scanPolicyId : expect.any(String),
        created: false,
        updated: true,
      },
    });
    expect(outbox.events).toHaveLength(2);

    const stored = await policies.findBySourceBinding({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
    });
    expect(stored?.toSnapshot()).toMatchObject({
      intervalSeconds: 28800,
      freshnessSeconds: 28800,
      retryBudget: 5,
      nextRunAt: new Date('2026-06-05T09:00:00.000Z'),
    });
  });

  it('does not append an event when an existing scan policy is unchanged', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const policies = new FakeScanPolicies();
    const outbox = new FakeOutbox();
    const idempotency = new FakeIdempotency();
    const ids = new SequenceIdGenerator();
    const clock = new FixedClock(new Date('2026-06-05T00:00:00.000Z'));
    const useCase = new SetScanPolicyUseCase(
      bindings,
      policies,
      outbox,
      idempotency,
      ids,
      clock,
    );

    await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      intervalSeconds: 3600,
      freshnessSeconds: 7200,
      retryBudget: 3,
      idempotencyKey: 'scan-policy-create',
      correlationId: 'correlation-1',
    });
    const unchanged = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      intervalSeconds: 3600,
      freshnessSeconds: 7200,
      retryBudget: 3,
      idempotencyKey: 'scan-policy-same-values',
      correlationId: 'correlation-2',
    });

    expect(unchanged).toEqual({
      ok: true,
      value: {
        scanPolicyId: expect.any(String),
        created: false,
        updated: false,
      },
    });
    expect(outbox.events).toHaveLength(1);
  });

  it('rejects missing source binding', async () => {
    const useCase = new SetScanPolicyUseCase(
      new FakeSourceBindings(),
      new FakeScanPolicies(),
      new FakeOutbox(),
      new FakeIdempotency(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'missing',
      intervalSeconds: 300,
      freshnessSeconds: 900,
      retryBudget: 3,
      idempotencyKey: 'scan-policy-1',
      correlationId: 'correlation-1',
    });

    expect(result.ok).toBe(false);
  });

  it('rejects scan intervals below provider cadence minimum', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding('github-repo-radar'));

    const result = await new SetScanPolicyUseCase(
      bindings,
      new FakeScanPolicies(),
      new FakeOutbox(),
      new FakeIdempotency(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    ).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      intervalSeconds: 300,
      freshnessSeconds: 900,
      retryBudget: 3,
      idempotencyKey: 'scan-policy-too-aggressive',
      correlationId: 'correlation-1',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
        details: {
          providerKey: 'github-repo-radar',
          intervalSeconds: 300,
          minimumIntervalSeconds: 21_600,
        },
      }),
    });
  });

  it('rejects freshness windows smaller than the scan interval without throwing', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());

    const result = await new SetScanPolicyUseCase(
      bindings,
      new FakeScanPolicies(),
      new FakeOutbox(),
      new FakeIdempotency(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    ).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      intervalSeconds: 900,
      freshnessSeconds: 300,
      retryBudget: 3,
      idempotencyKey: 'scan-policy-invalid',
      correlationId: 'correlation-1',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
      }),
    });
  });
});
