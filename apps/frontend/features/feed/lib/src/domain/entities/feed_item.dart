import '../value_objects/feed_item_id.dart';
import '../value_objects/feed_provider_metadata.dart';
import '../value_objects/feed_provider_metrics.dart';
import '../value_objects/feed_signal_snapshot.dart';

final class FeedItem {
  const FeedItem({
    required this.id,
    required this.topicId,
    required this.sourceItemId,
    required this.sourceBindingId,
    required this.providerKey,
    required this.canonicalUrl,
    required this.title,
    required this.bodyPreview,
    required this.publishedAt,
    required this.observedAt,
    this.authorHandle,
    this.providerMetadata,
    this.providerMetrics,
    this.normalizedSignal,
  });

  final FeedItemId id;
  final String topicId;
  final String sourceItemId;
  final String sourceBindingId;
  final String providerKey;
  final String canonicalUrl;
  final String title;
  final String bodyPreview;
  final String? authorHandle;
  final FeedProviderMetadata? providerMetadata;
  final FeedProviderMetrics? providerMetrics;
  final FeedSignalSnapshot? normalizedSignal;
  final DateTime publishedAt;
  final DateTime observedAt;
}
