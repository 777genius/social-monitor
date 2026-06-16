import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { ScanJob, ScanPolicy, SourceBinding } from '../../domain';
import type {
  FindScanExecutionAttemptQuery,
  ListSourceBindingsQuery,
  ListSourceBindingsResult,
  ScanExecutionAttemptReadPort,
  ScanExecutionAttemptSnapshot,
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
});

const setup = async (attempts: ScanExecutionAttemptReadPort = new FakeScanExecutionAttempts()) => {
  const bindings = new FakeSourceBindings();
  const policies = new FakeScanPolicies();
  const jobs = new FakeScanJobs();
  await bindings.save(makeBinding());

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
  const enqueued = makeJob().markEnqueued({ enqueuedAt: new Date('2026-06-16T00:00:01.000Z') });
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

const baseQuery = () => ({
  tenantId: tenant,
  workspaceId: workspace,
  topicId: 'topic-1',
  sourceBindingId: 'binding-1',
});

const makeBinding = () =>
  SourceBinding.create({
    id: 'binding-1',
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'topic-1',
    providerKey: 'fake-source',
    capabilityProfileVersion: 1,
    config: { mode: 'search', query: 'health' },
    createdAt: new Date('2026-06-16T00:00:00.000Z'),
  });

const makePolicy = () =>
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
  });

const makeJob = () =>
  ScanJob.request({
    id: 'scan-job-1',
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'binding-1',
    scanPolicyId: 'policy-1',
    idempotencyKey: 'scan-1',
    requestedAt: new Date('2026-06-16T00:00:00.000Z'),
  });
