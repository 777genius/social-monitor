import { DomainError, FixedClock, type IdGenerator, ok, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { ScanPolicy, SourceBinding, type ScanJob } from '../../domain';
import type {
  IdempotencyPort,
  OutboxPort,
  ScanJobRepositoryPort,
  ScanPolicyRepositoryPort,
  ScanRequestQuotaPort,
  ScanQueuePort,
  SourceBindingRepositoryPort,
} from '../../ports';
import type { RequestScanResult } from './request-scan.result';
import { RequestScanUseCase } from './request-scan.use-case';

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
}

class FakeScanPolicies implements ScanPolicyRepositoryPort {
  private readonly policies = new Map<string, ScanPolicy>();

  add(policy: ScanPolicy): void {
    const snapshot = policy.toSnapshot();
    this.policies.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.sourceBindingId}`, policy);
  }

  async save(policy: ScanPolicy): Promise<void> {
    this.add(policy);
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

class FakeScanJobs implements ScanJobRepositoryPort {
  private readonly jobs = new Map<string, ScanJob>();
  private readonly jobsById = new Map<string, ScanJob>();

  async save(job: ScanJob): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobsById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, job);
    this.jobs.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.idempotencyKey}`, job);
  }

  async findById(params: Parameters<ScanJobRepositoryPort['findById']>[0]): Promise<ScanJob | null> {
    return this.jobsById.get(`${params.tenantId}:${params.workspaceId}:${params.scanJobId}`) ?? null;
  }

  async findActiveBySourceBinding(
    params: Parameters<ScanJobRepositoryPort['findActiveBySourceBinding']>[0],
  ): Promise<ScanJob | null> {
    return (
      [...this.jobsById.values()].find((job) => {
        const snapshot = job.toSnapshot();

        return (
          snapshot.tenantId === params.tenantId &&
          snapshot.workspaceId === params.workspaceId &&
          snapshot.sourceBindingId === params.sourceBindingId &&
          (snapshot.status === 'requested' || snapshot.status === 'enqueued')
        );
      }) ?? null
    );
  }

  async findByIdempotencyKey(
    params: Parameters<ScanJobRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<ScanJob | null> {
    return this.jobs.get(`${params.tenantId}:${params.workspaceId}:${params.idempotencyKey}`) ?? null;
  }
}

class FakeOutbox implements OutboxPort {
  readonly events: unknown[] = [];

  async append(event: Parameters<OutboxPort['append']>[0]): Promise<void> {
    this.events.push(event);
  }
}

class FakeScanQueue implements ScanQueuePort {
  readonly commands: unknown[] = [];

  async canAccept(): Promise<boolean> {
    return true;
  }

  async enqueue(command: Parameters<ScanQueuePort['enqueue']>[0]): Promise<void> {
    this.commands.push(command);
  }
}

class BackpressuredScanQueue implements ScanQueuePort {
  readonly commands: unknown[] = [];

  async canAccept(): Promise<boolean> {
    return false;
  }

  async enqueue(command: Parameters<ScanQueuePort['enqueue']>[0]): Promise<void> {
    this.commands.push(command);
  }
}

class FakeIdempotency implements IdempotencyPort {
  private readonly records = new Map<string, RequestScanResult>();

  async get<TValue>(params: Parameters<IdempotencyPort['get']>[0]) {
    const value = this.records.get(this.key(params));
    return value === undefined ? null : { value: value as TValue };
  }

  async set<TValue>(params: Parameters<IdempotencyPort['set']>[0] & { value: TValue }): Promise<void> {
    this.records.set(this.key(params), params.value as RequestScanResult);
  }

  private key(params: { tenantId: string; workspaceId: string; scope: string; key: string }): string {
    return `${params.tenantId}:${params.workspaceId}:${params.scope}:${params.key}`;
  }
}

class AllowingScanRequestQuota implements ScanRequestQuotaPort {
  reservationCount = 0;

  async reserveManualScanRequest(): ReturnType<ScanRequestQuotaPort['reserveManualScanRequest']> {
    this.reservationCount += 1;

    return ok({
      remaining: 59,
      resetAt: '2026-06-05T01:00:00.000Z',
    });
  }
}

class DenyingScanRequestQuota implements ScanRequestQuotaPort {
  async reserveManualScanRequest(): ReturnType<ScanRequestQuotaPort['reserveManualScanRequest']> {
    return {
      ok: false,
      error: new DomainError('operation.quota_exceeded', 'Usage quota exceeded'),
    };
  }
}

const makeBinding = () =>
  SourceBinding.create({
    id: 'binding-1',
    tenantId: tenantId('tenant-1'),
    workspaceId: workspaceId('workspace-1'),
    topicId: 'topic-1',
    providerKey: 'fake-source',
    capabilityProfileVersion: 1,
    config: {},
    createdAt: new Date('2026-06-05T00:00:00.000Z'),
  });

const makePolicy = () =>
  ScanPolicy.create({
    id: 'policy-1',
    tenantId: tenantId('tenant-1'),
    workspaceId: workspaceId('workspace-1'),
    sourceBindingId: 'binding-1',
    intervalSeconds: 300,
    freshnessSeconds: 900,
    retryBudget: 3,
    nextRunAt: new Date('2026-06-05T00:00:00.000Z'),
    createdAt: new Date('2026-06-05T00:00:00.000Z'),
  });

describe('RequestScanUseCase', () => {
  it('requests scan for source binding with scan policy and appends an event', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const policies = new FakeScanPolicies();
    policies.add(makePolicy());
    const outbox = new FakeOutbox();
    const queue = new FakeScanQueue();
    const useCase = new RequestScanUseCase(
      bindings,
      policies,
      new FakeScanJobs(),
      queue,
      outbox,
      new FakeIdempotency(),
      new AllowingScanRequestQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'scan-1',
      correlationId: 'correlation-1',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.created).toBe(true);
    expect(result.ok && result.value.status).toBe('enqueued');
    expect(outbox.events).toHaveLength(1);
    expect(queue.commands).toEqual([
      expect.objectContaining({
        topicId: 'topic-1',
        providerKey: 'fake-source',
        sourceQuery: { mode: 'search', query: 'binding-1' },
      }),
    ]);
  });

  it('returns existing active scan job instead of enqueueing overlapping manual scan', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const policies = new FakeScanPolicies();
    policies.add(makePolicy());
    const scanJobs = new FakeScanJobs();
    const queue = new FakeScanQueue();
    const useCase = new RequestScanUseCase(
      bindings,
      policies,
      scanJobs,
      queue,
      new FakeOutbox(),
      new FakeIdempotency(),
      new AllowingScanRequestQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    );

    const first = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'manual-scan-1',
      correlationId: 'correlation-1',
    });
    const second = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'manual-scan-2',
      correlationId: 'correlation-2',
    });

    if (!first.ok) {
      throw first.error;
    }

    expect(first.value.created).toBe(true);
    expect(second).toEqual({
      ok: true,
      value: {
        scanJobId: first.value.scanJobId,
        status: 'enqueued',
        created: false,
      },
    });
    expect(queue.commands).toHaveLength(1);
  });

  it('rejects request when scan policy is missing', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const useCase = new RequestScanUseCase(
      bindings,
      new FakeScanPolicies(),
      new FakeScanJobs(),
      new FakeScanQueue(),
      new FakeOutbox(),
      new FakeIdempotency(),
      new AllowingScanRequestQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'scan-1',
      correlationId: 'correlation-1',
    });

    expect(result.ok).toBe(false);
  });

  it('checks backpressure after idempotency and overlap gates but before quota, job creation or outbox', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const policies = new FakeScanPolicies();
    policies.add(makePolicy());
    const scanJobs = new FakeScanJobs();
    const queue = new BackpressuredScanQueue();
    const outbox = new FakeOutbox();
    const quota = new AllowingScanRequestQuota();
    const useCase = new RequestScanUseCase(
      bindings,
      policies,
      scanJobs,
      queue,
      outbox,
      new FakeIdempotency(),
      quota,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'scan-1',
      correlationId: 'correlation-1',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'operation.backpressure',
      }),
    });
    await expect(scanJobs.findByIdempotencyKey({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      idempotencyKey: 'scan-1',
    })).resolves.toBeNull();
    expect(quota.reservationCount).toBe(0);
    expect(queue.commands).toHaveLength(0);
    expect(outbox.events).toHaveLength(0);
  });

  it('checks quota after idempotency, overlap and backpressure gates but before creating or enqueueing a scan job', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const policies = new FakeScanPolicies();
    policies.add(makePolicy());
    const scanJobs = new FakeScanJobs();
    const queue = new FakeScanQueue();
    const outbox = new FakeOutbox();
    const useCase = new RequestScanUseCase(
      bindings,
      policies,
      scanJobs,
      queue,
      outbox,
      new FakeIdempotency(),
      new DenyingScanRequestQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'scan-1',
      correlationId: 'correlation-1',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'operation.quota_exceeded',
      }),
    });
    await expect(scanJobs.findByIdempotencyKey({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      idempotencyKey: 'scan-1',
    })).resolves.toBeNull();
    expect(queue.commands).toHaveLength(0);
    expect(outbox.events).toHaveLength(0);
  });
});
