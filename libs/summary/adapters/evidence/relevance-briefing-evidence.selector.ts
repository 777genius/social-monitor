import type { FeedItemReadRepositoryPort } from '@social-monitor/feed/ports';
import type { RankFeedItemsUseCase } from '@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case';
import type { RankedFeedItemView } from '@social-monitor/relevance/features/rank-feed-items/rank-feed-items.result';
import type { Clock } from '@social-monitor/shared-kernel';

import { StoryClusteringService, type BriefingEvidenceItem } from '../../domain';
import type { BriefingEvidenceSelectorPort } from '../../ports';

export class RelevanceBriefingEvidenceSelector implements BriefingEvidenceSelectorPort {
  private readonly clusterer: StoryClusteringService;

  constructor(
    private readonly rankFeedItems: RankFeedItemsUseCase,
    private readonly feedItems: FeedItemReadRepositoryPort,
    clock: Clock,
  ) {
    this.clusterer = new StoryClusteringService(clock);
  }

  async select(
    params: Parameters<BriefingEvidenceSelectorPort['select']>[0],
  ) {
    const ranked = await this.rankFeedItems.execute({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      topicId: params.scope.type === 'topic' ? params.scope.topicId : undefined,
      userId: params.userId,
      limit: params.maxItems,
    });

    if (!ranked.ok) {
      throw ranked.error;
    }

    const items = await this.expandRankedItems(params, ranked.value.items);

    return this.clusterer.cluster({
      identity: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        scope: params.scope,
      },
      items,
      limit: params.maxItems,
    });
  }

  private async expandRankedItems(
    params: Parameters<BriefingEvidenceSelectorPort['select']>[0],
    rankedItems: readonly RankedFeedItemView[],
  ): Promise<readonly BriefingEvidenceItem[]> {
    const itemsById = new Map<string, BriefingEvidenceItem>();

    for (const rankedItem of rankedItems) {
      itemsById.set(rankedItem.feedItemId, mapRankedItem(rankedItem));

      for (const duplicateFeedItemId of rankedItem.duplicateFeedItemIds) {
        if (itemsById.has(duplicateFeedItemId)) {
          continue;
        }

        const duplicate = await this.feedItems.findById({
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          feedItemId: duplicateFeedItemId,
        });

        if (duplicate === null) {
          continue;
        }

        const snapshot = duplicate.toSnapshot();
        itemsById.set(duplicateFeedItemId, {
          feedItemId: snapshot.id,
          sourceItemId: snapshot.sourceItemId,
          sourceBindingId: snapshot.sourceBindingId,
          topicId: snapshot.topicId,
          providerKey: snapshot.providerKey,
          canonicalUrl: snapshot.canonicalUrl,
          title: snapshot.title,
          bodyPreview: snapshot.bodyPreview,
          authorHandle: snapshot.authorHandle,
          publishedAt: snapshot.publishedAt,
          observedAt: snapshot.observedAt,
          score: Math.max(0, rankedItem.score - 0.001),
          whyImportant: rankedItem.whyImportant,
          storyKeyHint: rankedItem.clusterId,
        });
      }
    }

    return [...itemsById.values()];
  }
}

const mapRankedItem = (item: RankedFeedItemView): BriefingEvidenceItem => ({
  feedItemId: item.feedItemId,
  sourceItemId: item.sourceItemId,
  sourceBindingId: item.sourceBindingId,
  topicId: item.topicId,
  providerKey: item.providerKey,
  canonicalUrl: item.canonicalUrl,
  title: item.title,
  bodyPreview: item.bodyPreview,
  authorHandle: item.authorHandle,
  publishedAt: new Date(item.publishedAt),
  observedAt: new Date(item.observedAt),
  score: item.score,
  whyImportant: item.whyImportant,
  storyKeyHint: item.clusterId,
});
