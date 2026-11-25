import type {
  FetchedConversationUnit,
  FetchedSourceItem,
} from '@social-monitor/ingestion/ports';

import type {
  SocialItemMetrics,
  SocialSearchItem,
} from '../../domain/entities/social-search-item';
import type { SocialThreadUnit } from '../../application/contracts/social-research-gateway';

export const socialItemFromFetchedSourceItem = (
  item: FetchedSourceItem,
  params: {
    readonly sourceKey: string;
    readonly evidence?: readonly string[];
  },
): SocialSearchItem => ({
  itemId: item.externalId,
  sourceKey: params.sourceKey,
  canonicalUrl: item.canonicalUrl,
  title: item.title,
  body: item.body,
  authorHandle: item.authorHandle,
  publishedAt: item.publishedAt,
  metrics: metricsFromMetadata(item.metadata),
  evidence: params.evidence,
});

export const socialThreadUnitsFromConversationUnits = (
  units: readonly FetchedConversationUnit[] | undefined,
  maxDepth?: number,
): readonly SocialThreadUnit[] => {
  if (units === undefined) {
    return [];
  }

  return units
    .filter((unit) => maxDepth === undefined || unit.depth <= maxDepth)
    .map((unit) => ({
      unitId: unit.providerUnitId,
      parentUnitId: unit.parentProviderUnitId,
      authorHandle: unit.authorHandle,
      body: unit.body,
      publishedAt: unit.publishedAt,
    }));
};

const metricsFromMetadata = (
  metadata: FetchedSourceItem['metadata'],
): SocialItemMetrics | undefined => {
  if (metadata === undefined) {
    return undefined;
  }

  const metrics = {
    likes: numberField(metadata, 'likes'),
    reposts: firstNumberField(metadata, ['reposts', 'retweets']),
    replies: numberField(metadata, 'replies'),
    comments: firstNumberField(metadata, ['comments', 'commentCount']),
    quotes: numberField(metadata, 'quotes'),
    views: firstNumberField(metadata, ['views', 'impressions']),
    score: numberField(metadata, 'score'),
    stars: numberField(metadata, 'stars'),
    forks: numberField(metadata, 'forks'),
  };

  return Object.values(metrics).some((value) => value !== undefined)
    ? metrics
    : undefined;
};

const numberField = (
  metadata: FetchedSourceItem['metadata'],
  key: string,
): number | undefined => {
  const value = metadata?.[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const firstNumberField = (
  metadata: FetchedSourceItem['metadata'],
  keys: readonly string[],
): number | undefined => {
  for (const key of keys) {
    const value = numberField(metadata, key);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
};
