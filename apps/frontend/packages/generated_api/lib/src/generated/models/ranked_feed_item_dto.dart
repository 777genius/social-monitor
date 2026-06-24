// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_content_safety_dto.dart';

part 'ranked_feed_item_dto.g.dart';

@JsonSerializable()
class RankedFeedItemDto {
  const RankedFeedItemDto({
    required this.canonicalUrl,
    required this.clusterId,
    required this.clusterSize,
    required this.duplicateFeedItemIds,
    required this.feedItemId,
    required this.observedAt,
    required this.providerKey,
    required this.publishedAt,
    required this.rank,
    required this.safety,
    required this.score,
    required this.sourceBindingId,
    required this.sourceItemId,
    required this.title,
    required this.topicId,
    required this.whyImportant,
    this.authorHandle,
    this.bodyPreview,
    this.providerMetadata,
  });

  factory RankedFeedItemDto.fromJson(Map<String, Object?> json) =>
      _$RankedFeedItemDtoFromJson(json);

  final String? authorHandle;
  final String? bodyPreview;
  final String canonicalUrl;
  final String clusterId;
  final num clusterSize;
  final List<String> duplicateFeedItemIds;
  final String feedItemId;
  final DateTime observedAt;
  final String providerKey;
  final dynamic providerMetadata;
  final DateTime publishedAt;
  final num rank;
  final SourceContentSafetyDto safety;
  final num score;
  final String sourceBindingId;
  final String sourceItemId;
  final String title;
  final String topicId;
  final List<String> whyImportant;

  Map<String, Object?> toJson() => _$RankedFeedItemDtoToJson(this);
}
