import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { ScanJob, ScanPolicy, SourceBinding } from '../../domain';
import type {
  ListSourceBindingsQuery,
  ListSourceBindingsResult,
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

  async findLatestBySourceBinding(
    params: Parameters<ScanJobRepositoryPort['findLatestBySourceBinding']>[0],
  ): Promise<ScanJob | null> {
    const jobs = [...this.jobsById.values()]
      .filter((job) => {
        const snapshot = job.toSnapshot();

        return (
          snapshot.tenantId === params.tenantId &&
          snapshot.workspaceId === params.workspaceId &&
          snapshot.sourceBindingId === params.sourceBindingId
        );
      })
      .sort((left, right) => right.toSnapshot().requestedAt.getTime() - left.toSnapshot().requestedAt.getTime());

    return jobs[0] ?? null;
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
        topicId: 'topic-1',
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        providerKey: 'fake-source',
        sourceQuery: { mode: 'search', query: 'binding-1' },
        retryBudget: 3,
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

  it('enqueues daily GitHub repo radar scans with configured discovery query', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(SourceBinding.create({
      id: 'repo-radar-binding-1',
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-repo-radar',
      providerKey: 'github-repo-radar',
      capabilityProfileVersion: 1,
      config: {
        query: 'agent tooling',
        topics: ['ai', 'agents'],
        languages: ['TypeScript'],
      },
      createdAt: new Date('2026-06-05T00:00:00.000Z'),
    }));
    const policies = new FakeScanPolicies();
    policies.add(ScanPolicy.create({
      id: 'repo-radar-daily-policy',
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'repo-radar-binding-1',
      intervalSeconds: 86_400,
      freshnessSeconds: 86_400,
      retryBudget: 3,
      nextRunAt: new Date('2026-06-05T12:00:00.000Z'),
      createdAt: new Date('2026-06-05T00:00:00.000Z'),
    }));
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
      correlationId: 'scheduler-tick-repo-radar-daily',
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
        topicId: 'topic-repo-radar',
        sourceBindingId: 'repo-radar-binding-1',
        scanPolicyId: 'repo-radar-daily-policy',
        providerKey: 'github-repo-radar',
        sourceQuery: { mode: 'search', query: 'agent tooling' },
        retryBudget: 3,
        causationId: 'scheduled:repo-radar-daily-policy:2026-06-05T12:00:00.000Z',
      }),
    ]);
    expect((await policies.findBySourceBinding({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'repo-radar-binding-1',
    }))?.toSnapshot()).toMatchObject({
      nextRunAt: new Date('2026-06-06T12:00:00.000Z'),
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

  it('skips due policy and advances next run when latest successful scan is still fresh', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const policies = new FakeScanPolicies();
    policies.add(makePolicy());
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(ScanJob.request({
      id: 'fresh-completed-scan-job',
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      scanPolicyId: 'policy-1',
      idempotencyKey: 'manual-scan-fresh',
      requestedAt: new Date('2026-06-05T11:54:00.000Z'),
    }).markEnqueued({
      enqueuedAt: new Date('2026-06-05T11:54:01.000Z'),
    }).markSucceeded({
      completedAt: new Date('2026-06-05T11:55:00.000Z'),
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
      correlationId: 'scheduler-tick-fresh-scan',
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
    expect((await policies.findBySourceBinding({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
    }))?.toSnapshot()).toMatchObject({
      nextRunAt: new Date('2026-06-05T12:05:00.000Z'),
    });
  });

  it('backs off due policy when latest failed scan was provider rate limited', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const policies = new FakeScanPolicies();
    policies.add(ScanPolicy.create({
      id: 'policy-1',
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      intervalSeconds: 300,
      freshnessSeconds: 900,
      retryBudget: 3,
      nextRunAt: new Date('2026-06-05T11:55:00.000Z'),
      createdAt: new Date('2026-06-05T00:00:00.000Z'),
    }));
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(ScanJob.request({
      id: 'rate-limited-scan-job',
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      scanPolicyId: 'policy-1',
      idempotencyKey: 'manual-scan-rate-limited',
      requestedAt: new Date('2026-06-05T11:57:00.000Z'),
    }).markEnqueued({
      enqueuedAt: new Date('2026-06-05T11:57:01.000Z'),
    }).markFailed({
      completedAt: new Date('2026-06-05T11:58:00.000Z'),
      failureReason: 'Provider rate limit 429',
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
      correlationId: 'scheduler-tick-rate-limit-backoff',
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
    expect((await policies.findBySourceBinding({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
    }))?.toSnapshot()).toMatchObject({
      nextRunAt: new Date('2026-06-05T12:03:00.000Z'),
    });
  });

  it('skips due policy without advancing next run when source binding is paused', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding().pause());
    const policies = new FakeScanPolicies();
    policies.add(makePolicy());
    const scanJobs = new FakeScanJobs();
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
      correlationId: 'scheduler-tick-paused-binding',
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
