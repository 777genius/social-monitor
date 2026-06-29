import type { FeedItem } from '../entities/feed-item';
import {
  feedProviderMetricsFromMetadata,
  feedProviderMetricStrength,
} from './feed-provider-metrics';

export type FeedSignalBaselineSample = {
  readonly feedItemId: string;
  readonly interestId: string;
  readonly providerKey: string;
  readonly sourceKey: string;
  readonly contentType: string;
  readonly strength: number;
  readonly publishedAt: Date;
  readonly observedAt: Date;
};

export const feedSignalBaselineSampleFromItem = (
  item: FeedItem,
): FeedSignalBaselineSample | undefined => {
  const snapshot = item.toSnapshot();
  const metrics = feedProviderMetricsFromMetadata({
    providerKey: snapshot.providerKey,
    providerMetadata: snapshot.providerMetadata,
  });

  if (metrics === undefined) {
    return undefined;
  }

  return {
    feedItemId: snapshot.id,
    interestId: snapshot.interestId,
    providerKey: metrics.providerKey,
    sourceKey: metrics.sourceKey,
    contentType: metrics.contentType,
    strength: feedProviderMetricStrength(metrics),
    publishedAt: snapshot.publishedAt,
    observedAt: snapshot.observedAt,
  };
};
