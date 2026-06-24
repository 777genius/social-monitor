// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'git_hub_repository_provider_metrics_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GitHubRepositoryProviderMetricsDto _$GitHubRepositoryProviderMetricsDtoFromJson(
  Map<String, dynamic> json,
) => GitHubRepositoryProviderMetricsDto(
  contentType:
      GitHubRepositoryProviderMetricsDtoContentTypeContentType.fromJson(
        json['contentType'] as String,
      ),
  forks: json['forks'] as num,
  kind: GitHubRepositoryProviderMetricsDtoKindKind.fromJson(
    json['kind'] as String,
  ),
  providerKey:
      GitHubRepositoryProviderMetricsDtoProviderKeyProviderKey.fromJson(
        json['providerKey'] as String,
      ),
  sourceKey: json['sourceKey'] as String,
  stars: json['stars'] as num,
  trendDeltas: (json['trendDeltas'] as List<dynamic>)
      .map((e) => FeedMetricDeltaDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  trendingDelta: FeedMetricDeltaDto.fromJson(
    json['trendingDelta'] as Map<String, dynamic>,
  ),
);

Map<String, dynamic> _$GitHubRepositoryProviderMetricsDtoToJson(
  GitHubRepositoryProviderMetricsDto instance,
) => <String, dynamic>{
  'contentType': instance.contentType,
  'forks': instance.forks,
  'kind': instance.kind,
  'providerKey': instance.providerKey,
  'sourceKey': instance.sourceKey,
  'stars': instance.stars,
  'trendDeltas': instance.trendDeltas,
  'trendingDelta': instance.trendingDelta,
};
