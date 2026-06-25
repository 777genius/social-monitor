// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'feed_item_dto_provider_metrics_provider_metrics.dart';
import 'get_feed_item_response_dto_provider_metrics_provider_metrics.dart';
import 'git_hub_trending_repository_provider_metrics_dto_content_type_content_type.dart';
import 'git_hub_trending_repository_provider_metrics_dto_kind_kind.dart';
import 'git_hub_trending_repository_provider_metrics_dto_provider_key_provider_key.dart';
import 'git_hub_trending_repository_provider_metrics_dto_window_window.dart';

part 'git_hub_trending_repository_provider_metrics_dto.g.dart';

@JsonSerializable()
class GitHubTrendingRepositoryProviderMetricsDto {
  const GitHubTrendingRepositoryProviderMetricsDto({
    required this.contentType,
    required this.forks,
    required this.kind,
    required this.providerKey,
    required this.rank,
    required this.sourceKey,
    required this.stars,
    required this.starsGained,
    required this.window,
  });

  factory GitHubTrendingRepositoryProviderMetricsDto.fromJson(
    Map<String, Object?> json,
  ) => _$GitHubTrendingRepositoryProviderMetricsDtoFromJson(json);

  final GitHubTrendingRepositoryProviderMetricsDtoContentTypeContentType
  contentType;
  final num forks;
  final GitHubTrendingRepositoryProviderMetricsDtoKindKind kind;
  final GitHubTrendingRepositoryProviderMetricsDtoProviderKeyProviderKey
  providerKey;
  final num rank;
  final String sourceKey;
  final num stars;
  final num starsGained;
  final GitHubTrendingRepositoryProviderMetricsDtoWindowWindow window;

  Map<String, Object?> toJson() =>
      _$GitHubTrendingRepositoryProviderMetricsDtoToJson(this);
}
