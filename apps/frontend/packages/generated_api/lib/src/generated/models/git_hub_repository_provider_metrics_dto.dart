// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'feed_item_dto_provider_metrics_provider_metrics.dart';
import 'feed_metric_delta_dto.dart';
import 'get_feed_item_response_dto_provider_metrics_provider_metrics.dart';
import 'git_hub_repository_provider_metrics_dto_content_type_content_type.dart';
import 'git_hub_repository_provider_metrics_dto_kind_kind.dart';
import 'git_hub_repository_provider_metrics_dto_provider_key_provider_key.dart';

part 'git_hub_repository_provider_metrics_dto.g.dart';

@JsonSerializable()
class GitHubRepositoryProviderMetricsDto {
  const GitHubRepositoryProviderMetricsDto({
    required this.contentType,
    required this.forks,
    required this.kind,
    required this.providerKey,
    required this.sourceKey,
    required this.stars,
    required this.trendDeltas,
    required this.trendingDelta,
  });

  factory GitHubRepositoryProviderMetricsDto.fromJson(
    Map<String, Object?> json,
  ) => _$GitHubRepositoryProviderMetricsDtoFromJson(json);

  final GitHubRepositoryProviderMetricsDtoContentTypeContentType contentType;
  final num forks;
  final GitHubRepositoryProviderMetricsDtoKindKind kind;
  final GitHubRepositoryProviderMetricsDtoProviderKeyProviderKey providerKey;
  final String sourceKey;
  final num stars;
  final List<FeedMetricDeltaDto> trendDeltas;
  final FeedMetricDeltaDto trendingDelta;

  Map<String, Object?> toJson() =>
      _$GitHubRepositoryProviderMetricsDtoToJson(this);
}
