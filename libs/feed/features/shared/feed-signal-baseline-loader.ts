import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import {
  feedSignalBaselineSampleFromItem,
  type FeedItem,
  type FeedSignalBaselineSample,
} from '../../domain';
import type {
  FeedSignalBaselineCohortFilter,
  FeedSignalBaselineRepositoryPort,
} from '../../ports';

const MAX_HISTORICAL_BASELINE_ITEMS = 2000;
const HISTORICAL_BASELINE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export const loadFeedSignalBaselineSamples = async (params: {
  readonly signalBaseline: FeedSignalBaselineRepositoryPort;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId?: string;
  readonly items: readonly FeedItem[];
  readonly now: Date;
}): Promise<readonly FeedSignalBaselineSample[]> => {
  if (params.items.length === 0) {
    return [];
  }

  const observedAfter = new Date(params.now.getTime() - HISTORICAL_BASELINE_WINDOW_MS);
  const itemsByInterestId = groupItemsByInterestId(params.items);
  const interestIds = params.interestId === undefined
    ? [...itemsByInterestId.keys()]
    : [params.interestId];

  if (interestIds.length === 0) {
    return [];
  }

  const samples: FeedSignalBaselineSample[] = [];

  for (const interestId of interestIds) {
    const items = itemsByInterestId.get(interestId) ?? [];

    if (items.length === 0) {
      continue;
    }

    samples.push(...await loadSamplesForTopic({
      ...params,
      interestId,
      items,
      observedAfter,
    }));
  }

  return dedupeBaselineSamples(samples);
};

const loadSamplesForTopic = async (params: {
  readonly signalBaseline: FeedSignalBaselineRepositoryPort;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
  readonly items: readonly FeedItem[];
  readonly observedAfter: Date;
}): Promise<readonly FeedSignalBaselineSample[]> => {
  const topicSamples = await params.signalBaseline.listSamples({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    interestId: params.interestId,
    observedAfter: params.observedAfter,
    limit: MAX_HISTORICAL_BASELINE_ITEMS,
  });
  const cohortFilters = exactCohortFiltersForItems(params.items);

  if (cohortFilters.length === 0) {
    return topicSamples;
  }

  const exactCohortSamples = await params.signalBaseline.listSamples({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    interestId: params.interestId,
    observedAfter: params.observedAfter,
    limit: MAX_HISTORICAL_BASELINE_ITEMS,
    cohortFilters,
  });

  return dedupeBaselineSamples([
    ...topicSamples,
    ...exactCohortSamples,
  ]);
};

const groupItemsByInterestId = (items: readonly FeedItem[]): ReadonlyMap<string, readonly FeedItem[]> => {
  const itemsByInterestId = new Map<string, FeedItem[]>();

  for (const item of items) {
    const interestId = item.toSnapshot().interestId;
    const topicItems = itemsByInterestId.get(interestId) ?? [];

    topicItems.push(item);
    itemsByInterestId.set(interestId, topicItems);
  }

  return itemsByInterestId;
};

const exactCohortFiltersForItems = (
  items: readonly FeedItem[],
): readonly FeedSignalBaselineCohortFilter[] => {
  const byKey = new Map<string, FeedSignalBaselineCohortFilter>();

  for (const item of items) {
    const sample = feedSignalBaselineSampleFromItem(item);

    if (sample === undefined) {
      continue;
    }

    const filter = {
      providerKey: sample.providerKey,
      sourceKey: sample.sourceKey,
      contentType: sample.contentType,
    };

    byKey.set(cohortFilterKey([
      filter.providerKey,
      filter.sourceKey,
      filter.contentType,
    ]), filter);
  }

  return [...byKey.values()];
};

const cohortFilterKey = (parts: readonly string[]): string => JSON.stringify(parts);

const dedupeBaselineSamples = (
  samples: readonly FeedSignalBaselineSample[],
): readonly FeedSignalBaselineSample[] => {
  const byFeedItemId = new Map<string, FeedSignalBaselineSample>();

  for (const sample of samples) {
    byFeedItemId.set(sample.feedItemId, sample);
  }

  return [...byFeedItemId.values()];
};
