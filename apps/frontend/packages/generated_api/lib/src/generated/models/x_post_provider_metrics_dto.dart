// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'feed_item_dto_provider_metrics_provider_metrics.dart';
import 'get_feed_item_response_dto_provider_metrics_provider_metrics.dart';
import 'x_post_provider_metrics_dto_content_type_content_type.dart';
import 'x_post_provider_metrics_dto_kind_kind.dart';
import 'x_post_provider_metrics_dto_provider_key_provider_key.dart';

part 'x_post_provider_metrics_dto.g.dart';

@JsonSerializable()
class XPostProviderMetricsDto {
  const XPostProviderMetricsDto({
    required this.bookmarks,
    required this.contentType,
    required this.impressions,
    required this.kind,
    required this.likes,
    required this.providerKey,
    required this.quotes,
    required this.replies,
    required this.reposts,
    required this.sourceKey,
  });

  factory XPostProviderMetricsDto.fromJson(Map<String, Object?> json) =>
      _$XPostProviderMetricsDtoFromJson(json);

  final num bookmarks;
  final XPostProviderMetricsDtoContentTypeContentType contentType;
  final num impressions;
  final XPostProviderMetricsDtoKindKind kind;
  final num likes;
  final XPostProviderMetricsDtoProviderKeyProviderKey providerKey;
  final num quotes;
  final num replies;
  final num reposts;
  final String sourceKey;

  Map<String, Object?> toJson() => _$XPostProviderMetricsDtoToJson(this);
}
