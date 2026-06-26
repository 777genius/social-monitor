import type {
  FeedNormalizedSignal,
  FeedProviderMetrics,
} from '../../domain';
import type { JsonObject } from '@social-monitor/shared-kernel';

export type FeedItemListEntry = {
  readonly id: string;
  readonly topicId: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly providerKey: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly bodyPreview: string;
  readonly authorHandle?: string;
  readonly publishedAt: string;
  readonly observedAt: string;
  readonly providerMetadata?: JsonObject;
  readonly providerMetrics?: FeedProviderMetrics;
  readonly normalizedSignal?: FeedNormalizedSignal;
};

export type ListFeedItemsUseCaseResult = {
  readonly items: readonly FeedItemListEntry[];
  readonly nextCursor?: string;
  readonly sourceBreakdown: FeedSourceBreakdown;
};

export type FeedSourceBreakdown = {
  readonly totalItems: number;
  readonly providerCount: number;
  readonly sourceCount: number;
  readonly sources: readonly FeedSourceBreakdownEntry[];
};

export type FeedSourceBreakdownEntry = {
  readonly providerKey: string;
  readonly sourceKey: string;
  readonly contentType: string;
  readonly sourceBindingIds: readonly string[];
  readonly itemCount: number;
  readonly latestObservedAt?: string;
  readonly latestPublishedAt?: string;
  readonly maxSignalScore?: number;
  readonly maxSignalBand?: FeedNormalizedSignal['band'];
  readonly sampleItemIds: readonly string[];
};
