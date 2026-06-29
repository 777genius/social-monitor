import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { FeedItem } from '@social-monitor/feed/domain';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { ScheduleAutoSummariesUseCase } from '@social-monitor/summary/features/schedule-auto-summaries/schedule-auto-summaries.use-case';
import { InMemoryAutoSummaryCandidateRepository } from '@social-monitor/summary/adapters/persistence/in-memory-auto-summary-candidate.repository';
import { InMemorySummaryJobQueueAdapter } from '@social-monitor/summary/adapters/messaging/in-memory-summary-job-queue.adapter';
import { InMemorySummaryJobRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-job.repository';
import { InMemorySummaryPolicyRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-policy.repository';
import { SummaryPolicy } from '@social-monitor/summary/domain';
import { RequestSummaryUseCase } from '@social-monitor/summary/features/request-summary/request-summary.use-case';
import type { SummaryQuotaPort } from '@social-monitor/summary/ports';
import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { AutoSummarySchedulerLoop } from '../apps/intelligence-worker/src/auto-summary-scheduler-loop';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `auto-summary-scheduler-smoke-${this.nextId}`;
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
        resetAt: '2026-06-21T12:00:00.000Z',
      },
    };
  }
}

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const tenant = tenantId('tenant-auto-summary-scheduler-smoke');
  const workspace = workspaceId('workspace-auto-summary-scheduler-smoke');
  const interestId = 'topic-auto-summary-scheduler-smoke';
  const jobs = new InMemorySummaryJobRepository();
  const policies = new InMemorySummaryPolicyRepository();
  const feedItems = new InMemoryFeedItemReadRepository();
  const queue = new InMemoryQueuePublisher();
  const scheduleAutoSummaries = new ScheduleAutoSummariesUseCase(
    new InMemoryAutoSummaryCandidateRepository(policies, jobs, feedItems),
    new RequestSummaryUseCase(
      jobs,
      new InMemorySummaryJobQueueAdapter(queue, new InMemoryMetricsRecorder()),
      new AllowAllSummaryQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-21T11:10:00.000Z')),
    ),
  );

  await policies.save(SummaryPolicy.defaultForInterest({
    id: 'policy-auto-summary-scheduler-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    now: new Date('2026-06-21T11:00:00.000Z'),
  }));
  feedItems.upsert(FeedItem.publish({
    id: 'feed-auto-summary-scheduler-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    sourceItemId: 'source-auto-summary-scheduler-smoke',
    sourceBindingId: 'source-binding-auto-summary-scheduler-smoke',
    providerKey: 'rss',
    canonicalUrl: 'https://example.test/auto-summary-scheduler-smoke',
    title: 'Automatic summary scheduler smoke',
    bodyPreview: 'The scheduler should request a summary after new feed evidence appears.',
    publishedAt: new Date('2026-06-21T11:05:00.000Z'),
    observedAt: new Date('2026-06-21T11:05:00.000Z'),
  }));

  const loop = new AutoSummarySchedulerLoop(scheduleAutoSummaries, {
    enabled: true,
    intervalMs: 60_000,
    minFeedAgeMs: 60_000,
    limit: 10,
    runOnStart: true,
    tenantId: tenant,
    workspaceId: workspace,
  });

  await loop.onModuleInit();
  await loop.onApplicationShutdown('auto-summary-scheduler-smoke-complete');

  const queued = queue.all();
  assert(queued.length === 1, `expected one queued auto-summary job, got ${queued.length}`);
  assert(queued[0]?.commandType === 'summary.job.execute', 'auto-summary scheduler must enqueue summary.job.execute');

  const remainingDue = await scheduleAutoSummaries.execute({
    tenantId: tenant,
    workspaceId: workspace,
    limit: 10,
    correlationId: 'auto-summary-scheduler-smoke-repeat',
    latestFeedItemObservedBefore: new Date('2026-06-21T11:09:00.000Z'),
  });
  assert(remainingDue.ok, 'repeat auto-summary schedule must succeed');
  assert(remainingDue.value.evaluated === 0, `repeat auto-summary schedule must have no due candidates, got ${remainingDue.value.evaluated}`);
  assert(queue.all().length === 1, 'repeat auto-summary schedule must not enqueue duplicates');

  console.log('Auto-summary scheduler loop smoke OK');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
