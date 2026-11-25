import type {
  FeedNormalizedSignal,
  FeedProviderMetrics,
} from '../../domain';
import type { JsonObject } from '@social-monitor/shared-kernel';

export type GetFeedItemResult = {
  readonly id: string;
  readonly interestId: string;
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
