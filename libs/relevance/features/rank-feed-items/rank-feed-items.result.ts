import type { JsonObject } from '@social-monitor/shared-kernel';

import type {
  SourceContentQualityView,
  SourceContentSafetyView,
  UserRelevanceProfileView,
} from '../shared/relevance-presenter';
import type { RelevanceMemoryGuidanceStatus } from '../../ports';

export type RelevanceMemoryGuidanceView = {
  readonly status: RelevanceMemoryGuidanceStatus;
  readonly applied: boolean;
  readonly providerPreferenceCount: number;
  readonly keywordPreferenceCount: number;
  readonly mutedKeywordCount: number;
  readonly blockedProviderCount: number;
  readonly signals: readonly string[];
};

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
  readonly contentQuality: SourceContentQualityView;
};

export type RankFeedItemsResult = {
  readonly generatedAt: string;
  readonly profileApplied: boolean;
  readonly profile?: UserRelevanceProfileView;
  readonly memoryGuidance?: RelevanceMemoryGuidanceView;
  readonly items: readonly RankedFeedItemView[];
};
