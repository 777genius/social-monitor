import { DomainError, FixedClock, type IdGenerator, ok, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { ScanJob, ScanPolicy, SourceBinding } from '../../domain';
import type {
  IdempotencyPort,
  ListScanJobsBySourceBindingQuery,
  ListScanJobsBySourceBindingResult,
  ListSourceBindingsQuery,
  ListSourceBindingsResult,
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

  async listByTopic(query: ListSourceBindingsQuery): Promise<ListSourceBindingsResult> {
    return {
      sourceBindings: [...this.bindings.values()].filter((binding) => {
        const snapshot = binding.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId && snapshot.topicId === query.topicId;
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

  async findDue(): Promise<readonly ScanPolicy[]> {
    return [];
  }

  async findBySourceBinding(params: Parameters<ScanPolicyRepositoryPort['findBySourceBinding']>[0]): Promise<ScanPolicy | null> {
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

  async findActiveBySourceBinding(params: Parameters<ScanJobRepositoryPort['findActiveBySourceBinding']>[0]): Promise<ScanJob | null> {
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

  async findLatestBySourceBinding(params: Parameters<ScanJobRepositoryPort['findLatestBySourceBinding']>[0]): Promise<ScanJob | null> {
    const jobs = this.sortedBySourceBinding(params);

    return jobs[0] ?? null;
  }

  async listBySourceBinding(query: ListScanJobsBySourceBindingQuery): Promise<ListScanJobsBySourceBindingResult> {
    return {
      scanJobs: this.sortedBySourceBinding(query).slice(0, query.limit),
    };
  }

  async findByIdempotencyKey(params: Parameters<ScanJobRepositoryPort['findByIdempotencyKey']>[0]): Promise<ScanJob | null> {
    return this.jobs.get(`${params.tenantId}:${params.workspaceId}:${params.idempotencyKey}`) ?? null;
  }

  private sortedBySourceBinding(params: { readonly tenantId: string; readonly workspaceId: string; readonly sourceBindingId: string }): readonly ScanJob[] {
    return [...this.jobsById.values()]
      .filter((job) => {
        const snapshot = job.toSnapshot();

        return snapshot.tenantId === params.tenantId && snapshot.workspaceId === params.workspaceId && snapshot.sourceBindingId === params.sourceBindingId;
      })
      .sort((left, right) => right.toSnapshot().requestedAt.getTime() - left.toSnapshot().requestedAt.getTime());
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
    expect(result.ok && result.value.requestDecision).toEqual({
      decision: 'created',
      reason: 'manual_scan_enqueued',
      createdNewScan: true,
      minimumIntervalSeconds: 60,
      configuredIntervalSeconds: 300,
      effectiveIntervalSeconds: 300,
      freshnessSeconds: 900,
      providerMinimumIntervalEnforced: false,
      signals: ['manual_scan_enqueued'],
    });
    expect(outbox.events).toHaveLength(1);
    expect(queue.commands).toEqual([
      expect.objectContaining({
        topicId: 'topic-1',
        providerKey: 'fake-source',
        sourceQuery: { mode: 'search', query: 'binding-1' },
        retryBudget: 3,
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
        requestDecision: {
          decision: 'active_scan',
          reason: 'scan_already_in_progress',
          createdNewScan: false,
          signals: ['active_scan_in_progress'],
        },
      },
    });
    expect(queue.commands).toHaveLength(1);
  });

  it('marks repeated idempotency key as replay without enqueueing another scan', async () => {
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
      idempotencyKey: 'manual-scan-replay',
      correlationId: 'correlation-1',
    });
    const second = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'manual-scan-replay',
      correlationId: 'correlation-2',
    });

    if (!first.ok) {
      throw first.error;
    }

    expect(second).toEqual({
      ok: true,
      value: {
        scanJobId: first.value.scanJobId,
        status: 'enqueued',
        created: false,
        requestDecision: {
          decision: 'idempotent_replay',
          reason: 'idempotency_key_reused',
          createdNewScan: false,
          signals: ['idempotent_replay'],
        },
      },
    });
    expect(queue.commands).toHaveLength(1);
  });

  it('returns latest fresh successful scan job instead of enqueueing duplicate manual scan', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const policies = new FakeScanPolicies();
    policies.add(makePolicy());
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(
      ScanJob.request({
        id: 'fresh-successful-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        idempotencyKey: 'fresh-successful-scan',
        requestedAt: new Date('2026-06-05T00:05:00.000Z'),
      })
        .markEnqueued({
          enqueuedAt: new Date('2026-06-05T00:05:01.000Z'),
        })
        .markSucceeded({
          completedAt: new Date('2026-06-05T00:06:00.000Z'),
        }),
    );
    const queue = new FakeScanQueue();
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
      new FixedClock(new Date('2026-06-05T00:10:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'manual-scan-fresh-skip',
      correlationId: 'correlation-fresh-skip',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scanJobId: 'fresh-successful-scan-job',
        status: 'succeeded',
        created: false,
        requestDecision: {
          decision: 'fresh_success',
          reason: 'latest_success_still_fresh',
          createdNewScan: false,
          minimumIntervalSeconds: 60,
          configuredIntervalSeconds: 300,
          effectiveIntervalSeconds: 300,
          freshnessSeconds: 900,
          providerMinimumIntervalEnforced: false,
          nextEligibleAt: '2026-06-05T00:21:00.000Z',
          waitSeconds: 660,
          freshnessDeadlineAt: '2026-06-05T00:21:00.000Z',
          signals: ['fresh_success'],
        },
      },
    });
    expect(queue.commands).toHaveLength(0);
    expect(outbox.events).toHaveLength(0);
    expect(quota.reservationCount).toBe(0);
    await expect(
      scanJobs.findByIdempotencyKey({
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        idempotencyKey: 'manual-scan-fresh-skip',
      }),
    ).resolves.toBeNull();
  });

  it('uses provider minimum cadence when blocking duplicate manual scans for legacy policy', async () => {
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
        nextRunAt: new Date('2026-06-05T00:00:00.000Z'),
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
      }),
    );
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(
      ScanJob.request({
        id: 'recent-reddit-successful-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        idempotencyKey: 'recent-reddit-successful-scan',
        requestedAt: new Date('2026-06-05T00:04:00.000Z'),
      })
        .markEnqueued({
          enqueuedAt: new Date('2026-06-05T00:04:01.000Z'),
        })
        .markSucceeded({
          completedAt: new Date('2026-06-05T00:05:00.000Z'),
        }),
    );
    const queue = new FakeScanQueue();
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
      new FixedClock(new Date('2026-06-05T00:10:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'manual-scan-provider-minimum-fresh-skip',
      correlationId: 'correlation-provider-minimum-fresh-skip',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scanJobId: 'recent-reddit-successful-scan-job',
        status: 'succeeded',
        created: false,
        requestDecision: {
          decision: 'fresh_success',
          reason: 'latest_success_still_fresh',
          createdNewScan: false,
          minimumIntervalSeconds: 900,
          configuredIntervalSeconds: 60,
          effectiveIntervalSeconds: 900,
          freshnessSeconds: 900,
          providerMinimumIntervalEnforced: true,
          nextEligibleAt: '2026-06-05T00:20:00.000Z',
          waitSeconds: 600,
          freshnessDeadlineAt: '2026-06-05T00:20:00.000Z',
          signals: ['fresh_success', 'provider_minimum_interval_enforced'],
        },
      },
    });
    expect(queue.commands).toHaveLength(0);
    expect(outbox.events).toHaveLength(0);
    expect(quota.reservationCount).toBe(0);
  });

  it('returns latest rate-limited failed scan job while provider backoff is active', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding());
    const policies = new FakeScanPolicies();
    policies.add(makePolicy());
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(
      ScanJob.request({
        id: 'rate-limited-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        idempotencyKey: 'rate-limited-scan',
        requestedAt: new Date('2026-06-05T00:05:00.000Z'),
      })
        .markEnqueued({
          enqueuedAt: new Date('2026-06-05T00:05:01.000Z'),
        })
        .markFailed({
          completedAt: new Date('2026-06-05T00:06:00.000Z'),
          failureReason: 'Provider rate limit 429',
        }),
    );
    const queue = new FakeScanQueue();
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
      new FixedClock(new Date('2026-06-05T00:10:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'manual-scan-rate-limit-backoff',
      correlationId: 'correlation-rate-limit-backoff',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scanJobId: 'rate-limited-scan-job',
        status: 'failed',
        created: false,
        requestDecision: {
          decision: 'rate_limit_backoff',
          reason: 'provider_rate_limit_backoff_active',
          createdNewScan: false,
          minimumIntervalSeconds: 60,
          configuredIntervalSeconds: 300,
          effectiveIntervalSeconds: 300,
          freshnessSeconds: 900,
          providerMinimumIntervalEnforced: false,
          nextEligibleAt: '2026-06-05T00:11:00.000Z',
          waitSeconds: 60,
          rateLimitBackoffUntil: '2026-06-05T00:11:00.000Z',
          providerHealthState: 'degraded',
          signals: ['rate_limit_backoff'],
        },
      },
    });
    expect(queue.commands).toHaveLength(0);
    expect(outbox.events).toHaveLength(0);
    expect(quota.reservationCount).toBe(0);
    await expect(
      scanJobs.findByIdempotencyKey({
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        idempotencyKey: 'manual-scan-rate-limit-backoff',
      }),
    ).resolves.toBeNull();
  });

  it('returns bounded transient backoff for high-cadence provider rate limits', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding('github-repo-radar'));
    const policies = new FakeScanPolicies();
    policies.add(makePolicy());
    const scanJobs = new FakeScanJobs();
    await scanJobs.save(
      ScanJob.request({
        id: 'repo-radar-rate-limited-scan-job',
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        idempotencyKey: 'repo-radar-rate-limited-scan',
        requestedAt: new Date('2026-06-05T00:05:00.000Z'),
      })
        .markEnqueued({
          enqueuedAt: new Date('2026-06-05T00:05:01.000Z'),
        })
        .markFailed({
          completedAt: new Date('2026-06-05T00:06:00.000Z'),
          failureReason: 'Provider rate limit 429',
        }),
    );
    const queue = new FakeScanQueue();
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
      new FixedClock(new Date('2026-06-05T00:10:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'manual-scan-repo-radar-rate-limit-backoff',
      correlationId: 'correlation-repo-radar-rate-limit-backoff',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scanJobId: 'repo-radar-rate-limited-scan-job',
        status: 'failed',
        created: false,
        requestDecision: {
          decision: 'rate_limit_backoff',
          reason: 'provider_rate_limit_backoff_active',
          createdNewScan: false,
          minimumIntervalSeconds: 21_600,
          configuredIntervalSeconds: 300,
          effectiveIntervalSeconds: 21_600,
          freshnessSeconds: 21_600,
          providerMinimumIntervalEnforced: true,
          nextEligibleAt: '2026-06-05T00:21:00.000Z',
          waitSeconds: 660,
          rateLimitBackoffUntil: '2026-06-05T00:21:00.000Z',
          providerHealthState: 'degraded',
          signals: ['rate_limit_backoff', 'provider_minimum_interval_enforced'],
        },
      },
    });
    expect(queue.commands).toHaveLength(0);
    expect(outbox.events).toHaveLength(0);
    expect(quota.reservationCount).toBe(0);
  });

  it('returns latest provider failure while repeated auth-failure backoff is active', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding('reddit'));
    const policies = new FakeScanPolicies();
    policies.add(makePolicy());
    const scanJobs = new FakeScanJobs();
    for (const [id, requestedAt, completedAt] of [
      ['auth-failed-scan-job-2', '2026-06-05T00:05:00.000Z', '2026-06-05T00:06:00.000Z'],
      ['auth-failed-scan-job-1', '2026-06-05T00:04:00.000Z', '2026-06-05T00:05:00.000Z'],
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
      new FixedClock(new Date('2026-06-05T00:10:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'manual-scan-provider-failure-backoff',
      correlationId: 'correlation-provider-failure-backoff',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scanJobId: 'auth-failed-scan-job-2',
        status: 'failed',
        created: false,
        requestDecision: {
          decision: 'provider_failure_backoff',
          reason: 'provider_failure_backoff_active',
          createdNewScan: false,
          minimumIntervalSeconds: 900,
          configuredIntervalSeconds: 300,
          effectiveIntervalSeconds: 900,
          freshnessSeconds: 900,
          providerMinimumIntervalEnforced: true,
          nextEligibleAt: '2026-06-05T00:36:00.000Z',
          waitSeconds: 1560,
          providerFailureBackoffUntil: '2026-06-05T00:36:00.000Z',
          providerHealthState: 'degraded',
          signals: ['provider_failure_backoff', 'provider_minimum_interval_enforced'],
        },
      },
    });
    expect(queue.commands).toHaveLength(0);
    expect(outbox.events).toHaveLength(0);
    expect(quota.reservationCount).toBe(0);
    await expect(
      scanJobs.findByIdempotencyKey({
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        idempotencyKey: 'manual-scan-provider-failure-backoff',
      }),
    ).resolves.toBeNull();
  });

  it('returns bounded transient backoff for high-cadence provider failures', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding('github-repo-radar'));
    const policies = new FakeScanPolicies();
    policies.add(makePolicy());
    const scanJobs = new FakeScanJobs();
    for (const [id, requestedAt, completedAt] of [
      ['repo-radar-unavailable-scan-job-2', '2026-06-05T00:05:00.000Z', '2026-06-05T00:06:00.000Z'],
      ['repo-radar-unavailable-scan-job-1', '2026-06-05T00:04:00.000Z', '2026-06-05T00:05:00.000Z'],
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
            failureReason: 'Provider unavailable while reading repo radar',
          }),
      );
    }
    const queue = new FakeScanQueue();
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
      new FixedClock(new Date('2026-06-05T00:10:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'manual-scan-repo-radar-provider-failure-backoff',
      correlationId: 'correlation-repo-radar-provider-failure-backoff',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        scanJobId: 'repo-radar-unavailable-scan-job-2',
        status: 'failed',
        created: false,
        requestDecision: {
          decision: 'provider_failure_backoff',
          reason: 'provider_failure_backoff_active',
          createdNewScan: false,
          minimumIntervalSeconds: 21_600,
          configuredIntervalSeconds: 300,
          effectiveIntervalSeconds: 21_600,
          freshnessSeconds: 21_600,
          providerMinimumIntervalEnforced: true,
          nextEligibleAt: '2026-06-05T00:36:00.000Z',
          waitSeconds: 1560,
          providerFailureBackoffUntil: '2026-06-05T00:36:00.000Z',
          providerHealthState: 'degraded',
          signals: ['provider_failure_backoff', 'provider_minimum_interval_enforced'],
        },
      },
    });
    expect(queue.commands).toHaveLength(0);
    expect(outbox.events).toHaveLength(0);
    expect(quota.reservationCount).toBe(0);
  });

  it('rejects new manual scan requests when the source binding is paused', async () => {
    const bindings = new FakeSourceBindings();
    bindings.add(makeBinding().pause());
    const policies = new FakeScanPolicies();
    policies.add(makePolicy());
    const queue = new FakeScanQueue();
    const quota = new AllowingScanRequestQuota();
    const useCase = new RequestScanUseCase(
      bindings,
      policies,
      new FakeScanJobs(),
      queue,
      new FakeOutbox(),
      new FakeIdempotency(),
      quota,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      sourceBindingId: 'binding-1',
      idempotencyKey: 'scan-paused-1',
      correlationId: 'correlation-1',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
        details: {
          sourceBindingId: 'binding-1',
          status: 'paused',
        },
      }),
    });
    expect(queue.commands).toHaveLength(0);
    expect(quota.reservationCount).toBe(0);
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
    await expect(
      scanJobs.findByIdempotencyKey({
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        idempotencyKey: 'scan-1',
      }),
    ).resolves.toBeNull();
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
    await expect(
      scanJobs.findByIdempotencyKey({
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        idempotencyKey: 'scan-1',
      }),
    ).resolves.toBeNull();
    expect(queue.commands).toHaveLength(0);
    expect(outbox.events).toHaveLength(0);
  });
});
