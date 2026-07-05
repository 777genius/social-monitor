// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hacker_news_comment_provider_metrics_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HackerNewsCommentProviderMetricsDto
_$HackerNewsCommentProviderMetricsDtoFromJson(
  Map<String, dynamic> json,
) => HackerNewsCommentProviderMetricsDto(
  contentType:
      HackerNewsCommentProviderMetricsDtoContentTypeContentType.fromJson(
        json['contentType'] as String,
      ),
  depth: json['depth'] as num,
  kind: HackerNewsCommentProviderMetricsDtoKindKind.fromJson(
    json['kind'] as String,
  ),
  providerKey:
      HackerNewsCommentProviderMetricsDtoProviderKeyProviderKey.fromJson(
        json['providerKey'] as String,
      ),
  replies: json['replies'] as num,
  role: HackerNewsCommentProviderMetricsDtoRoleRole.fromJson(
    json['role'] as String,
  ),
  score: json['score'] as num,
  scoreConfidence:
      HackerNewsCommentProviderMetricsDtoScoreConfidenceScoreConfidence.fromJson(
        json['scoreConfidence'] as String,
      ),
  sourceKey: json['sourceKey'] as String,
  rank: json['rank'] as num?,
);

Map<String, dynamic> _$HackerNewsCommentProviderMetricsDtoToJson(
  HackerNewsCommentProviderMetricsDto instance,
) => <String, dynamic>{
  'contentType': instance.contentType,
  'depth': instance.depth,
  'kind': instance.kind,
  'providerKey': instance.providerKey,
  'rank': instance.rank,
  'replies': instance.replies,
  'role': instance.role,
  'score': instance.score,
  'scoreConfidence': instance.scoreConfidence,
  'sourceKey': instance.sourceKey,
};
