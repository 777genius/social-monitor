// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'git_hub_trending_repository_provider_metrics_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GitHubTrendingRepositoryProviderMetricsDto
_$GitHubTrendingRepositoryProviderMetricsDtoFromJson(
  Map<String, dynamic> json,
) => GitHubTrendingRepositoryProviderMetricsDto(
  contentType:
      GitHubTrendingRepositoryProviderMetricsDtoContentTypeContentType.fromJson(
        json['contentType'] as String,
      ),
  forks: json['forks'] as num,
  kind: GitHubTrendingRepositoryProviderMetricsDtoKindKind.fromJson(
    json['kind'] as String,
  ),
  providerKey:
      GitHubTrendingRepositoryProviderMetricsDtoProviderKeyProviderKey.fromJson(
        json['providerKey'] as String,
      ),
  rank: json['rank'] as num,
  sourceKey: json['sourceKey'] as String,
  stars: json['stars'] as num,
  starsGained: json['starsGained'] as num,
  window: GitHubTrendingRepositoryProviderMetricsDtoWindowWindow.fromJson(
    json['window'] as String,
  ),
);

Map<String, dynamic> _$GitHubTrendingRepositoryProviderMetricsDtoToJson(
  GitHubTrendingRepositoryProviderMetricsDto instance,
) => <String, dynamic>{
  'contentType': instance.contentType,
  'forks': instance.forks,
  'kind': instance.kind,
  'providerKey': instance.providerKey,
  'rank': instance.rank,
  'sourceKey': instance.sourceKey,
  'stars': instance.stars,
  'starsGained': instance.starsGained,
  'window': instance.window,
};
