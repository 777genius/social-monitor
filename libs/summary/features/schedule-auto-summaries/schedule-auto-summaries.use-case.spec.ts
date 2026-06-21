import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { FeedItem } from '@social-monitor/feed/domain';
import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { InMemoryAutoSummaryCandidateRepository } from '../../adapters/persistence/in-memory-auto-summary-candidate.repository';
import { InMemorySummaryJobQueueAdapter } from '../../adapters/messaging/in-memory-summary-job-queue.adapter';
import { InMemorySummaryJobRepository } from '../../adapters/persistence/in-memory-summary-job.repository';
import { InMemorySummaryPolicyRepository } from '../../adapters/persistence/in-memory-summary-policy.repository';
import { SummaryJob, SummaryPolicy } from '../../domain';
import type { SummaryQuotaPort } from '../../ports';
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

const tenant = tenantId('tenant-auto-summary');
const workspace = workspaceId('workspace-auto-summary');
const topicId = 'topic-auto-summary';

describe('ScheduleAutoSummariesUseCase', () => {
  it('requests one summary job for a topic with new feed items and reuses the idempotency key on the next tick', async () => {
    const dependencies = makeDependencies();
    await dependencies.policies.save(SummaryPolicy.defaultForTopic({
      id: 'policy-auto-summary',
      tenantId: tenant,
      workspaceId: workspace,
      topicId,
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

  it('does not schedule when the latest topic summary request is newer than feed evidence', async () => {
    const dependencies = makeDependencies();
    await dependencies.policies.save(SummaryPolicy.defaultForTopic({
      id: 'policy-auto-summary-fresh',
      tenantId: tenant,
      workspaceId: workspace,
      topicId,
      now: new Date('2026-06-21T10:00:00.000Z'),
    }));
    dependencies.feedItems.upsert(feedItem('feed-1', new Date('2026-06-21T10:05:00.000Z')));
    await dependencies.jobs.save(SummaryJob.request({
      id: 'summary-job-fresh',
      tenantId: tenant,
      workspaceId: workspace,
      topicId,
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
  const jobs = new InMemorySummaryJobRepository();
  const policies = new InMemorySummaryPolicyRepository();
  const feedItems = new InMemoryFeedItemReadRepository();
  const queue = new InMemoryQueuePublisher();
  const queueAdapter = new InMemorySummaryJobQueueAdapter(queue, new InMemoryMetricsRecorder());
  const requestSummary = new RequestSummaryUseCase(
    jobs,
    queueAdapter,
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
      new InMemoryAutoSummaryCandidateRepository(policies, jobs, feedItems),
      requestSummary,
    ),
  };
};

const feedItem = (id: string, observedAt: Date): FeedItem =>
  FeedItem.publish({
    id,
    tenantId: tenant,
    workspaceId: workspace,
    topicId,
    sourceItemId: `source-${id}`,
    sourceBindingId: 'source-binding-auto-summary',
    providerKey: 'rss',
    canonicalUrl: `https://example.test/${id}`,
    title: `Feed item ${id}`,
    bodyPreview: 'Useful update for automatic summary scheduling.',
    publishedAt: observedAt,
    observedAt,
  });
