// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_topic_recommendation_decision_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryTopicRecommendationDecisionDto
_$ReaderSummaryTopicRecommendationDecisionDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryTopicRecommendationDecisionDto(
  decidedAt: DateTime.parse(json['decidedAt'] as String),
  decidedBy: json['decidedBy'] as String,
  recommendationId: json['recommendationId'] as String,
  status: ReaderSummaryTopicRecommendationDecisionDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
  topicLabel: json['topicLabel'] as String,
  note: json['note'] as String?,
);

Map<String, dynamic> _$ReaderSummaryTopicRecommendationDecisionDtoToJson(
  ReaderSummaryTopicRecommendationDecisionDto instance,
) => <String, dynamic>{
  'decidedAt': instance.decidedAt.toIso8601String(),
  'decidedBy': instance.decidedBy,
  'note': instance.note,
  'recommendationId': instance.recommendationId,
  'status': instance.status,
  'topicLabel': instance.topicLabel,
};
