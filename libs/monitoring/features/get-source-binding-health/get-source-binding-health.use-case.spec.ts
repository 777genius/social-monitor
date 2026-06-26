import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { ScanJob, ScanPolicy, SourceBinding } from '../../domain';
import type {
  FindScanExecutionAttemptQuery,
  ListScanJobsBySourceBindingQuery,
  ListScanJobsBySourceBindingResult,
  ListScanJobsBySourceBindingWindowQuery,
  ListScanJobsBySourceBindingWindowResult,
  ListSourceBindingsQuery,
  ListSourceBindingsResult,
  ScanExecutionAttemptReadPort,
  ScanExecutionAttemptSnapshot,
  ScanJobHistoryReadPort,
  ScanJobRepositoryPort,
  ScanPolicyRepositoryPort,
  SourceBindingRepositoryPort,
} from '../../ports';
import { GetSourceBindingHealthUseCase } from './get-source-binding-health.use-case';

class FakeSourceBindings implements SourceBindingRepositoryPort {
  private readonly bindings = new Map<string, SourceBinding>();

  async save(binding: SourceBinding): Promise<void> {
    const snapshot = binding.toSnapshot();
    this.bindings.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, binding);
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

class FakeScanJobs implements ScanJobRepositoryPort, ScanJobHistoryReadPort {
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
    const jobs = this.sortedBySourceBinding(params);

    return jobs[0] ?? null;
  }

  async listBySourceBinding(
    query: ListScanJobsBySourceBindingQuery,
  ): Promise<ListScanJobsBySourceBindingResult> {
    return {
      scanJobs: this.sortedBySourceBinding(query).slice(0, query.limit),
    };
  }

  async listBySourceBindingWindow(
    query: ListScanJobsBySourceBindingWindowQuery,
  ): Promise<ListScanJobsBySourceBindingWindowResult> {
    return {
      scanJobs: this.sortedBySourceBinding(query)
        .filter((job) => {
          const requestedAt = job.toSnapshot().requestedAt.getTime();

          return requestedAt >= query.windowStartedAt.getTime() && requestedAt < query.windowEndedAt.getTime();
        })
        .slice(0, query.limit),
      truncated: false,
    };
  }

  async findByIdempotencyKey(
    params: Parameters<ScanJobRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<ScanJob | null> {
    return this.jobsByIdempotencyKey.get(`${params.tenantId}:${params.workspaceId}:${params.idempotencyKey}`) ?? null;
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
      .sort((left, right) => {
        const requestedDiff = right.toSnapshot().requestedAt.getTime() - left.toSnapshot().requestedAt.getTime();

        return requestedDiff === 0
          ? right.toSnapshot().id.localeCompare(left.toSnapshot().id)
          : requestedDiff;
      });
  }
}

class FakeScanExecutionAttempts implements ScanExecutionAttemptReadPort {
  constructor(private readonly latestAttempt: ScanExecutionAttemptSnapshot | null = null) {}

  async findLatestByScanJob(query: FindScanExecutionAttemptQuery): Promise<ScanExecutionAttemptSnapshot | null> {
    if (this.latestAttempt === null) {
      return null;
    }

    return (
      this.latestAttempt.tenantId === query.tenantId &&
      this.latestAttempt.workspaceId === query.workspaceId &&
      this.latestAttempt.scanJobId === query.scanJobId
    )
      ? this.latestAttempt
      : null;
  }
}

const tenant = tenantId('tenant-1');
const workspace = workspaceId('workspace-1');
const now = new Date('2026-06-16T00:10:00.000Z');

describe('GetSourceBindingHealthUseCase', () => {
  it('reports missing scan policy as not configured', async () => {
    const { useCase } = await setup();

    const result = await useCase.execute(baseQuery());

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      value: expect.objectContaining({
        healthState: 'not_configured',
        operatorAction: 'create_scan_policy_for_source_binding',
        schedulerDecision: expect.objectContaining({
          canScanNow: false,
          decision: 'not_configured',
          reason: 'scan_policy_missing',
          minimumIntervalSeconds: 60,
        }),
      }),
    }));
  });

  it('reports active scan jobs as scanning with latest scan context', async () => {
    const { useCase, policies, jobs } = await setup();
    await policies.save(makePolicy());
    await jobs.save(makeJob().markEnqueued({ enqueuedAt: new Date('2026-06-16T00:00:01.000Z') }));

    const result = await useCase.execute(baseQuery());

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      value: expect.objectContaining({
        healthState: 'scanning',
        latestScan: expect.objectContaining({
          scanJobId: 'scan-job-1',
          userState: 'scan_in_progress',
        }),
        schedulerDecision: expect.objectContaining({
          canScanNow: false,
          decision: 'active_scan',
          reason: 'scan_already_in_progress',
          signals: ['active_scan_in_progress'],
        }),
      }),
    }));
  });

  it('explains when a configured binding is ready for a due scan', async () => {
    const { useCase, policies } = await setup();
    await policies.save(makePolicy());

    const result = await useCase.execute(baseQuery());

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      value: expect.objectContaining({
        healthState: 'scheduled',
        schedulerDecision: {
          canScanNow: true,
          decision: 'ready',
          reason: 'scan_policy_due_now',
          minimumIntervalSeconds: 60,
          configuredIntervalSeconds: 300,
          freshnessSeconds: 900,
          nextEligibleAt: '2026-06-16T00:10:00.000Z',
          waitSeconds: 0,
          signals: ['scan_policy_due'],
        },
      }),
    }));
  });

  it('explains future scheduled scans without marking the source scannable', async () => {
    const { useCase, policies } = await setup();
    await policies.save(makePolicy({ nextRunAt: new Date('2026-06-16T00:15:00.000Z') }));

    const result = await useCase.execute(baseQuery());

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      value: expect.objectContaining({
        schedulerDecision: expect.objectContaining({
          canScanNow: false,
          decision: 'scheduled_later',
          reason: 'scan_policy_next_run_in_future',
          nextEligibleAt: '2026-06-16T00:15:00.000Z',
          waitSeconds: 300,
        }),
      }),
    }));
  });

  it('separates fresh, stale and failed completed scans', async () => {
    const fresh = await setupWithCompletedJob(new Date('2026-06-16T00:00:30.000Z'));
    const stale = await setupWithCompletedJob(new Date('2026-06-15T23:50:00.000Z'));
    const failed = await setupWithCompletedJob(
      new Date('2026-06-16T00:00:30.000Z'),
      'Provider unavailable',
    );

    expect(await healthState(fresh)).toBe('healthy');
    expect(await healthState(stale)).toBe('stale');
    expect(await healthState(failed)).toBe('degraded');
  });

  it('explains fresh-success and rate-limit backoff skip windows', async () => {
    const fresh = await setupWithCompletedJob(new Date('2026-06-16T00:00:30.000Z'));
    const rateLimited = await setupWithCompletedJob(
      new Date('2026-06-16T00:08:05.000Z'),
      'Provider rate limit 429',
    );

    await expectSchedulerDecision(fresh, {
      canScanNow: false,
      decision: 'fresh_success',
      reason: 'latest_success_still_fresh',
      nextEligibleAt: '2026-06-16T00:15:30.000Z',
      waitSeconds: 330,
      signals: ['fresh_success'],
    });
    await expectSchedulerDecision(rateLimited, {
      canScanNow: false,
      decision: 'rate_limit_backoff',
      reason: 'provider_rate_limit_backoff_active',
      nextEligibleAt: '2026-06-16T00:13:05.000Z',
      waitSeconds: 185,
      rateLimitBackoffUntil: '2026-06-16T00:13:05.000Z',
      signals: ['rate_limit_backoff'],
    });
  });

  it('uses provider minimum cadence when projecting freshness for legacy policy', async () => {
    const context = await setup(new FakeScanExecutionAttempts(), 'reddit');
    await context.policies.save(makePolicy({
      intervalSeconds: 60,
      freshnessSeconds: 60,
    }));
    await context.jobs.save(
      makeJob(new Date('2026-06-16T00:04:58.000Z'))
        .markEnqueued({ enqueuedAt: new Date('2026-06-16T00:04:59.000Z') })
        .markSucceeded({ completedAt: new Date('2026-06-16T00:05:00.000Z') }),
    );

    const result = await context.useCase.execute(baseQuery());

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      value: expect.objectContaining({
        healthState: 'healthy',
        freshness: {
          isFresh: true,
          ageSeconds: 300,
          freshnessDeadlineAt: '2026-06-16T00:20:00.000Z',
          staleBySeconds: undefined,
        },
        schedulerDecision: expect.objectContaining({
          canScanNow: false,
          decision: 'fresh_success',
          reason: 'latest_success_still_fresh',
          minimumIntervalSeconds: 900,
          configuredIntervalSeconds: 60,
          freshnessSeconds: 900,
          nextEligibleAt: '2026-06-16T00:20:00.000Z',
          waitSeconds: 600,
          signals: ['fresh_success', 'provider_minimum_interval_enforced'],
        }),
      }),
    }));
  });

  it('summarizes recent provider health window from scan history', async () => {
    const { useCase, policies, jobs } = await setup();
    await policies.save(makePolicy());
    await jobs.save(
      makeJob(new Date('2026-06-16T00:08:00.000Z'), 'scan-job-3')
        .markEnqueued({ enqueuedAt: new Date('2026-06-16T00:08:01.000Z') })
        .markFailed({
          completedAt: new Date('2026-06-16T00:08:05.000Z'),
          failureReason: 'Provider rate limit 429',
        }),
    );
    await jobs.save(
      makeJob(new Date('2026-06-16T00:07:00.000Z'), 'scan-job-2')
        .markEnqueued({ enqueuedAt: new Date('2026-06-16T00:07:01.000Z') })
        .markSucceeded({ completedAt: new Date('2026-06-16T00:07:05.000Z') }),
    );
    await jobs.save(
      makeJob(new Date('2026-06-14T00:07:00.000Z'), 'old-scan-job')
        .markEnqueued({ enqueuedAt: new Date('2026-06-14T00:07:01.000Z') })
        .markFailed({
          completedAt: new Date('2026-06-14T00:07:05.000Z'),
          failureReason: 'Provider unavailable',
        }),
    );

    const result = await useCase.execute(baseQuery());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.recentWindow).toEqual({
        providerHealthState: 'degraded',
        windowStartedAt: '2026-06-15T00:10:00.000Z',
        windowEndedAt: '2026-06-16T00:10:00.000Z',
        totalScans: 2,
        succeededScans: 1,
        failedScans: 1,
        activeScans: 0,
        rateLimitedScans: 1,
        providerUnavailableScans: 0,
        consecutiveFailures: 1,
        lastSucceededAt: '2026-06-16T00:07:05.000Z',
        lastFailedAt: '2026-06-16T00:08:05.000Z',
        operatorAction: 'inspect_recent_scan_failures_and_rate_limits',
        signals: ['recent_success', 'recent_failure', 'rate_limited'],
      });
    }
  });

  it('marks provider health down after repeated recent provider failures', async () => {
    const { useCase, policies, jobs } = await setup();
    await policies.save(makePolicy());
    for (const [index, requestedAt] of [
      '2026-06-16T00:08:00.000Z',
      '2026-06-16T00:07:00.000Z',
      '2026-06-16T00:06:00.000Z',
    ].entries()) {
      await jobs.save(
        makeJob(new Date(requestedAt), `scan-job-failed-${index}`)
          .markEnqueued({ enqueuedAt: new Date(new Date(requestedAt).getTime() + 1_000) })
          .markFailed({
            completedAt: new Date(new Date(requestedAt).getTime() + 5_000),
            failureReason: 'Provider unavailable',
          }),
      );
    }

    const result = await useCase.execute(baseQuery());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.recentWindow).toEqual(expect.objectContaining({
        providerHealthState: 'down',
        failedScans: 3,
        providerUnavailableScans: 3,
        consecutiveFailures: 3,
        operatorAction: 'pause_or_backoff_provider_until_recovery',
        signals: ['recent_failure', 'provider_unavailable', 'consecutive_failures'],
      }));
    }
  });
});

const setup = async (
  attempts: ScanExecutionAttemptReadPort = new FakeScanExecutionAttempts(),
  providerKey = 'fake-source',
) => {
  const bindings = new FakeSourceBindings();
  const policies = new FakeScanPolicies();
  const jobs = new FakeScanJobs();
  await bindings.save(makeBinding(providerKey));

  return {
    bindings,
    policies,
    jobs,
    useCase: new GetSourceBindingHealthUseCase(
      bindings,
      policies,
      jobs,
      attempts,
      new FixedClock(now),
    ),
  };
};

const setupWithCompletedJob = async (completedAt: Date, failureReason?: string) => {
  const context = await setup();
  await context.policies.save(makePolicy());
  const requestedAt = new Date(completedAt.getTime() - 2_000);
  const enqueued = makeJob(requestedAt).markEnqueued({ enqueuedAt: new Date(completedAt.getTime() - 1_000) });
  await context.jobs.save(failureReason === undefined
    ? enqueued.markSucceeded({ completedAt })
    : enqueued.markFailed({ completedAt, failureReason }));

  return context.useCase;
};

const healthState = async (useCase: GetSourceBindingHealthUseCase) => {
  const result = await useCase.execute(baseQuery());

  if (!result.ok) {
    throw result.error;
  }

  return result.value.healthState;
};

const expectSchedulerDecision = async (
  useCase: GetSourceBindingHealthUseCase,
  expected: Record<string, unknown>,
): Promise<void> => {
  const result = await useCase.execute(baseQuery());

  if (!result.ok) {
    throw result.error;
  }

  expect(result.value.schedulerDecision).toEqual(expect.objectContaining(expected));
};

const baseQuery = () => ({
  tenantId: tenant,
  workspaceId: workspace,
  topicId: 'topic-1',
  sourceBindingId: 'binding-1',
});

const makeBinding = (providerKey = 'fake-source') =>
  SourceBinding.create({
    id: 'binding-1',
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'topic-1',
    providerKey,
    capabilityProfileVersion: 1,
    config: { mode: 'search', query: 'health' },
    createdAt: new Date('2026-06-16T00:00:00.000Z'),
  });

const makePolicy = (overrides: Partial<Parameters<typeof ScanPolicy.create>[0]> = {}) =>
  ScanPolicy.create({
    id: 'policy-1',
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'binding-1',
    intervalSeconds: 300,
    freshnessSeconds: 900,
    retryBudget: 3,
    nextRunAt: new Date('2026-06-16T00:05:00.000Z'),
    createdAt: new Date('2026-06-16T00:00:00.000Z'),
    ...overrides,
  });

const makeJob = (
  requestedAt: Date = new Date('2026-06-16T00:00:00.000Z'),
  id: string = 'scan-job-1',
) =>
  ScanJob.request({
    id,
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'binding-1',
    scanPolicyId: 'policy-1',
    idempotencyKey: `idempotency-${id}`,
    requestedAt,
  });
