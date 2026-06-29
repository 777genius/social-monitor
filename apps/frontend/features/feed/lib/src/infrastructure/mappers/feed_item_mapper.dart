import '../../domain/entities/feed_item.dart';
import '../../domain/value_objects/feed_item_id.dart';
import '../../domain/value_objects/feed_provider_metadata.dart';
import '../../domain/value_objects/feed_provider_metrics.dart';
import '../../domain/value_objects/feed_signal_snapshot.dart';
import '../api/feed_item_api_dto.dart';

final class FeedItemMapper {
  const FeedItemMapper();

  FeedItem toDomain(FeedItemApiDto dto) {
    return FeedItem(
      id: FeedItemId(_nonEmpty(dto.id, fallback: 'feed-item-unknown')),
      interestId: _nonEmpty(dto.interestId, fallback: 'topic-unknown'),
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
      providerMetrics: feedProviderMetricsFromApi(dto.providerMetrics),
      normalizedSignal: _signal(dto.normalizedSignal),
      publishedAt: dto.publishedAt,
      observedAt: dto.observedAt,
    );
  }

  FeedSignalSnapshot? _signal(FeedSignalApiDto? dto) {
    if (dto == null) {
      return null;
    }

    return FeedSignalSnapshot(
      score: _intInRange(dto.score, min: 0, max: 100),
      band: _signalBand(dto.band),
      confidence: _doubleInRange(dto.confidence, min: 0, max: 1),
      basis: _nonEmpty(dto.basis, fallback: 'unknown'),
      computedAt: dto.computedAt,
      cohort: FeedSignalCohort(
        providerKey: _nonEmpty(dto.cohort.providerKey, fallback: 'unknown'),
        sourceKey: _nonEmpty(dto.cohort.sourceKey, fallback: 'unknown'),
        contentType: _nonEmpty(dto.cohort.contentType, fallback: 'unknown'),
        ageBucket: _nonEmpty(dto.cohort.ageBucket, fallback: 'unknown'),
        baselineWindow: _baselineWindow(dto.cohort.baselineWindow),
        sampleSize: _intInRange(dto.cohort.sampleSize, min: 0, max: 1000000),
        percentile: _doubleInRange(dto.cohort.percentile, min: 0, max: 1),
        zScore: _doubleInRange(dto.cohort.zScore, min: -10, max: 10),
        fallback: _nonEmpty(dto.cohort.fallback, fallback: 'unknown'),
      ),
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

  FeedSignalBand _signalBand(String value) {
    return switch (value) {
      'no_signal' => FeedSignalBand.noSignal,
      'low' => FeedSignalBand.low,
      'normal' => FeedSignalBand.normal,
      'high' => FeedSignalBand.high,
      'breakout' => FeedSignalBand.breakout,
      _ => FeedSignalBand.unknown,
    };
  }

  String _baselineWindow(String value) {
    return switch (value.trim()) {
      '24h' || '7d' || '30d' || 'all' => value.trim(),
      _ => 'all',
    };
  }

  int _intInRange(num value, {required int min, required int max}) {
    if (!value.isFinite) {
      return min;
    }
    return value.round().clamp(min, max).toInt();
  }

  double _doubleInRange(num value, {required double min, required double max}) {
    if (!value.isFinite) {
      return min;
    }
    return value.toDouble().clamp(min, max).toDouble();
  }
}
