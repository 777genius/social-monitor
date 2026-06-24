// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'feed_item_dto_provider_metrics_provider_metrics.dart';
import 'get_feed_item_response_dto_provider_metrics_provider_metrics.dart';
import 'reddit_post_provider_metrics_dto_content_type_content_type.dart';
import 'reddit_post_provider_metrics_dto_kind_kind.dart';
import 'reddit_post_provider_metrics_dto_provider_key_provider_key.dart';

part 'reddit_post_provider_metrics_dto.g.dart';

@JsonSerializable()
class RedditPostProviderMetricsDto {
  const RedditPostProviderMetricsDto({
    required this.comments,
    required this.contentType,
    required this.kind,
    required this.providerKey,
    required this.score,
    required this.sourceKey,
    this.upvoteRatio,
  });

  factory RedditPostProviderMetricsDto.fromJson(Map<String, Object?> json) =>
      _$RedditPostProviderMetricsDtoFromJson(json);

  final num comments;
  final RedditPostProviderMetricsDtoContentTypeContentType contentType;
  final RedditPostProviderMetricsDtoKindKind kind;
  final RedditPostProviderMetricsDtoProviderKeyProviderKey providerKey;
  final num score;
  final String sourceKey;
  final num? upvoteRatio;

  Map<String, Object?> toJson() => _$RedditPostProviderMetricsDtoToJson(this);
}
