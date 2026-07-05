// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'feed_item_dto_provider_metrics_provider_metrics.dart';
import 'get_feed_item_response_dto_provider_metrics_provider_metrics.dart';
import 'hacker_news_comment_provider_metrics_dto_content_type_content_type.dart';
import 'hacker_news_comment_provider_metrics_dto_kind_kind.dart';
import 'hacker_news_comment_provider_metrics_dto_provider_key_provider_key.dart';
import 'hacker_news_comment_provider_metrics_dto_role_role.dart';
import 'hacker_news_comment_provider_metrics_dto_score_confidence_score_confidence.dart';

part 'hacker_news_comment_provider_metrics_dto.g.dart';

@JsonSerializable()
class HackerNewsCommentProviderMetricsDto {
  const HackerNewsCommentProviderMetricsDto({
    required this.contentType,
    required this.depth,
    required this.kind,
    required this.providerKey,
    required this.replies,
    required this.role,
    required this.score,
    required this.scoreConfidence,
    required this.sourceKey,
    this.rank,
  });

  factory HackerNewsCommentProviderMetricsDto.fromJson(
    Map<String, Object?> json,
  ) => _$HackerNewsCommentProviderMetricsDtoFromJson(json);

  final HackerNewsCommentProviderMetricsDtoContentTypeContentType contentType;
  final num depth;
  final HackerNewsCommentProviderMetricsDtoKindKind kind;
  final HackerNewsCommentProviderMetricsDtoProviderKeyProviderKey providerKey;
  final num? rank;
  final num replies;
  final HackerNewsCommentProviderMetricsDtoRoleRole role;
  final num score;
  final HackerNewsCommentProviderMetricsDtoScoreConfidenceScoreConfidence
  scoreConfidence;
  final String sourceKey;

  Map<String, Object?> toJson() =>
      _$HackerNewsCommentProviderMetricsDtoToJson(this);
}
