// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'feed_item_dto_provider_metrics_provider_metrics.dart';
import 'get_feed_item_response_dto_provider_metrics_provider_metrics.dart';
import 'hacker_news_story_provider_metrics_dto_content_type_content_type.dart';
import 'hacker_news_story_provider_metrics_dto_kind_kind.dart';
import 'hacker_news_story_provider_metrics_dto_provider_key_provider_key.dart';

part 'hacker_news_story_provider_metrics_dto.g.dart';

@JsonSerializable()
class HackerNewsStoryProviderMetricsDto {
  const HackerNewsStoryProviderMetricsDto({
    required this.comments,
    required this.contentType,
    required this.kind,
    required this.points,
    required this.providerKey,
    required this.sourceKey,
  });

  factory HackerNewsStoryProviderMetricsDto.fromJson(
    Map<String, Object?> json,
  ) => _$HackerNewsStoryProviderMetricsDtoFromJson(json);

  final num comments;
  final HackerNewsStoryProviderMetricsDtoContentTypeContentType contentType;
  final HackerNewsStoryProviderMetricsDtoKindKind kind;
  final num points;
  final HackerNewsStoryProviderMetricsDtoProviderKeyProviderKey providerKey;
  final String sourceKey;

  Map<String, Object?> toJson() =>
      _$HackerNewsStoryProviderMetricsDtoToJson(this);
}
