// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reddit_comment_provider_metrics_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RedditCommentProviderMetricsDto _$RedditCommentProviderMetricsDtoFromJson(
  Map<String, dynamic> json,
) => RedditCommentProviderMetricsDto(
  contentType: RedditCommentProviderMetricsDtoContentTypeContentType.fromJson(
    json['contentType'] as String,
  ),
  depth: json['depth'] as num,
  kind: RedditCommentProviderMetricsDtoKindKind.fromJson(
    json['kind'] as String,
  ),
  providerKey: RedditCommentProviderMetricsDtoProviderKeyProviderKey.fromJson(
    json['providerKey'] as String,
  ),
  replies: json['replies'] as num,
  role: RedditCommentProviderMetricsDtoRoleRole.fromJson(
    json['role'] as String,
  ),
  score: json['score'] as num,
  scoreConfidence:
      RedditCommentProviderMetricsDtoScoreConfidenceScoreConfidence.fromJson(
        json['scoreConfidence'] as String,
      ),
  sourceKey: json['sourceKey'] as String,
);

Map<String, dynamic> _$RedditCommentProviderMetricsDtoToJson(
  RedditCommentProviderMetricsDto instance,
) => <String, dynamic>{
  'contentType': instance.contentType,
  'depth': instance.depth,
  'kind': instance.kind,
  'providerKey': instance.providerKey,
  'replies': instance.replies,
  'role': instance.role,
  'score': instance.score,
  'scoreConfidence': instance.scoreConfidence,
  'sourceKey': instance.sourceKey,
};
