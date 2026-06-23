import '../../domain/entities/feed_item.dart';
import '../../domain/value_objects/feed_item_id.dart';
import '../../domain/value_objects/feed_provider_metadata.dart';
import '../api/feed_item_api_dto.dart';

final class FeedItemMapper {
  const FeedItemMapper();

  FeedItem toDomain(FeedItemApiDto dto) {
    return FeedItem(
      id: FeedItemId(_nonEmpty(dto.id, fallback: 'feed-item-unknown')),
      topicId: _nonEmpty(dto.topicId, fallback: 'topic-unknown'),
      sourceItemId: _nonEmpty(
        dto.sourceItemId,
        fallback: 'source-item-unknown',
      ),
      sourceBindingId: _nonEmpty(
        dto.sourceBindingId,
        fallback: 'source-binding-unknown',
      ),
      providerKey: _nonEmpty(dto.providerKey, fallback: 'unknown'),
      canonicalUrl: _safeUrl(dto.canonicalUrl),
      title: _nonEmpty(dto.title, fallback: 'Untitled feed item'),
      bodyPreview: _safePreview(dto.bodyPreview),
      authorHandle: _nullableNonEmpty(dto.authorHandle),
      providerMetadata: feedProviderMetadataFromApi(dto.providerMetadata),
      publishedAt: dto.publishedAt,
      observedAt: dto.observedAt,
    );
  }

  String _safePreview(String raw) {
    final withoutSecrets = raw
        .replaceAll(RegExp(r'Bearer\s+[A-Za-z0-9._~+/=-]+'), '[redacted]')
        .replaceAll(RegExp(r'sk-[A-Za-z0-9_-]+'), '[redacted]');
    final singleLine = withoutSecrets.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (singleLine.isEmpty) {
      return 'No preview available';
    }
    return singleLine.length <= 240
        ? singleLine
        : '${singleLine.substring(0, 237)}...';
  }

  String _safeUrl(String value) {
    final trimmed = value.trim();
    final uri = Uri.tryParse(trimmed);
    if (uri == null ||
        !(uri.scheme == 'http' || uri.scheme == 'https') ||
        uri.host.isEmpty) {
      return 'Unavailable';
    }
    return trimmed;
  }

  String _nonEmpty(String? value, {required String fallback}) {
    return _nullableNonEmpty(value) ?? fallback;
  }

  String? _nullableNonEmpty(String? value) {
    final trimmed = value?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return null;
    }
    return trimmed;
  }
}
