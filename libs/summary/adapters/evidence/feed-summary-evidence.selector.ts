import type { FeedItemReadRepositoryPort } from '@social-monitor/feed/ports';
import type { Clock } from '@social-monitor/shared-kernel';

import type { SummaryEvidenceItem, SummaryEvidenceSelection, SummaryEvidenceSelectorPort } from '../../ports';

const MAX_EVIDENCE_ITEMS = 50;

export class FeedSummaryEvidenceSelector implements SummaryEvidenceSelectorPort {
  constructor(
    private readonly feedItems: FeedItemReadRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async select(
    params: Parameters<SummaryEvidenceSelectorPort['select']>[0],
  ): Promise<SummaryEvidenceSelection> {
    const result = await this.feedItems.list({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      topicId: params.topicId,
      limit: normalizeLimit(params.maxItems),
    });
    const items = result.items.map((item): SummaryEvidenceItem => {
      const snapshot = item.toSnapshot();

      return {
        feedItemId: snapshot.id,
        sourceItemId: snapshot.sourceItemId,
        sourceBindingId: snapshot.sourceBindingId,
        providerKey: snapshot.providerKey,
        title: snapshot.title,
        bodyPreview: snapshot.bodyPreview,
        canonicalUrl: snapshot.canonicalUrl,
        observedAt: snapshot.observedAt,
      };
    });

    return {
      sourceWindow: buildSourceWindow(params, items, this.clock),
      items,
    };
  }
}

const normalizeLimit = (value: number): number => {
  if (!Number.isInteger(value) || value < 1) {
    return 1;
  }

  return Math.min(value, MAX_EVIDENCE_ITEMS);
};

const buildSourceWindow = (
  params: Parameters<SummaryEvidenceSelectorPort['select']>[0],
  items: readonly SummaryEvidenceItem[],
  clock: Clock,
) => {
  if (items.length === 0) {
    const endedAt = clock.now();
    const startedAt = new Date(endedAt.getTime() - 1);

    return {
      windowId: `${params.tenantId}:${params.workspaceId}:${params.topicId}:empty`,
      startedAt,
      endedAt,
      selectedFeedItemIds: [],
    };
  }

  const observedTimes = items.map((item) => item.observedAt.getTime());
  const minObservedAt = Math.min(...observedTimes);
  const maxObservedAt = Math.max(...observedTimes);
  const startedAt = new Date(minObservedAt);
  const endedAt = new Date(maxObservedAt > minObservedAt ? maxObservedAt : maxObservedAt + 1);

  return {
    windowId: `${params.tenantId}:${params.workspaceId}:${params.topicId}:${startedAt.toISOString()}:${endedAt.toISOString()}`,
    startedAt,
    endedAt,
    selectedFeedItemIds: items.map((item) => item.feedItemId),
  };
};
