import type { FeedItem, FeedSignalView } from '../../domain';
import type { FeedItemListEntry } from '../list-feed-items/list-feed-items.result';

export const presentFeedItem = (
  item: FeedItem,
  signal: FeedSignalView | undefined,
): FeedItemListEntry => {
  const snapshot = item.toSnapshot();

  return {
    id: snapshot.id,
    topicId: snapshot.topicId,
    sourceItemId: snapshot.sourceItemId,
    sourceBindingId: snapshot.sourceBindingId,
    providerKey: snapshot.providerKey,
    canonicalUrl: snapshot.canonicalUrl,
    title: snapshot.title,
    bodyPreview: snapshot.bodyPreview,
    authorHandle: snapshot.authorHandle,
    publishedAt: snapshot.publishedAt.toISOString(),
    observedAt: snapshot.observedAt.toISOString(),
    providerMetadata: snapshot.providerMetadata,
    providerMetrics: signal?.providerMetrics,
    normalizedSignal: signal?.normalizedSignal,
  };
};
