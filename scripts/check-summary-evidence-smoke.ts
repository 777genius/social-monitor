import { FeedItem } from '@social-monitor/feed/domain';
import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { FeedSummaryEvidenceSelector } from '../libs/summary/adapters/evidence/feed-summary-evidence.selector';
import { DeterministicSummaryModelAdapter } from '../libs/summary/adapters/model/deterministic-summary-model.adapter';
import { InMemorySummaryEventPublisher } from '../libs/summary/adapters/messaging/in-memory-summary-event-publisher';
import { InMemorySummaryArtifactRepository } from '../libs/summary/adapters/persistence/in-memory-summary-artifact.repository';
import { InMemorySummaryJobRepository } from '../libs/summary/adapters/persistence/in-memory-summary-job.repository';
import { SummaryJob } from '../libs/summary/domain';
import { ExecuteSummaryJobUseCase } from '../libs/summary/features/execute-summary-job/execute-summary-job.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `summary-smoke-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

const run = async (): Promise<void> => {
  const tenant = tenantId('tenant-summary-smoke');
  const workspace = workspaceId('workspace-summary-smoke');
  const topicId = 'topic-summary-smoke';
  const feedItems = new InMemoryFeedItemReadRepository();
  feedItems.upsert(FeedItem.publish({
    id: 'feed:summary-smoke:1',
    tenantId: tenant,
    workspaceId: workspace,
    sourceItemId: 'rss-binding-smoke:rss-guid-1',
    sourceBindingId: 'rss-binding-smoke',
    canonicalUrl: 'https://example.test/rss/item-1',
    title: 'RSS summary smoke signal',
    bodyPreview: 'A compact body preview that should be available to summary evidence.',
    publishedAt: new Date('2026-06-06T10:00:00.000Z'),
    observedAt: new Date('2026-06-06T10:01:00.000Z'),
  }));

  const summaryJobs = new InMemorySummaryJobRepository();
  await summaryJobs.save(SummaryJob.request({
    id: 'summary-job-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    topicId,
    idempotencyKey: 'summary-smoke-request',
    requestedAt: new Date('2026-06-06T10:02:00.000Z'),
  }));

  const artifacts = new InMemorySummaryArtifactRepository();
  const events = new InMemorySummaryEventPublisher();
  const useCase = new ExecuteSummaryJobUseCase(
    summaryJobs,
    artifacts,
    new FeedSummaryEvidenceSelector(feedItems),
    new DeterministicSummaryModelAdapter(),
    events,
    new SequenceIdGenerator(),
    new FixedClock(new Date('2026-06-06T10:03:00.000Z')),
  );
  const result = await useCase.execute({
    tenantId: tenant,
    workspaceId: workspace,
    summaryJobId: 'summary-job-smoke',
  });

  if (!result.ok || result.value.summaryId === undefined || result.value.status !== 'completed') {
    throw new Error(`Expected completed cited summary, got ${JSON.stringify(result)}`);
  }

  const artifact = await artifacts.findById({
    tenantId: tenant,
    workspaceId: workspace,
    summaryId: result.value.summaryId,
  });
  const snapshot = artifact?.toSnapshot();
  const firstKeyPoint = snapshot?.keyPoints[0];
  const firstCitation = snapshot?.citationMap[0];

  if (snapshot === undefined || firstKeyPoint === undefined || firstCitation === undefined) {
    throw new Error('Expected summary artifact with key point and citation');
  }

  if (snapshot.qualityFlags.includes('no_signal')) {
    throw new Error('Expected evidence-backed summary without no_signal flag');
  }

  if (firstKeyPoint.claim !== 'RSS summary smoke signal' || firstKeyPoint.citationIds[0] !== 'c1') {
    throw new Error(`Unexpected key point: ${JSON.stringify(firstKeyPoint)}`);
  }

  if (
    firstCitation.feedItemId !== 'feed:summary-smoke:1' ||
    firstCitation.sourceItemId !== 'rss-binding-smoke:rss-guid-1'
  ) {
    throw new Error(`Unexpected citation: ${JSON.stringify(firstCitation)}`);
  }

  if (events.all().length !== 1) {
    throw new Error(`Expected one summary.ready event, got ${events.all().length}`);
  }

  console.log('Summary evidence smoke OK');
};

void run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
