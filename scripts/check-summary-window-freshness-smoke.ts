import { FeedItem } from '../libs/feed/domain';
import { InMemoryFeedItemReadRepository } from '../libs/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { FeedSummaryEvidenceSelector } from '../libs/summary/adapters/evidence/feed-summary-evidence.selector';
import { FeedSummaryFreshnessProbe } from '../libs/summary/adapters/evidence/feed-summary-freshness.probe';
import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

void main();

async function main(): Promise<void> {
  const tenant = tenantId('tenant-window-smoke');
  const workspace = workspaceId('workspace-window-smoke');
  const interestId = 'topic-window-smoke';
  const feedItems = new InMemoryFeedItemReadRepository();

  feedItems.upsert(makeFeedItem({
    id: 'feed-window-old',
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    observedAt: new Date('2026-06-06T00:01:00.000Z'),
  }));

  const selection = await new FeedSummaryEvidenceSelector(
    feedItems,
    new FixedClock(new Date('2026-06-06T00:05:00.000Z')),
  ).select({
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    maxItems: 10,
  });

  assertEqual(selection.sourceWindow.selectedFeedItemIds, ['feed-window-old'], 'selected feed ids');
  assertEqual(selection.sourceWindow.startedAt.toISOString(), '2026-06-06T00:01:00.000Z', 'window start');
  assertEqual(selection.sourceWindow.endedAt.toISOString(), '2026-06-06T00:01:00.001Z', 'single-item window end');

  const freshness = new FeedSummaryFreshnessProbe(
    feedItems,
    new FixedClock(new Date('2026-06-06T00:05:00.000Z')),
  );

  feedItems.upsert(makeFeedItem({
    id: 'feed-boundary',
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    observedAt: selection.sourceWindow.endedAt,
  }));

  const boundaryFreshness = await freshness.evaluate({
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    sourceWindow: selection.sourceWindow,
  });
  assertEqual(boundaryFreshness.status, 'fresh', 'boundary freshness status');

  feedItems.upsert(makeFeedItem({
    id: 'feed-window-new',
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    observedAt: new Date('2026-06-06T00:02:00.000Z'),
  }));

  const staleFreshness = await freshness.evaluate({
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    sourceWindow: selection.sourceWindow,
  });

  if (staleFreshness.status !== 'stale') {
    throw new Error(`Expected stale freshness, got ${staleFreshness.status}`);
  }

  assertEqual(staleFreshness.newestFeedItemId, 'feed-window-new', 'newest stale feed item');
  assertEqual(staleFreshness.newestObservedAt.toISOString(), '2026-06-06T00:02:00.000Z', 'newest stale observedAt');
  assertEqual(selection.sourceWindow.selectedFeedItemIds, ['feed-window-old'], 'frozen selected feed ids');

  console.log('Summary window freshness smoke OK');
}

function makeFeedItem(params: {
  readonly id: string;
  readonly tenantId: ReturnType<typeof tenantId>;
  readonly workspaceId: ReturnType<typeof workspaceId>;
  readonly interestId: string;
  readonly observedAt: Date;
}): FeedItem {
  return FeedItem.publish({
    id: params.id,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    interestId: params.interestId,
    sourceItemId: `${params.id}:source`,
    sourceBindingId: `${params.interestId}:binding`,
    providerKey: 'rss',
    canonicalUrl: `https://example.test/${params.id}`,
    title: `Title ${params.id}`,
    bodyPreview: `Body ${params.id}`,
    publishedAt: params.observedAt,
    observedAt: params.observedAt,
  });
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
