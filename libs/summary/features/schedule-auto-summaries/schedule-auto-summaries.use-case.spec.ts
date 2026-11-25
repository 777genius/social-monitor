import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { SummaryJob, SummaryPolicy } from '../../domain';
import type {
  AutoSummaryCandidate,
  AutoSummaryCandidateRepositoryPort,
  EnqueueSummaryJobCommand,
  SummaryJobQueuePort,
  SummaryJobRepositoryPort,
  SummaryPolicyRepositoryPort,
  SummaryQuotaPort,
} from '../../ports';
import { RequestSummaryUseCase } from '../request-summary/request-summary.use-case';
import { ScheduleAutoSummariesUseCase } from './schedule-auto-summaries.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `auto-summary-job-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class AllowAllSummaryQuota implements SummaryQuotaPort {
  async reserveSummaryJob(): ReturnType<SummaryQuotaPort['reserveSummaryJob']> {
    return {
      ok: true,
      value: {
        remaining: 99,
        resetAt: '2026-06-21T11:00:00.000Z',
      },
    };
  }
}

class FakeSummaryJobRepository implements SummaryJobRepositoryPort {
  private readonly jobs = new Map<string, SummaryJob>();

  async save(job: SummaryJob): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobs.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, job);
  }

  async findById(params: Parameters<SummaryJobRepositoryPort['findById']>[0]): Promise<SummaryJob | null> {
    return this.jobs.get(`${params.tenantId}:${params.workspaceId}:${params.summaryJobId}`) ?? null;
  }

  async findByIdempotencyKey(
    params: Parameters<SummaryJobRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<SummaryJob | null> {
    return [...this.jobs.values()].find((job) => {
      const snapshot = job.toSnapshot();

      return (
        snapshot.tenantId === params.tenantId &&
        snapshot.workspaceId === params.workspaceId &&
        snapshot.idempotencyKey === params.idempotencyKey
      );
    }) ?? null;
  }

  async findRequested(params: Parameters<SummaryJobRepositoryPort['findRequested']>[0]): Promise<readonly SummaryJob[]> {
    return [...this.jobs.values()].filter((job) => {
      const snapshot = job.toSnapshot();

      return (
        snapshot.status === 'requested' &&
        (params.tenantId === undefined || snapshot.tenantId === params.tenantId) &&
        (params.workspaceId === undefined || snapshot.workspaceId === params.workspaceId)
      );
    }).slice(0, params.limit);
  }

  latestRequestedAt(params: { readonly tenantId: string; readonly workspaceId: string; readonly interestId: string }): Date | undefined {
    return [...this.jobs.values()]
      .map((job) => job.toSnapshot())
      .filter((snapshot) => (
        snapshot.tenantId === params.tenantId &&
        snapshot.workspaceId === params.workspaceId &&
        snapshot.interestId === params.interestId
      ))
      .map((snapshot) => snapshot.requestedAt)
      .sort((left, right) => right.getTime() - left.getTime())[0];
  }
}

class FakeSummaryPolicyRepository implements SummaryPolicyRepositoryPort {
  private readonly policies = new Map<string, SummaryPolicy>();

  async save(policy: SummaryPolicy): Promise<void> {
    const snapshot = policy.toSnapshot();
    this.policies.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.interestId}`, policy);
  }

  async findByInterest(
    query: Parameters<SummaryPolicyRepositoryPort['findByInterest']>[0],
  ): Promise<SummaryPolicy | null> {
    return this.policies.get(`${query.tenantId}:${query.workspaceId}:${query.interestId}`) ?? null;
  }

  all(): readonly SummaryPolicy[] {
    return [...this.policies.values()];
  }
}

class FakeFeedItems {
  private readonly items: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly interestId: string;
    readonly observedAt: Date;
  }[] = [];

  upsert(params: { readonly tenantId: string; readonly workspaceId: string; readonly interestId: string; readonly observedAt: Date }): void {
    this.items.push(params);
  }

  latestObservedAt(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly interestId: string;
    readonly before: Date;
  }): Date | undefined {
    return this.items
      .filter((item) => (
        item.tenantId === params.tenantId &&
        item.workspaceId === params.workspaceId &&
        item.interestId === params.interestId &&
        item.observedAt.getTime() <= params.before.getTime()
      ))
      .map((item) => item.observedAt)
      .sort((left, right) => right.getTime() - left.getTime())[0];
  }

  countAfter(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly interestId: string;
    readonly after?: Date;
  }): number {
    return this.items.filter((item) => (
      item.tenantId === params.tenantId &&
      item.workspaceId === params.workspaceId &&
      item.interestId === params.interestId &&
      (params.after === undefined || item.observedAt.getTime() > params.after.getTime())
    )).length;
  }
}

class FakeAutoSummaryCandidateRepository implements AutoSummaryCandidateRepositoryPort {
  constructor(
    private readonly policies: FakeSummaryPolicyRepository,
    private readonly jobs: FakeSummaryJobRepository,
    private readonly feedItems: FakeFeedItems,
  ) {}

  async findDueCandidates(
    params: Parameters<AutoSummaryCandidateRepositoryPort['findDueCandidates']>[0],
  ): Promise<readonly AutoSummaryCandidate[]> {
    const candidates: AutoSummaryCandidate[] = [];

    for (const policy of this.policies.all()) {
      const snapshot = policy.toSnapshot();
      if (
        (params.tenantId !== undefined && snapshot.tenantId !== params.tenantId) ||
        (params.workspaceId !== undefined && snapshot.workspaceId !== params.workspaceId)
      ) {
        continue;
      }

      const latestFeedItemObservedAt = this.feedItems.latestObservedAt({
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        interestId: snapshot.interestId,
        before: params.latestFeedItemObservedBefore,
      });
      if (latestFeedItemObservedAt === undefined) {
        continue;
      }

      const latestSummaryRequestedAt = this.jobs.latestRequestedAt({
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        interestId: snapshot.interestId,
      });
      if (
        latestSummaryRequestedAt !== undefined &&
        latestSummaryRequestedAt.getTime() >= latestFeedItemObservedAt.getTime()
      ) {
        continue;
      }

      candidates.push({
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        interestId: snapshot.interestId,
        latestFeedItemObservedAt,
        latestSummaryRequestedAt,
        newFeedItemCount: this.feedItems.countAfter({
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          interestId: snapshot.interestId,
          after: latestSummaryRequestedAt,
        }),
      });
    }

    return candidates.slice(0, params.limit);
  }
}

class FakeSummaryJobQueue implements SummaryJobQueuePort {
  private readonly commands: EnqueueSummaryJobCommand[] = [];

  async canAccept(): Promise<boolean> {
    return true;
  }

  async enqueue(command: EnqueueSummaryJobCommand): Promise<void> {
    this.commands.push(command);
  }

  all(): readonly EnqueueSummaryJobCommand[] {
    return this.commands;
  }
}

const tenant = tenantId('tenant-auto-summary');
const workspace = workspaceId('workspace-auto-summary');
const interestId = 'interest-auto-summary';

describe('ScheduleAutoSummariesUseCase', () => {
  it('requests one summary job for an interest with new feed items and reuses the idempotency key on the next tick', async () => {
    const dependencies = makeDependencies();
    await dependencies.policies.save(SummaryPolicy.defaultForInterest({
      id: 'policy-auto-summary',
      tenantId: tenant,
      workspaceId: workspace,
      interestId,
      now: new Date('2026-06-21T10:00:00.000Z'),
    }));
    dependencies.feedItems.upsert(feedItem('feed-1', new Date('2026-06-21T10:05:00.000Z')));

    const first = await dependencies.useCase.execute({
      limit: 10,
      correlationId: 'auto-summary-test',
      latestFeedItemObservedBefore: new Date('2026-06-21T10:06:00.000Z'),
    });

    expect(first.ok).toBe(true);
    expect(first.ok ? first.value.scheduled : 0).toBe(1);
    expect(dependencies.queue.all()).toHaveLength(1);

    const second = await dependencies.useCase.execute({
      limit: 10,
      correlationId: 'auto-summary-test',
      latestFeedItemObservedBefore: new Date('2026-06-21T10:06:00.000Z'),
    });

    expect(second.ok).toBe(true);
    expect(second.ok ? second.value.evaluated : 0).toBe(0);
    expect(dependencies.queue.all()).toHaveLength(1);
  });

  it('does not schedule when the latest interest summary request is newer than feed evidence', async () => {
    const dependencies = makeDependencies();
    await dependencies.policies.save(SummaryPolicy.defaultForInterest({
      id: 'policy-auto-summary-fresh',
      tenantId: tenant,
      workspaceId: workspace,
      interestId,
      now: new Date('2026-06-21T10:00:00.000Z'),
    }));
    dependencies.feedItems.upsert(feedItem('feed-1', new Date('2026-06-21T10:05:00.000Z')));
    await dependencies.jobs.save(SummaryJob.request({
      id: 'summary-job-fresh',
      tenantId: tenant,
      workspaceId: workspace,
      interestId,
      idempotencyKey: 'manual-summary-after-feed',
      requestedAt: new Date('2026-06-21T10:06:00.000Z'),
    }));

    const result = await dependencies.useCase.execute({
      limit: 10,
      correlationId: 'auto-summary-test',
      latestFeedItemObservedBefore: new Date('2026-06-21T10:06:00.000Z'),
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.evaluated : 1).toBe(0);
    expect(dependencies.queue.all()).toHaveLength(0);
  });
});

const makeDependencies = () => {
  const jobs = new FakeSummaryJobRepository();
  const policies = new FakeSummaryPolicyRepository();
  const feedItems = new FakeFeedItems();
  const queue = new FakeSummaryJobQueue();
  const requestSummary = new RequestSummaryUseCase(
    jobs,
    queue,
    new AllowAllSummaryQuota(),
    new SequenceIdGenerator(),
    new FixedClock(new Date('2026-06-21T10:10:00.000Z')),
  );

  return {
    jobs,
    policies,
    feedItems,
    queue,
    useCase: new ScheduleAutoSummariesUseCase(
      new FakeAutoSummaryCandidateRepository(policies, jobs, feedItems),
      requestSummary,
    ),
  };
};

const feedItem = (_id: string, observedAt: Date) => ({
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    observedAt,
  });
