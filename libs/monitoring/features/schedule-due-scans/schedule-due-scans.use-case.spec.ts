import {
  FixedClock,
  type IdGenerator,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import { ScanJob, ScanPolicy, SourceBinding } from '../../domain';
import type {
  ListScanJobsBySourceBindingQuery,
  ListScanJobsBySourceBindingResult,
  ListSourceBindingsQuery,
  ListSourceBindingsResult,
  ScanJobRepositoryPort,
  ScanPolicyRepositoryPort,
  ScanQueuePort,
  ScanSchedulerDecisionHistoryPort,
  ScanSchedulerDecisionRecord,
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
    this.bindings.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`,
      binding,
    );
  }

  async save(binding: SourceBinding): Promise<void> {
    this.add(binding);
  }

  async findByTopicAndProvider(): Promise<SourceBinding | null> {
    return null;
  }

  async findById(
    params: Parameters<SourceBindingRepositoryPort['findById']>[0],
  ): Promise<SourceBinding | null> {
    return (
      this.bindings.get(
        `${params.tenantId}:${params.workspaceId}:${params.sourceBindingId}`,
      ) ?? null
    );
  }

  async listByTopic(
    query: ListSourceBindingsQuery,
  ): Promise<ListSourceBindingsResult> {
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
    this.policies.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.sourceBindingId}`,
      policy,
    );
  }

  async save(policy: ScanPolicy): Promise<void> {
    this.add(policy);
  }

  async findDue(
    params: Parameters<ScanPolicyRepositoryPort['findDue']>[0],
  ): Promise<readonly ScanPolicy[]> {
    return [...this.policies.values()]
      .filter((policy) => {
        const snapshot = policy.toSnapshot();

        return (
          (params.tenantId === undefined ||
            snapshot.tenantId === params.tenantId) &&
          (params.workspaceId === undefined ||
            snapshot.workspaceId === params.workspaceId) &&
          snapshot.nextRunAt.getTime() <= params.now.getTime()
        );
      })
      .slice(0, params.limit);
  }

  async findBySourceBinding(
    params: Parameters<ScanPolicyRepositoryPort['findBySourceBinding']>[0],
  ): Promise<ScanPolicy | null> {
    return (
      this.policies.get(
        `${params.tenantId}:${params.workspaceId}:${params.sourceBindingId}`,
      ) ?? null
    );
  }
}

class FakeScanJobs implements ScanJobRepositoryPort {
  private readonly jobsById = new Map<string, ScanJob>();
  private readonly jobsByIdempotencyKey = new Map<string, ScanJob>();

  async save(job: ScanJob): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobsById.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`,
      job,
    );
    this.jobsByIdempotencyKey.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.idempotencyKey}`,
      job,
    );
  }

  async findById(
    params: Parameters<ScanJobRepositoryPort['findById']>[0],
  ): Promise<ScanJob | null> {
    return (
      this.jobsById.get(
        `${params.tenantId}:${params.workspaceId}:${params.scanJobId}`,
      ) ?? null
    );
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
    const jobs = this.sortedBySourceBinding(params);

    return jobs[0] ?? null;
  }

  async listBySourceBinding(
    query: ListScanJobsBySourceBindingQuery,
  ): Promise<ListScanJobsBySourceBindingResult> {
    const jobs = this.sortedBySourceBinding(query).slice(0, query.limit);

    return { scanJobs: jobs };
  }

  async findByIdempotencyKey(
    params: Parameters<ScanJobRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<ScanJob | null> {
    return (
      this.jobsByIdempotencyKey.get(
        `${params.tenantId}:${params.workspaceId}:${params.idempotencyKey}`,
      ) ?? null
    );
  }

  private sortedBySourceBinding(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly sourceBindingId: string;
  }): readonly ScanJob[] {
    return [...this.jobsById.values()]
      .filter((job) => {
        const snapshot = job.toSnapshot();

        return (
          snapshot.tenantId === params.tenantId &&
          snapshot.workspaceId === params.workspaceId &&
          snapshot.sourceBindingId === params.sourceBindingId
        );
      })
      .sort(
        (left, right) =>
          right.toSnapshot().requestedAt.getTime() -
          left.toSnapshot().requestedAt.getTime(),
      );
  }
}

class FakeScanQueue implements ScanQueuePort {
  readonly commands: unknown[] = [];

  async canAccept(): Promise<boolean> {
    return true;
  }

  async enqueue(
    command: Parameters<ScanQueuePort['enqueue']>[0],
  ): Promise<void> {
    this.commands.push(command);
  }
}

class BackpressuredScanQueue implements ScanQueuePort {
  readonly commands: unknown[] = [];

  async canAccept(): Promise<boolean> {
    return false;
  }

  async enqueue(
    command: Parameters<ScanQueuePort['enqueue']>[0],
  ): Promise<void> {
    this.commands.push(command);
  }
}

class FakeSchedulerDecisionHistory implements ScanSchedulerDecisionHistoryPort {
  readonly records: ScanSchedulerDecisionRecord[] = [];

  async recordBatch(
    command: Parameters<ScanSchedulerDecisionHistoryPort['recordBatch']>[0],
  ): Promise<void> {
    this.records.push(...command.records);
  }

  async listBySourceBindingWindow(): ReturnType<
    ScanSchedulerDecisionHistoryPort['listBySourceBindingWindow']
  > {
    return { records: this.records, truncated: false };
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

const noSkippedByReason = () => ({
  active_scan: 0,
  duplicate_window: 0,
  fresh_success: 0,
  provider_failure_backoff: 0,
  queue_backpressure: 0,
  rate_limit_backoff: 0,
  source_unavailable: 0,
});

const skippedByReason = (
  reason: keyof ReturnType<typeof noSkippedByReason>,
) => ({
  ...noSkippedByReason(),
  [reason]: 1,
});

describe('ScheduleDueScansUseCase', () => {
  it('enqueues due scan policy and advances next run', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const policies = new FakeScanPolicies();
    policies.add(makePolicy());
    const queue = new FakeScanQueue();
    const schedulerDecisions = new FakeSchedulerDecisionHistory();
    const useCase = new ScheduleDueScansUseCase(
      bindings,
      policies,
      new FakeScanJobs(),
      queue,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T12:00:00.000Z')),
      schedulerDecisions,
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 10,
      correlationId: 'scheduler-tick-1',
      includeDecisions: true,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 1,
        skipped: 0,
        skippedByReason: noSkippedByReason(),
        decisions: [
          {
            scanPolicyId: 'policy-1',
            sourceBindingId: 'binding-1',
            providerKey: 'fake-source',
            decision: 'enqueued',
            reason: 'scan_policy_due_now',
            scanJobId: 'scan-job-1',
            policyDueAt: new Date('2026-06-05T12:00:00.000Z'),
            nextRunAt: new Date('2026-06-05T12:05:00.000Z'),
            configuredIntervalSeconds: 300,
            effectiveIntervalSeconds: 300,
            freshnessSeconds: 900,
            providerMinimumIntervalEnforced: false,
          },
        ],
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
    expect(
      (
        await policies.findBySourceBinding({
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'binding-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
      nextRunAt: new Date('2026-06-05T12:05:00.000Z'),
    });
    expect(schedulerDecisions.records).toEqual([
      expect.objectContaining({
        id: 'scan-job-2',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        decisionKey: 'scan-policy:policy-1:due-at:2026-06-05T12:00:00.000Z',
        scanPolicyId: 'policy-1',
        sourceBindingId: 'binding-1',
        providerKey: 'fake-source',
        decision: 'enqueued',
        reason: 'scan_policy_due_now',
        scanJobId: 'scan-job-1',
        policyDueAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluatedAt: new Date('2026-06-05T12:00:00.000Z'),
        nextRunAt: new Date('2026-06-05T12:05:00.000Z'),
        configuredIntervalSeconds: 300,
        effectiveIntervalSeconds: 300,
        freshnessSeconds: 900,
        providerMinimumIntervalEnforced: false,
        correlationId: 'scheduler-tick-1',
        causationId: 'scheduled:policy-1:2026-06-05T12:00:00.000Z',
      }),
    ]);
  });

  it('fast-forwards stale due policies after scheduler downtime', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const policies = new FakeScanPolicies();
    policies.add(
      ScanPolicy.create({
        id: 'policy-1',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
        nextRunAt: new Date('2026-06-05T10:00:00.000Z'),
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
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
      correlationId: 'scheduler-tick-after-downtime',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 1,
        skipped: 0,
        skippedByReason: noSkippedByReason(),
      },
    });
    expect(queue.commands).toHaveLength(1);
    expect(
      (
        await policies.findBySourceBinding({
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'binding-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
      nextRunAt: new Date('2026-06-05T12:05:00.000Z'),
    });
  });

  it('advances legacy too-aggressive policies by provider minimum cadence after enqueue', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding('reddit'));
    const policies = new FakeScanPolicies();
    policies.add(
      ScanPolicy.create({
        id: 'policy-1',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        intervalSeconds: 60,
        freshnessSeconds: 60,
        retryBudget: 3,
        nextRunAt: new Date('2026-06-05T12:00:00.000Z'),
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
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
      correlationId: 'scheduler-tick-provider-minimum-enqueue',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 1,
        skipped: 0,
        skippedByReason: noSkippedByReason(),
      },
    });
    expect(queue.commands).toEqual([
      expect.objectContaining({
        providerKey: 'reddit',
        causationId: 'scheduled:policy-1:2026-06-05T12:00:00.000Z',
      }),
    ]);
    expect(
      (
        await policies.findBySourceBinding({
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'binding-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
      nextRunAt: new Date('2026-06-05T12:15:00.000Z'),
    });
  });

  it('uses provider minimum cadence when skipping recently scanned legacy policy', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding('reddit'));
    const policies = new FakeScanPolicies();
    policies.add(
      ScanPolicy.create({
        id: 'policy-1',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        intervalSeconds: 60,
        freshnessSeconds: 60,
        retryBudget: 3,
        nextRunAt: new Date('2026-06-05T12:00:00.000Z'),
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(
      ScanJob.request({
        id: 'recent-reddit-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        idempotencyKey: 'manual-recent-reddit-scan',
        requestedAt: new Date('2026-06-05T11:54:00.000Z'),
      })
        .markEnqueued({
          enqueuedAt: new Date('2026-06-05T11:54:01.000Z'),
        })
        .markSucceeded({
          completedAt: new Date('2026-06-05T11:55:00.000Z'),
        }),
    );
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
      correlationId: 'scheduler-tick-provider-minimum-fresh-skip',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 0,
        skipped: 1,
        skippedByReason: skippedByReason('fresh_success'),
      },
    });
    expect(queue.commands).toHaveLength(0);
    expect(
      (
        await policies.findBySourceBinding({
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'binding-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
      nextRunAt: new Date('2026-06-05T12:15:00.000Z'),
    });
  });

  it('enqueues daily GitHub repo radar scans with configured discovery query', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(
      SourceBinding.create({
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
      }),
    );
    const policies = new FakeScanPolicies();
    policies.add(
      ScanPolicy.create({
        id: 'repo-radar-daily-policy',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'repo-radar-binding-1',
        intervalSeconds: 86_400,
        freshnessSeconds: 86_400,
        retryBudget: 3,
        nextRunAt: new Date('2026-06-05T12:00:00.000Z'),
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
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
        skippedByReason: noSkippedByReason(),
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
        causationId:
          'scheduled:repo-radar-daily-policy:2026-06-05T12:00:00.000Z',
      }),
    ]);
    expect(
      (
        await policies.findBySourceBinding({
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'repo-radar-binding-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
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
        skippedByReason: noSkippedByReason(),
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
    await scanJobs.save(
      ScanJob.request({
        id: 'active-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        idempotencyKey: 'manual-scan-active',
        requestedAt: new Date('2026-06-05T11:59:00.000Z'),
      }).markEnqueued({
        enqueuedAt: new Date('2026-06-05T11:59:01.000Z'),
      }),
    );
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
        skippedByReason: skippedByReason('active_scan'),
      },
    });
    expect(queue.commands).toHaveLength(0);
  });

  it('skips due policy when scheduled idempotency window already exists', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const policies = new FakeScanPolicies();
    policies.add(makePolicy());
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(
      ScanJob.request({
        id: 'duplicate-window-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        idempotencyKey: 'scheduled:policy-1:2026-06-05T12:00:00.000Z',
        requestedAt: new Date('2026-06-05T11:50:00.000Z'),
      })
        .markEnqueued({
          enqueuedAt: new Date('2026-06-05T11:50:01.000Z'),
        })
        .markFailed({
          completedAt: new Date('2026-06-05T11:51:00.000Z'),
          failureReason: 'Provider rejected malformed query',
        }),
    );
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
      correlationId: 'scheduler-tick-duplicate-window',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 0,
        skipped: 1,
        skippedByReason: skippedByReason('duplicate_window'),
      },
    });
    expect(queue.commands).toHaveLength(0);
    expect(
      (
        await policies.findBySourceBinding({
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'binding-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
      nextRunAt: new Date('2026-06-05T12:05:00.000Z'),
    });
  });

  it('skips due policy and advances next run when latest successful scan is still fresh', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const policies = new FakeScanPolicies();
    policies.add(makePolicy());
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(
      ScanJob.request({
        id: 'fresh-completed-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        idempotencyKey: 'manual-scan-fresh',
        requestedAt: new Date('2026-06-05T11:54:00.000Z'),
      })
        .markEnqueued({
          enqueuedAt: new Date('2026-06-05T11:54:01.000Z'),
        })
        .markSucceeded({
          completedAt: new Date('2026-06-05T11:55:00.000Z'),
        }),
    );
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
        skippedByReason: skippedByReason('fresh_success'),
      },
    });
    expect(queue.commands).toHaveLength(0);
    expect(
      (
        await policies.findBySourceBinding({
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'binding-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
      nextRunAt: new Date('2026-06-05T12:05:00.000Z'),
    });
  });

  it('backs off due policy when latest failed scan was provider rate limited', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const policies = new FakeScanPolicies();
    policies.add(
      ScanPolicy.create({
        id: 'policy-1',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
        nextRunAt: new Date('2026-06-05T11:55:00.000Z'),
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(
      ScanJob.request({
        id: 'rate-limited-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        idempotencyKey: 'manual-scan-rate-limited',
        requestedAt: new Date('2026-06-05T11:57:00.000Z'),
      })
        .markEnqueued({
          enqueuedAt: new Date('2026-06-05T11:57:01.000Z'),
        })
        .markFailed({
          completedAt: new Date('2026-06-05T11:58:00.000Z'),
          failureReason: 'Provider rate limit 429',
        }),
    );
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
      includeDecisions: true,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 0,
        skipped: 1,
        skippedByReason: skippedByReason('rate_limit_backoff'),
        decisions: [
          {
            scanPolicyId: 'policy-1',
            sourceBindingId: 'binding-1',
            providerKey: 'fake-source',
            decision: 'skipped',
            reason: 'rate_limit_backoff',
            policyDueAt: new Date('2026-06-05T11:55:00.000Z'),
            nextRunAt: new Date('2026-06-05T12:03:00.000Z'),
            configuredIntervalSeconds: 300,
            effectiveIntervalSeconds: 300,
            freshnessSeconds: 900,
            providerMinimumIntervalEnforced: false,
            backoffUntil: new Date('2026-06-05T12:03:00.000Z'),
          },
        ],
      },
    });
    expect(queue.commands).toHaveLength(0);
    expect(
      (
        await policies.findBySourceBinding({
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'binding-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
      nextRunAt: new Date('2026-06-05T12:03:00.000Z'),
    });
  });

  it('backs off due policy after repeated provider auth failures', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding('reddit'));
    const policies = new FakeScanPolicies();
    policies.add(
      ScanPolicy.create({
        id: 'policy-1',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
        nextRunAt: new Date('2026-06-05T11:55:00.000Z'),
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
    const scanJobs = new FakeScanJobs();
    for (const [id, requestedAt, completedAt] of [
      [
        'auth-failed-scan-job-2',
        '2026-06-05T11:57:00.000Z',
        '2026-06-05T11:58:00.000Z',
      ],
      [
        'auth-failed-scan-job-1',
        '2026-06-05T11:56:00.000Z',
        '2026-06-05T11:57:00.000Z',
      ],
    ] as const) {
      await scanJobs.save(
        ScanJob.request({
          id,
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'binding-1',
          scanPolicyId: 'policy-1',
          idempotencyKey: `manual-${id}`,
          requestedAt: new Date(requestedAt),
        })
          .markEnqueued({
            enqueuedAt: new Date(new Date(requestedAt).getTime() + 1_000),
          })
          .markFailed({
            completedAt: new Date(completedAt),
            failureReason: 'kind=auth_failed provider credential rejected',
          }),
      );
    }
    const queue = new FakeScanQueue();
    const schedulerDecisions = new FakeSchedulerDecisionHistory();
    const useCase = new ScheduleDueScansUseCase(
      bindings,
      policies,
      scanJobs,
      queue,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T12:00:00.000Z')),
      schedulerDecisions,
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 10,
      correlationId: 'scheduler-tick-provider-failure-backoff',
      includeDecisions: true,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 0,
        skipped: 1,
        skippedByReason: skippedByReason('provider_failure_backoff'),
        decisions: [
          {
            scanPolicyId: 'policy-1',
            sourceBindingId: 'binding-1',
            providerKey: 'reddit',
            decision: 'skipped',
            reason: 'provider_failure_backoff',
            policyDueAt: new Date('2026-06-05T11:55:00.000Z'),
            nextRunAt: new Date('2026-06-05T12:28:00.000Z'),
            configuredIntervalSeconds: 300,
            effectiveIntervalSeconds: 900,
            freshnessSeconds: 900,
            providerMinimumIntervalEnforced: true,
            backoffUntil: new Date('2026-06-05T12:28:00.000Z'),
          },
        ],
      },
    });
    expect(queue.commands).toHaveLength(0);
    expect(
      (
        await policies.findBySourceBinding({
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'binding-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
      nextRunAt: new Date('2026-06-05T12:28:00.000Z'),
    });
    expect(schedulerDecisions.records).toEqual([
      expect.objectContaining({
        id: 'scan-job-1',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        decisionKey: 'scan-policy:policy-1:due-at:2026-06-05T11:55:00.000Z',
        scanPolicyId: 'policy-1',
        sourceBindingId: 'binding-1',
        providerKey: 'reddit',
        decision: 'skipped',
        reason: 'provider_failure_backoff',
        policyDueAt: new Date('2026-06-05T11:55:00.000Z'),
        evaluatedAt: new Date('2026-06-05T12:00:00.000Z'),
        nextRunAt: new Date('2026-06-05T12:28:00.000Z'),
        configuredIntervalSeconds: 300,
        effectiveIntervalSeconds: 900,
        freshnessSeconds: 900,
        providerMinimumIntervalEnforced: true,
        backoffUntil: new Date('2026-06-05T12:28:00.000Z'),
        correlationId: 'scheduler-tick-provider-failure-backoff',
        causationId: 'scheduled:policy-1:2026-06-05T11:55:00.000Z',
      }),
    ]);
  });

  it('skips due policy and advances next run when source binding is paused', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding('reddit').pause());
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
      includeDecisions: true,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 0,
        skipped: 1,
        skippedByReason: skippedByReason('source_unavailable'),
        decisions: [
          {
            scanPolicyId: 'policy-1',
            sourceBindingId: 'binding-1',
            providerKey: 'reddit',
            decision: 'skipped',
            reason: 'source_unavailable',
            policyDueAt: new Date('2026-06-05T12:00:00.000Z'),
            nextRunAt: new Date('2026-06-05T12:15:00.000Z'),
            configuredIntervalSeconds: 300,
            effectiveIntervalSeconds: 900,
            freshnessSeconds: 900,
            providerMinimumIntervalEnforced: true,
          },
        ],
      },
    });
    await expect(
      scanJobs.findByIdempotencyKey({
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        idempotencyKey: 'scheduled:policy-1:2026-06-05T12:00:00.000Z',
      }),
    ).resolves.toBeNull();
    expect(queue.commands).toHaveLength(0);
    expect(
      (
        await policies.findBySourceBinding({
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'binding-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
      nextRunAt: new Date('2026-06-05T12:15:00.000Z'),
    });
  });

  it('skips due policy and advances next run when queue is backpressured', async () => {
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
      includeDecisions: true,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scannedAt: new Date('2026-06-05T12:00:00.000Z'),
        evaluated: 1,
        enqueued: 0,
        skipped: 1,
        skippedByReason: skippedByReason('queue_backpressure'),
        decisions: [
          {
            scanPolicyId: 'policy-1',
            sourceBindingId: 'binding-1',
            providerKey: 'fake-source',
            decision: 'skipped',
            reason: 'queue_backpressure',
            policyDueAt: new Date('2026-06-05T12:00:00.000Z'),
            nextRunAt: new Date('2026-06-05T12:05:00.000Z'),
            configuredIntervalSeconds: 300,
            effectiveIntervalSeconds: 300,
            freshnessSeconds: 900,
            providerMinimumIntervalEnforced: false,
          },
        ],
      },
    });
    await expect(
      scanJobs.findByIdempotencyKey({
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        idempotencyKey: 'scheduled:policy-1:2026-06-05T12:00:00.000Z',
      }),
    ).resolves.toBeNull();
    expect(queue.commands).toHaveLength(0);
    expect(
      (
        await policies.findBySourceBinding({
          tenantId: tenantId('tenant-1'),
          workspaceId: workspaceId('workspace-1'),
          sourceBindingId: 'binding-1',
        })
      )?.toSnapshot(),
    ).toMatchObject({
      nextRunAt: new Date('2026-06-05T12:05:00.000Z'),
    });
  });

  it('keeps global scheduler decisions tenant-scoped across workspaces', async () => {
    const firstTenant = tenantId('tenant-global-scheduler-a');
    const firstWorkspace = workspaceId('workspace-global-scheduler-a');
    const secondTenant = tenantId('tenant-global-scheduler-b');
    const secondWorkspace = workspaceId('workspace-global-scheduler-b');
    const bindings = new FakeSourceBindings();
    bindings.add(
      SourceBinding.create({
        id: 'binding-global-a',
        tenantId: firstTenant,
        workspaceId: firstWorkspace,
        topicId: 'topic-global-a',
        providerKey: 'rss',
        capabilityProfileVersion: 1,
        config: { feedUrl: 'https://example.test/a.xml' },
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
    bindings.add(
      SourceBinding.create({
        id: 'binding-global-b',
        tenantId: secondTenant,
        workspaceId: secondWorkspace,
        topicId: 'topic-global-b',
        providerKey: 'reddit',
        capabilityProfileVersion: 1,
        config: { subreddit: 'programming', listing: 'hot' },
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
    const policies = new FakeScanPolicies();
    policies.add(
      ScanPolicy.create({
        id: 'policy-global-a',
        tenantId: firstTenant,
        workspaceId: firstWorkspace,
        sourceBindingId: 'binding-global-a',
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 2,
        nextRunAt: new Date('2026-06-05T12:00:00.000Z'),
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
    policies.add(
      ScanPolicy.create({
        id: 'policy-global-b',
        tenantId: secondTenant,
        workspaceId: secondWorkspace,
        sourceBindingId: 'binding-global-b',
        intervalSeconds: 900,
        freshnessSeconds: 900,
        retryBudget: 1,
        nextRunAt: new Date('2026-06-05T12:00:00.000Z'),
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
    const queue = new FakeScanQueue();
    const schedulerDecisions = new FakeSchedulerDecisionHistory();
    const useCase = new ScheduleDueScansUseCase(
      bindings,
      policies,
      new FakeScanJobs(),
      queue,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T12:00:00.000Z')),
      schedulerDecisions,
    );

    const result = await useCase.execute({
      limit: 10,
      correlationId: 'scheduler-global-tick',
      includeDecisions: true,
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        evaluated: 2,
        enqueued: 2,
        skipped: 0,
        skippedByReason: noSkippedByReason(),
        decisions: [
          expect.objectContaining({
            scanPolicyId: 'policy-global-a',
            sourceBindingId: 'binding-global-a',
            providerKey: 'rss',
            decision: 'enqueued',
            reason: 'scan_policy_due_now',
          }),
          expect.objectContaining({
            scanPolicyId: 'policy-global-b',
            sourceBindingId: 'binding-global-b',
            providerKey: 'reddit',
            decision: 'enqueued',
            reason: 'scan_policy_due_now',
            effectiveIntervalSeconds: 900,
            providerMinimumIntervalEnforced: false,
          }),
        ],
      }),
    });
    expect(queue.commands).toEqual([
      expect.objectContaining({
        tenantId: firstTenant,
        workspaceId: firstWorkspace,
        sourceBindingId: 'binding-global-a',
        scanPolicyId: 'policy-global-a',
        providerKey: 'rss',
      }),
      expect.objectContaining({
        tenantId: secondTenant,
        workspaceId: secondWorkspace,
        sourceBindingId: 'binding-global-b',
        scanPolicyId: 'policy-global-b',
        providerKey: 'reddit',
      }),
    ]);
    expect(schedulerDecisions.records).toEqual([
      expect.objectContaining({
        tenantId: firstTenant,
        workspaceId: firstWorkspace,
        decisionKey:
          'scan-policy:policy-global-a:due-at:2026-06-05T12:00:00.000Z',
        sourceBindingId: 'binding-global-a',
        providerKey: 'rss',
        correlationId: 'scheduler-global-tick',
      }),
      expect.objectContaining({
        tenantId: secondTenant,
        workspaceId: secondWorkspace,
        decisionKey:
          'scan-policy:policy-global-b:due-at:2026-06-05T12:00:00.000Z',
        sourceBindingId: 'binding-global-b',
        providerKey: 'reddit',
        correlationId: 'scheduler-global-tick',
      }),
    ]);
    await expect(
      policies.findBySourceBinding({
        tenantId: firstTenant,
        workspaceId: firstWorkspace,
        sourceBindingId: 'binding-global-b',
      }),
    ).resolves.toBeNull();
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
