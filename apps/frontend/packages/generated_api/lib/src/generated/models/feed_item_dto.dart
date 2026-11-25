// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'feed_item_dto_provider_metrics_provider_metrics.dart';
import 'feed_normalized_signal_dto.dart';

part 'feed_item_dto.g.dart';

@JsonSerializable()
class FeedItemDto {
  const FeedItemDto({
    required this.bodyPreview,
    required this.canonicalUrl,
    required this.id,
    required this.interestId,
    required this.observedAt,
    required this.providerKey,
    required this.publishedAt,
    required this.sourceBindingId,
    required this.sourceItemId,
    required this.title,
    this.authorHandle,
    this.normalizedSignal,
    this.providerMetadata,
    this.providerMetrics,
  });

  factory FeedItemDto.fromJson(Map<String, Object?> json) =>
      _$FeedItemDtoFromJson(json);

  final String? authorHandle;
  final String bodyPreview;
  final String canonicalUrl;
  final String id;
  final String interestId;
  final FeedNormalizedSignalDto? normalizedSignal;
  final DateTime observedAt;
  final String providerKey;
  final dynamic providerMetadata;
  final FeedItemDtoProviderMetricsProviderMetrics? providerMetrics;
  final DateTime publishedAt;
  final String sourceBindingId;
  final String sourceItemId;
  final String title;

  Map<String, Object?> toJson() => _$FeedItemDtoToJson(this);
}
