import type { JsonObject } from '@social-monitor/shared-kernel';

import type { SourceContentSafetyView, UserRelevanceProfileView } from '../shared/relevance-presenter';

export type RankedFeedItemView = {
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly topicId: string;
  readonly providerKey: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly bodyPreview?: string;
  readonly providerMetadata?: JsonObject;
  readonly authorHandle?: string;
  readonly publishedAt: string;
  readonly observedAt: string;
  readonly score: number;
  readonly rank: number;
  readonly clusterId: string;
  readonly clusterSize: number;
  readonly duplicateFeedItemIds: readonly string[];
  readonly whyImportant: readonly string[];
  readonly safety: SourceContentSafetyView;
};

export type RankFeedItemsResult = {
  readonly generatedAt: string;
  readonly profileApplied: boolean;
  readonly profile?: UserRelevanceProfileView;
  readonly items: readonly RankedFeedItemView[];
};
