import { FeedItem } from '@social-monitor/feed/domain';
import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { FeedSummaryEvidenceSelector } from '../libs/summary/adapters/evidence/feed-summary-evidence.selector';
import { DeterministicSummaryModelAdapter } from '../libs/summary/adapters/model/deterministic-summary-model.adapter';
import { InMemorySummaryEventPublisher } from '../libs/summary/adapters/messaging/in-memory-summary-event-publisher';
import { NoopUserSummaryPreferenceReader } from '../libs/summary/adapters/preferences/noop-user-summary-preference.reader';
import { InMemorySummaryArtifactRepository } from '../libs/summary/adapters/persistence/in-memory-summary-artifact.repository';
import { InMemorySummaryJobRepository } from '../libs/summary/adapters/persistence/in-memory-summary-job.repository';
import { InMemorySummaryPolicyRepository } from '../libs/summary/adapters/persistence/in-memory-summary-policy.repository';
import { SummaryJob, SummaryPolicy } from '../libs/summary/domain';
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
  const interestId = 'topic-summary-smoke';
  const feedItems = new InMemoryFeedItemReadRepository();
  feedItems.upsert(FeedItem.publish({
    id: 'feed:summary-smoke:1',
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    sourceItemId: 'rss-binding-smoke:rss-guid-1',
    sourceBindingId: 'rss-binding-smoke',
    providerKey: 'rss',
    canonicalUrl: 'https://example.test/rss/item-1',
    title: 'RSS summary smoke signal',
    bodyPreview: 'A compact body preview that should be available to summary evidence.',
    publishedAt: new Date('2026-06-06T10:00:00.000Z'),
    observedAt: new Date('2026-06-06T10:01:00.000Z'),
  }));
  feedItems.upsert(FeedItem.publish({
    id: 'feed:summary-smoke:2',
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    sourceItemId: 'rss-binding-smoke:rss-guid-2',
    sourceBindingId: 'rss-binding-smoke',
    providerKey: 'rss',
    canonicalUrl: 'https://example.test/rss/item-2',
    title: 'Second RSS summary smoke signal',
    bodyPreview: 'A second body preview that should be clipped by summary policy.',
    publishedAt: new Date('2026-06-06T09:59:30.000Z'),
    observedAt: new Date('2026-06-06T10:01:30.000Z'),
  }));

  const summaryJobs = new InMemorySummaryJobRepository();
  const summaryPolicies = new InMemorySummaryPolicyRepository();
  await summaryPolicies.save(SummaryPolicy.create({
    id: 'summary-policy-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    language: 'en',
    format: 'bullet_digest',
    tone: 'concise',
    maxKeyPoints: 1,
    includeRisks: true,
    includeSourceHighlights: false,
    customInstructions: 'Prioritize operational launch signals.',
    createdAt: new Date('2026-06-06T10:01:45.000Z'),
    updatedAt: new Date('2026-06-06T10:01:45.000Z'),
  }));
  await summaryJobs.save(SummaryJob.request({
    id: 'summary-job-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    idempotencyKey: 'summary-smoke-request',
    requestedAt: new Date('2026-06-06T10:02:00.000Z'),
  }));

  const artifacts = new InMemorySummaryArtifactRepository();
  const events = new InMemorySummaryEventPublisher();
  const clock = new FixedClock(new Date('2026-06-06T10:03:00.000Z'));
  const useCase = new ExecuteSummaryJobUseCase(
    summaryJobs,
    artifacts,
    summaryPolicies,
    new NoopUserSummaryPreferenceReader(),
    new FeedSummaryEvidenceSelector(feedItems, clock),
    new DeterministicSummaryModelAdapter(),
    events,
    new SequenceIdGenerator(),
    clock,
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

  if (snapshot.keyPoints.length !== 1 || snapshot.citationMap.length !== 1) {
    throw new Error(`Expected policy-clipped summary, got ${JSON.stringify(snapshot.keyPoints)}`);
  }

  if (snapshot.sourceHighlights.length !== 0) {
    throw new Error(`Expected source highlights disabled by policy, got ${JSON.stringify(snapshot.sourceHighlights)}`);
  }

  if (snapshot.lineage.rulesVersion !== 'summary.rules.policy.v1') {
    throw new Error(`Expected policy rules version lineage, got ${snapshot.lineage.rulesVersion}`);
  }

  if (firstKeyPoint.claim !== 'RSS summary smoke signal' || firstKeyPoint.citationIds[0] !== 'c1') {
    throw new Error(`Unexpected key point: ${JSON.stringify(firstKeyPoint)}`);
  }

  if (
    firstCitation.feedItemId !== 'feed:summary-smoke:1' ||
    firstCitation.sourceItemId !== 'rss-binding-smoke:rss-guid-1' ||
    firstCitation.providerKey !== 'rss'
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
