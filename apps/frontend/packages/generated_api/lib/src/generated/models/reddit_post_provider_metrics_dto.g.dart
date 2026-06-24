// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reddit_post_provider_metrics_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RedditPostProviderMetricsDto _$RedditPostProviderMetricsDtoFromJson(
  Map<String, dynamic> json,
) => RedditPostProviderMetricsDto(
  comments: json['comments'] as num,
  contentType: RedditPostProviderMetricsDtoContentTypeContentType.fromJson(
    json['contentType'] as String,
  ),
  kind: RedditPostProviderMetricsDtoKindKind.fromJson(json['kind'] as String),
  providerKey: RedditPostProviderMetricsDtoProviderKeyProviderKey.fromJson(
    json['providerKey'] as String,
  ),
  score: json['score'] as num,
  sourceKey: json['sourceKey'] as String,
  upvoteRatio: json['upvoteRatio'] as num?,
);

Map<String, dynamic> _$RedditPostProviderMetricsDtoToJson(
  RedditPostProviderMetricsDto instance,
) => <String, dynamic>{
  'comments': instance.comments,
  'contentType': instance.contentType,
  'kind': instance.kind,
  'providerKey': instance.providerKey,
  'score': instance.score,
  'sourceKey': instance.sourceKey,
  'upvoteRatio': instance.upvoteRatio,
};
