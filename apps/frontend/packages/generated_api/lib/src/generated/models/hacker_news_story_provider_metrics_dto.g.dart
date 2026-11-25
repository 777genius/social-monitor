// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hacker_news_story_provider_metrics_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HackerNewsStoryProviderMetricsDto _$HackerNewsStoryProviderMetricsDtoFromJson(
  Map<String, dynamic> json,
) => HackerNewsStoryProviderMetricsDto(
  comments: json['comments'] as num,
  contentType: HackerNewsStoryProviderMetricsDtoContentTypeContentType.fromJson(
    json['contentType'] as String,
  ),
  kind: HackerNewsStoryProviderMetricsDtoKindKind.fromJson(
    json['kind'] as String,
  ),
  points: json['points'] as num,
  providerKey: HackerNewsStoryProviderMetricsDtoProviderKeyProviderKey.fromJson(
    json['providerKey'] as String,
  ),
  sourceKey: json['sourceKey'] as String,
);

Map<String, dynamic> _$HackerNewsStoryProviderMetricsDtoToJson(
  HackerNewsStoryProviderMetricsDto instance,
) => <String, dynamic>{
  'comments': instance.comments,
  'contentType': instance.contentType,
  'kind': instance.kind,
  'points': instance.points,
  'providerKey': instance.providerKey,
  'sourceKey': instance.sourceKey,
};
