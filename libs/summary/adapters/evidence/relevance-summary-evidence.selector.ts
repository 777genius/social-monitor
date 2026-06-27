import type { RankFeedItemsUseCase } from '@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case';
import type { Clock } from '@social-monitor/shared-kernel';

import type { SummaryEvidenceItem, SummaryEvidenceSelection, SummaryEvidenceSelectorPort } from '../../ports';

export class RelevanceSummaryEvidenceSelector implements SummaryEvidenceSelectorPort {
  constructor(
    private readonly rankFeedItems: RankFeedItemsUseCase,
    private readonly clock: Clock,
  ) {}

  async select(
    params: Parameters<SummaryEvidenceSelectorPort['select']>[0],
  ): Promise<SummaryEvidenceSelection> {
    const evidenceWindow = rollingDailyEvidenceWindow(this.clock);
    const ranked = await this.rankFeedItems.execute({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      userId: params.userId,
      topicId: params.topicId,
      limit: params.maxItems,
      observedAfter: inclusiveObservedAfter(evidenceWindow.startedAt),
      observedBefore: inclusiveObservedBefore(evidenceWindow.endedAt),
    });

    if (!ranked.ok) {
      throw ranked.error;
    }

    const items = ranked.value.items.map((item): SummaryEvidenceItem => ({
      feedItemId: item.feedItemId,
      sourceItemId: item.sourceItemId,
      sourceBindingId: item.sourceBindingId,
      providerKey: item.providerKey,
      title: item.title,
      bodyPreview: item.bodyPreview,
      canonicalUrl: item.canonicalUrl,
      providerMetadata: item.providerMetadata,
      observedAt: new Date(item.observedAt),
      relevance: {
        score: item.score,
        rank: item.rank,
        clusterId: item.clusterId,
        clusterSize: item.clusterSize,
        duplicateFeedItemIds: item.duplicateFeedItemIds,
        whyImportant: item.whyImportant,
      },
      safety: item.safety,
    }));

    return {
      sourceWindow: buildSourceWindow(params, items, evidenceWindow),
      items,
    };
  }
}

const dailyEvidenceWindowMs = 24 * 60 * 60 * 1000;

const rollingDailyEvidenceWindow = (clock: Clock) => {
  const endedAt = clock.now();

  return {
    startedAt: new Date(endedAt.getTime() - dailyEvidenceWindowMs),
    endedAt,
  };
};

const inclusiveObservedAfter = (startedAt: Date): Date =>
  new Date(startedAt.getTime() - 1);

const inclusiveObservedBefore = (endedAt: Date): Date =>
  new Date(endedAt.getTime() + 1);

const buildSourceWindow = (
  params: Parameters<SummaryEvidenceSelectorPort['select']>[0],
  items: readonly SummaryEvidenceItem[],
  evidenceWindow: { readonly startedAt: Date; readonly endedAt: Date },
) => {
  if (items.length === 0) {
    return {
      windowId: `${params.tenantId}:${params.workspaceId}:${params.topicId}:personalized-empty`,
      startedAt: evidenceWindow.startedAt,
      endedAt: evidenceWindow.endedAt,
      selectedFeedItemIds: [],
    };
  }

  const observedTimes = items.map((item) => item.observedAt.getTime());
  const minObservedAt = Math.min(...observedTimes);
  const maxObservedAt = Math.max(...observedTimes);
  const startedAt = new Date(minObservedAt);
  const endedAt = new Date(maxObservedAt > minObservedAt ? maxObservedAt : maxObservedAt + 1);
  const userSegment = params.userId === undefined ? 'workspace' : `user:${params.userId}`;

  return {
    windowId: `${params.tenantId}:${params.workspaceId}:${params.topicId}:${userSegment}:${startedAt.toISOString()}:${endedAt.toISOString()}`,
    startedAt,
    endedAt,
    selectedFeedItemIds: items.map((item) => item.feedItemId),
  };
};
