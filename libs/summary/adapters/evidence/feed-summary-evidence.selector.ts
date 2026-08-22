import type { FeedItem } from '@social-monitor/feed/domain';
import {
  MAX_FEED_ITEM_PAGE_LIMIT,
  type FeedItemReadRepositoryPort,
} from '@social-monitor/feed/ports';
import {
  SourceContentQualityPolicy,
  SourceContentSafetyPolicy,
} from '@social-monitor/relevance/domain';
import type { Clock } from '@social-monitor/shared-kernel';

import type { SummaryEvidenceItem, SummaryEvidenceSelection, SummaryEvidenceSelectorPort } from '../../ports';

const MAX_EVIDENCE_ITEMS = 50;
const MAX_CANDIDATE_ITEMS = 500;

export class FeedSummaryEvidenceSelector implements SummaryEvidenceSelectorPort {
  private readonly safetyPolicy = new SourceContentSafetyPolicy();
  private readonly qualityPolicy = new SourceContentQualityPolicy();

  constructor(
    private readonly feedItems: FeedItemReadRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async select(
    params: Parameters<SummaryEvidenceSelectorPort['select']>[0],
  ): Promise<SummaryEvidenceSelection> {
    const evidenceLimit = normalizeLimit(params.maxItems);
    const candidates: FeedItem[] = [];
    let cursor: string | undefined;
    while (candidates.length < MAX_CANDIDATE_ITEMS) {
      const page = await this.feedItems.list({
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        interestId: params.interestId,
        limit: Math.min(
          MAX_FEED_ITEM_PAGE_LIMIT,
          MAX_CANDIDATE_ITEMS - candidates.length,
        ),
        cursor,
      });
      candidates.push(...page.items);
      if (page.nextCursor === undefined || page.nextCursor === cursor) break;
      cursor = page.nextCursor;
    }
    const items = selectProviderBalancedEvidence(
      candidates.flatMap((item): readonly SummaryEvidenceItem[] => {
        const snapshot = item.toSnapshot();
        const safety = this.safetyPolicy.evaluate(snapshot);
        const quality = this.qualityPolicy.evaluate({
          providerKey: snapshot.providerKey,
          title: safety.sanitizedTitle,
          bodyPreview: safety.sanitizedBodyPreview,
          canonicalUrl: safety.sanitizedCanonicalUrl ?? snapshot.canonicalUrl,
          authorHandle: snapshot.authorHandle,
          providerMetadata: snapshot.providerMetadata,
        });

        if (!quality.eligibleForSummary) {
          return [];
        }

        return [{
          feedItemId: snapshot.id,
          sourceItemId: snapshot.sourceItemId,
          sourceBindingId: snapshot.sourceBindingId,
          providerKey: snapshot.providerKey,
          title: safety.sanitizedTitle,
          bodyPreview: safety.sanitizedBodyPreview,
          canonicalUrl: safety.sanitizedCanonicalUrl ?? snapshot.canonicalUrl,
          providerMetadata: snapshot.providerMetadata,
          observedAt: snapshot.observedAt,
          safety,
        }];
      }),
      evidenceLimit,
    );

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

const selectProviderBalancedEvidence = (
  items: readonly SummaryEvidenceItem[],
  limit: number,
): readonly SummaryEvidenceItem[] => {
  const selected = new Map<string, SummaryEvidenceItem>();
  const selectedProviders = new Set<string>();

  for (const item of items) {
    if (selected.size >= limit) {
      break;
    }

    if (!selectedProviders.has(item.providerKey)) {
      selected.set(item.feedItemId, item);
      selectedProviders.add(item.providerKey);
    }
  }

  for (const item of items) {
    if (selected.size >= limit) {
      break;
    }

    if (!selected.has(item.feedItemId)) {
      selected.set(item.feedItemId, item);
    }
  }

  return [...selected.values()];
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
      windowId: `${params.tenantId}:${params.workspaceId}:${params.interestId}:empty`,
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
    windowId: `${params.tenantId}:${params.workspaceId}:${params.interestId}:${startedAt.toISOString()}:${endedAt.toISOString()}`,
    startedAt,
    endedAt,
    selectedFeedItemIds: items.map((item) => item.feedItemId),
  };
};
