import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { ScanJob, ScanPolicy, SourceBinding } from '../../domain';
import type {
  ScanJobRepositoryPort,
  ScanPolicyRepositoryPort,
  ScanQueuePort,
  SourceBindingRepositoryPort,
} from '../../ports';
import { ScheduleDueScansUseCase } from './schedule-due-scans.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `scan-job-${this.nextId}`;
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

  async findDue(params: Parameters<ScanPolicyRepositoryPort['findDue']>[0]): Promise<readonly ScanPolicy[]> {
    return [...this.policies.values()]
      .filter((policy) => {
        const snapshot = policy.toSnapshot();

        return (
          (params.tenantId === undefined || snapshot.tenantId === params.tenantId) &&
          (params.workspaceId === undefined || snapshot.workspaceId === params.workspaceId) &&
          snapshot.nextRunAt.getTime() <= params.now.getTime()
        );
      })
      .slice(0, params.limit);
  }

  async findBySourceBinding(
    params: Parameters<ScanPolicyRepositoryPort['findBySourceBinding']>[0],
  ): Promise<ScanPolicy | null> {
    return this.policies.get(`${params.tenantId}:${params.workspaceId}:${params.sourceBindingId}`) ?? null;
  }
}

class FakeScanJobs implements ScanJobRepositoryPort {
  private readonly jobsById = new Map<string, ScanJob>();
  private readonly jobsByIdempotencyKey = new Map<string, ScanJob>();

  async save(job: ScanJob): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobsById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, job);
    this.jobsByIdempotencyKey.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.idempotencyKey}`, job);
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
    return this.jobsByIdempotencyKey.get(`${params.tenantId}:${params.workspaceId}:${params.idempotencyKey}`) ?? null;
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
    nextRunAt: new Date('2026-06-05T12:00:00.000Z'),
    createdAt: new Date('2026-06-05T00:00:00.000Z'),
  });

describe('ScheduleDueScansUseCase', () => {
  it('enqueues due scan policy and advances next run', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const policies = new FakeScanPolicies();
    policies.add(makePolicy());
    const queue = new FakeScanQueue();
    const useCase = new ScheduleDueScansUseCase(
      bindings,
      policies,
      new FakeScanJobs(),
      queue,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T12:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 10,
      correlationId: 'scheduler-tick-1',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 1,
        skipped: 0,
      },
    });
    expect(queue.commands).toEqual([
      expect.objectContaining({
        scanJobId: 'scan-job-1',
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        providerKey: 'fake-source',
        sourceQuery: { mode: 'search', query: 'binding-1' },
        causationId: 'scheduled:policy-1:2026-06-05T12:00:00.000Z',
      }),
    ]);
    expect((await policies.findBySourceBinding({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
    }))?.toSnapshot()).toMatchObject({
      nextRunAt: new Date('2026-06-05T12:05:00.000Z'),
    });
  });

  it('does not enqueue a policy before next run is due', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const policies = new FakeScanPolicies();
    policies.add(makePolicy());
    const queue = new FakeScanQueue();
    const useCase = new ScheduleDueScansUseCase(
      bindings,
      policies,
      new FakeScanJobs(),
      queue,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T11:59:59.000Z')),
    );

    const result = await useCase.execute({
      limit: 10,
      correlationId: 'scheduler-tick-before-due',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T11:59:59.000Z'),
        evaluated: 0,
        enqueued: 0,
        skipped: 0,
      },
    });
    expect(queue.commands).toHaveLength(0);
  });

  it('skips due policy when source binding already has active scan job', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const policies = new FakeScanPolicies();
    policies.add(makePolicy());
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(ScanJob.request({
      id: 'active-scan-job',
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      scanPolicyId: 'policy-1',
      idempotencyKey: 'manual-scan-active',
      requestedAt: new Date('2026-06-05T11:59:00.000Z'),
    }).markEnqueued({
      enqueuedAt: new Date('2026-06-05T11:59:01.000Z'),
    }));
    const queue = new FakeScanQueue();
    const useCase = new ScheduleDueScansUseCase(
      bindings,
      policies,
      scanJobs,
      queue,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T12:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 10,
      correlationId: 'scheduler-tick-active-scan',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 0,
        skipped: 1,
      },
    });
    expect(queue.commands).toHaveLength(0);
  });

  it('skips due policy without advancing next run when queue is backpressured', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const policies = new FakeScanPolicies();
    policies.add(makePolicy());
    const scanJobs = new FakeScanJobs();
    const queue = new BackpressuredScanQueue();
    const useCase = new ScheduleDueScansUseCase(
      bindings,
      policies,
      scanJobs,
      queue,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T12:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 10,
      correlationId: 'scheduler-tick-backpressure',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 0,
        skipped: 1,
      },
    });
    await expect(scanJobs.findByIdempotencyKey({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      idempotencyKey: 'scheduled:policy-1:2026-06-05T12:00:00.000Z',
    })).resolves.toBeNull();
    expect(queue.commands).toHaveLength(0);
    expect((await policies.findBySourceBinding({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
    }))?.toSnapshot()).toMatchObject({
      nextRunAt: new Date('2026-06-05T12:00:00.000Z'),
    });
  });

  it('rejects unsafe scheduler batch size', async () => {
    const useCase = new ScheduleDueScansUseCase(
      new FakeSourceBindings(),
      new FakeScanPolicies(),
      new FakeScanJobs(),
      new FakeScanQueue(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T12:00:00.000Z')),
    );

    const result = await useCase.execute({
      limit: 0,
      correlationId: 'scheduler-tick-invalid',
    });

    expect(result.ok).toBe(false);
  });
});
